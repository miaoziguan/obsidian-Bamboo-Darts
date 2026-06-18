import { describe, it, expect } from 'vitest';
import { extractDataPoints, internalDataCheck } from '../src/utils/data-extractor';

describe('data-extractor', () => {
  describe('extractDataPoints', () => {
    it('should extract percentages', () => {
      const content = '市场份额占比约30%，同比增长23.5%，超过百分之五十的用户认可。';
      const points = extractDataPoints(content);
      const rawNumbers = points.map(p => p.rawNumber);
      expect(rawNumbers).toContain('约30%');
      expect(rawNumbers).toContain('百分之五十');
    });

    it('should extract quantities with units', () => {
      const content = '公司年收入100万元，拥有5.2亿用户，市值3000亿美元。';
      const points = extractDataPoints(content);
      const rawNumbers = points.map(p => p.rawNumber);
      expect(rawNumbers).toContain('100万元');
      expect(rawNumbers).toContain('3000亿美元');
    });

    it('should extract dates', () => {
      const content = '项目于2024年3月15日启动，计划在2024-12-31完成。';
      const points = extractDataPoints(content);
      const rawNumbers = points.map(p => p.rawNumber);
      expect(rawNumbers).toContain('2024年3月15日');
      expect(rawNumbers).toContain('2024-12-31');
    });

    it('should extract ranks', () => {
      const content = '排名第一，市场份额是第二名的3倍，销量翻了2番。';
      const points = extractDataPoints(content);
      const rawNumbers = points.map(p => p.rawNumber);
      expect(rawNumbers).toContain('第一');
      expect(rawNumbers).toContain('3倍');
      expect(rawNumbers).toContain('2番');
    });

    it('should limit to max data points', () => {
      const content = Array.from({ length: 50 }, (_, i) => `${i}%`).join(' ');
      const points = extractDataPoints(content);
      expect(points.length).toBeLessThanOrEqual(30);
    });

    it('should deduplicate same numbers', () => {
      const content = '价格是99元，售价99元，标价99元。';
      const points = extractDataPoints(content);
      expect(points.length).toBe(1);
    });
  });

  describe('internalDataCheck', () => {
    it('should find exact match', () => {
      const result = internalDataCheck('100万元', '公司年收入100万元，净利润50万元。');
      expect(result?.status).toBe('一致');
      expect(result?.original).toBe('100万元');
    });

    it('should find fuzzy match for percentages', () => {
      const result = internalDataCheck('30%', '市场份额约为30%左右');
      expect(result?.status).toBe('一致');
    });

    it('should detect deviation within 5%', () => {
      const result = internalDataCheck('102万元', '公司年收入100万元，净利润50万元。');
      expect(result?.status).toBe('偏差');
    });

    it('should return null for no match', () => {
      const result = internalDataCheck('999万元', '公司年收入100万元，净利润50万元。');
      expect(result).toBeNull();
    });

    it('should match dates', () => {
      const result = internalDataCheck('2024年3月15日', '项目于2024年3月15日正式启动');
      expect(result?.status).toBe('一致');
    });
  });
});