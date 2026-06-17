/**
 * 存储模块（Phase 7）
 * 将提炼的原子笔记存入 Obsidian 知识库
 */

import { App, normalizePath } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { MAX_FILENAME_LENGTH } from './constants';

export interface StorageConfig {
  targetFolder: string; // 目标文件夹（如 "Atomic Notes"）
  fileNameTemplate: string; // 文件名模板（如 "{{title}}" 或 "{{date}}-{{title}}"）
}

const DEFAULT_CONFIG: StorageConfig = {
  targetFolder: 'Atomic Notes',
  fileNameTemplate: '{{title}}',
};

/**
 * 确保目标文件夹存在
 */
async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalizedPath = normalizePath(folderPath);
  const folder = app.vault.getAbstractFileByPath(normalizedPath);
  
  if (!folder) {
    await app.vault.createFolder(normalizedPath);
  }
}

/**
 * 生成文件名
 */
function generateFileName(template: string, note: AtomicNote): string {
  const safeTemplate = template || '{{title}}';
  // Bug #11 修复：使用同一个 Date 对象，避免午夜时间不一致
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS
  
  let fileName = safeTemplate
    .replace(/{{title}}/g, sanitizeFileName(note.title))
    .replace(/{{date}}/g, date)
    .replace(/{{time}}/g, time)
    .replace(/{{timestamp}}/g, String(Date.now()));
  
  // 兜底：如果替换后为空，用标题或时间戳
  if (!fileName.trim()) {
    fileName = sanitizeFileName(note.title) || `note-${Date.now()}`;
  }
  return fileName;
}

/**
 * 清理文件名（去掉非法字符）
 */
function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  // 兜底：如果清理后为空，用时间戳
  return sanitized || `note-${Date.now()}`;
}

/**
 * Bug #9 修复：转义 YAML frontmatter 中的特殊字符
 */
function escapeYamlValue(value: string): string {
  // 如果值包含 YAML 特殊字符，用双引号包裹并转义内部引号
  if (/[:\[\]{}#&*!|>'"%@`,?\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 将原子笔记格式化为 Markdown
 */
function formatNoteAsMarkdown(note: AtomicNote): string {
  const lines: string[] = [];
  
  // YAML frontmatter（Bug #9 修复：转义特殊字符）
  lines.push('---');
  lines.push(`title: ${escapeYamlValue(note.title)}`);
  lines.push(`created: ${note.createdAt}`);

  if (note.tags && note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`);
  }

  lines.push('---');
  lines.push('');

  // 正文（清理 AI 可能输出的来源行）
  const cleanedContent = note.content
    .replace(/\n?---\n?来源[：:]\s*.+$/m, '')  // 去掉末尾的 --- + 来源行
    .replace(/\n?来源[：:]\s*.+$/m, '')          // 去掉单独的来源行
    .trim();
  lines.push(cleanedContent || note.content);

  return lines.join('\n');
}

/**
 * 存储单条原子笔记
 */
async function saveNote(
  app: App,
  note: AtomicNote,
  config: Partial<StorageConfig> = {}
): Promise<{ success: boolean; path?: string; error?: string }> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // 兜底：targetFolder 为空时使用默认值
  if (!fullConfig.targetFolder?.trim()) {
    fullConfig.targetFolder = DEFAULT_CONFIG.targetFolder;
  }
  
  try {
    // 确保目标文件夹存在
    await ensureFolder(app, fullConfig.targetFolder);
    
    // 生成文件名和内容
    const fileName = generateFileName(fullConfig.fileNameTemplate, note);
    const filePath = normalizePath(`${fullConfig.targetFolder}/${fileName}.md`);
    const content = formatNoteAsMarkdown(note);
    
    // 检查文件是否已存在
    const existingFile = app.vault.getAbstractFileByPath(filePath);
    
    if (existingFile) {
      // 生成递增文件名避免覆盖
      const baseName = fileName;
      let counter = 1;
      let newFilePath: string;
      
      do {
        const newFileName = `${baseName} ${counter}`;
        newFilePath = normalizePath(`${fullConfig.targetFolder}/${newFileName}.md`);
        counter++;
      } while (app.vault.getAbstractFileByPath(newFilePath));
      
      await app.vault.create(newFilePath, content);
      return { success: true, path: newFilePath };
    } else {
      // 创建新文件
      await app.vault.create(filePath, content);
      return { success: true, path: filePath };
    }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 批量存储原子笔记
 */
export async function saveNotes(
  app: App,
  notes: AtomicNote[],
  config: Partial<StorageConfig> = {}
): Promise<{
  success: number;
  failed: number;
  paths: string[];
  errors: string[];
}> {
  const result = {
    success: 0,
    failed: 0,
    paths: [] as string[],
    errors: [] as string[],
  };
  
  for (const note of notes) {
    const saveResult = await saveNote(app, note, config);
    
    if (saveResult.success && saveResult.path) {
      result.success++;
      result.paths.push(saveResult.path);
    } else {
      result.failed++;
      if (saveResult.error) {
        result.errors.push(saveResult.error);
      }
    }
  }
  
  return result;
}
