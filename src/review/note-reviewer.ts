/**
 * 笔记复查模块（AI 双重保险）
 * 
 * 功能：
 * - 对提炼出的笔记进行 AI 价值评分
 * - 过滤低质量笔记（评分不达标丢弃）
 * - 按分数从高到低排序
 * - 评分信息完全不进入笔记，只在内部使用
 *
 * 评分体系：洞见价值 + 知识价值（各 1-5），总分 2-10
 *   2-3 差 → 丢弃  |  4-5 中 → 视策略  |  6-7 良 → 保留  |  8-10 优 → 保留
 */

import { requestUrl } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { AI_TEMPERATURE } from '../constants';
import { parseJsonArrayFromAI } from '../utils/json-parser';

export interface ReviewConfig {
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
  /** 最低总分阈值（2-10），低于此值丢弃 */
  minScore?: number;
}

export interface ReviewResult {
  index: number;        // 笔记序号（0-based）
  title?: string;       // 笔记标题（复查前的原始标题，供 UI 跨过滤匹配）
  insightScore: number;  // 洞见价值得分（1-5）
  knowledgeScore: number;// 知识价值得分（1-5）
  finalScore: number;   // 总分 = 洞见 + 知识（2-10）
  verdict: '保留' | '丢弃';
  reason: string;       // AI 给出的简短理由
}

/** 总分等级 */
export function scoreGrade(score: number): { label: string; color: string } {
  if (score >= 8) return { label: '优', color: 'var(--color-green)' };
  if (score >= 6) return { label: '良', color: 'var(--text-accent)' };
  if (score >= 4) return { label: '中', color: 'var(--color-orange)' };
  return { label: '差', color: 'var(--color-red)' };
}

/**
 * 对笔记进行 AI 复查
 * 
 * @param notes  第一次提炼输出的笔记草稿（格式 A，不变）
 * @param config API 配置
 * @returns      过滤+排序后的笔记（格式 A 不变），以及复查详情
 */
export async function reviewNotes(
  notes: AtomicNote[],
  config: ReviewConfig
): Promise<{ reviewedNotes: AtomicNote[]; reviewDetails: ReviewResult[]; success: boolean }> {
  if (notes.length === 0) {
    return { reviewedNotes: [], reviewDetails: [], success: true };
  }

  const minScore = config.minScore ?? 6;
  const prompt = buildReviewPrompt(notes, minScore);

  try {
    const response = await requestUrl({
      url: config.deepseekApiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是严格的笔记审查员。只对笔记评分，不修改笔记内容。输出严格符合 JSON 格式。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.maxTokens,
        temperature: AI_TEMPERATURE,
      }),
      signal: config.signal,
    });

    const aiContent = response.json?.choices?.[0]?.message?.content || '';
    const reviewDetails = parseReviewOutput(aiContent, notes.length, minScore);

    // 注入原始标题，供 UI 在复查过滤后仍能匹配到对应笔记
    for (const d of reviewDetails) {
      d.title = notes[d.index]?.title ?? '';
    }

    const kept = reviewDetails
      .filter(r => r.verdict === '保留')
      .sort((a, b) => b.finalScore - a.finalScore);

    const reviewedNotes = kept.map(r => notes[r.index]).filter(Boolean);

    return { reviewedNotes, reviewDetails, success: true };
  } catch (error) {
    console.error('[笔记复查] AI 调用失败，降级处理（返回原始笔记）：', error);
    return {
      reviewedNotes: [...notes],
      reviewDetails: notes.map((note, i) => ({
        index: i,
        title: note.title,
        insightScore: 3,
        knowledgeScore: 3,
        finalScore: 6,
        verdict: '保留' as const,
        reason: '复查失败，默认保留',
      })),
      success: false,
    };
  }
}

/**
 * 构建复查 Prompt
 */
function buildReviewPrompt(notes: AtomicNote[], minScore: number): string {
  let prompt = `你是严格的笔记审查员。对以下每条原子笔记，从两个维度评分（各 1-5 分）：

1. 洞见价值：是否包含独立见解、反直觉判断或有价值的观点？
2. 知识价值：是否提供可学习的新领域知识或方法论？

总分 = 洞见价值 + 知识价值（范围 2-10）

评分标准：
- 两个维度合计 8-10 分：优质笔记，独立见解 + 知识增量兼备
- 两个维度合计 6-7 分：良好笔记，至少一个维度有价值
- 两个维度合计 4-5 分：中规中矩，有一定信息量但深度不足
- 两个维度合计 2-3 分：差笔记，正确的废话、无独立见解、无知识增量

总分 < ${minScore} → verdict 填"丢弃"
总分 ≥ ${minScore} → verdict 填"保留"

请以 JSON 数组格式输出每条笔记的评分结果（不要输出笔记正文，不要修改笔记内容）：

输入笔记：\n\n`;

  notes.forEach((note, idx) => {
    prompt += `笔记${idx + 1}:\n`;
    prompt += `title: ${note.title}\n`;
    const preview = (note.content || '').slice(0, 500);
    prompt += `content: ${preview}${note.content.length > 500 ? '...' : ''}\n`;
    prompt += `tags: [${note.tags?.join(', ') || ''}]\n`;

    // 附加核查结果供复查参考（如有）
    if (note.verification && note.verification.length > 0) {
      const traced = note.tracedCount ?? 0;
      const needsCompare = note.needsCompareCount ?? 0;
      const outOfScope = note.outOfScopeCount ?? 0;

      if (outOfScope > 0) {
        const outOfScopeClaims = note.verification
          .filter(v => v.status === '超源')
          .map(v => `"${v.claim}"`)
          .join('; ');
        prompt += `verification: ${traced} 条已溯源，${needsCompare} 条需对比，${outOfScope} 条超源\n`;
        prompt += `verification_warning: 存在 ${outOfScope} 条超源声明：${outOfScopeClaims}\n`;
      } else if (needsCompare > 0) {
        prompt += `verification: ${traced} 条已溯源，${needsCompare} 条需对比\n`;
      }
    }

    prompt += '\n';
  });

  prompt += `输出格式（严格按此 JSON 格式，不要输出其他内容）：
\`\`\`json
[
  {"index": 1, "insight_score": X, "knowledge_score": X, "final_score": X, "verdict": "保留/丢弃", "reason": "简短理由"},
  ...
]
\`\`\``;

  return prompt;
}

/**
 * 解析 AI 复查输出（JSON）
 */
function parseReviewOutput(aiContent: string, expectedCount: number, minScore: number = 6): ReviewResult[] {
  const parsed = parseJsonArrayFromAI<{
    index: number;
    insight_score: number;
    knowledge_score: number;
    final_score: number;
    verdict: string;
    reason: string;
  }>(aiContent);

  // 解析完全失败 → 全部默认保留（总分 6 = 3+3）
  if (!parsed || parsed.length === 0) {
    return Array.from({ length: expectedCount }, (_, i) => ({
      index: i,
      insightScore: 3,
      knowledgeScore: 3,
      finalScore: 6,
      verdict: '保留' as const,
      reason: '解析失败，默认保留',
    })) as ReviewResult[];
  }

  // 构建 0-based index → 评测结果 映射
  const resultMap = new Map<number, ReviewResult>();
  const aiVerdictDisagreements: string[] = [];

  for (const r of parsed) {
    const idx = Math.max(0, (r.index ?? 1) - 1);
    if (idx >= expectedCount) continue;

    const insight = clampScore(r.insight_score ?? 3);
    const knowledge = clampScore(r.knowledge_score ?? 3);

    // 总分 = 洞见 + 知识（直接加法，范围 2-10）
    const final = r.final_score != null
      ? Math.round(r.final_score)
      : insight + knowledge;

    const verdict = final >= minScore ? '保留' as const : '丢弃' as const;

    // 检查 AI verdict 与重算值是否一致
    const aiVerdict = (r.verdict ?? '').trim();
    if (aiVerdict && aiVerdict !== verdict) {
      aiVerdictDisagreements.push(
        `笔记${idx + 1}: AI判"${aiVerdict}" → 重算"${verdict}"（总分=${final}，阈值=${minScore}）`
      );
    }

    resultMap.set(idx, {
      index: idx,
      insightScore: insight,
      knowledgeScore: knowledge,
      finalScore: final,
      verdict,
      reason: r.reason ?? '',
    });
  }

  // 补全 AI 遗漏的笔记（默认 3+3=6 保留）
  const results: ReviewResult[] = [];
  let missingCount = 0;
  for (let i = 0; i < expectedCount; i++) {
    if (resultMap.has(i)) {
      results.push(resultMap.get(i)!);
    } else {
      missingCount++;
      results.push({
        index: i,
        insightScore: 3,
        knowledgeScore: 3,
        finalScore: 6,
        verdict: '保留' as const,
        reason: 'AI 未评分，默认保留',
      });
    }
  }

  if (aiVerdictDisagreements.length > 0) {
    console.warn(`[复查] AI verdict 与重算不一致（${aiVerdictDisagreements.length} 条）：\n  ${aiVerdictDisagreements.join('\n  ')}`);
  }
  if (missingCount > 0) {
    console.warn(`[复查] AI 遗漏 ${missingCount} 条笔记评分，已补默认值`);
  }

  return results;
}

function clampScore(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}
