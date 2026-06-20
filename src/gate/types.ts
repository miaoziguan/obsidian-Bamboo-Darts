/**
 * 门控规则类型定义
 */

export type GateResult =
  | { status: 'ok' }
  | { status: 'warn'; reason: string }
  | { status: 'block'; reason: string };

export interface GateCheckResult {
  passed: boolean;
  summary: string;
  reasons: string[];
  warnings: string[];
}

export function ok(): GateResult {
  return { status: 'ok' };
}

export function warn(reason: string): GateResult {
  return { status: 'warn', reason };
}

export function block(reason: string): GateResult {
  return { status: 'block', reason };
}
