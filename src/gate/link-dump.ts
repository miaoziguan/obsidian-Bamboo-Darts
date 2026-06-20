import { GateResult, ok, warn, block } from './types';

const LINK_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/g,
  /www\.\S+\.\S+/g,
];

const NAV_SEPARATOR_PATTERN = /\s*[|·•»›▸→]\s*/g;

export function checkLinkDump(
  content: string,
  linkBlockRatio?: number,
  linkBlockDensity?: number
): GateResult {
  if (content.length < 100) return ok();

  const blockRatio = linkBlockRatio ?? 0.4;
  const blockDensity = linkBlockDensity ?? 1.0;

  let linkCount = 0;
  let linkChars = 0;
  for (const pattern of LINK_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      linkCount += matches.length;
      linkChars += matches.reduce((sum, m) => sum + m.length, 0);
    }
  }

  const navMatches = content.match(NAV_SEPARATOR_PATTERN);
  const navSeparators = navMatches ? navMatches.length : 0;

  const linkRatio = linkChars / content.length;
  const linkDensityVal = linkCount / (content.length / 100);

  if (linkRatio > blockRatio && linkCount >= 5 && linkDensityVal > blockDensity) {
    return block(`内容中链接占比过高（${(linkRatio * 100).toFixed(0)}%，${linkCount} 个链接），可能为导航页而非文章`);
  }

  if (navSeparators >= 5) {
    return warn(`检测到多处导航分隔符（${navSeparators} 处），内容可能为导航栏或菜单`);
  }

  if (linkDensityVal > 0.5 && linkCount >= 5) {
    return warn(`内容包含较多链接（${linkCount} 个），可能不是文章正文`);
  }

  return ok();
}
