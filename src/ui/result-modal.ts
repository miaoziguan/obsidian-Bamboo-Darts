/**
 * 结果展示模态框
 * 展示提炼结果、步骤时间线、去重报告、存储结果
 */

import { Modal, App, Setting } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult } from '../extractor';
import { scoreGrade } from '../review/note-reviewer';
import { DedupResult } from '../deduplicator';
import { ResultViewModel, FilterMode } from './result-view-model';

/** 步骤状态对应的颜色 */
const STEP_COLORS: Record<string, string> = {
  success: 'var(--color-green)',
  failed: 'var(--color-red)',
  skipped: 'var(--text-faint)',
};
const STEP_ICONS: Record<string, string> = {
  success: '✓',
  failed: '✗',
  skipped: '—',
};

export class ResultModal extends Modal {
  private vm: ResultViewModel;
  private onSave: (notes: AtomicNote[]) => Promise<void>;
  private countEl: HTMLElement | null = null;
  private _toggleBtn: HTMLButtonElement | null = null;

  constructor(
    app: App,
    result: ExtractionResult,
    dedupResult?: DedupResult,
    onSave?: (notes: AtomicNote[]) => Promise<void>,
  ) {
    super(app);
    this.vm = new ResultViewModel(result, dedupResult);
    this.onSave = onSave || (async () => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '原子笔记提炼结果' });

    // 显示检测到的策略徽标
    if (this.vm.profileLabel) {
      const badge = contentEl.createEl('div', {
        cls: 'atomic-notes-profile-badge',
      });
      badge.style.display = 'inline-block';
      badge.style.padding = '4px 12px';
      badge.style.borderRadius = '12px';
      badge.style.fontSize = '12px';
      badge.style.background = 'var(--background-modifier-hover)';
      badge.style.color = 'var(--text-muted)';
      badge.style.marginBottom = '8px';
      badge.textContent = this.vm.profileLabel;
    }

    this.renderSteps(contentEl);

    // 门控警告提示栏（仅提炼成功时显示）
    if (this.vm.result.success && this.vm.result.gateWarnings && this.vm.result.gateWarnings.length > 0) {
      this.renderGateWarnings(contentEl);
    }

    // 语义去重跳过提示（向量索引构建中）
    if (this.vm.result.semanticDedupSkipped) {
      const box = contentEl.createEl('div', {
        attr: {
          style: [
            'border-left: 3px solid var(--text-accent)',
            'background: rgba(var(--color-blue-rgb, 68,138,255), 0.06)',
            'border-radius: 6px',
            'padding: 6px 12px',
            'margin-bottom: 10px',
            'font-size: 12px',
            'color: var(--text-muted)',
          ].join(';'),
        },
      });
      box.createEl('span', { text: 'ℹ️ ', attr: { style: 'font-size:13px' } });
      box.createEl('span', { text: '向量索引构建中，本次未启用语义去重。仅使用本地算法比对。' });
    }

    if (this.vm.result.success && this.vm.result.notes) {
      if (this.vm.dedupResult) {
        this.renderDedupReport(contentEl);
      }

      if (this.vm.result.crossBatchDuplicates && this.vm.result.crossBatchDuplicates.length > 0) {
        this.renderCrossBatchDetails(contentEl);
      }

      if (this.vm.result.vaultDedupPending && this.vm.result.vaultDedupPending.length > 0) {
        this.renderPendingDuplicates(contentEl);
      }

      if (this.vm.result.verificationSummary) {
        this.renderVerificationSummary(contentEl);
      }

      if (this.vm.result.reviewDetails && this.vm.result.reviewDetails.length > 0) {
        this.renderReviewSummary(contentEl);
      }

      this.renderNotes(contentEl);
    } else {
      const errEl = contentEl.createEl('p', { cls: 'atomic-notes-error' });
      errEl.createEl('strong', { text: '提炼失败：' });
      if (this.vm.result.error?.includes('[诊断]')) {
        const pre = errEl.createEl('pre', { cls: 'atomic-notes-diag', text: this.vm.result.error });
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordWrap = 'break-word';
        pre.style.maxHeight = '400px';
        pre.style.overflowY = 'auto';
        pre.style.fontSize = '12px';
        pre.style.background = 'var(--background-secondary)';
        pre.style.padding = '10px';
        pre.style.borderRadius = '6px';
        pre.style.marginTop = '8px';
      } else {
        errEl.appendText(this.vm.result.error || '');
      }
    }

    // 操作按钮
    this.renderActions(contentEl);
  }

  /** 时间线样式步骤展示 */
  private renderSteps(container: HTMLElement) {
    container.createEl('div', { text: '处理流程', cls: 'atomic-notes-section-header' });

    const timeline = container.createEl('div', { cls: 'atomic-notes-timeline' });

    for (const step of this.vm.result.steps) {
      const item = timeline.createEl('div', { cls: 'atomic-notes-timeline-item' });

      // 状态圆点
      const dot = item.createEl('div', { cls: 'atomic-notes-timeline-dot' });
      dot.style.background = STEP_COLORS[step.status] || 'var(--text-faint)';
      dot.setText(STEP_ICONS[step.status] || '?');

      // 内容
      item.createEl('div', { cls: 'atomic-notes-timeline-step', text: step.step });
      item.createEl('div', { cls: 'atomic-notes-timeline-message', text: step.message });
    }
  }

  /** 门控警告栏（黄色提示，不阻断） */
  private renderGateWarnings(container: HTMLElement) {
    const warnings = this.vm.result.gateWarnings;
    if (!warnings || warnings.length === 0) return;

    const box = container.createEl('div', {
      attr: {
        style: [
          'border-left: 3px solid var(--color-orange)',
          'background: rgba(var(--color-orange-rgb, 255,160,0), 0.08)',
          'border-radius: 6px',
          'padding: 8px 12px',
          'margin-bottom: 10px',
        ].join(';'),
      },
    });

    const titleRow = box.createEl('div', {
      attr: { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px' },
    });
    titleRow.createEl('span', { text: '⚠️', attr: { style: 'font-size:13px' } });
    titleRow.createEl('span', {
      text: this.vm.result.forceExtracted
        ? `质量提醒（${warnings.length} 条，已跳过门控）`
        : `门控警告（${warnings.length} 条，不影响提炼结果）`,
      attr: { style: 'font-weight:600;font-size:12px;color:var(--color-orange)' },
    });

    const list = box.createEl('ul', {
      attr: {
        style: 'margin:0;padding-left:18px;font-size:12px;color:var(--text-muted);line-height:1.7',
      },
    });
    for (const w of warnings) {
      list.createEl('li', { text: w });
    }
  }

  private renderDedupReport(container: HTMLElement) {
    if (!this.vm.dedupResult) return;

    const reportEl = container.createEl('div', { cls: 'atomic-notes-dedup-report' });
    reportEl.createEl('div', { text: '去重报告', cls: 'atomic-notes-section-header' });

    // 三层去重统一说明
    reportEl.createEl('p', {
      text: '去重分三层：批内去重（本次提炼内部的重复）→ 知识库去重（与已有笔记比对）→ 待确认（相似度在阈值区间，由你决定）',
      attr: { style: 'font-size:12px;color:var(--text-faint);margin-bottom:8px' },
    });

    if (this.vm.dedupResult.duplicates.length === 0) {
      reportEl.createEl('p', {
        text: '✅ 未检测到与知识库重复的笔记',
        attr: { style: 'color:var(--text-muted)' },
      });
    } else {
      reportEl.createEl('p', {
        text: `检测到 ${this.vm.dedupResult.duplicates.length} 条可能重复的笔记：`,
      });
      const dupList = reportEl.createEl('ul');
      for (const dup of this.vm.dedupResult.duplicates) {
        const sim = (dup.similarity * 100).toFixed(1);
        let detail = `相似度：${sim}%`;
        // 显示分解：本地 X% / 语义 Y%
        if (dup.localSimilarity !== undefined && dup.semanticSimilarity !== undefined) {
          detail += `（本地 ${(dup.localSimilarity * 100).toFixed(1)}% / 语义 ${(dup.semanticSimilarity * 100).toFixed(1)}%）`;
        } else if (dup.semanticSimilarity !== undefined && dup.semanticSimilarity > 0) {
          detail += `（语义 ${(dup.semanticSimilarity * 100).toFixed(1)}%）`;
        } else {
          detail += `（本地）`;
        }
        dupList.createEl('li').setText(`${detail} | 匹配：${dup.matchedNote || '未知'}`);
      }
    }

    reportEl.createEl('p', {
      text: `最终保存 ${this.vm.dedupResult.uniqueNotes.length} 条笔记`,
      attr: { style: 'font-weight:600;color:var(--text-accent)' },
    });
  }

  /** 批内去重详情（可折叠，支持手动恢复） */
  private renderCrossBatchDetails(container: HTMLElement) {
    const dups = this.vm.result.crossBatchDuplicates;
    if (!dups || dups.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-cross-dedup' });

    // 折叠头部
    const header = section.createEl('div', {
      attr: {
        style:
          'display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none',
      },
    });
    const arrow = header.createEl('span', {
      text: '▶',
      attr: { style: 'font-size:10px;transition:transform 0.2s;display:inline-block' },
    });
    header.createEl('span', {
      text: `批内去重详情（${dups.length} 条被合并）`,
      attr: { style: 'font-weight:600;font-size:13px' },
    });
    header.createEl('span', {
      text: '点击展开',
      attr: { style: 'font-size:11px;color:var(--text-muted)' },
    });

    const detailContainer = section.createEl('div', {
      attr: {
        style:
          'display:none;border-left:3px solid var(--background-modifier-border);padding-left:12px;margin-top:8px',
      },
    });

    let isOpen = false;
    header.addEventListener('click', () => {
      isOpen = !isOpen;
      detailContainer.style.display = isOpen ? 'block' : 'none';
      arrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      hintEl.textContent = isOpen ? '点击收起' : '点击展开';
    });

    const hintEl = header.lastChild as HTMLElement;

    // 每条被删笔记
    for (let i = 0; i < dups.length; i++) {
      const dup = dups[i];
      const card = detailContainer.createEl('div', {
        attr: {
          style:
            'border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--background-secondary)',
        },
      });

      // 相似度
      const simPercent = (dup.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        attr: {
          style: 'font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:4px',
        },
      });

      // 被删笔记
      const removedRow = card.createEl('div', { attr: { style: 'margin-bottom:4px' } });
      removedRow.createEl('span', {
        text: '被合并：',
        attr: { style: 'font-weight:600;font-size:12px' },
      });
      removedRow.createEl('span', {
        text: dup.removedTitle,
        attr: { style: 'font-size:12px' },
      });
      const removedPreview =
        dup.removedContent.slice(0, 120) + (dup.removedContent.length > 120 ? '...' : '');
      card.createEl('div', {
        text: removedPreview,
        attr: { style: 'font-size:11px;color:var(--text-muted);margin-bottom:6px' },
      });

      // 存活笔记
      const matchedRow = card.createEl('div', { attr: { style: 'margin-bottom:6px' } });
      matchedRow.createEl('span', {
        text: '并入：',
        attr: { style: 'font-weight:600;font-size:12px' },
      });
      matchedRow.createEl('span', {
        text: dup.matchedNote || '未知',
        attr: { style: 'font-size:12px' },
      });
      if (dup.matchedContent) {
        card.createEl('div', {
          text: dup.matchedContent.slice(0, 120) + (dup.matchedContent.length > 120 ? '...' : ''),
          attr: { style: 'font-size:11px;color:var(--text-muted);margin-bottom:6px' },
        });
      }

      // 恢复按钮
      if (this.vm.restoredCrossBatch.has(i)) {
        const restoredLabel = card.createEl('span', {
          text: '已恢复',
          attr: { style: 'font-size:11px;color:var(--text-muted);font-style:italic' },
        });
        void restoredLabel;
      } else {
        const restoreBtn = card.createEl('button', {
          text: '恢复为独立笔记',
          attr: { style: 'font-size:11px;padding:2px 10px;cursor:pointer' },
        });
        restoreBtn.addEventListener('click', () => {
          this.restoreCrossBatchNote(i);
          card.style.opacity = '0.6';
          restoreBtn.detach();
          card.createEl('span', {
            text: '已恢复',
            attr: { style: 'font-size:11px;color:var(--text-muted);font-style:italic' },
          });
        });
      }
    }
  }

  /** 将被合并的笔记恢复为独立笔记 */
  private restoreCrossBatchNote(index: number) {
    this.vm.restoreCrossBatchNote(index);
    this.updateSelectionCount();

    // 更新笔记列表（仅刷新卡片，保留搜索/筛选状态）
    this.refreshFilteredNotes();
  }

  /** 刷新笔记卡片列表（用于恢复/变更后重新渲染） */
  private notesListEl: HTMLElement | null = null;
  private cardsContainerEl: HTMLElement | null = null;
  private refreshNotesList() {
    if (!this.notesListEl) return;
    const parent = this.notesListEl.parentElement;
    if (!parent) return;
    this.notesListEl.detach();
    this.renderNotes(parent);
  }

  /** 仅刷新卡片区域（搜索/筛选时用，不重建工具栏） */
  private refreshFilteredNotes() {
    if (!this.cardsContainerEl) return;
    this.cardsContainerEl.empty();
    this.renderNoteCardsInto(this.cardsContainerEl);
  }

  /** 疑似重复确认 UI（中相似度 60-80%） */
  private renderPendingDuplicates(container: HTMLElement) {
    const pending = this.vm.result.vaultDedupPending;
    if (!pending || pending.length === 0) return;

    // 清理旧的重渲染内容（防止点击"全部保留/丢弃"后重复插入）
    const existingSection = container.querySelector('.atomic-notes-pending-dedup');
    if (existingSection) existingSection.remove();

    const highCount = pending.filter((p) => p.highSimilarity).length;
    const midCount = pending.length - highCount;

    const section = container.createEl('div', { cls: 'atomic-notes-pending-dedup' });
    section.createEl('div', {
      text: '⚠️ 疑似重复笔记（需确认）',
      cls: 'atomic-notes-section-header',
    });

    // 按相似度分组说明
    const descParts: string[] = [];
    if (highCount > 0) descParts.push(`${highCount} 条高相似度（极可能重复）`);
    if (midCount > 0) descParts.push(`${midCount} 条中相似度（需人工判断）`);
    section.createEl('p', {
      text: `发现 ${pending.length} 条笔记与知识库已有笔记相似度较高：${descParts.join('，')}。请逐一确认是否保留：`,
      attr: { style: 'color:var(--text-muted);font-size:13px' },
    });

    for (const item of pending) {
      const isHigh = !!item.highSimilarity;
      const borderColor = isHigh ? 'var(--color-red)' : 'var(--background-modifier-border)';
      const card = section.createEl('div', {
        attr: {
          style: `border:1px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:10px;background:var(--background-secondary)`,
        },
      });

      // 相似度提示（本地 X% / 语义 Y%）
      const localSim = (item.localSimilarity * 100).toFixed(1);
      const simColor = isHigh ? 'var(--color-red)' : 'var(--text-accent)';
      let simLabel = isHigh ? `⚠ 本地 ${localSim}%（高）` : `本地 ${localSim}%`;
      if (item.semanticSimilarity !== undefined) {
        const semPercent = (item.semanticSimilarity * 100).toFixed(1);
        simLabel += ` / 语义 ${semPercent}%`;
      }
      card.createEl('div', {
        text: simLabel,
        attr: { style: `font-size:12px;color:${simColor};font-weight:600;margin-bottom:6px` },
      });

      // 新笔记信息
      const newNoteDiv = card.createEl('div');
      newNoteDiv.createEl('span', {
        text: '新笔记：',
        attr: { style: 'font-weight:600;font-size:13px' },
      });
      newNoteDiv.createEl('span', {
        text: item.newNoteTitle,
        attr: { style: 'font-size:13px' },
      });
      const newPreview =
        item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? '...' : '');
      card.createEl('div', {
        text: newPreview,
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      // 已有笔记信息
      const existingDiv = card.createEl('div');
      existingDiv.createEl('span', {
        text: '已有笔记：',
        attr: { style: 'font-weight:600;font-size:13px' },
      });
      existingDiv.createEl('span', {
        text: item.matchedNote,
        attr: { style: 'font-size:13px' },
      });
      card.createEl('div', {
        text: item.matchedContent,
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      // 操作按钮
      const btnRow = card.createEl('div', {
        attr: { style: 'display:flex;gap:8px;justify-content:flex-end' },
      });

      const keepBtn = btnRow.createEl('button', {
        text: '保留新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      keepBtn.addEventListener('click', () => {
        this.vm.keepPendingNote(item.newNoteIndex);
        card.style.opacity = '0.5';
        keepBtn.setText('已保留');
        keepBtn.setAttribute('disabled', 'true');
        discardBtn.setAttribute('disabled', 'true');
        this.updateSelectionCount();
      });

      const discardBtn = btnRow.createEl('button', {
        text: '丢弃新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      discardBtn.addEventListener('click', () => {
        this.vm.discardPendingNote(item.newNoteIndex);
        card.style.opacity = '0.5';
        discardBtn.setText('已丢弃');
        discardBtn.setAttribute('disabled', 'true');
        keepBtn.setAttribute('disabled', 'true');
        this.updateSelectionCount();
      });
    }

    // 一键操作
    const quickActions = section.createEl('div', {
      attr: { style: 'display:flex;gap:8px;margin-top:8px' },
    });
    const keepAllBtn = quickActions.createEl('button', {
      text: '全部保留',
      attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
    });
    keepAllBtn.addEventListener('click', () => {
      this.vm.keepAllPending();
      this.renderPendingDuplicates(container);
      this.updateSelectionCount();
    });

    const discardAllBtn = quickActions.createEl('button', {
      text: '全部丢弃',
      attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
    });
    discardAllBtn.addEventListener('click', () => {
      this.vm.discardAllPending();
      this.renderPendingDuplicates(container);
      this.updateSelectionCount();
    });
  }

  private renderVerificationSummary(container: HTMLElement) {
    const summary = this.vm.result.verificationSummary;
    if (!summary) return;

    const el = container.createEl('div');
    el.createEl('div', { text: '内容核查', cls: 'atomic-notes-section-header' });

    const total = summary.traced + summary.needsCompare + summary.outOfScope;
    if (total === 0) {
      el.createEl('p', { text: '🔍 无可验证内容', attr: { style: 'color:var(--text-muted)' } });
      return;
    }

    const row = el.createEl('div', { attr: { style: 'display:flex;gap:12px;align-items:center' } });
    row.createEl('span', {
      text: `已溯源 ${summary.traced}`,
      cls: 'atomic-notes-verify-chip verified',
    });
    row.createEl('span', {
      text: `需对比 ${summary.needsCompare}`,
      cls: 'atomic-notes-verify-chip doubtful',
    });
    row.createEl('span', {
      text: `超源 ${summary.outOfScope}`,
      cls: 'atomic-notes-verify-chip unverified',
    });
  }

  /** 3.1 复查评分结果展示（默认折叠） */
  private renderReviewSummary(container: HTMLElement) {
    const details = this.vm.result.reviewDetails;
    if (!details || details.length === 0) return;

    const section = container.createEl('div');

    // 统计概览
    const stats = this.vm.reviewStats!;
    const kept = details.filter((d) => d.verdict === '保留');
    const discarded = details.filter((d) => d.verdict === '丢弃');

    // 折叠头部（始终可见）
    const header = section.createEl('div', {
      attr: {
        style:
          'display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none;border-top:1px solid var(--background-modifier-border)',
      },
    });
    const arrow = header.createEl('span', {
      text: '▶',
      attr: { style: 'font-size:10px;transition:transform 0.2s;display:inline-block' },
    });
    header.createEl('span', {
      text: '复查评分',
      attr: { style: 'font-weight:600;font-size:13px' },
    });
    header.createEl('span', {
      text: `均分 ${stats.avgScore.toFixed(1)} · 合格 ${kept.length}${discarded.length > 0 ? ` · 不合 ${discarded.length}` : ''}`,
      attr: { style: 'font-size:12px;color:var(--text-muted)' },
    });
    const hintEl = header.createEl('span', {
      text: '点击展开',
      attr: { style: 'font-size:11px;color:var(--text-muted);margin-left:auto' },
    });

    // 折叠内容
    const body = section.createEl('div', {
      attr: {
        style:
          'display:none;border-left:3px solid var(--background-modifier-border);padding-left:12px;margin-top:8px',
      },
    });

    let isOpen = false;
    header.addEventListener('click', () => {
      isOpen = !isOpen;
      body.style.display = isOpen ? 'block' : 'none';
      arrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      hintEl.textContent = isOpen ? '点击收起' : '点击展开';
    });

    // 评分概要（展开后可见）
    const summaryRow = body.createEl('div', {
      attr: { style: 'display:flex;gap:12px;margin-bottom:8px;font-size:13px' },
    });
    summaryRow.createEl('span', {
      text: `均分 ${stats.avgScore.toFixed(1)}`,
      attr: { style: 'color:var(--text-accent);font-weight:600' },
    });
    summaryRow.createEl('span', {
      text: `合格 ${kept.length}`,
      attr: { style: 'color:var(--color-green)' },
    });
    if (discarded.length > 0) {
      summaryRow.createEl('span', {
        text: `不合 ${discarded.length}`,
        attr: { style: 'color:var(--color-red)' },
      });
    }

    // 逐条评分（紧凑表格）
    const table = body.createEl('table', {
      attr: { style: 'width:100%;font-size:12px;border-collapse:collapse;margin-top:4px' },
    });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    for (const h of ['#', '标题', '洞见', '知识', '总分', '等级', '判定']) {
      headerRow.createEl('th', {
        text: h,
        attr: {
          style:
            'text-align:left;padding:4px 6px;border-bottom:1px solid var(--background-modifier-border);color:var(--text-muted);font-weight:600',
        },
      });
    }

    const tbody = table.createEl('tbody');
    for (const d of details) {
      const note = d.title
        ? this.vm.result.notes.find((n) => n.title === d.title)
        : this.vm.result.notes[d.index];
      const isDiscard = d.verdict === '丢弃';
      const tr = tbody.createEl('tr', {
        attr: { style: isDiscard ? 'opacity:0.5' : '' },
      });
      tr.createEl('td', { text: String(d.index + 1), attr: { style: 'padding:3px 6px' } });
      tr.createEl('td', {
        text: note?.title ?? '(未知)',
        attr: {
          style:
            'padding:3px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
        },
      });
      tr.createEl('td', {
        text: String(d.insightScore),
        attr: { style: 'padding:3px 6px;text-align:center' },
      });
      tr.createEl('td', {
        text: String(d.knowledgeScore),
        attr: { style: 'padding:3px 6px;text-align:center' },
      });
      const grade = scoreGrade(d.finalScore);
      tr.createEl('td', {
        text: String(d.finalScore),
        attr: { style: `padding:3px 6px;text-align:center;font-weight:600;color:${grade.color}` },
      });
      tr.createEl('td', {
        text: grade.label,
        attr: { style: `padding:3px 6px;text-align:center;font-weight:600;color:${grade.color}` },
      });
      tr.createEl('td', {
        text: d.verdict,
        attr: {
          style: `padding:3px 6px;color:${isDiscard ? 'var(--color-red)' : 'var(--color-green)'}`,
        },
      });
    }
  }

  /** 卡片式笔记列表 */
  private renderNotes(container: HTMLElement) {
    const notesEl = container.createEl('div');
    this.notesListEl = notesEl;

    const headerEl = notesEl.createEl('div', {
      attr: {
        style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px',
      },
    });
    headerEl.createEl('h3', {
      text: `提炼结果（${this.vm.result.notes.length} 条）`,
      attr: { style: 'margin:0' },
    });

    // 全选/取消全选
    this._toggleBtn = headerEl.createEl('button', {
      text: '取消全选',
      attr: { style: 'font-size:11px;padding:2px 8px;cursor:pointer' },
    });
    this._toggleBtn.addEventListener('click', () => {
      this.vm.toggleAll();
      this.updateSelectionCount();
    });

    // ── 筛选栏 + 搜索框 ──
    const toolbar = notesEl.createEl('div', {
      attr: { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap' },
    });

    // 筛选按钮组
    const filterGroup = toolbar.createEl('div', {
      attr: { style: 'display:flex;gap:4px' },
    });

    const filterBtns: { mode: FilterMode; label: string }[] = [
      { mode: 'all', label: '全部' },
      { mode: 'issues', label: '有问题' },
      { mode: 'traced', label: '已溯源' },
    ];

    const filterBtnEls: Record<string, HTMLButtonElement> = {};

    for (const { mode, label } of filterBtns) {
      const counts = this.vm.filterCounts;
      const count = counts[mode];

      const btn = filterGroup.createEl('button', {
        text: `${label}${count > 0 ? ` (${count})` : ''}`,
        attr: {
          style: `font-size:11px;padding:3px 10px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:${this.vm.filterMode === mode ? 'var(--interactive-accent)' : 'var(--background-secondary)'};color:${this.vm.filterMode === mode ? 'var(--text-on-accent)' : 'var(--text-muted)'}`,
        },
      });
      btn.addEventListener('click', () => {
        this.vm.setFilterMode(mode);
        // 更新筛选按钮样式
        for (const [m, b] of Object.entries(filterBtnEls)) {
          const isActive = m === mode;
          b.style.background = isActive
            ? 'var(--interactive-accent)'
            : 'var(--background-secondary)';
          b.style.color = isActive ? 'var(--text-on-accent)' : 'var(--text-muted)';
        }
        this.refreshFilteredNotes();
      });
      filterBtnEls[mode] = btn;
    }

    // 搜索框
    const searchInput = toolbar.createEl('input', {
      attr: {
        type: 'text',
        placeholder: '搜索标题或内容...',
        style:
          'flex:1;min-width:120px;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary)',
      },
    }) as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      this.vm.setSearchQuery(searchInput.value.trim());
      this.refreshFilteredNotes();
    });

    // 渲染笔记卡片容器
    this.cardsContainerEl = notesEl.createEl('div', { cls: 'atomic-notes-cards-container' });
    this.renderNoteCardsInto(this.cardsContainerEl);
  }

  /** 渲染笔记卡片到指定容器（受筛选和搜索控制） */
  private renderNoteCardsInto(container: HTMLElement) {
    // 计算可见索引
    const visibleIndices: number[] = [];
    for (let i = 0; i < this.vm.result.notes.length; i++) {
      if (this.vm.noteMatchesFilter(i) && this.vm.noteMatchesSearch(i)) {
        visibleIndices.push(i);
      }
    }

    // 无结果提示
    if (visibleIndices.length === 0) {
      container.createEl('div', {
        text: '📭 没有匹配的笔记',
        attr: { style: 'color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center' },
      });
      return;
    }

    for (const i of visibleIndices) {
      const note = this.vm.result.notes[i];
      const card = container.createEl('div', { cls: 'atomic-notes-card' });

      // ── 标题行：复选框 + 标题 + 核查徽标 ──
      const headerRow = card.createEl('div', { cls: 'atomic-notes-card-header' });

      const checkbox = headerRow.createEl('input', {
        attr: { type: 'checkbox', 'data-note-index': String(i) },
      }) as HTMLInputElement;
      checkbox.checked = this.vm.selectedNotes.has(i);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.vm.selectedNotes.add(i);
        else this.vm.selectedNotes.delete(i);
        this.updateSelectionCount();
      });

      headerRow.createEl('span', {
        cls: 'atomic-notes-card-title',
        text: `${i + 1}. ${note.title}`,
      });

      // 核查状态 chip（组合显示所有非零计数）
      if (note.verification && note.verification.length > 0) {
        const traced = note.tracedCount ?? 0;
        const needsCompare = note.needsCompareCount ?? 0;
        const outOfScope = note.outOfScopeCount ?? 0;
        const chipGroup = headerRow.createEl('span', {
          attr: { style: 'display:inline-flex;gap:4px;margin-left:auto' },
        });
        if (traced > 0) {
          chipGroup.createEl('span', {
            cls: 'atomic-notes-verify-chip verified',
            text: `溯源${traced}`,
          });
        }
        if (needsCompare > 0) {
          chipGroup.createEl('span', {
            cls: 'atomic-notes-verify-chip doubtful',
            text: `对比${needsCompare}`,
          });
        }
        if (outOfScope > 0) {
          chipGroup.createEl('span', {
            cls: 'atomic-notes-verify-chip unverified',
            text: `超源${outOfScope}`,
          });
        }
      }

      // ── 预览（可展开） ──
      let isLong = note.content.length > 200;
      let previewText = isLong ? note.content.slice(0, 200) + '...' : note.content;
      const previewEl = card.createEl('div', {
        cls: 'atomic-notes-card-preview',
        text: previewText,
      });
      let expandHint: HTMLElement | null = null;
      if (isLong) {
        previewEl.setAttr('title', '点击展开/收起全文');
        previewEl.style.cursor = 'pointer';
        expandHint = card.createEl('span', {
          text: '展开全文 ▼',
          attr: { style: 'font-size:10px;color:var(--text-faint);cursor:pointer;user-select:none' },
        });
        let expanded = false;
        const toggleExpand = () => {
          expanded = !expanded;
          previewEl.setText(expanded ? note.content : previewText);
          if (expandHint) expandHint.setText(expanded ? '收起 ▲' : '展开全文 ▼');
        };
        previewEl.addEventListener('click', toggleExpand);
        expandHint.addEventListener('click', toggleExpand);
      }

      // ── 核查详情（可折叠） ──
      if (note.verification && note.verification.length > 0) {
        const verifySection = card.createEl('div', {
          attr: { style: 'margin-top:6px' },
        });

        const verifyHeader = verifySection.createEl('div', {
          attr: {
            style:
              'display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:2px 0',
          },
        });
        const verifyArrow = verifyHeader.createEl('span', {
          text: '▸',
          attr: {
            style:
              'font-size:10px;transition:transform 0.2s;display:inline-block;color:var(--text-muted)',
          },
        });
        verifyHeader.createEl('span', {
          text: '核查详情',
          attr: { style: 'font-size:11px;color:var(--text-accent);font-weight:600' },
        });

        const verifyBody = verifySection.createEl('div', {
          attr: {
            style:
              'display:none;margin-top:6px;border-left:2px solid var(--background-modifier-border);padding-left:10px',
          },
        });

        let verifyOpen = false;
        verifyHeader.addEventListener('click', () => {
          verifyOpen = !verifyOpen;
          verifyBody.style.display = verifyOpen ? 'block' : 'none';
          verifyArrow.style.transform = verifyOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        const statusColorMap: Record<string, string> = {
          已溯源: 'var(--color-green)',
          需对比: 'var(--color-orange)',
          超源: 'var(--color-red)',
        };

        for (const item of note.verification) {
          const row = verifyBody.createEl('div', {
            attr: { style: 'margin-bottom:8px' },
          });

          // 状态 + 声明
          const claimRow = row.createEl('div', {
            attr: { style: 'display:flex;align-items:flex-start;gap:6px' },
          });
          claimRow.createEl('span', {
            text: item.status,
            attr: {
              style: `font-size:9px;padding:1px 6px;border-radius:8px;color:#fff;background:${statusColorMap[item.status] || 'var(--text-faint)'};white-space:nowrap;flex-shrink:0;margin-top:1px`,
            },
          });
          claimRow.createEl('span', {
            text: item.claim,
            attr: { style: 'font-size:11px;color:var(--text-normal);line-height:1.4' },
          });

          // 原文对应句子
          if (item.sourceText) {
            row.createEl('div', {
              text: `📖 ${item.sourceText}`,
              attr: {
                style:
                  'font-size:10px;color:var(--text-muted);margin-top:3px;padding:4px 6px;background:var(--background-secondary);border-radius:4px;line-height:1.4',
              },
            });
          }

          // 差异说明
          if (item.diffNote) {
            row.createEl('div', {
              text: `⚠ ${item.diffNote}`,
              attr: { style: 'font-size:10px;color:var(--color-orange);margin-top:2px' },
            });
          }

          // 补充说明
          if (item.reason && !item.sourceText) {
            row.createEl('div', {
              text: item.reason,
              attr: {
                style: 'font-size:10px;color:var(--text-faint);margin-top:2px;font-style:italic',
              },
            });
          }
        }
      }

      // ── 标签 chip / 综合判断标记 ──
      if (note.tags && note.tags.length > 0) {
        const footer = card.createEl('div', { cls: 'atomic-notes-card-footer' });
        for (const tag of note.tags) {
          footer.createEl('span', { cls: 'atomic-notes-tag-chip', text: tag });
        }
      } else {
        // 无标签笔记 → 综合判断型，颜色由核查结果决定
        const footer = card.createEl('div', { cls: 'atomic-notes-card-footer' });
        const { label: synthLabel, color: synthColor } = this.vm.noteSynthLabel(i);
        footer.createEl('span', {
          text: synthLabel,
          attr: {
            style: `font-size:10px;padding:2px 8px;border-radius:10px;color:#fff;background:${synthColor};font-style:italic`,
          },
        });
      }

      // ── 编辑按钮 ──
      const editSection = card.createEl('div', { attr: { style: 'margin-top:8px' } });
      const editBtn = editSection.createEl('button', {
        text: '✎ 编辑',
        attr: {
          style:
            'font-size:11px;padding:2px 10px;cursor:pointer;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;color:var(--text-muted)',
        },
      });
      const editPanel = editSection.createEl('div', {
        cls: 'atomic-notes-edit-panel',
        attr: { style: 'display:none;margin-top:8px' },
      });

      let isEditing = false;
      editBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        if (isEditing) {
          editPanel.empty();
          editPanel.createEl('label', {
            text: '标题',
            attr: {
              style: 'font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px',
            },
          });
          const titleInput = editPanel.createEl('input', {
            attr: {
              type: 'text',
              value: note.title,
              style:
                'width:100%;font-size:13px;padding:4px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;margin-bottom:8px;box-sizing:border-box',
            },
          }) as HTMLInputElement;
          editPanel.createEl('label', {
            text: '内容',
            attr: {
              style: 'font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px',
            },
          });
          const contentInput = editPanel.createEl('textarea', {
            text: note.content,
            attr: {
              style:
                'width:100%;min-height:100px;font-size:12px;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;margin-bottom:8px;box-sizing:border-box;resize:vertical;font-family:var(--font-text)',
            },
          }) as HTMLTextAreaElement;
          const applyBtn = editPanel.createEl('button', {
            text: '✓ 应用修改',
            cls: 'atomic-notes-apply-edit-btn',
            attr: {
              style:
                'float:right;font-size:12px;padding:4px 10px;cursor:pointer;background:var(--text-error);color:#fff;border:1px solid var(--text-error);border-radius:4px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.15)',
            },
          });
          // 确保按钮所在容器清除浮动，避免后续元素被挤上来
          const clearfix = editPanel.createEl('div', {
            attr: { style: 'clear:both' },
          });
          applyBtn.addEventListener('click', () => {
            const newTitle = titleInput.value.trim() || note.title;
            const newContent = contentInput.value.trim() || note.content;
            this.vm.editNote(i, newTitle, newContent);
            isEditing = false;
            editPanel.style.display = 'none';
            editBtn.setText('✎ 编辑');
            // 更新标题显示
            const titleEl = card.querySelector('.atomic-notes-card-title') as HTMLElement;
            if (titleEl) titleEl.setText(`${i + 1}. ${note.title}`);
            // 更新预览（重新计算展开/收起相关状态）
            isLong = note.content.length > 200;
            previewText = isLong ? note.content.slice(0, 200) + '...' : note.content;
            previewEl.setText(previewText);
            if (isLong) {
              previewEl.setAttr('title', '点击展开/收起全文');
              previewEl.style.cursor = 'pointer';
              if (!expandHint) {
                expandHint = card.createEl('span', {
                  text: '展开全文 ▼',
                  attr: { style: 'font-size:10px;color:var(--text-faint);cursor:pointer;user-select:none' },
                });
                let expanded = false;
                const toggleExpand = () => {
                  expanded = !expanded;
                  previewEl.setText(expanded ? note.content : previewText);
                  if (expandHint) expandHint.setText(expanded ? '收起 ▲' : '展开全文 ▼');
                };
                previewEl.addEventListener('click', toggleExpand);
                expandHint.addEventListener('click', toggleExpand);
              } else {
                expandHint.setText('展开全文 ▼');
              }
            } else if (expandHint) {
              previewEl.removeAttr('title');
              previewEl.style.cursor = '';
              expandHint.remove();
              expandHint = null;
            }
          });
          editPanel.style.display = 'block';
          editBtn.setText('✎ 收起编辑');
        } else {
          editPanel.style.display = 'none';
          editBtn.setText('✎ 编辑');
        }
      });
    }
  }

  private renderActions(container: HTMLElement) {
    if (!this.vm.result.success || this.vm.result.notes.length === 0) {
      // 仅有关闭按钮
      new Setting(container).addButton((btn) =>
        btn.setButtonText('关闭').onClick(() => this.close()),
      );
      return;
    }

    // 选中数量
    this.countEl = container.createEl('p', {
      text: `已选 ${this.vm.selectedNotes.size} / ${this.vm.result.notes.length} 条`,
      attr: { style: 'font-size:12px;color:var(--text-muted);margin:8px 0' },
    });

    // 按钮栏
    const bar = container.createEl('div', { cls: 'atomic-notes-action-bar' });
    bar
      .createEl('button', { text: '保存选中笔记', cls: 'mod-cta' })
      .addEventListener('click', async () => {
        // 自动应用所有未提交的编辑，避免用户只编辑未点「应用修改」就保存
        const openPanels = this.notesListEl.querySelectorAll('.atomic-notes-edit-panel');
        for (const panel of openPanels) {
          const panelEl = panel as HTMLElement;
          if (panelEl.style.display !== 'none') {
            const applyBtn = panelEl.querySelector('.atomic-notes-apply-edit-btn') as HTMLElement;
            if (applyBtn) applyBtn.click();
          }
        }

        const selected = this.vm.getSelectedNotes();
        if (selected.length === 0) return;
        await this.onSave(selected);
        this.close();
      });
    bar.createEl('button', { text: '关闭' }).addEventListener('click', () => {
      if (this.vm.selectedNotes.size > 0) {
        if (!confirm(`还有 ${this.vm.selectedNotes.size} 条笔记未保存，确定关闭？`)) return;
      }
      this.close();
    });
  }

  private updateSelectionCount() {
    if (this.countEl) {
      this.countEl.setText(`已选 ${this.vm.selectedNotes.size} / ${this.vm.result.notes.length} 条`);
    }
    // 同步所有 checkbox 的勾选状态
    const checkboxes = this.notesListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    for (const cb of checkboxes) {
      const idx = parseInt(cb.dataset.noteIndex || '', 10);
      cb.checked = this.vm.selectedNotes.has(idx);
    }
    this.updateToggleBtn();
  }

  /** 同步全选/取消全选按钮文案 */
  private updateToggleBtn() {
    if (!this._toggleBtn) return;
    this._toggleBtn.setText(
      this.vm.selectedNotes.size === this.vm.result.notes.length ? '取消全选' : '全选',
    );
  }

  onClose() {
    this.vm.dispose();

    const { contentEl } = this;
    contentEl.empty();
  }
}
