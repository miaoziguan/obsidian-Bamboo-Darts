/**
 * 原子笔记提炼面板 - ItemView 侧边栏
 * 4 个 Tab：输入 / 历史 / 发现 / 介绍
 *
 * onOpen 只做容器初始化和 Tab 注册，
 * 各面板渲染逻辑委托给独立的 Tab 类（src/ui/tabs/）。
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import AtomicNotesPlugin from '../main';
import { AboutTab } from './tabs/about-tab';
import { HistoryTab } from './tabs/history-tab';
import { InputTab } from './tabs/input-tab';
import { DiscoveryTab } from './tabs/discovery-tab';

export const VIEW_TYPE_ATOMIC_PANEL = 'atomic-notes-panel';

export class AtomicNotesPanel extends ItemView {
  private plugin: AtomicNotesPlugin;

  /** Tab 实例 */
  private _inputTab: InputTab | null = null;
  private _discoveryTab: DiscoveryTab | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AtomicNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ATOMIC_PANEL;
  }

  getDisplayText(): string {
    return 'Bamboo Darts';
  }

  getIcon(): string {
    return 'atom';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('atomic-notes-panel');
    // 用户可调的版面左右留白（设置页滑块驱动）。
    // 变量写到 containerEl 本身（.view-content 祖先），由 .atomic-notes-panel 继承，
    // 避免 children[1] 指向不稳定导致变量落空。
    this.containerEl.style.setProperty(
      '--atomic-notes-panel-padding',
      `${this.plugin.settings.panelPadding ?? 56}px`,
    );

    // 标题栏：左侧品牌图标 + 品牌名 + 右侧设置按钮
    const headerEl = container.createDiv({ cls: 'atomic-notes-panel-header' });
    const brandEl = headerEl.createDiv({ cls: 'atomic-notes-brand' });
    brandEl.innerHTML = `
      <span class="atomic-notes-brand-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1" />
          <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
          <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
        </svg>
      </span>
      <span class="atomic-notes-brand-name">Bamboo Darts</span>
    `;
    const settingBtn = headerEl.createEl('button', {
      cls: 'clickable-icon atomic-notes-setting-btn',
      attr: { 'aria-label': '打开设置', type: 'button' },
    });
    settingBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
    settingBtn.addEventListener('click', () => {
      const setting = this.plugin.app.setting;
      setting.open();
      setting.openTabById(this.plugin.manifest.id);
    });

    // Tab bar
    const tabBar = container.createEl('div', {
      cls: 'atomic-notes-tabs',
      attr: { role: 'tablist', 'aria-label': '功能导航' },
    });
    const tabLabels = ['输入', '历史', '发现', '介绍'];
    const tabs: HTMLElement[] = [];
    for (let i = 0; i < tabLabels.length; i++) {
      const tab = tabBar.createEl('div', {
        text: tabLabels[i],
        cls: 'atomic-notes-tab' + (i === 0 ? ' active' : ''),
        attr: {
          role: 'tab',
          id: 'tab-' + i,
          tabindex: i === 0 ? '0' : '-1',
          'aria-selected': i === 0 ? 'true' : 'false',
          'aria-controls': `tab-panel-${i}`,
        },
      });
      tabs.push(tab);
    }

    // Tab content containers
    const inputPanel = container.createEl('div', {
      cls: 'atomic-notes-tab-content active',
      attr: { role: 'tabpanel', id: 'tab-panel-0', 'aria-labelledby': tabs[0].id || 'tab-0' },
    });
    const historyPanel = container.createEl('div', {
      cls: 'atomic-notes-tab-content',
      attr: {
        style: 'flex:1;overflow-y:auto',
        role: 'tabpanel',
        id: 'tab-panel-1',
        'aria-labelledby': tabs[1].id || 'tab-1',
      },
    });
    const discoveryPanel = container.createEl('div', {
      cls: 'atomic-notes-tab-content',
      attr: {
        style: 'max-height:none;overflow-y:visible',
        role: 'tabpanel',
        id: 'tab-panel-2',
        'aria-labelledby': tabs[2].id || 'tab-2',
      },
    });
    const aboutPanel = container.createEl('div', {
      cls: 'atomic-notes-tab-content',
      attr: {
        style: 'max-height:none;overflow-y:visible',
        role: 'tabpanel',
        id: 'tab-panel-3',
        'aria-labelledby': tabs[3].id || 'tab-3',
      },
    });
    const contentPanels = [inputPanel, historyPanel, discoveryPanel, aboutPanel];

    // 进度区域 + 提炼按钮（初始隐藏，在 InputTab 中创建）
    const progressWrap = container.createEl('div', {
      cls: 'atomic-notes-progress-wrap',
      attr: {
        style:
          'margin:8px 0;padding:8px 12px;border:1px solid var(--background-modifier-border);border-radius:6px;display:none;',
      },
    });
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
        progressWrap.style.display = i > 0 ? 'none' : progressWrap.style.display;
        buttonWrap.style.display = i > 0 ? 'none' : '';
        // 延迟渲染（首次激活时填充内容）
        if (i === 1) {
          if (!this._historyTab) {
            this._historyTab = new HistoryTab(this.plugin);
          }
          this._historyTab.render(historyPanel);
        }
        else if (i === 2) {
          if (!this._discoveryTab) {
            this._discoveryTab = new DiscoveryTab(this.plugin);
          }
          this._discoveryTab.render(discoveryPanel);
        }
        else if (i === 3) this.renderAboutPanel(aboutPanel);
      });
    }

    // 渲染输入面板（含进度 UI 和提炼按钮）
    if (!this._inputTab) {
      this._inputTab = new InputTab(this.plugin);
    }
    this._inputTab.render(inputPanel, progressWrap, buttonWrap);
  }

  private _aboutTab: AboutTab | null = null;
  private _historyTab: HistoryTab | null = null;

  private renderAboutPanel(el: HTMLElement): void {
    if (!this._aboutTab) {
      this._aboutTab = new AboutTab(this.plugin);
    }
    this._aboutTab.render(el);
  }



  async onClose(): Promise<void> {
    // 清理 Tab 资源
    this._inputTab?.destroy();
    this._discoveryTab?.destroy();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
  }
}
