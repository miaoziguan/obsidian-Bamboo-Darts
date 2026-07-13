# 贡献指南（CONTRIBUTING）

感谢你考虑为 Bamboo Darts（竹叶飞刃）做贡献！这是一个个人维护的 Obsidian 插件项目，欢迎 Issue、PR 与讨论。

## 开发环境

```bash
npm install            # 安装依赖
npm run dev            # 监听模式编译（带 sourcemap）
npm run build          # 正式版编译（压缩）
npm run test           # 运行单元测试
npm run test:coverage  # 测试 + 覆盖率报告
npm run lint           # ESLint 检查
npm run lint:fix       # ESLint 自动修复
npm run gate           # 质量门禁：lint 零告警 + 覆盖率达标
npm run sync           # 编译并同步到 ../test-vault 测试仓库
npm run sync --dev     # 同步开发版（带 sourcemap）
```

## 质量门槛

- **ESLint 零告警**：`npm run gate` 中 lint 部分必须全绿。
- **覆盖率门槛**：行/语句 82%、分支/函数 80%。新增代码需满足 60% 增量覆盖率（CI 自动校验）。
- **TDD**：功能改动请先写失败测试，再实现（红 → 绿 → commit）。

## 分支与提交

- 从 `main` 切出特性分支（如 `feat/xxx`、`fix/xxx`）。
- 提交信息建议语义化前缀：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`。
- 每个可独立验证的改动单独 commit，保持历史清晰。

## 提 PR 前

1. 跑 `npm run gate` 全绿。
2. 若改动 UI，请在 Obsidian 桌面端（必要时移动端）手动验证主路径。
3. 在 PR 模板中说明改动动机与验证方式。

## 行为准则

- 友好、就事论事。
- 不提交任何密钥 / 个人 API Key。
- 涉及 API 调用请默认走用户自有的 Key，不引入云端上传逻辑（隐私优先是项目底线）。
