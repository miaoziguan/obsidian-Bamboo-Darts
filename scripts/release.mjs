/**
 * 一键发布脚本（官方 check-release 自助流程）
 *
 * 流程：
 *   1. 读取 manifest.json 的 version 作为发布版本号
 *   2. 推送 main 分支与 tag 到 GitHub
 *   3. 用 gh CLI 创建 GitHub Release（含 main.js / manifest.json / styles.css）
 *   4. 提示去 community.obsidian.md 后台 check-release 页面校验发布
 *
 * 用法:
 *   node scripts/release.mjs            # 正常发布（已打好的 git tag）
 *   node scripts/release.mjs --dry-run  # 仅打印将要执行的命令，不真正执行
 *   node scripts/release.mjs --notes "自定义说明"
 *
 * 前置:
 *   - 已先运行 node scripts/version-bump.mjs <版本> 并 git commit
 *   - 已 git tag <版本>
 *   - gh CLI 已登录（gh auth status）
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── 参数解析 ───
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const notesIdx = args.indexOf('--notes');
const customNotes = notesIdx !== -1 ? args[notesIdx + 1] : null;

// ─── 读取版本号 ───
const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const VERSION = manifest.version;

if (!VERSION || !/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error(`✗ manifest.json 版本号无效: "${VERSION}"`);
  process.exit(1);
}

// ─── 待上传产物 ───
const ASSETS = ['main.js', 'manifest.json', 'styles.css'];
const missing = ASSETS.filter((f) => !existsSync(resolve(root, f)));
if (missing.length) {
  console.error(`✗ 缺少产物文件（请先 npm run build）: ${missing.join(', ')}`);
  process.exit(1);
}

const NOTES = customNotes || `Release ${VERSION}`;
const RELEASE_TITLE = `v${VERSION}`;

// ─── 执行辅助 ───
function run(cmd) {
  console.log(`\n$ ${cmd}`);
  if (DRY_RUN) return;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: root });
  } catch (e) {
    console.error(`✗ 命令失败: ${cmd}`);
    process.exit(1);
  }
}

console.log(`\n🚀 发布 ${VERSION} ${DRY_RUN ? '(dry-run)' : ''}`);

// 1. 推送代码与 tag
run('git push origin main');
run('git push origin --tags');

// 2. 创建 GitHub Release（先删除同名旧 release，避免重复）
const assetArgs = ASSETS.map((f) => resolve(root, f)).join(' ');
run(
  `gh release delete ${VERSION} --yes || true`
);
run(
  `gh release create ${VERSION} ` +
    `--title "${RELEASE_TITLE}" ` +
    `--notes "${NOTES}" ` +
    `--target main ` +
    `${assetArgs}`
);

console.log(`\n✅ ${VERSION} 已推送并创建 GitHub Release`);
console.log(`   下一步: 打开 https://community.obsidian.md/account/plugins/atomic-notes-extractor/check-release 校验发布`);
