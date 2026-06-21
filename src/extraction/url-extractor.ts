/**
 * URL 内容提取器（改进版）
 * 优先提取语义标签内容，减少噪声
 */

interface ExtractOptions {
  minLength?: number;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  minLength: 100,
};

const SEMANTIC_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  'section[role="main"]',
  '.article',
  '.post',
  '.entry',
  '.content',
  '.article-content',
  '.post-content',
  '.entry-content',
];

const NOISE_SELECTORS = [
  // ── 导航 ──
  'nav', '[role="navigation"]', '.nav', '.navigation',
  '.navbar', '.nav-menu', '.site-nav', '.global-nav',
  '.primary-nav', '.secondary-nav', '.footer-nav',
  '.menu', '.dropdown', '.sub-menu', '.submenu',
  '.breadcrumb', '.breadcrumbs',
  '.pagination',
  '.drawer', '.offcanvas',
  '.skip-link', '.back-to-top', '.scroll-to-top',

  // ── 页头/页脚/侧栏 ──
  'header', '[role="banner"]',
  'footer', '[role="footer"]', '.footer',
  '[role="contentinfo"]',
  '.sidebar', '.aside', 'aside', '[role="complementary"]',
  '.site-header', '.site-footer', '.global-footer',

  // ── 广告/推广 ──
  '.ad', '.advertisement', '[class*="ad"]', '[id*="ad"]',
  '.banner', '.cookie-banner', '.consent-banner', '.cookie-notice', '.cookie-consent',
  '.promo', '.promotion', '.sponsored', '[class*="sponsor"]', '[id*="sponsor"]',
  '.donate', '.paywall', '.overlay', '.interstitial',
  '.outbrain', '.taboola', '.recirc',
  '.signup', '.sign-up', '.email-capture', '.lead-capture',

  // ── 弹窗/浮层 ──
  '.modal', '.popup', '.notification', '.tooltip', '.lightbox',
  '.age-gate',

  // ── 社交/分享/订阅 ──
  '.share', '.social', '.social-share',
  '[aria-label*="share"]',
  '.newsletter', '.subscribe', '.subscription',
  '.widget',

  // ── 评论区 ──
  '.comments', '.comment', '[class*="comment"]', '[id*="comment"]',

  // ── 相关内容/推荐 ──
  '.related', '.recommended', '.related-posts',

  // ── 文章元数据 ──
  '.author-bio', '.post-meta', '.entry-meta',
  '.reading-time', '.word-count', '.byline', '.dateline', '.syndication',

  // ── 目录/索引 ──
  '.toc', '.table-of-contents',

  // ── 法律/版权 ──
  '.disclaimer', '.legal', '.legal-notice', '.copyright',
  '.privacy', '.privacy-policy', '.terms', '.terms-of-service',

  // ── 轮播/媒体容器 ──
  '.carousel', '.slider',

  // ── 仅屏幕阅读器可见（实际不可见但会污染提取文本） ──
  '.sr-only', '.visually-hidden', '[aria-hidden="true"]',
  '[hidden]',
];

export function extractUrlContent(
  html: string,
  options: ExtractOptions = {}
): Promise<{ success: boolean; content?: string; error?: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let bestContent = '';
  let extractedFrom = 'body';

  for (const selector of SEMANTIC_SELECTORS) {
    const content = extractBySelector(html, selector);
    if (content.length > bestContent.length && content.length >= opts.minLength!) {
      bestContent = content;
      extractedFrom = selector;
    }
  }

  if (!bestContent) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bestContent = bodyMatch[1];
    } else {
      bestContent = html;
    }
  }

  bestContent = removeNoiseBlocks(bestContent);

  bestContent = bestContent.replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 剥离 HTML 注释（可能含 JS 代码或调试文本）
  bestContent = bestContent.replace(/<!--[\s\S]*?-->/g, '');

  bestContent = bestContent.replace(/<[^>]+>/g, ' ');

  bestContent = bestContent.replace(/\s+/g, ' ').trim();

  // 解码 HTML 实体，避免残留 &nbsp; &amp; &#160; 等触发门控误判
  bestContent = decodeHtmlEntities(bestContent);

  if (bestContent.length < opts.minLength!) {
    return {
      success: false,
      error: `提取内容过短（仅 ${bestContent.length} 字），可能不是文章内容页面`,
    };
  }

  return {
    success: true,
    content: bestContent,
  };
}

function extractBySelector(html: string, selector: string): string {
  if (selector.startsWith('[')) {
    const attrMatch = selector.match(/\[(\w+)=["']?([^"']+)["']?\]/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2];
      const regex = new RegExp(
        `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["']?${attrValue}["']?[^>]*>([\\s\\S]*?)<\\/\\1>`,
        'gi'
      );
      const match = regex.exec(html);
      return match ? match[2] : '';
    }
  } else if (selector.startsWith('.')) {
    const className = selector.slice(1);
    const regex = new RegExp(
      `<([a-z][a-z0-9]*)[^>]*\\sclass=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'gi'
    );
    const match = regex.exec(html);
    return match ? match[2] : '';
  } else {
    const tagName = selector;
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = regex.exec(html);
    return match ? match[1] : '';
  }

  return '';
}

/** HTML 实体解码：消除 &nbsp; &amp; &#160; 等残留标记 */
function decodeHtmlEntities(text: string): string {
  return text
    // 数字实体
    .replace(/&#(\d+);/gi, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // 命名实体（高频）
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ldquo;/gi, '\u201C')
    .replace(/&rdquo;/gi, '\u201D')
    .replace(/&lsquo;/gi, '\u2018')
    .replace(/&rsquo;/gi, '\u2019')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/&copy;/gi, '\u00A9')
    .replace(/&reg;/gi, '\u00AE')
    .replace(/&trade;/gi, '\u2122')
    .replace(/&middot;/gi, '\u00B7')
    .replace(/&bull;/gi, '\u2022');
}

function removeNoiseBlocks(html: string): string {
  let result = html;

  for (const selector of NOISE_SELECTORS) {
    let regex: RegExp;

    if (selector.startsWith('[')) {
      const attrMatch = selector.match(/\[(\w+)=["']?([^"']+)["']?\]/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrValue = attrMatch[2];
        regex = new RegExp(
          `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["']?${attrValue}["']?[^>]*>[\\s\\S]*?<\\/\\1>`,
          'gi'
        );
        result = result.replace(regex, ' ');
      }
    } else if (selector.startsWith('.')) {
      const className = selector.slice(1);
      regex = new RegExp(
        `<([a-z][a-z0-9]*)[^>]*\\sclass=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
        'gi'
      );
      result = result.replace(regex, ' ');
    } else if (selector.startsWith('[class*=') || selector.startsWith('[id*=')) {
      const match = selector.match(/\[(\w+)\*=["']?([^"']+)["']?\]/);
      if (match) {
        const attrName = match[1];
        const attrValue = match[2];
        regex = new RegExp(
          `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["'][^"']*${attrValue}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
          'gi'
        );
        result = result.replace(regex, ' ');
      }
    } else {
      const tagName = selector;
      regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
      result = result.replace(regex, ' ');
    }
  }

  return result;
}