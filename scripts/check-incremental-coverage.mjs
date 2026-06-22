#!/usr/bin/env node

/**
 * 增量覆盖率门禁脚本
 *
 * 检查 git diff 中变更的源码行是否达到最低覆盖率要求。
 * 用法：node scripts/check-incremental-coverage.mjs [--base <ref>] [--threshold <pct>]
 *
 * 参数：
 *   --base       基准分支/提交（默认: origin/main，不存在则用 HEAD~1）
 *   --threshold  最低行覆盖率百分比（默认: 60）
 *
 * 退出码：
 *   0 = 通过  1 = 未通过  2 = 运行错误
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';

// ─── 参数解析 ───

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const threshold = parseFloat(getArg('threshold', '60'));
const COVERAGE_FILE = 'coverage/coverage-final.json';
const SRC_PREFIX = 'src/';

// ─── 确定 base ref ───

function resolveBaseRef() {
  const explicit = getArg('base', null);
  if (explicit) return explicit;

  // 尝试 origin/main
  try {
    execSync('git rev-parse origin/main', { stdio: 'pipe' });
    return 'origin/main';
  } catch {
    // fallback to HEAD~1
    return 'HEAD~1';
  }
}

const baseRef = resolveBaseRef();

// ─── 解析 git diff 获取变更行 ───

/**
 * 从 unified diff 中解析变更的行号
 * @param {string} diffOutput
 * @returns {Map<string, Set<number>>} 文件路径 → 变更行号集合
 */
function parseChangedLines(diffOutput) {
  const result = new Map();
  let currentFile = null;
  const fileRegex = /^\+\+\+ b\/(.+)$/;
  const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

  for (const line of diffOutput.split('\n')) {
    const fileMatch = line.match(fileRegex);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, new Set());
      continue;
    }

    const hunkMatch = line.match(hunkRegex);
    if (hunkMatch && currentFile) {
      const startLine = parseInt(hunkMatch[1], 10);
      const count = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const lineSet = result.get(currentFile);
      for (let i = startLine; i < startLine + count; i++) {
        lineSet.add(i);
      }
    }
  }

  return result;
}

// ─── 计算增量覆盖率 ───

/**
 * 计算指定文件中变更行的覆盖率
 * @param {object} coverageData Istanbul 格式的单文件覆盖率数据
 * @param {Set<number>} changedLines 变更行号集合
 * @returns {{ total: number, covered: number, uncoveredLines: number[] }}
 */
function calcIncrementalCoverage(coverageData, changedLines) {
  const { statementMap, s } = coverageData;
  let total = 0;
  let covered = 0;
  const uncoveredLines = [];

  for (const [stmtId, location] of Object.entries(statementMap)) {
    const startLine = location.start.line;
    const endLine = location.end.line;

    // 检查此语句是否与变更行有交集
    let intersects = false;
    for (let line = startLine; line <= endLine; line++) {
      if (changedLines.has(line)) {
        intersects = true;
        break;
      }
    }

    if (intersects) {
      total++;
      const execCount = s[stmtId];
      if (execCount > 0) {
        covered++;
      } else {
        // 记录未覆盖的起始行
        if (!uncoveredLines.includes(startLine)) {
          uncoveredLines.push(startLine);
        }
      }
    }
  }

  return { total, covered, uncoveredLines };
}

// ─── 主流程 ───

function main() {
  console.log(`\n📊 增量覆盖率门禁`);
  console.log(`   基准: ${baseRef}`);
  console.log(`   阈值: ${threshold}%\n`);

  // 1. 获取变更文件列表
  let diffOutput;
  try {
    diffOutput = execSync(`git diff ${baseRef} --unified=0 -- 'src/*.ts'`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    console.error(`❌ 无法执行 git diff: ${e.message}`);
    process.exit(2);
  }

  if (!diffOutput.trim()) {
    console.log('ℹ️  src/ 下没有文件变更，跳过检查。');
    process.exit(0);
  }

  const changedLinesMap = parseChangedLines(diffOutput);

  // 只保留 src/ 下的 .ts 文件（排除测试和配置）
  const changedSrcFiles = [...changedLinesMap.keys()].filter(
    (f) => f.startsWith(SRC_PREFIX) && f.endsWith('.ts'),
  );

  if (changedSrcFiles.length === 0) {
    console.log('ℹ️  src/ 下没有 TypeScript 文件变更，跳过检查。');
    process.exit(0);
  }

  console.log(`📁 变更文件: ${changedSrcFiles.length} 个\n`);

  // 2. 读取覆盖率数据
  if (!existsSync(COVERAGE_FILE)) {
    console.error(`❌ 覆盖率文件不存在: ${COVERAGE_FILE}`);
    console.error('   请先运行: npm run test:coverage');
    process.exit(2);
  }

  let coverageReport;
  try {
    coverageReport = JSON.parse(readFileSync(COVERAGE_FILE, 'utf-8'));
  } catch (e) {
    console.error(`❌ 无法解析覆盖率文件: ${e.message}`);
    process.exit(2);
  }

  // 3. 逐文件检查
  let allPassed = true;
  const projectRoot = resolve('.');

  for (const relPath of changedSrcFiles) {
    const absPath = resolve(projectRoot, relPath);
    const coverageData = coverageReport[absPath];
    const changedLines = changedLinesMap.get(relPath);

    if (!coverageData) {
      // 文件不在覆盖率报告中（可能是新文件或已排除）
      console.log(`  ⚠️  ${relPath} — 不在覆盖率报告中（已排除或新增）`);
      continue;
    }

    if (!changedLines || changedLines.size === 0) {
      continue;
    }

    const { total, covered, uncoveredLines } = calcIncrementalCoverage(coverageData, changedLines);

    if (total === 0) {
      console.log(`  ⏭  ${relPath} — 无可检查语句（纯类型/接口变更）`);
      continue;
    }

    const pct = ((covered / total) * 100).toFixed(1);
    const icon = parseFloat(pct) >= threshold ? '✅' : '❌';

    if (parseFloat(pct) < threshold) {
      allPassed = false;
    }

    console.log(`  ${icon} ${relPath}`);
    console.log(`     变更语句: ${total}  已覆盖: ${covered}  覆盖率: ${pct}%`);

    if (uncoveredLines.length > 0 && uncoveredLines.length <= 10) {
      console.log(`     未覆盖行: ${uncoveredLines.sort((a, b) => a - b).join(', ')}`);
    } else if (uncoveredLines.length > 10) {
      const sorted = uncoveredLines.sort((a, b) => a - b);
      console.log(`     未覆盖行: ${sorted.slice(0, 10).join(', ')} ... (共 ${sorted.length} 行)`);
    }
  }

  // 4. 总结
  console.log('');
  if (allPassed) {
    console.log(`✅ 增量覆盖率门禁通过（阈值: ${threshold}%）`);
    process.exit(0);
  } else {
    console.log(`❌ 增量覆盖率门禁未通过（阈值: ${threshold}%）`);
    console.log('   请为变更的代码补充测试。');
    process.exit(1);
  }
}

main();
