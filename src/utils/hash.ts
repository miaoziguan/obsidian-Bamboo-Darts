/**
 * 共享哈希工具
 * FNV-1a 32位哈希：浏览器兼容的内容指纹，不需要密码学安全
 */

/**
 * FNV-1a 32位哈希
 * 用于内容指纹、去重映射等场景
 */
export function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, >>> 0 确保无符号
  }
  // 转为16进制字符串，补零到8位
  return hash.toString(16).padStart(8, '0');
}
