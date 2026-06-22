/**
 * 清洗剪贴板中的图片噪音：base64 / Markdown 图片 / HTML img / figure / picture / 图片 URL / 裸文件名 / 占位符
 */
export function stripImageNoise(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '');
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/<img[^>]*\/?>/gi, '');
  cleaned = cleaned.replace(/<figure[\s\S]*?<\/figure>/gi, '');
  cleaned = cleaned.replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '');
  cleaned = cleaned.replace(/<picture[\s\S]*?<\/picture>/gi, '');
  cleaned = cleaned.replace(
    /^https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)(?:\?[^\s]*)?$/gim,
    '',
  );
  cleaned = cleaned.replace(/^[\w-]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)\s*$/gim, '');
  cleaned = cleaned.replace(/^图(?:片)?\s*$/gim, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}
