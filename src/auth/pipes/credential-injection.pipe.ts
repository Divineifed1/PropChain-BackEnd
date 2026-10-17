import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_DEPTH = 5;
const SQL_COMMENT_OR_STACKED = /(--|;\s*(drop|delete|update|insert|alter)\b|\/\*)/i;

/**
 * Rejects credential payloads that carry injection shapes. Auth bodies are flat
 * objects of strings, so anything else is refused outright:
 *  - non-string values (`{ "email": { "$ne": null } }` is the classic NoSQL
 *    operator injection),
 *  - keys starting with `$` or containing `.` (operator / path injection),
 *  - NUL bytes, and SQL comment or stacked-statement markers in free text.
 * Prisma already parameterises queries; this closes the input side as well.
 */
@Injectable()
export class CredentialInjectionPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
      throw new BadRequestException('Invalid request body');
    }
    this.inspect(value as Record<string, unknown>, 0);
    return value;
  }

  private inspect(node: Record<string, unknown>, depth: number): void {
    if (depth > MAX_DEPTH) throw new BadRequestException('Invalid request body');
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') || key.includes('.')) {
        throw new BadRequestException('Invalid field name in request body');
      }
      if (val === null || val === undefined || typeof val === 'boolean' || typeof val === 'number') continue;
      if (typeof val === 'string') {
        if (val.includes('\0')) throw new BadRequestException(`Invalid characters in ${key}`);
        // Passwords may legitimately contain "--" or ";", so only free-text fields are screened.
        if (!/password|token|code/i.test(key) && SQL_COMMENT_OR_STACKED.test(val)) {
          throw new BadRequestException(`Invalid characters in ${key}`);
        }
        continue;
      }
      if (Array.isArray(val)) {
        val.forEach((item) => {
          if (item !== null && typeof item === 'object') throw new BadRequestException(`Invalid value for ${key}`);
        });
        continue;
      }
      throw new BadRequestException(`${key} must be a plain value`);
    }
  }
}
