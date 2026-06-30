/**
 * 版本号升级脚本
 * 用法: node scripts/version-bump.mjs <新版本号>
 *
 * 同步更新 manifest.json / package.json / versions.json 三处版本号。
 * 版本号格式: x.y.z（纯数字，不带 v 前缀）
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: node scripts/version-bump.mjs <版本号>  例如: node scripts/version-bump.mjs 2.1.3');
  process.exit(1);
}

// manifest.json
{
  const path = resolve(root, 'manifest.json');
  const m = JSON.parse(readFileSync(path, 'utf-8'));
  const old = m.version;
  m.version = version;
  writeFileSync(path, JSON.stringify(m, null, '\t') + '\n');
  console.log(`✓ manifest.json: ${old} → ${version}`);
}

// package.json
{
  const path = resolve(root, 'package.json');
  const p = JSON.parse(readFileSync(path, 'utf-8'));
  p.version = version;
  writeFileSync(path, JSON.stringify(p, null, '\t') + '\n');
  console.log(`✓ package.json: → ${version}`);
}

// versions.json
{
  const path = resolve(root, 'versions.json');
  const v = JSON.parse(readFileSync(path, 'utf-8'));
  v[version] = '1.0.0';
  writeFileSync(path, JSON.stringify(v, null, '\t') + '\n');
  console.log(`✓ versions.json: + "${version}"`);
}

// JSON 语法校验
{
  const files = ['manifest.json', 'package.json', 'versions.json'];
  let ok = true;
  for (const name of files) {
    try {
      JSON.parse(readFileSync(resolve(root, name), 'utf-8'));
      console.log(`✓ ${name} JSON 语法正确`);
    } catch (e) {
      console.error(`✗ ${name} JSON 语法错误: ${e.message}`);
      ok = false;
    }
  }
  if (!ok) {
    console.error('\n请先修复 JSON 语法错误再提交！');
    process.exit(1);
  }
}

console.log(`\n版本号已升级到 ${version}。下一步：`);
console.log(`  npm run build && npm test`);
console.log(`  git add manifest.json package.json versions.json`);
console.log(`  git commit -m "build: ${version}"`);
console.log(`  git tag ${version} && git push && git push --tags`);
