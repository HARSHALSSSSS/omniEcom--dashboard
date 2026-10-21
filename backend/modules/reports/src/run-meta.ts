export interface RunMeta { period?: { fromDay: string; toDay: string; label: string }; warnings?: number; notes?: string[]; settlementDataAvailable?: boolean; schedule?: { name: string } }

/** the run keeps its outcome next to the requested parameters under keys that start with two underscores */
export function splitParams(p: Record<string, unknown>): { visible: Record<string, unknown>; meta: RunMeta } {
  const visible = Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('__')));
  return { visible, meta: { ...(p.__result as RunMeta | undefined), ...(p.__schedule ? { schedule: p.__schedule as { name: string } } : {}) } };
}
