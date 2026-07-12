/**
 * 提炼管线依赖注入（DI）类型定义
 *
 * 用于在测试中将下游依赖（Phase 3-6 的真实模块）替换为可控实现，
 * 从而精确驱动编排层的「成功 / 失败 / 降级 / 过滤」分支。
 *
 * 生产环境不传 deps，所有调用回退到真实实现（见 extractor.ts）。
 * 类型集中在此文件，避免 extractor.ts 与下游模块形成额外循环依赖。
 */

import type { Vault } from 'obsidian';
import type { AtomicNote } from '../utils/notes-standards';
import type { ExtractorConfig } from '../extractor';
import type { DedupResult, DuplicateInfo, VaultMatchInfo } from '../deduplicator';
import type { SemanticDedupManager } from '../utils/embedding';
import type { ContentProfile, ProfileConfig } from './profiles';
import type { ReviewConfig, ReviewResult } from '../review/note-reviewer';
import type { ProgressTracker } from './progress';

/** Phase 3：AI 提炼（普通模式） */
export type ExtractAtomicNotesFn = (
  content: string,
  config: Partial<ExtractorConfig>,
) => Promise<{ success: boolean; notes?: AtomicNote[]; error?: string }>;

/** Phase 3：深度模式分段提炼 */
export type ExtractChunkedFn = (
  content: string,
  config: ExtractorConfig,
  truncateLength: number,
  tracker: ProgressTracker,
) => Promise<AtomicNote[]>;

/** Phase 4：同批交叉去重 */
export type CrossCheckBatchFn = (
  notes: AtomicNote[],
  threshold?: number,
) => Promise<DedupResult>;

/** Phase 4b：知识库去重比对 */
export type CheckAgainstVaultDetailedFn = (
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string,
  cacheManager: unknown,
  semanticManager?: SemanticDedupManager,
  onSemanticProgress?: unknown,
) => Promise<VaultMatchInfo[]>;

/** Phase 5：内容核查 */
export type VerifyClaimsFn = (
  truncatedContent: string,
  notes: AtomicNote[],
  config: unknown,
  fullContent?: string,
) => Promise<{
  traced: number;
  needsCompare: number;
  outOfScope: number;
  error?: string;
}>;

/** Phase 6：笔记复查 */
export type ReviewNotesFn = (
  notes: AtomicNote[],
  config: ReviewConfig,
) => Promise<{ reviewedNotes: AtomicNote[]; reviewDetails: ReviewResult[]; success: boolean }>;

/** 纯函数（Phase 2 / profile 分类），可选注入以覆盖分类分支 */
export type ClassifyContentFn = (text: string) => ContentProfile;
export type ResolveProfileConfigFn = (
  profile: ContentProfile,
  overrides?: Partial<Record<ContentProfile, Partial<ProfileConfig>>>,
) => ProfileConfig;
export type RunGateChecksFn = (
  content: string,
  profileConfig: ProfileConfig,
  inputType: string,
) => { passed: boolean; summary: string; reasons: string[]; warnings: string[] };

/**
 * 提炼管线可注入依赖集合（全部可选）。
 * 任何一个未提供时，extractor.ts 回退到对应真实实现。
 */
export interface ExtractionDeps {
  extractAtomicNotes?: ExtractAtomicNotesFn;
  extractChunked?: ExtractChunkedFn;
  crossCheckBatch?: CrossCheckBatchFn;
  checkAgainstVaultDetailed?: CheckAgainstVaultDetailedFn;
  verifyClaims?: VerifyClaimsFn;
  reviewNotes?: ReviewNotesFn;
  classifyContent?: ClassifyContentFn;
  resolveProfileConfig?: ResolveProfileConfigFn;
  runGateChecks?: RunGateChecksFn;
}

/** 重新导出 DuplicateInfo 供测试构造 pending 数据时使用 */
export type { DuplicateInfo };
