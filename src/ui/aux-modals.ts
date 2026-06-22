/**
 * 辅助模态框：门控失败确认、重复提炼确认、错误弹窗
 *
 * 原本是 main.ts 中的内联匿名类，提取至此以精简主入口。
 */

import { Modal, App } from 'obsidian';
import type AtomicNotesPlugin from '../main';
import type { ProgressCallback } from '../extraction/progress';

// ─── 共享样式 ───

const MSG_BOX = [
  'background:var(--background-secondary)',
  'border-left:3px solid var(--color-orange)',
  'border-radius:6px',
  'padding:8px 12px',
  'margin:10px 0',
  'font-size:13px',
  'color:var(--text-muted)',
].join(';');

const BTN_ROW = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px';
const BTN_PRIMARY =
  'background:var(--interactive-accent);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600';

// ─── 门控失败 → 强制提炼确认 ───

export class ForceExtractModal extends Modal {
  private plugin: AtomicNotesPlugin;
  private error: string;
  private input: { type: 'url' | 'text' | 'selection'; content: string };

  constructor(
    app: App,
    plugin: AtomicNotesPlugin,
    input: { type: 'url' | 'text' | 'selection'; content: string },
    error: string,
  ) {
    super(app);
    this.plugin = plugin;
    this.input = input;
    this.error = error;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: '⚠️ 内容质量门控未通过' });
    contentEl.createEl('div', { attr: { style: MSG_BOX }, text: this.error });
    contentEl.createEl('p', {
      text: '强制提炼将跳过质量检查，直接发送给 AI。低质内容可能导致提炼结果较差。',
      attr: { style: 'font-size:13px;color:var(--text-muted);margin:8px 0' },
    });
    contentEl.createEl('p', {
      text: '提示：可以选取更长的段落，或在设置中手动指定内容策略',
      attr: { style: 'font-size:12px;color:var(--text-faint);margin:4px 0 8px' },
    });
    const btnRow = contentEl.createEl('div', { attr: { style: BTN_ROW } });
    btnRow.createEl('button', { text: '放弃' }).addEventListener('click', () => this.close());
    const forceBtn = btnRow.createEl('button', {
      text: '强制提炼',
      attr: {
        style:
          'background:var(--color-orange);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600',
      },
    });
    forceBtn.addEventListener('click', async () => {
      this.close();
      await this.plugin.runExtraction(this.input, { skipGate: true });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── 重复提炼确认 ───

export class DuplicateConfirmModal extends Modal {
  private plugin: AtomicNotesPlugin;
  private input: { type: 'url' | 'text' | 'selection'; content: string };
  private previous: { extractedAt: string; noteCount: number; savedPaths?: string[] };
  private opts: { onProgress?: ProgressCallback; skipGate?: boolean };

  constructor(
    app: App,
    plugin: AtomicNotesPlugin,
    input: { type: 'url' | 'text' | 'selection'; content: string },
    previous: { extractedAt: string; noteCount: number; savedPaths?: string[] },
    opts: { onProgress?: ProgressCallback; skipGate?: boolean },
  ) {
    super(app);
    this.plugin = plugin;
    this.input = input;
    this.previous = previous;
    this.opts = opts;
  }

  onOpen() {
    const { contentEl } = this;
    const daysAgo = Math.floor(
      (Date.now() - new Date(this.previous.extractedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const timeStr = daysAgo === 0 ? '今天' : `${daysAgo}天前`;

    contentEl.empty();
    contentEl.createEl('h3', { text: '⚠️ 此内容已提炼过' });
    contentEl.createEl('div', {
      attr: { style: MSG_BOX },
      text: `此内容已在${timeStr}提炼过，共 ${this.previous.noteCount} 条笔记。`,
    });
    const btnRow = contentEl.createEl('div', { attr: { style: BTN_ROW } });
    btnRow.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());

    if (this.previous.savedPaths && this.previous.savedPaths.length > 0) {
      btnRow.createEl('button', { text: '查看上次结果' }).addEventListener('click', () => {
        this.close();
        this.plugin.app.workspace.openLinkText(this.previous.savedPaths![0], '', false);
      });
    }

    const reExtractBtn = btnRow.createEl('button', {
      text: '重新提炼',
      attr: { style: BTN_PRIMARY },
    });
    reExtractBtn.addEventListener('click', async () => {
      this.close();
      await this.plugin.runExtraction(this.input, { ...this.opts, skipDuplicateCheck: true });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── 提炼失败 → 错误弹窗（可选重试） ───

export class ErrorModal extends Modal {
  private plugin: AtomicNotesPlugin;
  private input: { type: 'url' | 'text' | 'selection'; content: string };
  private errorMsg: string;
  private opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean };
  private retryable: boolean;

  constructor(
    app: App,
    plugin: AtomicNotesPlugin,
    input: { type: 'url' | 'text' | 'selection'; content: string },
    errorMsg: string,
    opts: { onProgress?: ProgressCallback; skipGate?: boolean; skipDuplicateCheck?: boolean },
    retryable: boolean,
  ) {
    super(app);
    this.plugin = plugin;
    this.input = input;
    this.errorMsg = errorMsg;
    this.opts = opts;
    this.retryable = retryable;
  }

  onOpen() {
    const ERROR_BOX = [
      'background:var(--background-secondary)',
      'border-left:3px solid var(--color-red)',
      'border-radius:6px',
      'padding:8px 12px',
      'margin:10px 0',
      'font-size:13px',
      'color:var(--text-muted)',
      'word-break:break-word',
    ].join(';');

    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: '✗ 提炼失败' });
    contentEl.createEl('div', { attr: { style: ERROR_BOX }, text: this.errorMsg });
    const btnRow = contentEl.createEl('div', { attr: { style: BTN_ROW } });
    btnRow.createEl('button', { text: '关闭' }).addEventListener('click', () => this.close());
    if (this.retryable) {
      const retryBtn = btnRow.createEl('button', { text: '重试', attr: { style: BTN_PRIMARY } });
      retryBtn.addEventListener('click', async () => {
        this.close();
        await this.plugin.runExtraction(this.input, {
          skipDuplicateCheck: true,
          skipGate: this.opts.skipGate,
        });
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
