/**
 * 存储模块（Phase 7）
 * 将提炼的原子笔记存入 Obsidian 知识库
 */

import { App, normalizePath } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { MAX_FILENAME_LENGTH } from './constants';

interface StorageConfig {
  targetFolder: string; // 目标文件夹（如 "Atomic Notes"）
  fileNameTemplate: string; // 文件名模板（如 "{{title}}" 或 "{{date}}-{{title}}"）
}

const DEFAULT_CONFIG: StorageConfig = {
  targetFolder: '原子笔记',
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

/** 生成文件名（@internal 暴露给测试） */
export function generateFileName(template: string, note: AtomicNote): string {
  const safeTemplate = template || '{{title}}';
  // Bug #11 修复：使用同一个 Date 对象，避免午夜时间不一致
  // 使用本地时间（避免 UTC 导致文件名与用户时区不一致）
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

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

/** 清理文件名（去掉非法字符）（@internal 暴露给测试） */
export function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  // 兜底：如果清理后为空，用时间戳
  return sanitized || `note-${Date.now()}`;
}

/** Bug #9 修复：转义 YAML frontmatter 中的特殊字符（@internal 暴露给测试） */
export function escapeYamlValue(value: string): string {
  // 如果值包含换行符，使用双引号并转义换行符
  if (/[\n\r]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
  }
  // 如果值包含 YAML 特殊字符，用双引号包裹并转义内部引号
  if (/[:\[\]{}#&*!|>'"%@`,?\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** 将原子笔记格式化为 Markdown（@internal 暴露给测试） */
export function formatNoteAsMarkdown(note: AtomicNote): string {
  const lines: string[] = [];

  // YAML frontmatter（Bug #9 修复：转义特殊字符）
  lines.push('---');
  lines.push(`title: ${escapeYamlValue(note.title)}`);
  lines.push(`created: ${note.createdAt}`);

  if (note.tags && note.tags.length > 0) {
    // 使用 YAML 列表格式，避免标签内含 ] 或 , 破坏内联数组语法
    lines.push('tags:');
    for (const tag of note.tags) {
      const safeTag = tag.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      lines.push(`  - "${safeTag}"`);
    }
  }

  lines.push('---');
  lines.push('');

  // 正文（清理 AI 可能输出的来源行）
  const cleanedContent = note.content
    .replace(/\n?---\n?来源[：:]\s*.+$/m, '') // 去掉末尾的 --- + 来源行
    .replace(/\n?来源[：:]\s*.+$/m, '') // 去掉单独的来源行
    .trim();
  lines.push(cleanedContent || note.content);

  return lines.join('\n');
}

/**
 * 批量存储原子笔记（优化版）
 *
 * 优化策略：
 * - 预检查目标文件夹中已存在的文件列表
 * - 避免每条笔记单独检查文件存在性
 */
export async function saveNotes(
  app: App,
  notes: AtomicNote[],
  config: Partial<StorageConfig> = {},
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

  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // 兜底：targetFolder 为空时使用默认值
  if (!fullConfig.targetFolder?.trim()) {
    fullConfig.targetFolder = DEFAULT_CONFIG.targetFolder;
  }

  try {
    // 确保目标文件夹存在
    await ensureFolder(app, fullConfig.targetFolder);

    // 预获取目标文件夹中已存在的文件列表（优化：一次性获取）
    const existingFiles = app.vault.getMarkdownFiles();
    const existingPaths = new Set(
      existingFiles
        .filter((f) => f.path.startsWith(fullConfig.targetFolder + '/'))
        .map((f) => f.path),
    );

    // 批量生成文件名和内容
    for (const note of notes) {
      try {
        const fileName = generateFileName(fullConfig.fileNameTemplate, note);
        let filePath = normalizePath(`${fullConfig.targetFolder}/${fileName}.md`);
        const content = formatNoteAsMarkdown(note);

        // 检查文件是否已存在（使用预获取的集合）
        if (existingPaths.has(filePath)) {
          // 生成递增文件名避免覆盖（最多尝试 100 次，防止恶意构造导致无限循环）
          const baseName = fileName;
          let counter = 1;
          const MAX_FILENAME_ATTEMPTS = 100;

          do {
            const newFileName = `${baseName} ${counter}`;
            filePath = normalizePath(`${fullConfig.targetFolder}/${newFileName}.md`);
            counter++;
          } while (existingPaths.has(filePath) && counter <= MAX_FILENAME_ATTEMPTS);

          if (counter > MAX_FILENAME_ATTEMPTS) {
            throw new Error(`文件名冲突：无法为「${baseName}」生成不重复的文件名（已尝试 ${MAX_FILENAME_ATTEMPTS} 次）`);
          }

          // 将新路径加入集合，避免后续笔记重复
          existingPaths.add(filePath);
        }

        await app.vault.create(filePath, content);
        result.success++;
        result.paths.push(filePath);
        // 将新路径加入集合
        existingPaths.add(filePath);
      } catch (error: unknown) {
        result.failed++;
        if (error instanceof Error) {
          result.errors.push(error.message);
        } else {
          result.errors.push(String(error));
        }
      }
    }
  } catch (error: unknown) {
    // 文件夹创建失败
    result.failed = notes.length;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
