/**
 * Obsidian API Mock for vitest
 *
 * 为存储、去重等需要 Obsidian API 的模块提供最小可用的 mock 实现。
 * 只 mock 测试中实际用到的接口，其余以空壳类代替。
 */

// ─── TFile / TFolder ───

export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  stat: { mtime: number; ctime: number; size: number };

  constructor(path: string, mtime = 0) {
    this.path = path;
    this.name = path.split('/').pop() || path;
    this.extension = this.name.split('.').pop() || '';
    this.basename = this.name.replace(/\.[^.]+$/, '');
    this.stat = { mtime, ctime: mtime, size: 0 };
  }
}

export class TFolder {
  path: string;
  name: string;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || path;
  }
}

// ─── Vault ───

export class Vault {
  /** path → content 的内存存储 */
  private _files = new Map<string, { file: TFile; content: string }>();

  /** 测试辅助：注入文件到 mock 存储 */
  addFile(path: string, content: string, mtime = Date.now()): TFile {
    const file = new TFile(path, mtime);
    this._files.set(path, { file, content });
    return file;
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    const entry = this._files.get(path);
    if (entry) return entry.file;
    // 路径匹配目录：检查是否有文件在该目录下
    const hasChildren = [...this._files.keys()].some(p => p.startsWith(path + '/'));
    if (hasChildren) return new TFolder(path);
    return null;
  }

  async createFolder(_path: string): Promise<void> {
    // no-op：目录在 mock 中按需提供
  }

  async create(path: string, content: string): Promise<TFile> {
    return this.addFile(path, content);
  }

  async read(file: TFile): Promise<string> {
    const entry = this._files.get(file.path);
    return entry?.content ?? '';
  }

  getMarkdownFiles(): TFile[] {
    return [...this._files.values()]
      .filter(e => e.file.path.endsWith('.md'))
      .map(e => e.file);
  }
}

// ─── App ───

export class App {
  vault: Vault = new Vault();
}

// ─── 路径工具 ───

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// ─── 网络请求 ───

export async function requestUrl(_opts: unknown): Promise<{ text: string; json: unknown; status: number }> {
  return { text: '', json: {}, status: 200 };
}

// ─── UI 组件（空壳） ───

export class Notice {
  constructor(public message: string, _timeout?: number) {}
}

export class Modal {
  app: App;
  constructor(app: App) { this.app = app; }
  open(): void {}
  close(): void {}
}

export class Setting {
  constructor(_el: unknown) {}
  setName(_n: string): this { return this; }
  setDesc(_d: string): this { return this; }
  addText(_cb: unknown): this { return this; }
  addToggle(_cb: unknown): this { return this; }
  addDropdown(_cb: unknown): this { return this; }
  addSlider(_cb: unknown): this { return this; }
}

export class Plugin {
  app: App = new App();
  manifest: Record<string, unknown> = {};
  async loadData(): Promise<unknown> { return null; }
  async saveData(_data: unknown): Promise<void> {}
  addCommand(_cmd: unknown): void {}
  addRibbonIcon(_icon: string, _title: string, _cb: unknown): void {}
  addSettingTab(_tab: unknown): void {}
  registerView(_id: string, _view: unknown): void {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: { empty: () => void; createEl: (tag: string, opts?: unknown) => unknown } = {
    empty: () => {},
    createEl: () => ({}),
  };
  constructor(app: App, plugin: Plugin) { this.app = app; this.plugin = plugin; }
  display(): void {}
  hide(): void {}
}

export class ItemView {
  app: App = new App();
  containerEl: { empty: () => void } = { empty: () => {} };
  contentEl: HTMLElement = {} as HTMLElement;
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class Editor {}
export class MarkdownView {
  editor: Editor = new Editor();
  file: TFile | null = null;
}
export class Menu {
  addItem(_cb: unknown): this { return this; }
  addSeparator(): this { return this; }
  showAtMouseEvent(_e: unknown): void {}
}
export class MenuItem {
  setTitle(_t: string): this { return this; }
  setIcon(_i: string): this { return this; }
  onClick(_cb: unknown): this { return this; }
}
