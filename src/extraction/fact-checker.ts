/**
 * 事实核实模块
 * 从 main.js 中反混淆而来：_verifyFacts, ke（事实提取函数）
 */

import { requestUrl, Notice } from 'obsidian';
import { AtomicNote, VerificationItem, DataCheckItem, DataCheckStatus } from '../utils/notes-standards';
import { extractDataPoints, internalDataCheck } from '../utils/data-extractor';
import { parseJsonArrayFromAI } from '../utils/json-parser';
import {
  MAX_DATA_POINTS_PER_CHECK,
  MAX_FACTS_PER_CHECK,
  ORIGINAL_TEXT_CHUNK_SIZE,
} from '../constants';

interface FactItem {
  text: string;
  searchUrl: string;
  /** 事实在原文中的大致位置（字符索引） */
  position?: number;
}

interface FactCheckResult {
  notes: AtomicNote[];
  verified: number;
  doubtful: number;
  unverified: number;
  error?: string;
}

interface FactWithContext {
  noteIndex: number;
  factIndex: number;
  fact: FactItem;
}

/** Extract key facts from note content */
function extractFacts(content: string): FactItem[] {
  const facts: FactItem[] = [];
  const sentences = content.split(/[。！？\n\.!\?]+/);

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence || sentence.length < 5) continue;

    const hasNumbers = /[0-9０-９]+/.test(sentence);
    const hasPercentage = /\d+%|百分之/.test(sentence);
    const hasDate = /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/.test(sentence) ||
                    /\d{1,2}月\d{1,2}日/.test(sentence);
    const hasEntity = /[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+/.test(sentence) ||
                      /[\u4e00-\u9fff]{2,4}(?:公司|机构|大学|学院|集团|基金|协会|部门|委员会|平台|系统|框架|协议|标准)/.test(sentence);

    if (hasNumbers || hasPercentage || hasDate || hasEntity) {
      facts.push({
        text: sentence,
        searchUrl: 'https://www.google.com/search?q=' + encodeURIComponent(sentence.slice(0, 200)),
      });
    }
  }

  return facts;
}

/**
 * 在原文中查找事实声明的位置
 * 用于判断事实属于原文的哪个段落
 */
function locateFactPosition(factText: string, originalContent: string): number {
  // 尝试精确匹配
  const exactIndex = originalContent.indexOf(factText);
  if (exactIndex >= 0) return exactIndex;

  // 尝试匹配关键片段（前 50 字符）
  const keyFragment = factText.slice(0, 50);
  const fragmentIndex = originalContent.indexOf(keyFragment);
  if (fragmentIndex >= 0) return fragmentIndex;

  // 无法定位，返回 -1
  return -1;
}

/**
 * 按位置分组事实，用于分段核查
 */
function groupFactsByPosition(
  allFacts: FactWithContext[],
  originalContent: string
): { start: number; end: number; facts: FactWithContext[] }[] {
  const groups: { start: number; end: number; facts: FactWithContext[] }[] = [];
  const contentLength = originalContent.length;

  // 为每个事实定位其在原文中的位置
  for (const fact of allFacts) {
    fact.fact.position = locateFactPosition(fact.fact.text, originalContent);
  }

  // 按位置排序
  const sortedFacts = [...allFacts].sort((a, b) => {
    const posA = a.fact.position ?? contentLength;
    const posB = b.fact.position ?? contentLength;
    return posA - posB;
  });

  // 分组策略：
  // - 位置已知的事实：按原文段落分组（每 4000 字符一段）
  // - 位置未知的事实：放入最后一组（可能来自被截断部分）
  let currentGroup: FactWithContext[] = [];
  let currentStart = 0;
  let currentEnd = ORIGINAL_TEXT_CHUNK_SIZE;

  for (const fact of sortedFacts) {
    const pos = fact.fact.position;

    if (pos >= 0 && pos < currentEnd) {
      // 事实在当前段落范围内
      currentGroup.push(fact);
    } else if (pos >= currentEnd) {
      // 事实超出当前段落，需要新开一组
      if (currentGroup.length > 0) {
        groups.push({ start: currentStart, end: currentEnd, facts: currentGroup });
      }
      // 计算新段落范围
      currentStart = Math.floor(pos / ORIGINAL_TEXT_CHUNK_SIZE) * ORIGINAL_TEXT_CHUNK_SIZE;
      currentEnd = Math.min(currentStart + ORIGINAL_TEXT_CHUNK_SIZE, contentLength);
      currentGroup = [fact];
    } else {
      // 位置未知（pos < 0），放入特殊组
      currentGroup.push(fact);
    }
  }

  // 保存最后一组
  if (currentGroup.length > 0) {
    groups.push({ start: currentStart, end: currentEnd, facts: currentGroup });
  }

  return groups;
}

/**
 * 执行单次 AI 核查
 */
async function performSingleCheck(
  originalChunk: string,
  factsList: string,
  isTruncated: boolean,
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    signal?: AbortSignal;
  }
): Promise<VerificationItem[]> {
  let systemPrompt = '你是严格的事实核查员。请逐条判断以下声明是否能在原文中找到直接依据。规则："有据"：声明与原文完全一致或可直接推导；"存疑"：部分相关但存在夸大、跳跃或无法验证；"无据"：无法找到任何支持。仅返回 JSON 数组：[{"index":n,"status":"有据|存疑|无据","reason":"原文第3段明确提到…"}]';

  if (isTruncated) {
    systemPrompt += '\n\n重要提示：原文已被截断，仅显示部分内容。如果声明涉及的内容不在显示范围内，请标记为"无据"并在 reason 中说明"原文被截断，无法验证"。';
  }

  const userPrompt = `原文：${originalChunk}\n\n声明列表：\n${factsList}`;

  const response = await requestUrl({
    url: config.deepseekApiUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0,
    }),
    signal: config.signal,
  });

  if (response.status !== 200) throw new Error(`API ${response.status}`);

  const data = response.json;
  const rawOutput = data.choices?.[0]?.message?.content || '';

  // Parse JSON from AI output
  const verifications = parseJsonArrayFromAI<VerificationItem>(rawOutput);
  return verifications || [];
}

/** Verify facts against original text using AI */
export async function verifyFacts(
  originalContent: string,
  notes: AtomicNote[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  }
): Promise<FactCheckResult> {
  // Phase 1: Extract facts from each note
  const factGroups: { index: number; facts: FactItem[] }[] = [];
  for (let i = 0; i < notes.length; i++) {
    const facts = extractFacts(notes[i].content);
    if (facts.length > 0) {
      factGroups.push({ index: i, facts });
    }
  }

  if (factGroups.length === 0) {
    return { notes, verified: 0, doubtful: 0, unverified: 0 };
  }

  // Phase 2: Build flat list of all facts
  const allFacts: FactWithContext[] = factGroups.flatMap(g =>
    g.facts.map((f, fi) => ({
      noteIndex: g.index,
      factIndex: fi,
      fact: f,
    }))
  );

  const contentLength = originalContent.length;
  const needsChunking = contentLength > ORIGINAL_TEXT_CHUNK_SIZE;

  try {
    let allVerifications: VerificationItem[] = [];

    if (!needsChunking || allFacts.length <= MAX_FACTS_PER_CHECK) {
      // 简单场景：原文不长或事实数量少，单次核查
      const factsList = allFacts.map((f, i) => `${i}. [${f.fact.text}]`).join('\n');
      const isTruncated = contentLength > ORIGINAL_TEXT_CHUNK_SIZE;
      const originalChunk = isTruncated
        ? originalContent.slice(0, ORIGINAL_TEXT_CHUNK_SIZE) + '\n\n[原文已被截断，仅显示前 4000 字符]'
        : originalContent;

      const verifications = await performSingleCheck(originalChunk, factsList, isTruncated, config);

      // Map AI results back to notes
      for (const v of verifications) {
        const fact = allFacts[v.index];
        if (fact) {
          allVerifications.push({ ...v, noteIndex: fact.noteIndex });
        }
      }
    } else {
      // 复杂场景：原文很长且事实数量多，分段核查
      const groups = groupFactsByPosition(allFacts, originalContent);
      const totalGroups = groups.length;

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];

        // 进度提示
        if (totalGroups > 1) {
          new Notice(`正在核查第 ${gIdx + 1}/${totalGroups} 段原文（共 ${group.facts.length} 条声明）...`);
        }

        // 提取该段落对应的原文片段
        const chunk = originalContent.slice(group.start, group.end);
        const isTruncated = group.end < contentLength;
        const chunkWithHint = isTruncated
          ? chunk + '\n\n[原文片段，位置：' + group.start + '-' + group.end + '字符]'
          : chunk;

        // 构建该组事实的列表（使用原始索引）
        const factsList = group.facts
          .map((f, i) => `${i}. [${f.fact.text}]`)
          .join('\n');

        const verifications = await performSingleCheck(chunkWithHint, factsList, isTruncated, config);

        // Map results back using original fact indices
        for (const v of verifications) {
          const fact = group.facts[v.index];
          if (fact) {
            // 使用 allFacts 中的原始索引
            const originalIndex = allFacts.findIndex(
              f => f.noteIndex === fact.noteIndex && f.factIndex === fact.factIndex
            );
            allVerifications.push({
              ...v,
              index: originalIndex >= 0 ? originalIndex : v.index,
              noteIndex: fact.noteIndex,
            });
          }
        }
      }
    }

    // Phase 4: Count per note
    let verifiedNotes = 0, doubtfulNotes = 0, unverifiedNotes = 0;

    for (let i = 0; i < notes.length; i++) {
      const noteResults = allVerifications.filter(r => r.noteIndex === i);
      const verified = noteResults.filter(r => r.status === '有据');
      const doubtful = noteResults.filter(r => r.status === '存疑');
      const unverified = noteResults.filter(r => r.status === '无据');

      notes[i].verification = noteResults;
      notes[i].verifiedCount = verified.length;
      notes[i].doubtfulCount = doubtful.length;
      notes[i].unverifiedCount = unverified.length;

      // Per-note overall verdict: "无据" > "存疑" > "有据"
      if (noteResults.length === 0) continue;
      if (unverified.length > 0) {
        unverifiedNotes++;
      } else if (doubtful.length > 0) {
        doubtfulNotes++;
      } else {
        verifiedNotes++;
      }
    }

    return {
      notes,
      verified: verifiedNotes,
      doubtful: doubtfulNotes,
      unverified: unverifiedNotes,
    };
  } catch (err: unknown) {
    // API failure - reset verification data
    for (let i = 0; i < notes.length; i++) {
      notes[i].verification = [];
      notes[i].verifiedCount = 0;
      notes[i].doubtfulCount = 0;
      notes[i].unverifiedCount = 0;
    }
    return {
      notes,
      verified: 0,
      doubtful: 0,
      unverified: 0,
      error: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 数据核查模块 ───

interface DataPointWithContext {
  noteIndex: number;
  pointIndex: number;
  claim: string;
  /** 提取到的原始数值字符串 */
  rawNumber: string;
}

export interface DataCheckResult {
  notes: AtomicNote[];
  consistent: number;
  deviation: number;
  unverifiable: number;
  error?: string;
}

/**
 * 外部验证：调用 AI 验证无法在原文中比对的数据点
 */
async function externalDataVerify(
  dataPoints: DataPointWithContext[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    signal?: AbortSignal;
  }
): Promise<Map<number, { status: DataCheckStatus; reason?: string }>> {
  const resultMap = new Map<number, { status: DataCheckStatus; reason?: string }>();

  if (dataPoints.length === 0) return resultMap;

  const systemPrompt = `你是严格的数据核查员。请根据你所掌握的公开知识，逐条判断以下数据声明是否准确。

判断标准：
- "一致"：数据与公开事实完全吻合，或是广泛认可的常识
- "偏差"：数据与公开事实有出入（数值不同、时间错误等）
- "无法验证"：你无法确认该数据的准确性（可能过于具体或超出你的知识范围）

仅返回 JSON 数组：[{"index":n,"status":"一致|偏差|无法验证","reason":"简短说明"}]`;

  const factsList = dataPoints.map((dp, i) => `${i}. ${dp.claim}（数据点：${dp.rawNumber}）`).join('\n');

  try {
    const response = await requestUrl({
      url: config.deepseekApiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: factsList },
        ],
        max_tokens: 2000,
        temperature: 0,
      }),
      signal: config.signal,
    });

    if (response.status !== 200) return resultMap;

    const rawOutput = response.json?.choices?.[0]?.message?.content || '';
    const verifications = parseJsonArrayFromAI<{
      index: number;
      status: string;
      reason?: string;
    }>(rawOutput);

    if (verifications) {
      for (const v of verifications) {
        const status = v.status === '一致' || v.status === '偏差' || v.status === '无法验证'
          ? v.status as DataCheckStatus
          : '无法验证' as DataCheckStatus;
        resultMap.set(v.index, { status, reason: v.reason });
      }
    }
  } catch (err) {
    console.warn('[数据核查] 外部验证失败：', err);
  }

  return resultMap;
}

/**
 * 数据核查：检查笔记中的数字/百分比/日期等数据是否准确
 *
 * 流程：
 * 1. 从每条笔记中提取数据点
 * 2. 内部验证：与原文比对
 * 3. 外部验证：无法内部比对的数据点，调用 AI 验证公开事实
 * 4. 结果附加到笔记上
 */
export async function verifyData(
  originalContent: string,
  notes: AtomicNote[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    signal?: AbortSignal;
  }
): Promise<DataCheckResult> {
  try {
    // Step 1: 从所有笔记中提取数据点
    const allDataPoints: DataPointWithContext[] = [];

    for (let i = 0; i < notes.length; i++) {
      const points = extractDataPoints(notes[i].content);
      for (let j = 0; j < points.length; j++) {
        allDataPoints.push({
          noteIndex: i,
          pointIndex: j,
          claim: points[j].claim,
          rawNumber: points[j].rawNumber,
        });
      }
    }

    if (allDataPoints.length === 0) {
      return { notes, consistent: 0, deviation: 0, unverifiable: 0 };
    }

    // Step 2: 内部验证（与原文比对）
    const internallyVerified = new Set<number>(); // allDataPoints 的索引
    const internalResults = new Map<number, { status: DataCheckStatus; original?: string }>();

    for (let i = 0; i < allDataPoints.length; i++) {
      const result = internalDataCheck(allDataPoints[i].rawNumber, originalContent);
      if (result) {
        internalResults.set(i, result);
        internallyVerified.add(i);
      }
    }

    // Step 3: 收集需要外部验证的数据点
    const needExternal: { globalIndex: number; dp: DataPointWithContext }[] = [];
    for (let i = 0; i < allDataPoints.length; i++) {
      if (!internallyVerified.has(i)) {
        needExternal.push({ globalIndex: i, dp: allDataPoints[i] });
      }
    }

    // Step 4: 外部验证（显示进度提示）
    let externalResultMap = new Map<number, { status: DataCheckStatus; reason?: string }>();
    if (needExternal.length > 0) {
      new Notice(`正在验证 ${needExternal.length} 个无法内部核查的数据点...`);

      const externalPoints = needExternal.map(e => e.dp);
      const externalResults = await externalDataVerify(externalPoints, config);

      // 映射回全局索引
      for (const [extIdx, result] of externalResults) {
        const globalIdx = needExternal[extIdx]?.globalIndex;
        if (globalIdx !== undefined) {
          externalResultMap.set(globalIdx, result);
        }
      }
    }

    // Step 5: 合并结果，附加到笔记上
    let totalConsistent = 0, totalDeviation = 0, totalUnverifiable = 0;

    for (let i = 0; i < notes.length; i++) {
      const noteChecks: DataCheckItem[] = [];

      for (let j = 0; j < allDataPoints.length; j++) {
        if (allDataPoints[j].noteIndex !== i) continue;

        const dp = allDataPoints[j];
        let status: DataCheckStatus;
        let original: string | undefined;
        let reason: string | undefined;

        if (internalResults.has(j)) {
          const r = internalResults.get(j)!;
          status = r.status;
          original = r.original;
          reason = status === '一致' ? '原文中精确匹配' : `原文数据为 ${r.original}，笔记中为 ${dp.rawNumber}`;
        } else if (externalResultMap.has(j)) {
          const r = externalResultMap.get(j)!;
          status = r.status;
          reason = r.reason;
        } else {
          status = '无法验证';
          reason = '外部验证未返回结果';
        }

        noteChecks.push({
          claim: dp.claim,
          original,
          status,
          reason,
        });

        if (status === '一致') totalConsistent++;
        else if (status === '偏差') totalDeviation++;
        else totalUnverifiable++;
      }

      notes[i].dataCheck = noteChecks;
      notes[i].dataConsistentCount = noteChecks.filter(c => c.status === '一致').length;
      notes[i].dataDeviationCount = noteChecks.filter(c => c.status === '偏差').length;
      notes[i].dataUnverifiableCount = noteChecks.filter(c => c.status === '无法验证').length;
    }

    return {
      notes,
      consistent: totalConsistent,
      deviation: totalDeviation,
      unverifiable: totalUnverifiable,
    };
  } catch (err: unknown) {
    console.warn('[数据核查] verifyData 发生错误:', err);
    return {
      notes,
      consistent: 0,
      deviation: 0,
      unverifiable: 0,
      error: `数据核查失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
