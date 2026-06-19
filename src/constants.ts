/**
 * 集中管理所有魔法数字
 * 从各个模块提取硬编码数值，统一管理便于调整
 */

/** 相似度阈值（同批交叉去重 & 知识库比对） */
export const SIMILARITY_THRESHOLD = 0.5;

/** 内容最小长度——硬阻断（质量门控） */
export const GATE_MIN_CONTENT_LENGTH = 50;

/** 内容最小长度——警告但允许继续（质量门控） */
export const GATE_WARN_CONTENT_LENGTH = 200;

/** 内容最大长度（质量门控） */
export const MAX_CONTENT_LENGTH = 50000;

/** 重复内容相似度阈值（质量门控） */
export const GATE_DUPLICATE_THRESHOLD = 0.5;

/** 信息密度——警告阈值（去重词数/总词数） */
export const GATE_WARN_DENSITY = 0.3;

/** 信息密度——硬阻断阈值 */
export const GATE_MIN_DENSITY = 0.1;

/** 噪声占比——警告阈值 */
export const GATE_WARN_NOISE_RATIO = 0.4;

/** 噪声占比——硬阻断阈值 */
export const GATE_MAX_NOISE_RATIO = 0.7;

/** AI 调用的 temperature 参数 */
export const AI_TEMPERATURE = 0.3;

/** 输入截断长度（限制发送给 AI 的文本量） */
export const INPUT_TRUNCATE_LENGTH = 10000;

/** 文件名最大长度 */
export const MAX_FILENAME_LENGTH = 100;

/** 最短笔记内容长度（子弹笔记允许短内容，但不能为空） */
export const MIN_NOTE_CONTENT_LENGTH = 10;

/** 知识库去重并行批次大小 */
export const DEDUP_BATCH_SIZE = 20;

/** 去重最小关键词门槛——低于此值不判定重复，避免小集合误判 */
export const DEDUP_MIN_KEYWORDS = 3;

/** 数据核查：单次最大数据点数量 */
export const MAX_DATA_POINTS_PER_CHECK = 30;

/** 事实核查：单次最大事实数量 */
export const MAX_FACTS_PER_CHECK = 20;

/** 原文截断阈值（与 INPUT_TRUNCATE_LENGTH 对齐，避免 Phase 5 核查盲区） */
export const ORIGINAL_TEXT_CHUNK_SIZE = 10000;

/** 【新版去重】高相似度阈值（几乎重复） */
export const DEDUP_HIGH_THRESHOLD = 0.70;

/** 【新版去重】中相似度阈值（主题接近） */
export const DEDUP_MID_THRESHOLD = 0.45;

/** 【新版去重】弱相关阈值（有部分术语重合） */
export const DEDUP_WEAK_THRESHOLD = 0.30;

/** 【新版去重】最小 corpus 大小（低于此值降级为纯 TF 余弦） */
export const DEDUP_CORPUS_MIN_SIZE = 20;

/** 【新版去重】缓存 TTL（毫秒） */
export const DEDUP_CACHE_TTL = 5 * 60 * 1000;

/** 【新版去重】TOP-K 相似匹配返回数量 */
export const DEDUP_TOP_K = 3;
