/**
 * 简单输入框 Modal
 * 从 src/main.ts 抽离，独立模块便于复用和测试
 */

import { App, Modal, Setting } from 'obsidian';

export class InputModal extends Modal {
  private title: string;
  private placeholder: string;
  private submitText: string;
  private onSubmit: (value: string) => void;
  private value: string = '';

  constructor(app: App, options: {
    title: string;
    placeholder?: string;
    submitText?: string;
    value?: string;
    onSubmit: (value: string) => void;
  }) {
    super(app);
    this.title = options.title;
    this.placeholder = options.placeholder || '';
    this.submitText = options.submitText || '确定';
    this.value = options.value || '';
    this.onSubmit = options.onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: this.title });

    let inputValue = this.value;

    new Setting(contentEl)
      .setName('输入')
      .addText(text => {
        text
          .setPlaceholder(this.placeholder)
          .setValue(this.value)
          .onChange(value => {
            inputValue = value;
          });

        // 回车提交
        text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            this.onSubmit(inputValue);
            this.close();
          }
        });
      });

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText(this.submitText)
          .setCta()
          .onClick(() => {
            this.onSubmit(inputValue);
            this.close();
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('取消')
          .onClick(() => this.close())
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
