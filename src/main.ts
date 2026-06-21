/**
 * Bamboo Darts - 主入口文件
 *
 * 功能：从文章/链接/选中文本中提炼原子笔记，自动去重后存入知识库
 */

import { Plugin, Notice, Editor, MarkdownView, Menu, MenuItem, Modal, App } from 'obsidian';
import { AtomicNotesSettingTab, PluginSettings, DEFAULT_SETTINGS } from './ui/setting-tab';
import { runExtraction } from './extractor';
import { stripImageNoise } from './utils/clipboard';
import { saveNotes } from './storage';
import { AtomicNote } from './utils/notes-standards';
import { ResultModal } from './ui/result-modal';
import { InputModal } from './ui/input-modal';
import { ForceExtractModal, DuplicateConfirmModal, ErrorModal } from './ui/aux-modals';
import { AtomicNotesPanel, VIEW_TYPE_ATOMIC_PANEL } from './ui/panel-view';
import { computeSourceHash, getSourceTitle, addHistoryEntry, findPreviousExtraction } from './services/history-service';
import { insertBacklinks } from './services/backlink-service';
import { ProgressCallback, ProgressEvent } from './extraction/progress';

/** 友好化常见的 API 错误信息 */
function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('401') || raw.includes('Unauthorized')) return 'API Key 无效或已过期，请在设置中更新';
  if (raw.includes('429') || raw.includes('Too Many Requests')) return '请求过于频繁或额度不足，请稍后重试';
  if (raw.includes('402')) return 'API 额度不足，请检查账户余额';
  if (raw.includes('500') || raw.includes('502') || raw.includes('503')) return 'API 服务暂时不可用，请稍后重试';
  if (raw.includes('timeout') || raw.includes('ETIMEDOUT') || raw.includes('ECONNREFUSED')) return '网络连接超时，请检查 API URL 或网络设置';
  if (raw.includes('Failed to fetch') || raw.includes('network')) return '网络连接失败，请检查网络或 API URL';
  return raw;
}


// ─── 共享样式常量 ───

export default class AtomicNotesPlugin extends Plugin {
  settings: PluginSettings;
  _isExtracting: boolean = false;
  private _abortController: AbortController | null = null;
  private _progressModal: Modal | null = null;

  async onload() {
    console.log('Bamboo Darts 插件加载中...');

    // 加载设置
    await this.loadSettings();

    // 注册面板视图
    this.registerView(VIEW_TYPE_ATOMIC_PANEL, (leaf) => new AtomicNotesPanel(leaf, this));

    // 添加设置页
    this.addSettingTab(new AtomicNotesSettingTab(this.app, this));

    // 添加命令：从选中文本提炼
    this.addCommand({
      id: 'extract-from-selection',
      name: '从选中文本提炼原子笔记',
      editorCallback: (editor: Editor, view: MarkdownView) => {
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
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
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
      })
    );

    console.log('Bamboo Darts 插件加载完成');
  }

  async onunload() {
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
          delete (this.settings as any).enableDataCheck;
        }
        if (this.settings.maxTokens === 2000) {
          this.settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
        }
        this.settings.settingsVersion = 2;
        await this.saveSettings();
      }
    } catch (e) {
      console.warn('[Bamboo Darts] 设置加载失败，使用默认值:', e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * 激活原子笔记面板视图
   */
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const position = this.settings.panelPosition || 'right';
    const leaf =
      position === 'left' ? this.app.workspace.getLeftLeaf(false) :
      position === 'right' ? this.app.workspace.getRightLeaf(false) :
      this.app.workspace.getLeaf(position === 'tab' ? 'tab' : 'split');
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * 在指定位置打开面板
   */
  async openPanelAt(position: 'left' | 'right' | 'tab' | 'split') {
    // 如果面板已存在，先关闭
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      await existing[0].detach();
    }

    const leaf =
      position === 'left' ? this.app.workspace.getLeftLeaf(false) :
      position === 'right' ? this.app.workspace.getRightLeaf(false) :
      this.app.workspace.getLeaf(position === 'tab' ? 'tab' : 'split');
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

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
        if (!url || !url.trim()) { new Notice('请输入有效的 URL'); return; }
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
      if (!rawText || rawText.trim().length === 0) { new Notice('剪贴板为空'); return; }
      const text = stripImageNoise(rawText);
      await this.runExtraction({ type: 'text', content: text });
    } catch (error) { new Notice('无法读取剪贴板，请检查权限或使用面板的文本输入'); }
  }

  async runExtraction(input: { type: 'url' | 'text' | 'selection'; content: string }, opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean } = {}) {
    if (this._isExtracting) {
      // 进度 Modal 已在屏幕上，静默返回
      if (this._progressModal) return;
      new Notice('已有提取任务正在进行中，请等待完成后再试');
      return;
    }

    // 重复提炼检测（在正式开始前检查，给用户选择权）
    if (!opts.skipDuplicateCheck) {
      const sourceHash = computeSourceHash(input.content);
      const previous = findPreviousExtraction(this.settings.extractionHistory || [], sourceHash);
      if (previous) {
        this.showDuplicateConfirm(input, previous, opts);
        return;
      }
    }

    this._isExtracting = true;
    if (!this.settings.deepseekApiKey) {
      new Notice('请先在设置中填写 DeepSeek API Key');
      this._isExtracting = false;
      return;
    }
    this._abortController = new AbortController();
    let progressModal: Modal | null = null;
    let progressModalClosed = false; // 防止关闭后 onProgress 继续写入

    /** 安全关闭进度 Modal */
    const closeProgressModal = () => {
      if (progressModalClosed || !progressModal) return;
      progressModalClosed = true;
      try {
        progressModal.contentEl.empty();
        progressModal.close();
        if (progressModal.containerEl?.parentNode) {
          progressModal.containerEl.parentNode.removeChild(progressModal.containerEl);
        }
      } catch { /* 忽略 */ }
      progressModal = null;
    };
    let progressCb: ProgressCallback | undefined = opts.onProgress;
    if (!progressCb) {
      const m = new (class extends Modal {
        _title: HTMLElement; _body: HTMLElement;
        _cancelBtn: HTMLButtonElement | null = null;
        _plugin: AtomicNotesPlugin;
        constructor(p: Plugin) { super(p.app); this._plugin = p as AtomicNotesPlugin; }
        onOpen() {
          this.containerEl.style.zIndex = '1000';
          this.modalEl.style.minWidth = '280px';
          this.modalEl.style.maxWidth = '420px';
          this._title = this.contentEl.createEl('div', { attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:8px' }, text: '正在提炼原子笔记...' });
          this._body = this.contentEl.createEl('div', { attr: { style: 'font-size:12px;color:var(--text-muted);line-height:1.6;max-height:200px;overflow-y:auto' } });
          // 取消按钮
          const btnRow = this.contentEl.createEl('div', { attr: { style: 'display:flex;justify-content:flex-end;margin-top:12px' } });
          this._cancelBtn = btnRow.createEl('button', { text: '取消提炼', attr: { style: 'font-size:12px;padding:4px 16px;cursor:pointer' } });
          this._cancelBtn.addEventListener('click', () => {
            this._plugin.cancelExtraction();
            if (this._cancelBtn) {
              this._cancelBtn.disabled = true;
              this._cancelBtn.setText('取消中（当前步骤完成后生效）...');
            }
          });
        }
        update(event: ProgressEvent, allEvents: ProgressEvent[], totalMs: number) {
          if (progressModalClosed) return;
          this._title.setText(`${event.phase}：${event.name} — 已用时 ${(totalMs / 1000).toFixed(1)}s`);
          this._body.empty();
          for (const ev of allEvents) {
            const icon = ev.status === 'running' ? '⟳ ' : (ev.status === 'success' ? '✓ ' : (ev.status === 'failed' ? '✗ ' : '− '));
            const line = this._body.createEl('div', { text: `${icon}${ev.phase} ${ev.name}${ev.detail ? ' — ' + ev.detail : ''}` });
            if (ev.status === 'running') line.style.color = 'var(--text-accent)';
            if (ev.status === 'success') line.style.color = 'var(--text-success)';
            if (ev.status === 'failed') line.style.color = 'var(--text-error)';
          }
          if (event.subProgress) {
            this._body.createEl('div', { attr: { style: 'margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)' }, text: `进度 ${event.subProgress.current}/${event.subProgress.total}${event.subProgress.label ? '（' + event.subProgress.label + '）' : ''}` });
          }
        }
        onClose() { this.contentEl.empty(); }
      })(this);
      m.open();
      progressModal = m;
      this._progressModal = m;
      progressCb = (event, allEvents, totalMs) => m.update(event, allEvents, totalMs);
    }
    try {
      const result = await runExtraction(input, {
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
        signal: this._abortController.signal,
        vault: this.app.vault,
        targetFolder: this.settings.targetFolder,
        dedupTargetFolder: this.settings.dedupTargetFolder,
        enableVaultDedup: true,
        onProgress: progressCb,
        // Profile 过滤策略
        autoClassify: this.settings.autoClassify,
        profile: this.settings.autoClassify ? undefined : this.settings.contentProfile,
        profileConfigs: {
          dense: this.settings.profileDense,
          balanced: this.settings.profileBalanced,
          sparse: this.settings.profileSparse,
        },
        // 深度提炼
        enableDeepMode: this.settings.enableDeepMode,
        // 输入截断长度
        inputTruncateLength: this.settings.inputTruncateLength,
        // 强制提炼（跳过门控）
        skipGate: opts.skipGate,
      });
      if (!result.success || !result.notes) {
        if (result.error && result.error.includes('取消')) {
          new Notice('提炼已取消');
        } else if (result.gateBlocked) {
          // 门控失败 → 弹确认框，提供强制提炼选项
          this._isExtracting = false;
          this._abortController = null;
          closeProgressModal();
          this.showForceExtractConfirm(input, result.error || '内容质量不达标');
          return;
        } else {
          // 其他错误 → 弹错误弹窗
          this.showErrorModal(input, friendlyError(result.error), opts, false);
        }
        return;
      }
      new Notice(`提炼完成，共 ${result.notes.length} 条原子笔记`);
      // 始终弹出结果弹窗，让用户审查质量和选择保存
      new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => { await this.saveAndBacklink(input, notes); }).open();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') { new Notice('提炼已取消'); return; }
      // API 错误 → 弹错误弹窗，提供重试
      this.showErrorModal(input, friendlyError(error), opts, true);
    } finally {
      this._isExtracting = false;
      this._abortController = null;
      this._progressModal = null;
      closeProgressModal();
    }
  }

  cancelExtraction() {
    if (this._abortController) { this._abortController.abort(); }
  }

  /**
   * 门控失败后的强制提炼确认框
   */
  private showForceExtractConfirm(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    gateError: string
  ) {
    new ForceExtractModal(this.app, this, input, gateError).open();
  }

  /**
   * 重复提炼确认框
   */
  private showDuplicateConfirm(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    previous: { extractedAt: string; noteCount: number; savedPaths?: string[] },
    opts: { onProgress?: ProgressCallback; skipGate?: boolean }
  ) {
    new DuplicateConfirmModal(this.app, this, input, previous, opts).open();
  }

  /**
   * 提炼失败的错误弹窗（含重试按钮）
   */
  private showErrorModal(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    errorMsg: string,
    opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean },
    retryable: boolean
  ) {
    new ErrorModal(this.app, this, input, errorMsg, opts, retryable).open();
  }

  private async saveAndBacklink(input: { type: 'url' | 'text' | 'selection'; content: string }, notes: AtomicNote[]) {
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
        new Notice(`保存完成，但 ${saveResult.failed} 条失败：${saveResult.errors.slice(0, 3).join('；')}`);
      } else {
        new Notice(`保存完成！成功 ${saveResult.success} 条`);
      }
    } catch (saveError) {
      new Notice(`保存过程出错：${saveError instanceof Error ? saveError.message : String(saveError)}`);
      console.error('保存失败：', saveError);
      return;
    }
    if (this.settings.autoBacklink && input.type === 'selection') {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        const backlinkResult = insertBacklinks(activeView.editor, savedPaths);
        if (backlinkResult.success > 0) { new Notice(`已插入 ${backlinkResult.success} 条反向链接`); }
      }
    }
    await this.recordHistory(input, savedCount, savedPaths);
  }

  private async recordHistory(input: { type: 'url' | 'text' | 'selection'; content: string }, noteCount: number, savedPaths: string[]) {
    try {
      const sourceHash = computeSourceHash(input.content);
      const sourceTitle = getSourceTitle(input.type, input.content);
      const history = this.settings.extractionHistory || [];
      const updatedHistory = addHistoryEntry(history, { sourceHash, sourceTitle, sourceType: input.type, extractedAt: new Date().toISOString(), noteCount, savedPaths });
      this.settings.extractionHistory = updatedHistory;
      await this.saveSettings();
    } catch (e) { console.warn('记录提炼历史失败:', e); }
  }
}