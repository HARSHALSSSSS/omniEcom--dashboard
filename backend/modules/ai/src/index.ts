import type { FastifyPluginAsync } from 'fastify';
import { assistantRoutes } from './assistant-routes';
import { manifest } from './manifest';
import { aiRoutes } from './routes';

export { manifest };
export { aiRoutes } from './routes';
export { assistantRoutes } from './assistant-routes';
export { createRecommendation, ACTIONS as AI_ACTIONS, getSettings as getAiSettings, type NewRecommendation } from './recommend';
export { detectAnomalies, type Anomaly, type DayPoint } from './detect';
export { classify as classifyQuestion } from './brain';
export { productIntelligence, decide as decideProductAction, type IntelItem } from './intelligence';

const routes: FastifyPluginAsync = async (app) => {
  await app.register(aiRoutes);
  await app.register(assistantRoutes);
};

/**
 * AI: a layer ON TOP of the real data. Answers and recommendations are computed from analytics / inventory; a language model may only
 * narrate; actions come from a whitelist and move through OBSERVE -> RECOMMEND -> APPROVE -> AUTOMATE, with human approval by default.
 * Also home of the conversation history of the assistant screen and of product intelligence.
 */
export const aiModule = { manifest, routes };
