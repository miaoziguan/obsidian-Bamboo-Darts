/**
 * API Key 本地加密存储（Obsidian 兼容版）
 *
 * 使用 Web Crypto API（crypto.subtle，Obsidian/Electron 内置），不再依赖 Node 的
 * crypto / os 模块（Obsidian 沙箱不提供这些，直接 require 会抛
 * "Attempting to load NodeJS package" 错误）。
 *
 * 算法：AES-256-GCM + 设备指纹派生密钥，避免 data.json 中明文泄露。
 * 加密后的 Key 可随 Obsidian Sync / iCloud / Git 同步，但只有同环境（指纹一致）能解密。
 *
 * 格式：enc:v1:{base64iv}:{base64ciphertext}:{base64authtag}
 * 与旧版 Node 实现字节级兼容——GCM 为标准算法，已加密数据仍可继续解密。
 */

const ALGORITHM = 'AES-GCM';
const TAG_LENGTH = 16; // GCM 标准 auth tag 长度（字节）
const VERSION = 'v1';
const PREFIX = `enc:${VERSION}:`;

// ─── 设备指纹 ───

/** 测试用：设置固定指纹替代环境采集 */
let _testFingerprint: string | null = null;

/** 暴露测试接口，勿在生产代码中调用 */
export function __setTestFingerprint(fp: string | null): void {
  _testFingerprint = fp;
}

/**
 * 设备指纹：Obsidian/Electron 无 Node 的 os 模块，改用浏览器环境可用标识组合。
 * 不同机器/环境通常产生不同指纹，使加密 Key 无法被异地直接解密。
 */
function getFingerprint(): string {
  if (_testFingerprint !== null) return _testFingerprint;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Partial<Navigator>);
    const parts = [
      nav.userAgent ?? '',
      nav.platform ?? '',
      nav.language ?? '',
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : '',
    ];
    const joined = parts.filter(Boolean).join('|');
    return joined || 'bamboo-darts-fallback-v1';
  } catch {
    // 极端环境无 navigator/window → 用常量兜底（安全性降级，但不报错）
    return 'bamboo-darts-fallback-v1';
  }
}

// ─── base64 / 文本工具（浏览器环境） ───

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ─── 密钥派生 ───

/** 从指纹派生 32 字节 AES-256 密钥（SHA-256 摘要 → importKey） */
async function getDerivedKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const hash = await subtle.digest('SHA-256', encoder.encode(getFingerprint()));
  return subtle.importKey('raw', hash, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

// ─── 加密 / 解密 ───

/** 加密 API Key，返回存储格式字符串（异步：Web Crypto 为异步 API） */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  const key = await getDerivedKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(plaintext);

  const cipherWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, data),
  );

  // Web Crypto 把 auth tag 追加在密文末尾，拆出 {ciphertext} + {tag} 以匹配存储格式
  const ciphertext = cipherWithTag.slice(0, cipherWithTag.length - TAG_LENGTH);
  const authTag = cipherWithTag.slice(cipherWithTag.length - TAG_LENGTH);

  return `${PREFIX}${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}:${bytesToBase64(authTag)}`;
}

/**
 * 解密 API Key
 * @returns 明文 Key，失败返回 null（需用户重新输入）
 */
export async function decryptApiKey(
  stored: string | undefined | null,
): Promise<string | null> {
  if (!stored) return null;

  // 旧明文格式 → 当明文返回，外部升级
  if (!stored.startsWith('enc:')) return stored;

  const rest = stored.slice(4); // 去掉 "enc:"
  const sep1 = rest.indexOf(':');
  if (sep1 === -1) return null;
  const version = rest.slice(0, sep1);
  if (version !== VERSION) return null;

  const payload = rest.slice(sep1 + 1);
  const parts = payload.split(':');
  if (parts.length !== 3) return null;

  const [ivB64, encryptedB64, authTagB64] = parts;

  try {
    const key = await getDerivedKey();
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(encryptedB64);
    const authTag = base64ToBytes(authTagB64);

    // Web Crypto 要求密文与 auth tag 拼接后再解密
    const cipherWithTag = new Uint8Array(ciphertext.length + authTag.length);
    cipherWithTag.set(ciphertext, 0);
    cipherWithTag.set(authTag, ciphertext.length);

    const plainBytes = await globalThis.crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      cipherWithTag,
    );
    return decoder.decode(plainBytes);
  } catch {
    return null;
  }
}

/** 判断存储值是否已加密 */
export function isEncrypted(stored: string | undefined | null): boolean {
  return !!stored && stored.startsWith('enc:');
}
