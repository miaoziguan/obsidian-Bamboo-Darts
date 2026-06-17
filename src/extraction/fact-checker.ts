/**
 * 事实核实模块
 * 从 main.js 中反混淆而来：_verifyFacts, ke（事实提取函数）
 */

import { requestUrl } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';

interface FactItem {
  text: string;
  searchUrl: string;
}

interface VerificationItem {
  index: number;
  status: '有据' | '存疑' | '无据';
  reason?: string;
  noteIndex?: number;
}

interface FactCheckResult {
  notes: AtomicNote[];
  verified: number;
  doubtful: number;
  unverified: number;
  error?: string;
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

/** Verify facts against original text using AI */
export async function verifyFacts(
  originalContent: string,
  notes: AtomicNote[],
  config: {
    deepseekApiKey: string;
    deepseekApiUrl: string;
    model?: string;
    maxTokens?: number;
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
  const allFacts = factGroups.flatMap(g =>
    g.facts.map((f, fi) => ({
      noteIndex: g.index,
      factIndex: fi,
      fact: f,
    }))
  );

  const factsList = allFacts.map((f, i) => `${i}. [${f.fact.text}]`).join('\n');

  // Phase 3: Send to AI for verification
  const systemPrompt = '你是严格的事实核查员。请逐条判断以下声明是否能在原文中找到直接依据。规则："有据"：声明与原文完全一致或可直接推导；"存疑"：部分相关但存在夸大、跳跃或无法验证；"无据"：无法找到任何支持。仅返回 JSON 数组：[{"index":n,"status":"有据|存疑|无据","reason":"原文第3段明确提到…"}]';

  const userPrompt = `原文：${originalContent.slice(0, 4000)}\n\n声明列表：\n${factsList}`;

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
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0,
      }),
    });

    if (response.status !== 200) throw new Error(`API ${response.status}`);

    const data = response.json;
    const rawOutput = data.choices?.[0]?.message?.content || '';

    try {
      // Parse JSON from AI output
      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      const verifications: VerificationItem[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      // Map AI results back to notes
      const mappedResults: VerificationItem[] = [];
      for (const v of verifications) {
        const fact = allFacts[v.index];
        if (fact) {
          mappedResults.push({ ...v, noteIndex: fact.noteIndex });
        }
      }

      // Count per note (each note gets one overall verdict based on its facts)
      let verifiedNotes = 0, doubtfulNotes = 0, unverifiedNotes = 0;

      for (let i = 0; i < notes.length; i++) {
        const noteResults = mappedResults.filter(r => r.noteIndex === i);
        const verified = noteResults.filter(r => r.status === '有据');
        const doubtful = noteResults.filter(r => r.status === '存疑');
        const unverified = noteResults.filter(r => r.status === '无据');

        (notes[i] as any).verification = noteResults;
        (notes[i] as any).verifiedCount = verified.length;
        (notes[i] as any).doubtfulCount = doubtful.length;
        (notes[i] as any).unverifiedCount = unverified.length;

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
    } catch {
      // Parse failure - reset verification data
      for (let i = 0; i < notes.length; i++) {
        (notes[i] as any).verification = [];
        (notes[i] as any).verifiedCount = 0;
        (notes[i] as any).doubtfulCount = 0;
        (notes[i] as any).unverifiedCount = 0;
      }
      return { notes, verified: 0, doubtful: 0, unverified: 0, error: '解析失败' };
    }
  } catch (err: unknown) {
    // API failure - reset verification data
    for (let i = 0; i < notes.length; i++) {
      (notes[i] as any).verification = [];
      (notes[i] as any).verifiedCount = 0;
      (notes[i] as any).doubtfulCount = 0;
      (notes[i] as any).unverifiedCount = 0;
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
