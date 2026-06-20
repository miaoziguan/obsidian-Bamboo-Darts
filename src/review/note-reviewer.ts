/**
 * 笔记复查模块（AI 双重保险）
 * 
 * 功能：
 * - 对提炼出的笔记进行 AI 价值评分
 * - 过滤低质量笔记（评分 < 3 丢弃）
 * - 按分数从高到低排序
 * - 评分信息完全不进入笔记，只在内部使用
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
  minScore?: number;
}

interface ReviewResult {
  index: number;        // 笔记序号（0-based）
  insightScore: number;  // 洞见价值得分（1-5）
  knowledgeScore: number;// 知识价值得分（1-5）
  sourceTraceScore?: number; // 溯源可信度得分（1-5，可选）
  finalScore: number;   // 最终得分 = (insight + knowledge [+ sourceTrace]) / N
  verdict: '保留' | '丢弃';
  reason: string;       // AI 给出的简短理由
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

  const minScore = config.minScore ?? 3;
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

    const kept = reviewDetails
      .filter(r => r.verdict === '保留')
      .sort((a, b) => b.finalScore - a.finalScore);

    const reviewedNotes = kept.map(r => notes[r.index]).filter(Boolean);

    return { reviewedNotes, reviewDetails, success: true };
  } catch (error) {
    console.error('[笔记复查] AI 调用失败，降级处理（返回原始笔记）：', error);
    return {
      reviewedNotes: [...notes],
      reviewDetails: notes.map((_, i) => ({
        index: i,
        insightScore: 3,
        knowledgeScore: 3,
        finalScore: 3,
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
  const hasVerification = notes.some(n => n.verification && n.verification.length > 0);

  let prompt = `你是严格的笔记审查员。对以下每条原子笔记，从${hasVerification ? '三' : '两'}个维度评分（1-5分）：

1. 洞见价值：是否包含独立见解/反直觉判断？
2. 知识价值：是否学到新的领域知识？
`;

  if (hasVerification) {
    prompt += `3. 溯源可信度：笔记中的声明是否能在原文中找到依据？
`;
  }

  prompt += `
评分标准：
5分：同时具备洞见价值和知识价值${hasVerification ? '，声明全部可溯源' : ''}
4分：具备其中一项，且质量很高${hasVerification ? '，声明基本可溯源' : ''}
3分：具备其中一项，但较浅${hasVerification ? '，部分声明需对比确认' : ''}
2分：正确的废话，无独立见解，无知识增量${hasVerification ? '，存在超源声明' : ''}
1分：垃圾笔记（重复/无关/无信息量）${hasVerification ? '，大量超源声明' : ''}

`;

  if (hasVerification) {
    prompt += `计算最终得分：final_score = (insight_score + knowledge_score + source_trace_score) / 3

`;
  } else {
    prompt += `计算最终得分：final_score = (insight_score + knowledge_score) / 2

`;
  }

  prompt += `最终得分 < ${minScore} 的笔记 verdict 填"丢弃"；最终得分 ≥ ${minScore} 的笔记 verdict 填"保留"。

请以 JSON 数组格式输出每条笔记的评分结果（不要输出笔记正文，不要修改笔记内容）：

输入笔记：\n\n`;

  notes.forEach((note, idx) => {
    prompt += `笔记${idx + 1}:\n`;
    prompt += `title: ${note.title}\n`;
    // 只取前 150 字，避免超出 token 限制
    const preview = (note.content || '').slice(0, 150);
    prompt += `content: ${preview}${note.content.length > 150 ? '...' : ''}\n`;
    prompt += `tags: [${note.tags?.join(', ') || ''}]\n`;

    // 附加核查结果供复查参考
    if (hasVerification && note.verification && note.verification.length > 0) {
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
      } else {
        prompt += `verification: 全部已溯源\n`;
      }
    }

    prompt += '\n';
  });

  const jsonFields = hasVerification
    ? `"index": 1, "insight_score": X, "knowledge_score": X, "source_trace_score": X, "final_score": X, "verdict": "保留/丢弃", "reason": "简短理由"`
    : `"index": 1, "insight_score": X, "knowledge_score": X, "final_score": X, "verdict": "保留/丢弃", "reason": "简短理由"`;

  prompt += `输出格式（严格按此 JSON 格式，不要输出其他内容）：
\`\`\`json
[
  {${jsonFields}},
  ...
]
\`\`\``;

  return prompt;
}

/**
 * 解析 AI 复查输出（JSON）
 */
function parseReviewOutput(aiContent: string, expectedCount: number, minScore: number = 3): ReviewResult[] {
  const parsed = parseJsonArrayFromAI<{
    index: number;
    insight_score: number;
    knowledge_score: number;
    source_trace_score?: number;
    final_score: number;
    verdict: string;
    reason: string;
  }>(aiContent);

  if (parsed && parsed.length > 0) {
    return parsed.map(r => {
      const insight = clampScore(r.insight_score ?? 3);
      const knowledge = clampScore(r.knowledge_score ?? 3);
      const sourceTrace = r.source_trace_score != null ? clampScore(r.source_trace_score) : undefined;
      const final = r.final_score ?? (sourceTrace != null
        ? roundScore((insight + knowledge + sourceTrace) / 3)
        : roundScore((insight + knowledge) / 2));
      return {
        index: Math.max(0, (r.index ?? 1) - 1), // 转为 0-based
        insightScore: insight,
        knowledgeScore: knowledge,
        sourceTraceScore: sourceTrace,
        finalScore: final,
        verdict: final >= minScore ? '保留' as const : '丢弃' as const,
        reason: r.reason ?? '',
      } as ReviewResult;
    });
  }

  // 解析失败，返回默认结果（全部保留）
  return Array.from({ length: expectedCount }, (_, i) => ({
    index: i,
    insightScore: 3,
    knowledgeScore: 3,
    finalScore: 3,
    verdict: '保留' as const,
    reason: '解析失败，默认保留',
  })) as ReviewResult[];
}

function clampScore(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

function roundScore(n: number): number {
  return Math.round(n * 10) / 10;
}
