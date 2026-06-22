module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // 必须最后，关闭与 Prettier 冲突的格式规则
  ],
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  ignorePatterns: [
    'node_modules/',
    'main.js',       // esbuild 构建产物
    'esbuild.config.mjs',
    'vitest.config.ts',
    'tests/',        // 测试文件有自己的风格宽容度
    '*.js',
  ],
  rules: {
    // ── 类型安全 ──
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',   // _param 允许
        varsIgnorePattern: '^_',   // _var 允许
      },
    ],

    // ── 实用主义 ──
    'no-console': 'off',           // 插件用 console 做日志，合理
    '@typescript-eslint/no-empty-function': 'off', // Obsidian API 回调常用
    '@typescript-eslint/ban-ts-comment': [
      'warn',
      { 'ts-ignore': 'allow-with-description' },
    ],

    // ── 质量 ──
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-useless-escape': 'warn', // 正则里的转义有时为了可读性，不阻断
    eqeqeq: ['warn', 'always', { null: 'ignore' }], // == null 允许
  },
};
