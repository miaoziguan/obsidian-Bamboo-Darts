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

  // 提取 JSON 数组
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as T[];
  } catch (e) {
    console.error('[JSON 解析] 解析失败：', e, '\n原始内容：', aiContent.slice(0, 500));
    return null;
  }
}

/**
 * 从 AI 输出文本中解析 JSON 对象
 * 
 * @param aiContent AI 返回的原始文本
 * @returns 解析后的 JSON 对象，解析失败返回 null
 */
export function parseJsonObjectFromAI<T extends Record<string, unknown>>(aiContent: string): T | null {
  let jsonStr = aiContent.trim();

  // 去掉代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 提取 JSON 对象
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (e) {
    console.error('[JSON 解析] 解析失败：', e, '\n原始内容：', aiContent.slice(0, 500));
    return null;
  }
}