/**
 * Onboarding 引导逻辑（纯函数，便于单测）
 */

export interface OnboardingState {
  firstRun?: boolean;
}

/** 是否应显示首次引导：firstRun 为 true（或字段缺失）时显示 */
export function shouldShowOnboarding(settings: OnboardingState): boolean {
  return settings.firstRun !== false;
}

/** 标记已引导：返回 firstRun=false 的新对象，不修改入参 */
export function markOnboarded(
  settings: OnboardingState,
): OnboardingState & { firstRun: boolean } {
  return { ...settings, firstRun: false };
}
