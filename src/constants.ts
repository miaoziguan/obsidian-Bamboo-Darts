/**
 * 集中管理所有魔法数字
 * 从各个模块提取硬编码数值，统一管理便于调整
 */

/** 内容最小长度——硬阻断（质量门控） */
export const GATE_MIN_CONTENT_LENGTH = 50;

/** 内容最小长度——警告但允许继续（质量门控） */
export const GATE_WARN_CONTENT_LENGTH = 200;

/** 内容最大长度（质量门控） */
export const MAX_CONTENT_LENGTH = 50000;

/** 重复内容相似度阈值（质量门控） */
export const GATE_DUPLICATE_THRESHOLD = 0.5;

/** 信息密度——警告阈值（fallback 默认值，实际由 ProfileConfig 覆盖） */
export const GATE_WARN_DENSITY = 0.50;

/** 信息密度——硬阻断阈值（fallback 默认值，实际由 ProfileConfig 覆盖） */
export const GATE_MIN_DENSITY = 0.15;

/** 噪声占比——警告阈值 */
export const GATE_WARN_NOISE_RATIO = 0.4;

/** 噪声占比——硬阻断阈值 */
export const GATE_MAX_NOISE_RATIO = 0.7;

/** AI 调用的 temperature 参数 */
export const AI_TEMPERATURE = 0.3;

/** 提炼整体超时（毫秒），超时后自动中止 */
export const EXTRACTION_TIMEOUT_MS = 5 * 60 * 1000;

/** 输入截断长度（限制发送给 AI 的文本量） */
export const INPUT_TRUNCATE_LENGTH = 10000;

/** 文件名最大长度 */
export const MAX_FILENAME_LENGTH = 100;

/** 最短笔记内容长度（子弹笔记允许短内容，但不能为空） */
export const MIN_NOTE_CONTENT_LENGTH = 10;

/** 知识库去重并行批次大小 */
export const DEDUP_BATCH_SIZE = 20;

/** 内容核查：单次最大可验证声明数量 */
export const MAX_CLAIMS_PER_CHECK = 30;

/** 去重缓存 TTL（毫秒） */
export const DEDUP_CACHE_TTL = 5 * 60 * 1000;

/** 去重/关键词提取共用停用词表 */
export const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这',
  // 扩充常用中文虚词
  '他', '她', '它', '们', '吗', '呢', '吧', '啊', '哦', '嗯',
  '把', '被', '让', '给', '从', '向', '往', '对', '比', '跟',
  '那', '哪', '什么', '怎么', '为什么', '谁', '怎样', '如何',
  '可以', '能', '可能', '应该', '需要', '已经', '正在', '还是',
  '但是', '而且', '因为', '所以', '如果', '虽然', '然后', '或者',
  // English stop words
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'it', 'its', 'this', 'that', 'these', 'those', 'they', 'we', 'he', 'she',
  'his', 'her', 'our', 'your', 'their', 'has', 'have', 'had', 'do', 'does',
]);

// ─── 去重模块常量 ───

/** 最小 token 数：低于此值的笔记不参与重复判定 */
export const MIN_TOKENS_THRESHOLD = 3;

/** 同批去重相似度阈值（余弦相似度） */
export const CROSS_BATCH_THRESHOLD = 0.65;

/** IDF 平滑常量 */
export const IDF_SMOOTH = 1.0;

/** 长度比预过滤阈值：两篇长度差距超过此比例则跳过比对 */
export const LENGTH_RATIO_THRESHOLD = 0.3;

/** 知识库去重：标题相似度权重 */
export const TITLE_WEIGHT = 0.25;

/** 知识库去重：内容相似度权重 */
export const CONTENT_WEIGHT = 0.75;

/** 短笔记放大阈值（字符数），短笔记 token 稀疏需放大相似度 */
export const SHORT_NOTE_LENGTH = 100;

/** 短笔记放大系数：短笔记 token 稀疏，相似度乘以该系数进行补偿 */
export const SHORT_NOTE_BOOST_FACTOR = 1.15;
