import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/types.ts',
        // UI 层：仅放开已充分单测的 result-view-model.ts，其余暂不计入覆盖率
        'src/ui/setting-tab.ts',
        'src/ui/panel-view.ts',
        'src/ui/result-modal.ts',
        'src/ui/input-modal.ts',
        'src/ui/aux-modals.ts',
        'src/ui/progress-modal.ts',
        'src/ui/about-content.ts',
        'src/ui/tabs/**',
        'src/ui/result/**',
      ],
      thresholds: {
        lines: 82,
        branches: 80,
        functions: 80,
        statements: 82,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      obsidian: resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
    },
  },
});
