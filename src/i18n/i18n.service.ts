/**
 * i18n Service
 *
 * Synchronously resolves translated message keys for exception filters,
 * validation messages and any user-facing string. Translation catalogues
 * are loaded from disk at module initialisation so that the lookup itself
 * is synchronous (exception filters run inside a single `catch(...)` call
 * and cannot easily await).
 *
 * Language detection order (per issue #964 acceptance criteria):
 *   1. caller-supplied `userPreference` (from User.languagePreference / UserPreferences.language)
 *   2. Accept-Language header (parsed per RFC 7231)
 *   3. `DEFAULT_LANGUAGE` fallback ("en")
 *
 * Issue #1236 – Missing keys are observable:
 *   - rate-limited warn log
 *   - translations_missing_total metric
 *   - in-memory ring of recently missed keys for admin debug endpoint
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export interface LanguageResolutionInput {
  userPreference?: string | null;
  acceptLanguageHeader?: string | null;
}

export type Catalogue = Record<string, unknown>;

export interface MissedKeyEntry {
  key: string;
  language: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

const MAX_RECENT_MISSES = 200;
const LOG_RATE_LIMIT_MS = 60_000; // one warn per key per minute

@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private readonly catalogues: Map<SupportedLanguage, Catalogue> = new Map();

  /** Ring buffer of recently missed keys for admin debug. */
  private readonly recentMisses = new Map<string, MissedKeyEntry>();

  /** Per-key last log timestamp for rate limiting. */
  private readonly lastLogAt = new Map<string, number>();

  private missingCounter: { inc: (labels: { key: string; language: string }) => void } | null =
    null;

  constructor(
    @Optional()
    private readonly translationsDir: string = path.join(
      process.cwd(),
      'src',
      'i18n',
      'translations',
    ),
  ) {}

  onModuleInit(): void {
    for (const lang of SUPPORTED_LANGUAGES) {
      const filePath = path.join(this.translationsDir, `${lang}.json`);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Catalogue;
        this.catalogues.set(lang, parsed);
        this.logger.log(`Loaded ${lang} translations from ${filePath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Falling back to an empty catalogue so the service still works;
        // missing keys return the key itself.
        this.logger.warn(`Failed to load translations for "${lang}" from ${filePath}: ${message}`);
        this.catalogues.set(lang, {});
      }
    }

    // Lazily bind Prometheus counter if metrics module is present (avoids hard dep in unit tests).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const metrics = require('../metrics/metrics.controller');
      if (metrics?.translationsMissingTotal) {
        this.missingCounter = metrics.translationsMissingTotal;
      }
    } catch {
      // metrics not available in this context (e.g. isolated unit test)
    }
  }

  /**
   * Resolve the language to use for a given request. Falls back to DEFAULT_LANGUAGE.
   */
  resolveLanguage(input: LanguageResolutionInput): SupportedLanguage {
    const fromPref = this.normalise(input.userPreference);
    if (fromPref) {
      return fromPref;
    }
    const fromHeader = this.parseAcceptLanguage(input.acceptLanguageHeader);
    if (fromHeader) {
      return fromHeader;
    }
    return DEFAULT_LANGUAGE;
  }

  /**
   * Translate a dotted key like "common.not_found" against the language
   * resolved from `resolveLanguage(input)`. Missing keys return the key
   * itself so they can be debugged without throwing in production.
   */
  translate(
    key: string,
    input: LanguageResolutionInput,
    params?: Record<string, string | number>,
  ): string {
    const lang = this.resolveLanguage(input);
    return this.tFor(key, lang, params);
  }

  /**
   * Low-level translate against an explicit language. Used when the caller
   * has already determined the language (e.g. i18n pipes & filters that
   * have a request-scoped language attached).
   *
   * Issue #1236: on total miss, emit rate-limited warn + metric and record
   * the key for the admin debug endpoint. Still returns the raw key for
   * graceful degradation.
   */
  tFor(key: string, lang: SupportedLanguage, params?: Record<string, string | number>): string {
    const catalogue = this.catalogues.get(lang) ?? this.catalogues.get(DEFAULT_LANGUAGE) ?? {};
    const value = this.lookup(catalogue, key);
    if (typeof value !== 'string') {
      // Try the default language as a last resort before returning the key.
      if (lang !== DEFAULT_LANGUAGE) {
        const fallback = this.catalogues.get(DEFAULT_LANGUAGE);
        const fallbackValue = fallback ? this.lookup(fallback, key) : undefined;
        if (typeof fallbackValue === 'string') {
          return this.interpolate(fallbackValue, params);
        }
      }
      this.recordMiss(key, lang);
      return key;
    }
    return this.interpolate(value, params);
  }

  /**
   * Admin debug: list recently missed translation keys (most recent first).
   */
  getRecentMisses(): MissedKeyEntry[] {
    return Array.from(this.recentMisses.values()).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
  }

  /**
   * Clear the in-memory miss ring (useful for tests / after catalogue deploy).
   */
  clearRecentMisses(): void {
    this.recentMisses.clear();
    this.lastLogAt.clear();
  }

  hasLanguage(lang: string): lang is SupportedLanguage {
    return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
  }

  private recordMiss(key: string, lang: SupportedLanguage): void {
    const now = new Date();
    const mapKey = `${lang}:${key}`;
    const existing = this.recentMisses.get(mapKey);
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = now.toISOString();
    } else {
      if (this.recentMisses.size >= MAX_RECENT_MISSES) {
        // Drop oldest by lastSeenAt
        let oldestKey: string | null = null;
        let oldestTs = Infinity;
        for (const [k, v] of this.recentMisses) {
          const ts = new Date(v.lastSeenAt).getTime();
          if (ts < oldestTs) {
            oldestTs = ts;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          this.recentMisses.delete(oldestKey);
        }
      }
      this.recentMisses.set(mapKey, {
        key,
        language: lang,
        count: 1,
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      });
    }

    // Rate-limited warn (once per key per minute)
    const last = this.lastLogAt.get(mapKey) ?? 0;
    const ts = now.getTime();
    if (ts - last >= LOG_RATE_LIMIT_MS) {
      this.lastLogAt.set(mapKey, ts);
      this.logger.warn(`Missing translation key "${key}" for language "${lang}"`);
    }

    // Metric (best-effort)
    try {
      this.missingCounter?.inc({ key, language: lang });
    } catch {
      // ignore metric errors
    }
  }

  private normalise(value: string | null | undefined): SupportedLanguage | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (this.hasLanguage(trimmed)) {
      return trimmed;
    }
    const base = trimmed.split('-')[0] ?? '';
    if (this.hasLanguage(base)) {
      return base;
    }
    return null;
  }

  /**
   * Minimal RFC 7231 / 4647 Accept-Language parser. Returns the highest
   * supported language from the header or null. Quality factors are
   * respected but ignored if no supported tag matches.
   */
  parseAcceptLanguage(header: string | null | undefined): SupportedLanguage | null {
    if (!header) {
      return null;
    }
    const entries: Array<{ tag: string; q: number; index: number }> = [];
    let index = 0;
    for (const raw of header.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }
      const [tagPart, ...params] = trimmed.split(';');
      const normalisedTag = (tagPart ?? '').trim().toLowerCase();
      let q = 1;
      for (const param of params) {
        const match = param.trim().match(/^q=([0-9.]+)$/i);
        if (match && match[1]) {
          const parsed = Number.parseFloat(match[1]);
          if (!Number.isNaN(parsed)) {
            q = parsed;
          }
        }
      }
      // RFC 7231: q=0 means "not acceptable" — skip those tags.
      if (normalisedTag && q > 0) {
        entries.push({ tag: normalisedTag, q, index });
      }
      index += 1;
    }
    entries.sort((a, b) => b.q - a.q || a.index - b.index);

    for (const entry of entries) {
      // Wildcard * does not map to a concrete catalogue.
      if (entry.tag === '*') {
        continue;
      }
      const direct = this.normalise(entry.tag);
      if (direct) {
        return direct;
      }
      const wildcard = entry.tag.split('-')[0];
      const wild = this.normalise(wildcard);
      if (wild) {
        return wild;
      }
    }
    return null;
  }

  private lookup(catalogue: Catalogue, key: string): unknown {
    const segments = key.split('.');
    let cursor: unknown = catalogue;
    for (const segment of segments) {
      if (cursor && typeof cursor === 'object' && segment in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }
    return cursor;
  }

  private interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(params, name)) {
        const value = params[name];
        if (value === undefined || value === null) {
          return match;
        }
        return String(value);
      }
      return match;
    });
  }
}
