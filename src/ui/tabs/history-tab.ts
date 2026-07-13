/**
 * HistoryTab — 提炼历史面板
 *
 * 渲染提炼历史列表，支持：
 * - 查看历史记录（最多显示 20 条，可加载更多）
 * - 点击笔记链接在 Obsidian 中打开
 * - 单条删除（带二次确认）
 * - 清空全部历史（带 Modal 二次确认）
 */

import { AtomicNotesPlugin } from '../../main';
import { ExtractionHistoryEntry } from '../../services/history-service';
import { Modal, Notice, App } from 'obsidian';

export class HistoryTab {
  private plugin: AtomicNotesPlugin;

  /**
   * 当前处于确认态的删除按钮（用于互斥管理）
   * 同一时间只允许一个删除按钮处于确认态。
   */
  private _confirmingDelBtn:
    | { el: HTMLElement; timeout: ReturnType<typeof setTimeout> }
    | null = null;

  constructor(plugin: AtomicNotesPlugin) {
    this.plugin = plugin;
  }

  /** 渲染历史面板到 el 容器 */
  render(el: HTMLElement): void {
    el.empty();
    const history: ExtractionHistoryEntry[] = this.plugin.settings.extractionHistory || [];

    if (history.length === 0) {
      el.createEl('div', { cls: 'atomic-notes-empty-state' });
      const emptyEl = el.getElementsByClassName('atomic-notes-empty-state')[
        el.getElementsByClassName('atomic-notes-empty-state').length - 1
      ];
      emptyEl.createEl('span', { text: '📝', cls: 'empty-icon' });
      emptyEl.createEl('div', { text: '暂无提炼历史' });
      return;
    }

    // 顶部操作栏
    const toolbar = el.createEl('div', {
      attr: {
        style: 'display:flex;justify-content:space-between;align-items:center;padding:4px 8px 8px',
      },
    });
    toolbar.createEl('span', {
      text: `${history.length} 条记录`,
      attr: { style: 'font-size:11px;color:var(--text-muted)' },
    });
    const clearBtn = toolbar.createEl('button', {
      text: '清空全部',
      attr: {
        style:
          'padding:2px 10px;font-size:11px;cursor:pointer;background:var(--background-modifier-error);color:var(--text-on-accent);border:none;border-radius:4px',
      },
    });
    clearBtn.addEventListener('click', () => {
      this.showClearConfirmModal(el);
    });

    const listEl = el.createEl('div');
    const total = history.length;
    const displayCount = Math.min(total, 20);

    for (let i = total - 1; i >= 0; i--) {
      const entry = history[i];
      const idx = i;

      const itemEl = listEl.createEl('div', {
        attr: { style: 'padding:8px 0;border-bottom:1px solid var(--background-modifier-border)' },
      });
      if (i < total - displayCount) {
        (itemEl as HTMLElement).style.display = 'none';
      }

      const titleRow = itemEl.createEl('div', {
        attr: { style: 'display:flex;justify-content:space-between;align-items:flex-start' },
      });
      titleRow.createEl('div', {
        text: `${entry.extractedAt.slice(0, 10)}  ${entry.sourceTitle}`,
        attr: { style: 'font-size:13px;font-weight:bold;flex:1;word-break:break-all' },
      });
      const delBtn = titleRow.createEl('span', {
        text: '\u00D7',
        attr: {
          style:
            'font-size:16px;color:var(--text-muted);cursor:pointer;padding:0 4px;line-height:1',
        },
      });
      let delConfirming = false;
      delBtn.addEventListener('click', async () => {
        if (!delConfirming) {
          // 如果另一个按钮正在确认态，先复原
          if (this._confirmingDelBtn) {
            clearTimeout(this._confirmingDelBtn.timeout);
            this._confirmingDelBtn.el.setText('\u00D7');
            this._confirmingDelBtn.el.style.color = 'var(--text-muted)';
            this._confirmingDelBtn = null;
          }
          delConfirming = true;
          delBtn.setText('确认?');
          delBtn.style.color = 'var(--color-red)';
          const timeout = setTimeout(() => {
            if (delConfirming) {
              delConfirming = false;
              delBtn.setText('\u00D7');
              delBtn.style.color = 'var(--text-muted)';
            }
            if (this._confirmingDelBtn?.el === delBtn) {
              this._confirmingDelBtn = null;
            }
          }, 3000);
          this._confirmingDelBtn = { el: delBtn, timeout };
          return;
        }
        clearTimeout(this._confirmingDelBtn?.timeout);
        this._confirmingDelBtn = null;
        this.plugin.settings.extractionHistory!.splice(idx, 1);
        await this.plugin.saveSettings();
        this.render(el);
      });

      itemEl.createEl('div', {
        text: `${entry.sourceType === 'url' ? '[URL]' : '[文本]'}  ${entry.noteCount}条笔记`,
        attr: { style: 'font-size:11px;color:var(--text-muted);margin-top:2px' },
      });

      if (entry.savedPaths && entry.savedPaths.length > 0) {
        for (const savedPath of entry.savedPaths) {
          const linkEl = itemEl.createEl('a', {
            text: savedPath.split('/').pop(),
            attr: {
              href: '#',
              style:
                'font-size:11px;color:var(--text-accent);display:block;margin-left:8px;word-break:break-all;overflow-wrap:break-word',
            },
          });
          linkEl.addEventListener('click', (ev) => {
            ev.preventDefault();
            this.plugin.app.workspace.openLinkText(savedPath, '', false);
          });
        }
      }
    }

    if (total > 20) {
      const loadMoreBtn = listEl.createEl('button', {
        text: `加载更多 (${total - 20}条)`,
        attr: {
          style: 'margin:8px auto;display:block;padding:4px 16px;font-size:12px;cursor:pointer',
        },
      });
      loadMoreBtn.addEventListener('click', () => {
        for (let i = 20; i < total; i++) {
          (listEl.children[i] as HTMLElement).style.display = '';
        }
        loadMoreBtn.remove();
      });
    }
  }

  /** 显示"清空全部历史"确认对话框 */
  private showClearConfirmModal(targetEl: HTMLElement): void {
    const history: ExtractionHistoryEntry[] = this.plugin.settings.extractionHistory || [];

    const confirmModal = new (class extends Modal {
      tab: HistoryTab;
      targetEl: HTMLElement;

      constructor(app: App, tab: HistoryTab, targetEl: HTMLElement) {
        super(app);
        this.tab = tab;
        this.targetEl = targetEl;
      }

      onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl('h3', { text: '确认清空全部历史记录？' });
        this.contentEl.createEl('p', {
          text: `这将删除全部 ${history.length} 条提炼历史，已保存的笔记不会受影响。`,
          attr: { style: 'font-size:13px;color:var(--text-muted);margin:8px 0' },
        });
        const btnRow = this.contentEl.createEl('div', {
          attr: { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' },
        });
        btnRow.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
        const confirmBtn = btnRow.createEl('button', {
          text: '确认清空',
          attr: {
            style:
              'background:var(--background-modifier-error);color:var(--text-on-accent);border:none;padding:6px 16px;border-radius:6px;cursor:pointer',
          },
        });
        confirmBtn.addEventListener('click', async () => {
          this.tab.plugin.settings.extractionHistory = [];
          await this.tab.plugin.saveSettings();
          new Notice('历史记录已清空');
          this.close();
          this.tab.render(this.targetEl);
        });
      }

      onClose() {
        this.contentEl.empty();
      }
    })(this.plugin.app, this, targetEl);

    confirmModal.open();
  }
}
