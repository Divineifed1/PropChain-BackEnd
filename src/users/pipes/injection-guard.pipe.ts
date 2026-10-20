import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_DEPTH = 8;
const SQL_MARKERS = /(--|\/\*|;\s*(drop|delete|update|insert|alter)\b)/i;

/**
 * Screens user payloads and queries for injection shapes before they reach the
 * service. Profile and preference bodies may contain nested objects, so this is
 * recursive rather than flat:
 *  - keys starting with `$` or containing `.` (operator / path injection),
 *  - NUL bytes in any string,
 *  - SQL comment / stacked-statement markers in free-text search fields
 *    (`q`, `email`, `name`).
 * Prisma parameterises every query; this rejects hostile input early.
 */
@Injectable()
export class UserInjectionGuardPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (value !== null && typeof value === 'object') this.inspect(value, 0, '');
    return value;
  }

  private inspect(node: unknown, depth: number, path: string): void {
    if (depth > MAX_DEPTH) throw new BadRequestException('Request is nested too deeply');
    if (typeof node === 'string') {
      if (node.includes('\0'))
        throw new BadRequestException(`Invalid characters in ${path || 'value'}`);
      if (/^(q|email|name)$/.test(path) && SQL_MARKERS.test(node)) {
        throw new BadRequestException(`Invalid characters in ${path}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => this.inspect(item, depth + 1, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        if (key.startsWith('$') || key.includes('.')) {
          throw new BadRequestException('Invalid field name in request');
        }
        this.inspect(val, depth + 1, key);
      }
    }
  }
}
