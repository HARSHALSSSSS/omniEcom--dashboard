import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '@oms/shared';
import { IdParamSchema, IsoDate, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { audit, created, ok, pageWindow, paged, strictRateLimit, vendorTx } from '@oms/module-kit';
import { answerQuestion } from './brain';
import { CONTEXT_SOURCES, appendTurn, conversationDto, createConversation, deleteConversation, getConversation, listConversations, listMessages, MAX_MESSAGES, messageDto, previousContext, updateConversation } from './conversations';
import { resolveTurn } from './followup';
import { aiGate } from './gate';
import { buildInsights } from './insights';
import { ACTIONS, productIntelligence } from './intelligence';
import { portfolioRange } from './portfolio';
import { createAiProvider } from './provider';
import { present } from './visual';

const TAGS = ['AI'];
const Conversation = z.object({ id: z.string(), title: z.string(), status: z.enum(['active', 'archived']), messagesCount: z.number().int(), context: z.object({ sku: z.string().optional(), source: z.enum(CONTEXT_SOURCES).optional() }).nullable().describe('Where the conversation started: the product and the screen it was opened from'), lastActive: IsoDate, createdAt: IsoDate }).meta({ id: 'AiConversation' });
const Visual = z.object({ type: z.enum(['kpi', 'table', 'warning']), title: z.string(), details: z.array(z.object({ label: z.string(), value: z.string() })) });
const SuggestedAction = z.object({ label: z.string(), actionType: z.enum(['navigate', 'apply_rule', 'draft_po', 'dismiss']), targetUrl: z.string().optional() });
const Message = z.object({
  id: z.string(), role: z.enum(['user', 'assistant']), content: z.string().describe('Markdown'), timestamp: IsoDate, intent: z.string().nullable(), confidence: z.enum(['data', 'none']).nullable(), generatedBy: z.enum(['rules', 'llm']).nullable(),
  dataVisual: Visual.nullable(), suggestedActions: z.array(SuggestedAction), sources: z.array(z.string()),
}).meta({ id: 'AiMessage' });

const Reason = z.object({ key: z.string(), text: z.string(), values: z.record(z.string(), z.union([z.number(), z.string()]).nullable()) });
const Trend = z.enum(['accelerating', 'stable', 'declining']);
const Item = z.object({
  id: z.string(), variantId: z.string(), productId: z.string(), sku: z.string(), productName: z.string(), categoryId: z.string().nullable(), category: z.string().nullable(),
  salesVelocity: z.number().describe('Units per day over the last 30 days'), unitsSold30d: z.number().int(), velocityTrend: Trend.nullable().describe('Last 14 days against the 14 before; null with fewer than 4 units'), trendChangePercent: z.number().nullable(),
  marginPercent: z.number().nullable().describe('(list price - cost price) / list price; null without a cost'), sellingPriceMinor: z.number().int().nullable(), costPriceMinor: z.number().int().nullable(),
  inventory: z.object({ available: z.number().int(), onHand: z.number().int(), runwayDays: z.number().nullable(), ageDays: z.number().int().nullable(), leadTimeDays: z.number().int(), suggestedReorderUnits: z.number().int().nullable() }),
  competitor: z.object({ priceMinor: z.number().int(), observedAt: IsoDate, sellerName: z.string().nullable(), gapPercent: z.number().nullable() }).nullable(),
  recommendedAction: z.enum(ACTIONS), confidence: z.object({ score: z.number().int(), level: z.enum(['low', 'medium', 'high']), factors: z.array(z.object({ key: z.string(), weight: z.number().int(), met: z.boolean(), text: z.string() })) }), reasons: z.array(Reason),
}).meta({ id: 'ProductIntelligenceItem' });

/** Assistant conversations, proactive insights and product intelligence (the rule-based read model behind the Product Intelligence screen). */
export const assistantRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const provider = createAiProvider({ AI_PROVIDER: c.config.AI_PROVIDER, AI_TIMEOUT_MS: c.config.AI_TIMEOUT_MS });
  const askLimit = strictRateLimit(app, 30);
  const userOf = (req: { ctx: { principal?: { actorId: string } | null } }): string => req.ctx.principal!.actorId;

  // ---------------------------------------------------------------- product intelligence
  r.get('/product-intelligence', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: ['Analytics'], summary: 'Product intelligence: one recommended action per variant, with the facts behind it',
      description: 'Rule-based, from the sales roll-up, stock, cost prices and the newest competitor price on record. `recommendedAction`: reorder (stock runs out before a restock could arrive), liquidate (excess or aging stock), raise_price (priced well below the competitor or margin under 10% while selling), promote (slow or declining sales with healthy stock and margin), hold. `confidence` only measures how much data exists. The warehouse filter limits stock to that warehouse; sales are always business-wide. `summary` counts all actions inside the other filters. Not affected by the AI switch: nothing here is generated.',
      querystring: PageQuerySchema.extend({
        'filter[action]': z.enum(ACTIONS).optional(), 'filter[categoryId]': z.uuid().optional(), 'filter[warehouseId]': z.uuid().optional(), q: z.string().trim().min(1).max(100).optional(),
        sort: z.enum(['priority', 'velocity', 'runway', 'margin']).default('priority'),
        'filter[variantId]': z.uuid().optional().describe('Exact lookup: only this variant'), 'filter[sku]': z.string().trim().min(1).max(100).optional().describe('Exact lookup (case-insensitive): only this SKU'),
        portfolio: z.enum(['true', 'false']).transform((v) => v === 'true').default(false).describe('Also return the `portfolio` block for `from`..`to`'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('First day (UTC) of the portfolio range, default 29 days before `to`'), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Last day (UTC), default today'),
      }),
      response: { 200: successEnvelope(z.object({
        items: z.array(Item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), summary: z.record(z.enum(ACTIONS), z.number().int()), variantsAnalysed: z.number().int(),
        portfolio: z.object({
          range: z.object({ from: z.string(), to: z.string() }), netSalesMinor: z.number().int().describe('Order lines after discounts, before tax and shipping'), orders: z.number().int(), averageOrderValueMinor: z.number().int(),
          grossProfitMinor: z.number().int().nullable().describe('Net sales less product cost; null until every sold line has a cost'), grossMarginBps: z.number().int().nullable(), costCoverage: z.number().describe('Share of revenue whose product cost is known (0 to 1)'),
          unitsSold: z.number().int(), prioritizedCount: z.number().int().describe('Products whose recommended action is not hold'), totalProducts: z.number().int(),
          salesShare: z.array(z.object({ variantId: z.string().nullable(), sku: z.string(), title: z.string().nullable(), category: z.string().nullable(), revenueMinor: z.number().int(), unitsSold: z.number().int(), shareBps: z.number().int(), available: z.number().int().nullable(), runwayDays: z.number().nullable() })).describe('The top products by revenue in the range'),
          otherShareBps: z.number().int().describe('Revenue share of every product outside the top list'), truncated: z.boolean(),
        }).nullable().describe('Only when `portfolio=true`'),
      })) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const rg = req.query.portfolio ? (() => { try { return portfolioRange(req.query); } catch { throw new AppError('BAD_REQUEST', 'The range must be real dates (YYYY-MM-DD), `from` not after `to`, at most 366 days'); } })() : undefined;
    const out = await vendorTx(req, (tx, vendorId) => productIntelligence(tx, vendorId, { action: req.query['filter[action]'], categoryId: req.query['filter[categoryId]'], warehouseId: req.query['filter[warehouseId]'], q: req.query.q, sort: req.query.sort, variantId: req.query['filter[variantId]'], sku: req.query['filter[sku]'], portfolio: rg }, w));
    return ok(req, { items: out.items, page: req.query.page, pageSize: req.query.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / req.query.pageSize)), summary: out.summary, variantsAnalysed: out.variantsAnalysed, portfolio: out.portfolio });
  });

  // ---------------------------------------------------------------- insights
  r.get('/ai/insights', {
    config: { access: { permission: 'ai:use' } },
    schema: {
      tags: TAGS, summary: 'Proactive insight cards', description: 'Stock-out risks, price opportunities, pending price proposals, marketplace connection problems, revenue anomalies, advertising return and open recommendations, most urgent first. Every card has a `suggestedPrompt` to put to the assistant.',
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(6) }),
      response: { 200: successEnvelope(z.array(z.object({
        id: z.string(), category: z.enum(['pricing', 'stock', 'channel', 'campaign']), severity: z.enum(['info', 'warning', 'critical']), headline: z.string(), summary: z.string(), metricImpact: z.string().nullable(),
        metric: z.object({ key: z.string(), valueMinor: z.number().int().optional(), value: z.number().optional() }).nullable(), suggestedPrompt: z.string(), source: z.string(),
      }))) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => { await aiGate(tx, vendorId); return buildInsights(tx, vendorId, req.query.limit); })));

  // ---------------------------------------------------------------- conversations
  r.post('/ai/conversations', {
    config: { access: { permission: 'ai:use' } },
    schema: { tags: TAGS, summary: 'Start a conversation', description: 'Without a title the conversation is named after its first question.', body: z.object({ title: z.string().trim().min(1).max(80).optional(), context: z.object({ sku: z.string().trim().min(1).max(100).optional(), source: z.enum(CONTEXT_SOURCES).optional() }).optional() }).default({}), response: { 201: successEnvelope(Conversation) } },
  }, async (req, reply) => {
    const row = await vendorTx(req, async (tx, vendorId) => {
      await aiGate(tx, vendorId);
      const x = await createConversation(tx, vendorId, userOf(req), req.body.title, req.body.context);
      await audit(tx, req, { action: 'ai.conversation_created', resourceType: 'ai_conversation', resourceId: x.id });
      return x;
    });
    return created(req, reply, conversationDto(row), `/api/v1/ai/conversations/${row.id}`);
  });

  r.get('/ai/conversations', {
    config: { access: { permission: 'ai:use' } },
    schema: {
      tags: TAGS, summary: 'My conversation history (newest activity first)', querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(['active', 'archived', 'all']).default('active'), 'filter[source]': z.enum([...CONTEXT_SOURCES, 'none']).optional().describe('Only conversations started from this screen (`none`: no recorded source)'), q: z.string().trim().min(1).max(100).optional() }),
      response: { 200: pagedEnvelope(Conversation) },
    },
  }, async (req) => {
    const out = await vendorTx(req, (tx, vendorId) => listConversations(tx, vendorId, userOf(req), { status: req.query['filter[status]'], q: req.query.q, source: req.query['filter[source]'] }, pageWindow(req.query)));
    return paged(req, out.items, req.query, out.total);
  });

  r.get('/ai/conversations/:id', {
    config: { access: { permission: 'ai:use' } },
    schema: { tags: TAGS, summary: 'One conversation with all its messages (oldest first)', params: IdParamSchema, response: { 200: successEnvelope(Conversation.extend({ messages: z.array(Message) })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const conv = await getConversation(tx, vendorId, userOf(req), req.params.id);
    return { ...conversationDto(conv), messages: (await listMessages(tx, vendorId, conv.id)).map(messageDto) };
  })));

  r.post('/ai/conversations/:id/messages', {
    config: { access: { permission: 'ai:use' } },
    schema: {
      tags: TAGS, summary: 'Ask in a conversation',
      description: `Runs the same engine as /ai/ask, with the previous turn as context for short follow-ups ("and last month?", "which of those?"). Returns the assistant message: Markdown \`content\`, a structured \`dataVisual\` card, \`suggestedActions\`, \`sources\` and \`confidence\` (data | none). Both messages are stored; a conversation holds at most ${MAX_MESSAGES} messages. Rate limited like /ai/ask.`,
      params: IdParamSchema, body: z.object({ text: z.string().trim().min(3).max(500) }),
      response: { 201: successEnvelope(z.object({ conversation: Conversation, userMessage: Message, assistantMessage: Message, followUp: z.enum(['period', 'detail', 'topic']).nullable() })) },
    },
  }, async (req, reply) => {
    await askLimit(req);
    const userId = userOf(req);
    const text = req.body.text;
    const prepared = await vendorTx(req, async (tx, vendorId) => {
      await aiGate(tx, vendorId);
      await getConversation(tx, vendorId, userId, req.params.id);
      const resolved = resolveTurn(text, await previousContext(tx, vendorId, req.params.id));
      return { resolved, answer: await answerQuestion(tx, vendorId, text, resolved.opts) };
    });
    const { resolved, answer } = prepared;
    let narrated = answer.answer;
    let generatedBy: 'rules' | 'llm' = 'rules';
    if (provider && answer.confidence === 'data') {
      try { narrated = await provider.narrate({ question: text, draft: answer.answer, facts: answer.data }); generatedBy = 'llm'; } catch (e) { req.log.warn({ err: (e as Error).message }, 'AI provider failed; answering from the data directly'); }
    }
    const shown = present(answer);
    const stored = await vendorTx(req, async (tx, vendorId) => {
      const x = await appendTurn(tx, vendorId, userId, req.params.id, {
        text, content: generatedBy === 'llm' ? narrated : shown.content, intent: answer.intent, confidence: answer.confidence, generatedBy, sources: answer.sources, dataVisual: shown.dataVisual, suggestedActions: shown.suggestedActions,
        context: { ...resolved.context, intent: answer.intent }, followUp: resolved.followUp,
      });
      await audit(tx, req, { action: 'ai.conversation_message', resourceType: 'ai_conversation', resourceId: req.params.id, metadata: { intent: answer.intent, followUp: resolved.followUp } });
      return x;
    });
    return created(req, reply, { conversation: conversationDto(stored.conversation), userMessage: messageDto(stored.userMessage), assistantMessage: messageDto(stored.assistantMessage), followUp: resolved.followUp });
  });

  r.patch('/ai/conversations/:id', {
    config: { access: { permission: 'ai:use' } },
    schema: { tags: TAGS, summary: 'Rename or archive a conversation', params: IdParamSchema, body: z.object({ title: z.string().trim().min(1).max(80).optional(), status: z.enum(['active', 'archived']).optional() }), response: { 200: successEnvelope(Conversation) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { before, after } = await updateConversation(tx, vendorId, userOf(req), req.params.id, req.body);
    await audit(tx, req, { action: 'ai.conversation_updated', resourceType: 'ai_conversation', resourceId: after.id, before: { title: before.title, status: before.status }, after: { title: after.title, status: after.status } });
    return conversationDto(after);
  })));

  r.delete('/ai/conversations/:id', {
    config: { access: { permission: 'ai:use' } },
    schema: { tags: TAGS, summary: 'Delete a conversation and its messages', params: IdParamSchema, response: { 200: successEnvelope(z.object({ id: z.string(), deleted: z.literal(true) })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const row = await deleteConversation(tx, vendorId, userOf(req), req.params.id);
    await audit(tx, req, { action: 'ai.conversation_deleted', resourceType: 'ai_conversation', resourceId: row.id, before: { title: row.title, messages: row.messageCount } });
    return { id: row.id, deleted: true as const };
  })));
};
