/**
 * URL 内容提取器（DOMParser 版）
 *
 * 用 DOMParser 解析 HTML，再用 querySelector / querySelectorAll
 * 提取语义内容、剥离噪声。比正则解析更健壮：
 * - 正确处理嵌套标签和属性中的特殊字符
 * - 原生支持 [class*="ad"] 等属性选择器
 * - 不会误匹配 class 名相近但语义无关的元素
 */

interface ExtractOptions {
  minLength?: number;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  minLength: 100,
};

/** 语义容器选择器（按优先级排列） */
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

/** 必须先移除的标签（脚本/样式/嵌入） */
const STRIP_TAGS = 'script, style, noscript, iframe, template';

/** 噪声元素选择器 */
const NOISE_SELECTORS = [
  // ── 导航 ──
  'nav',
  '[role="navigation"]',
  '.nav',
  '.navigation',
  '.navbar',
  '.nav-menu',
  '.site-nav',
  '.global-nav',
  '.primary-nav',
  '.secondary-nav',
  '.footer-nav',
  '.menu',
  '.dropdown',
  '.sub-menu',
  '.submenu',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.drawer',
  '.offcanvas',
  '.skip-link',
  '.back-to-top',
  '.scroll-to-top',

  // ── 页头/页脚/侧栏 ──
  'header',
  '[role="banner"]',
  'footer',
  '[role="footer"]',
  '.footer',
  '[role="contentinfo"]',
  '.sidebar',
  '.aside',
  'aside',
  '[role="complementary"]',
  '.site-header',
  '.site-footer',
  '.global-footer',

  // ── 广告/推广 ──
  '.ad',
  '.advertisement',
  '.ad-banner',
  '.ad-slot',
  '.ad-container',
  '.ad-wrapper',
  '[class*="ad-"]',
  '[class*="ad_"]',
  '[id*="ad"]',
  '.banner',
  '.cookie-banner',
  '.consent-banner',
  '.cookie-notice',
  '.cookie-consent',
  '.promo',
  '.promotion',
  '.sponsored',
  '[class*="sponsor-"]',
  '[class*="sponsor_"]',
  '[id*="sponsor"]',
  '.donate',
  '.paywall',
  '.overlay',
  '.interstitial',
  '.outbrain',
  '.taboola',
  '.recirc',
  '.signup',
  '.sign-up',
  '.email-capture',
  '.lead-capture',

  // ── 弹窗/浮层 ──
  '.modal',
  '.popup',
  '.notification',
  '.tooltip',
  '.lightbox',
  '.age-gate',

  // ── 社交/分享/订阅 ──
  '.share',
  '.social',
  '.social-share',
  '[aria-label*="share"]',
  '.newsletter',
  '.subscribe',
  '.subscription',
  '.widget',

  // ── 评论区 ──
  '.comments',
  '.comment',
  '[class*="comment"]',
  '[id*="comment"]',

  // ── 相关内容/推荐 ──
  '.related',
  '.recommended',
  '.related-posts',

  // ── 文章元数据 ──
  '.author-bio',
  '.post-meta',
  '.entry-meta',
  '.reading-time',
  '.word-count',
  '.byline',
  '.dateline',
  '.syndication',

  // ── 目录/索引 ──
  '.toc',
  '.table-of-contents',

  // ── 法律/版权 ──
  '.disclaimer',
  '.legal',
  '.legal-notice',
  '.copyright',
  '.privacy',
  '.privacy-policy',
  '.terms',
  '.terms-of-service',

  // ── 轮播/媒体容器 ──
  '.carousel',
  '.slider',

  // ── 不可见元素 ──
  '.sr-only',
  '.visually-hidden',
  '[aria-hidden="true"]',
  '[hidden]',
];

export async function extractUrlContent(
  html: string,
  options: ExtractOptions = {},
): Promise<{ success: boolean; content?: string; error?: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const doc = new DOMParser().parseFromString(html, 'text/html');

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

  // 第三步：在容器内移除噪声元素
  for (const selector of NOISE_SELECTORS) {
    try {
      container.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      // 忽略无效选择器（不应发生，但防御性处理）
    }
  }

  // 第四步：移除 HTML 注释节点
  removeComments(container);

  // 第五步：提取纯文本
  let text = container.textContent || '';

  // 第六步：规范化空白
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length < opts.minLength!) {
    return {
      success: false,
      error: `提取内容过短（仅 ${text.length} 字），可能不是文章内容页面`,
    };
  }

  return { success: true, content: text };
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
