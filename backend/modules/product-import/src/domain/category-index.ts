import { similarity } from './mapping';

export interface CategoryNode { id: string; parentId: string | null; name: string; slug: string; path: string }
export interface CategoryMatch { id: string; label: string; /** 0-1, only set by closest() */ score?: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEPARATORS = /\s*(?:>|\/|\||›|»)\s*/;
const key = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
const joinPath = (segments: string[]): string => segments.map(key).join(' > ');

/** Lookup of a business's category tree by id, slug, name and "A > B" path, plus the closest-name suggestion for unknown text. */
export class CategoryIndex {
  private readonly byId = new Map<string, CategoryNode>();
  private readonly byName = new Map<string, CategoryNode[]>();
  private readonly byNamePath = new Map<string, CategoryNode>();
  private readonly bySlugPath = new Map<string, CategoryNode>();
  private readonly labels = new Map<string, string>();

  constructor(nodes: CategoryNode[]) {
    for (const n of nodes) this.byId.set(n.id, n);
    for (const n of nodes) {
      const chain: string[] = [];
      for (let cur: CategoryNode | undefined = n, guard = 0; cur && guard < 20; cur = cur.parentId ? this.byId.get(cur.parentId) : undefined, guard++) chain.unshift(cur.name);
      this.labels.set(n.id, chain.join(' > '));
      this.byNamePath.set(joinPath(chain), n);
      this.bySlugPath.set(n.path.toLowerCase(), n);
      this.byName.set(key(n.name), [...(this.byName.get(key(n.name)) ?? []), n]);
    }
  }

  get size(): number { return this.byId.size; }

  label(id: string): string | null { return this.labels.get(id) ?? null; }

  /** the category the text names unambiguously (id, path, slug path, slug or name), else null */
  resolve(text: string): CategoryMatch | null {
    const t = text.trim();
    if (t === '') return null;
    const hit = (n: CategoryNode | undefined): CategoryMatch | null => (n ? { id: n.id, label: this.labels.get(n.id) ?? n.name } : null);
    if (UUID.test(t)) return hit(this.byId.get(t.toLowerCase()));
    const segments = t.split(SEPARATORS).filter(Boolean);
    const byPath = this.byNamePath.get(joinPath(segments)) ?? this.bySlugPath.get(segments.map(key).join('/'));
    if (byPath) return hit(byPath);
    const names = this.byName.get(key(segments[segments.length - 1] ?? t));
    if (names?.length === 1) return hit(names[0]);
    const bySlug = [...this.bySlugPath.values()].filter((n) => n.slug.toLowerCase() === key(t));
    return bySlug.length === 1 ? hit(bySlug[0]) : null;
  }

  /** the most similar category by name or path when it is similar enough to propose */
  closest(text: string, minScore = 0.5): CategoryMatch | null {
    let best: { n: CategoryNode; score: number } | null = null;
    for (const n of this.byId.values()) {
      const score = Math.max(similarity(text, n.name), similarity(text, this.labels.get(n.id) ?? n.name), containment(text, n.name));
      if (!best || score > best.score) best = { n, score };
    }
    return best && best.score >= minScore ? { id: best.n.id, label: this.labels.get(best.n.id) ?? best.n.name, score: best.score } : null;
  }
}

/** 0.7 when one name contains the other as whole words ("Festive Kurtas" vs "Kurtas") */
function containment(a: string, b: string): number {
  const x = key(a).split(' ');
  const y = key(b).split(' ');
  const [small, large] = x.length <= y.length ? [x, y] : [y, x];
  return small.length > 0 && small.every((w) => w.length > 2 && large.includes(w)) ? 0.7 : 0;
}
