/**
 * Request-scoped language context for the ValidationPipe exceptionFactory.
 *
 * ValidationPipe's exceptionFactory runs outside the normal filter/interceptor
 * chain and has no access to the Express Request. Middleware stores the
 * Accept-Language header (and optional user preference) in AsyncLocalStorage
 * so the factory can pass them into I18nService.translate.
 *
 * Issue #1234 / #964.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestLanguageContext {
  acceptLanguageHeader?: string | null;
  userPreference?: string | null;
}

export const requestLanguageStore = new AsyncLocalStorage<RequestLanguageContext>();

export function getRequestLanguageContext(): RequestLanguageContext {
  return requestLanguageStore.getStore() ?? {};
}

export function runWithRequestLanguage<T>(ctx: RequestLanguageContext, fn: () => T): T {
  return requestLanguageStore.run(ctx, fn);
}
