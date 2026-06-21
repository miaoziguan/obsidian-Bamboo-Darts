/**
 * 原子笔记提炼面板 - ItemView 侧边栏
 * 4 个 Tab：输入 / 历史 / 发现 / 介绍
 *
 * onOpen 只做容器初始化和 Tab 注册，
 * 各面板渲染逻辑拆分至独立私有方法。
 */

import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  Modal,
} from 'obsidian';
import AtomicNotesPlugin from '../main';
import { buildSimilarityMatrix, NoteMeta } from '../discovery/similarity-matrix';
import { ExtractionHistoryEntry } from '../services/history-service';
import { stripImageNoise } from '../utils/clipboard';
import { ProgressCallback, ProgressEvent } from '../extraction/progress';

export const VIEW_TYPE_ATOMIC_PANEL = 'atomic-notes-panel';

/** 输入面板元素引用（跨方法共享） */
interface InputElements {
  textarea: HTMLTextAreaElement;
  urlInput: HTMLInputElement;
  charCountEl: HTMLElement;
}

export class AtomicNotesPanel extends ItemView {
  private plugin: AtomicNotesPlugin;
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;

  /** 进度 UI 元素引用 */
  private _progressWrap: HTMLElement | null = null;
  private _progressTitle: HTMLElement | null = null;
  private _progressBody: HTMLElement | null = null;

  /** 输入面板状态 */
  private _inputElements: InputElements | null = null;
  private _inputSubMode: 'text' | 'url' = 'text';

  /** 发现面板相似度矩阵缓存 */
  private _simCache: { folder: string; noteCount: number; notes: NoteMeta[]; matrix: number[][] } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AtomicNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ATOMIC_PANEL;
  }

  getDisplayText(): string {
    return '原子笔记提炼';
  }

  getIcon(): string {
    return 'atom';
  }

  // ─── 主入口：只做容器初始化和 Tab 注册 ───

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('atomic-notes-panel');

    container.createEl('h3', { text: '原子笔记提炼' });

    // Tab bar
    const tabBar = container.createEl('div', { cls: 'atomic-notes-tabs', attr: { role: 'tablist', 'aria-label': '功能导航' } });
    const tabLabels = ['输入', '历史', '发现', '介绍'];
    const tabs: HTMLElement[] = [];
    for (let i = 0; i < tabLabels.length; i++) {
      const tab = tabBar.createEl('div', {
        text: tabLabels[i],
        cls: 'atomic-notes-tab' + (i === 0 ? ' active' : ''),
        attr: {
          role: 'tab',
          tabindex: i === 0 ? '0' : '-1',
          'aria-selected': i === 0 ? 'true' : 'false',
          'aria-controls': `tab-panel-${i}`,
        },
      });
      tabs.push(tab);
    }

    // Tab content containers
    const inputPanel = container.createEl('div', { cls: 'atomic-notes-tab-content active', attr: { role: 'tabpanel', id: 'tab-panel-0', 'aria-labelledby': tabs[0].id || 'tab-0' } });
    const historyPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto', role: 'tabpanel', id: 'tab-panel-1', 'aria-labelledby': tabs[1].id || 'tab-1' } });
    const discoveryPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto', role: 'tabpanel', id: 'tab-panel-2', 'aria-labelledby': tabs[2].id || 'tab-2' } });
    const aboutPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto', role: 'tabpanel', id: 'tab-panel-3', 'aria-labelledby': tabs[3].id || 'tab-3' } });
    const contentPanels = [inputPanel, historyPanel, discoveryPanel, aboutPanel];

    // 进度区域 + 提炼按钮（初始隐藏，在 setupXxx 中创建）
    const progressWrap = container.createEl('div', {
      cls: 'atomic-notes-progress-wrap',
      attr: { style: 'margin:8px 0;padding:8px 12px;border:1px solid var(--background-modifier-border);border-radius:6px;display:none;' },
    });
    this._progressWrap = progressWrap;

    const buttonWrap = container.createEl('div', { cls: 'atomic-notes-btn-wrap' });

    // Tab 切换逻辑
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', () => {
        for (let j = 0; j < tabs.length; j++) {
          tabs[j].classList.toggle('active', j === i);
          tabs[j].setAttribute('aria-selected', j === i ? 'true' : 'false');
          contentPanels[j].classList.toggle('active', j === i);
        }
        // 进度区域和按钮只在输入面板显示
        progressWrap.style.display = (i > 0) ? 'none' : progressWrap.style.display;
        buttonWrap.style.display = (i > 0) ? 'none' : '';
        // 延迟渲染（首次激活时填充内容）
        if (i === 1) this.renderHistoryPanel(historyPanel);
        else if (i === 2) this.renderDiscovery(discoveryPanel);
        else if (i === 3) this.renderAboutPanel(aboutPanel);
      });
    }

    // 渲染各面板
    this.renderInputPanel(inputPanel);
    this.setupProgressUI(progressWrap);
    this.setupExtractButton(buttonWrap);
  }

  // ─── 输入面板 ───

  private renderInputPanel(panel: HTMLElement): void {
    this._inputSubMode = 'text';

    // 文本 / URL 子切换
    const subToggleBar = panel.createEl('div', {
      attr: { style: 'display:flex;gap:12px;margin-bottom:10px;padding:4px 0' },
    });
    const textModeBtn = subToggleBar.createEl('span', {
      text: '文本',
      attr: { style: 'font-size:12px;font-weight:600;color:var(--text-accent);cursor:pointer;padding:2px 0;border-bottom:2px solid var(--text-accent)' },
    });
    const urlModeBtn = subToggleBar.createEl('span', {
      text: 'URL',
      attr: { style: 'font-size:12px;color:var(--text-muted);cursor:pointer;padding:2px 0;border-bottom:2px solid transparent' },
    });

    // textarea（文本模式）
    const textarea = panel.createEl('textarea', {
      cls: 'atomic-notes-textarea',
      attr: { placeholder: '在此粘贴要提炼的文本（或拖入 .md / .txt 文件）...' },
    });

    // 拖拽导入支持
    textarea.addEventListener('dragover', (ev: DragEvent) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      textarea.addClass('atomic-notes-drop-active');
    });
    textarea.addEventListener('dragleave', () => {
      textarea.removeClass('atomic-notes-drop-active');
    });
    textarea.addEventListener('drop', async (ev: DragEvent) => {
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
      } catch {
        new Notice(`读取文件失败：${file.name}`);
      }
    });

    // 底部信息栏（文本模式）
    const pasteMeta = panel.createEl('div', { cls: 'atomic-notes-meta-row' });
    const charCountEl = pasteMeta.createEl('span', { cls: 'atomic-notes-char-count', text: '0 字' });
    const pasteActions = pasteMeta.createEl('div', { attr: { style: 'display:flex;gap:8px;align-items:center' } });
    const readClipBtn = pasteActions.createEl('a', {
      cls: 'atomic-notes-clip-btn', text: '读取剪贴板', attr: { href: '#' },
    });
    const clearPasteLink = pasteActions.createEl('a', {
      cls: 'atomic-notes-clear-link', text: '清空', attr: { href: '#' },
    });

    // URL 输入框（URL模式，初始隐藏）
    const urlInput = panel.createEl('input', {
      cls: 'atomic-notes-url-input',
      attr: { type: 'text', placeholder: 'https://...' },
    });
    urlInput.style.display = 'none';

    const urlMeta = panel.createEl('div', { cls: 'atomic-notes-meta-row' });
    urlMeta.style.display = 'none';
    const urlMetaActions = urlMeta.createEl('div', { attr: { style: 'display:flex;gap:8px;align-items:center' } });
    const pasteUrlBtn = urlMetaActions.createEl('a', {
      cls: 'atomic-notes-clip-btn', text: '粘贴剪贴板URL', attr: { href: '#' },
    });
    urlMetaActions.createEl('a', {
      cls: 'atomic-notes-clear-link', text: '清除', attr: { href: '#' },
    });

    // 保存引用供提炼按钮使用
    this._inputElements = { textarea, urlInput, charCountEl };

    // 子模式切换
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

    textarea.addEventListener('input', () => {
      charCountEl.setText(`${textarea.value.length} 字`);
    });

    readClipBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
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
      } catch {
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
      try {
        const rawText = await navigator.clipboard.readText();
        if (rawText && rawText.trim()) {
          urlInput.value = rawText.trim();
          new Notice('已粘贴剪贴板内容');
        } else {
          new Notice('剪贴板为空');
        }
      } catch {
        new Notice('无法读取剪贴板，请检查权限');
      }
    });

    // 清除 URL
    const clearUrlLink = urlMetaActions.querySelector('.atomic-notes-clear-link') as HTMLAnchorElement;
    clearUrlLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      urlInput.value = '';
    });
  }

  // ─── 历史面板 ───

  private renderHistoryPanel(el: HTMLElement): void {
    el.empty();
    const history: ExtractionHistoryEntry[] = this.plugin.settings.extractionHistory || [];

    if (history.length === 0) {
      el.createEl('div', { cls: 'atomic-notes-empty-state' });
      const emptyEl = el.getElementsByClassName('atomic-notes-empty-state')[el.getElementsByClassName('atomic-notes-empty-state').length - 1];
      emptyEl.createEl('span', { text: '📝', cls: 'empty-icon' });
      emptyEl.createEl('div', { text: '暂无提炼历史' });
      return;
    }

    // 顶部操作栏
    const toolbar = el.createEl('div', {
      attr: { style: 'display:flex;justify-content:space-between;align-items:center;padding:4px 8px 8px' },
    });
    toolbar.createEl('span', {
      text: `${history.length} 条记录`,
      attr: { style: 'font-size:11px;color:var(--text-muted)' },
    });
    const clearBtn = toolbar.createEl('button', {
      text: '清空全部',
      attr: { style: 'padding:2px 10px;font-size:11px;cursor:pointer;background:var(--background-modifier-error);color:var(--text-on-accent);border:none;border-radius:4px' },
    });
    clearBtn.addEventListener('click', async () => {
      // 二次确认
      const confirmModal = new (class extends Modal {
        parent: AtomicNotesPanel;
        targetEl: HTMLElement;
        constructor(app: any, parent: AtomicNotesPanel, targetEl: HTMLElement) { super(app); this.parent = parent; this.targetEl = targetEl; }
        onOpen() {
          this.contentEl.empty();
          this.contentEl.createEl('h3', { text: '确认清空全部历史记录？' });
          this.contentEl.createEl('p', {
            text: `这将删除全部 ${history.length} 条提炼历史，已保存的笔记不会受影响。`,
            attr: { style: 'font-size:13px;color:var(--text-muted);margin:8px 0' },
          });
          const btnRow = this.contentEl.createEl('div', { attr: { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' } });
          btnRow.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
          const confirmBtn = btnRow.createEl('button', {
            text: '确认清空',
            attr: { style: 'background:var(--background-modifier-error);color:var(--text-on-accent);border:none;padding:6px 16px;border-radius:6px;cursor:pointer' },
          });
          confirmBtn.addEventListener('click', async () => {
            this.parent.plugin.settings.extractionHistory = [];
            await this.parent.plugin.saveSettings();
            new Notice('历史记录已清空');
            this.close();
            this.parent.renderHistoryPanel(this.targetEl);
          });
        }
        onClose() { this.contentEl.empty(); }
      })(this.app, this, el);
      confirmModal.open();
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
        attr: { style: 'font-size:16px;color:var(--text-muted);cursor:pointer;padding:0 4px;line-height:1' },
      });
      let delConfirming = false;
      delBtn.addEventListener('click', async () => {
        if (!delConfirming) {
          delConfirming = true;
          delBtn.setText('确认?');
          delBtn.style.color = 'var(--color-red)';
          // 3 秒后自动恢复
          setTimeout(() => {
            if (delConfirming) {
              delConfirming = false;
              delBtn.setText('\u00D7');
              delBtn.style.color = 'var(--text-muted)';
            }
          }, 3000);
          return;
        }
        this.plugin.settings.extractionHistory!.splice(idx, 1);
        await this.plugin.saveSettings();
        this.renderHistoryPanel(el);
      });

      itemEl.createEl('div', {
        text: `${entry.sourceType === 'url' ? '[URL]' : '[文本]'}  ${entry.noteCount}条笔记`,
        attr: { style: 'font-size:11px;color:var(--text-muted);margin-top:2px' },
      });

      if (entry.savedPaths && entry.savedPaths.length > 0) {
        for (const savedPath of entry.savedPaths) {
          const linkEl = itemEl.createEl('a', {
            text: savedPath.split('/').pop(),
            attr: { href: '#', style: 'font-size:11px;color:var(--text-accent);display:block;margin-left:8px' },
          });
          linkEl.addEventListener('click', (ev) => {
            ev.preventDefault();
            this.app.workspace.openLinkText(savedPath, '', false);
          });
        }
      }
    }

    if (total > 20) {
      const loadMoreBtn = listEl.createEl('button', {
        text: `加载更多 (${total - 20}条)`,
        attr: { style: 'margin:8px auto;display:block;padding:4px 16px;font-size:12px;cursor:pointer' },
      });
      loadMoreBtn.addEventListener('click', () => {
        for (let i = total - 21; i >= 0; i--) {
          (listEl.children[i] as HTMLElement).style.display = '';
        }
        loadMoreBtn.remove();
      });
    }
  }

  // ─── About 面板 ───

  private renderAboutPanel(el: HTMLElement): void {
    el.empty();
    el.addClass('atomic-notes-panel');

    // ── 竹叶飞刃设计理念 ──
    el.createEl('div', { text: '竹叶飞刃设计理念', cls: 'atomic-notes-about-section' });

    el.createEl('div', { text: '用法一：提炼知识节点', cls: 'atomic-notes-about-subtitle' });
    el.createEl('p', {
      text: '原子笔记是一段独立、完整、可直接复用的知识单元。每条笔记围绕单一概念，不依赖上下文即可理解。AI 提炼的价值不在于替代思考，而在于强制对信息进行压缩和结构化——把模糊的阅读感受转化为可检索、可关联的知识节点。',
      cls: 'atomic-notes-about-text',
    });

    el.createEl('div', { text: '用法二：对抗信息垃圾', cls: 'atomic-notes-about-subtitle' });
    el.createEl('p', {
      text: 'AI 时代的内容生产速度远超人类的阅读速度。大量文章看似洋洋洒洒，实则信息密度极低——翻来覆去讲同一句话、堆砌 SEO 关键词、填充无意义的过渡段落。',
      cls: 'atomic-notes-about-text',
    });
    el.createEl('p', {
      text: '本插件的质量门控和复查机制正是为此设计：前置过滤噪声内容，AI 提炼后二次评分，帮你把时间花在真正值得读的信息上，而不是被注水文章消耗注意力。',
      cls: 'atomic-notes-about-text',
    });

    // ── 处理流程 ──
    el.createEl('div', { text: '处理流程', cls: 'atomic-notes-about-section' });
    const phases = [
      ['Phase 1', '读取内容', '从文本、URL 或剪贴板获取原始内容'],
      ['Phase 2', '质量门控', '9 层规则前置过滤低质/噪声内容，硬拦+软警告'],
      ['Phase 3', 'AI 提炼', '调用 DeepSeek 将内容拆解为原子笔记'],
      ['Phase 4', '同批去重', 'TF-IDF + 余弦相似度，检测同批次高度相似笔记'],
      ['Phase 4b', '知识库去重', '与目标文件夹已有笔记比对，严格不跨目录读取'],
      ['Phase 5', '内容核查', '三层管线：原文溯源 → 语义比对 → 超源标记'],
      ['Phase 6', '笔记复查', 'AI 二次评分，过滤低价值笔记'],
    ];
    for (const [phase, name, desc] of phases) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-phase-row' });
      row.createEl('span', { text: phase, cls: 'phase-tag' });
      row.createEl('span', { text: name, cls: 'phase-name' });
      row.createEl('span', { text: desc, cls: 'phase-desc' });
    }

    // ── 去重算法 ──
    el.createEl('div', { text: '去重算法', cls: 'atomic-notes-about-section' });
    el.createEl('p', { text: 'Phase 4 与 Phase 4b 采用 TF-IDF + 余弦相似度算法：', cls: 'atomic-notes-about-text' });
    el.createEl('div', { text: '• 中文按字符 3-gram（英文按完整词）提取 token', cls: 'atomic-notes-about-bullet' });
    el.createEl('div', { text: '• 每篇文档转化为 TF-IDF 向量，两篇相似度通过向量余弦计算', cls: 'atomic-notes-about-bullet' });
    el.createEl('div', { text: '• 相比关键词匹配，对同义词、换说法、近义词更鲁棒', cls: 'atomic-notes-about-bullet' });
    el.createEl('p', {
      text: '知识库去重默认读取目标文件夹内容，可在设置中独立指定"去重目标文件夹"，适合有隐私需求用户限制去重范围。',
      cls: 'atomic-notes-about-text',
    });

    // ── 实时进度反馈 ──
    el.createEl('div', { text: '实时进度反馈', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '提炼过程中每一步都实时显示当前阶段名称、耗时、子进度，可随时点击"取消"终止流程。',
      cls: 'atomic-notes-about-text',
    });
    const progressItems = [
      ['Phase 1', '输入文本读取'],
      ['Phase 2', '质量门控判定'],
      ['Phase 3', 'AI 调用与笔记拆解'],
      ['Phase 4 / 4b', '去重计算'],
      ['Phase 5', '内容核查（三层管线）'],
      ['Phase 6', '复查评分'],
    ];
    for (const [phase, detail] of progressItems) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', { text: phase, cls: 'detail-label' });
      row.createEl('span', { text: detail, cls: 'detail-desc' });
    }

    // ── 质量门控 ──
    el.createEl('div', { text: '质量门控', cls: 'atomic-notes-about-section' });
    const gateRules = [
      ['长度', '< 50 字', '50-200 字 / > 50000 字'],
      ['信息密度', '< 10%（严重重复）', '< 30%（疑似水文）'],
      ['噪声占比', '> 70%（乱码残留）', '> 40%'],
      ['HTML 标签', '占比 > 60%', '占比 > 30%'],
      ['乱码残留', '非文字字符 > 70%', '非文字字符 > 50%'],
      ['链接堆砌', '导航分隔符 > 3 组', '1-2 组'],
      ['广告/低质', '≥ 3 个关键词', '1-2 个关键词'],
      ['质量评分', '≤ 1 分（垃圾）', '2 分（存疑）'],
      ['重复检测', '> 50% 相似度', '—'],
    ];
    const gateHeader = el.createEl('div', { cls: 'atomic-notes-gate-table-header' });
    gateHeader.createEl('span', { text: '规则', cls: 'gate-col-rule' });
    gateHeader.createEl('span', { text: '硬阻断', cls: 'gate-col-block' });
    gateHeader.createEl('span', { text: '软警告', cls: 'gate-col-warn' });
    for (const [rule, block, warn] of gateRules) {
      const row = el.createEl('div', { cls: 'atomic-notes-gate-row' });
      row.createEl('span', { text: rule, cls: 'gate-col-rule' });
      row.createEl('span', { text: block, cls: 'gate-col-block' });
      row.createEl('span', { text: warn, cls: 'gate-col-warn' });
    }
    el.createEl('p', {
      text: '硬阻断的规则命中后直接拒绝提交流程；软警告仅提醒用户，不影响继续提炼。',
      cls: 'atomic-notes-about-text',
    });
    el.getElementsByClassName('atomic-notes-about-text')[el.getElementsByClassName('atomic-notes-about-text').length - 1].setAttr('style', 'margin-top:8px');

    // ── 内容核查（三层管线）──
    el.createEl('div', { text: '内容核查（三层管线）', cls: 'atomic-notes-about-section' });
    el.createEl('p', { text: '从每条笔记中提取事实声明（数字、百分比、日期、实体名称），通过三层管线逐条核查：', cls: 'atomic-notes-about-text' });
    el.createEl('div', { text: 'Layer 1 · 原文溯源：零 API 调用，在原文中精确或模糊匹配声明锚点', cls: 'atomic-notes-about-bullet' });
    el.createEl('div', { text: 'Layer 2 · 语义比对：单次 AI 调用，对无法溯源的声明进行语义级别比对', cls: 'atomic-notes-about-bullet' });
    el.createEl('div', { text: 'Layer 3 · 超源标记：零 API 调用，将超出原文范围的声明标记为"超源"', cls: 'atomic-notes-about-bullet' });
    const verifyStatus = [
      ['已溯源', '声明与原文一致或可推导'],
      ['需对比', '部分相关但存在差异，需人工确认'],
      ['超源', '声明超出原文范围，无法直接验证'],
    ];
    for (const [status, desc] of verifyStatus) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', { text: status, cls: 'detail-label', attr: { style: 'min-width:56px;color:var(--text-accent)' } });
      row.createEl('span', { text: desc, cls: 'detail-desc' });
    }

    // ── 复查机制 ──
    el.createEl('div', { text: '复查机制', cls: 'atomic-notes-about-section' });
    el.createEl('p', { text: '开启后 AI 从两个维度对每条笔记打分（1-5 分）：', cls: 'atomic-notes-about-text' });
    const scoreItems = [
      ['洞察力分', '是否包含独立观点或独特视角'],
      ['知识价值分', '是否能为读者提供可迁移的领域知识'],
    ];
    for (const [label, desc] of scoreItems) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', { text: label, cls: 'detail-label' });
      row.createEl('span', { text: desc, cls: 'detail-desc' });
    }
    el.createEl('p', {
      text: '总分 < 3 的笔记被自动过滤，不进入知识库。这是提炼后的最后一道质量防线。',
      cls: 'atomic-notes-about-text',
    });
    el.getElementsByClassName('atomic-notes-about-text')[el.getElementsByClassName('atomic-notes-about-text').length - 1].setAttr('style', 'margin-top:6px');

    // ── 作者 ──
    el.createEl('hr', { cls: 'atomic-notes-about-divider' });
    el.createEl('div', { text: '作者', cls: 'atomic-notes-about-section' });
    el.createEl('div', { text: '羽鳞君', cls: 'atomic-notes-about-author' });
    el.createEl('p', { text: '喵字馆创始人 | 独立品牌设计师 | 赛博乐子人', cls: 'atomic-notes-about-text' });
    el.createEl('p', {
      text: '交流微信：yanhu94（备注：竹叶飞刃）',
      attr: { style: 'color:var(--text-faint);font-size:12px;margin:4px 0' },
    });
  }

  // ─── 进度 UI（存储 DOM 引用供提炼按钮使用） ───

  private setupProgressUI(wrap: HTMLElement): void {
    wrap.empty();
    this._progressTitle = wrap.createEl('div', {
      attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:6px;' },
      text: '准备提炼...',
    });
    this._progressBody = wrap.createEl('div', {
      attr: { style: 'font-size:12px;color:var(--text-muted);line-height:1.8;max-height:240px;overflow-y:auto;' },
    });
  }

  // ─── 提炼按钮 ───

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
        } catch {
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

      // 重置进度显示区域
      if (this._progressWrap) this._progressWrap.style.display = '';
      if (this._progressTitle) this._progressTitle.setText('正在提炼原子笔记...');
      if (this._progressBody) this._progressBody.empty();

      extractBtn.setText('提炼中...');
      extractBtn.disabled = true;
      cancelBtn.style.display = '';

      // Panel 内进度回调
      const panelOnProgress: ProgressCallback = (event: ProgressEvent, allEvents: ProgressEvent[], totalMs: number) => {
        if (this._progressTitle) {
          this._progressTitle.setText(`${event.phase}：${event.name} — 已用时 ${(totalMs / 1000).toFixed(1)}s`);
        }
        if (!this._progressBody) return;
        this._progressBody.empty();
        for (const ev of allEvents) {
          const icon = ev.status === 'running' ? '⟳ ' : (ev.status === 'success' ? '✓ ' : (ev.status === 'failed' ? '✗ ' : '− '));
          const line = this._progressBody.createEl('div', { text: `${icon}${ev.phase} ${ev.name}${ev.detail ? ' — ' + ev.detail : ''}` });
          if (ev.status === 'running') line.style.color = 'var(--text-accent)';
          if (ev.status === 'success') line.style.color = 'var(--text-success)';
          if (ev.status === 'failed') line.style.color = 'var(--text-error)';
        }
        if (event.subProgress) {
          const sp = event.subProgress;
          const labelText = sp.label ? '（' + sp.label + '）' : '';
          this._progressBody.createEl('div', {
            attr: { style: 'margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)' },
            text: '进度 ' + sp.current + '/' + sp.total + labelText,
          });
        }
      };

      try {
        await this.plugin.runExtraction(inputData, { onProgress: panelOnProgress });
      } finally {
        extractBtn.setText('开始提炼');
        extractBtn.disabled = false;
        cancelBtn.style.display = 'none';

        if (this._inputSubMode === 'text') {
          elements.textarea.value = '';
          elements.charCountEl.setText('0 字');
        } else {
          elements.urlInput.value = '';
        }

        // 2 秒后隐藏进度区域
        this._hideTimer = setTimeout(() => {
          if (this._progressWrap) this._progressWrap.style.display = 'none';
          if (this._progressBody) this._progressBody.empty();
          this._hideTimer = null;
        }, 5000);
      }
    });
  }

  // ─── Discovery Methods（已有，未改动） ───

  private renderDiscovery(container: HTMLElement): void {
    const settings = this.plugin.settings;
    container.empty();

    const placeholder = container.createEl('div', { cls: 'atomic-notes-empty-state' });
    placeholder.createEl('span', { text: '🔄', cls: 'empty-icon' });
    placeholder.createEl('div', { text: '正在分析知识库...' });

    if (!settings.discoveryRecommendation) {
      container.createEl('div', { cls: 'atomic-notes-empty-state' });
      const noDiscEl = container.getElementsByClassName('atomic-notes-empty-state')[container.getElementsByClassName('atomic-notes-empty-state').length - 1];
      noDiscEl.createEl('span', { text: '🔍', cls: 'empty-icon' });
      noDiscEl.createEl('div', { text: '请在设置中开启至少一个发现功能' });
      placeholder.remove();
      return;
    }

    const toolbar = container.createEl('div', { attr: { style: 'margin-bottom:8px' } });
    toolbar.createEl('button', {
      text: '刷新',
      cls: 'mod-cta',
      attr: { style: 'font-size:12px' },
    }).addEventListener('click', async () => {
      this.renderDiscovery(container);
    });

    if (settings.discoveryRecommendation) {
      const card = container.createEl('div', { cls: 'atomic-notes-discovery-card' });
      this.renderRecommendation(card);
    }

    placeholder.remove();
  }

  private renderRecommendation(container: HTMLElement): void {
    const app = this.app;
    const settings = this.plugin.settings;

    container.createEl('h4', { text: '关联推荐' });

    const noteMetas: { path: string; title: string }[] = [];
    const allFiles = app.vault.getMarkdownFiles();
    const files = settings.targetFolder
      ? allFiles.filter((f: any) => f.path.startsWith(settings.targetFolder))
      : allFiles;

    for (const file of files) {
      const title = file.path.split('/').pop()!.replace(/\.md$/, '');
      noteMetas.push({ path: file.path, title });
    }

    // 搜索式选择器
    const searchWrap = container.createEl('div', { attr: { style: 'position:relative;margin-bottom:8px' } });
    const searchInput = searchWrap.createEl('input', {
      attr: {
        type: 'text',
        placeholder: '搜索笔记...',
        style: 'width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;box-sizing:border-box',
      },
    }) as HTMLInputElement;
    const dropdown = searchWrap.createEl('div', {
      attr: {
        style: 'display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:0 0 4px 4px;z-index:10;box-shadow:0 4px 8px rgba(0,0,0,0.15)',
      },
    });

    let selectedPath = '';
    const resultsContainer = container.createEl('div');

    const updateDropdown = (filter = '') => {
      dropdown.empty();
      const q = filter.toLowerCase();
      const matched = q
        ? noteMetas.filter(m => m.title.toLowerCase().includes(q))
        : noteMetas;
      if (matched.length === 0) {
        dropdown.createEl('div', {
          text: '无匹配笔记',
          attr: { style: 'padding:6px 10px;font-size:11px;color:var(--text-muted)' },
        });
        dropdown.style.display = 'block';
        return;
      }
      const show = matched.slice(0, 50); // 最多显示 50 条
      for (const meta of show) {
        const item = dropdown.createEl('div', {
          text: meta.title,
          attr: { style: 'padding:5px 10px;font-size:12px;cursor:pointer;color:var(--text-normal)' },
        });
        item.addEventListener('mouseenter', () => {
          item.style.background = 'var(--background-modifier-hover)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '';
        });
        item.addEventListener('mousedown', (ev) => {
          ev.preventDefault(); // 防止 focus 丢失
          selectedPath = meta.path;
          searchInput.value = meta.title;
          dropdown.style.display = 'none';
          runSimilarity();
        });
      }
      dropdown.style.display = 'block';
    };

    const runSimilarity = async () => {
      if (!selectedPath) {
        resultsContainer.empty();
        resultsContainer.createEl('div', { cls: 'atomic-notes-empty-state' });
        const emptyEl = resultsContainer.getElementsByClassName('atomic-notes-empty-state')[resultsContainer.getElementsByClassName('atomic-notes-empty-state').length - 1];
        emptyEl.createEl('span', { text: '🔍', cls: 'empty-icon' });
        emptyEl.createEl('div', { text: '请先搜索并选择一条笔记' });
        return;
      }

      resultsContainer.empty();
      resultsContainer.createEl('div', { cls: 'atomic-notes-empty-state' });
      const loadEl = resultsContainer.getElementsByClassName('atomic-notes-empty-state')[resultsContainer.getElementsByClassName('atomic-notes-empty-state').length - 1];
      loadEl.createEl('span', { text: '🔄', cls: 'empty-icon' });
      loadEl.createEl('div', { text: '正在计算相似度...' });

      try {
        const currentFolder = settings.targetFolder || '';
        const currentCount = files.length;
        if (!this._simCache || this._simCache.folder !== currentFolder || this._simCache.noteCount !== currentCount) {
          const built = await buildSimilarityMatrix(app.vault, settings.targetFolder);
          this._simCache = {
            folder: currentFolder,
            noteCount: built.notes.length,
            notes: built.notes,
            matrix: built.matrix,
          };
        }
        const notes = this._simCache.notes;
        const matrix = this._simCache.matrix;
        const idx = notes.findIndex((n: NoteMeta) => n.path === selectedPath);
        if (idx < 0) {
          resultsContainer.empty();
          resultsContainer.createEl('p', { text: '未找到该笔记', attr: { style: 'color:var(--text-muted)' } });
          return;
        }

        const ranked: { idx: number; sim: number }[] = [];
        for (let i = 0; i < notes.length; i++) {
          if (i !== idx) ranked.push({ idx: i, sim: matrix[idx][i] });
        }
        ranked.sort((a, b) => b.sim - a.sim);
        const top10 = ranked.slice(0, 10);

        resultsContainer.empty();
        for (const item of top10) {
          const note = notes[item.idx];
          const simPercent = (item.sim * 100).toFixed(1);
          const isHighSim = item.sim >= 0.8;

          const rowEl = resultsContainer.createEl('div', { cls: 'note-link-row' });

          const badgeCls = isHighSim ? 'high' : 'mid';
          rowEl.createEl('span', {
            text: simPercent + '%',
            cls: `sim-badge ${badgeCls}`,
          });

          const linkEl = rowEl.createEl('a', {
            text: note.title,
            attr: {
              href: '#',
              style: `font-weight:${isHighSim ? 'bold' : 'normal'};color:${isHighSim ? 'var(--text-accent)' : 'var(--text-normal)'};font-size:12px;flex:1`,
            },
          });
          linkEl.addEventListener('click', (ev) => {
            ev.preventDefault();
            app.workspace.openLinkText(note.path, '', false);
          });
        }
      } catch (err: unknown) {
        resultsContainer.empty();
        resultsContainer.createEl('p', {
          text: '计算失败: ' + (err instanceof Error ? err.message : String(err)),
          attr: { style: 'color:var(--text-error)' },
        });
      }
    };

    // 搜索输入事件
    searchInput.addEventListener('input', () => {
      updateDropdown(searchInput.value.trim());
    });
    searchInput.addEventListener('focus', () => {
      updateDropdown(searchInput.value.trim());
    });
    // 点击外部关闭下拉
    document.addEventListener('click', (ev) => {
      if (!searchWrap.contains(ev.target as Node)) {
        dropdown.style.display = 'none';
      }
    }, { once: false });
  }

  async onClose(): Promise<void> {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
  }
}
