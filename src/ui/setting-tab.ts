/**
 * 设置页面
 * 配置 API、提炼模式、存储、标签、链接、核查、复查、发现
 * 分区按使用流程排列：连接 → 提炼 → 输出 → 分类 → 集成 → 质量 → 发现
 */

import { App, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import AtomicNotesPlugin from '../main';
import { ExtractionHistoryEntry } from '../services/history-service';
import { ContentProfile, ProfileConfig, PROFILE_CONFIGS, PROFILE_LABELS } from '../extraction/profiles';

export interface PluginSettings {
  // 设置版本号（用于迁移）
  settingsVersion: number;

  // DeepSeek API
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;

  // Storage
  targetFolder: string;
  /** 去重比对专用文件夹，留空则复用 targetFolder */
  dedupTargetFolder: string;
  fileNameTemplate: string;
  autoSave: boolean;

  // Tag preferences
  tagPreferences: string[];
  tagMode: 'lenient' | 'strict';

  // Backlink
  autoBacklink: boolean;

  // Content verification
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

  // Panel
  panelPosition: 'left' | 'right' | 'tab' | 'split';

  // Profile 过滤策略
  autoClassify: boolean;
  contentProfile: ContentProfile;
  profileDense: ProfileConfig;
  profileBalanced: ProfileConfig;
  profileSparse: ProfileConfig;

  // 深度提炼
  enableDeepMode: boolean;

  // 高级参数
  /** 输入文本截断长度（默认 10000 字） */
  inputTruncateLength: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  settingsVersion: 2,
  deepseekApiKey: '',
  deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  maxTokens: 6000,
  targetFolder: '原子笔记',
  dedupTargetFolder: '',
  fileNameTemplate: '{{title}}',
  autoSave: false,
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

  // Panel
  panelPosition: 'right',

  // Profile 过滤策略
  autoClassify: true,
  contentProfile: 'balanced' as ContentProfile,
  profileDense: { ...PROFILE_CONFIGS.dense },
  profileBalanced: { ...PROFILE_CONFIGS.balanced },
  profileSparse: { ...PROFILE_CONFIGS.sparse },

  // 深度提炼
  enableDeepMode: false,

  // 高级参数
  inputTruncateLength: 10000,
};

export class AtomicNotesSettingTab extends PluginSettingTab {
  plugin: AtomicNotesPlugin;

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
      .setDesc('你的 API Key（必需）。还没有？前往 platform.deepseek.com 注册获取')
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async value => {
            this.plugin.settings.deepseekApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

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
      .setDesc('使用的模型（默认：deepseek-v4-flash）')
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
      .setDesc('AI 输出的最大 Token 数（默认：6000）')
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
      .setDesc('原子笔记保存的文件夹（默认：原子笔记）')
      .addText(text =>
        text
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async value => {
            this.plugin.settings.targetFolder = value.trim() || '原子笔记';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('去重目标文件夹')
      .setDesc('去重比对时读取的文件夹。留空则复用「目标文件夹」，适合有隐私需求的用户限制去重范围。')
      .addText(text =>
        text
          .setPlaceholder('留空 = 复用目标文件夹')
          .setValue(this.plugin.settings.dedupTargetFolder)
          .onChange(async value => {
            this.plugin.settings.dedupTargetFolder = value.trim();
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
      .setDesc('从选中文本提炼时，在源文件插入 [[笔记标题]] 链接（仅对「选中文本提炼」生效）')
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
    // ⑥ 内容核查（质量保障 1）
    // ================================================================
    containerEl.createEl('h3', { text: '内容核查' });

    new Setting(containerEl)
      .setName('启用内容核查')
      .setDesc('提炼后自动核查笔记中的事实和数据是否能在原文中找到依据（每次提炼额外消耗 1 次 API 调用）')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.factCheck)
          .onChange(async value => {
            this.plugin.settings.factCheck = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('仅保存可溯源笔记')
      .setDesc('开启时自动过滤包含超源声明的笔记')
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

    const reviewToggleSetting = new Setting(containerEl)
      .setName('启用笔记复查')
      .setDesc('提炼完成后，用 AI 对笔记价值评分，自动过滤低质量笔记（评分<3）（每次提炼额外消耗 1 次 API 调用）')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableReview || false)
          .onChange(async value => {
            this.plugin.settings.enableReview = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.enableReview) {
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
    } // end if enableReview

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

    this.addDivider(containerEl);

    // ================================================================
    // ⑨ 过滤策略
    // ================================================================
    containerEl.createEl('h3', { text: '过滤策略' });

    new Setting(containerEl)
      .setDesc('不同类型的文章需要不同的过滤强度。技术文献信息密集，应保留更多笔记；观点评论注重精华，只保留最有价值的洞见。');

    new Setting(containerEl)
      .setName('智能识别文章类型')
      .setDesc('开启后自动判断内容特征，为每篇文章选择最合适的过滤策略')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoClassify)
          .onChange(async value => {
            this.plugin.settings.autoClassify = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (!this.plugin.settings.autoClassify) {
      new Setting(containerEl)
        .setName('选择策略')
        .setDesc('手动指定当前文章适合的过滤强度')
        .addDropdown(dropdown =>
          dropdown
            .addOption('dense', '技术文献（技术文档、论文、教程 — 保留更多笔记）')
            .addOption('balanced', '通用文章（一般文章 — 平衡数量与质量）')
            .addOption('sparse', '观点评论（社论、书评、随笔 — 只留精华）')
            .setValue(this.plugin.settings.contentProfile)
            .onChange(async value => {
              this.plugin.settings.contentProfile = value as ContentProfile;
              await this.plugin.saveSettings();
              this.display();
            })
        );
    }

    // 当前策略预览
    const currentProfile = this.plugin.settings.autoClassify ? null : this.plugin.settings.contentProfile;
    if (!this.plugin.settings.autoClassify && currentProfile) {
      const previewMap: Record<ContentProfile, { label: string; desc: string }> = {
        dense: {
          label: '技术文献',
          desc: '去重宽松，允许相似笔记共存；质量门槛低，边缘洞见也会保留。适合技术文档、教程等信息密集内容。',
        },
        balanced: {
          label: '通用文章',
          desc: '适度去重，保留中等以上质量笔记。适合大多数文章。',
        },
        sparse: {
          label: '观点评论',
          desc: '严格去重，避免重复观点；质量门槛高，只保留最有价值的核心洞见。',
        },
      };
      const preview = previewMap[currentProfile];
      const previewEl = containerEl.createEl('div', {
        cls: 'setting-item-description',
      });
      previewEl.style.background = 'var(--background-secondary)';
      previewEl.style.padding = '8px 12px';
      previewEl.style.borderRadius = '6px';
      previewEl.style.marginBottom = '12px';
      previewEl.createEl('strong', { text: `当前：${preview.label}` });
      previewEl.createEl('br');
      previewEl.appendText(preview.desc);
    }

    // 高级设置折叠区
    const advancedToggle = new Setting(containerEl)
      .setName('高级参数调整')
      .setDesc('手动调整各策略的去重阈值和质量门槛，一般无需修改');
    
    let advancedContainer: HTMLElement | null = null;
    advancedToggle.addToggle(toggle =>
      toggle.setValue(false).onChange(show => {
        if (show && !advancedContainer) {
          advancedContainer = containerEl.createEl('div', { cls: 'filter-advanced-settings' });
          // 插入到 toggle 设置项的紧后面，而不是容器末尾
          advancedToggle.settingEl.insertAdjacentElement('afterend', advancedContainer);
          advancedContainer.style.borderLeft = '3px solid var(--interactive-accent)';
          advancedContainer.style.paddingLeft = '16px';
          advancedContainer.style.marginTop = '8px';
          advancedContainer.style.marginBottom = '12px';

          // 重置按钮
          new Setting(advancedContainer)
            .setName('恢复默认参数')
            .setDesc('将所有策略的阈值恢复为出厂设置')
            .addButton(btn =>
              btn
                .setButtonText('重置')
                .setWarning()
                .onClick(async () => {
                  this.plugin.settings.profileDense = { ...PROFILE_CONFIGS.dense };
                  this.plugin.settings.profileBalanced = { ...PROFILE_CONFIGS.balanced };
                  this.plugin.settings.profileSparse = { ...PROFILE_CONFIGS.sparse };
                  await this.plugin.saveSettings();
                  this.display();
                })
            );

          const profiles: { key: 'profileDense' | 'profileBalanced' | 'profileSparse'; label: string }[] = [
            { key: 'profileDense', label: '技术文献' },
            { key: 'profileBalanced', label: '通用文章' },
            { key: 'profileSparse', label: '观点评论' },
          ];

          for (const { key, label } of profiles) {
            const cfg = this.plugin.settings[key];

            advancedContainer.createEl('h4', { text: label, cls: 'filter-profile-group' });

            new Setting(advancedContainer)
              .setName('批内去重严格度')
              .setDesc('同批提炼的笔记之间，相似度多高才算重复？值越高越宽松')
              .addSlider(s => s
                .setLimits(0.3, 1.0, 0.05)
                .setValue(cfg.crossBatchThreshold)
                .setDynamicTooltip()
                .onChange(async v => { this.plugin.settings[key].crossBatchThreshold = v; await this.plugin.saveSettings(); })
              );

            new Setting(advancedContainer)
              .setName('与已有笔记去重（自动丢弃）')
              .setDesc('和知识库已有笔记太相似时直接丢弃。值越高越宽松')
              .addSlider(s => s
                .setLimits(0.5, 1.0, 0.05)
                .setValue(cfg.vaultHighThreshold)
                .setDynamicTooltip()
                .onChange(async v => { this.plugin.settings[key].vaultHighThreshold = v; await this.plugin.saveSettings(); })
              );

            new Setting(advancedContainer)
              .setName('与已有笔记去重（待确认）')
              .setDesc('相似度低于上一条但仍较高时，标记为"待确认"让你手动决定')
              .addSlider(s => s
                .setLimits(0.3, 0.9, 0.05)
                .setValue(cfg.vaultMidThreshold)
                .setDynamicTooltip()
                .onChange(async v => { this.plugin.settings[key].vaultMidThreshold = v; await this.plugin.saveSettings(); })
              );

            new Setting(advancedContainer)
              .setName('质量评分门槛')
              .setDesc('AI 复查总分（洞见+知识，2-10）低于此值的笔记会被丢弃。技术文献 4、通用文章 6、观点评论 7')
              .addSlider(s => s
                .setLimits(1, 10, 1)
                .setValue(cfg.reviewMinScore)
                .setDynamicTooltip()
                .onChange(async v => { this.plugin.settings[key].reviewMinScore = v; await this.plugin.saveSettings(); })
              );
          }
        } else if (!show && advancedContainer) {
          advancedContainer.remove();
          advancedContainer = null;
        }
      })
    );

    this.addDivider(containerEl);

    // ================================================================
    // ⑩ 深度提炼
    // ================================================================
    containerEl.createEl('h3', { text: '深度提炼' });

    new Setting(containerEl)
      .setName('启用深度提炼模式')
      .setDesc('对超长文章自动分段提炼，消耗更多 token')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableDeepMode)
          .onChange(async value => {
            this.plugin.settings.enableDeepMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('输入截断长度')
      .setDesc('超过此字数的文本将被截断后再发送给 AI（默认 10000 字，增大可保留更多内容但消耗更多 token）')
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.inputTruncateLength ?? 10000))
          .onChange(async value => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 1000) {
              this.plugin.settings.inputTruncateLength = num;
              await this.plugin.saveSettings();
            }
          })
      );

    this.addDivider(containerEl);

    // ================================================================
    // ⑪ 面板设置
    // ================================================================
    containerEl.createEl('h3', { text: '面板设置' });

    new Setting(containerEl)
      .setName('面板位置')
      .setDesc('控制插件面板在 Obsidian 界面中显示的位置')
      .addDropdown(dropdown =>
        dropdown
          .addOption('right', '右侧栏（推荐，与属性面板同列）')
          .addOption('left', '左侧栏（与文件树、标签同列）')
          .addOption('tab', '新标签页')
          .addOption('split', '分屏（当前编辑器分屏显示）')
          .setValue(this.plugin.settings.panelPosition || 'right')
          .onChange(async value => {
            this.plugin.settings.panelPosition = value as 'left' | 'right' | 'tab' | 'split';
            await this.plugin.saveSettings();
            new Notice('面板位置已更新，重新打开插件面板即可生效');
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

      const startTime = Date.now();
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
      const latency = Date.now() - startTime;

      if (response.status === 200) {
        const respModel = response.json?.model || model;
        const tokensUsed = response.json?.usage?.total_tokens;
        const tokenInfo = tokensUsed ? ` · 消耗 ${tokensUsed} tokens` : '';
        new Notice(`✓ 连接成功 · 模型: ${respModel} · 延迟: ${latency}ms${tokenInfo}`, 8000);
      } else {
        new Notice(`API 连接失败：HTTP ${response.status}`, 8000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 友好化常见错误
      let friendly = msg;
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        friendly = 'API Key 无效或已过期，请检查';
      } else if (msg.includes('429')) {
        friendly = '请求过于频繁或额度不足，请稍后重试';
      } else if (msg.includes('Failed to fetch') || msg.includes('network')) {
        friendly = '网络连接失败，请检查 API URL 或网络设置';
      }
      new Notice(`✗ 连接失败：${friendly}`, 10000);
    }
  }
}
