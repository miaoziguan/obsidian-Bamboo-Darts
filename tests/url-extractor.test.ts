import { describe, it, expect } from 'vitest';
import { extractUrlContent } from '../src/extraction/url-extractor';

/**
 * #21 回归测试：removeNoiseBlocks 的 [class*=...] / [id*=...] / [attr=val] 分支
 *
 * 原始 bug：`if (selector.startsWith('['))` 拦截了所有以 [ 开头的选择器，
 * 导致 `[class*="ad"]` 被按精确匹配 `class="ad"` 处理，
 * `<div class="ad-banner">` 这类「包含 ad」的 class 永远无法被剥离。
 * 第三个 `else if` 分支成了永远进不去的死代码。
 */
describe('extractUrlContent — 噪声块剥离', () => {
  /** 构造一篇最小可读正文，确保 minLength 通过 */
  const articleBody = '<p>' + '这是一段足够长的正文内容，用于通过 minLength=100 的最小长度校验。'.repeat(5) + '</p>';

  it('剥离 [class*="ad"] 包含匹配的广告容器（bug #21 核心回归）', async () => {
    const html = `<html><body><article>${articleBody}</article><div class="ad-banner">点击购买优惠</div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    // bug 修复前：广告文案会被保留下来污染正文
    expect(res.content).not.toContain('点击购买优惠');
    expect(res.content).not.toContain('ad-banner');
  });

  it('剥离 [class*="sponsor"] 包含匹配的赞助容器', async () => {
    const html = `<html><body><article>${articleBody}</article><aside class="post-sponsor-card">赞助商内容</aside></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).not.toContain('赞助商内容');
  });

  it('剥离 [id*="ad"] 包含匹配的 id 容器', async () => {
    const html = `<html><body><article>${articleBody}</article><div id="google-ad-slot">广告位</div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).not.toContain('广告位');
  });

  it('剥离 [aria-hidden="true"] 精确属性匹配', async () => {
    const html = `<html><body><article>${articleBody}</article><div aria-hidden="true">隐藏装饰内容</div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).not.toContain('隐藏装饰内容');
  });

  it('剥离 [role="navigation"] 精确属性匹配', async () => {
    const html = `<html><body><article>${articleBody}</article><nav role="navigation">首页 关于 联系</nav></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).not.toContain('首页 关于 联系');
  });

  it('保留正文：精确匹配 `class="ad"` 仍可剥离，且不影响包含匹配共存', async () => {
    // 同时存在精确 class="ad" 和包含 class="ad-banner" 的两个广告块
    const html = `<html><body><article>${articleBody}</article><div class="ad">精确广告</div><div class="ad-banner">包含广告</div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).not.toContain('精确广告');
    expect(res.content).not.toContain('包含广告');
  });

  it('不误伤 class 中仅词形相近但语义无关的元素', async () => {
    // class="header" 不应被 [class*="ad"] 误杀
    // 注意：div 必须放在 article 内部，否则语义容器选中 article 后，兄弟节点自然不在 textContent 中
    const html = `<html><body><article>${articleBody}<div class="header">页头信息</div></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    // class="header" 的 div 不应因 [class*=ad] 之类规则被误删
    expect(res.content).toContain('页头信息');
  });
});

describe('extractUrlContent — 输入校验与错误码', () => {
  const articleBody =
    '<p>' + '这是一段足够长的正文内容，用于通过 minLength=100 的最小长度校验。'.repeat(5) + '</p>';

  it('空 HTML 返回 EMPTY_HTML', async () => {
    const res = await extractUrlContent('');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMPTY_HTML');
  });

  it('纯空白 HTML 返回 EMPTY_HTML', async () => {
    const res = await extractUrlContent('   \n\t  ');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMPTY_HTML');
  });

  it('检测 meta refresh 跳转（双引号 url）', async () => {
    const html = `<html><head><meta http-equiv="refresh" content="0;url=https://example.com/target"></head><body>x</body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('META_REFRESH');
    expect(res.redirectUrl).toBe('https://example.com/target');
  });

  it('检测 meta refresh 跳转（单引号 url）', async () => {
    const html = `<html><head><meta http-equiv="refresh" content="3; url='https://example.com/x'"></head><body>x</body></html>`;
    const res = await extractUrlContent(html);
    expect(res.errorCode).toBe('META_REFRESH');
    expect(res.redirectUrl).toBe('https://example.com/x');
  });

  it('meta refresh 无 content 属性不触发跳转', async () => {
    const html = `<html><head><meta http-equiv="refresh"></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.errorCode).not.toBe('META_REFRESH');
  });

  it('meta refresh content 无 url 段不触发跳转', async () => {
    const html = `<html><head><meta http-equiv="refresh" content="5"></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.errorCode).not.toBe('META_REFRESH');
    expect(res.success).toBe(true);
  });

  it('内容过短返回 CONTENT_TOO_SHORT', async () => {
    const html = `<html><body><article><p>短内容${'补'.repeat(30)}</p><div class="x1"></div><div class="x2"></div><div class="x3"></div><div class="x4"></div><div class="x5"></div><div class="x6"></div><div class="x7"></div><div class="x8"></div><div class="x9"></div><div class="x10"></div><div class="x11"></div><div class="x12"></div><div class="x13"></div><div class="x14"></div><div class="x15"></div><div class="x16"></div><div class="x17"></div><div class="x18"></div><div class="x19"></div><div class="x20"></div><div class="x21"></div></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('CONTENT_TOO_SHORT');
  });

  it('body 近空且元素稀少返回 REQUIRES_JS', async () => {
    const html = `<html><body><div id="app"></div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('REQUIRES_JS');
  });

  it('自定义 minLength 生效（低于默认 100 也可通过）', async () => {
    // 正文 >50 字：超过 REQUIRES_JS 的 50 字下限，但低于默认 minLength 100
    const body = '这是一段中等长度的正文内容用于验证自定义最小长度参数确实生效而不是走默认值这里再补充一些文字凑够五十字以上的长度。';
    const html = `<html><body><article><p>${body}</p></article></body></html>`;
    const res = await extractUrlContent(html, { minLength: 30 });
    expect(res.success).toBe(true);
  });
});

describe('extractUrlContent — 标题提取回退链', () => {
  const articleBody =
    '<p>' + '这是一段足够长的正文内容，用于通过 minLength=100 的最小长度校验。'.repeat(5) + '</p>';

  it('优先取 h1', async () => {
    const html = `<html><head><title>页面标题</title></head><body><h1>H1标题</h1><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.title).toBe('H1标题');
  });

  it('无 h1 回退 og:title', async () => {
    const html = `<html><head><meta property="og:title" content="OG标题"><title>页面标题</title></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.title).toBe('OG标题');
  });

  it('无 h1/og 回退 twitter:title', async () => {
    const html = `<html><head><meta name="twitter:title" content="Twitter标题"><title>页面标题</title></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.title).toBe('Twitter标题');
  });

  it('全部无则回退 document.title', async () => {
    const html = `<html><head><title>纯页面标题</title></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.title).toBe('纯页面标题');
  });
});

describe('extractUrlContent — 发布时间提取', () => {
  const articleBody =
    '<p>' + '这是一段足够长的正文内容，用于通过 minLength=100 的最小长度校验。'.repeat(5) + '</p>';

  it('从 article:published_time meta 提取', async () => {
    const html = `<html><head><meta property="article:published_time" content="2026-01-01T10:00:00Z"></head><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.publishDate).toBe('2026-01-01T10:00:00Z');
  });

  it('从 time[datetime] 提取', async () => {
    const html = `<html><body><time datetime="2026-02-02">2月2日</time><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.publishDate).toBe('2026-02-02');
  });

  it('从 .date class 提取', async () => {
    const html = `<html><body><span class="date">2026年3月3日</span><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.publishDate).toBe('2026年3月3日');
  });

  it('无任何日期来源返回空字符串', async () => {
    const html = `<html><body><article>${articleBody}</article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.publishDate).toBe('');
  });
});

describe('extractUrlContent — 噪声细分与配图/注释', () => {
  const articleBody =
    '<p>' + '这是一段足够长的正文内容，用于通过 minLength=100 的最小长度校验。'.repeat(5) + '</p>';

  it('剥离 hidden 属性元素', async () => {
    const html = `<html><body><article>${articleBody}<div hidden>隐藏正文</div></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('隐藏正文');
  });

  it('剥离 aria-label 含 share 的元素', async () => {
    const html = `<html><body><article>${articleBody}<div aria-label="Share this article">分享按钮</div></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('分享按钮');
  });

  it('剥离 NAV 等噪声标签', async () => {
    const html = `<html><body><article>${articleBody}<nav>导航菜单项</nav></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('导航菜单项');
  });

  it('剥离 id 含 sponsor 的元素', async () => {
    const html = `<html><body><article>${articleBody}<div id="sponsor">赞助内容块</div></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('赞助内容块');
  });

  it('保留 img alt 作为配图说明', async () => {
    const html = `<html><body><article>${articleBody}<img alt="一张示意图" src="x.png"></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content).toContain('【配图说明】');
    expect(res.content).toContain('一张示意图');
  });

  it('移除 HTML 注释节点', async () => {
    const html = `<html><body><article>${articleBody}<!-- 这是注释不应出现 --></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('这是注释不应出现');
  });

  it('无语义容器时回退到 body 提取', async () => {
    const html = `<html><body><div class="wrapper">${articleBody}</div></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.success).toBe(true);
    expect(res.content!.length).toBeGreaterThanOrEqual(100);
  });

  it('script/style 标签内容被移除', async () => {
    const html = `<html><body><article>${articleBody}<script>var x=1;</script><style>.a{}</style></article></body></html>`;
    const res = await extractUrlContent(html);
    expect(res.content).not.toContain('var x=1');
    expect(res.content).not.toContain('.a{}');
  });
});
