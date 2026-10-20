import { TransformFnParams } from 'class-transformer';

// Matches C0/C1 control characters (including NUL) except tab/newline, which
// collapse into spaces for free text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HTML_TAGS = /<[^>]*>/g;

/**
 * Trim and strip control characters, and normalise to NFKC so visually identical
 * values compare equal. Safe for identifiers such as a session id read from a
 * route param.
 */
export function sanitizeIdentifier(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
}

/**
 * Free text such as a session display name: also removes HTML tags and collapses
 * runs of whitespace so a name cannot be padded out or broken across lines.
 */
export function sanitizeText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** class-transformer callback for DTO fields. */
export const CleanText = ({ value }: TransformFnParams): unknown => sanitizeText(value);
