/**
 * AboutTab — 介绍面板
 * 纯展示，无状态，渲染插件设计理念、处理流程、算法说明等静态内容。
 */
import AtomicNotesPlugin from '../../main';
import {
  ABOUT_PHASES,
  ABOUT_PROGRESS,
  ABOUT_GATE_RULES,
  ABOUT_VERIFY_STATUS,
  ABOUT_SCORE_DIMS,
  ABOUT_DISCOVERY_FEATURES,
} from '../about-content';

export class AboutTab {
  private plugin: AtomicNotesPlugin;

  constructor(plugin: AtomicNotesPlugin) {
    this.plugin = plugin;
  }

  /** 渲染介绍面板到 el 容器 */
  render(el: HTMLElement): void {
    el.empty();
    el.addClass('atomic-notes-panel');

    // ── 竹叶飞刃设计理念 ──
    el.createEl('div', { text: '竹叶飞刃设计理念', cls: 'atomic-notes-about-section' });

    // ── 作者 ──
    el.createEl('div', { text: '羽鳞君', cls: 'atomic-notes-about-author' });
    el.createEl('p', {
      text: '喵字馆创始人 | 独立品牌设计师 | 赛博乐子人',
      cls: 'atomic-notes-about-text',
    });
    el.createEl('p', {
      text: '交流微信：yanhu94（备注：竹叶飞刃）',
      attr: { style: 'color:var(--text-faint);font-size:12px;margin:4px 0' },
    });
    el.createEl('hr', { cls: 'atomic-notes-about-divider' });

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
    for (const [phase, name, desc] of ABOUT_PHASES) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-phase-row' });
      row.createEl('span', { text: phase, cls: 'phase-tag' });
      row.createEl('span', { text: name, cls: 'phase-name' });
      row.createEl('span', { text: desc, cls: 'phase-desc' });
    }

    // ── 去重算法 ──
    el.createEl('div', { text: '去重算法', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: 'Phase 4 与 Phase 4b 采用 BM25 + 中文分词 + SimHash 三重组合算法：',
      cls: 'atomic-notes-about-text',
    });
    el.createEl('div', {
      text: '• 中文 jieba 风格 DAG 分词（~2800 高频词 + 领域词）+ 字符 n-gram 双轨提取 token',
      cls: 'atomic-notes-about-bullet',
    });
    el.createEl('div', {
      text: '• BM25 饱和词频替代线性 TF，高频术语权重自动打折，避免术语污染误判',
      cls: 'atomic-notes-about-bullet',
    });
    el.createEl('div', {
      text: '• 综合评分：内容余弦 0.5 + 关键词 Jaccard 0.3 + 标题 Jaccard 0.2，多信号制衡',
      cls: 'atomic-notes-about-bullet',
    });
    el.createEl('div', {
      text: '• 库内去重：SimHash 64 位指纹预过滤，汉明距离 < 3 才进入全量比对',
      cls: 'atomic-notes-about-bullet',
    });
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
    for (const [phase, detail] of ABOUT_PROGRESS) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', { text: phase, cls: 'detail-label' });
      row.createEl('span', { text: detail, cls: 'detail-desc' });
    }

    // ── URL 内容提取 ──
    el.createEl('div', { text: 'URL 内容提取', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '从网页链接读取内容时，插件先通过 DOMParser + querySelector 精确解析 HTML，再用 100+ 选择器剥离导航、页脚、侧栏、广告、评论区、推荐、社交分享、法律声明等非正文区域，最后清理标签、注释和实体编码，确保送到 AI 手中的是干净的文本正文。',
      cls: 'atomic-notes-about-text',
    });
    el.createEl('p', {
      text: '同一 URL 提取结果会缓存 1 小时，重复提炼无需重新请求和解析。',
      cls: 'atomic-notes-about-text',
    });

    // ── 质量门控 ──
    el.createEl('div', { text: '质量门控', cls: 'atomic-notes-about-section' });
    const gateHeader = el.createEl('div', { cls: 'atomic-notes-gate-table-header' });
    gateHeader.createEl('span', { text: '规则', cls: 'gate-col-rule' });
    gateHeader.createEl('span', { text: '硬阻断', cls: 'gate-col-block' });
    gateHeader.createEl('span', { text: '软警告', cls: 'gate-col-warn' });
    for (const [rule, block, warn] of ABOUT_GATE_RULES) {
      const row = el.createEl('div', { cls: 'atomic-notes-gate-row' });
      row.createEl('span', { text: rule, cls: 'gate-col-rule' });
      row.createEl('span', { text: block, cls: 'gate-col-block' });
      row.createEl('span', { text: warn, cls: 'gate-col-warn' });
    }
    el.createEl('p', {
      text: '硬阻断的规则命中后直接拒绝提交流程（可选强制提炼跳过）；软警告仅提醒用户，不影响继续提炼。累积 3 条警告自动升级为阻断。',
      cls: 'atomic-notes-about-text',
    });
    el.getElementsByClassName('atomic-notes-about-text')[
      el.getElementsByClassName('atomic-notes-about-text').length - 1
    ].setAttr('style', 'margin-top:8px');

    // ── 内容核查（三层管线）──
    el.createEl('div', { text: '内容核查（三层管线）', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '从每条笔记中提取事实声明（数字、百分比、日期、实体名称），通过三层管线逐条核查：',
      cls: 'atomic-notes-about-text',
    });
    el.createEl('div', {
      text: 'Layer 1 · 原文溯源：零 API 调用，在原文中精确或模糊匹配声明锚点',
      cls: 'atomic-notes-about-bullet',
    });
    el.createEl('div', {
      text: 'Layer 2 · 语义比对：单次 AI 调用，仅发送截断文本以节省 token',
      cls: 'atomic-notes-about-bullet',
    });
    el.createEl('div', {
      text: 'Layer 3 · 超源标记：零 API 调用，将超出原文范围的声明标记为"超源"',
      cls: 'atomic-notes-about-bullet',
    });
    for (const [status, desc] of ABOUT_VERIFY_STATUS) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', {
        text: status,
        cls: 'detail-label',
        attr: { style: 'min-width:56px;color:var(--text-accent)' },
      });
      row.createEl('span', { text: desc, cls: 'detail-desc' });
    }

    // ── 复查机制 ──
    el.createEl('div', { text: '复查机制', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '开启后 AI 从两个维度对每条笔记打分（各 1-5 分）：',
      cls: 'atomic-notes-about-text',
    });
    for (const [label, desc] of ABOUT_SCORE_DIMS) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', { text: label, cls: 'detail-label' });
      row.createEl('span', { text: desc, cls: 'detail-desc' });
    }
    el.createEl('p', {
      text: '总分 = 洞见 + 知识（2-10）。等级：差(2-3) 中(4-5) 良(6-7) 优(8-10)。低于策略门槛的笔记被自动过滤，不进入知识库。这是提炼后的最后一道质量防线。',
      cls: 'atomic-notes-about-text',
    });
    el.getElementsByClassName('atomic-notes-about-text')[
      el.getElementsByClassName('atomic-notes-about-text').length - 1
    ].setAttr('style', 'margin-top:6px');

    // ── 超时与缓存 ──
    el.createEl('div', { text: '超时与缓存', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '提炼整体设有 5 分钟超时保护（深度模式 10 分钟），超时自动中止防止 API 挂死。URL 提取结果缓存 1 小时，重复提炼跳过 HTTP 请求和解析。',
      cls: 'atomic-notes-about-text',
    });

    // ── 发现功能 ──
    el.createEl('div', { text: '发现功能', cls: 'atomic-notes-about-section' });
    el.createEl('p', {
      text: '发现 Tab 提供关联推荐功能，帮你从已有笔记中发现相关知识。',
      cls: 'atomic-notes-about-text',
    });
    for (const [feature, desc] of ABOUT_DISCOVERY_FEATURES) {
      const row = el.createEl('div', { cls: 'atomic-notes-about-detail-row' });
      row.createEl('span', {
        text: feature,
        cls: 'detail-label',
        attr: { style: 'min-width:56px;color:var(--text-accent)' },
      });
      row.createEl('span', { text: desc, cls: 'detail-desc' });
    }
  }
}
