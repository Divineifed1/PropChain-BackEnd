import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_DEPTH = 8;
const SQL_MARKERS = /(--|\/\*|;\s*(drop|delete|update|insert|alter|truncate)\b)/i;
const FREE_TEXT_FIELDS =
  /^(location|title|description|address|city|state|zipCode|country|propertyType|category|tag|filter|reason|hoaName|hoaContactInfo)$/;

/**
 * Screens Property API payloads and queries for injection shapes before they
 * reach the service. Query objects and array bodies are nested, so the walk is
 * recursive rather than flat:
 *  - keys starting with `$` or containing `.` (operator / path injection), which
 *    `whitelist` does not catch because they are looked up inside a value rather
 *    than at the top level of the body,
 *  - NUL bytes in any string,
 *  - SQL comment / stacked-statement markers in the free-text fields,
 *  - payloads nested deeper than 8 levels.
 *
 * Prisma parameterises every query and the DTOs bound the values anyway; this
 * rejects hostile input early, before it can reach either.
 */
@Injectable()
export class PropertyInjectionGuardPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (value !== null && typeof value === 'object') this.inspect(value, 0, '');
    return value;
  }

  private inspect(node: unknown, depth: number, path: string): void {
    if (depth > MAX_DEPTH) throw new BadRequestException('Request is nested too deeply');
    if (typeof node === 'string') {
      if (node.includes('\0'))
        throw new BadRequestException(`Invalid characters in ${path || 'value'}`);
      if (FREE_TEXT_FIELDS.test(path) && SQL_MARKERS.test(node)) {
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
