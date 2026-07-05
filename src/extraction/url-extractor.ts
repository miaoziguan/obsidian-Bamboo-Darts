/**
 * URL 内容提取器（DOMParser 版）
 *
 * 用 DOMParser 解析 HTML，再用 querySelector / querySelectorAll
 * 提取语义内容、剥离噪声。比正则解析更健壮：
 * - 正确处理嵌套标签和属性中的特殊字符
 * - 原生支持 [class*="ad"] 等属性选择器
 * - 不会误匹配 class 名相近但语义无关的元素
 */

// ─── 错误码 ───

const UrlExtractError = {
  /** HTML 为空或无法解析 */
  EMPTY_HTML: 'EMPTY_HTML',
  /** 提取内容过短（可能不是文章页） */
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  /** 页面需要 JS 渲染（body 基本为空） */
  REQUIRES_JS: 'REQUIRES_JS',
  /** 检测到 meta refresh 跳转 */
  META_REFRESH: 'META_REFRESH',
} as const;

type UrlExtractErrorCode = (typeof UrlExtractError)[keyof typeof UrlExtractError];

// ─── 提取选项 ───

interface ExtractOptions {
  minLength?: number;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  minLength: 100,
};

// ─── 返回值 ───

interface UrlExtractResult {
  success: boolean;
  content?: string;
  title?: string;
  publishDate?: string;
  error?: string;
  errorCode?: UrlExtractErrorCode;
  /** 如果是 meta refresh 跳转，这里返回目标 URL */
  redirectUrl?: string;
}

// ─── 语义容器选择器（按优先级排列） ───

const SEMANTIC_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.article',
  '.post',
  '.entry',
  '.content',
];

// ─── 必须先移除的标签（脚本/样式/嵌入） ───

const STRIP_TAGS = 'script, style, noscript, iframe, template';

// ─── 噪声元素选择器（用于快速匹配，见 isNoiseElement） ───

const NOISE_TAGS = new Set([
  'NAV',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'TEMPLATE',
]);

const NOISE_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
]);

const NOISE_CLASSES = new Set([
  'nav',
  'navigation',
  'navbar',
  'nav-menu',
  'site-nav',
  'global-nav',
  'primary-nav',
  'secondary-nav',
  'footer-nav',
  'menu',
  'dropdown',
  'sub-menu',
  'submenu',
  'breadcrumb',
  'breadcrumbs',
  'pagination',
  'drawer',
  'offcanvas',
  'skip-link',
  'back-to-top',
  'scroll-to-top',
  'site-header',
  'site-footer',
  'global-footer',
  'sidebar',
  'aside',
  'ad',
  'advertisement',
  'ad-banner',
  'ad-slot',
  'ad-container',
  'ad-wrapper',
  'banner',
  'cookie-banner',
  'consent-banner',
  'cookie-notice',
  'cookie-consent',
  'promo',
  'promotion',
  'sponsored',
  'donate',
  'paywall',
  'overlay',
  'interstitial',
  'outbrain',
  'taboola',
  'recirc',
  'signup',
  'sign-up',
  'email-capture',
  'lead-capture',
  'modal',
  'popup',
  'notification',
  'tooltip',
  'lightbox',
  'age-gate',
  'share',
  'social',
  'social-share',
  'newsletter',
  'subscribe',
  'subscription',
  'widget',
  'comments',
  'comment',
  'related',
  'recommended',
  'related-posts',
  'author-bio',
  'post-meta',
  'entry-meta',
  'reading-time',
  'word-count',
  'byline',
  'dateline',
  'syndication',
  'toc',
  'table-of-contents',
  'disclaimer',
  'legal',
  'legal-notice',
  'copyright',
  'privacy',
  'privacy-policy',
  'terms',
  'terms-of-service',
  'carousel',
  'slider',
  'sr-only',
  'visually-hidden',
]);

/**
 * 快速判断一个元素是否属于噪声（单次遍历，O(N)）
 * 替代原来的 70+ 次 querySelectorAll
 */
function isNoiseElement(el: Element): boolean {
  const tag = el.tagName;

  // 1. 标签名快速匹配
  if (NOISE_TAGS.has(tag)) return true;

  // 2. role 属性匹配
  const role = el.getAttribute('role');
  if (role && NOISE_ROLES.has(role)) return true;

  // 3. aria-label 包含 share
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.toLowerCase().includes('share')) return true;

  // 4. aria-hidden 或 hidden 属性
  if (el.hasAttribute('aria-hidden') || el.hasAttribute('hidden')) return true;

  // 5. class 名匹配（精确匹配 + 部分匹配）
  const className = el.className;
  if (typeof className === 'string' && className) {
    const classes = className.split(/\s+/);
    for (const c of classes) {
      if (NOISE_CLASSES.has(c)) return true;
      // 部分匹配：ad- / ad_ / sponsor- / sponsor_
      if (/^(ad|sponsor)[-_]/.test(c)) return true;
    }
  }

  // 6. id 包含 ad / sponsor
  const id = el.id;
  if (id) {
    const lowerId = id.toLowerCase();
    if (/\bad\b/.test(lowerId) || /\bsponsor\b/.test(lowerId)) return true;
  }

  return false;
}

// ─── meta refresh 检测 ───

/**
 * 检测 HTML 中是否有 meta refresh 跳转，有则返回目标 URL
 * 用 DOMParser 解析（比正则更健壮，能处理各种引号格式）
 */
function detectMetaRefresh(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const meta = doc.querySelector('meta[http-equiv="refresh" i]');
    if (!meta) return null;
    const content = meta.getAttribute('content');
    if (!content) return null;
    // content 格式： "0;url=http://..." 或 "0;url='http://...'"
    const match = content.match(/url\s*=\s*["']?(.+?)["']?\s*$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── 导出函数 ───

export async function extractUrlContent(
  html: string,
  options: ExtractOptions = {},
): Promise<UrlExtractResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!html || html.trim().length === 0) {
    return {
      success: false,
      error: 'HTML 内容为空',
      errorCode: UrlExtractError.EMPTY_HTML,
    };
  }

  // 先检测 meta refresh（在 DOMParser 之前，快速失败）
  const redirectUrl = detectMetaRefresh(html);
  if (redirectUrl) {
    return {
      success: false,
      error: `页面需要跳转，目标地址：${redirectUrl}`,
      errorCode: UrlExtractError.META_REFRESH,
      redirectUrl,
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 提取标题
  const title =
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim() ||
    doc.title?.trim() ||
    '';

  // 提取发布时间
  const publishDate = extractPublishDate(doc);

  // 第一步：移除脚本/样式/嵌入标签（内容不应出现在提取结果中）
  doc.querySelectorAll(STRIP_TAGS).forEach((el) => el.remove());

  // 第二步：找最佳语义容器
  let container: Element | null = null;
  for (const selector of SEMANTIC_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el && el.textContent!.trim().length >= opts.minLength!) {
      container = el;
      break;
    }
  }

  // 回退到 body
  if (!container) {
    container = doc.body || doc.documentElement;
  }

  // 第三步：在容器内用单次遍历移除噪声元素（性能优化）
  removeNoiseFast(container);

  // 第四步：移除 HTML 注释节点
  removeComments(container);

  // 第五步：提取纯文本（保留 img alt）
  let text = getTextWithAlt(container);

  // 第六步：规范化空白
  text = text.replace(/\s+/g, ' ').trim();

  // 检测是否需要 JS 渲染
  if (text.length < 50 && container.querySelectorAll('*').length < 20) {
    return {
      success: false,
      title,
      error: '页面内容需要 JavaScript 渲染，无法提取静态内容',
      errorCode: UrlExtractError.REQUIRES_JS,
    };
  }

  if (text.length < opts.minLength!) {
    return {
      success: false,
      title,
      error: `提取内容过短（仅 ${text.length} 字），可能不是文章内容页面`,
      errorCode: UrlExtractError.CONTENT_TOO_SHORT,
    };
  }

  return { success: true, content: text, title, publishDate };
}

// ─── 辅助函数 ───

/** 提取发布时间（支持多种常见模式） */
function extractPublishDate(doc: Document): string {
  // 1. meta 标签（最可靠）
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
    'meta[name="DC.date.issued"]',
    'meta[name="citation_date"]',
  ];
  for (const sel of metaSelectors) {
    const content = doc.querySelector(sel)?.getAttribute('content');
    if (content) return content.trim();
  }

  // 2. time 标签
  const timeEl = doc.querySelector('time[datetime]');
  if (timeEl) return timeEl.getAttribute('datetime')?.trim() || '';

  // 3. 常见 class 模式
  const dateClasses = ['.date', '.published', '.post-date', '.entry-date', '.article-date'];
  for (const sel of dateClasses) {
    const el = doc.querySelector(sel);
    if (el?.textContent) return el.textContent.trim();
  }

  return '';
}

/** 单次遍历移除噪声元素（替代原来的 70+ 次 querySelectorAll） */
function removeNoiseFast(container: Element): void {
  const ownerDoc = container.ownerDocument;
  if (!ownerDoc) return;
  const walker = ownerDoc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (isNoiseElement(el)) {
      toRemove.push(el);
    }
  }
  // 批量移除（避免 walker 状态混乱）
  for (const el of toRemove) {
    el.remove();
  }
}

/** 提取文本（保留 img alt，不修改原 DOM） */
function getTextWithAlt(container: Element): string {
  // 先收集所有 img 的 alt 文本，再统一处理
  const altTexts: string[] = [];
  container.querySelectorAll('img[alt]').forEach((img) => {
    const alt = img.getAttribute('alt')?.trim();
    if (alt) altTexts.push(`[图] ${alt}`);
  });

  // 提取正文文本
  let text = container.textContent || '';

  // 如果有配图说明，附加在末尾
  if (altTexts.length > 0) {
    text += '\n\n【配图说明】\n' + altTexts.join('\n');
  }

  return text;
}

/** 递归移除注释节点 */
function removeComments(node: Node): void {
  const ownerDoc = node.ownerDocument;
  if (!ownerDoc) return;
  const walker = ownerDoc.createTreeWalker(node, NodeFilter.SHOW_COMMENT, null);
  const comments: Comment[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    comments.push(current as Comment);
  }
  comments.forEach((c) => c.remove());
}
