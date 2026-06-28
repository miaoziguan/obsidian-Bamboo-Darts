/**
 * 介绍面板的结构化内容数据
 *
 * 从 panel-view.ts 的 renderAboutPanel 中提取，减少主文件的渲染代码量。
 */

export interface AboutPhase {
  phase: string;
  name: string;
  desc: string;
}

export const ABOUT_PHASES: AboutPhase[] = [
  ['Phase 1', '读取内容', '从文本、URL 或剪贴板获取原始内容（URL 经 100+ 选择器降噪）'],
  ['Phase 2', '质量门控', '多维规则前置过滤低质/噪声内容，累积≥3条警告升级阻断'],
  ['Phase 3', 'AI 提炼', '调用配置的大模型将内容拆解为原子笔记，5xx/网络错误自动重试'],
  ['Phase 4', '同批去重', 'BM25 + 分词 + 余弦相似度，检测同批次高度相似笔记'],
  [
    'Phase 4b',
    '知识库去重',
    'SimHash 指纹预过滤 + BM25 余弦；开启语义去重（Beta）后，对可疑重复调用腾讯混元向量模型精判',
  ],
  ['Phase 5', '内容核查', '三层管线：原文溯源 → 语义比对 → 超源标记'],
  ['Phase 6', '笔记复查', '洞见 + 知识直加（2-10），四级制分级过滤'],
];

export const ABOUT_PROGRESS: [string, string][] = [
  ['Phase 1', '输入文本读取'],
  ['Phase 2', '质量门控判定'],
  ['Phase 3', 'AI 调用与笔记拆解'],
  ['Phase 4 / 4b', '去重计算（含语义精判）'],
  ['Phase 5', '内容核查（三层管线）'],
  ['Phase 6', '复查评分'],
];

export const ABOUT_GATE_RULES: [string, string, string][] = [
  ['长度', '< 50 字', '50-200 字'],
  ['信息密度', '< 15%（严重稀疏）', '< 50%（偏稀疏）'],
  ['噪声占比', '> 70%（乱码）', '> 40%'],
  ['HTML 残留', '≥ 5 个标记', '2-4 个标记'],
  ['乱码', '≥ 3 个片段', '≥ 1 个片段'],
  ['链接堆砌', '占比 > 40% 且 ≥ 5 个链接', '占比偏高'],
  ['广告/低质', '≥ 3 个关键词', '1-2 个关键词'],
  ['综合', '累积 ≥ 3 条警告升级阻断', '—'],
];

export const ABOUT_VERIFY_STATUS: [string, string][] = [
  ['已溯源', '声明与原文一致或可推导'],
  ['需对比', '部分相关但存在差异，需人工确认'],
  ['超源', '声明超出原文范围，无法直接验证'],
];

export const ABOUT_SCORE_DIMS: [string, string][] = [
  ['洞见价值', '是否包含独立见解、反直觉判断或有价值的观点'],
  ['知识价值', '是否提供可学习的新领域知识或方法论'],
];

export const ABOUT_DISCOVERY_FEATURES: [string, string][] = [
  ['发现索引', '自动缓存笔记特征（标题、关键词、内容哈希），发现 Tab 无需重复读文件'],
  ['MMR 多样性重排', '推荐结果自动平衡相关度与多样性，避免推荐列表扎堆'],
  ['参数化配置', '发现 Tab 的候选池大小、相似度门槛、推荐数量均可自定义'],
];
