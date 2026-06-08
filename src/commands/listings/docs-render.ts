import { bold, dim, formatTable } from '../../format.js';
import { truncate } from './helpers.js';
import type { ResolvedEndpoint } from '@proxygate/openapi-parser';
import type { GraphQLOperationDescription, GraphQLTypeDescription, ParsedOperation } from '@proxygate/graphql-parser';

/** Render the type of a JSON-schema property one level deep (ref name, array-of, or scalar type). */
function schemaPropType(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return 'any';
  const p = prop as Record<string, unknown>;
  if (typeof p.$ref === 'string') return p.$ref.split('/').pop() ?? 'object';
  if (p.type === 'array') {
    const items = p.items as Record<string, unknown> | undefined;
    return `${schemaPropType(items)}[]`;
  }
  if (typeof p.type === 'string') return p.type;
  if (p.enum) return 'enum';
  if (p.oneOf || p.anyOf) return 'oneOf';
  return 'object';
}

/** List an object schema's direct fields as `name: type` lines, or a compact note for non-objects. */
function renderSchemaFields(schema: Record<string, unknown> | undefined, indent = '  '): string[] {
  if (!schema) return [`${indent}${dim('(no schema)')}`];
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (props && Object.keys(props).length > 0) {
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    return Object.entries(props).map(([name, prop]) => {
      const req = required.has(name) ? dim(' required') : '';
      const desc = typeof prop.description === 'string' ? `  ${dim(truncate(prop.description, 50))}` : '';
      return `${indent}${name}: ${schemaPropType(prop)}${req}${desc}`;
    });
  }
  if (schema.type === 'array') return [`${indent}array of ${schemaPropType(schema.items)}`];
  if (typeof schema.$ref === 'string') return [`${indent}${schema.$ref.split('/').pop()}`];
  return [`${indent}${schemaPropType(schema)}`];
}

/**
 * Compact GraphQL operations index: Type / Operation / Returns. Arguments are
 * deliberately NOT listed here - arg-heavy schemas (dozens of filter args per
 * operation) would balloon the index. Get args + return-type fields on demand
 * with `--operation <name>`.
 */
export function renderGraphQLIndex(ops: ParsedOperation[]): string {
  const headers = ['Type', 'Operation', 'Args', 'Returns'];
  const rows = ops.map((op) => [
    op.operationType,
    `${op.name}${op.deprecated ? dim(' deprecated') : ''}`,
    String((op.args ?? []).length),
    op.returnType,
  ]);
  return formatTable(headers, rows);
}

function renderTypeBody(t: GraphQLTypeDescription): string[] {
  const lines: string[] = [];
  if (t.enumValues) lines.push(`  ${t.enumValues.join(' | ')}`);
  if (t.possibleTypes) lines.push(`  ${t.possibleTypes.join(' | ')}`);
  for (const f of t.fields) {
    const args = f.args.length > 0 ? `(${f.args.map((a) => `${a.name}: ${a.type}`).join(', ')})` : '';
    const desc = f.description ? `  ${dim(truncate(f.description, 50))}` : '';
    lines.push(`  ${f.name}${args}: ${f.type}${f.deprecated ? dim(' deprecated') : ''}${desc}`);
  }
  return lines;
}

/** A single GraphQL type's direct members (one level). */
export function renderGraphQLType(t: GraphQLTypeDescription): string {
  const head = `${bold(t.name)} ${dim(`(${t.kind})`)}`;
  const desc = t.description ? `\n${dim(t.description)}` : '';
  return [head + desc, ...renderTypeBody(t)].join('\n');
}

/** A GraphQL operation with its return type's fields and any input-object args, resolved one level. */
export function renderGraphQLOperation(d: GraphQLOperationDescription): string {
  const op = d.operation;
  const args = op.args.map((a) => `${a.name}: ${a.type}${a.defaultValue !== undefined ? ` = ${a.defaultValue}` : ''}`);
  const out: string[] = [];
  out.push(`${bold(op.name)} ${dim(`(${op.operationType})`)} -> ${op.returnType}`);
  if (op.description) out.push(dim(op.description));
  out.push('');
  out.push(bold('Arguments:'));
  out.push(args.length > 0 ? args.map((a) => `  ${a}`).join('\n') : `  ${dim('(none)')}`);
  for (const it of d.inputTypes) {
    out.push('', `${bold('Input')} ${renderGraphQLType(it)}`);
  }
  if (d.returnType) {
    out.push('', `${bold('Returns')} ${renderGraphQLType(d.returnType)}`);
  }
  return out.join('\n');
}

/** A single REST endpoint with params + request/response body fields, $refs resolved one level. */
export function renderEndpoint(ep: ResolvedEndpoint): string {
  const out: string[] = [];
  out.push(`${bold(`${ep.method} ${ep.path}`)}`);
  if (ep.summary ?? ep.description) out.push(dim(ep.description ?? ep.summary ?? ''));
  if (ep.parameters.length > 0) {
    out.push('', bold('Parameters:'));
    for (const p of ep.parameters) {
      out.push(`  ${p.name} ${dim(`(${p.in})`)}: ${p.type}${p.required ? dim(' required') : ''}`);
    }
  }
  if (ep.requestBody) {
    out.push('', `${bold('Request body')} ${dim(`(${ep.requestBody.contentType})`)}:`);
    out.push(...renderSchemaFields(ep.requestBody.schema));
  }
  const ok = ep.responses.find((r) => r.status.startsWith('2')) ?? ep.responses[0];
  if (ok) {
    out.push('', `${bold(`Response ${ok.status}`)}:`);
    out.push(...renderSchemaFields(ok.schema));
  }
  return out.join('\n');
}
