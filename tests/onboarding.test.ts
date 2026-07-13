import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding, markOnboarded } from '../src/onboarding';

describe('shouldShowOnboarding', () => {
  it('首次安装（firstRun=true）应显示引导', () => {
    expect(shouldShowOnboarding({ firstRun: true })).toBe(true);
  });

  it('已引导过（firstRun=false）不应显示', () => {
    expect(shouldShowOnboarding({ firstRun: false })).toBe(false);
  });

  it('缺少 firstRun 字段时按首次处理（防御性）', () => {
    expect(shouldShowOnboarding({} as { firstRun?: boolean })).toBe(true);
  });
});

describe('markOnboarded', () => {
  it('将 firstRun 置为 false 并返回新对象', () => {
    const next = markOnboarded({ firstRun: true });
    expect(next.firstRun).toBe(false);
  });

  it('不修改原对象（不可变）', () => {
    const orig = { firstRun: true };
    markOnboarded(orig);
    expect(orig.firstRun).toBe(true);
  });
});
