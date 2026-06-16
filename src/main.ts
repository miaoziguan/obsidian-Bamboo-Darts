/**
 * Bamboo Darts - 主入口文件
 *
 * 功能：从文章/链接/选中文本中提炼原子笔记，自动去重后存入知识库
 */

import { Plugin, Notice, Editor, MarkdownView, Menu, MenuItem } from 'obsidian';
import { AtomicNotesSettingTab, PluginSettings, DEFAULT_SETTINGS } from './ui/setting-tab';
import { runExtraction } from './extractor';
import { checkAgainstVault } from './deduplicator';

/**
 * 清洗剪贴板中的图片噪音：base64 / Markdown 图片 / HTML img / 图片 URL / 裸文件名 / 占位符
 */
function stripImageNoise(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '');
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/<img[^>]*\/?>/gi, '');
  cleaned = cleaned.replace(/^https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)(?:\?[^\s]*)?$/gim, '');
  cleaned = cleaned.replace(/^[\w-]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)\s*$/gim, '');
  cleaned = cleaned.replace(/^图(?:片)?\s*$/gim, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}
import { saveNotes } from './storage';
import { ResultModal } from './ui/result-modal';
import { InputModal } from './ui/input-modal';
import { AtomicNotesPanel, VIEW_TYPE_ATOMIC_PANEL } from './ui/panel-view';
import { computeSourceHash, getSourceTitle, addHistoryEntry, findPreviousExtraction } from './services/history-service';
import { insertBacklinks } from './services/backlink-service';

export default class AtomicNotesPlugin extends Plugin {
  settings: PluginSettings;
  _isExtracting: boolean = false; // Bug #2 修复：显式声明属性

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
    // Bug #22 修复：getLeaf 只接受一个参数，使用 getLeaf(true) 创建新叶
    const leaf = this.app.workspace.getLeaf('split');
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * 从选中文本提炼
   */
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

    await this.runExtraction({
      type: 'selection',
      content: selection,
    });
  }

  /**
   * 从 URL 提炼
   */
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
        await this.runExtraction({
          type: 'url',
          content: url.trim(),
        });
      },
    }).open();
  }

  /**
   * 从剪贴板提炼
   */
  async extractFromClipboard() {
    try {
      const rawText = await navigator.clipboard.readText();

      if (!rawText || rawText.trim().length === 0) {
        new Notice('剪贴板为空');
        return;
      }

      const text = stripImageNoise(rawText);

      await this.runExtraction({
        type: 'text',
        content: text,
      });
    } catch (error) {
      new Notice('无法读取剪贴板，请检查权限');
    }
  }

  /**
   * 运行提炼流程（public，供面板视图调用）
   * Bug #3 修复：从 private 改为 public
   */
  async runExtraction(input: {
    type: 'url' | 'text' | 'selection';
    content: string;
  }) {
    // 检查 API Key
    if (!this.settings.deepseekApiKey) {
      new Notice('请先在设置中填写 DeepSeek API Key');
      return;
    }

    // 检查是否已经提炼过相同内容
    const sourceHash = computeSourceHash(input.content);
    const previous = findPreviousExtraction(this.settings.extractionHistory || [], sourceHash);
    if (previous) {
      const daysAgo = Math.floor((Date.now() - new Date(previous.extractedAt).getTime()) / (1000 * 60 * 60 * 24));
      const timeStr = daysAgo === 0 ? '今天' : `${daysAgo}天前`;
      new Notice(`此内容已在${timeStr}提炼过（${previous.noteCount}条笔记），如需重新提炼请继续等待`);
    }

    new Notice('正在提炼原子笔记...');

    try {
      // Phase 1-6: 提炼（Bug #16 修复：传递完整配置）
      const result = await runExtraction(
        input,
        {
          deepseekApiKey: this.settings.deepseekApiKey,
          deepseekApiUrl: this.settings.deepseekApiUrl,
          model: this.settings.model,
          maxTokens: this.settings.maxTokens,
          extractionMode: 'ai',
          tagPreferences: this.settings.tagPreferences,
          tagMode: this.settings.tagMode,
          factCheck: this.settings.factCheck,
          verifiedOnly: this.settings.verifiedOnly,
          enableReview: this.settings.enableReview,
          reviewModel: this.settings.reviewModel,
          reviewApiUrl: this.settings.reviewApiUrl,
          reviewApiKey: this.settings.reviewApiKey,
        }
      );

      if (!result.success || !result.notes) {
        new Notice(`提炼失败：${result.error}`);
        return;
      }

      new Notice(`提炼完成，共 ${result.notes.length} 条原子笔记`);

      // 知识库去重
      new Notice('正在与知识库比对去重...');
      const dedupResult = await checkAgainstVault(
        this.app.vault,
        result.notes,
        this.settings.targetFolder
      );

      new Notice(`去重完成，将保存 ${dedupResult.uniqueNotes.length} 条笔记`);

      // 保存笔记
      let savedPaths: string[] = [];

      if (this.settings.autoSave) {
        new Notice('正在保存到知识库...');
        try {
          const saveResult = await saveNotes(
            this.app,
            dedupResult.uniqueNotes,
            {
              targetFolder: this.settings.targetFolder || 'Atomic Notes',
              fileNameTemplate: this.settings.fileNameTemplate || '{{title}}',
            }
          );
          savedPaths = saveResult.paths;
          if (saveResult.failed > 0 && saveResult.errors.length > 0) {
            new Notice(`保存完成，但 ${saveResult.failed} 条失败：${saveResult.errors.slice(0, 3).join('；')}`);
          } else {
            new Notice(`保存完成！成功 ${saveResult.success} 条`);
          }
        } catch (saveError) {
          new Notice(`保存过程出错：${saveError instanceof Error ? saveError.message : String(saveError)}`);
          console.error('自动保存失败：', saveError);
        }

        // Bug #6 修复：自动创建反向链接
        if (this.settings.autoBacklink && input.type === 'selection') {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (activeView) {
            const backlinkResult = insertBacklinks(activeView.editor, savedPaths);
            if (backlinkResult.success > 0) {
              new Notice(`已插入 ${backlinkResult.success} 条反向链接`);
            }
          }
        }
      } else {
        // 显示结果弹窗
        new ResultModal(
          this.app,
          { ...result, notes: dedupResult.uniqueNotes },
          dedupResult,
          async (notes) => {
            try {
              new Notice('正在保存到知识库...');
              const saveResult = await saveNotes(
                this.app,
                notes,
                {
                  targetFolder: this.settings.targetFolder || 'Atomic Notes',
                  fileNameTemplate: this.settings.fileNameTemplate || '{{title}}',
                }
              );
              savedPaths = saveResult.paths;
              if (saveResult.failed > 0 && saveResult.errors.length > 0) {
                new Notice(`保存完成，但 ${saveResult.failed} 条失败：${saveResult.errors.slice(0, 3).join('；')}`);
              } else {
                new Notice(`保存完成！成功 ${saveResult.success} 条`);
              }

              // Bug #6 修复：自动创建反向链接
              if (this.settings.autoBacklink && input.type === 'selection') {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                  const blResult = insertBacklinks(activeView.editor, savedPaths);
                  if (blResult.success > 0) {
                    new Notice(`已插入 ${blResult.success} 条反向链接`);
                  }
                }
              }

              // Bug #8 修复：记录提炼历史
              await this.recordHistory(input, notes.length, savedPaths);
            } catch (saveError) {
              new Notice(`保存过程出错：${saveError instanceof Error ? saveError.message : String(saveError)}`);
              console.error('保存失败：', saveError);
            }
          }
        ).open();

        // 非自动保存模式也需要记录历史（弹窗关闭前记录）
        await this.recordHistory(input, dedupResult.uniqueNotes.length, savedPaths);
      }
    } catch (error) {
      new Notice(`提炼失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Bug #8 修复：记录提炼历史
   */
  private async recordHistory(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    noteCount: number,
    savedPaths: string[]
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
      // 历史记录失败不影响主流程
      console.warn('记录提炼历史失败:', e);
    }
  }
}
