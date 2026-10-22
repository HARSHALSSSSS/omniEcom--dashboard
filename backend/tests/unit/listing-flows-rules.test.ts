import { describe, expect, it } from 'vitest';
import { applyDescriptionEdit, applyListEdit, applyTextEdit, planContentEdit, type EffectiveContent } from '../../modules/listings/src/flows-bulk-content';
import { fitToRequirement, keywordsIn, levelOf, rank, vocabularyFor } from '../../modules/listings/src/flows-suggest';
import { joinCategoryPath } from '../../modules/listings/src/flows-details';

const content = (over: Partial<EffectiveContent> = {}): EffectiveContent => ({ title: 'Cotton overshirt', description: 'Soft shirt', bulletPoints: ['Soft'], searchTerms: ['shirt'], brand: 'Acme', ...over });

describe('bulk content rules', () => {
  it('edits text: prefix, suffix, case-insensitive replace, set', () => {
    expect(applyTextEdit('Cotton overshirt', { op: 'prefix', value: 'Summer ' })).toBe('Summer Cotton overshirt');
    expect(applyTextEdit('Cotton overshirt', { op: 'suffix', value: ' (2026)' })).toBe('Cotton overshirt (2026)');
    expect(applyTextEdit('Blue BLUE blue', { op: 'replace', find: 'blue', value: 'Navy' })).toBe('Navy Navy Navy');
    expect(applyTextEdit('a.b a.b', { op: 'replace', find: 'a.b', value: 'x', caseSensitive: true })).toBe('x x');
    expect(applyTextEdit('anything', { op: 'set', value: '  New  ' })).toBe('New');
  });

  it('edits descriptions: appended and prepended text start on their own paragraph', () => {
    expect(applyDescriptionEdit('One', { op: 'append', value: 'Two' })).toBe('One\n\nTwo');
    expect(applyDescriptionEdit(null, { op: 'append', value: 'Two' })).toBe('Two');
    expect(applyDescriptionEdit('One', { op: 'prepend', value: 'Zero' })).toBe('Zero\n\nOne');
    expect(applyDescriptionEdit('One one', { op: 'replace', find: 'one', value: '1' })).toBe('1 1');
  });

  it('edits lists without duplicates (any case)', () => {
    expect(applyListEdit(['a', 'b'], { op: 'add', values: ['B', 'c'] })).toEqual(['a', 'b', 'c']);
    expect(applyListEdit(['a', 'b'], { op: 'remove', values: ['A'] })).toEqual(['b']);
    expect(applyListEdit(['a'], { op: 'set', values: ['x', 'X', 'y'] })).toEqual(['x', 'y']);
    expect(applyListEdit(['a'], { op: 'clear' })).toEqual([]);
  });

  it('plans only what changes and refuses results over the limits', () => {
    const plan = planContentEdit(content(), { title: { op: 'prefix', value: 'New ' }, brand: { op: 'set', value: 'Acme' }, bulletPoints: { op: 'clear' } });
    expect(Object.keys(plan.patch).sort()).toEqual(['bulletPoints', 'title']);
    expect(plan.patch.bulletPoints).toBeNull();
    expect(plan.changes.title).toEqual({ before: 'Cotton overshirt', after: 'New Cotton overshirt' });
    expect(planContentEdit(content(), { title: { op: 'suffix', value: 'x'.repeat(500) } }).problem).toMatch(/limit is 500/);
    expect(planContentEdit(content(), { title: { op: 'replace', find: 'Cotton overshirt', value: 'a' } }).problem).toMatch(/shorter than 3/);
    expect(planContentEdit(content({ bulletPoints: Array.from({ length: 10 }, (_, i) => `b${i}`) }), { bulletPoints: { op: 'add', values: ['one more'] } }).problem).toMatch(/limit is 10/);
    expect(planContentEdit(content(), { brand: { op: 'clear' } }).patch).toEqual({ brand: null });
  });
});

describe('suggestion rules', () => {
  const enumReq = { type: 'enum' as const, allowedValues: ['S', 'M', 'L', 'XL'], maxLength: undefined };
  it('fits free text to the allowed values or the type', () => {
    expect(fitToRequirement(enumReq, 'xl')).toBe('XL');
    expect(fitToRequirement(enumReq, 'Size: L (large)')).toBe('L');
    expect(fitToRequirement(enumReq, 'Huge')).toBeNull();
    expect(fitToRequirement({ type: 'number', maxLength: undefined }, '12.5')).toBe(12.5);
    expect(fitToRequirement({ type: 'boolean', maxLength: undefined }, 'Yes')).toBe(true);
    expect(fitToRequirement({ type: 'string', maxLength: 5 }, 'too long a value')).toBeNull();
    expect(fitToRequirement({ type: 'string', maxLength: 50 }, '  Cotton ')).toBe('Cotton');
    expect(fitToRequirement({ type: 'string', maxLength: 50 }, { nested: true })).toBeNull();
  });

  it('finds whole words only and picks a vocabulary by attribute name', () => {
    expect(keywordsIn('Cotton cottonwood stainless steel shirt', ['cotton', 'steel', 'stainless steel'])).toEqual(['stainless steel', 'cotton', 'steel']);
    expect(keywordsIn('cottonwood', ['cotton'])).toEqual([]);
    expect(vocabularyFor('Colour')?.includes('navy')).toBe(true);
    expect(vocabularyFor('fabric_type')?.includes('cotton')).toBe(true);
    expect(vocabularyFor('voltage')).toBeNull();
  });

  it('ranks the best value first and rewards a value several kinds of signal agree on', () => {
    const ranked = rank([
      { value: 'Cotton', confidence: 0.62, source: 'keyword_match', reason: 'a' },
      { value: 'cotton', confidence: 0.82, source: 'other_listing', reason: 'b' },
      { value: 'Linen', confidence: 0.85, source: 'master_field', reason: 'c' },
    ]);
    expect(ranked.map((r) => r.value)).toEqual(['cotton', 'Linen']);
    expect(ranked[0]!.confidence).toBe(0.86);
    expect(levelOf(0.9)).toBe('high');
    expect(levelOf(0.6)).toBe('medium');
    expect(levelOf(0.3)).toBe('low');
  });

  it('joins category paths without repeating the leaf', () => {
    expect(joinCategoryPath('Fashion > Apparel', 'Apparel')).toBe('Fashion > Apparel');
    expect(joinCategoryPath('Fashion', 'Apparel')).toBe('Fashion > Apparel');
    expect(joinCategoryPath(null, 'Apparel')).toBe('Apparel');
    expect(joinCategoryPath(null, null)).toBeNull();
  });
});
