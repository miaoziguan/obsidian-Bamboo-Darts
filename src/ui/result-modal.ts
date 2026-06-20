/**
 * 结果展示模态框
 * 展示提炼结果、步骤时间线、去重报告、存储结果
 */

import { Modal, App, Setting } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult, PendingDuplicate } from '../extractor';
import { PROFILE_LABELS, ContentProfile } from '../extraction/profiles';
import { DedupResult, DuplicateInfo } from '../deduplicator';

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
  private result: ExtractionResult;
  private dedupResult?: DedupResult;
  private onSave: (notes: AtomicNote[]) => Promise<void>;
  private selectedNotes: Set<number> = new Set();
  private countEl: HTMLElement | null = null;
  /** 用户确认保留的疑似重复索引 */
  private confirmedPending: Set<number> = new Set();
  /** 用户从去重详情中恢复的批内重复索引 */
  private restoredCrossBatch: Set<number> = new Set();

  constructor(
    app: App,
    result: ExtractionResult,
    dedupResult?: DedupResult,
    onSave?: (notes: AtomicNote[]) => Promise<void>
  ) {
    super(app);
    this.result = result;
    this.dedupResult = dedupResult;
    this.onSave = onSave || (async () => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '原子笔记提炼结果' });

    // 显示检测到的策略徽标
    if (this.result.detectedProfile) {
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
      const profileName = PROFILE_LABELS[this.result.detectedProfile] || this.result.detectedProfile;
      const sourceLabel = this.result.profileSource === 'auto' ? '自动检测' : '手动指定';
      badge.textContent = `策略: ${profileName} (${sourceLabel})`;
    }

    this.renderSteps(contentEl);

    if (this.result.success && this.result.notes) {
      this.selectedNotes = new Set(this.result.notes.map((_, i) => i));

      if (this.dedupResult) {
        this.renderDedupReport(contentEl);
      }

      if (this.result.crossBatchDuplicates && this.result.crossBatchDuplicates.length > 0) {
        this.renderCrossBatchDetails(contentEl);
      }

      if (this.result.vaultDedupPending && this.result.vaultDedupPending.length > 0) {
        this.renderPendingDuplicates(contentEl);
      }

      if (this.result.verificationSummary) {
        this.renderVerificationSummary(contentEl);
      }

      this.renderNotes(contentEl);
    } else {
      const errEl = contentEl.createEl('p', { cls: 'atomic-notes-error' });
      errEl.createEl('strong', { text: '提炼失败：' });
      if (this.result.error?.includes('[诊断]')) {
        const pre = errEl.createEl('pre', { cls: 'atomic-notes-diag', text: this.result.error });
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
        errEl.appendText(this.result.error || '');
      }
    }

    // 操作按钮
    this.renderActions(contentEl);
  }

  /** 时间线样式步骤展示 */
  private renderSteps(container: HTMLElement) {
    container.createEl('div', { text: '处理流程', cls: 'atomic-notes-section-header' });

    const timeline = container.createEl('div', { cls: 'atomic-notes-timeline' });

    for (const step of this.result.steps) {
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

  private renderDedupReport(container: HTMLElement) {
    if (!this.dedupResult) return;

    const reportEl = container.createEl('div', { cls: 'atomic-notes-dedup-report' });
    reportEl.createEl('div', { text: '去重报告', cls: 'atomic-notes-section-header' });

    if (this.dedupResult.duplicates.length === 0) {
      reportEl.createEl('p', {
        text: '未检测到与知识库重复的笔记',
        attr: { style: 'color:var(--text-muted)' },
      });
    } else {
      reportEl.createEl('p', {
        text: `检测到 ${this.dedupResult.duplicates.length} 条可能重复的笔记：`,
      });
      const dupList = reportEl.createEl('ul');
      for (const dup of this.dedupResult.duplicates) {
        dupList.createEl('li').setText(
          `相似度：${(dup.similarity * 100).toFixed(1)}% | 匹配：${dup.matchedNote || '未知'}`
        );
      }
    }

    reportEl.createEl('p', {
      text: `最终保存 ${this.dedupResult.uniqueNotes.length} 条笔记`,
      attr: { style: 'font-weight:600;color:var(--text-accent)' },
    });
  }

  /** 批内去重详情（可折叠，支持手动恢复） */
  private renderCrossBatchDetails(container: HTMLElement) {
    const dups = this.result.crossBatchDuplicates;
    if (!dups || dups.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-cross-dedup' });

    // 折叠头部
    const header = section.createEl('div', {
      attr: {
        style: 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none',
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
      attr: { style: 'display:none;border-left:3px solid var(--background-modifier-border);padding-left:12px;margin-top:8px' },
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
          style: 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--background-secondary)',
        },
      });

      // 相似度
      const simPercent = (dup.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        attr: { style: 'font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:4px' },
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
      const removedPreview = dup.removedContent.slice(0, 120) + (dup.removedContent.length > 120 ? '...' : '');
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
      if (this.restoredCrossBatch.has(i)) {
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
          this.restoreCrossBatchNote(dup, i);
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
  private restoreCrossBatchNote(dup: DuplicateInfo, index: number) {
    if (!this.result.notes) return;
    const note: AtomicNote = {
      title: dup.removedTitle,
      content: dup.removedContent,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    const newIdx = this.result.notes.length;
    this.result.notes.push(note);
    this.selectedNotes.add(newIdx);
    this.restoredCrossBatch.add(index);
    this.updateSelectionCount();

    // 更新笔记列表区域
    this.refreshNotesList();
  }

  /** 刷新笔记卡片列表（用于恢复/变更后重新渲染） */
  private notesListEl: HTMLElement | null = null;
  private refreshNotesList() {
    if (!this.notesListEl) return;
    const parent = this.notesListEl.parentElement;
    if (!parent) return;
    this.notesListEl.detach();
    this.renderNotes(parent);
  }

  /** 疑似重复确认 UI（中相似度 60-80%） */
  private renderPendingDuplicates(container: HTMLElement) {
    const pending = this.result.vaultDedupPending;
    if (!pending || pending.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-pending-dedup' });
    section.createEl('div', { text: '⚠️ 疑似重复笔记（需确认）', cls: 'atomic-notes-section-header' });

    section.createEl('p', {
      text: `发现 ${pending.length} 条笔记与知识库已有笔记相似度较高（60%-80%），请逐一确认是否保留：`,
      attr: { style: 'color:var(--text-muted);font-size:13px' },
    });

    for (const item of pending) {
      const card = section.createEl('div', {
        attr: {
          style: 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--background-secondary)',
        },
      });

      // 相似度提示
      const simPercent = (item.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        attr: { style: 'font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:6px' },
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
      const newPreview = item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? '...' : '');
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
        this.confirmedPending.add(item.newNoteIndex);
        card.style.opacity = '0.5';
        keepBtn.setText('已保留');
        keepBtn.setAttribute('disabled', 'true');
        discardBtn.setAttribute('disabled', 'true');
      });

      const discardBtn = btnRow.createEl('button', {
        text: '丢弃新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      discardBtn.addEventListener('click', () => {
        this.confirmedPending.delete(item.newNoteIndex);
        this.selectedNotes.delete(item.newNoteIndex);
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
      for (const item of pending) {
        this.confirmedPending.add(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
    });

    const discardAllBtn = quickActions.createEl('button', {
      text: '全部丢弃',
      attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
    });
    discardAllBtn.addEventListener('click', () => {
      for (const item of pending) {
        this.selectedNotes.delete(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
      this.updateSelectionCount();
    });
  }

  private renderVerificationSummary(container: HTMLElement) {
    const summary = this.result.verificationSummary;
    if (!summary) return;

    const el = container.createEl('div');
    el.createEl('div', { text: '内容核查', cls: 'atomic-notes-section-header' });

    const total = summary.traced + summary.needsCompare + summary.outOfScope;
    if (total === 0) {
      el.createEl('p', { text: '无可验证内容', attr: { style: 'color:var(--text-muted)' } });
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

  /** 卡片式笔记列表 */
  private renderNotes(container: HTMLElement) {
    const notesEl = container.createEl('div');
    this.notesListEl = notesEl;
    const headerEl = notesEl.createEl('div', {
      attr: { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
    });
    headerEl.createEl('h3', {
      text: `提炼结果（${this.result.notes.length} 条）`,
      attr: { style: 'margin:0' },
    });

    // 全选/取消全选
    const toggleBtn = headerEl.createEl('button', {
      text: '取消全选',
      attr: { style: 'font-size:11px;padding:2px 8px;cursor:pointer' },
    });
    toggleBtn.addEventListener('click', () => {
      if (this.selectedNotes.size === this.result.notes.length) {
        this.selectedNotes.clear();
        toggleBtn.setText('全选');
      } else {
        this.selectedNotes = new Set(this.result.notes.map((_, i) => i));
        toggleBtn.setText('取消全选');
      }
      this.updateSelectionCount();
    });

    for (let i = 0; i < this.result.notes.length; i++) {
      const note = this.result.notes[i];
      const card = notesEl.createEl('div', { cls: 'atomic-notes-card' });

      // ── 标题行：复选框 + 标题 + 核查徽标 ──
      const headerRow = card.createEl('div', { cls: 'atomic-notes-card-header' });

      const checkbox = headerRow.createEl('input', {
        attr: { type: 'checkbox' },
      }) as HTMLInputElement;
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selectedNotes.add(i);
        else this.selectedNotes.delete(i);
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
          chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip verified', text: `溯源${traced}` });
        }
        if (needsCompare > 0) {
          chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip doubtful', text: `对比${needsCompare}` });
        }
        if (outOfScope > 0) {
          chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip unverified', text: `超源${outOfScope}` });
        }
      }

      // ── 预览 ──
      const preview = note.content.slice(0, 200) + (note.content.length > 200 ? '...' : '');
      card.createEl('div', { cls: 'atomic-notes-card-preview', text: preview });

      // ── 核查详情（可折叠） ──
      if (note.verification && note.verification.length > 0) {
        const verifySection = card.createEl('div', {
          attr: { style: 'margin-top:6px' },
        });

        const verifyHeader = verifySection.createEl('div', {
          attr: {
            style: 'display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:2px 0',
          },
        });
        const verifyArrow = verifyHeader.createEl('span', {
          text: '▸',
          attr: { style: 'font-size:10px;transition:transform 0.2s;display:inline-block;color:var(--text-muted)' },
        });
        verifyHeader.createEl('span', {
          text: '核查详情',
          attr: { style: 'font-size:11px;color:var(--text-muted);font-weight:500' },
        });

        const verifyBody = verifySection.createEl('div', {
          attr: { style: 'display:none;margin-top:6px;border-left:2px solid var(--background-modifier-border);padding-left:10px' },
        });

        let verifyOpen = false;
        verifyHeader.addEventListener('click', () => {
          verifyOpen = !verifyOpen;
          verifyBody.style.display = verifyOpen ? 'block' : 'none';
          verifyArrow.style.transform = verifyOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        const statusColorMap: Record<string, string> = {
          '已溯源': 'var(--color-green)',
          '需对比': 'var(--color-orange)',
          '超源': 'var(--color-red)',
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
              attr: { style: 'font-size:10px;color:var(--text-muted);margin-top:3px;padding:4px 6px;background:var(--background-secondary);border-radius:4px;line-height:1.4' },
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
              attr: { style: 'font-size:10px;color:var(--text-faint);margin-top:2px;font-style:italic' },
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
        let synthColor = 'var(--text-faint)';   // 默认：无核查数据
        let synthLabel = '综合判断';
        const outOfScope = note.outOfScopeCount ?? 0;
        const needsCompare = note.needsCompareCount ?? 0;
        const traced = note.tracedCount ?? 0;
        if (outOfScope > 0) {
          synthColor = 'var(--color-red)';
          synthLabel = '综合判断 · 超源';
        } else if (needsCompare > 0) {
          synthColor = 'var(--color-orange)';
          synthLabel = '综合判断 · 需对比';
        } else if (traced > 0) {
          synthColor = 'var(--color-green)';
          synthLabel = '综合判断 · 已溯源';
        }
        footer.createEl('span', {
          text: synthLabel,
          attr: {
            style: `font-size:10px;padding:2px 8px;border-radius:10px;color:#fff;background:${synthColor};font-style:italic`,
          },
        });
      }
    }
  }

  private renderActions(container: HTMLElement) {
    if (!this.result.success || this.result.notes.length === 0) {
      // 仅有关闭按钮
      new Setting(container).addButton(btn =>
        btn.setButtonText('关闭').onClick(() => this.close())
      );
      return;
    }

    // 选中数量
    this.countEl = container.createEl('p', {
      text: `已选 ${this.selectedNotes.size} / ${this.result.notes.length} 条`,
      attr: { style: 'font-size:12px;color:var(--text-muted);margin:8px 0' },
    });

    // 按钮栏
    const bar = container.createEl('div', { cls: 'atomic-notes-action-bar' });
    bar.createEl('button', { text: '保存选中笔记', cls: 'mod-cta' })
      .addEventListener('click', async () => {
        const selected = this.result.notes.filter((_, i) => this.selectedNotes.has(i));
        if (selected.length === 0) return;
        await this.onSave(selected);
        this.close();
      });
    bar.createEl('button', { text: '关闭' })
      .addEventListener('click', () => this.close());
  }

  private updateSelectionCount() {
    if (this.countEl) {
      this.countEl.setText(`已选 ${this.selectedNotes.size} / ${this.result.notes.length} 条`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
