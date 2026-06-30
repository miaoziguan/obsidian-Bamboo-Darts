/**
 * 结果报告渲染器
 *
 * 负责渲染提炼结果中的步骤时间线、门控警告、去重报告、
 * 批内去重详情、疑似重复确认、核查摘要和复查评分。
 * 从 ResultModal 中拆分出来，减少单文件复杂度。
 */

import { scoreGrade } from '../../review/note-reviewer';
import { ResultViewModel } from '../result-view-model';

/** 步骤状态对应的颜色和图标 */
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

/**
 * 渲染提炼流程时间线
 */
export function renderSteps(vm: ResultViewModel, container: HTMLElement): void {
  container.createEl('div', { text: '处理流程', cls: 'atomic-notes-section-header' });

  const timeline = container.createEl('div', { cls: 'atomic-notes-timeline' });

  for (const step of vm.result.steps) {
    const item = timeline.createEl('div', { cls: 'atomic-notes-timeline-item' });

    const dot = item.createEl('div', { cls: 'atomic-notes-timeline-dot' });
    dot.style.background = STEP_COLORS[step.status] || 'var(--text-faint)';
    dot.setText(STEP_ICONS[step.status] || '?');

    item.createEl('div', { cls: 'atomic-notes-timeline-step', text: step.step });
    item.createEl('div', { cls: 'atomic-notes-timeline-message', text: step.message });
  }
}

/**
 * 渲染门控警告栏
 */
export function renderGateWarnings(vm: ResultViewModel, container: HTMLElement): void {
  const warnings = vm.result.gateWarnings;
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
    text: vm.result.forceExtracted
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

/**
 * 渲染去重报告
 */
export function renderDedupReport(vm: ResultViewModel, container: HTMLElement): void {
  if (!vm.dedupResult) return;

  const reportEl = container.createEl('div', { cls: 'atomic-notes-dedup-report' });
  reportEl.createEl('div', { text: '去重报告', cls: 'atomic-notes-section-header' });

  reportEl.createEl('p', {
    text: '去重分三层：批内去重（本次提炼内部的重复）→ 知识库去重（与已有笔记比对）→ 待确认（相似度在阈值区间，由你决定）',
    attr: { style: 'font-size:12px;color:var(--text-faint);margin-bottom:8px' },
  });

  if (vm.dedupResult.duplicates.length === 0) {
    reportEl.createEl('p', {
      text: '✅ 未检测到与知识库重复的笔记',
      attr: { style: 'color:var(--text-muted)' },
    });
  } else {
    reportEl.createEl('p', {
      text: `检测到 ${vm.dedupResult.duplicates.length} 条可能重复的笔记：`,
    });
    const dupList = reportEl.createEl('ul');
    for (const dup of vm.dedupResult.duplicates) {
      const sim = (dup.similarity * 100).toFixed(1);
      let detail = `相似度：${sim}%`;
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
    text: `最终保存 ${vm.dedupResult.uniqueNotes.length} 条笔记`,
    attr: { style: 'font-weight:600;color:var(--text-accent)' },
  });
}

/**
 * 渲染核查摘要
 */
export function renderVerificationSummary(vm: ResultViewModel, container: HTMLElement): void {
  const summary = vm.result.verificationSummary;
  if (!summary) return;

  const el = container.createEl('div');
  el.createEl('div', { text: '内容核查', cls: 'atomic-notes-section-header' });

  const total = summary.traced + summary.needsCompare + summary.outOfScope;
  if (total === 0) {
    el.createEl('p', { text: '🔍 无可验证内容', attr: { style: 'color:var(--text-muted)' } });
    return;
  }

  const row = el.createEl('div', { attr: { style: 'display:flex;gap:12px;align-items:center' } });
  row.createEl('span', { text: `已溯源 ${summary.traced}`, cls: 'atomic-notes-verify-chip verified' });
  row.createEl('span', { text: `需对比 ${summary.needsCompare}`, cls: 'atomic-notes-verify-chip doubtful' });
  row.createEl('span', { text: `超源 ${summary.outOfScope}`, cls: 'atomic-notes-verify-chip unverified' });
}

/**
 * 渲染复查评分摘要（可折叠表格）
 */
export function renderReviewSummary(vm: ResultViewModel, container: HTMLElement): void {
  const details = vm.result.reviewDetails;
  if (!details || details.length === 0) return;

  const section = container.createEl('div');

  const stats = vm.reviewStats!;
  const kept = details.filter((d) => d.verdict === '保留');
  const discarded = details.filter((d) => d.verdict === '丢弃');

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
  header.createEl('span', { text: '复查评分', attr: { style: 'font-weight:600;font-size:13px' } });
  header.createEl('span', {
    text: `均分 ${stats.avgScore.toFixed(1)} · 合格 ${kept.length}${discarded.length > 0 ? ` · 不合 ${discarded.length}` : ''}`,
    attr: { style: 'font-size:12px;color:var(--text-muted)' },
  });
  const hintEl = header.createEl('span', {
    text: '点击展开',
    attr: { style: 'font-size:11px;color:var(--text-muted);margin-left:auto' },
  });

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
      ? vm.result.notes.find((n) => n.title === d.title)
      : vm.result.notes[d.index];
    const isDiscard = d.verdict === '丢弃';
    const tr = tbody.createEl('tr', { attr: { style: isDiscard ? 'opacity:0.5' : '' } });
    tr.createEl('td', { text: String(d.index + 1), attr: { style: 'padding:3px 6px' } });
    tr.createEl('td', {
      text: note?.title ?? '(未知)',
      attr: { style: 'padding:3px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
    });
    tr.createEl('td', { text: String(d.insightScore), attr: { style: 'padding:3px 6px;text-align:center' } });
    tr.createEl('td', { text: String(d.knowledgeScore), attr: { style: 'padding:3px 6px;text-align:center' } });
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
      attr: { style: `padding:3px 6px;color:${isDiscard ? 'var(--color-red)' : 'var(--color-green)'}` },
    });
  }
}
