/**
 * 集中管理所有魔法数字
 * 从各个模块提取硬编码数值，统一管理便于调整
 */

/** 内容最小长度——硬阻断（质量门控） */
export const GATE_MIN_CONTENT_LENGTH = 50;

/** 信息密度——警告阈值（fallback 默认值，实际由 ProfileConfig 覆盖） */
export const GATE_WARN_DENSITY = 0.5;

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
  '的',
  '了',
  '在',
  '是',
  '我',
  '有',
  '和',
  '就',
  '不',
  '人',
  '都',
  '一',
  '一个',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  // 扩充常用中文虚词
  '他',
  '她',
  '它',
  '们',
  '吗',
  '呢',
  '吧',
  '啊',
  '哦',
  '嗯',
  '把',
  '被',
  '让',
  '给',
  '从',
  '向',
  '往',
  '对',
  '比',
  '跟',
  '那',
  '哪',
  '什么',
  '怎么',
  '为什么',
  '谁',
  '怎样',
  '如何',
  '可以',
  '能',
  '可能',
  '应该',
  '需要',
  '已经',
  '正在',
  '还是',
  '但是',
  '而且',
  '因为',
  '所以',
  '如果',
  '虽然',
  '然后',
  '或者',
  // English stop words
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'they',
  'we',
  'he',
  'she',
  'his',
  'her',
  'our',
  'your',
  'their',
  'has',
  'have',
  'had',
  'do',
  'does',
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

/** 短笔记放大阈值（字符数），短笔记 token 稀疏需放大相似度 */
export const SHORT_NOTE_LENGTH = 100;

/** 短笔记放大系数：短笔记 token 稀疏，相似度乘以该系数进行补偿 */
export const SHORT_NOTE_BOOST_FACTOR = 1.15;

// ─── BM25 参数 ───

/** BM25 k1：控制词频饱和度（值越大高频词影响越大） */
export const BM25_K1 = 1.5;
/** BM25 b：控制文档长度归一化强度（0=不归一化，1=完全归一化） */
export const BM25_B = 0.75;

// ─── SimHash 参数 ───

/** 汉明距离阈值：小于此值的对进入全量余弦比对 */
export const SIMHASH_HAMMING_THRESHOLD = 3;

// ─── 中文分词词典（高频知识/技术/观点领域词汇） ───

export const CN_WORD_DICT = new Set([
  // 抽象概念
  '系统',
  '结构',
  '机制',
  '模型',
  '模式',
  '策略',
  '方案',
  '框架',
  '算法',
  '方法',
  '理论',
  '原理',
  '规律',
  '趋势',
  '周期',
  '阶段',
  '效率',
  '性能',
  '质量',
  '成本',
  '收益',
  '风险',
  '价值',
  '优势',
  '劣势',
  '核心',
  '关键',
  '本质',
  '基础',
  '前提',
  '条件',
  '因素',
  '目标',
  '标准',
  '指标',
  '变量',
  '参数',
  '维度',
  '层次',
  '边界',
  '创新',
  '变革',
  '转型',
  '升级',
  '迭代',
  '演化',
  '进化',
  '突破',
  '颠覆',
  '重构',
  '重塑',
  '整合',
  '协同',
  '耦合',
  '解耦',
  '对齐',
  // 技术领域
  '数据',
  '信息',
  '知识',
  '信号',
  '网络',
  '接口',
  '协议',
  '缓存',
  '索引',
  '查询',
  '存储',
  '计算',
  '调度',
  '分配',
  '回收',
  '压缩',
  '编码',
  '解码',
  '加密',
  '签名',
  '认证',
  '授权',
  '路由',
  '代理',
  '容器',
  '进程',
  '线程',
  '协程',
  '管道',
  '队列',
  '堆栈',
  '内存',
  '指令',
  '流水',
  '分支',
  '循环',
  '递归',
  '回调',
  '事件',
  '状态',
  '输入',
  '输出',
  '渲染',
  '布局',
  '样式',
  '组件',
  '模块',
  '依赖',
  // AI 领域
  '模型',
  '参数',
  '权重',
  '梯度',
  '损失',
  '优化',
  '收敛',
  '泛化',
  '过拟合',
  '欠拟合',
  '正则',
  '归一',
  '激活',
  '嵌入',
  '编码器',
  '解码器',
  '注意力',
  '残差',
  '归一化',
  '分词',
  '采样',
  '推理',
  '训练',
  '预测',
  '分类',
  '回归',
  '聚类',
  '降维',
  '生成',
  '判别',
  // 商业/经济
  '市场',
  '竞争',
  '垄断',
  '壁垒',
  '定价',
  '营销',
  '品牌',
  '渠道',
  '用户',
  '客户',
  '需求',
  '供给',
  '增长',
  '利润',
  '营收',
  '规模',
  '效应',
  '杠杆',
  '边际',
  '弹性',
  '均衡',
  '激励',
  '约束',
  '博弈',
  '融资',
  '估值',
  '上市',
  '并购',
  '重组',
  '期权',
  '股权',
  '分红',
  // 认知/方法论
  '认知',
  '思维',
  '视角',
  '框架',
  '原则',
  '逻辑',
  '推理',
  '判断',
  '决策',
  '选择',
  '权衡',
  '取舍',
  '优先级',
  '注意力',
  '习惯',
  '反馈',
  '复盘',
  '迭代',
  '试错',
  '验证',
  '假设',
  '实验',
  '数据',
  '抽象',
  '简化',
  '分解',
  '组合',
  '类比',
  '迁移',
  '复用',
  '杠杆',
  // 高频动词/形容词（有独立语义的）
  '提升',
  '降低',
  '优化',
  '简化',
  '增强',
  '削弱',
  '加速',
  '延缓',
  '扩大',
  '缩小',
  '集中',
  '分散',
  '统一',
  '分离',
  '开放',
  '封闭',
  '透明',
  '模糊',
  '明确',
  '隐含',
  '直接',
  '间接',
  '主动',
  '被动',
  '静态',
  '动态',
  '线性',
  '非线性',
  '确定',
  '随机',
  '复杂',
  '简单',
]);

// ─── 语义去重（混元 Embedding）常量 ───

/** 是否启用语义去重（Beta） */
export const ENABLE_SEMANTIC_DEDUP_DEFAULT = false;

/** 混元 embedding API 地址 */
export const HUNYUAN_EMBEDDING_URL = 'https://api.hunyuan.cloud.tencent.com/hyllm/v1/embeddings';

/** 语义相似度阈值：高于此值判定为重复（默认 0.82） */
export const SEMANTIC_SIMILARITY_THRESHOLD_DEFAULT = 0.82;

/** 语义相似度阈值可调范围 */
export const SEMANTIC_THRESHOLD_MIN = 0.6;
export const SEMANTIC_THRESHOLD_MAX = 0.95;
export const SEMANTIC_THRESHOLD_STEP = 0.01;

/** 向量维度（hunyuan-embedding 为 1024） */
export const EMBEDDING_DIM = 1024;

/** 单次 embedding API 最大 batch 大小 */
export const EMBEDDING_BATCH_SIZE = 16;

// ─── 发现 Tab 常量 ───

/** 发现 Tab 默认最大参与计算笔记数 */
export const DISCOVERY_MAX_NOTES_DEFAULT = 500;

/** 发现 Tab 默认 Jaccard 相似度门槛 */
export const DISCOVERY_JACCARD_THRESHOLD_DEFAULT = 0.3;

/** 发现 Tab 默认 MMR 相关度权重 */
export const DISCOVERY_MMR_LAMBDA_DEFAULT = 0.6;

/** 发现 Tab 默认推荐数量 */
export const DISCOVERY_TOP_K_DEFAULT = 10;
