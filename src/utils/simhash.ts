/**
 * SimHash 64 位指纹模块
 *
 * 用于库内去重的快速预过滤：两条笔记的 SimHash 汉明距离 < 3
 * 才进入全量 TF-IDF 余弦比对，大幅减少 O(n²) 计算量。
 */

/**
 * 对 token 权重表计算 64 位 SimHash 指纹
 * @param weights token → 权重（TF-IDF 或频次）
 * @returns 64-bit 非负整数（Number 安全范围）
 */
export function simhash(weights: Map<string, number>): bigint {
  const vector = new Int32Array(64);

  for (const [token, weight] of weights) {
    const hash = fnv1a64(token);
    for (let i = 0; i < 64; i++) {
      if ((hash >> BigInt(i)) & 1n) {
        vector[i] += weight;
      } else {
        vector[i] -= weight;
      }
    }
  }

  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (vector[i] > 0) {
      fingerprint |= 1n << BigInt(i);
    }
  }

  return fingerprint;
}

/** FNV-1a 64 位哈希（使用 BigInt 保证全 64 位精度） */
function fnv1a64(str: string): bigint {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn; // 保持 64-bit
  }
  return hash;
}

/** 计算两个 SimHash 指纹的汉明距离（不同位数） */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let dist = 0;
  while (xor) {
    dist++;
    xor &= xor - 1n;
  }
  return dist;
}
