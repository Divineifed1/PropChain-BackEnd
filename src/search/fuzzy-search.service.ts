import { Injectable } from '@nestjs/common';

interface FuzzySearchResult {
  item: string;
  score: number;
}

export interface FuzzySearchOptions {
  /** Minimum similarity (0..1) for a candidate to be returned. Default 0.4. */
  threshold?: number;
  /** Cap on the number of results. Default 10. */
  maxResults?: number;
}

/** Maximum edit distance considered against the query length. */
const MAX_DISTANCE_RATIO = 0.6;

@Injectable()
export class FuzzySearchService {
  search(query: string, items: string[], options: FuzzySearchOptions = {}): FuzzySearchResult[] {
    if (!query || items.length === 0) return [];

    const threshold = options.threshold ?? 0.4;
    const maxResults = options.maxResults ?? 10;
    const normalised = query.toLowerCase();

    return items
      .map((item) => ({ item, score: this.score(normalised, item.toLowerCase()) }))
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Similarity between the query and a target using an optimal string
   * alignment (restricted Damerau-Levenshtein) distance, normalised by the
   * longer string so long targets are not unfairly penalised (#1180).
   *
   * Returns 1 for exact/substring matches and 0 when the required edit
   * distance exceeds the configured cap.
   */
  private score(query: string, target: string): number {
    if (query === target) return 1;
    if (target.includes(query)) return 0.95;

    const distance = this.damerauLevenshtein(query, target);
    const maxLength = Math.max(query.length, target.length);
    if (maxLength === 0) return 1;

    const ratio = distance / maxLength;
    if (ratio > MAX_DISTANCE_RATIO) return 0;

    return 1 - ratio;
  }

  /**
   * Restricted Damerau-Levenshtein (optimal string alignment) distance with a
   * bounded cost matrix sized to the smaller string for memory/CPU efficiency
   * on large candidate lists.
   */
  private damerauLevenshtein(a: string, b: string): number {
    const lenA = a.length;
    const lenB = b.length;

    if (lenA === 0) return lenB;
    if (lenB === 0) return lenA;

    // Keep the matrix shaped by the shorter string to bound allocations.
    const [short, long] = lenA <= lenB ? [a, b] : [b, a];
    const n = short.length;
    const m = long.length;

    let prev2 = new Array<number>(n + 1);
    let prev = new Array<number>(n + 1);
    const current = new Array<number>(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      current[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = short[j - 1] === long[i - 1] ? 0 : 1;
        current[j] = Math.min(
          prev[j] + 1, // deletion
          current[j - 1] + 1, // insertion
          prev[j - 1] + cost, // substitution
        );

        // Transposition: swap adjacent characters in the query.
        if (i > 1 && j > 1 && short[j - 1] === long[i - 2] && short[j - 2] === long[i - 1]) {
          current[j] = Math.min(current[j], prev2[j - 2] + 1);
        }
      }

      prev2 = prev;
      prev = [...current];
    }

    return prev[n];
  }
}
