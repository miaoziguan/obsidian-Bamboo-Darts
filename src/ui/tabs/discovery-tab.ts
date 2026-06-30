import { AtomicNotesPlugin } from '../../main';
import { buildSimilarityMatrix, mmrRerank, NoteMeta, SimilarityIndex, invalidateDiscoveryCache } from '../../discovery/similarity-matrix';

/**
 * 发现 Tab：相似度计算 + 关联推荐 + 搜索选择器
 *
 * 使用方式：
 *   const tab = new DiscoveryTab(plugin);
 *   tab.render(el);   // 渲染发现面板
 *   tab.destroy();    // 面板关闭时调用，清理全局监听器
 */
export class DiscoveryTab {
  private plugin: AtomicNotesPlugin;

  /** 相似度矩阵缓存 */
  private _simCache: {
    folder: string;
    maxNotes: number;
    useIndex: boolean;
    jaccardThreshold: number;
    mmrLambda: number;
    topK: number;
    notes: NoteMeta[];
    index: SimilarityIndex;
  } | null = null;

  /** 全局点击监听器引用（用于 destroy 清理） */
  private _docClickHandler: ((ev: MouseEvent) => void) | null = null;

  constructor(plugin: AtomicNotesPlugin) {
    this.plugin = plugin;
  }

  /** 渲染发现面板 */
  render(el: HTMLElement): void {
    const settings = this.plugin.settings;
    el.empty();

    if (!settings.discoveryRecommendation) {
      const emptyEl = el.createEl('div', { cls: 'atomic-notes-empty-state' });
      emptyEl.createEl('span', { text: '🔍', cls: 'empty-icon' });
      emptyEl.createEl('div', { text: '请在设置中开启至少一个发现功能' });
      return;
    }

    const toolbar = el.createEl('div', { attr: { style: 'margin-bottom:8px' } });
    toolbar
      .createEl('button', {
        text: '刷新',
        cls: 'mod-cta',
        attr: { style: 'font-size:12px' },
      })
      .addEventListener('click', async () => {
        this._simCache = null;
        invalidateDiscoveryCache();
        this.render(el);
      });

    const card = el.createEl('div', { cls: 'atomic-notes-discovery-card' });
    this.renderRecommendation(card);
  }

  /** 渲染关联推荐（含搜索选择器 + 相似度计算） */
  private renderRecommendation(container: HTMLElement): void {
    const app = this.plugin.app;
    const settings = this.plugin.settings;
    const discoveryIndex = this.plugin.discoveryIndex;

    container.createEl('h4', { text: '关联推荐' });

    const noteMetas: { path: string; title: string }[] = [];

    // 优先使用发现索引中的标题，避免再次读取文件
    if (discoveryIndex && discoveryIndex.loaded && settings.discoveryUseIndex !== false) {
      const features = discoveryIndex.filterByFolder(settings.targetFolder);
      for (const feature of features) {
        noteMetas.push({ path: feature.path, title: feature.title });
      }
    }

    // 索引不可用时回退到文件列表
    if (noteMetas.length === 0) {
      const allFiles = app.vault.getMarkdownFiles();
      const files = settings.targetFolder
        ? allFiles.filter((f: any) => f.path.startsWith(settings.targetFolder))
        : allFiles;

      for (const file of files) {
        const title = file.path.split('/').pop()!.replace(/\.md$/, '');
        noteMetas.push({ path: file.path, title });
      }
    }

    // 搜索式选择器
    const searchWrap = container.createEl('div', {
      attr: { style: 'position:relative;margin-bottom:8px' },
    });
    const searchInput = searchWrap.createEl('input', {
      attr: {
        type: 'text',
        placeholder: '搜索笔记...',
        style:
          'width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;box-sizing:border-box',
      },
    }) as HTMLInputElement;
    const dropdown = searchWrap.createEl('div', {
      attr: {
        style:
          'display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:0 0 4px 4px;z-index:10;box-shadow:0 4px 8px rgba(0,0,0,0.15)',
      },
    });

    let selectedPath = '';
    const resultsContainer = container.createEl('div');
    // 初始提示
    resultsContainer.createEl('div', {
      text: '请输入笔记标题搜索，选择后查看相似笔记',
      attr: { style: 'font-size:11px;color:var(--text-muted);padding:6px 0;text-align:center' },
    });

    const updateDropdown = (filter = '') => {
      dropdown.empty();
      const q = filter.toLowerCase();
      const matched = q ? noteMetas.filter((m) => m.title.toLowerCase().includes(q)) : noteMetas;
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
          attr: {
            style: 'padding:5px 10px;font-size:12px;cursor:pointer;color:var(--text-normal)',
          },
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
        const emptyEl = resultsContainer.getElementsByClassName('atomic-notes-empty-state')[
          resultsContainer.getElementsByClassName('atomic-notes-empty-state').length - 1
        ];
        emptyEl.createEl('span', { text: '🔍', cls: 'empty-icon' });
        emptyEl.createEl('div', { text: '请先搜索并选择一条笔记' });
        return;
      }

      resultsContainer.empty();
      resultsContainer.createEl('div', { cls: 'atomic-notes-empty-state' });
      const loadEl = resultsContainer.getElementsByClassName('atomic-notes-empty-state')[
        resultsContainer.getElementsByClassName('atomic-notes-empty-state').length - 1
      ];
      loadEl.createEl('span', { text: '🔄', cls: 'empty-icon' });
      loadEl.createEl('div', { text: '正在计算相似度...' });

      try {
        const currentFolder = settings.targetFolder || '';
        const maxNotes = settings.discoveryMaxNotes ?? 500;
        const jaccardThreshold = settings.discoveryJaccardThreshold ?? 0.3;
        const mmrLambda = settings.discoveryMmrLambda ?? 0.6;
        const topK = settings.discoveryTopK ?? 10;
        const useIndex = settings.discoveryUseIndex !== false;
        if (
          !this._simCache ||
          this._simCache.folder !== currentFolder ||
          this._simCache.maxNotes !== maxNotes ||
          this._simCache.useIndex !== useIndex ||
          this._simCache.jaccardThreshold !== jaccardThreshold ||
          this._simCache.mmrLambda !== mmrLambda ||
          this._simCache.topK !== topK
        ) {
          const built = await buildSimilarityMatrix(
            app.vault,
            settings.targetFolder,
            undefined,
            this.plugin.discoveryIndex,
            {
              maxNotes,
              useIndex,
            },
          );
          this._simCache = {
            folder: currentFolder,
            maxNotes,
            useIndex,
            jaccardThreshold,
            mmrLambda,
            topK,
            notes: built.notes,
            index: built.index,
          };
        }
        const notes = this._simCache.notes;
        const index = this._simCache.index;
        const idx = notes.findIndex((n: NoteMeta) => n.path === selectedPath);
        if (idx < 0) {
          resultsContainer.empty();
          resultsContainer.createEl('p', {
            text: '未找到该笔记',
            attr: { style: 'color:var(--text-muted)' },
          });
          return;
        }

        const simToQuery: number[] = index.getSimilarityRow(idx);

        const ranked = mmrRerank(simToQuery, index, idx, topK, mmrLambda);
        const topKFiltered = ranked.filter((item) => item.sim >= jaccardThreshold);

        resultsContainer.empty();
        if (ranked.length === 0) {
          resultsContainer.createEl('div', {
            text: '库中可比较的笔记太少，建议多保存几条笔记后再试',
            attr: { style: 'font-size:11px;color:var(--text-muted);padding:6px 0;text-align:center' },
          });
          return;
        }
        if (topKFiltered.length === 0) {
          const hint =
            jaccardThreshold > 0
              ? `没有超过相似度门槛 ${(jaccardThreshold * 100).toFixed(0)}% 的笔记，可以在设置里调低「最低相似度」`
              : '暂时没找到跟这条笔记相关的其他笔记';
          resultsContainer.createEl('div', {
            text: hint,
            attr: { style: 'font-size:11px;color:var(--text-muted);padding:6px 0;text-align:center' },
          });
          return;
        }

        for (const item of topKFiltered) {
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
    // 点击外部关闭下拉（存储引用以便 destroy 清理）
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
    }
    this._docClickHandler = (ev: MouseEvent) => {
      if (!searchWrap.contains(ev.target as Node)) {
        dropdown.style.display = 'none';
      }
    };
    // @ts-ignore - Obsidian 类型定义中 Window 事件目标类型不匹配
    document.addEventListener('click', this._docClickHandler);
  }

  /** 清理全局监听器（面板关闭时调用） */
  destroy(): void {
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
      this._docClickHandler = null;
    }
    this._simCache = null;
  }
}
