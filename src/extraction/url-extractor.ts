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
  'nav',
  '[role="navigation"]',
  '.nav',
  '.navigation',
  'header',
  'footer',
  '[role="footer"]',
  '.footer',
  '.sidebar',
  '.aside',
  'aside',
  '.widget',
  '.ad',
  '.advertisement',
  '[class*="ad"]',
  '[id*="ad"]',
  '.banner',
  '.cookie-banner',
  '.consent-banner',
  '.modal',
  '.popup',
  '.notification',
  '.comments',
  '.comment',
  '[class*="comment"]',
  '[id*="comment"]',
];

export async function extractUrlContent(
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

  bestContent = bestContent.replace(/<[^>]+>/g, ' ');

  bestContent = bestContent.replace(/\s+/g, ' ').trim();

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