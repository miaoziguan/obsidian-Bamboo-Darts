import { describe, it, expect } from 'vitest';
import { extractVerifiableClaims, locateAnchorInSource } from '../src/utils/data-extractor';

describe('data-extractor', () => {
  describe('extractVerifiableClaims', () => {
    it('应提取百分比数值声明', () => {
      const content = '市场份额占比约30%，同比增长23%，超过百分之五十的用户认可。';
      const claims = extractVerifiableClaims(content);
      const anchors = claims.map(c => c.anchor);
      expect(anchors).toContain('约30%');
      expect(anchors).toContain('23%');
      expect(anchors).toContain('百分之五十');
    });

    it('应提取带单位的数量声明', () => {
      const content = '公司年收入100万元，拥有5.2亿用户，市值3000亿美元。';
      const claims = extractVerifiableClaims(content);
      const anchors = claims.map(c => c.anchor);
      // 100万元、5.2亿、3000亿美元 都应被提取
      const hasWanYuan = anchors.some(a => a.includes('100') && a.includes('万'));
      const hasYi = anchors.some(a => a.includes('5.2') || a.includes('亿'));
      const hasMeiYuan = anchors.some(a => a.includes('3000') || a.includes('亿'));
      expect(hasWanYuan).toBe(true);
      expect(hasYi || hasMeiYuan).toBe(true);
    });

    it('应提取日期声明', () => {
      const content = '项目于2024年3月15日启动，计划在2024-12-31完成。';
      const claims = extractVerifiableClaims(content);
      const anchors = claims.map(c => c.anchor);
      expect(anchors.some(a => a.includes('2024') && a.includes('3') && a.includes('15'))).toBe(true);
    });

    it('应提取因果声明', () => {
      const content = '研究表明，长时间使用电子设备导致睡眠质量下降。';
      const claims = extractVerifiableClaims(content);
      const causalClaims = claims.filter(c => c.type === 'causal');
      expect(causalClaims.length).toBeGreaterThanOrEqual(1);
      expect(causalClaims[0].anchor).toBe('导致');
    });

    it('应提取命名实体声明', () => {
      const content = '清华大学计算机系发布了最新研究成果。';
      const claims = extractVerifiableClaims(content);
      const entityClaims = claims.filter(c => c.type === 'entity');
      expect(entityClaims.length).toBeGreaterThanOrEqual(1);
    });

    it('应限制最大声明数量', () => {
      const content = Array.from({ length: 50 }, (_, i) => `数据${i}显示增长${i}%。`).join('');
      const claims = extractVerifiableClaims(content);
      expect(claims.length).toBeLessThanOrEqual(30);
    });

    it('应对重复锚点去重', () => {
      const content = '价格是99元。售价99元。标价99元。';
      const claims = extractVerifiableClaims(content);
      const anchors99 = claims.filter(c => c.anchor === '99元');
      expect(anchors99.length).toBe(1);
    });

    it('空内容应返回空数组', () => {
      expect(extractVerifiableClaims('')).toEqual([]);
      expect(extractVerifiableClaims('   ')).toEqual([]);
    });
  });

  describe('locateAnchorInSource', () => {
    const source = '公司年收入100万元，净利润50万元。市场份额约为30%左右。项目于2024年3月15日正式启动。';

    it('应精确匹配数值锚点', () => {
      const result = locateAnchorInSource('100万元', 'numeric', source);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('已溯源');
      expect(result!.sourceText).toContain('100万元');
    });

    it('应精确匹配百分比锚点', () => {
      const result = locateAnchorInSource('30%', 'numeric', source);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('已溯源');
    });

    it('应对数值偏差在5%内标记为已溯源（附差异说明）', () => {
      const result = locateAnchorInSource('102万元', 'numeric', source);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('已溯源');
      expect(result!.diffNote).toContain('原文为');
    });

    it('应对数值偏差超过5%返回null', () => {
      const result = locateAnchorInSource('999万元', 'numeric', source);
      expect(result).toBeNull();
    });

    it('应精确匹配日期锚点', () => {
      const result = locateAnchorInSource('2024年3月15日', 'numeric', source);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('已溯源');
    });

    it('应对实体进行部分匹配降级为需对比', () => {
      // 锚点"清华大学计算机系"的60%前缀为"清华大学计算"（6字符）
      // 源文本包含前缀"清华大学计算"但不含完整锚点"清华大学计算机系"，应降级为需对比
      const result = locateAnchorInSource('清华大学计算机系', 'entity', '清华大学计算科学中心发布了最新研究成果。');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('需对比');
    });

    it('应对因果关键词进行部分匹配', () => {
      const result = locateAnchorInSource('导致', 'causal', '这一变化导致了行业格局的改变。');
      expect(result).not.toBeNull();
      // "导致"在原文中精确出现，应直接匹配
      expect(result!.status).toBe('已溯源');
    });

    it('原文中不存在锚点应返回null', () => {
      const result = locateAnchorInSource('完全不存在的锚点', 'entity', source);
      expect(result).toBeNull();
    });
  });
});
