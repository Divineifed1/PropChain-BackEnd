import { FuzzySearchService } from './fuzzy-search.service';

describe('FuzzySearchService', () => {
  const service = new FuzzySearchService();

  it('returns an empty array for empty input or item list', () => {
    expect(service.search('', ['a', 'b'])).toEqual([]);
    expect(service.search('x', [])).toEqual([]);
    expect(service.search('   ', ['a'])).toEqual([]);
  });

  it('ranks a typo-tolerant match above an unrelated subsequence match', () => {
    const items = ['propel', 'property', 'propeller'];
    const [top] = service.search('propety', items);
    expect(top.item).toBe('property');
    expect(top.score).toBeGreaterThan(0.5);
  });

  it('handles single-character insertions', () => {
    const [top] = service.search('porperty', ['property', 'propeller']);
    expect(top.item).toBe('property');
  });

  it('is case-insensitive', () => {
    const results = service.search('Property', ['PROPERTY']);
    expect(results[0].item).toBe('PROPERTY');
    expect(results[0].score).toBe(1);
  });

  it('does not unfairly penalise longer targets', () => {
    const short = service.search('new y', ['new york']);
    const long = service.search('new y', ['new york city west side']);
    // Both are equally good matches relative to length; long must not be
    // wiped out just because the query is short.
    expect(long[0]?.score).toBeGreaterThan(0.3);
    expect(short[0]?.score).toBeGreaterThan(0.3);
  });

  it('respects the threshold option', () => {
    const exact = service.search('york', ['york', 'work'], { threshold: 0.3 });
    const strict = service.search('york', ['york', 'work'], { threshold: 0.95 });
    expect(exact).toHaveLength(2);
    expect(strict).toHaveLength(1);
    expect(strict[0].item).toBe('york');
  });

  it('caps results via maxResults', () => {
    const results = service.search('apartment', [
      'apartment',
      'apartments',
      'apartment complex',
      'apartment downtown',
    ]);
    expect(results).toHaveLength(4);
    const capped = service.search('apartment', ['apartment', 'apartments'], {
      maxResults: 1,
    });
    expect(capped).toHaveLength(1);
  });

  it('returns an exact query as a top score', () => {
    const [top] = service.search('beach house', ['beach house']);
    expect(top.score).toBe(1);
  });

  it('handles accent-heavy strings without crashing', () => {
    const results = service.search('cafe', ['café', 'cafe terrace']);
    expect(results.length).toBe(2);
  });
});
