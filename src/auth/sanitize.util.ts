import { TransformFnParams } from 'class-transformer';

// Matches C0/C1 control characters (including NUL) except tab/newline, which
// collapse into spaces below.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HTML_TAGS = /<[^>]*>/g;

/** Trim and strip control characters. Safe for identifiers such as email addresses. */
export function sanitizeIdentifier(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
}

/** Free text such as names: also removes HTML tags and collapses whitespace. */
export function sanitizeText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * class-transformer callbacks for DTO fields. Passwords and tokens are
 * intentionally never sanitized: altering them would change the secret.
 */
export const TrimIdentifier = ({ value }: TransformFnParams): unknown => sanitizeIdentifier(value);
export const CleanText = ({ value }: TransformFnParams): unknown => sanitizeText(value);
