import { describe, it, expect } from 'vitest';
import {
  classifyContent,
  resolveProfileConfig,
  PROFILE_CONFIGS,
  PROFILE_LABELS,
} from '../src/extraction/profiles';

// ─── classifyContent 测试 ───

describe('classifyContent', () => {
  it('包含代码块的文章应分类为 dense', () => {
    const text = `这是一篇关于 JavaScript 异步编程的技术文章。

\`\`\`javascript
async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}
\`\`\`

通过 async/await 语法可以大幅简化异步代码的编写。`;
    expect(classifyContent(text)).toBe('dense');
  });

  it('通用文章应分类为 balanced', () => {
    const text = `现代城市规划需要综合考虑多方面因素。交通便利性是影响居民生活质量的重要指标之一。
合理的公共交通网络设计可以有效减少私家车使用，降低城市碳排放。同时，绿化覆盖率也与居民的身心健康密切相关。
研究表明，居住在绿化较好的社区的居民，其压力水平明显较低，幸福感更高。因此，城市规划者应当在基础设施建设与生态保护之间找到平衡点。`;
    expect(classifyContent(text)).toBe('balanced');
  });

  it('叙事性强的长段落文章应分类为 sparse', () => {
    // 段落平均 > 300 字 且叙事词密度 ≥ 2/千字 → sparse
    // 需要每段 > 300 字，因此拼接足够长的叙事段落
    const paragraph = '然而她仿佛依然沉浸在自己的回忆之中，默默地望着窗外那渐渐远去的山峦，心中涌起了一股难以言喻的感伤，那些被岁月冲刷却依然清晰的记忆如同潮水般涌来。' +
      '忽然一阵清风缓缓吹来，带着淡淡的花香，让她不禁想起了那年夏天在乡下的故事，那些曾经以为已经忘却的往事，' +
      '如今却仿佛历历在目，每一个细节都清晰地浮现在脑海之中，那些温暖的午后和宁静的黄昏里发生的一切。她轻轻地叹了口气，似乎那些深深的思绪依然没有散去，' +
      '目光缓缓移向远方那座若隐若现的山峰，仿佛在寻找着什么已经失去的东西，那些关于青春和梦想的珍贵记忆在心头反复翻涌。' +
      '然而时间却在不知不觉中悄然流逝，当她终于回过神来，天色已经渐渐暗了下来，夕阳的余晖洒在她的脸上，映出一抹淡淡的忧伤。';
    const text = paragraph + '\n\n' + paragraph;
    expect(text.length).toBeGreaterThan(500);
    expect(classifyContent(text)).toBe('sparse');
  });

  it('短文本（<100字）应默认返回 balanced', () => {
    expect(classifyContent('这是一段很短的文本。')).toBe('balanced');
    expect(classifyContent('')).toBe('balanced');
  });

  it('技术术语密集的文章应分类为 dense', () => {
    // 构造技术术语密度 ≥ 5/千字 的文本
    const terms = [
      'kubernetes', 'docker', 'microservice', 'containerization',
      'orchestration', 'deployment', 'scalability', 'loadbalancer',
      'ingress', 'service-mesh', 'istio', 'envoy',
    ];
    const text = '云原生架构采用 ' + terms.join('、') + ' 等技术栈，实现了应用的弹性伸缩和高可用性。' +
      '通过 CI/CD pipeline 和 GitOps 工作流，开发团队能够快速迭代和部署 microservice 架构。' +
      '结合 Prometheus 监控和 Grafana 可视化，运维团队可以实时掌握集群健康状态。' +
      '此外，利用 Helm chart 和 Terraform 配置管理，基础设施即代码的理念得以落地实施。';
    expect(classifyContent(text)).toBe('dense');
  });

  it('数据密集的文章应分类为 dense', () => {
    // 构造数据密度 ≥ 4/千字 的文本（数值型数据点）
    const text = `2024年中国经济数据显示，GDP增长率达到5.2%，工业产值增长6.1%。
消费品零售总额约47万亿元，同比增长7.2%。固定资产投资增长3.0%，
其中基础设施投资增长5.9%。出口总额约25万亿元，进口总额约18万亿元。
城镇居民人均可支配收入达到5.2万元，农村居民约为2.3万元。
全国城镇新增就业1244万人，失业率为5.2%。`;
    expect(classifyContent(text)).toBe('dense');
  });
});

// ─── resolveProfileConfig 测试 ───

describe('resolveProfileConfig', () => {
  it('应返回 profile 的默认配置', () => {
    const config = resolveProfileConfig('dense');
    expect(config).toEqual(PROFILE_CONFIGS.dense);
    expect(config.crossBatchThreshold).toBe(0.75);
    expect(config.reviewMinScore).toBe(2);
    expect(config.gateMinDensity).toBe(0.15);
    expect(config.gateWarnDensity).toBe(0.50);
    expect(config.gateMaxNoiseRatio).toBe(0.75);
    expect(config.gateWarnNoiseRatio).toBe(0.45);
  });

  it('应用户自定义覆盖默认值', () => {
    const config = resolveProfileConfig('balanced', {
      balanced: { reviewMinScore: 5, crossBatchThreshold: 0.8 },
    });
    expect(config.reviewMinScore).toBe(5);
    expect(config.crossBatchThreshold).toBe(0.8);
    expect(config.vaultHighThreshold).toBe(PROFILE_CONFIGS.balanced.vaultHighThreshold);
  });

  it('其他 profile 的覆盖不应影响当前 profile', () => {
    const config = resolveProfileConfig('sparse', {
      dense: { reviewMinScore: 1 },
    });
    expect(config.reviewMinScore).toBe(PROFILE_CONFIGS.sparse.reviewMinScore);
  });

  it('无覆盖参数时应返回完整默认配置', () => {
    for (const profile of ['dense', 'balanced', 'sparse'] as const) {
      const config = resolveProfileConfig(profile);
      expect(config).toEqual(PROFILE_CONFIGS[profile]);
    }
  });

  it('门控阈值应可被用户覆盖', () => {
    const config = resolveProfileConfig('balanced', {
      balanced: { gateMinDensity: 0.05, gateWarnDensity: 0.15 },
    });
    expect(config.gateMinDensity).toBe(0.05);
    expect(config.gateWarnDensity).toBe(0.15);
    // 未覆盖的噪声阈值保留默认
    expect(config.gateMaxNoiseRatio).toBe(PROFILE_CONFIGS.balanced.gateMaxNoiseRatio);
  });
});

// ─── ProfileConfig 门控阈值完整性 ───

describe('ProfileConfig gate thresholds', () => {
  it('每个 profile 都应有完整的门控阈值字段', () => {
    for (const profile of ['dense', 'balanced', 'sparse'] as const) {
      const config = PROFILE_CONFIGS[profile];
      expect(typeof config.gateMinDensity).toBe('number');
      expect(typeof config.gateWarnDensity).toBe('number');
      expect(typeof config.gateMaxNoiseRatio).toBe('number');
      expect(typeof config.gateWarnNoiseRatio).toBe('number');
      expect(config.gateMinDensity).toBeLessThan(config.gateWarnDensity);
      expect(config.gateWarnNoiseRatio).toBeLessThan(config.gateMaxNoiseRatio);
    }
  });

  it('dense 应比 balanced 更宽松，balanced 应比 sparse 更宽松', () => {
    expect(PROFILE_CONFIGS.dense.gateMinDensity).toBeLessThanOrEqual(PROFILE_CONFIGS.balanced.gateMinDensity);
    expect(PROFILE_CONFIGS.balanced.gateMinDensity).toBeLessThanOrEqual(PROFILE_CONFIGS.sparse.gateMinDensity);
    expect(PROFILE_CONFIGS.dense.gateMaxNoiseRatio).toBeGreaterThanOrEqual(PROFILE_CONFIGS.balanced.gateMaxNoiseRatio);
    expect(PROFILE_CONFIGS.balanced.gateMaxNoiseRatio).toBeGreaterThanOrEqual(PROFILE_CONFIGS.sparse.gateMaxNoiseRatio);
  });
});

// ─── PROFILE_LABELS 完整性 ───

describe('PROFILE_LABELS', () => {
  it('每个 profile 都应有中文标签', () => {
    expect(PROFILE_LABELS.dense).toBe('技术文献');
    expect(PROFILE_LABELS.balanced).toBe('通用文章');
    expect(PROFILE_LABELS.sparse).toBe('观点评论');
  });
});
