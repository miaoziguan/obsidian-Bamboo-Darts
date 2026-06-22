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
