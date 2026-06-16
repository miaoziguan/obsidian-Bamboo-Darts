/**
 * 设置页面
 * 配置 API、提炼模式、存储、标签、链接、核查、复查、发现
 * 分区按使用流程排列：连接 → 提炼 → 输出 → 分类 → 集成 → 质量 → 发现
 */

import { App, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import AtomicNotesPlugin from '../main';
import { ExtractionHistoryEntry } from '../services/history-service';

export interface PluginSettings {
  // DeepSeek API
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;

  // Storage
  targetFolder: string;
  fileNameTemplate: string;
  autoSave: boolean;

  // Extraction mode
  // extractionMode 已移除，只保留纯 AI 模式

  // Tag preferences
  tagPreferences: string[];
  tagMode: 'lenient' | 'strict';

  // Backlink
  autoBacklink: boolean;

  // Fact check
  factCheck: boolean;
  verifiedOnly: boolean;

  // Discovery
  discoveryRecommendation: boolean;

  // Review
  enableReview: boolean;
  reviewModel: string;
  reviewApiUrl: string;
  reviewApiKey: string;

  // History
  extractionHistory?: ExtractionHistoryEntry[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  deepseekApiKey: '',
  deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  maxTokens: 2000,
  targetFolder: 'Atomic Notes',
  fileNameTemplate: '{{title}}',
  autoSave: false,
  // extractionMode 已移除，只保留纯 AI 模式
  tagPreferences: [],
  tagMode: 'lenient',
  autoBacklink: false,
  factCheck: true,
  verifiedOnly: false,
  discoveryRecommendation: true,

  // Review
  enableReview: false,
  reviewModel: '',
  reviewApiUrl: '',
  reviewApiKey: '',
};

export class AtomicNotesSettingTab extends PluginSettingTab {
  plugin: AtomicNotesPlugin;
  icon: string = 'square-dashed-bottom-code';

  constructor(app: App, plugin: AtomicNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** 在分区之间插入轻量分割线 */
  private addDivider(containerEl: HTMLElement): void {
    containerEl.createEl('hr', {
      attr: {
        style: 'margin:20px 0 16px;border:none;border-top:1px solid var(--background-modifier-border)',
      },
    });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '原子笔记提炼 设置' });

    // ================================================================
    // ① API 配置（连接）
    // ================================================================
    containerEl.createEl('h3', { text: 'API 配置' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('你的 API Key（必需）')
      .addText(text =>
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async value => {
            this.plugin.settings.deepseekApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('API URL')
      .setDesc('API 地址（默认：DeepSeek）')
      .addText(text =>
        text
          .setValue(this.plugin.settings.deepseekApiUrl)
          .onChange(async value => {
            this.plugin.settings.deepseekApiUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('模型')
      .setDesc('使用的模型（默认：deepseek-chat）')
      .addText(text =>
        text
          .setValue(this.plugin.settings.model)
          .onChange(async value => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('最大 Token 数')
      .setDesc('AI 输出的最大 Token 数（默认：2000）')
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async value => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // 测试连接（紧邻 API 配置）
    new Setting(containerEl)
      .setName('测试连接')
      .setDesc('验证 API Key 是否有效')
      .addButton(button =>
        button
          .setButtonText('测试连接')
          .onClick(async () => {
            await this.testConnection();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ② 存储配置（输出位置）
    // ================================================================
    containerEl.createEl('h3', { text: '存储配置' });

    new Setting(containerEl)
      .setName('目标文件夹')
      .setDesc('原子笔记保存的文件夹（默认：Atomic Notes）')
      .addText(text =>
        text
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async value => {
            this.plugin.settings.targetFolder = value.trim() || 'Atomic Notes';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('文件名模板')
      .setDesc('支持变量：{{title}}, {{date}}, {{time}}, {{timestamp}}')
      .addText(text =>
        text
          .setValue(this.plugin.settings.fileNameTemplate)
          .onChange(async value => {
            this.plugin.settings.fileNameTemplate = value.trim() || '{{title}}';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('自动保存')
      .setDesc('启用后，提炼完成自动保存到知识库（不显示结果弹窗）')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoSave)
          .onChange(async value => {
            this.plugin.settings.autoSave = value;
            await this.plugin.saveSettings();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ④ 标签偏好（分类）
    // ================================================================
    containerEl.createEl('h3', { text: '标签偏好' });

    new Setting(containerEl)
      .setName('标签词汇表')
      .setDesc('输入偏好标签，逗号或换行分隔，如：设计思维, 用户研究, AI')
      .addTextArea(text =>
        text
          .setPlaceholder('设计思维, 用户研究, AI')
          .setValue((this.plugin.settings.tagPreferences || []).join(', '))
          .onChange(async value => {
            this.plugin.settings.tagPreferences = value
              .split(/[,，\n]+/)
              .map(s => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('标签模式')
      .setDesc('宽松：优先使用偏好标签，允许新增；严格：仅使用偏好标签')
      .addDropdown(dropdown =>
        dropdown
          .addOption('lenient', '宽松模式')
          .addOption('strict', '严格模式')
          .setValue(this.plugin.settings.tagMode || 'lenient')
          .onChange(async value => {
            this.plugin.settings.tagMode = value as 'lenient' | 'strict';
            await this.plugin.saveSettings();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ⑤ 双向链接（集成）
    // ================================================================
    containerEl.createEl('h3', { text: '双向链接' });

    new Setting(containerEl)
      .setName('自动创建源文件反向链接')
      .setDesc('从选中文本提炼时，在源文件插入 [[笔记标题]] 链接')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoBacklink)
          .onChange(async value => {
            this.plugin.settings.autoBacklink = value;
            await this.plugin.saveSettings();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ⑥ 事实核查（质量保障 1）
    // ================================================================
    containerEl.createEl('h3', { text: '事实核查' });

    new Setting(containerEl)
      .setName('启用事实核查')
      .setDesc('提炼后自动核实关键事实声明是否能在原文中找到依据')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.factCheck)
          .onChange(async value => {
            this.plugin.settings.factCheck = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('仅保存已核实笔记')
      .setDesc('开启时自动取消存疑/无据笔记的复选')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.verifiedOnly)
          .onChange(async value => {
            this.plugin.settings.verifiedOnly = value;
            await this.plugin.saveSettings();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ⑦ 笔记复查（质量保障 2 — AI 双重保险）
    // ================================================================
    containerEl.createEl('h3', { text: '笔记复查（AI 双重保险）' });

    new Setting(containerEl)
      .setName('启用笔记复查')
      .setDesc('提炼完成后，用 AI 对笔记价值评分，自动过滤低质量笔记（评分<3）')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableReview || false)
          .onChange(async value => {
            this.plugin.settings.enableReview = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('复查模型（可选）')
      .setDesc('复查用模型名称（如 gpt-4o、claude-3-5-sonnet）。留空则复用提炼模型')
      .addText(text =>
        text
          .setPlaceholder('留空则使用提炼模型')
          .setValue(this.plugin.settings.reviewModel || '')
          .onChange(async value => {
            this.plugin.settings.reviewModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('复查 API URL（可选）')
      .setDesc('复查用 API 地址。留空则复用提炼 API 地址')
      .addText(text =>
        text
          .setPlaceholder('留空则使用提炼 API 地址')
          .setValue(this.plugin.settings.reviewApiUrl || '')
          .onChange(async value => {
            this.plugin.settings.reviewApiUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('复查 API Key（可选）')
      .setDesc('复查用 API Key。留空则复用提炼 API Key')
      .addText(text =>
        text
          .setPlaceholder('留空则使用提炼 API Key')
          .setValue(this.plugin.settings.reviewApiKey || '')
          .onChange(async value => {
            this.plugin.settings.reviewApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ⑧ 笔记发现（知识发现）
    // ================================================================
    containerEl.createEl('h3', { text: '笔记发现' });

    new Setting(containerEl)
      .setName('启用关联推荐')
      .setDesc('选中笔记后显示 Top10 相关笔记')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.discoveryRecommendation)
          .onChange(async value => {
            this.plugin.settings.discoveryRecommendation = value;
            await this.plugin.saveSettings();
          })
      );

  }

  async testConnection(): Promise<void> {
    const { deepseekApiKey, deepseekApiUrl, model } = this.plugin.settings;

    if (!deepseekApiKey) {
      new Notice('请先填写 API Key');
      return;
    }

    try {
      new Notice('正在测试连接...');

      const response = await requestUrl({
        url: deepseekApiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: '你好' }],
          max_tokens: 10,
        }),
      });

      if (response.status === 200) {
        new Notice('API 连接成功！');
      } else {
        new Notice(`API 连接失败：${response.status}`);
      }
    } catch (error) {
      new Notice(`API 连接失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
