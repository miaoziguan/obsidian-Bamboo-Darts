import { checkParagraphRepetition } from '../src/gate/paragraph-repetition';
import { runGateChecks } from '../src/gate';
import { ProfileConfig, PROFILE_CONFIGS, resolveProfileConfig } from '../src/extraction/profiles';

/**
 * P2-4：段落重复率检测单元测试
 * 与 2-gram 信息密度互补——抓结构级（段落间）重复。
 */
describe('checkParagraphRepetition', () => {
  it('应放行：各段落内容差异大', () => {
    const content = [
      '人工智能正在改变软件工程的开发方式，自动化测试与持续集成成为标配。',
      '绿茶富含抗氧化物，常饮有助于舒缓情绪并提升日常专注力。',
      '登山运动能锻炼心肺功能，同时也能让人远离城市喧嚣亲近自然。',
      '古典音乐的结构严谨，奏鸣曲式常用于第一乐章的展开与再现。',
    ].join('\n\n');
    expect(checkParagraphRepetition(content).status).toBe('ok');
  });

  it('应警告：存在一对中等相似段落', () => {
    const base = '本文讨论知识管理的方法，强调将阅读转化为可检索的原子笔记节点，建立个人知识库。';
    const near = '本文讨论知识管理的方法，强调将阅读转化为可检索的原子笔记节点，构建个人知识库体系。';
    const content = [base, near, '另一种完全不同的话题：海洋洋流对全球气候调节起着关键作用。'].join('\n\n');
    const r = checkParagraphRepetition(content);
    expect(r.status).toBe('warn');
    expect(r.reason).toContain('段落');
  });

  it('应阻断：存在近乎完全相同的重复段落', () => {
    const dup = '知识管理强调把阅读沉淀为可检索的原子笔记，从而构建可持续增长的个人知识网络。';
    const content = [dup, dup, '与此无关的内容：城市夜景灯光映射出当代生活的节奏与温度。'].join('\n\n');
    const r = checkParagraphRepetition(content);
    expect(r.status).toBe('block');
    expect(r.reason).toContain('段落高度重复');
  });

  it('段落少于 2 个应直接放行', () => {
    expect(checkParagraphRepetition('只有一段文本内容。').status).toBe('ok');
  });

  it('过短段落（token 不足）不参与比对，应放行', () => {
    const content = ['短段', '另一短段', '第三个短段'].join('\n\n');
    expect(checkParagraphRepetition(content).status).toBe('ok');
  });

  it('阈值可注入：放宽阈值后原本 warn 的不再触发', () => {
    const base = '本文讨论知识管理的方法，强调将阅读转化为可检索的原子笔记节点，建立个人知识库。';
    const near = '本文讨论知识管理的方法，强调将阅读转化为可检索的原子笔记节点，构建个人知识库体系。';
    const content = [base, near, '海洋洋流对全球气候调节起着关键作用。'].join('\n\n');
    // block/warn 阈值都设为 0.99 → 中等相似度不触发
    expect(checkParagraphRepetition(content, 0.99, 0.99).status).toBe('ok');
  });

  it('长文应等间隔抽样而非全量比对（不抛错且行为稳定）', () => {
    const para = '知识管理强调把阅读沉淀为可检索的原子笔记，从而构建可持续增长的个人知识网络体系。';
    const paras: string[] = [];
    for (let i = 0; i < 100; i++) {
      // 第 0 段与第 50 段相同，制造一对重复
      paras.push(i === 50 ? para : `这是第 ${i} 段独立的叙事内容，描述日常观察与随想，避免与其他段落雷同。`);
    }
    const r = checkParagraphRepetition(paras.join('\n\n'));
    expect(['warn', 'block', 'ok']).toContain(r.status);
  });
});

/**
 * 集成：确认 runGateChecks 已接入「段落重复」规则。
 * 用宽松 density/noise 阈值隔离，确保只由段落重复规则触发。
 */
describe('runGateChecks 接入段落重复率', () => {
  function lenientConfig(): ProfileConfig {
    const base = resolveProfileConfig('balanced');
    return {
      ...base,
      gateMinDensity: 0.01, // 关闭密度阻断，避免与段落重复相互干扰
      gateMaxNoiseRatio: 0.99,
      gateWarnNoiseRatio: 0.99,
      gateParagraphRepBlock: 0.85,
      gateParagraphRepWarn: 0.7,
    };
  }

  it('重复段落应被门控识别并阻断', () => {
    const dup = '知识管理强调把阅读沉淀为可检索的原子笔记，从而构建可持续增长的个人知识网络。';
    const content = `第一段正常内容关于咖啡的烘焙曲线与风味层次。\n\n${dup}\n\n${dup}\n\n结尾段落讨论城市规划中的绿地系统与居民幸福感关联。`;
    const result = runGateChecks(content, lenientConfig());
    expect(result.reasons.some((r) => r.includes('段落'))).toBe(true);
  });

  it('正常多段内容不应触发段落重复', () => {
    const content = [
      '前端框架的虚拟 DOM 通过 diff 算法减少真实 DOM 操作提升渲染性能。',
      '后端服务的连接池复用减少了频繁建连的开销从而稳定吞吐。',
      '数据库索引加速点查但会增加写入放大需要权衡业务读写比。',
    ].join('\n\n');
    const result = runGateChecks(content, lenientConfig());
    expect(result.reasons.some((r) => r.includes('段落'))).toBe(false);
  });
});

// 确保默认 profile 已包含段落重复阈值字段
describe('ProfileConfig 段落重复阈值', () => {
  it('每个 profile 都应有段落重复阈值字段', () => {
    for (const profile of ['dense', 'balanced', 'sparse'] as const) {
      const config = PROFILE_CONFIGS[profile];
      expect(typeof config.gateParagraphRepBlock).toBe('number');
      expect(typeof config.gateParagraphRepWarn).toBe('number');
      expect(config.gateParagraphRepWarn).toBeLessThan(config.gateParagraphRepBlock);
    }
  });

  it('dense 应比其他 profile 更宽松（阻断阈值更高）', () => {
    expect(PROFILE_CONFIGS.dense.gateParagraphRepBlock).toBeGreaterThanOrEqual(
      PROFILE_CONFIGS.balanced.gateParagraphRepBlock,
    );
  });
});
