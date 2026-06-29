import { GateResult } from './types';

const ok = (): GateResult => ({ status: 'ok' });
const warn = (reason: string): GateResult => ({ status: 'warn', reason });
const block = (reason: string): GateResult => ({ status: 'block', reason });

// ─── 广告/低质关键词 ───

const COMMERCIAL_SPAM = [
  '点击这里',
  '立即购买',
  '限时优惠',
  '抢购',
  '广告',
  '推广',
  '赞助',
  '点击链接',
  // 英文广告词
  'buy now',
  'click here',
  'limited offer',
  'special offer',
  'order now',
  'shop now',
  'save big',
  'best price',
  'free trial',
  'sign up now',
  'subscribe now',
  '100% free',
  'no credit card',
  'act now',
];

const LOW_QUALITY_SIGNALS = [
  '你绝对想不到',
  '惊呆了',
  '炸裂',
  // 英文标题党
  "you won't believe",
  'shocking',
  'amazing trick',
  'this one weird trick',
  'doctors hate',
  "they don't want you to know",
];

const AD_VARIANT_PATTERNS: RegExp[] = [
  /限[时期限].{0,3}[优特惠抢]/g,
  /点击.{0,3}(这里|链接|进入)/g,
  /(?:🔥|💰|🎁|👉).{0,5}(?:优惠|抢购|福利|免费)/g,
  // 英文变体模式
  /(?:100%|FREE|LIMITED).{0,10}(?:trial|offer|time)/gi,
];

export function checkQuality(
  content: string,
  blockCount?: number,
  warnCount?: number,
  lengthFactor: number = 1,
): GateResult {
  const lower = content.toLowerCase();
  const contentLen = content.length || 1;

  // 动态阈值：内容越长，允许的低质信号越多（按千字缩放），但标题党信号权重更高
  const baseBlockThreshold = blockCount ?? 3;
  const baseWarnThreshold = warnCount ?? 1;
  const blockThreshold = Math.max(baseBlockThreshold, Math.floor(baseBlockThreshold * lengthFactor * 0.6));
  const warnThreshold = Math.max(baseWarnThreshold, Math.floor(baseWarnThreshold * lengthFactor * 0.5));

  const matchedAds = COMMERCIAL_SPAM.filter((kw) => lower.includes(kw.toLowerCase()));
  const matchedLowQ = LOW_QUALITY_SIGNALS.filter((kw) => lower.includes(kw.toLowerCase()));

  let variantHits = 0;
  const variantMatches: string[] = [];
  for (const pattern of AD_VARIANT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      variantHits += matches.length;
      variantMatches.push(...matches.slice(0, 3));
    }
  }

  const totalHits = matchedAds.length + matchedLowQ.length + variantHits;
  const hitRate = totalHits / (contentLen / 100);

  if (totalHits >= blockThreshold) {
    const allMatches = [...matchedAds, ...matchedLowQ, ...variantMatches];
    const rateInfo = hitRate >= 0.1 ? `（密度 ${hitRate.toFixed(1)}/百字）` : '';
    return block(`检测到大量低质信号（${allMatches.join('、')}）${rateInfo}，疑似为广告或营销内容`);
  }

  if (totalHits >= warnThreshold) {
    const allMatches = [...matchedAds, ...matchedLowQ, ...variantMatches];
    const rateInfo = hitRate >= 0.1 ? `（密度 ${hitRate.toFixed(1)}/百字）` : '';
    return warn(`检测到少量低质信号（${allMatches.join('、')}）${rateInfo}，建议人工确认`);
  }

  return ok();
}

// ─── 关键词堆砌 ───

const STUFFING_BLOCK_RATE = 3.0;
const STUFFING_WARN_RATE = 1.5;
const STUFFING_MIN_LENGTH = 200;
const STUFFING_MIN_COUNT = 5;

export function checkKeywordStuffing(
  content: string,
  tokenMap: Map<string, number>,
  blockRate: number = STUFFING_BLOCK_RATE,
  warnRate: number = STUFFING_WARN_RATE,
  minLength: number = STUFFING_MIN_LENGTH,
  minCount: number = STUFFING_MIN_COUNT,
  topN: number = 5,
  lengthFactor: number = 1,
): GateResult {
  if (content.length < minLength) return ok();
  if (tokenMap.size < 10) return ok();

  // 长文中专业术语自然重复更多，按长度因子放宽 rate 阈值
  const rateScale = Math.min(2.0, 1 + (lengthFactor - 1) * 0.5);
  const effectiveBlockRate = blockRate * rateScale;
  const effectiveWarnRate = warnRate * rateScale;

  const contentLen = content.length || 1;
  const sorted = [...tokenMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);

  const stuffed: Array<{ token: string; rate: number }> = [];
  for (const [token, count] of sorted) {
    if (count < minCount) break;
    const rate = count / (contentLen / 100);
    if (rate >= effectiveWarnRate) {
      stuffed.push({ token, rate });
    }
  }

  if (stuffed.length === 0) return ok();

  const maxRate = stuffed[0].rate;
  const labels = stuffed.map((s) => `"${s.token}"(${s.rate.toFixed(1)}/百字)`).join('、');

  if (maxRate >= effectiveBlockRate) {
    return block(`关键词堆砌：${labels}，疑似SEO优化内容`);
  }

  return warn(`部分短语重复频率较高：${labels}，建议人工确认`);
}
