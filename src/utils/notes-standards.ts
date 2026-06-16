/**
 * 原子笔记标准（从 skill references/notes-standards.md 提炼）
 * 用于校验 AI 输出的原子笔记是否符合规范
 */

import { MIN_NOTE_CONTENT_LENGTH } from '../constants';

export interface AtomicNote {
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  createdAt: string;
}

/**
 * 校验原子笔记是否符合标准
 * @returns 校验结果 { valid: boolean, issues: string[] }
 */
export function validateAtomicNote(note: AtomicNote): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // ★ 标题检查：AI 模式下来自 AI 的笔记不应有空标题
  // 空标题是硬伤（子弹笔记必须有标题）
  if (!note.title || note.title.trim() === '') {
    issues.push('缺少标题 — AI 未生成标题，已跳过此条笔记');
  }

  // 标准 1: 一条笔记只说一件事（软建议，不阻止保存）
  const headingMatches = note.content.match(/^##\s+/gm);
  if (headingMatches && headingMatches.length > 1) {
    issues.push('可能包含多个主题，建议拆分');
  }

  // 标准 3: 有信息密度（唯一的硬性要求，内容过短无意义）
  if (note.content.length < MIN_NOTE_CONTENT_LENGTH) {
    issues.push('内容过短，可能缺乏信息密度');
  }
  // 标准 6: 来源（不再要求——用户选择不输出来源信息）
  // 已移除来源检查

  // 只有内容过短是硬性失败，标题为空也是硬性失败
  const hasHardIssue = note.content.length < MIN_NOTE_CONTENT_LENGTH
    || (!note.title || note.title.trim() === '');

  return {
    valid: !hasHardIssue,
    issues,
  };
}

/**
 * Bug #10 修复：解析标签，兼容多种 AI 输出格式
 * 支持：tag1, tag2 / [tag1], [tag2] / [tag1, tag2] / "tag1", "tag2"
 */
function parseTags(raw: string): string[] {
  return raw
    .replace(/^\[|\]$/g, '')                // 去掉外层方括号
    .split(/[,，]/)                          // 按逗号分割
    .map(t => t.trim().replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '')) // 去掉 [] 和引号
    .filter(Boolean);
}

/** 去掉字符串外层的引号 */
function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 从 AI 输出文本中解析出原子笔记
 *
 * 支持的格式（按优先级）：
 * 1. YAML frontmatter 格式（标准）:
 *    ---
 *    title: xxx
 *    source: xxx
 *    tags: x, y
 *    ---
 *    content
 *
 * 2. 编号列表格式（AI 常用偏离）:
 *    1. **标题** 或 1. 标题
 *    内容...
 *
 * 3. Markdown 标题格式:
 *    ### 标题
 *    内容...
 *
 * 4. 兜底：从内容首行提取短句作为标题
 *
 * @param shouldEnsureTitles - 是否用代码提取标题（本地/混合模式用，纯AI模式应为 false）
 */
export function parseAINoteOutput(text: string, shouldEnsureTitles = true): AtomicNote[] {
  const notes: AtomicNote[] = [];

  // 预处理：清理 Markdown 代码块包裹（AI 常把结构化输出包在 ``` 中）
  let cleaned = stripCodeBlocks(text.trim());

  // 清理 "无符合标准的原子笔记" 等拒绝响应
  if (/无符合标准的原子笔记|无法提炼|没有符合标准/.test(cleaned)) {
    return [];
  }

  // 尝试标准 YAML frontmatter 格式解析
  const standardNotes = tryParseFrontmatterFormat(cleaned);
  if (standardNotes.length > 0) {
    return shouldEnsureTitles ? ensureTitles(standardNotes) : standardNotes;
  }

  // 如果去掉代码块后解析失败，尝试用原始文本再试一次（可能不是代码块问题）
  if (cleaned !== text.trim()) {
    const rawNotes = tryParseFrontmatterFormat(text.trim());
    if (rawNotes.length > 0) {
      return shouldEnsureTitles ? ensureTitles(rawNotes) : rawNotes;
    }
  }

  // 尝试编号列表 / Markdown 标题格式解析
  const fallbackNotes = tryParseListFormat(cleaned);
  return shouldEnsureTitles ? ensureTitles(fallbackNotes) : fallbackNotes;
}

/**
 * 去掉 AI 输出中的 Markdown 代码块包裹
 * 处理 ```yaml ... ``` 和 ``` ... ``` 两种常见格式
 */
function stripCodeBlocks(text: string): string {
  // 匹配 ```yaml 或 ``` 等开头的代码块
  const codeBlockPattern = /^\s*```(?:yaml|yml|json|markdown|md)?\s*\n([\s\S]*?)\n```\s*$/;
  const match = text.match(codeBlockPattern);
  if (match) {
    return match[1].trim();
  }
  return text;
}

/**
 * 解析 YAML frontmatter 格式（标准格式）
 * 
 * 正确处理 AI 输出的多笔记格式：
 *   ---
 *   title: xxx
 *   source: xxx
 *   tags: xxx
 *   ---
 *   正文内容
 *
 * 下一条笔记的 --- 分隔符...
 */
function tryParseFrontmatterFormat(text: string): AtomicNote[] {
  const notes: AtomicNote[] = [];

  // 用正则匹配完整的笔记块：可选的开头 --- + frontmatter + 关闭 --- + 正文
  // 支持连续的多条笔记
  const notePattern = /(?:^|\n)---\n([\s\S]*?)---\n([\s\S]*?)(?=(?:\n---\s*$)|(?:\n---\n)|$)/g;

  let match: RegExpExecArray | null;
  while ((match = notePattern.exec(text)) !== null) {
    const fmBlock = match[1];   // frontmatter 内容（title/source/tags 行）
    const bodyBlock = match[2]; // 正文内容

    const note: AtomicNote = {
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
    };

    // 从 frontmatter 块中提取元数据
    const fmLines = fmBlock.split('\n');
    for (const line of fmLines) {
      const titleMatch = line.match(/^title:\s*(.+)/);
      const sourceMatch = line.match(/^source:\s*(.+)/);
      const tagsMatch = line.match(/^tags:\s*(.+)/);

      if (titleMatch) note.title = stripQuotes(titleMatch[1].trim());
      if (sourceMatch) note.source = stripQuotes(sourceMatch[1].trim());
      if (tagsMatch) note.tags = parseTags(tagsMatch[1]);
    }

    // 正文：去掉首尾空白和可能的尾部 ---
    let content = bodyBlock.trim();
    // 去掉末尾可能残留的 --- 分隔符
    content = content.replace(/\n?---\s*$/, '').trim();
    // 如果内容只有 --- 或空，说明正文为空
    if (content === '---' || content === '') {
      content = '';
    }
    note.content = content;

    // 只要有标题或内容就加入结果
    if (note.title || note.content) {
      notes.push(note);
    }
  }

  // ★ 兜底：如果正则没匹配到任何笔记，尝试旧的 split 方法（容错）
  if (notes.length === 0 && text.includes('---')) {
    return tryParseFrontmatterFallback(text);
  }

  return notes;
}

/**
 * 兜底解析器：当主正则失败时的降级方案
 */
function tryParseFrontmatterFallback(text: string): AtomicNote[] {
  const notes: AtomicNote[] = [];
  // 按 \n---\n 分割，然后尝试合并相邻块
  const blocks = text.split(/\n---\n/);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block || block === '---') continue;

    const note: AtomicNote = {
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
    };

    // 检查是否包含 frontmatter 元数据
    const hasMetadata = /^(title|source|tags):\s/m.test(block);

    if (hasMetadata) {
      // 提取内联元数据
      const lines = block.split('\n');
      const metaEndIndex = lines.length;
      
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        const titleMatch = line.match(/^title:\s*(.+)/);
        const sourceMatch = line.match(/^source:\s*(.+)/);
        const tagsMatch = line.match(/^tags:\s*(.+)/);

        if (titleMatch) note.title = stripQuotes(titleMatch[1].trim());
        if (sourceMatch) note.source = stripQuotes(sourceMatch[1].trim());
        if (tagsMatch) note.tags = parseTags(tagsMatch[1]);

        // 遇到非元数据行且已有标题 → 后面的都是正文
        if (!line.match(/^(title|source|tags):\s/) && j > 0 && note.title) {
          // 正文从这里开始
          note.content = lines.slice(j).join('\n').replace(/^\n+/, '').trim();
          break;
        }
      }

      // 如果当前块没有提取到正文，检查下一个块是不是正文
      if (!note.content && i + 1 < blocks.length) {
        const nextBlock = blocks[i + 1].trim();
        // 下一个块不是 frontmatter → 是正文
        if (!/^(title|source|tags):\s/m.test(nextBlock) && nextBlock !== '---') {
          note.content = nextBlock.replace(/\n?---\s*$/, '').trim();
          i++; // 跳过下一个块（已被消费）
        }
      }
    } else {
      // 没有 frontmatter 元数据的纯文本块
      note.content = block.replace(/\n?---\s*$/, '').trim();
    }

    if ((note.title || note.content) && note.content !== '---') {
      notes.push(note);
    }
  }

  return notes;
}

/**
 * 解析编号列表 / Markdown 标题格式（容错）
 * 当 AI 不遵循 frontmatter 格式时的降级解析
 */
function tryParseListFormat(text: string): AtomicNote[] {
  const notes: AtomicNote[] = [];

  // 按常见的笔记分隔模式分割
  // 匹配：1. 或 1、或 ## 或 ### 开头的段落
  const segments = text.split(/\n(?=\d+[\.\、]\s+\**|\#{1,3}\s)/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const note: AtomicNote = {
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
    };

    const lines = trimmed.split('\n');

    // 尝试从首行提取标题
    const firstLine = lines[0].trim();

    // 模式 A: "1. **标题内容**" 或 "1. 标题内容"
    let numberedMatch = firstLine.match(/^\d+[\.\、]\s+\**([^*\n]+)\**\s*$/);
    // 模式 B: "### 标题" 或 "## 标题"
    let headingMatch = firstLine.match(/^#{1,3}\s+(.+)$/);
    // 模式 C: "**标题**" （独立加粗行）
    let boldMatch = firstLine.match(/^\*\*(.+?)\*\*$/);

    let extractedTitle: string | null = null;
    let contentStartLine = 0;

    if (numberedMatch) {
      extractedTitle = cleanTitle(numberedMatch[1].trim());
      contentStartLine = 1;
    } else if (headingMatch) {
      extractedTitle = cleanTitle(headingMatch[1].trim());
      contentStartLine = 1;
    } else if (boldMatch) {
      extractedTitle = cleanTitle(boldMatch[1].trim());
      contentStartLine = 1;
    }

    if (extractedTitle) {
      note.title = extractedTitle;
    }

    // 收集剩余行，同时扫描内联的 tags:/source: 行
    const contentLines: string[] = [];
    for (let i = contentStartLine; i < lines.length; i++) {
      const line = lines[i].trim();
      const tagMatch = line.match(/^tags?:\s*(.+)/);
      const srcMatch = line.match(/^(?:source|来源)[:：]\s*(.+)/);
      if (tagMatch) {
        note.tags = parseTags(tagMatch[1]);
        continue; // 不加入正文
      }
      if (srcMatch) {
        note.source = stripQuotes(srcMatch[1].trim());
        continue; // 不加入正文
      }
      contentLines.push(lines[i]); // 保留原始缩进
    }

    note.content = contentLines.join('\n').trim();

    if (note.content) {
      notes.push(note);
    }
  }

  // 如果上述分割没有产生结果，把整个文本作为单条笔记
  if (notes.length === 0 && text.trim()) {
    notes.push({
      title: '',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  return notes;
}

/**
 * 清理标题：去掉编号前缀、多余空格、Markdown 加粗标记
 * 处理 "1. xxx" / "1、xxx" / "**xxx**" / "### xxx" 等格式
 *
 * 子弹笔记标题规范：5~25字的简洁短语，独立成意
 * 如果清理后超过25字，自动缩短为子弹笔记风格
 */
function cleanTitle(raw: string): string {
  let cleaned = raw.trim();
  // 去掉编号前缀: "1. " "1、" "①" "(1)" "（1）"
  cleaned = cleaned.replace(/^(?:\d+[\.\、]\s*|[\[【\(（]?\d+[\]】\)）]\s*|^[①②③④⑤⑥⑦⑧⑨⑩]\s*)/, '');
  // 去掉 Markdown 标题符号
  cleaned = cleaned.replace(/^#{1,3}\s*/, '');
  // 去掉加粗标记
  cleaned = cleaned.replace(/^\*\*|\*\*$/g, '');
  // 去掉首尾空白和标点
  cleaned = cleaned.replace(/^[：:\s,，]+|[：:\s,，]+$/g, '');

  // 如果清理后为空或太短（<2字），返回空让上层兜底
  if (cleaned.length < 2) return '';

  // ★ 子弹标题长度控制：超过20字时智能缩短
  if (cleaned.length > 20) {
    const shortened = shortenToBulletTitle(cleaned);
    // ★ 安全验证：如果缩短结果质量不合格，返回空让上层用内容提取代替
    if (isQualityTitle(shortened)) {
      return shortened;
    }
    // 缩短失败了——返回空字符串，让 ensureTitles 从内容中提取更好的标题
    return '';
  }

  // 即使长度合格也要做质量检查（防止截断残留等）
  if (!isQualityTitle(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * 将过长的句子型标题缩短为子弹笔记风格的短语
 *
 * 策略优先级：
 *   1. 冒号/破折号截断 —— "主题：说明" → 取"主题"部分，再精炼
 *   2. 逗号截断 —— 取第一分句（中英文逗号都识别）
 *   3. 提取核心名词短语 —— 从"xxx的yyy"模式中提取关键概念
 *   4. 英文术语提取 —— 从中英混合文本中提取英文专有名词
 *   5. 安全截断 —— 尊重中英文单词边界，绝不从单词中间切断
 */
function shortenToBulletTitle(longTitle: string): string {
  // 策略 1: 在冒号/破折号处分割，取前面部分（通常是论点本身）
  const colonMatch = longTitle.match(/^(.+?)[：:———–—]\s*/);
  if (colonMatch) {
    const topic = colonMatch[1].trim();
    if (topic.length >= 4 && topic.length <= 22) return topic;
    if (topic.length > 22) return shortenToBulletTitle(topic); // 递归处理
  }

  // 策略 2: 在第一个逗号处截断（支持中英文逗号）
  const commaIdx = longTitle.search(/[，,]/);
  if (commaIdx > 5 && commaIdx <= 22) {
    return longTitle.slice(0, commaIdx).trim();
  }

  // 策略 3: 提取"xxx的yyy"中的核心概念（扩展关键词库）
  // 例如 "央视的版权保护隐含一个错误假设" → "版权保护的错误假设"
  const coreConcepts = [
    '保护', '假设', '矛盾', '影响', '效应', '机制', '策略', '方法',
    '思维', '模式', '偏见', '误区', '功能', '限制', '优势', '劣势',
    '特点', '特征', '原理', '原则', '标准', '规范', '问题', '挑战',
    '风险', '机遇', '变化', '趋势', '后果', '意义', '价值',
    'Check', 'Effect', 'War', 'API', 'AI', 'ML', 'UX', 'UI', 'SDK'
  ];
  const possessivePattern = new RegExp(
    `^(.{0,6})?(.+?(?:${coreConcepts.join('|')}))(.{0,8})?$`
  );
  const possessiveMatch = longTitle.match(possessivePattern);
  if (possessiveMatch && possessiveMatch[2]) {
    const core = possessiveMatch[2].trim();
    const modifier = possessiveMatch[1]?.trim() || '';
    const combined = (modifier + core).trim();
    if (combined.length >= 4 && combined.length <= 22) return combined;
    if (core.length >= 4 && core.length <= 20) return core;
  }

  // 策略 4: 提取英文专有名词（如 Sound Check、Loudness War）
  const englishTerms = longTitle.match(/[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*/g);
  if (englishTerms && englishTerms.length > 0) {
    // 取最长的英文术语组合（通常是产品名/技术名）
    const bestTerm = englishTerms.reduce((a, b) => a.length >= b.length ? a : b);
    if (bestTerm.length >= 4 && bestTerm.length <= 20) {
      return bestTerm; // 如 "Sound Check", "Apple Music"
    }
    // 如果单个太短，尝试加前一个中文词
    const termIdx = longTitle.indexOf(bestTerm);
    if (termIdx > 2) {
      const prefix = longTitle.slice(Math.max(0, termIdx - 6), termIdx).replace(/^[的\s]+/, '');
      const combo = (prefix + bestTerm).trim();
      if (combo.length >= 4 && combo.length <= 20) return combo;
    }
  }

  // 策略 5: ★ 安全截断 —— 绝不在英文单词中间切断
  return safeTruncate(longTitle, 18);
}

/**
 * 安全截断：在中英文混合文本中找到合适的截断点
 *
 * 原则：
 * - 优先在空格、标点处切断
 * - 其次在汉字边界处切断（汉字是等宽字符，任意位置可断）
 * - 绝不从英文单词中间切断（如 "Sound" 不能切成 "So"）
 * - 截断后去除末尾弱字符（介词/连词/半截字母）
 */
function safeTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const candidate = text.slice(0, maxLen);

  // 检查末尾是否在英文单词中间切断（最后几个字符是半截英文单词）
  const tailPartialWord = candidate.match(/[a-zA-Z]{1,4}$/);
  if (tailPartialWord) {
    // 回退到最后一个安全位置（空格或汉字之后）
    const lastSafeBoundary = candidate.search(/([\\s\u4e00-\u9fa5])(?=[a-zA-Z]*$)/);
    if (lastSafeBoundary > 3) {
      return candidate.slice(0, lastSafeBoundary + 1).trim();
    }
    // 如果没有好的边界，直接去掉尾部的半截英文
    return candidate.replace(/[a-zA-Z]+$/, '').trim() || text.slice(0, 12);
  }

  // 在安全位置截断后清理末尾
  let result = candidate.trim();
  // 去掉末尾弱结尾（介词/连词/助词）
  result = result.replace(/(?:的|如|和|与|或|对|在|被|将|把|了|着|吗|呢|啊|吧|么|[a-zA-Z]{1,2})$/, '');

  // 最终保底：确保至少返回有意义的片段
  if (result.length < 4) {
    return text.slice(0, 10).replace(/[a-zA-Z]+$/, '').trim();
  }

  return result;
}

/**
 * 确保每条笔记都有标题
 * 无标题时从内容首行提取短句（取第一个句号/逗号前的文字，最多30字）
 */
export function ensureTitles(notes: AtomicNote[]): AtomicNote[] {
  for (const note of notes) {
    if (!note.title || note.title.trim() === '') {
      note.title = extractTitleFromContent(note.content);
    } else {
      // 即使有标题也做一次清理（去掉可能残留的编号前缀）
      const cleaned = cleanTitle(note.title);
      if (cleaned) {
        note.title = cleaned;
      }
    }
  }
  return notes;
}

/**
 * 确保每条笔记至少有基础标签
 * 如果 AI 没有返回标签，从内容中提取关键词
 */
export function ensureTags(notes: AtomicNote[], userPreferences?: string[]): AtomicNote[] {
  for (const note of notes) {
    // 已有标签则跳过
    if (note.tags && note.tags.length > 0) continue;

    const keywords = extractKeywords(note.content, note.title);
    // 如果用户有标签偏好，优先匹配
    if (userPreferences && userPreferences.length > 0) {
      const matched = keywords.filter(k =>
        userPreferences.some(pref => k.includes(pref) || pref.includes(k))
      );
      const unmatched = keywords.filter(k =>
        !userPreferences.some(pref => k.includes(pref) || pref.includes(k))
      );
      note.tags = [...matched, ...unmatched].slice(0, 6);
    } else {
      note.tags = [...new Set([...keywords])].slice(0, 6); // 去重，最多6个
    }
  }
  return notes;
}

/**
 * 从内容首行提取候选标题
 * 取第一行前30个字符（在句号、换行处截断），去除标点结尾和编号前缀
 * ★ 使用 safeTruncate 确保不会在英文单词中间切断
 */
function extractTitleFromContent(content: string): string {
  if (!content) return `note-${Date.now()}`;

  const firstLine = content.split('\n')[0].trim();
  // 先做一次通用清理（去掉编号前缀等）
  const cleanedLine = cleanTitle(firstLine);

  // cleanTitle 返回了有效标题 → 直接用
  if (cleanedLine) return cleanedLine;

  // cleanTitle 返回空（标题质量不合格），需要从内容中安全提取
  // 在句号/问号/感叹号/分号处截断
  const sentenceEnd = firstLine.match(/^[^。！？；]{1,30}[。！？；]?/);
  if (sentenceEnd) {
    let result = sentenceEnd[0].replace(/[。，！？；：\s]+$/, '').trim();
    // 对结果做安全截断
    if (result.length > 18) {
      result = safeTruncate(result, 18);
    }
    return result.length >= 2 ? result : `note-${Date.now()}`;
  }

  // 兜底：使用 safeTruncate 安全截取
  const fallback = safeTruncate(firstLine, 18);
  return fallback.length >= 2 ? fallback : `note-${Date.now()}`;
}

/**
 * 检测标题是否为"质量合格"的子弹笔记标题
 *
 * 不合格的情况（返回 false）：
 * - 末尾在英文单词中间截断（如 "...Music的So"）
 * - 长度异常（<4 或 >25）
 * - 看起来像被硬截断的长句片段
 */
function isQualityTitle(title: string): boolean {
  const t = title.trim();

  // 长度检查
  if (t.length < 4 || t.length > 25) return false;

  // ★ 关键检测：中英混合文本中末尾是否有英文截断残留
  // 核心判断：包含汉字 + 以短英文片段结尾（非完整术语）→ 大概率是截断残留
  // 例如 "流媒体平台如Apple Music的So" —— 有中文，以"So"结尾（不完整的Sound）
  const hasChinese = /[\u4e00-\u9fa5]/.test(t);
  const tailEnglish = t.match(/[a-zA-Z]+$/);

  if (hasChinese && tailEnglish) {
    const tail = tailEnglish[0];
    // 末尾英文 ≤4 字符且不在已知完整术语白名单中 → 判定为截断残留
    const knownTerms = [
      'AI', 'ML', 'UX', 'UI', 'API', 'SDK', 'OS', 'CPU', 'GPU',
      'RAM', 'IO', 'ID', 'OK', 'TV', 'PC', 'HR', 'PR', 'PM', 'QA',
      'App', 'Web', 'Mac', 'iOS', 'Android', 'Check', 'Effect',
      'War', 'Note', 'Data', 'Code', 'Node', 'Git', 'HTTP', 'JSON'
    ];
    if (tail.length <= 5 && !knownTerms.some(known => tail === known || tail.endsWith(known))) {
      return false;
    }
  }

  // 检查是否像句子片段（包含"的如""认为""发现"等动词性短语且较长）
  // 这种通常是长句被粗暴截断的结果
  const sentenceFragments = ['的如', '认为', '发现', '指出', '显示', '表明', '通过', '以及'];
  for (const frag of sentenceFragments) {
    if (t.includes(frag) && t.length > 12) {
      return false;
    }
  }

  return true;
}

/**
 * 从内容中提取关键词作为基础标签
 * 策略：按优先级依次尝试多种提取方式
 */
function extractKeywords(content: string, title?: string): string[] {
  const keywords = new Set<string>();

  // 1. 提取 **加粗** 文本（通常是关键概念）
  const boldMatches = content.match(/\*\*(.+?)\*\*/g);
  if (boldMatches) {
    for (const b of boldMatches) {
      const word = b.replace(/\*\*/g, '').trim();
      if (word.length >= 2 && word.length <= 15) {
        keywords.add(word);
      }
    }
  }

  // 2. 提取 （括号）内的英文/中英文混合词（通常是术语）
  const parenMatches = content.match(/[（(]([a-zA-Z\u4e00-\u9fa5]{2,15})[）)]/g);
  if (parenMatches) {
    for (const p of parenMatches) {
      const word = p.replace(/[（()）]/g, '');
      keywords.add(word);
    }
  }

  // 3. 引用词 / 书名号
  const quoted = content.match(/[""「」『』《》]([^""「」『』《》]{2,10})[""「」『』《》]/g);
  if (quoted) {
    for (const q of quoted) {
      keywords.add(q.replace(/[""「」『』《》]/g, ''));
    }
  }

  // 4. 从标题中提取核心概念（★ 仅当标题质量合格时使用）
  if (title && isQualityTitle(title)) {
    // 去掉常见的无信息量后缀
    const coreTitle = title
      .replace(/(的研究|的发现|的分析|的影响|的问题|的方法|的策略|的机制|的效果|的报告|的调查)$/gi, '')
      .trim();
    if (coreTitle.length >= 2 && coreTitle.length <= 20) {
      keywords.add(coreTitle);
    }
  }

  // 5. 兜底：从内容首句提取主语性短语（中文常见模式：xxx是/xxx指/xxx通过）
  if (keywords.size < 2) {
    const firstSentence = content.split(/[\n。！？]/)[0];
    // 匹配 "XXX是" / "XXX指" / "XXX通过" 模式中的 XXX
    const subjectMatch = firstSentence.match(/^(.{2,12})(?:是|指|通过|利用|基于|采用|包括|涉及|表现为|被称为)/);
    if (subjectMatch) {
      keywords.add(subjectMatch[1].trim());
    }
  }

  return Array.from(keywords).slice(0, 6);
}
