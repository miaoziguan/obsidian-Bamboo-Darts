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
        'src/ui/**',
        'src/types.ts',
      ],
      thresholds: {
        lines: 75,
        branches: 80,
        functions: 75,
        statements: 75,
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
