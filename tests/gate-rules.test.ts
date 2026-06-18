import { runGateChecks } from '../src/utils/gate-rules';

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
      // 生成长内容超过50000字符，测试长内容处理
      const baseText = '这是一段关于技术话题的详细内容用于测试长文本处理能力。';
      const content = baseText.repeat(3000);
      expect(content.length).toBeGreaterThan(50000);
      const result = runGateChecks(content);
      // 长内容应触发内容长度警告（如果密度足够高）或阻断（如果密度过低）
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
      // 测试低信息密度内容的处理
      // 由于2-gram密度计算特性，重复内容密度必然很低
      const content = '测试数据内容信息处理分析学习系统'.repeat(500);
      expect(content.length).toBeGreaterThan(100);
      const result = runGateChecks(content);
      // 低密度内容应触发阻断（密度<0.1）或警告（密度在0.1-0.3之间）
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
      const content = '这是一段足够长的测试内容用于测试重复检测功能是否正常工作确保长度超过五十字符并且内容足够丰富。';
      const processed = ['这是一段足够长的测试内容用于测试重复检测功能是否正常工作确保长度超过五十字符并且内容足够丰富。'];
      const result = runGateChecks(content, processed);
      expect(result.passed).toBe(false);
      expect(result.reasons).toContainEqual(expect.stringContaining('高度相似'));
    });

    it('should not block for different content', () => {
      // 两段内容结构不同，字符 bigram 相似度应低于 0.5 阈值
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
});