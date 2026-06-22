/**
 * AI 输出解析工具
 * 从 AI 返回的文本中提取 JSON 内容
 */

/**
 * 从 AI 输出文本中解析 JSON 数组
 *
 * 处理常见格式：
 * - 纯 JSON 数组：[{"key": "value"}]
 * - 代码块包裹：```json [...] ``` 或 ``` [...] ```
 *
 * @param aiContent AI 返回的原始文本
 * @returns 解析后的 JSON 数组，解析失败返回 null
 */
export function parseJsonArrayFromAI<T>(aiContent: string): T[] | null {
  let jsonStr = aiContent.trim();

  // 去掉代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 提取最外层平衡方括号（手写栈匹配，避免贪心正则跨段误匹配）
  const bracketMatch = extractBalancedBrackets(jsonStr);
  if (!bracketMatch) {
    return null;
  }

  try {
    return JSON.parse(bracketMatch) as T[];
  } catch (e) {
    console.error('[JSON 解析] 解析失败：', e, '\n原始内容：', aiContent.slice(0, 500));
    return null;
  }
}

/**
 * 从字符串中提取最外层平衡方括号内容
 * 处理多段 [...] 时只取第一个完整匹配，避免贪心正则跨段误匹配
 */
function extractBalancedBrackets(str: string): string | null {
  const start = str.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }

  return null;
}
