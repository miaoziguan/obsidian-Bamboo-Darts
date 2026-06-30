/**
 * InputTab — 输入面板
 *
 * 渲染输入界面，支持：
 * - 文本/URL 子模式切换
 * - 文本输入（textarea + 拖拽文件 + 剪贴板读取）
 * - URL 输入（输入框 + 剪贴板粘贴）
 * - 进度 UI 显示
 * - 提炼按钮及取消按钮
 */

import { AtomicNotesPlugin } from '../../main';
import { stripImageNoise } from '../../utils/clipboard';
import { ProgressCallback, ProgressEvent } from '../../extraction/progress';
import { Notice } from 'obsidian';

/** 输入面板元素引用（跨方法共享） */
interface InputElements {
  textarea: HTMLTextAreaElement;
  urlInput: HTMLInputElement;
  charCountEl: HTMLElement;
}

export class InputTab {
  private plugin: AtomicNotesPlugin;

  /** 输入面板元素引用 */
  private _inputElements: InputElements | null = null;

  /** 当前子模式 */
  private _inputSubMode: 'text' | 'url' = 'text';

  /** 进度 UI 元素引用 */
  private _progressWrap: HTMLElement | null = null;
  private _progressTitle: HTMLElement | null = null;
  private _progressBody: HTMLElement | null = null;

  /** 进度隐藏定时器 */
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;

  /** 拖拽事件引用（用于 destroy 时清理） */
  private _textarea: HTMLTextAreaElement | null = null;
  private _dropHandlers: Array<{ type: string; handler: EventListener }> = [];

  constructor(plugin: AtomicNotesPlugin) {
    this.plugin = plugin;
  }

  /**
   * 渲染输入面板（含进度区域和提炼按钮）
   * @param panel - 输入面板容器
   * @param progressWrap - 进度显示容器（由 onOpen 创建）
   * @param buttonWrap - 按钮容器（由 onOpen 创建）
   */
  render(panel: HTMLElement, progressWrap: HTMLElement, buttonWrap: HTMLElement): void {
    panel.empty();
    this._inputSubMode = 'url';

    // ── URL / 文本 子切换 ──

    const subToggleBar = panel.createEl('div', {
      attr: { style: 'display:flex;gap:12px;margin-bottom:10px;padding:4px 0' },
    });
    const urlModeBtn = subToggleBar.createEl('span', {
      text: 'URL',
      attr: {
        style:
          'font-size:12px;font-weight:600;color:var(--text-accent);cursor:pointer;padding:2px 0;border-bottom:2px solid var(--text-accent)',
      },
    });
    const textModeBtn = subToggleBar.createEl('span', {
      text: '文本',
      attr: {
        style:
          'font-size:12px;color:var(--text-muted);cursor:pointer;padding:2px 0;border-bottom:2px solid transparent',
      },
    });

    // ── textarea（文本模式）──

    const textarea = panel.createEl('textarea', {
      cls: 'atomic-notes-textarea',
      attr: { placeholder: '在此粘贴要提炼的文本（或拖入 .md / .txt 文件）...' },
    });
    this._textarea = textarea;

    // 拖拽导入支持
    const onDragOver = (ev: DragEvent) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      textarea.addClass('atomic-notes-drop-active');
    };
    const onDragLeave = () => {
      textarea.removeClass('atomic-notes-drop-active');
    };
    textarea.addEventListener('dragover', onDragOver);
    textarea.addEventListener('dragleave', onDragLeave);
    const onDrop = async (ev: DragEvent) => {
      ev.preventDefault();
      textarea.removeClass('atomic-notes-drop-active');
      const files = ev.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith('.md') && !name.endsWith('.txt')) {
        new Notice('仅支持 .md 和 .txt 文件');
        return;
      }
      try {
        const text = await file.text();
        textarea.value = text;
        charCountEl.setText(`${text.length} 字`);
        new Notice(`已导入 ${file.name}（${text.length} 字）`);
      } catch (e) {
        console.error(`[Bamboo Darts] 文件读取失败: ${file.name}`, e);
        new Notice(`读取文件失败：${file.name}`);
      }
    };
    textarea.addEventListener('drop', onDrop);
    this._dropHandlers = [
      { type: 'dragover', handler: onDragOver as EventListener },
      { type: 'dragleave', handler: onDragLeave as EventListener },
      { type: 'drop', handler: onDrop as EventListener },
    ];

    // ── 底部信息栏（文本模式）──

    const pasteMeta = panel.createEl('div', { cls: 'atomic-notes-meta-row' });
    const charCountEl = pasteMeta.createEl('span', {
      cls: 'atomic-notes-char-count',
      text: '0 字',
    });
    const pasteActions = pasteMeta.createEl('div', {
      attr: { style: 'display:flex;gap:8px;align-items:center' },
    });
    const readClipBtn = pasteActions.createEl('a', {
      cls: 'atomic-notes-clip-btn',
      text: '读取剪贴板',
      attr: { href: '#' },
    });
    const clearPasteLink = pasteActions.createEl('a', {
      cls: 'atomic-notes-clear-link',
      text: '清空',
      attr: { href: '#' },
    });

    // ── URL 输入框（URL 模式，初始隐藏）──

    const urlInput = panel.createEl('input', {
      cls: 'atomic-notes-url-input',
      attr: { type: 'text', placeholder: 'https://...' },
    });
    urlInput.style.display = 'none';

    const urlMeta = panel.createEl('div', { cls: 'atomic-notes-meta-row' });
    urlMeta.style.display = 'none';
    const urlMetaActions = urlMeta.createEl('div', {
      attr: { style: 'display:flex;gap:8px;align-items:center' },
    });
    const pasteUrlBtn = urlMetaActions.createEl('a', {
      cls: 'atomic-notes-clip-btn',
      text: '粘贴剪贴板URL',
      attr: { href: '#' },
    });
    urlMetaActions.createEl('a', {
      cls: 'atomic-notes-clear-link',
      text: '清除',
      attr: { href: '#' },
    });

    // 保存引用供提炼按钮使用
    this._inputElements = { textarea, urlInput, charCountEl };

    // ── 子模式切换 ──

    const setInputSubMode = (mode: 'text' | 'url') => {
      this._inputSubMode = mode;
      const isText = mode === 'text';
      textarea.style.display = isText ? '' : 'none';
      pasteMeta.style.display = isText ? '' : 'none';
      urlInput.style.display = isText ? 'none' : '';
      urlMeta.style.display = isText ? 'none' : '';
      textModeBtn.style.color = isText ? 'var(--text-accent)' : 'var(--text-muted)';
      textModeBtn.style.borderBottomColor = isText ? 'var(--text-accent)' : 'transparent';
      urlModeBtn.style.color = isText ? 'var(--text-muted)' : 'var(--text-accent)';
      urlModeBtn.style.borderBottomColor = isText ? 'transparent' : 'var(--text-accent)';
    };

    textModeBtn.addEventListener('click', () => setInputSubMode('text'));
    urlModeBtn.addEventListener('click', () => setInputSubMode('url'));

    // 默认显示 URL 模式
    setInputSubMode('url');

    textarea.addEventListener('input', () => {
      charCountEl.setText(`${textarea.value.length} 字`);
    });

    readClipBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!navigator.clipboard?.readText) {
        new Notice('当前环境不支持直接读取剪贴板，请手动粘贴文本');
        return;
      }
      try {
        const rawText = await navigator.clipboard.readText();
        if (rawText && rawText.trim()) {
          const text = stripImageNoise(rawText);
          textarea.value = text;
          charCountEl.setText(`${text.length} 字`);
          const removed = rawText.length - text.length;
          const suffix = removed > 0 ? `（已过滤 ${removed} 字图片噪音）` : '';
          new Notice(`已读取 ${text.length} 字${suffix}`);
        } else {
          new Notice('剪贴板为空');
        }
      } catch (e) {
        console.error('[Bamboo Darts] 剪贴板读取失败', e);
        new Notice('无法读取剪贴板，请检查权限');
      }
    });

    clearPasteLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      textarea.value = '';
      charCountEl.setText('0 字');
    });

    // 粘贴剪贴板 URL
    pasteUrlBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!navigator.clipboard?.readText) {
        new Notice('当前环境不支持直接读取剪贴板，请手动粘贴文本');
        return;
      }
      try {
        const rawText = await navigator.clipboard.readText();
        if (rawText && rawText.trim()) {
          urlInput.value = rawText.trim();
          new Notice('已粘贴剪贴板内容');
        } else {
          new Notice('剪贴板为空');
        }
      } catch (e) {
        console.error('[Bamboo Darts] 剪贴板读取失败', e);
        new Notice('无法读取剪贴板，请检查权限');
      }
    });

    // 清除 URL
    const clearUrlLink = urlMetaActions.querySelector(
      '.atomic-notes-clear-link',
    ) as HTMLAnchorElement;
    clearUrlLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      urlInput.value = '';
    });

    // ── 进度 UI ──

    this.setupProgressUI(progressWrap);

    // ── 提炼按钮 ──

    this.setupExtractButton(buttonWrap);
  }

  // ─── 进度 UI 设置 ───

  private setupProgressUI(wrap: HTMLElement): void {
    wrap.empty();
    this._progressWrap = wrap;
    this._progressTitle = wrap.createEl('div', {
      attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:6px;' },
      text: '准备提炼...',
    });
    this._progressBody = wrap.createEl('div', {
      attr: {
        style:
          'font-size:12px;color:var(--text-muted);line-height:1.8;max-height:240px;overflow-y:auto;',
      },
    });
  }

  // ─── 提炼按钮设置 ───

  private setupExtractButton(wrap: HTMLElement): void {
    wrap.empty();
    wrap.style.display = '';

    const extractBtn = wrap.createEl('button', { text: '开始提炼', cls: 'mod-cta' });
    const cancelBtn = wrap.createEl('button', { text: '取消', cls: 'mod-warning' });
    cancelBtn.style.display = 'none';
    cancelBtn.style.marginLeft = '8px';
    cancelBtn.addEventListener('click', () => {
      this.plugin.cancelExtraction();
    });

    extractBtn.addEventListener('click', async () => {
      if (this.plugin._isExtracting) return;

      const elements = this._inputElements;
      if (!elements) return;

      let inputContent: string;
      let inputData: { type: 'url' | 'text' | 'selection'; content: string };

      if (this._inputSubMode === 'url') {
        inputContent = elements.urlInput.value;
        if (!inputContent || !inputContent.trim()) {
          new Notice('请输入有效的 URL');
          return;
        }
        // URL 格式校验
        const url = inputContent.trim();
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            new Notice('URL 必须以 http:// 或 https:// 开头');
            return;
          }
        } catch (e) {
          console.error('[Bamboo Darts] URL 格式校验失败', e);
          new Notice('URL 格式不正确，请检查');
          return;
        }
        inputData = { type: 'url', content: url };
      } else {
        inputContent = elements.textarea.value;
        if (!inputContent || !inputContent.trim()) {
          new Notice('请粘贴文本或使用「读取剪贴板」');
          return;
        }
        inputData = { type: 'text', content: inputContent };
      }

      // 清除旧的进度隐藏定时器（防止再次提炼时被意外隐藏）
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }

      // 重置进度显示区域
      if (this._progressWrap) this._progressWrap.style.display = '';
      if (this._progressTitle) this._progressTitle.setText('正在提炼原子笔记...');
      if (this._progressBody) this._progressBody.empty();

      extractBtn.setText('提炼中...');
      extractBtn.disabled = true;
      cancelBtn.style.display = '';

      // Panel 内进度回调
      const panelOnProgress: ProgressCallback = (
        event: ProgressEvent,
        allEvents: ProgressEvent[],
        totalMs: number,
      ) => {
        if (this._progressTitle) {
          this._progressTitle.setText(
            `${event.phase}：${event.name} — 已用时 ${(totalMs / 1000).toFixed(1)}s`,
          );
        }
        if (!this._progressBody) return;
        this._progressBody.empty();
        for (const ev of allEvents) {
          const icon =
            ev.status === 'running'
              ? '⟳ '
              : ev.status === 'success'
                ? '✓ '
                : ev.status === 'failed'
                  ? '✗ '
                  : '− ';
          const line = this._progressBody.createEl('div', {
            text: `${icon}${ev.phase} ${ev.name}${ev.detail ? ' — ' + ev.detail : ''}`,
          });
          if (ev.status === 'running') line.style.color = 'var(--text-accent)';
          if (ev.status === 'success') line.style.color = 'var(--text-success)';
          if (ev.status === 'failed') line.style.color = 'var(--text-error)';
        }
        if (event.subProgress) {
          const sp = event.subProgress;
          const labelText = sp.label ? '（' + sp.label + '）' : '';
          this._progressBody.createEl('div', {
            attr: {
              style:
                'margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)',
            },
            text: '进度 ' + sp.current + '/' + sp.total + labelText,
          });
        }
      };

      try {
        await this.plugin.runExtraction(inputData, { onProgress: panelOnProgress });
        // 仅提炼成功才清空输入（失败时保留内容，方便用户重试）
        if (this._inputSubMode === 'text') {
          elements.textarea.value = '';
          elements.charCountEl.setText('0 字');
        } else {
          elements.urlInput.value = '';
        }
      } finally {
        extractBtn.setText('开始提炼');
        extractBtn.disabled = false;
        cancelBtn.style.display = 'none';

        // 5 秒后隐藏进度区域
        this._hideTimer = setTimeout(() => {
          if (this._progressWrap) this._progressWrap.style.display = 'none';
          if (this._progressBody) this._progressBody.empty();
          this._hideTimer = null;
        }, 5000);
      }
    });
  }

  /** 清理资源（面板关闭时调用） */
  destroy(): void {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    // 清理拖拽事件监听器（防止多次渲染累积）
    if (this._textarea) {
      for (const { type, handler } of this._dropHandlers) {
        this._textarea.removeEventListener(type, handler);
      }
      this._dropHandlers = [];
      this._textarea = null;
    }
  }
}
