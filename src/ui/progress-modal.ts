/**
 * 提炼进度弹窗 & 向量索引进度弹窗
 *
 * 从 main.ts 内联匿名 Modal 类提取而来，
 * 解耦 UI 与提炼业务逻辑。
 */

import { Modal, App } from 'obsidian';
import type { ProgressEvent } from '../extraction/progress';

// ─── 提炼进度弹窗 ───

export class ProgressModal extends Modal {
  private _title!: HTMLElement;
  private _body!: HTMLElement;
  private _cancelBtn: HTMLButtonElement | null = null;
  private _onCancel: () => void;
  private _closed = false;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this._onCancel = onCancel;
  }

  get isClosed(): boolean {
    return this._closed;
  }

  onOpen() {
    this.containerEl.style.zIndex = '1000';
    this.modalEl.style.minWidth = '280px';
    this.modalEl.style.maxWidth = '420px';

    this._title = this.contentEl.createEl('div', {
      attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:8px' },
      text: '正在提炼原子笔记...',
    });
    this._body = this.contentEl.createEl('div', {
      attr: {
        style:
          'font-size:12px;color:var(--text-muted);line-height:1.6;max-height:200px;overflow-y:auto',
      },
    });

    // 取消按钮
    const btnRow = this.contentEl.createEl('div', {
      attr: { style: 'display:flex;justify-content:flex-end;margin-top:12px' },
    });
    this._cancelBtn = btnRow.createEl('button', {
      text: '取消提炼',
      attr: { style: 'font-size:12px;padding:4px 16px;cursor:pointer' },
    });
    this._cancelBtn.addEventListener('click', () => {
      this._onCancel();
      if (this._cancelBtn) {
        this._cancelBtn.disabled = true;
        this._cancelBtn.setText('取消中（当前步骤完成后生效）...');
      }
    });
  }

  update(event: ProgressEvent, allEvents: ProgressEvent[], totalMs: number) {
    if (this._closed) return;

    this._title.setText(
      `${event.phase}：${event.name} — 已用时 ${(totalMs / 1000).toFixed(1)}s`,
    );
    this._body.empty();

    for (const ev of allEvents) {
      const icon =
        ev.status === 'running'
          ? '⟳ '
          : ev.status === 'success'
            ? '✓ '
            : ev.status === 'failed'
              ? '✗ '
              : '− ';
      const line = this._body.createEl('div', {
        text: `${icon}${ev.phase} ${ev.name}${ev.detail ? ' — ' + ev.detail : ''}`,
      });
      if (ev.status === 'running') line.style.color = 'var(--text-accent)';
      if (ev.status === 'success') line.style.color = 'var(--text-success)';
      if (ev.status === 'failed') line.style.color = 'var(--text-error)';
    }

    if (event.subProgress) {
      const sp = event.subProgress;
      this._body.createEl('div', {
        attr: {
          style:
            'margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)',
        },
        text: `进度 ${sp.current}/${sp.total}${sp.label ? '（' + sp.label + '）' : ''}`,
      });
    }
  }

  /** 安全关闭：幂等，不会抛异常 */
  safeClose() {
    if (this._closed) return;
    this._closed = true;
    try {
      this.contentEl.empty();
      this.close();
      if (this.containerEl?.parentNode) {
        this.containerEl.parentNode.removeChild(this.containerEl);
      }
    } catch {
      /* 忽略 */
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── 向量索引进度弹窗 ───

export class IndexProgressModal extends Modal {
  private _title!: HTMLElement;
  private _body!: HTMLElement;
  private _closed = false;

  constructor(app: App) {
    super(app);
  }

  get isClosed(): boolean {
    return this._closed;
  }

  onOpen() {
    this.containerEl.style.zIndex = '1000';
    this.modalEl.style.minWidth = '280px';
    this.modalEl.style.maxWidth = '420px';

    this._title = this.contentEl.createEl('div', {
      attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:8px' },
      text: '正在构建向量索引...',
    });
    this._body = this.contentEl.createEl('div', {
      attr: { style: 'font-size:12px;color:var(--text-muted);line-height:1.6' },
    });
  }

  update(processed: number, total: number, fromCache: number, fetched: number) {
    if (this._closed) return;
    this._title.setText(`向量索引构建中 ${processed}/${total}`);
    this._body.empty();
    this._body.createEl('div', { text: `命中缓存：${fromCache} 个` });
    this._body.createEl('div', { text: `正在处理：${fetched} 个（API 调用中）` });
    if (processed === total) {
      this._body.createEl('div', {
        text: `全部完成！`,
        attr: { style: 'color:var(--text-success);margin-top:6px' },
      });
    }
  }

  safeClose() {
    if (this._closed) return;
    this._closed = true;
    try {
      this.contentEl.empty();
      this.close();
      if (this.containerEl?.parentNode) {
        this.containerEl.parentNode.removeChild(this.containerEl);
      }
    } catch {
      /* 忽略 */
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
