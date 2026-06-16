# Atomic Notes Extractor

从文章/链接/选中文本中提炼原子笔记，自动去重后存入 Obsidian 知识库。

## 功能特性

- ✅ 支持三种输入：URL、选中文本、剪贴板
- ✅ 质量门控：自动检查内容长度、广告、重复
- ✅ AI 提炼：调用 DeepSeek API 提炼符合六条标准的原子笔记
- ✅ 同批去重：自动去除当前批次的重复笔记
- ✅ 知识库去重：与已有笔记比对，避免重复存储
- ✅ 灵活存储：自定义目标文件夹、文件名模板

## 原子笔记六条标准

1. **一条笔记只说一件事** —— 聚焦单一知识点
2. **独立可读** —— 不依赖上下文
3. **有信息密度** —— 不是定义，是有洞见的陈述
4. **可行动或可引用** —— 方法或观点/数据
5. **用自己的话写** —— 不是原文复制
6. **标注来源** —— 注明出处

## 安装方法

### 方法 1：手动安装

1. 下载本插件文件夹
2. 复制到你的 Obsidian vault 的 `.obsidian/plugins/` 目录
3. 在 Obsidian 设置 → 社区插件 → 已安装插件中启用

### 方法 2：BRAT 安装

1. 安装 BRAT 插件
2. 添加本仓库地址

## 配置说明

在 Obsidian 设置 → Atomic Notes Extractor 中配置：

- **API Key**：你的 DeepSeek API Key（必需）
- **API URL**：DeepSeek API 地址（默认：`https://api.deepseek.com/v1/chat/completions`）
- **模型**：使用的 DeepSeek 模型（默认：`deepseek-chat`）
- **最大 Token 数**：AI 输出的最大 Token 数（默认：2000）
- **目标文件夹**：原子笔记保存的文件夹（默认：`Atomic Notes`）
- **文件名模板**：支持变量 `{{title}}`, `{{date}}`, `{{time}}`, `{{timestamp}}`
- **自动保存**：启用后，提炼完成后自动保存（不显示结果弹窗）

## 使用方法

### 命令面板

- `Atomic Notes Extractor: 从选中文本提炼原子笔记`
- `Atomic Notes Extractor: 从 URL 提炼原子笔记`
- `Atomic Notes Extractor: 从剪贴板提炼原子笔记`

### 右键菜单

在编辑器中选中文本后右键，点击"提炼原子笔记"

### Ribbon 图标

点击左侧边栏的文档图标

## 工作流程

1. **Phase 1**：读取内容（URL/选中文本/剪贴板）
2. **Phase 2**：质量门控（长度、广告、重复检测）
3. **Phase 3**：调用 DeepSeek API 提炼原子笔记
4. **Phase 4**：核实关键数据（可选，本次未实现）
5. **Phase 5**：同批交叉去重
6. **Phase 6**：知识库去重比对
7. **Phase 7**：存入 Obsidian（显示结果弹窗或自动保存）
8. **Phase 8**：展示结果

## 技术栈

- TypeScript
- esbuild（构建工具）
- DeepSeek API（AI 提炼）
- Obsidian API（插件接口）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build
```

## 许可证

MIT
