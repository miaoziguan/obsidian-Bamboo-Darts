/**
 * 统一内容核查模块
 * 三层核查管线：原文溯源（零 API）→ 语义比对（单次 AI）→ 超源标记（零 API）
 */

import { requestUrl } from 'obsidian';
import { AtomicNote, VerificationItem } from '../utils/notes-standards';
import {
  extractVerifiableClaims,
  locateAnchorInSource,
  VerifiableClaim,
} from '../utils/data-extractor';
import { parseJsonArrayFromAI } from '../utils/json-parser';

/** 空白规范化：合并连续空格/换行/制表符为单个空格，去除首尾空白 */
function normalizeWS(s: string): string {
  return s.replace(/[\s\n\r\t]+/g, ' ').trim();
}

// ─── 结果类型 ───

export interface VerificationResult {
  notes: AtomicNote[];
  traced: number;
  needsCompare: number;
  outOfScope: number;
  error?: string;
}

interface ClaimWithContext {
  noteIndex: number;
  claim: VerifiableClaim;
}

// ─── 统一入口 ───

/**
 * 统一内容核查：三层管线替代旧的 verifyFacts + verifyData
 *
 * Layer 1：原文溯源（零 API）—— 用 extractVerifiableClaims + locateAnchorInSource 精确/模糊匹配
 * Layer 2：语义比对（单次 AI）—— 收集 Layer 1 未命中的声明，一次性发给 AI 溯源
 * Layer 3：超源标记（零 API）—— Layer 2 仍未匹配的声明标记为 '超源'
 */
export async function verifyClaims(
  truncatedContent: string,
  notes: AtomicNote[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  },
  /** 原始全文（Layer 1 溯源用），默认等同 truncatedContent */
  fullContent?: string,
): Promise<VerificationResult> {
  // Layer 1 在全文搜寻（找原文出处），Layer 2 用截断文本（与 AI 提炼口径一致，节约 token）
  const layer1Content = fullContent || truncatedContent;
  const layer2Content = truncatedContent;
  // ─── Layer 1：原文溯源 ───

  const allResults: Map<number, VerificationItem[]> = new Map();
  const unmatched: ClaimWithContext[] = [];

  for (let i = 0; i < notes.length; i++) {
    const claims = extractVerifiableClaims(notes[i].content);
    const noteItems: VerificationItem[] = [];

    for (const claim of claims) {
      const match = locateAnchorInSource(claim.anchor, claim.type, layer1Content);

      if (match) {
        noteItems.push({
          claim: claim.claim,
          status: match.status,
          sourceText: match.sourceText,
          diffNote: match.diffNote,
        });
      } else {
        // Layer 1 未命中，进入 Layer 2 候选
        unmatched.push({ noteIndex: i, claim });
      }
    }

    allResults.set(i, noteItems);
  }

  // ─── Layer 2：语义比对（仅当有未匹配声明时） ───

  if (unmatched.length > 0) {
    console.info(`[核查] 正在比对 ${unmatched.length} 条未溯源声明`);

    try {
      const aiResults = await semanticCompare(layer2Content, unmatched, config);

      // 合并 AI 结果到对应笔记（AI 使用 0-based index）
      for (let i = 0; i < unmatched.length; i++) {
        const ctx = unmatched[i];
        const aiResult = aiResults.get(i);
        const items = allResults.get(ctx.noteIndex);
        if (!items) continue;

        if (aiResult) {
          // AI 验证：检查 sourceText 是否真实存在于原文
          if (aiResult.status === '需对比' && aiResult.sourceText) {
            if (
              !normalizeWS(layer2Content).includes(normalizeWS(aiResult.sourceText)) &&
              !(fullContent && normalizeWS(fullContent).includes(normalizeWS(aiResult.sourceText)))
            ) {
              // AI 编造引用 → 降级为 '超源'
              items.push({
                claim: ctx.claim.claim,
                status: '超源',
                reason: 'AI 引用的原文句子不存在',
              });
            } else {
              items.push({
                claim: ctx.claim.claim,
                status: '需对比',
                sourceText: aiResult.sourceText,
                diffNote: aiResult.diffNote,
              });
            }
          } else if (aiResult.status === '超源') {
            items.push({
              claim: ctx.claim.claim,
              status: '超源',
              reason: aiResult.reason || '原文中未找到相关内容',
            });
          } else {
            // AI 返回了意外的 status，降级为 '超源'
            items.push({
              claim: ctx.claim.claim,
              status: '超源',
              reason: 'AI 返回了无法识别的状态',
            });
          }
        } else {
          // ─── Layer 3：超源标记 ───
          // AI 未返回该条结果 → 标记为 '超源'
          items.push({
            claim: ctx.claim.claim,
            status: '超源',
            reason: '原文中未找到可对应的内容',
          });
        }
      }
    } catch (err: unknown) {
      // Layer 2 API 失败 → 所有未匹配的声明降级为 '超源'
      for (const ctx of unmatched) {
        const items = allResults.get(ctx.noteIndex);
        if (!items) continue;
        items.push({
          claim: ctx.claim.claim,
          status: '超源',
          reason: `语义比对失败: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // ─── 汇总 ───

  let totalTraced = 0,
    totalNeedsCompare = 0,
    totalOutOfScope = 0;

  for (let i = 0; i < notes.length; i++) {
    const items = allResults.get(i) || [];

    notes[i].verification = items;
    notes[i].tracedCount = items.filter((v) => v.status === '已溯源').length;
    notes[i].needsCompareCount = items.filter((v) => v.status === '需对比').length;
    notes[i].outOfScopeCount = items.filter((v) => v.status === '超源').length;

    totalTraced += notes[i].tracedCount;
    totalNeedsCompare += notes[i].needsCompareCount;
    totalOutOfScope += notes[i].outOfScopeCount;
  }

  return {
    notes,
    traced: totalTraced,
    needsCompare: totalNeedsCompare,
    outOfScope: totalOutOfScope,
  };
}

// ─── Layer 2：语义比对 ───

/**
 * 将所有 Layer 1 未匹配的声明一次性发给 AI
 * AI 在原文中查找对应句子，返回 '需对比'（附原文引用）或 '超源'
 */
async function semanticCompare(
  originalContent: string,
  unmatched: ClaimWithContext[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<
  Map<
    number,
    { status: '需对比' | '超源'; sourceText?: string; diffNote?: string; reason?: string }
  >
> {
  const resultMap = new Map<
    number,
    { status: '需对比' | '超源'; sourceText?: string; diffNote?: string; reason?: string }
  >();

  const systemPrompt = `你是原文比对助手。以下声明来自对原文的提炼总结，但在原文中未找到精确匹配。
请为每条声明找出原文中最相关的句子（必须直接引用原文原句）。
- 如果找到相关句子但与声明有出入（改写、推断、扩展），标注为"需对比"并说明差异
- 如果原文中完全找不到相关内容，标注为"超源"
仅返回 JSON 数组：[{"index":n,"status":"需对比|超源","sourceText":"原文原句引用","diffNote":"差异说明"}]
注意：index 为 0-based 序号，从 0 开始对应上面的声明列表序号。
如果标记为"超源"，sourceText 留空。`;

  const claimsList = unmatched
    .map((ctx, i) => `${i}. ${ctx.claim.claim}（锚点：${ctx.claim.anchor}）`)
    .join('\n');

  const userPrompt = `原文：${originalContent}\n\n未匹配声明列表：\n${claimsList}`;

  const response = await requestUrl({
    url: config.deepseekApiUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: config.maxTokens || 2000,
      temperature: 0,
    }),
    signal: config.signal,
    throw: false,
  });

  if (response.status !== 200) {
    throw new Error(`API 返回 ${response.status}`);
  }

  const rawOutput = response.json?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonArrayFromAI<{
    index: number;
    status: string;
    sourceText?: string;
    diffNote?: string;
    reason?: string;
  }>(rawOutput);

  if (parsed) {
    for (const item of parsed) {
      const status = item.status === '需对比' ? ('需对比' as const) : ('超源' as const);
      const idx = typeof item.index === 'number' ? item.index : Number(item.index);
      if (!isNaN(idx) && idx >= 0 && idx < unmatched.length) {
        resultMap.set(idx, {
          status,
          sourceText: item.sourceText,
          diffNote: item.diffNote,
          reason: item.reason,
        });
      }
    }
  } else {
    console.warn('[核查] AI 输出 JSON 解析失败，已跳过对比，原始内容（前500字）：', rawOutput.slice(0, 500));
  }

  return resultMap;
}
