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
}

interface ReviewResult {
  index: number;        // 笔记序号（0-based）
  insightScore: number;  // 洞见价值得分（1-5）
  knowledgeScore: number;// 知识价值得分（1-5）
  dataAccuracyScore?: number; // 数据准确性得分（1-5，可选）
  finalScore: number;   // 最终得分 = (insight + knowledge [+ dataAccuracy]) / N
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

  const prompt = buildReviewPrompt(notes);

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
    const reviewDetails = parseReviewOutput(aiContent, notes.length);

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
function buildReviewPrompt(notes: AtomicNote[]): string {
  const hasDataCheck = notes.some(n => n.dataCheck && n.dataCheck.length > 0);

  let prompt = `你是严格的笔记审查员。对以下每条原子笔记，从${hasDataCheck ? '三' : '两'}个维度评分（1-5分）：

1. 洞见价值：是否包含独立见解/反直觉判断？
2. 知识价值：是否学到新的领域知识？
`;

  if (hasDataCheck) {
    prompt += `3. 数据准确性：笔记中的数字、日期、统计等数据是否可信？
`;
  }

  prompt += `
评分标准：
5分：同时具备洞见价值和知识价值${hasDataCheck ? '，数据完全可信' : ''}
4分：具备其中一项，且质量很高${hasDataCheck ? '，数据基本可信' : ''}
3分：具备其中一项，但较浅${hasDataCheck ? '，数据有待验证' : ''}
2分：正确的废话，无独立见解，无知识增量${hasDataCheck ? '，数据存在明显偏差' : ''}
1分：垃圾笔记（重复/无关/无信息量）${hasDataCheck ? '，数据严重失实' : ''}

`;

  if (hasDataCheck) {
    prompt += `计算最终得分：final_score = (insight_score + knowledge_score + data_accuracy_score) / 3

`;
  } else {
    prompt += `计算最终得分：final_score = (insight_score + knowledge_score) / 2

`;
  }

  prompt += `最终得分 < 3 的笔记 verdict 填"丢弃"；最终得分 ≥ 3 的笔记 verdict 填"保留"。

请以 JSON 数组格式输出每条笔记的评分结果（不要输出笔记正文，不要修改笔记内容）：

输入笔记：\n\n`;

  notes.forEach((note, idx) => {
    prompt += `笔记${idx + 1}:\n`;
    prompt += `title: ${note.title}\n`;
    // 只取前 150 字，避免超出 token 限制
    const preview = (note.content || '').slice(0, 150);
    prompt += `content: ${preview}${note.content.length > 150 ? '...' : ''}\n`;
    prompt += `tags: [${note.tags?.join(', ') || ''}]\n`;

    // 附加数据核查结果供复查参考
    if (hasDataCheck && note.dataCheck && note.dataCheck.length > 0) {
      const deviations = note.dataCheck.filter(d => d.status === '偏差');
      if (deviations.length > 0) {
        prompt += `data_check: 发现 ${deviations.length} 处数据偏差：${deviations.map(d => `"${d.claim}"`).join('; ')}\n`;
      } else {
        prompt += `data_check: 数据核查全部一致\n`;
      }
    }

    prompt += '\n';
  });

  const jsonFields = hasDataCheck
    ? `"index": 1, "insight_score": X, "knowledge_score": X, "data_accuracy_score": X, "final_score": X, "verdict": "保留/丢弃", "reason": "简短理由"`
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
function parseReviewOutput(aiContent: string, expectedCount: number): ReviewResult[] {
  const parsed = parseJsonArrayFromAI<{
    index: number;
    insight_score: number;
    knowledge_score: number;
    data_accuracy_score?: number;
    final_score: number;
    verdict: string;
    reason: string;
  }>(aiContent);

  if (parsed && parsed.length > 0) {
    return parsed.map(r => {
      const insight = clampScore(r.insight_score ?? 3);
      const knowledge = clampScore(r.knowledge_score ?? 3);
      const dataAccuracy = r.data_accuracy_score != null ? clampScore(r.data_accuracy_score) : undefined;
      const final = r.final_score ?? (dataAccuracy != null
        ? roundScore((insight + knowledge + dataAccuracy) / 3)
        : roundScore((insight + knowledge) / 2));
      return {
        index: Math.max(0, (r.index ?? 1) - 1), // 转为 0-based
        insightScore: insight,
        knowledgeScore: knowledge,
        dataAccuracyScore: dataAccuracy,
        finalScore: final,
        verdict: final >= 3 ? '保留' as const : '丢弃' as const,
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
