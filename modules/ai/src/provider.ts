/**
 * The AI service boundary. The platform's answers are built from REAL data by deterministic code (see brain.ts); a language model is an
 * optional narrator behind this interface that may only re-word facts it is given. It never queries data, never changes data and is never
 * the source of truth. Swap providers (or run with none) without touching anything else.
 */
export interface AiProvider {
  readonly name: string;
  /** Re-write `draft` (already correct, from real data) in natural language for `question`. Must not add facts. */
  narrate(input: { question: string; draft: string; facts: unknown; signal?: AbortSignal }): Promise<string>;
}

export interface AiProviderConfig { AI_PROVIDER: 'rules'; AI_TIMEOUT_MS: number }

/** Plug a language-model narrator in here. Until one is registered the deterministic answer is the answer. */
export function createAiProvider(_cfg: AiProviderConfig): AiProvider | null {
  return null;
}
