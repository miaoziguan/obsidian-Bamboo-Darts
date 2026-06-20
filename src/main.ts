/**
 * Bamboo Darts - 主入口文件
 *
 * 功能：从文章/链接/选中文本中提炼原子笔记，自动去重后存入知识库
 */

import { Plugin, Notice, Editor, MarkdownView, Menu, MenuItem, Modal } from 'obsidian';
import { AtomicNotesSettingTab, PluginSettings, DEFAULT_SETTINGS } from './ui/setting-tab';
import { runExtraction } from './extractor';
import { stripImageNoise } from './utils/clipboard';
import { saveNotes } from './storage';
import { AtomicNote } from './utils/notes-standards';
import { ResultModal } from './ui/result-modal';
import { InputModal } from './ui/input-modal';
import { AtomicNotesPanel, VIEW_TYPE_ATOMIC_PANEL } from './ui/panel-view';
import { computeSourceHash, getSourceTitle, addHistoryEntry, findPreviousExtraction } from './services/history-service';
import { insertBacklinks } from './services/backlink-service';
import { ProgressCallback, ProgressEvent } from './extraction/progress';

export default class AtomicNotesPlugin extends Plugin {
  settings: PluginSettings;
  _isExtracting: boolean = false;
  private _abortController: AbortController | null = null;

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

    // 添加 ribbon 图标
    this.addRibbonIcon('atom', '提炼原子笔记', () => {
      this.extractFromSelection();
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
    try {
      const rawText = await navigator.clipboard.readText();
      if (!rawText || rawText.trim().length === 0) { new Notice('剪贴板为空'); return; }
      const text = stripImageNoise(rawText);
      await this.runExtraction({ type: 'text', content: text });
    } catch (error) { new Notice('无法读取剪贴板，请检查权限'); }
  }

  async runExtraction(input: { type: 'url' | 'text' | 'selection'; content: string }, opts: { onProgress?: ProgressCallback } = {}) {
    if (this._isExtracting) { new Notice('已有提取任务在进行中，请等待完成后再试'); return; }
    this._isExtracting = true;
    if (!this.settings.deepseekApiKey) {
      new Notice('请先在设置中填写 DeepSeek API Key');
      this._isExtracting = false;
      return;
    }
    const sourceHash = computeSourceHash(input.content);
    const previous = findPreviousExtraction(this.settings.extractionHistory || [], sourceHash);
    if (previous) {
      const daysAgo = Math.floor((Date.now() - new Date(previous.extractedAt).getTime()) / (1000 * 60 * 60 * 24));
      const timeStr = daysAgo === 0 ? '今天' : `${daysAgo}天前`;
      new Notice(`此内容已在${timeStr}提炼过（${previous.noteCount}条笔记），如需重新提炼请继续等待`);
    }
    this._abortController = new AbortController();
    let progressModal: Modal | null = null;
    let progressCb: ProgressCallback | undefined = opts.onProgress;
    if (!progressCb) {
      const m = new (class extends Modal {
        _title: HTMLElement; _body: HTMLElement;
        constructor(p: Plugin) { super(p.app); }
        onOpen() {
          this.containerEl.style.zIndex = '1000';
          this.modalEl.style.minWidth = '280px';
          this.modalEl.style.maxWidth = '420px';
          this._title = this.contentEl.createEl('div', { attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:8px' }, text: '正在提炼原子笔记...' });
          this._body = this.contentEl.createEl('div', { attr: { style: 'font-size:12px;color:var(--text-muted);line-height:1.6;max-height:200px;overflow-y:auto' } });
        }
        update(event: ProgressEvent, allEvents: ProgressEvent[], totalMs: number) {
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
      });
      if (!result.success || !result.notes) {
        if (result.error && result.error.includes('取消')) new Notice('提炼已取消');
        else new Notice(`提炼失败：${result.error}`);
        return;
      }
      new Notice(`提炼完成，共 ${result.notes.length} 条原子笔记`);
      if (this.settings.autoSave) {
        if (result.duplicateHints && result.duplicateHints.length > 0) {
          new Notice(`检测到 ${new Set(result.duplicateHints.map(h => h.noteIndex)).size} 篇疑似重复笔记，请确认后保存`);
          new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => { await this.saveAndBacklink(input, notes); }).open();
        } else {
          new Notice('正在保存到知识库...');
          await this.saveAndBacklink(input, result.notes);
        }
      } else {
        new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => { await this.saveAndBacklink(input, notes); }).open();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') { new Notice('提炼已取消'); return; }
      new Notice(`提炼失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this._isExtracting = false;
      this._abortController = null;
      if (progressModal) {
        try {
          // 先清空内容，防止 update 回调在 close 后继续执行
          progressModal.contentEl.empty();
          progressModal.close();
          // 强制移除 DOM 元素，确保不会残留
          if (progressModal.containerEl && progressModal.containerEl.parentNode) {
            progressModal.containerEl.parentNode.removeChild(progressModal.containerEl);
          }
        } catch { /* 忽略关闭错误 */ }
        progressModal = null;
      }
    }
  }

  cancelExtraction() {
    if (this._abortController) { this._abortController.abort(); }
  }

  private async saveAndBacklink(input: { type: 'url' | 'text' | 'selection'; content: string }, notes: AtomicNote[]) {
    let savedPaths: string[] = [];
    let savedCount = 0;
    try {
      new Notice('正在保存到知识库...');
      const saveResult = await saveNotes(this.app, notes, {
        targetFolder: this.settings.targetFolder || 'Atomic Notes',
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