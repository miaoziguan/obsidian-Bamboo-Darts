/**
 * 原子笔记提炼面板 - ItemView 侧边栏
 * 4 个 Tab：输入 / 历史 / 发现 / 介绍
 */

import {
  ItemView,
  WorkspaceLeaf,
  Notice,
} from 'obsidian';
import AtomicNotesPlugin from '../main';
import { buildSimilarityMatrix, NoteMeta } from '../discovery/similarity-matrix';
import { extractKeywords } from '../discovery/keywords';
import { ExtractionHistoryEntry } from '../services/history-service';
import { stripImageNoise } from '../utils/clipboard';
import { ProgressCallback, ProgressEvent } from '../extraction/progress';

export const VIEW_TYPE_ATOMIC_PANEL = 'atomic-notes-panel';

export class AtomicNotesPanel extends ItemView {
  private plugin: AtomicNotesPlugin;

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

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('atomic-notes-panel');

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
        ['Phase 4', '同批去重', 'TF-IDF + 余弦相似度，检测同批次高度相似笔记'],
        ['Phase 4b', '知识库去重', '与目标文件夹已有笔记比对，严格不跨目录读取'],
        ['Phase 5', '事实核查', '逐条比对原文，标记有据/存疑/无据，支持长文分段'],
        ['Phase 5b', '数据核查', '检查数字/百分比/日期等数据准确性，内部比对+外部验证'],
        ['Phase 6', '笔记复查', 'AI 二次评分，过滤低价值笔记'],
      ];
      for (const [phase, name, desc] of phases) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:4px 0' } });
        row.createEl('span', { text: phase, attr: { style: 'font-size:11px;color:var(--text-accent);flex-shrink:0;min-width:52px' } });
        row.createEl('span', { text: name, attr: { style: 'font-size:12px;font-weight:600;flex-shrink:0;min-width:56px' } });
        row.createEl('span', { text: desc, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
      }

      // ── 去重算法 ──
      el.createEl('div', { text: '去重算法', attr: { style: sectionStyle } });
      el.createEl('p', {
        text: 'Phase 4 与 Phase 4b 采用 TF-IDF + 余弦相似度算法：',
        attr: { style: textStyle },
      });
      el.createEl('div', {
        text: '• 中文按字符 3-gram（英文按完整词）提取 token',
        attr: { style: textStyle + ';padding-left:10px' },
      });
      el.createEl('div', {
        text: '• 每篇文档转化为 TF-IDF 向量，两篇相似度通过向量余弦计算',
        attr: { style: textStyle + ';padding-left:10px' },
      });
      el.createEl('div', {
        text: '• 相比关键词匹配，对同义词、换说法、近义词更鲁棒',
        attr: { style: textStyle + ';padding-left:10px' },
      });
      el.createEl('p', {
        text: '知识库去重严格只读取目标文件夹内容，不会扫描知识库其他区域。可在设置中独立指定"去重目标文件夹"。',
        attr: { style: textStyle },
      });

      // ── 实时进度反馈 ──
      el.createEl('div', { text: '实时进度反馈', attr: { style: sectionStyle } });
      el.createEl('p', {
        text: '提炼过程中每一步都实时显示当前阶段名称、耗时、子进度，可随时点击"取消"终止流程。',
        attr: { style: textStyle },
      });
      const progressItems = [
        ['Phase 1', '输入文本读取'],
        ['Phase 2', '质量门控判定'],
        ['Phase 3', 'AI 调用与笔记拆解'],
        ['Phase 4 / 4b', '去重计算'],
        ['Phase 5 / 5b', '事实与数据核查'],
        ['Phase 6', '复查评分'],
      ];
      for (const [phase, detail] of progressItems) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:2px 0 2px 12px' } });
        row.createEl('span', { text: phase, attr: { style: 'font-size:11px;color:var(--text-accent);font-weight:600;min-width:72px' } });
        row.createEl('span', { text: detail, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
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

      // ── 事实核查 ──
      el.createEl('div', { text: '事实核查', attr: { style: sectionStyle } });
      el.createEl('p', {
        text: '从每条笔记中提取包含数字、百分比、日期、实体名称的事实声明，逐条与原文比对：',
        attr: { style: textStyle },
      });
      const factStatus = [
        ['有据', '声明与原文完全一致或可直接推导'],
        ['存疑', '部分相关但存在夸大、跳跃或无法验证'],
        ['无据', '无法找到任何支持'],
      ];
      for (const [status, desc] of factStatus) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:2px 0 2px 12px' } });
        row.createEl('span', { text: status, attr: { style: 'font-size:12px;font-weight:600;min-width:48px;color:var(--text-accent)' } });
        row.createEl('span', { text: desc, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
      }
      el.createEl('p', {
        text: '对于长文章（超过 4000 字符），插件会自动分段核查，确保每个段落的事实都能被准确验证。',
        attr: { style: textStyle + ';margin-top:6px' },
      });

      // ── 数据核查 ──
      el.createEl('div', { text: '数据核查', attr: { style: sectionStyle } });
      el.createEl('p', {
        text: '专门检查笔记中的数字、百分比、日期、金额、排名等数据点：',
        attr: { style: textStyle },
      });
      el.createEl('div', {
        text: '1. 内部验证：与原文精确或模糊比对，检测数据偏差',
        attr: { style: textStyle },
      });
      el.createEl('div', {
        text: '2. 外部验证：无法在原文中比对的数据点，调用 AI 验证公开事实',
        attr: { style: textStyle },
      });
      const dataStatus = [
        ['一致', '数据与原文相符'],
        ['偏差', '数据与原文存在差异'],
        ['无法验证', '无法在原文或公开知识中找到依据'],
      ];
      for (const [status, desc] of dataStatus) {
        const row = el.createEl('div', { attr: { style: 'display:flex;gap:8px;padding:2px 0 2px 12px' } });
        row.createEl('span', { text: status, attr: { style: 'font-size:12px;font-weight:600;min-width:64px;color:var(--text-accent)' } });
        row.createEl('span', { text: desc, attr: { style: 'font-size:11px;color:var(--text-muted)' } });
      }

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

    // ─── 进度显示区域（位于输入面板中）
    const progressWrap = container.createEl('div', { cls: 'atomic-notes-progress-wrap', attr: { style: 'margin:8px 0;padding:8px 12px;border:1px solid var(--background-modifier-border);border-radius:6px;display:none;' } });
    const progressTitle = progressWrap.createEl('div', { attr: { style: 'font-weight:bold;font-size:13px;margin-bottom:6px;' }, text: '准备提炼...' });
    const progressBody = progressWrap.createEl('div', { attr: { style: 'font-size:12px;color:var(--text-muted);line-height:1.8;max-height:240px;overflow-y:auto;' } });

    // 切换 Tab 时控制进度区域显隐（只在输入面板显示）
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', () => {
        progressWrap.style.display = (i > 0) ? 'none' : progressWrap.style.display;
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
    const cancelBtn = buttonWrap.createEl('button', { text: '取消', cls: 'mod-warning' });
    cancelBtn.style.display = 'none';
    cancelBtn.style.marginLeft = '8px';
    cancelBtn.addEventListener('click', () => {
      this.plugin.cancelExtraction();
    });

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

      // 重置进度显示区域
      progressWrap.style.display = '';
      progressTitle.setText('正在提炼原子笔记...');
      progressBody.empty();

      extractBtn.setText('提炼中...');
      extractBtn.disabled = true;
      cancelBtn.style.display = '';

      // Panel 内进度回调（避免创建浮动的 progressModal）
      const panelOnProgress: ProgressCallback = (event: ProgressEvent, allEvents: ProgressEvent[], totalMs: number) => {
        progressTitle.setText(`${event.phase}：${event.name} — 已用时 ${(totalMs / 1000).toFixed(1)}s`);
        progressBody.empty();
        for (const ev of allEvents) {
          const icon = ev.status === 'running' ? '⟳ ' : (ev.status === 'success' ? '✓ ' : (ev.status === 'failed' ? '✗ ' : '− '));
          const line = progressBody.createEl('div', { text: `${icon}${ev.phase} ${ev.name}${ev.detail ? ' — ' + ev.detail : ''}` });
          if (ev.status === 'running') line.style.color = 'var(--text-accent)';
          if (ev.status === 'success') line.style.color = 'var(--text-success)';
          if (ev.status === 'failed') line.style.color = 'var(--text-error)';
        }
        if (event.subProgress) {
          const sp = event.subProgress;
          const labelText = sp.label ? '（' + sp.label + '）' : '';
          progressBody.createEl('div', {
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

        if (inputSubMode === 'text') {
          textarea.value = '';
          charCountEl.setText('0 字');
        } else {
          urlInput.value = '';
        }

        // 2 秒后隐藏进度区域
        setTimeout(() => {
          progressWrap.style.display = 'none';
          progressBody.empty();
        }, 2000);
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
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
  }
}
