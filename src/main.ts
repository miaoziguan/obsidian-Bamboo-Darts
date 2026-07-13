/**
 * Bamboo Darts - 主入口文件
 *
 * 职责：插件生命周期、命令注册、UI 编排
 * 提炼编排逻辑已委托给 ExtractionService
 */

import { Plugin, Notice, Editor, MarkdownView, Menu, MenuItem, TFile } from 'obsidian';
import { AtomicNotesSettingTab, PluginSettings, DEFAULT_SETTINGS } from './ui/setting-tab';
import { clearUrlCache } from './extractor';
import { isPathInFolder, clearDedupCache, getDefaultDedupCache } from './deduplicator';
import { DiscoveryIndex } from './discovery/index-manager';
import { invalidateDiscoveryCache } from './discovery/similarity-matrix';
import { stripImageNoise } from './utils/clipboard';
import { saveNotes } from './storage';
import { AtomicNote } from './utils/notes-standards';
import { ResultModal } from './ui/result-modal';
import { InputModal } from './ui/input-modal';
import { ForceExtractModal, DuplicateConfirmModal, ErrorModal } from './ui/aux-modals';
import { ProgressModal, IndexProgressModal } from './ui/progress-modal';
import { AtomicNotesPanel, VIEW_TYPE_ATOMIC_PANEL } from './ui/panel-view';
import {
  computeSourceHash,
  getSourceTitle,
  addHistoryEntry,
} from './services/history-service';
import { insertBacklinks } from './services/backlink-service';
import { ProgressCallback } from './extraction/progress';
import {
  ExtractionService,
  ExtractionSettingsSnapshot,
} from './services/extraction-service';
import { CancellationError } from './errors';
import { encryptApiKey, decryptApiKey } from './utils/crypto-store';

/** 友好化常见的 API 错误信息 */
function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('401') || raw.includes('Unauthorized'))
    return 'API Key 无效或已过期，请在设置中更新';
  if (raw.includes('429') || raw.includes('Too Many Requests'))
    return '请求过于频繁或额度不足，请稍后重试';
  if (raw.includes('402')) return 'API 额度不足，请检查账户余额';
  if (raw.includes('500') || raw.includes('502') || raw.includes('503'))
    return 'API 服务暂时不可用，请稍后重试';
  if (raw.includes('timeout') || raw.includes('ETIMEDOUT') || raw.includes('ECONNREFUSED'))
    return '网络连接超时，请检查 API URL 或网络设置';
  if (raw.includes('Failed to fetch') || raw.includes('network'))
    return '网络连接失败，请检查网络或 API URL';
  return raw;
}

export default class AtomicNotesPlugin extends Plugin {
  settings: PluginSettings;
  settingTab!: AtomicNotesSettingTab;
  discoveryIndex!: DiscoveryIndex;
  private _extractionService!: ExtractionService;
  private _progressModal: ProgressModal | null = null;
  private _discoveryUpdateTimers: Map<string, number> = new Map();

  /** 兼容 panel-view 直接访问 plugin._isExtracting */
  get _isExtracting(): boolean {
    return this._extractionService?.isExtracting ?? false;
  }

  async onload() {
    console.log('Bamboo Darts 插件加载中...');

    await this.loadSettings();

    // 初始化发现索引
    const pluginDir =
      this.manifest?.dir || `${this.app.vault.configDir}/plugins/atomic-notes-extractor`;
    this.discoveryIndex = new DiscoveryIndex(this.app.vault.adapter, pluginDir);
    // 后台加载，不阻塞插件启动
    this.discoveryIndex.load().catch((e) => {
      console.warn('[Bamboo Darts] 发现索引加载失败:', e);
    });

    // 初始化去重特征缓存
    getDefaultDedupCache()
      .initialize(this.app.vault.adapter, pluginDir)
      .catch((e) => {
        console.warn('[Bamboo Darts] 去重特征缓存初始化失败:', e);
      });

    // 监听笔记变更事件，保持发现索引同步
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this._scheduleDiscoveryUpdate(file.path, 500);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this._scheduleDiscoveryUpdate(file.path, 1000);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this._cancelDiscoveryUpdate(file.path);
          this.discoveryIndex.remove(file.path).catch((e) => {
            console.warn('[Bamboo Darts] 移除发现索引失败:', file.path, e);
          });
          invalidateDiscoveryCache();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this._cancelDiscoveryUpdate(oldPath);
          this.discoveryIndex.remove(oldPath).catch((e) => {
            console.warn('[Bamboo Darts] 重命名移除旧索引失败:', oldPath, e);
          });
          this.app.vault.read(file).then((content) =>
            this.discoveryIndex.update(file.path, content, undefined, file.stat.mtime).catch((e) => {
              console.warn('[Bamboo Darts] 重命名更新新索引失败:', file.path, e);
            })
          );
          invalidateDiscoveryCache();
        }
      }),
    );

    // 初始化提炼服务
    this._extractionService = new ExtractionService({
      vault: this.app.vault,
      pluginDir,
      adapter: this.app.vault.adapter,
    });

    // 注册面板视图
    this.registerView(VIEW_TYPE_ATOMIC_PANEL, (leaf) => new AtomicNotesPanel(leaf, this));

    // 添加设置页
    this.settingTab = new AtomicNotesSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // 添加命令：从选中文本提炼
    this.addCommand({
      id: 'extract-from-selection',
      name: '从选中文本提炼原子笔记',
      editorCallback: (_editor: Editor, _view: MarkdownView) => {
        this.extractFromSelection();
      },
    });

    // 添加命令：从 URL 提炼
    this.addCommand({
      id: 'extract-from-url',
      name: '从 URL 提炼原子笔记',
      callback: () => {
        this.extractFromUrl();
      },
    });

    // 添加命令：从剪贴板提炼
    this.addCommand({
      id: 'extract-from-clipboard',
      name: '从剪贴板提炼原子笔记',
      callback: () => {
        this.extractFromClipboard();
      },
    });

    // 添加命令：切换面板位置
    this.addCommand({
      id: 'open-panel-left',
      name: '打开面板 - 左侧栏',
      callback: () => this.openPanelAt('left'),
    });
    this.addCommand({
      id: 'open-panel-right',
      name: '打开面板 - 右侧栏',
      callback: () => this.openPanelAt('right'),
    });
    this.addCommand({
      id: 'open-panel-tab',
      name: '打开面板 - 新标签页',
      callback: () => this.openPanelAt('tab'),
    });
    this.addCommand({
      id: 'open-panel-split',
      name: '打开面板 - 分屏',
      callback: () => this.openPanelAt('split'),
    });

    // 添加 ribbon 图标（有选中文本→提炼，无选中文本→打开面板）
    this.addRibbonIcon('atom', '提炼原子笔记', () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        const selection = activeView.editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.extractFromSelection();
          return;
        }
      }
      this.activateView();
    });

    // 添加右键菜单（编辑器内选中文本后右键）
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, _view: MarkdownView) => {
        const selectedText = editor.getSelection();
        if (selectedText && selectedText.trim().length > 0) {
          menu.addItem((item: MenuItem) => {
            item
              .setTitle('提炼原子笔记')
              .setIcon('document')
              .onClick(() => {
                this.extractFromSelection();
              });
          });
        }
      }),
    );

    console.log('Bamboo Darts 插件加载完成');
  }

  async onunload() {
    await getDefaultDedupCache().flush().catch(() => {});
    this._extractionService.dispose();
    clearDedupCache();
    clearUrlCache();
    await this.discoveryIndex.flushSave().catch(() => {});
    for (const timer of this._discoveryUpdateTimers.values()) {
      window.clearTimeout(timer);
    }
    this._discoveryUpdateTimers.clear();
    console.log('Bamboo Darts 插件已卸载');
  }

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

      // 按版本号执行迁移
      const currentVersion = this.settings.settingsVersion || 1;

      if (currentVersion < 2) {
        // v1 → v2：清理已废弃字段，升级 maxTokens 默认值
        if ('enableDataCheck' in this.settings) {
          delete (this.settings as Record<string, unknown>).enableDataCheck;
        }
        if (this.settings.maxTokens === 2000) {
          this.settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
        }
        this.settings.settingsVersion = 2;
        await this.saveSettings();
      }

      if (currentVersion < 3) {
        // v2 → v3：默认开启内容核查与笔记复查
        this.settings.factCheck = true;
        this.settings.enableReview = true;
        this.settings.settingsVersion = 3;
        await this.saveSettings();
      }

      // 解密 API Key（兼容旧明文格式）
      let needsReEncrypt = false;
      for (const field of ['deepseekApiKey', 'hunyuanApiKey', 'reviewApiKey'] as const) {
        const stored = this.settings[field] as string | undefined;
        if (stored && !stored.startsWith('enc:')) {
          needsReEncrypt = true; // 旧明文 → 需要升级加密
        }
        const decrypted = decryptApiKey(stored);
        if (decrypted !== null) this.settings[field] = decrypted;
      }
      if (needsReEncrypt) {
        await this.saveSettings();
      }
    } catch (e) {
      console.warn('[Bamboo Darts] 设置加载失败，使用默认值:', e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  async saveSettings() {
    // 加密 API Key 再写入磁盘（内存保持明文，前端无感知）
    await this.saveData({
      ...this.settings,
      deepseekApiKey: encryptApiKey(this.settings.deepseekApiKey),
      hunyuanApiKey: encryptApiKey(this.settings.hunyuanApiKey || ''),
      reviewApiKey: encryptApiKey(this.settings.reviewApiKey || ''),
    });
  }

  /** 将当前设置转换为 ExtractionSettingsSnapshot */
  private getSettingsSnapshot(): ExtractionSettingsSnapshot {
    return {
      deepseekApiKey: this.settings.deepseekApiKey,
      deepseekApiUrl: this.settings.deepseekApiUrl,
      model: this.settings.model,
      maxTokens: this.settings.maxTokens,
      tagPreferences: this.settings.tagPreferences,
      tagMode: this.settings.tagMode,
      factCheck: this.settings.factCheck,
      verifiedOnly: this.settings.verifiedOnly,
      enableReview: this.settings.enableReview,
      reviewModel: this.settings.reviewModel,
      reviewApiUrl: this.settings.reviewApiUrl,
      reviewApiKey: this.settings.reviewApiKey,
      targetFolder: this.settings.targetFolder,
      dedupTargetFolder: this.settings.dedupTargetFolder,
      autoClassify: this.settings.autoClassify,
      contentProfile: this.settings.contentProfile,
      profileDense: this.settings.profileDense,
      profileBalanced: this.settings.profileBalanced,
      profileSparse: this.settings.profileSparse,
      enableDeepMode: this.settings.enableDeepMode,
      inputTruncateLength: this.settings.inputTruncateLength,
      enableSemanticDedup: this.settings.enableSemanticDedup ?? false,
      hunyuanApiKey: this.settings.hunyuanApiKey ?? '',
      hunyuanApiUrl: this.settings.hunyuanApiUrl ?? '',
      semanticSimilarityThreshold: this.settings.semanticSimilarityThreshold ?? 0.82,
    };
  }

  // ─── 面板管理 ───

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const position = this.settings.panelPosition || 'right';
    const leaf =
      position === 'left'
        ? this.app.workspace.getLeftLeaf(false)
        : position === 'right'
          ? this.app.workspace.getRightLeaf(false)
          : this.app.workspace.getLeaf(position === 'tab' ? 'tab' : 'split');
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openPanelAt(position: 'left' | 'right' | 'tab' | 'split') {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      await existing[0].detach();
    }

    const leaf =
      position === 'left'
        ? this.app.workspace.getLeftLeaf(false)
        : position === 'right'
          ? this.app.workspace.getRightLeaf(false)
          : this.app.workspace.getLeaf(position === 'tab' ? 'tab' : 'split');
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // ─── 输入收集 ───

  async extractFromSelection() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice('请先打开一个 Markdown 文件');
      return;
    }
    const editor = activeView.editor;
    const selection = editor.getSelection();
    if (!selection || selection.trim().length === 0) {
      new Notice('请先选中要提炼的文本');
      return;
    }
    await this.runExtraction({ type: 'selection', content: selection });
  }

  async extractFromUrl() {
    new InputModal(this.app, {
      title: '输入 URL',
      placeholder: 'https://example.com/article',
      submitText: '开始提炼',
      onSubmit: async (url: string) => {
        if (!url || !url.trim()) {
          new Notice('请输入有效的 URL');
          return;
        }
        await this.runExtraction({ type: 'url', content: url.trim() });
      },
    }).open();
  }

  async extractFromClipboard() {
    if (!navigator.clipboard?.readText) {
      new Notice('当前环境不支持直接读取剪贴板，请手动粘贴文本');
      return;
    }
    try {
      const rawText = await navigator.clipboard.readText();
      if (!rawText || rawText.trim().length === 0) {
        new Notice('剪贴板为空');
        return;
      }
      const text = stripImageNoise(rawText);
      await this.runExtraction({ type: 'text', content: text });
    } catch (error) {
      new Notice('无法读取剪贴板，请检查权限或使用面板的文本输入');
    }
  }

  // ─── 提炼编排（委托 ExtractionService） ───

  async runExtraction(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean } = {},
  ) {
    // mutex 守卫：如果正在提炼且进度 Modal 已在屏幕上，静默返回
    if (this._extractionService.isExtracting) {
      if (this._progressModal && !this._progressModal.isClosed) return;
      new Notice('已有提取任务正在进行中，请等待完成后再试');
      return;
    }

    // 重复提炼检测
    if (!opts.skipDuplicateCheck) {
      const previous = this._extractionService.checkDuplicate(
        input.content,
        this.settings.extractionHistory || [],
      );
      if (previous) {
        this.showDuplicateConfirm(input, previous, opts);
        return;
      }
    }

    // 创建进度回调（Modal 或面板回调）
    let progressModal: ProgressModal | null = null;
    const progressCb: ProgressCallback =
      opts.onProgress ||
      ((event, allEvents, totalMs) => {
        if (!progressModal) {
          progressModal = new ProgressModal(this.app, () => this.cancelExtraction());
          progressModal.open();
          this._progressModal = progressModal;
        }
        progressModal.update(event, allEvents, totalMs);
      });

    try {
      const result = await this._extractionService.extract(
        input,
        this.getSettingsSnapshot(),
        { onProgress: progressCb, skipGate: opts.skipGate },
      );

      // 语义去重被跳过时通知用户
      if (result.semanticDedupSkipped) {
        new Notice('向量索引正在构建中，本次提炼跳过语义去重');
      }

      // 结果路由
      if (!result.success || !result.notes) {
        if (result.error && result.error.includes('取消')) {
          new Notice('提炼已取消');
        } else if (result.error && result.error.includes('API Key')) {
          new Notice(result.error);
        } else if (result.gateBlocked) {
          this.showForceExtractConfirm(input, result.error || '内容质量不达标');
        } else {
          this.showErrorModal(input, friendlyError(result.error), opts, false);
        }
        return;
      }

      new Notice(`提炼完成，共 ${result.notes.length} 条原子笔记`);
      if (this.settings.autoSave) {
        await this.saveAndBacklink(input, result.notes);
      } else {
        new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => {
          await this.saveAndBacklink(input, notes);
        }).open();
      }
    } catch (error) {
      // 精确判断取消：
      // 1. CancellationError：ExtractionService 中 AbortError 重新抛出
      // 2. AbortError：requestUrl 等底层操作直接抛出的取消信号
      const isCancel =
        error instanceof CancellationError ||
        (error instanceof Error && error.name === 'AbortError');
      if (isCancel) {
        new Notice('提炼已取消');
        return;
      }
      this.showErrorModal(input, friendlyError(error), opts, true);
    } finally {
      this._progressModal = null;
      progressModal?.safeClose();
    }
  }

  async rebuildVectorIndex() {
    if (this._extractionService.isBuildingIndex) {
      new Notice('向量索引构建正在进行中，请等待完成后再试');
      return;
    }
    if (!this.settings.enableSemanticDedup || !this.settings.hunyuanApiKey) {
      new Notice('请先在设置中启用语义去重并填写混元 API Key');
      return;
    }

    const targetFolder =
      this.settings.dedupTargetFolder?.trim() || this.settings.targetFolder || '原子笔记';
    const allFiles = this.app.vault.getMarkdownFiles();
    const files = allFiles.filter((f) => isPathInFolder(f.path, targetFolder));
    if (files.length === 0) {
      new Notice(`目标文件夹 "${targetFolder}" 中没有 Markdown 文件`);
      return;
    }

    const modal = new IndexProgressModal(this.app);
    modal.open();

    try {
      const result = await this._extractionService.rebuildVectorIndex(
        files,
        this.getSettingsSnapshot(),
        (processed, total, fromCache, fetched) => {
          modal.update(processed, total, fromCache, fetched);
        },
      );

      modal.safeClose();
      new Notice(
        `向量索引构建完成！共 ${result.total} 个文件，其中 ${result.fromCache} 个来自缓存，${result.fetched} 个新构建`,
      );
    } catch (error) {
      modal.safeClose();
      const errMsg = error instanceof Error ? error.message : String(error);
      new Notice(`构建失败：${errMsg}`);
      console.error('[Bamboo Darts] 向量索引构建失败：', error);
    }
  }

  cancelExtraction() {
    this._extractionService.cancel();
  }

  // ─── UI 弹窗 ───

  private showForceExtractConfirm(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    gateError: string,
  ) {
    new ForceExtractModal(this.app, this, input, gateError).open();
  }

  private showDuplicateConfirm(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    previous: { extractedAt: string; noteCount: number; savedPaths?: string[] },
    opts: { onProgress?: ProgressCallback; skipGate?: boolean },
  ) {
    new DuplicateConfirmModal(this.app, this, input, previous, opts).open();
  }

  private showErrorModal(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    errorMsg: string,
    opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean },
    retryable: boolean,
  ) {
    new ErrorModal(this.app, this, input, errorMsg, opts, retryable).open();
  }

  // ─── 保存 & 历史 ───

  private async saveAndBacklink(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    notes: AtomicNote[],
  ) {
    let savedPaths: string[] = [];
    let savedCount = 0;
    try {
      new Notice('正在保存到知识库...');
      const saveResult = await saveNotes(this.app, notes, {
        targetFolder: this.settings.targetFolder || '原子笔记',
        fileNameTemplate: this.settings.fileNameTemplate || '{{title}}',
      });
      savedPaths = saveResult.paths;
      savedCount = saveResult.success;
      if (saveResult.failed > 0 && saveResult.errors.length > 0) {
        new Notice(
          `保存完成，但 ${saveResult.failed} 条失败：${saveResult.errors.slice(0, 3).join('；')}`,
        );
      } else {
        new Notice(`保存完成！成功 ${saveResult.success} 条`);
      }
    } catch (saveError) {
      new Notice(
        `保存过程出错：${saveError instanceof Error ? saveError.message : String(saveError)}`,
      );
      console.error('保存失败：', saveError);
      return;
    }
    if (this.settings.autoBacklink && input.type === 'selection') {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        const backlinkResult = insertBacklinks(activeView.editor, savedPaths);
        if (backlinkResult.success > 0) {
          new Notice(`已插入 ${backlinkResult.success} 条反向链接`);
        }
      }
    }

    // 更新发现索引（缓存保存笔记的特征，供发现 Tab 快速计算）
    if (savedPaths.length > 0) {
      this.updateDiscoveryIndex(savedPaths).catch((e) => {
        console.warn('[Bamboo Darts] 保存后更新发现索引失败:', e);
      });
    }

    await this.recordHistory(input, savedCount, savedPaths);
  }

  /**
   * 安排延迟更新发现索引（防抖），避免每次保存都写磁盘
   */
  private _scheduleDiscoveryUpdate(path: string, delayMs: number): void {
    this._cancelDiscoveryUpdate(path);
    const timer = window.setTimeout(() => {
      this._discoveryUpdateTimers.delete(path);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== 'md') return;

      this.app.vault
        .read(file)
        .then((content) =>
          this.discoveryIndex.update(path, content, undefined, file.stat.mtime),
        )
        .then(() => {
          invalidateDiscoveryCache();
        })
        .catch((e) => {
          console.warn('[Bamboo Darts] 延迟更新发现索引失败:', path, e);
        });
    }, delayMs);
    this._discoveryUpdateTimers.set(path, timer);
  }

  /**
   * 取消指定路径的待更新定时器
   */
  private _cancelDiscoveryUpdate(path: string): void {
    const timer = this._discoveryUpdateTimers.get(path);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this._discoveryUpdateTimers.delete(path);
    }
  }
  private async updateDiscoveryIndex(paths: string[]): Promise<void> {
    const entries: Array<{ path: string; content: string; mtime: number }> = [];
    for (const path of paths) {
      try {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          entries.push({ path, content, mtime: file.stat.mtime });
        }
      } catch (e) {
        console.warn('[Bamboo Darts] 读取笔记更新发现索引失败:', path, e);
      }
    }
    if (entries.length > 0) {
      await this.discoveryIndex.updateBatch(entries);
      invalidateDiscoveryCache();
    }
  }

  private async recordHistory(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    noteCount: number,
    savedPaths: string[],
  ) {
    try {
      const sourceHash = computeSourceHash(input.content);
      const sourceTitle = getSourceTitle(input.type, input.content);
      const history = this.settings.extractionHistory || [];
      const updatedHistory = addHistoryEntry(history, {
        sourceHash,
        sourceTitle,
        sourceType: input.type,
        extractedAt: new Date().toISOString(),
        noteCount,
        savedPaths,
      });
      this.settings.extractionHistory = updatedHistory;
      await this.saveSettings();
    } catch (e) {
      console.warn('记录提炼历史失败:', e);
      // 历史记录保存失败不影响主流程，但应告知用户
      new Notice('⚠️ 提炼历史记录保存失败，已跳过（不影响笔记保存）');
    }
  }
}
