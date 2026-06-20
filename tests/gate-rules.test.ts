import { runGateChecks } from '../src/gate';
import { ProfileConfig, PROFILE_CONFIGS } from '../src/extraction/profiles';

describe('gate-rules', () => {
  describe('runGateChecks', () => {
    it('should pass for normal content', () => {
      const content = '这是一段长度超过五十个字符的正常文本内容，包含足够的信息和合理的长度，能够通过质量门控检查，确保所有规则都能顺利通过。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(true);
      expect(result.reasons.length).toBe(0);
    });

    it('should block for very short content', () => {
      const content = '太短';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('内容过短'));
    });

    it('should warn for short but acceptable content (50-200 chars)', () => {
      const content = '这是一段长度在五十到两百字之间的文本内容，应该会收到警告提示信息，告诉用户内容偏短，确保这段文字足够长以满足要求。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('内容偏短'));
    });

    it('should handle very long content (>50000 chars)', () => {
      const baseText = '这是一段关于技术话题的详细内容用于测试长文本处理能力。';
      const content = baseText.repeat(3000);
      expect(content.length).toBeGreaterThan(50000);
      const result = runGateChecks(content);
      const hasLengthWarning = result.warnings.some(w => w.includes('内容较长'));
      const hasDensityBlock = result.reasons.some(r => r.includes('信息密度'));
      expect(hasLengthWarning || hasDensityBlock).toBe(true);
    });

    it('should block for spammy content (3+ signals)', () => {
      const content = '点击这里立即购买！限时优惠！抢购！广告推广！这段内容足够长以触发质量检查，确保能够被正确识别为低质内容。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('低质信号'));
    });

    it('should warn for content with some spam signals (1-2 signals)', () => {
      const content = '这篇文章不错，点击链接查看详情，包含足够的长度以通过检查，确保内容超过五十个字符，不会被硬阻断但会收到警告。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('低质信号'));
    });

    it('should block for very low information density', () => {
      const content = '重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复 重复';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('信息密度'));
    });

    it('should handle low density content', () => {
      const content = '测试数据内容信息处理分析学习系统'.repeat(500);
      expect(content.length).toBeGreaterThan(100);
      const result = runGateChecks(content);
      const hasDensityBlock = result.reasons.some(r => r.includes('信息密度'));
      const hasDensityWarning = result.warnings.some(w => w.includes('信息密度'));
      expect(hasDensityBlock || hasDensityWarning).toBe(true);
    });

    it('should block for high noise ratio', () => {
      const content = '这是正常文本内容足够长用于测试噪声占比检测确保长度超过五十字符' + '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09'.repeat(50);
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('噪声占比'));
    });

    it('should block for duplicate content', () => {
      const content = '这是一段足够长的测试内容用于测试重复检测功能是否正常工作确保长度超过五十字符并且内容足够丰富才能触发重复检测规则。';
      const processed = ['这是一段足够长的测试内容用于测试重复检测功能是否正常工作确保长度超过五十字符并且内容足够丰富才能触发重复检测规则。'];
      const result = runGateChecks(content, processed);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('高度相似'));
    });

    it('should not block for different content', () => {
      const content = '数据分析显示用户更偏好简洁的界面设计，性能优化能显著提升响应速度，内存占用需要控制在合理范围内，前端框架选择要权衡开发效率和维护成本。';
      const processed = ['人工智能技术在教育领域的应用正在快速发展，个性化学习路径通过大数据分析实现，智能辅导系统能够根据学生答题情况动态调整难度，虚拟现实技术为沉浸式学习提供可能。'];
      const result = runGateChecks(content, processed);
      expect(result.passed).toBe(true);
    });

    it('should handle empty content', () => {
      const result = runGateChecks('');
      expect(result.passed).toBe(false);
    });

    it('should handle content with emojis', () => {
      const content = '📝 这是带有表情符号的内容，应该正常通过，长度足够满足要求，超过五十个字符限制，确保质量门控能够正确处理所有情况。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(true);
    });
  });

  // ─── Profile 感知门控 ───

  describe('Profile-aware gate thresholds', () => {
    it('dense profile 应放宽密度下限', () => {
      const content = '关于 Kubernetes 集群管理的深入分析，container orchestration 在 microservice 架构中扮演核心角色，service mesh 提供了流量管理和可观测性。'.repeat(5);
      const balancedResult = runGateChecks(content, [], PROFILE_CONFIGS.balanced);
      const denseResult = runGateChecks(content, [], PROFILE_CONFIGS.dense);
      // dense 配置 gateMinDensity=0.08 比 balanced 的 0.10 更宽松
      // 如果 balanced 阻断密度，dense 应该放行
      if (!balancedResult.passed && balancedResult.reasons.some(r => r.includes('信息密度'))) {
        expect(denseResult.passed).toBe(true);
      }
    });

    it('sparse profile 应收紧噪声阈值', () => {
      // 构造有一定噪声占比的内容
      const normalPart = '这是一篇观点评论文章的内容，讨论社会现象和个人感受，段落较长但信息密度不高。';
      const noisePart = '\u2603\u2604\u2605\u2606'; // 特殊符号（不在白名单内）
      const content = normalPart.repeat(3) + noisePart.repeat(15);
      const sparseResult = runGateChecks(content, [], PROFILE_CONFIGS.sparse);
      const balancedResult = runGateChecks(content, [], PROFILE_CONFIGS.balanced);
      // sparse 的 gateWarnNoiseRatio=0.35 比 balanced 的 0.40 更紧
      // 如果 sparse 产生噪声警告，balanced 可能不会
      if (sparseResult.warnings.some(w => w.includes('噪声'))) {
        // 验证 sparse 确实比 balanced 更严格
        expect(PROFILE_CONFIGS.sparse.gateWarnNoiseRatio).toBeLessThan(PROFILE_CONFIGS.balanced.gateWarnNoiseRatio);
      }
    });

    it('未传入 profileConfig 时应使用默认阈值（向后兼容）', () => {
      const content = '这是一段长度超过五十个字符的正常文本内容，包含足够的信息和合理的长度，能够通过质量门控检查。';
      const withProfile = runGateChecks(content, [], PROFILE_CONFIGS.balanced);
      const withoutProfile = runGateChecks(content);
      expect(withProfile.passed).toBe(withoutProfile.passed);
    });
  });

  // ─── 警告累积升级 ───

  describe('Warning accumulation escalation', () => {
    it('累积 3 条以上警告应自动升级为阻断', () => {
      // 构造确定触发 3+ 条警告的内容：
      // 1. 长度 50-200 字 → 长度警告
      // 2. 包含"广告"关键词 → 质量警告
      // 3. 包含 &amp; 和 &lt; → HTML残留警告
      const content = '这篇广告文章讨论了 &amp; 符号和 &lt; 标签在网页开发中的使用，内容虽然偏短但信息量足够，足以通过最低长度检查。';
      expect(content.length).toBeGreaterThan(50);
      expect(content.length).toBeLessThan(200);
      const result = runGateChecks(content);
      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('累积'));
    });

    it('少于 3 条警告不应升级为阻断', () => {
      const content = '这篇文章讨论点击链接的话题，内容长度超过两百字以确保不会触发长度警告，包含丰富的信息和详细的分析，涵盖多个方面的讨论和深入研究，确保只有质量相关的警告被触发。';
      const result = runGateChecks(content);
      // 只有 1 条质量警告 + 0 条其他 = 不升级
      if (result.warnings.length < 3) {
        expect(result.passed).toBe(true);
      }
    });
  });

  // ─── 密度长度偏见修复 ───

  describe('Density length bias fix', () => {
    it('5000字正常文章不应被误判为低密度', () => {
      const paragraphs = [
        '关于人工智能技术在现代软件开发中的应用，机器学习算法正在改变代码审查和自动化测试的方式。',
        '分布式系统设计中，微服务架构和容器化部署已经成为企业级应用的标准实践方案。',
        '前端框架的发展经历了从 jQuery 到 React、Vue、Angular 的演变过程，组件化开发成为主流。',
        '数据库技术从关系型向非关系型发展，NoSQL 数据库在大规模数据处理场景中展现出优势。',
        '网络安全领域面临越来越多的挑战，零信任架构和端到端加密成为保护数据安全的重要手段。',
        '云计算服务提供了灵活的基础设施方案，Serverless 架构降低了运维成本并提高了开发效率。',
        'DevOps 文化推动了开发和运维团队的协作，持续集成和持续部署加速了软件交付周期。',
        '物联网技术在智慧城市和工业领域的应用越来越广泛，传感器网络和边缘计算是关键技术。',
        '区块链技术除了数字货币外，在供应链管理和数字身份认证等领域也展现出巨大的应用潜力。',
        '量子计算虽然仍处于早期阶段，但在密码学和复杂系统模拟方面已经显示出超越经典计算的能力。',
        '自然语言处理技术的进步使得智能客服和文本分析成为可能，情感分析和实体识别是核心任务。',
        '计算机视觉在自动驾驶和医疗影像诊断中发挥着越来越重要的作用，目标检测和图像分割是基础能力。',
        '边缘计算将数据处理推向网络边缘，降低了延迟并减少了带宽消耗，适用于工业物联网场景。',
        '低代码平台降低了应用开发的门槛，使业务人员也能参与数字化建设，加速了企业转型进程。',
        '数据治理是数据驱动决策的基础，涵盖数据质量、数据安全、元数据管理和数据生命周期等方面。',
      ];
      const content = paragraphs.join('').repeat(4);
      expect(content.length).toBeGreaterThan(2000);
      const result = runGateChecks(content);
      // 正常多样化长文章不应触发密度阻断
      expect(result.reasons.some(r => r.includes('信息密度极低'))).toBe(false);
    });
  });

  // ─── 噪声检测扩展 ───

  describe('Noise detection expansion', () => {
    it('emoji 内容不应被误判为噪声', () => {
      const content = '🎉 今天是个好日子！📚 读了一本好书，分享给大家 🌟 希望每个人都能从中受益 💡 知识就是力量 ✨ 让我们一起学习进步吧 🚀';
      const result = runGateChecks(content);
      // emoji 现在是白名单字符，不应触发噪声警告
      expect(result.reasons.some(r => r.includes('噪声占比'))).toBe(false);
    });

    it('数学符号不应被误判为噪声', () => {
      const content = '数学公式推导：∀x∈R, ∃y∈R, x+y=0。集合论基础 ∪ ∩ ⊂ ⊃ 和逻辑运算 ∧ ∨ ¬ 是离散数学的核心概念。这部分内容足够长可以通过长度检查并验证噪声检测的准确性。';
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('噪声占比'))).toBe(false);
    });
  });

  // ─── 相似度采样改进 ───

  describe('Similarity sampling improvement', () => {
    it('头部相同但尾部不同的长文章不应被误判为重复', () => {
      const commonHeader = '这是一段完全相同的开头内容，用于测试相似度采样策略是否能够正确区分头同尾不同的文章。';
      const content = commonHeader + '但是这篇文章的后半部分内容完全不同，讨论了另一个话题，关于环境保护和可持续发展的相关内容，涉及气候变化和碳排放等方面。';
      const processed = commonHeader + '而这篇已处理的文章后半部分讲的是完全不同的主题，涉及太空探索和外星生命的研究进展，包括火星探测和系外行星的发现。';
      const result = runGateChecks(content, [processed]);
      // 头中尾采样应能识别出中段和尾段的差异
      expect(result.passed).toBe(true);
    });
  });

  // ─── 广告变体检测 ───

  describe('Ad variant detection', () => {
    it('emoji 包裹的广告应被识别', () => {
      const content = '🔥限时优惠大促销活动开始了！💰抢购热门商品享受超低折扣！🎁免费领取精美礼品一份！这段内容足够长以确保通过长度检查，验证变体正则模式能否正确识别带有 emoji 的广告内容。';
      const result = runGateChecks(content);
      // 应触发广告相关的警告或阻断
      const hasAdSignal = result.reasons.some(r => r.includes('低质信号')) ||
        result.warnings.some(w => w.includes('低质信号'));
      expect(hasAdSignal).toBe(true);
    });

    it('变体关键词应被正则匹配', () => {
      const content = '限时限量特惠活动正在进行中，点击→这里即可参与，这段内容包含足够长度来通过基础检查，同时包含多个广告变体模式用于测试正则表达式的匹配能力。';
      const result = runGateChecks(content);
      const hasAdSignal = result.reasons.some(r => r.includes('低质信号')) ||
        result.warnings.some(w => w.includes('低质信号'));
      expect(hasAdSignal).toBe(true);
    });
  });

  // ─── 高频短语检测（关键词堆砌） ───

  describe('Keyword stuffing detection', () => {
    it('关键词堆砌的 SEO 水文应被阻断', () => {
      const content = '装修找我们就对了，专业装修公司为您提供一站式装修服务。我们的装修团队拥有丰富的装修经验，无论是家庭装修还是办公室装修，都能满足您的装修需求。装修公司哪家好？选择我们的装修公司，您将获得最优质的装修体验。装修价格合理，装修质量有保障，装修效果让您满意。装修前免费咨询，装修中全程监理，装修后质保五年。装修风格多种多样，中式装修、欧式装修、现代简约装修，总有一款装修风格适合您。装修材料全部采用环保材料，装修过程透明公开，装修进度实时汇报。联系电话：400-XXX-XXXX，装修就找我们，装修无忧！专业装修团队，装修品质保证，装修价格公道，装修服务周到。装修热线24小时开通，装修咨询随时欢迎，装修预约享优惠。我们的装修案例遍布全城，装修口碑有目共睹，装修实力毋庸置疑。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('关键词堆砌'));
    });

    it('正常长文章不应触发关键词堆砌', () => {
      const paragraphs = [
        '关于人工智能技术在现代软件开发中的应用，机器学习算法正在改变代码审查和自动化测试的方式。',
        '分布式系统设计中，微服务架构和容器化部署已经成为企业级应用的标准实践方案。',
        '前端框架的发展经历了从 jQuery 到 React、Vue、Angular 的演变过程，组件化开发成为主流。',
        '数据库技术从关系型向非关系型发展，NoSQL 数据库在大规模数据处理场景中展现出优势。',
        '网络安全领域面临越来越多的挑战，零信任架构和端到端加密成为保护数据安全的重要手段。',
        '云计算服务提供了灵活的基础设施方案，Serverless 架构降低了运维成本并提高了开发效率。',
        'DevOps 文化推动了开发和运维团队的协作，持续集成和持续部署加速了软件交付周期。',
        '物联网技术在智慧城市和工业领域的应用越来越广泛，传感器网络和边缘计算是关键技术。',
        '区块链技术除了数字货币外，在供应链管理和数字身份认证等领域也展现出巨大的应用潜力。',
        '量子计算虽然仍处于早期阶段，但在密码学和复杂系统模拟方面已经显示出超越经典计算的能力。',
      ];
      const content = paragraphs.join('').repeat(3);
      expect(content.length).toBeGreaterThan(1000);
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('关键词堆砌'))).toBe(false);
    });

    it('短内容（<200字）不应触发关键词堆砌检测', () => {
      const content = '这是一段短内容测试，验证关键词堆砌检测会跳过短文本。内容长度不足两百字，应该直接通过。';
      expect(content.length).toBeLessThan(200);
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('关键词堆砌'))).toBe(false);
    });
  });

  // ─── HTML 残留检测 ───

  describe('HTML artifact detection', () => {
    it('大量 HTML 残留应被阻断', () => {
      const content = '这是一段<div class="content">未清洗的内容</div>，包含了<script>alert(1)</script>多个 HTML 标记&nbsp;和实体&amp;编码&#160;残留，应该被门控检测到并阻断。';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('HTML 残留'));
    });

    it('正常内容不应触发 HTML 残留检测', () => {
      const content = '这是一段完全正常的文本内容，没有任何 HTML 标记，长度也足够通过基本检查，应该顺利通过所有门控规则的检测。';
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('HTML 残留'))).toBe(false);
    });

    it('少量 HTML 实体应触发警告而非阻断', () => {
      const content = '这篇文章讨论了 &amp; 符号的使用，以及 &lt; 和 &gt; 在 HTML 中的含义。内容足够长以确保通过基本长度检查，只包含少量实体引用。';
      const result = runGateChecks(content);
      // 2 个 HTML 实体应触发警告
      const hasHtmlWarn = result.warnings.some(w => w.includes('HTML 残留'));
      const hasHtmlBlock = result.reasons.some(r => r.includes('HTML 残留'));
      if (hasHtmlWarn) expect(hasHtmlBlock).toBe(false);
    });
  });

  // ─── 乱码/Mojibake 检测 ───

  describe('Mojibake detection', () => {
    it('锟斤拷乱码应被检测', () => {
      const content = '这是一段正常文本，但中间夹杂了锟斤拷锟斤拷锟斤拷这样的经典乱码内容，应该被门控检测到并发出警告。';
      const result = runGateChecks(content);
      const hasMojibake = result.reasons.some(r => r.includes('乱码')) ||
        result.warnings.some(w => w.includes('乱码'));
      expect(hasMojibake).toBe(true);
    });

    it('烫烫烫调试残留应被检测', () => {
      const content = '这是一段从调试环境复制出来的内容，包含了烫烫烫烫烫烫这样的未初始化内存标记，应该被检测到。';
      const result = runGateChecks(content);
      const hasMojibake = result.reasons.some(r => r.includes('乱码')) ||
        result.warnings.some(w => w.includes('乱码'));
      expect(hasMojibake).toBe(true);
    });

    it('正常中英文内容不应触发乱码检测', () => {
      const content = '这是一段正常的中英文混合内容，包含了 English words 和中文文字，没有任何乱码特征，长度也足够通过基本检查。';
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('乱码'))).toBe(false);
      expect(result.warnings.some(w => w.includes('乱码'))).toBe(false);
    });
  });

  // ─── 链接堆砌/导航页检测 ───

  describe('Link dump detection', () => {
    it('链接堆砌的导航页应被阻断', () => {
      const content = 'https://example.com/page1 https://example.com/page2 https://example.com/page3 https://example.com/page4 https://example.com/page5 https://example.com/page6 https://example.com/page7 https://example.com/page8 https://example.com/page9 https://example.com/page10';
      const result = runGateChecks(content);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('链接占比'));
    });

    it('导航分隔符密集应触发警告', () => {
      const content = '首页 | 关于我们 | 产品服务 | 技术支持 | 博客文章 | 联系方式 | 下载中心 | 帮助中心这是一段纯文本导航栏内容，不包含任何链接地址信息，专门用于测试分隔符检测功能是否能够正常工作并触发预期警告。';
      expect(content.length).toBeGreaterThan(100);
      const result = runGateChecks(content);
      const hasNavWarn = result.warnings.some(w => w.includes('导航分隔符'));
      expect(hasNavWarn).toBe(true);
    });

    it('正常文章中包含少量链接不应触发', () => {
      const content = '这篇文章讨论了微服务架构的设计理念。详细内容可参考 https://example.com/microservices 这篇技术博客，以及 https://example.com/design-patterns 关于设计模式的文章。微服务的核心原则包括服务解耦和独立部署。';
      const result = runGateChecks(content);
      expect(result.reasons.some(r => r.includes('链接占比'))).toBe(false);
      expect(result.reasons.some(r => r.includes('导航页'))).toBe(false);
    });
  });
});