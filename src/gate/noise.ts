import { GATE_MIN_CONTENT_LENGTH, GATE_MAX_NOISE_RATIO, GATE_WARN_NOISE_RATIO } from '../constants';
import { GateResult, ok, warn, block } from './types';

export function checkNoiseRatio(
  content: string,
  maxNoise: number = GATE_MAX_NOISE_RATIO,
  warnNoise: number = GATE_WARN_NOISE_RATIO
): GateResult {
  if (content.length < GATE_MIN_CONTENT_LENGTH) return ok();

  let noiseChars = 0;
  for (const ch of content) {
    if (isNoise(ch)) noiseChars++;
  }

  const ratio = noiseChars / content.length;

  if (ratio > maxNoise) {
    return block(`噪声占比过高（${(ratio * 100).toFixed(0)}%），内容可能为图片残留或乱码`);
  }

  if (ratio > warnNoise) {
    return warn(`噪声占比较高（${(ratio * 100).toFixed(0)}%），建议检查内容完整性`);
  }

  return ok();
}

export function isNoise(ch: string): boolean {
  const code = ch.codePointAt(0)!;

  // 基本拉丁 + 补充拉丁
  if (code >= 0x0020 && code <= 0x00FF) return false;
  // 拉丁扩展
  if (code >= 0x0100 && code <= 0x024F) return false;
  // 西里尔字母（俄语等）
  if (code >= 0x0400 && code <= 0x04FF) return false;
  // 希腊文
  if (code >= 0x0370 && code <= 0x03FF) return false;
  // 阿拉伯文
  if (code >= 0x0600 && code <= 0x06FF) return false;
  // 天城文（印地语等）
  if (code >= 0x0900 && code <= 0x097F) return false;
  // 泰文
  if (code >= 0x0E00 && code <= 0x0E7F) return false;
  // 中日韩统一表意文字
  if (code >= 0x4E00 && code <= 0x9FFF) return false;
  // CJK 扩展 A
  if (code >= 0x3400 && code <= 0x4DBF) return false;
  // CJK 扩展 B（罕见汉字）
  if (code >= 0x20000 && code <= 0x2A6DF) return false;
  // 日文假名
  if (code >= 0x3040 && code <= 0x309F) return false; // 平假名
  if (code >= 0x30A0 && code <= 0x30FF) return false; // 片假名
  // 谚文（韩文）
  if (code >= 0xAC00 && code <= 0xD7AF) return false;
  // 空格/控制字符
  if (code === 0x0009 || code === 0x000A || code === 0x000D) return false;
  if (code >= 0x2000 && code <= 0x206F) return false; // 通用标点
  if (code >= 0x3000 && code <= 0x303F) return false; // CJK 符号
  // 全角字符
  if (code >= 0xFF00 && code <= 0xFFEF) return false;
  // Emoji 基本区
  if (code >= 0x1F300 && code <= 0x1F9FF) return false;
  // Emoji 扩展区 + 国家旗
  if (code >= 0x1FA00 && code <= 0x1FA6F) return false;
  if (code >= 0x1F1E6 && code <= 0x1F1FF) return false;
  // 数学运算符 / 杂项符号
  if (code >= 0x2200 && code <= 0x22FF) return false;
  if (code >= 0x2500 && code <= 0x257F) return false;
  if (code >= 0xFE00 && code <= 0xFE0F) return false; // 变体选择器（Emoji 修饰符）

  return true;
}
