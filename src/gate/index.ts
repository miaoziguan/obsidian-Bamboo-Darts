/**
 * 质量门控 — 编排入口
 *
 * 规则分两组：
 *   廉价组（始终执行）：长度、广告/低质、HTML残留、乱码、链接堆砌
 *   昂贵组（有阻断时跳过）：关键词堆砌、信息密度、噪声占比
 *
 * 所有已执行规则的结果全量收集，结构化呈现。
 * 累积警告升级阈值根据内容长度动态调整，避免长文被过度阻断。
 */

import { tokenize } from '../utils/tokenizer';
import { ProfileConfig } from '../extraction/profiles';
import { GateCheckResult, GateResult } from './types';
import { checkLength } from './length';
import { checkQuality, checkKeywordStuffing } from './quality';
import { checkDensity } from './density';
import { checkNoiseRatio } from './noise';
import { checkParagraphRepetition } from './paragraph-repetition';
import { checkHtmlArtifacts } from './html';
import { checkMojibake } from './mojibake';
import { checkLinkDump } from './link-dump';

type NamedRule = { name: string; check: GateResult };

function collect(rule: NamedRule, reasons: string[], warnings: string[]): void {
  const { name, check } = rule;
  if (check.status === 'block') {
    reasons.push(`[${name}] ${check.reason}`);
  } else if (check.status === 'warn') {
    warnings.push(`[${name}] ${check.reason}`);
  }
}

function buildSummary(reasons: string[]): string {
  if (reasons.length === 0) return '';
  if (reasons.length === 1) return reasons[0];
  return `${reasons[0]}（另有 ${reasons.length - 1} 个问题）`;
}

/**
 * 计算内容长度相关的动态因子
 * - lengthFactor: 基于 log10 的长度因子，用于平滑阈值调整
 * - warnThreshold: 警告累积升级阈值，长文允许更多警告
 */
function computeDynamicFactors(contentLength: number): {
  lengthFactor: number;
  warnThreshold: number;
} {
  // 基础 3 条警告升级；内容越长，允许越多边缘警告
  const lengthFactor = Math.max(1, Math.log10(contentLength + 10));
  const warnThreshold = Math.max(3, Math.min(6, Math.floor(lengthFactor * 1.8)));
  return { lengthFactor, warnThreshold };
}

export function runGateChecks(
  content: string,
  profileConfig?: ProfileConfig,
  sourceHint?: 'selection' | 'text' | 'url',
): GateCheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const { lengthFactor, warnThreshold } = computeDynamicFactors(content.length);

  // ── 廉价组：始终执行 ──
  collect(
    {
      name: '长度',
      check: checkLength(
        content,
        profileConfig?.gateMinLength,
        profileConfig?.gateWarnLength,
        profileConfig?.gateMaxLength,
        profileConfig?.gateWarnMaxLength,
        sourceHint,
      ),
    },
    reasons,
    warnings,
  );
  collect(
    {
      name: '质量',
      check: checkQuality(
        content,
        profileConfig?.gateQualityBlockCount,
        profileConfig?.gateQualityWarnCount,
        lengthFactor,
      ),
    },
    reasons,
    warnings,
  );
  collect(
    {
      name: 'HTML',
      check: checkHtmlArtifacts(
        content,
        profileConfig?.gateHtmlBlockCount,
        profileConfig?.gateHtmlWarnCount,
        lengthFactor,
      ),
    },
    reasons,
    warnings,
  );
  collect(
    {
      name: '乱码',
      check: checkMojibake(
        content,
        profileConfig?.gateMojibakeBlockCount,
        profileConfig?.gateMojibakeWarnCount,
        lengthFactor,
      ),
    },
    reasons,
    warnings,
  );
  collect(
    {
      name: '链接',
      check: checkLinkDump(
        content,
        profileConfig?.gateLinkBlockRatio,
        profileConfig?.gateLinkBlockDensity,
        profileConfig?.gateLinkWarnDensity,
        lengthFactor,
      ),
    },
    reasons,
    warnings,
  );

  // ── 昂贵组：无阻断时执行 ──
  if (reasons.length === 0) {
    const tokenMap = tokenize(content, { ngramSize: 2 });

    const minDensity = profileConfig?.gateMinDensity;
    const warnDensity = profileConfig?.gateWarnDensity;
    const maxNoise = profileConfig?.gateMaxNoiseRatio;
    const warnNoise = profileConfig?.gateWarnNoiseRatio;

    collect(
      {
        name: '堆砌',
        check: checkKeywordStuffing(
          content,
          tokenMap,
          profileConfig?.gateKeywordStuffingBlockRate,
          profileConfig?.gateKeywordStuffingWarnRate,
          profileConfig?.gateKeywordStuffingMinLength,
          profileConfig?.gateKeywordStuffingMinCount,
          profileConfig?.gateKeywordStuffingTopN,
          lengthFactor,
        ),
      },
      reasons,
      warnings,
    );
    collect(
      { name: '密度', check: checkDensity(content, tokenMap, minDensity, warnDensity) },
      reasons,
      warnings,
    );
    collect(
      { name: '噪声', check: checkNoiseRatio(content, maxNoise, warnNoise) },
      reasons,
      warnings,
    );
    collect(
      {
        name: '段落重复',
        check: checkParagraphRepetition(
          content,
          profileConfig?.gateParagraphRepBlock,
          profileConfig?.gateParagraphRepWarn,
        ),
      },
      reasons,
      warnings,
    );
  }

  // ── 警告累积升级 ──
  if (reasons.length === 0 && warnings.length >= warnThreshold) {
    reasons.push(`[综合] 累积 ${warnings.length} 条警告，质量不达标`);
  }

  return {
    passed: reasons.length === 0,
    summary: buildSummary(reasons),
    reasons,
    warnings,
  };
}

export type { GateCheckResult } from './types';
