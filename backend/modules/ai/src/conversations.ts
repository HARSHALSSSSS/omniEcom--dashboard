import { and, asc, desc, eq, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { contextFromStored, type TurnContext } from './followup';
import type { DataVisual, SuggestedAction } from './visual';

/**
 * Assistant conversations: a private history per user (a colleague's conversations are not visible, even to an admin).
 * A message pair is stored together, so a conversation never holds a question without its answer.
 */
const C = schema.aiConversations;
const M = schema.aiMessages;
export const DEFAULT_TITLE = 'New conversation';
export const MAX_MESSAGES = 200;
const TITLE_MAX = 80;

export type ConversationRow = typeof C.$inferSelect;
export type MessageRow = typeof M.$inferSelect;

export const conversationDto = (c: ConversationRow) => ({
  id: c.id, title: c.title, status: c.status as 'active' | 'archived', messagesCount: c.messageCount, lastActive: (c.lastMessageAt ?? c.createdAt).toISOString(), createdAt: c.createdAt.toISOString(),
});

interface StoredData { dataVisual?: DataVisual | null; context?: TurnContext }
export const messageDto = (m: MessageRow) => {
  const d = (m.data ?? {}) as StoredData;
  return {
    id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.createdAt.toISOString(), intent: m.intent, confidence: m.confidence as 'data' | 'none' | null, generatedBy: m.generatedBy as 'rules' | 'llm' | null,
    dataVisual: d.dataVisual ?? null, suggestedActions: m.suggestedActions as unknown as SuggestedAction[], sources: (m.sources ?? []) as string[],
  };
};

export async function createConversation(tx: Tx, vendorId: string, userId: string, title?: string): Promise<ConversationRow> {
  const [row] = await tx.insert(C).values({ vendorId, userId, title: title?.trim() || DEFAULT_TITLE }).returning();
  return row!;
}

/** the caller's own conversation; someone else's is simply not found */
export async function getConversation(tx: Tx, vendorId: string, userId: string, id: string, lock = false): Promise<ConversationRow> {
  const q = tx.select().from(C).where(and(eq(C.id, id), eq(C.vendorId, vendorId), eq(C.userId, userId)));
  const [row] = await (lock ? q.for('update') : q);
  if (!row) throw Errors.notFound('Conversation', id);
  return row;
}

export async function listConversations(tx: Tx, vendorId: string, userId: string, f: { status: 'active' | 'archived' | 'all'; q?: string }, page: { limit: number; offset: number }) {
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const where = and(eq(C.vendorId, vendorId), eq(C.userId, userId), f.status === 'all' ? undefined : eq(C.status, f.status), like ? sql`${C.title} ilike ${like}` : undefined);
  const [rows, [c]] = await Promise.all([
    tx.select().from(C).where(where).orderBy(desc(sql`coalesce(${C.lastMessageAt}, ${C.createdAt})`), desc(C.id)).limit(page.limit).offset(page.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(C).where(where),
  ]);
  return { items: rows.map(conversationDto), total: Number(c?.n ?? 0) };
}

export async function listMessages(tx: Tx, vendorId: string, conversationId: string): Promise<MessageRow[]> {
  return tx.select().from(M).where(and(eq(M.vendorId, vendorId), eq(M.conversationId, conversationId))).orderBy(asc(M.createdAt), asc(M.role));
}

/** the context of the newest assistant message, used to resolve a short follow-up */
export async function previousContext(tx: Tx, vendorId: string, conversationId: string): Promise<TurnContext | null> {
  const [m] = await tx.select({ data: M.data }).from(M).where(and(eq(M.vendorId, vendorId), eq(M.conversationId, conversationId), eq(M.role, 'assistant'))).orderBy(desc(M.createdAt)).limit(1);
  return m ? contextFromStored(m.data) : null;
}

export async function updateConversation(tx: Tx, vendorId: string, userId: string, id: string, patch: { title?: string; status?: 'active' | 'archived' }): Promise<{ before: ConversationRow; after: ConversationRow }> {
  const before = await getConversation(tx, vendorId, userId, id, true);
  const set: Partial<typeof C.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.status !== undefined) set.status = patch.status;
  if (Object.keys(set).length === 0) throw new AppError('BAD_REQUEST', 'Nothing to change', { details: { rule: 'empty_patch' } });
  const [after] = await tx.update(C).set(set).where(and(eq(C.id, id), eq(C.vendorId, vendorId))).returning();
  return { before, after: after! };
}

export async function deleteConversation(tx: Tx, vendorId: string, userId: string, id: string): Promise<ConversationRow> {
  const row = await getConversation(tx, vendorId, userId, id, true);
  await tx.delete(C).where(and(eq(C.id, id), eq(C.vendorId, vendorId)));
  return row;
}

export interface AnswerToStore { text: string; content: string; intent: string; confidence: 'data' | 'none'; generatedBy: 'rules' | 'llm'; sources: string[]; dataVisual: DataVisual | null; suggestedActions: SuggestedAction[]; context: TurnContext; followUp: string | null }

/** stores the question and its answer, bumps the counters and names a fresh conversation after its first question */
export async function appendTurn(tx: Tx, vendorId: string, userId: string, conversationId: string, a: AnswerToStore) {
  const conv = await getConversation(tx, vendorId, userId, conversationId, true);
  if (conv.status === 'archived') throw new AppError('CONFLICT', 'This conversation is archived: restore it to continue', { details: { rule: 'conversation_archived' } });
  if (conv.messageCount + 2 > MAX_MESSAGES) throw new AppError('CONFLICT', `A conversation holds at most ${MAX_MESSAGES} messages: start a new one`, { details: { rule: 'conversation_full', limit: MAX_MESSAGES } });
  const asked = new Date();
  const answered = new Date(asked.getTime() + 1);
  const [user] = await tx.insert(M).values({ vendorId, conversationId, role: 'user', content: a.text, createdAt: asked }).returning();
  const [assistant] = await tx.insert(M).values({
    vendorId, conversationId, role: 'assistant', content: a.content, intent: a.intent, confidence: a.confidence, generatedBy: a.generatedBy, sources: a.sources,
    suggestedActions: a.suggestedActions as unknown as Array<Record<string, unknown>>, data: { dataVisual: a.dataVisual, context: a.context, followUp: a.followUp }, createdAt: answered,
  }).returning();
  const title = conv.title === DEFAULT_TITLE && conv.messageCount === 0 ? a.text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : conv.title;
  const [after] = await tx.update(C).set({ messageCount: conv.messageCount + 2, lastMessageAt: answered, title }).where(and(eq(C.id, conversationId), eq(C.vendorId, vendorId))).returning();
  return { conversation: after!, userMessage: user!, assistantMessage: assistant! };
}
