/**
 * 原子笔记提炼面板 - ItemView 侧边栏
 * 4 个 Tab：输入 / 历史 / 发现 / 介绍
 */

import {
  ItemView,
  WorkspaceLeaf,
  Notice,
} from 'obsidian';
import { buildSimilarityMatrix, NoteMeta } from '../discovery/similarity-matrix';
import { extractKeywords } from '../discovery/keywords';
import { ExtractionHistoryEntry } from '../services/history-service';
import { stripImageNoise } from '../utils/clipboard';

export const VIEW_TYPE_ATOMIC_PANEL = 'atomic-notes-panel';

export class AtomicNotesPanel extends ItemView {
  private plugin: any; // AtomicNotesPlugin reference

  constructor(leaf: WorkspaceLeaf, plugin: any) {
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

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('atomic-notes-panel');

    // ─── CSS Styles ───
    const styleEl = container.createEl('style');
    styleEl.textContent = `
      .atomic-notes-panel{padding:0 12px 12px}
      .atomic-notes-panel .setting-item{border-top:none;padding:8px 0}
      .atomic-notes-tabs{display:flex;margin-bottom:12px;border-bottom:2px solid var(--background-modifier-border)}
      .atomic-notes-tab{padding:8px 16px;cursor:pointer;font-size:13px;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s}
      .atomic-notes-tab:hover{color:var(--text-normal)}
      .atomic-notes-tab.active{color:var(--text-accent);border-bottom-color:var(--text-accent);font-weight:600}
      .atomic-notes-tab-content{display:none}
      .atomic-notes-tab-content.active{display:block}
      .atomic-notes-textarea{width:100%;min-height:180px;resize:vertical;font-family:var(--font-text);font-size:13px;padding:8px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);color:var(--text-normal);box-sizing:border-box}
      .atomic-notes-url-input{width:100%;padding:8px;font-size:13px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);color:var(--text-normal);box-sizing:border-box}
      /* 底部信息栏：字数 + 快捷按钮 */
      .atomic-notes-meta-row{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
      .atomic-notes-char-count{font-size:11px;color:var(--text-faint)}
      .atomic-notes-clear-link{font-size:11px;color:var(--text-muted);cursor:pointer;background:none;border:none;padding:0;text-decoration:none}
      .atomic-notes-clear-link:hover{color:var(--text-error)}
      .atomic-notes-clip-btn{font-size:11px;color:var(--text-accent);cursor:pointer;background:none;border:none;padding:0 4px;text-decoration:none}
      .atomic-notes-clip-btn:hover{color:var(--text-accent-hover)}
      /* 按钮栏 */
      .atomic-notes-btn-wrap{margin-top:12px}
      .atomic-notes-drop-area:hover{border-color:var(--interactive-accent)!important;background:var(--background-secondary)}
      .atomic-notes-drop-zone{min-height:150px}
      /* 发现页面 — 卡片容器 */
      .atomic-notes-discovery-card{background:var(--background-secondary);border-radius:8px;padding:10px 12px;margin-bottom:12px}
      .atomic-notes-discovery-card h4{margin:0 0 6px;font-size:13px;font-weight:600}
      .atomic-notes-discovery-card .note-link-row{display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;border-radius:4px;cursor:pointer;transition:background .15s}
      .atomic-notes-discovery-card .note-link-row:hover{background:var(--background-modifier-hover)}
      .atomic-notes-discovery-card .sim-badge{font-size:10px;padding:1px 6px;border-radius:10px;flex-shrink:0}
      .atomic-notes-discovery-card .sim-badge.high{background:var(--color-green);color:#fff}
      .atomic-notes-discovery-card .sim-badge.mid{background:var(--color-orange);color:#fff}
      .atomic-notes-discovery-card .tag-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:10px;background:var(--background-modifier-border);color:var(--text-muted);margin-right:4px}
      /* 介绍页面 */
      .atomic-notes-about-section{font-size:14px;font-weight:700;color:var(--text-normal);padding-bottom:4px;border-bottom:1px solid var(--background-modifier-border);margin:16px 0 8px}
    `;

    // 标题
    container.createEl('h3', { text: '原子笔记提炼' });

    // ─── Tab bar ───
    const tabBar = container.createEl('div', { cls: 'atomic-notes-tabs' });
    const tabs = [
      tabBar.createEl('div', { text: '输入', cls: 'atomic-notes-tab active' }),
      tabBar.createEl('div', { text: '历史', cls: 'atomic-notes-tab' }),
      tabBar.createEl('div', { text: '发现', cls: 'atomic-notes-tab' }),
      tabBar.createEl('div', { text: '介绍', cls: 'atomic-notes-tab' }),
    ];

    // ─── Tab content panels ───
    const inputPanel = container.createEl('div', { cls: 'atomic-notes-tab-content active' });
    const historyPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto' } });
    const discoveryPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto' } });
    const aboutPanel = container.createEl('div', { cls: 'atomic-notes-tab-content', attr: { style: 'max-height:500px;overflow-y:auto' } });

    const contentPanels = [inputPanel, historyPanel, discoveryPanel, aboutPanel];

    // ─── 输入面板：文本 / URL 子切换 ───
    let inputSubMode: 'text' | 'url' = 'text';

    // 子模式切换条
    const subToggleBar = inputPanel.createEl('div', {
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
    const textarea = inputPanel.createEl('textarea', {
      cls: 'atomic-notes-textarea',
      attr: { placeholder: '在此粘贴要提炼的文本...' },
    });

    // 底部信息栏（文本模式）
    const pasteMeta = inputPanel.createEl('div', { cls: 'atomic-notes-meta-row' });
    const charCountEl = pasteMeta.createEl('span', { cls: 'atomic-notes-char-count', text: '0 字' });
    const pasteActions = pasteMeta.createEl('div', { attr: { style: 'display:flex;gap:8px;align-items:center' } });
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

    // URL 输入框（URL模式，初始隐藏）
    const urlInput = inputPanel.createEl('input', {
      cls: 'atomic-notes-url-input',
      attr: { type: 'text', placeholder: 'https://...' },
    });
    urlInput.style.display = 'none';

    // URL 底部（清除链接）
    const urlMeta = inputPanel.createEl('div', { cls: 'atomic-notes-meta-row' });
    urlMeta.style.display = 'none';
    urlMeta.createEl('span');
    const clearUrlLink = urlMeta.createEl('a', {
      cls: 'atomic-notes-clear-link',
      text: '清除',
      attr: { href: '#' },
    });

    // 子模式切换
    const setInputSubMode = (mode: 'text' | 'url') => {
      inputSubMode = mode;
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

    // 文本模式事件
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

    clearUrlLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      urlInput.value = '';
    });

    // ─── Tab switch logic ───
    const tabKeys: Array<'input' | 'history' | 'discover' | 'about'> = [
      'input', 'history', 'discover', 'about',
    ];

    const renderHistory = (el: HTMLElement) => {
      el.empty();
      const history: ExtractionHistoryEntry[] = this.plugin.settings.extractionHistory || [];

      if (history.length === 0) {
        el.createEl('p', {
          text: '暂无提炼历史',
          attr: { style: 'color:var(--text-muted);padding:16px;text-align:center' },
        });
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
        this.plugin.settings.extractionHistory = [];
        await this.plugin.saveSettings();
        new Notice('历史记录已清空');
        renderHistory(el);
      });

      const listEl = el.createEl('div');
      const total = history.length;
      const displayCount = Math.min(total, 20);

      for (let i = total - 1; i >= 0; i--) {
        const entry = history[i];
        const idx = i; // 捕获当前索引用于删除

        const itemEl = listEl.createEl('div', {
          attr: { style: 'padding:8px 0;border-bottom:1px solid var(--background-modifier-border)' },
        });
        if (i < total - displayCount) {
          (itemEl as HTMLElement).style.display = 'none';
        }

        // 标题行（flex: 标题 + 删除按钮）
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
        delBtn.addEventListener('click', async () => {
          this.plugin.settings.extractionHistory!.splice(idx, 1);
          await this.plugin.saveSettings();
          renderHistory(el);
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
    };

    const renderAbout = (el: HTMLElement) => {
      el.empty();
      el.setAttr('style', 'padding:0 2px');

      const sectionStyle = 'margin:16px 0 8px;font-size:14px;font-weight:700;color:var(--text-normal);padding-bottom:4px;border-bottom:1px solid var(--background-modifier-border)';
      const textStyle = 'font-size:12px;color:var(--text-muted);line-height:1.7;margin:4px 0';

      // ── 竹叶飞刃设计理念 ──
      el.createEl('div', { text: '竹叶飞刃设计理念', attr: { style: sectionStyle } });

      el.createEl('div', {
        text: '用法一：提炼知识节点',
        attr: { style: 'font-size:12px;font-weight:600;color:var(--text-accent);margin:8px 0 4px' },
      });
      el.createEl('p', {
        text: '原子笔记是一段独立、完整、可直接复用的知识单元。每条笔记围绕单一概念，不依赖上下文即可理解。AI 提炼的价值不在于替代思考，而在于强制对信息进行压缩和结构化——把模糊的阅读感受转化为可检索、可关联的知识节点。',
        attr: { style: textStyle },
      });

      el.createEl('div', {
        text: '用法二：对抗信息垃圾',
        attr: { style: 'font-size:12px;font-weight:600;color:var(--text-accent);margin:12px 0 4px' },
      });
      el.createEl('p', {
        text: 'AI 时代的内容生产速度远超人类的阅读速度。大量文章看似洋洋洒洒，实则信息密度极低——翻来覆去讲同一句话、堆砌 SEO 关键词、填充无意义的过渡段落。',
        attr: { style: textStyle },
      });
      el.createEl('p', {
        text: '本插件的质量门控和复查机制正是为此设计：前置过滤噪声内容，AI 提炼后二次评分，帮你把时间花在真正值得读的信息上，而不是被注水文章消耗注意力。',
        attr: { style: textStyle },
      });

      // ── 处理流程 ──
      el.createEl('div', { text: '处理流程', attr: { style: sectionStyle } });
      const phases = [
        ['Phase 1', '读取内容', '从文本、URL 或剪贴板获取原始内容'],
        ['Phase 2', '质量门控', '5 层规则前置过滤低质/噪声内容，硬拦+软警告'],
        ['Phase 3', 'AI 提炼', '调用 DeepSeek 将内容拆解为原子笔记'],
        ['Phase 4', '同批去重', '检测同批次中高度相似的笔记并合并'],
        ['Phase 5', '事实核查', '逐条比对原文，标记有据/存疑/无据'],
        ['Phase 6', '笔记复查', 'AI 二次评分，过滤低价值笔记'],
      ];
      for (const [phase, name, desc] of phases) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:4px 0' } });
        row.createEl('span', { text: phase, attr: { style: 'font-size:11px;color:var(--text-accent);flex-shrink:0;min-width:52px' } });
        row.createEl('span', { text: name, attr: { style: 'font-size:12px;font-weight:600;flex-shrink:0;min-width:56px' } });
        row.createEl('span', { text: desc, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
      }

      // ── 质量门控 ──
      el.createEl('div', { text: '质量门控', attr: { style: sectionStyle } });
      const gateRules = [
        ['长度', '< 50 字', '50-200 字 / > 50000 字'],
        ['广告/低质', '≥ 3 个关键词', '1-2 个关键词'],
        ['信息密度', '< 10%（严重重复）', '< 30%（疑似水文）'],
        ['噪声占比', '> 70%（乱码残留）', '> 40%'],
        ['重复检测', '> 50% 相似度', '—'],
      ];
      const gateHeader = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:2px 0;font-size:11px;color:var(--text-faint)' } });
      gateHeader.createEl('span', { text: '规则', attr: { style: 'min-width:64px' } });
      gateHeader.createEl('span', { text: '硬阻断', attr: { style: 'min-width:100px' } });
      gateHeader.createEl('span', { text: '软警告' });
      for (const [rule, block, warn] of gateRules) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:3px 0;font-size:11px;border-top:1px solid var(--background-modifier-border)' } });
        row.createEl('span', { text: rule, attr: { style: 'min-width:64px;font-weight:600;color:var(--text-normal)' } });
        row.createEl('span', { text: block, attr: { style: 'min-width:100px;color:var(--text-error)' } });
        row.createEl('span', { text: warn, attr: { style: 'color:var(--text-warning)' } });
      }
      el.createEl('p', {
        text: '硬阻断的规则命中后直接拒绝提交流程；软警告仅提醒用户，不影响继续提炼。',
        attr: { style: textStyle + ';margin-top:8px' },
      });

      // ── 复查机制 ──
      el.createEl('div', { text: '复查机制', attr: { style: sectionStyle } });
      el.createEl('p', {
        text: '开启后 AI 从两个维度对每条笔记打分（1-5 分）：',
        attr: { style: textStyle },
      });
      const scoreItems = [
        ['洞察力分', '是否包含独立观点或独特视角'],
        ['知识价值分', '是否能为读者提供可迁移的领域知识'],
      ];
      for (const [label, desc] of scoreItems) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:2px 0 2px 12px' } });
        row.createEl('span', { text: label, attr: { style: 'font-size:12px;font-weight:600;min-width:72px' } });
        row.createEl('span', { text: desc, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
      }
      el.createEl('p', {
        text: '总分 < 3 的笔记被自动过滤，不进入知识库。这是提炼后的最后一道质量防线。',
        attr: { style: textStyle + ';margin-top:6px' },
      });

      // ── 作者 ──
      el.createEl('hr', {
        attr: { style: 'margin:20px 0 12px;border:none;border-top:1px solid var(--background-modifier-border)' },
      });
      el.createEl('div', { text: '作者', attr: { style: sectionStyle } });
      el.createEl('div', { text: '羽鳞君', attr: { style: 'font-size:13px;font-weight:700;color:var(--text-normal)' } });
      el.createEl('p', {
        text: '喵字馆创始人 | 独立品牌设计师 | 赛博乐子人',
        attr: { style: textStyle },
      });
      el.createEl('p', {
        text: '交流微信：yanhu94（备注：竹叶飞刃）',
        attr: { style: textStyle + ';color:var(--text-faint)' },
      });
    };

    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', () => {
        for (let j = 0; j < tabs.length; j++) {
          tabs[j].classList.toggle('active', j === i);
          contentPanels[j].classList.toggle('active', j === i);
        }

        if (i === 1) {
          renderHistory(historyPanel);
        } else if (i === 2) {
          this.renderDiscovery(discoveryPanel);
        } else if (i === 3) {
          renderAbout(aboutPanel);
        }
      });
    }

    // ─── Extract button ───
    const buttonWrap = container.createEl('div', { cls: 'atomic-notes-btn-wrap' });
    buttonWrap.style.display = '';

    // 切换 Tab 时控制按钮显隐（只在输入面板显示）
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', () => {
        buttonWrap.style.display = (i > 0) ? 'none' : '';
      });
    }

    const extractBtn = buttonWrap.createEl('button', { text: '开始提炼', cls: 'mod-cta' });
    extractBtn.addEventListener('click', async () => {
      if (this.plugin._isExtracting) return;

      let inputContent: string;
      let inputData: { type: 'url' | 'text' | 'selection'; content: string };

      if (inputSubMode === 'url') {
        inputContent = urlInput.value;
        if (!inputContent || !inputContent.trim()) {
          new Notice('请输入有效的 URL');
          return;
        }
        inputData = { type: 'url', content: inputContent.trim() };
      } else {
        inputContent = textarea.value;
        if (!inputContent || !inputContent.trim()) {
          new Notice('请粘贴文本或使用「读取剪贴板」');
          return;
        }
        inputData = { type: 'text', content: inputContent };
      }

      this.plugin._isExtracting = true;
      extractBtn.setText('提炼中...');
      extractBtn.disabled = true;

      try {
        await this.plugin.runExtraction(inputData);
      } finally {
        this.plugin._isExtracting = false;
        extractBtn.setText('开始提炼');
        extractBtn.disabled = false;

        if (inputSubMode === 'text') {
          textarea.value = '';
          charCountEl.setText('0 字');
        } else {
          urlInput.value = '';
        }
      }
    });
  }

  // ─── Discovery Methods ───

  private renderDiscovery(container: HTMLElement): void {
    const settings = this.plugin.settings;
    container.empty();

    const placeholder = container.createEl('p', {
      text: '正在分析知识库...',
      attr: { style: 'color:var(--text-accent);font-size:12px;padding:8px 16px' },
    });

    if (!settings.discoveryRecommendation) {
      container.createEl('p', {
        text: '请在设置中开启至少一项发现功能',
        attr: { style: 'color:var(--text-muted);padding:16px;text-align:center' },
      });
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

    const selectEl = container.createEl('select', {
      attr: { style: 'width:100%;margin-bottom:8px;padding:4px;border-radius:4px' },
    });
    selectEl.createEl('option', { text: '请先选择一条笔记', value: '' });

    const noteMetas: { path: string; title: string }[] = [];
    const allFiles = app.vault.getMarkdownFiles();
    const files = settings.targetFolder
      ? allFiles.filter((f: any) => f.path.startsWith(settings.targetFolder))
      : allFiles;

    for (const file of files) {
      const title = file.path.split('/').pop()!.replace(/\.md$/, '');
      selectEl.createEl('option', { text: title, value: file.path });
      noteMetas.push({ path: file.path, title });
    }

    const resultsContainer = container.createEl('div');

    selectEl.addEventListener('change', async () => {
      const selectedPath = selectEl.value;
      if (!selectedPath) {
        resultsContainer.empty();
        resultsContainer.createEl('p', {
          text: '请先选择一条笔记',
          attr: { style: 'color:var(--text-muted);font-size:12px' },
        });
        return;
      }

      resultsContainer.empty();
      resultsContainer.createEl('p', {
        text: '正在计算相似度...',
        attr: { style: 'color:var(--text-muted);font-size:12px' },
      });

      try {
        const raw = await app.vault.read(app.vault.getAbstractFileByPath(selectedPath) as any);
        const content = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
        const keywords = extractKeywords(content);

        const { notes, matrix } = await buildSimilarityMatrix(app.vault, settings.targetFolder);
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
    });
  }

  async onClose(): Promise<void> {
    // No cleanup needed
  }
}
