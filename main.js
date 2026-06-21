"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AtomicNotesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/ui/setting-tab.ts
var import_obsidian = require("obsidian");

// src/constants.ts
var GATE_MIN_CONTENT_LENGTH = 50;
var GATE_WARN_DENSITY = 0.5;
var GATE_MIN_DENSITY = 0.15;
var GATE_WARN_NOISE_RATIO = 0.4;
var GATE_MAX_NOISE_RATIO = 0.7;
var AI_TEMPERATURE = 0.3;
var INPUT_TRUNCATE_LENGTH = 1e4;
var MAX_FILENAME_LENGTH = 100;
var MIN_NOTE_CONTENT_LENGTH = 10;
var DEDUP_BATCH_SIZE = 20;
var MAX_CLAIMS_PER_CHECK = 30;
var DEDUP_CACHE_TTL = 5 * 60 * 1e3;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "\u7684",
  "\u4E86",
  "\u5728",
  "\u662F",
  "\u6211",
  "\u6709",
  "\u548C",
  "\u5C31",
  "\u4E0D",
  "\u4EBA",
  "\u90FD",
  "\u4E00",
  "\u4E00\u4E2A",
  "\u4E0A",
  "\u4E5F",
  "\u5F88",
  "\u5230",
  "\u8BF4",
  "\u8981",
  "\u53BB",
  "\u4F60",
  "\u4F1A",
  "\u7740",
  "\u6CA1\u6709",
  "\u770B",
  "\u597D",
  "\u81EA\u5DF1",
  "\u8FD9",
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been"
]);
var MIN_TOKENS_THRESHOLD = 3;
var CROSS_BATCH_THRESHOLD = 0.65;
var IDF_SMOOTH = 1;
var LENGTH_RATIO_THRESHOLD = 0.3;
var TITLE_WEIGHT = 0.25;
var CONTENT_WEIGHT = 0.75;
var SHORT_NOTE_LENGTH = 100;

// src/extraction/profiles.ts
var PROFILE_CONFIGS = {
  dense: {
    crossBatchThreshold: 0.75,
    vaultHighThreshold: 0.8,
    vaultMidThreshold: 0.65,
    reviewMinScore: 2,
    gateMinDensity: 0.15,
    gateWarnDensity: 0.5,
    gateMaxNoiseRatio: 0.75,
    gateWarnNoiseRatio: 0.45,
    // 技术文档允许更短（代码片段、定义等）
    gateMinLength: 50,
    gateWarnLength: 150,
    // 技术文档可以很长（完整技术手册）
    gateMaxLength: 1e5,
    gateWarnMaxLength: 5e4,
    // 技术文档可以有更多链接（参考资料）
    gateLinkBlockRatio: 0.55,
    gateLinkBlockDensity: 1.5,
    // 技术文档对广告词容忍度低
    gateQualityBlockCount: 2,
    gateQualityWarnCount: 1,
    // 技术文档允许更高关键词重复（专业术语高频出现）
    gateKeywordStuffingBlockRate: 5,
    gateKeywordStuffingWarnRate: 3,
    gateKeywordStuffingMinLength: 300,
    gateKeywordStuffingMinCount: 8,
    gateKeywordStuffingTopN: 8,
    // 技术文档允许更高相似度（同一技术主题的不同文章可能有重叠）
    gateDuplicateThreshold: 0.6,
    // HTML 残留、乱码阈值与通用一致
    gateHtmlBlockCount: 5,
    gateHtmlWarnCount: 2,
    gateMojibakeBlockCount: 3,
    gateMojibakeWarnCount: 1
  },
  balanced: {
    crossBatchThreshold: 0.65,
    vaultHighThreshold: 0.7,
    vaultMidThreshold: 0.55,
    reviewMinScore: 3,
    gateMinDensity: 0.15,
    gateWarnDensity: 0.5,
    gateMaxNoiseRatio: 0.7,
    gateWarnNoiseRatio: 0.4,
    // 通用文章默认阈值
    gateMinLength: 80,
    gateWarnLength: 300,
    // 通用文章建议不超过 50000 字
    gateMaxLength: 5e4,
    gateWarnMaxLength: 2e4,
    gateLinkBlockRatio: 0.4,
    gateLinkBlockDensity: 1,
    gateQualityBlockCount: 3,
    gateQualityWarnCount: 1,
    // 通用文章默认阈值
    gateKeywordStuffingBlockRate: 3,
    gateKeywordStuffingWarnRate: 1.5,
    gateKeywordStuffingMinLength: 200,
    gateKeywordStuffingMinCount: 5,
    gateKeywordStuffingTopN: 5,
    gateDuplicateThreshold: 0.5,
    gateHtmlBlockCount: 5,
    gateHtmlWarnCount: 2,
    gateMojibakeBlockCount: 3,
    gateMojibakeWarnCount: 1
  },
  sparse: {
    crossBatchThreshold: 0.55,
    vaultHighThreshold: 0.6,
    vaultMidThreshold: 0.45,
    reviewMinScore: 4,
    gateMinDensity: 0.15,
    gateWarnDensity: 0.5,
    gateMaxNoiseRatio: 0.65,
    gateWarnNoiseRatio: 0.35,
    // 观点/评论允许更短（一句话观点也有价值）
    gateMinLength: 30,
    gateWarnLength: 100,
    // 观点文章不宜过长
    gateMaxLength: 2e4,
    gateWarnMaxLength: 1e4,
    // 观点文章链接不多
    gateLinkBlockRatio: 0.35,
    gateLinkBlockDensity: 0.8,
    // 观点文章对广告容忍度较高（自媒体常带推广）
    gateQualityBlockCount: 5,
    gateQualityWarnCount: 2,
    // 观点文章对关键词重复更敏感（营销号常堆砌）
    gateKeywordStuffingBlockRate: 2,
    gateKeywordStuffingWarnRate: 1,
    gateKeywordStuffingMinLength: 150,
    gateKeywordStuffingMinCount: 3,
    gateKeywordStuffingTopN: 5,
    // 观点文章对重复更敏感
    gateDuplicateThreshold: 0.4,
    gateHtmlBlockCount: 5,
    gateHtmlWarnCount: 2,
    gateMojibakeBlockCount: 3,
    gateMojibakeWarnCount: 1
  }
};
var PROFILE_LABELS = {
  dense: "\u6280\u672F\u6587\u732E",
  balanced: "\u901A\u7528\u6587\u7AE0",
  sparse: "\u89C2\u70B9\u8BC4\u8BBA"
};
function stripNoise(text) {
  let s = text;
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`]+`/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1 ");
  s = s.replace(/\[([^\]]*)\]\([^)]+\)/g, "$1 ");
  s = s.replace(/&\w+;/g, " ");
  s = s.replace(/(?:阅读|阅读数|点赞|在看|转发|收藏)\s*\d+/g, " ");
  s = s.replace(/🎧\s*\d+人/g, " ");
  return s;
}
function countCodeBlocks(text) {
  const matches = text.match(/```[\s\S]*?```/g);
  return matches ? matches.length : 0;
}
function technicalTermDensity(text) {
  const charCount = text.length || 1;
  const englishWords = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
  const filteredEnglish = englishWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const slashTerms = text.match(/[a-zA-Z]+\/[a-zA-Z]+/g) || [];
  const hyphenTerms = text.match(/[a-zA-Z]+-[a-zA-Z]+/g) || [];
  const totalTerms = filteredEnglish.length + slashTerms.length + hyphenTerms.length;
  return totalTerms / charCount * 1e3;
}
function dataDensity(text) {
  const charCount = text.length || 1;
  const seen = /* @__PURE__ */ new Set();
  let count = 0;
  for (const m of text.matchAll(/(?:约|近|超|达)?\d+(?:\.\d+)?%/g)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      count++;
    }
  }
  for (const m of text.matchAll(/\d+(?:\.\d+)?\s*(?:mV|kV|V|mW|kW|MW|GW|TW|W|mWh|kWh|MWh|GWh|mA|kA|A|Ω|mΩ|Hz|kHz|MHz|GHz|μF|mF|nF|pF|°C|°F|mm|cm|m|km|kg|t|Pa|kPa|MPa|bar|ppm|ppb|dB|dBm)/gi)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      count++;
    }
  }
  for (const m of text.matchAll(/(?<!\d)\d{4}(?:[-\/年]\d{1,2}(?:[-\/月]\d{1,2})?)?(?!\d)/g)) {
    const year = parseInt(m[0]);
    if (year >= 1900 && year <= 2100 && !seen.has(m[0])) {
      seen.add(m[0]);
      count++;
    }
  }
  for (const m of text.matchAll(/\d+(?:\.\d+)?\s*(?:万亿|亿|千万|百万|万|千)\s*(?:元|美元|欧元|人|台|套|条|座|个|辆|次)?/g)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      count++;
    }
  }
  return count / charCount * 1e3;
}
function avgParagraphLength(text) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0)
    return 0;
  const totalChars = paragraphs.reduce((sum, p) => sum + p.trim().length, 0);
  return totalChars / paragraphs.length;
}
function narrativeWordDensity(text) {
  const charCount = text.length || 1;
  const NARRATIVE_PATTERNS = [
    /然而/g,
    /但是/g,
    /却/g,
    /不禁/g,
    /渐渐/g,
    /终于/g,
    /忽然/g,
    /突然/g,
    /似乎/g,
    /仿佛/g,
    /依然/g,
    /仍然/g,
    /默默/g,
    /悄悄/g,
    /缓缓/g,
    /淡淡/g,
    /深深/g,
    /轻轻/g,
    /回忆/g,
    /想起/g,
    /记得/g,
    /故事/g,
    /情感/g,
    /感受/g,
    /心情/g,
    /思绪/g,
    /目光/g,
    /微笑/g,
    /沉默/g,
    /叹息/g
  ];
  let count = 0;
  for (const pattern of NARRATIVE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches)
      count += matches.length;
  }
  return count / charCount * 1e3;
}
function classifyContent(text) {
  if (!text || text.length < 100)
    return "balanced";
  const codeBlocks = countCodeBlocks(text);
  const clean = stripNoise(text);
  const termDensity = technicalTermDensity(clean);
  const dDensity = dataDensity(clean);
  if (codeBlocks >= 1 || termDensity >= 5 || dDensity >= 4) {
    return "dense";
  }
  const avgLen = avgParagraphLength(clean);
  const narrativeDensity = narrativeWordDensity(clean);
  if (avgLen > 300 && narrativeDensity >= 2) {
    return "sparse";
  }
  return "balanced";
}
function resolveProfileConfig(profile, overrides) {
  const base = { ...PROFILE_CONFIGS[profile] };
  if (overrides && overrides[profile]) {
    return { ...base, ...overrides[profile] };
  }
  return base;
}

// src/ui/setting-tab.ts
var DEFAULT_SETTINGS = {
  settingsVersion: 2,
  deepseekApiKey: "",
  deepseekApiUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-v4-flash",
  maxTokens: 6e3,
  targetFolder: "Atomic Notes",
  dedupTargetFolder: "",
  fileNameTemplate: "{{title}}",
  autoSave: false,
  tagPreferences: [],
  tagMode: "lenient",
  autoBacklink: false,
  factCheck: true,
  verifiedOnly: false,
  discoveryRecommendation: true,
  // Review
  enableReview: false,
  reviewModel: "",
  reviewApiUrl: "",
  reviewApiKey: "",
  // Panel
  panelPosition: "right",
  // Profile 过滤策略
  autoClassify: true,
  contentProfile: "balanced",
  profileDense: { ...PROFILE_CONFIGS.dense },
  profileBalanced: { ...PROFILE_CONFIGS.balanced },
  profileSparse: { ...PROFILE_CONFIGS.sparse },
  // 深度提炼
  enableDeepMode: false
};
var AtomicNotesSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /** 在分区之间插入轻量分割线 */
  addDivider(containerEl) {
    containerEl.createEl("hr", {
      attr: {
        style: "margin:20px 0 16px;border:none;border-top:1px solid var(--background-modifier-border)"
      }
    });
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u539F\u5B50\u7B14\u8BB0\u63D0\u70BC \u8BBE\u7F6E" });
    containerEl.createEl("h3", { text: "API \u914D\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("API Key").setDesc("\u4F60\u7684 API Key\uFF08\u5FC5\u9700\uFF09").addText((text) => {
      text.setPlaceholder("sk-...").setValue(this.plugin.settings.deepseekApiKey).onChange(async (value) => {
        this.plugin.settings.deepseekApiKey = value.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    new import_obsidian.Setting(containerEl).setName("API URL").setDesc("API \u5730\u5740\uFF08\u9ED8\u8BA4\uFF1ADeepSeek\uFF09").addText(
      (text) => text.setValue(this.plugin.settings.deepseekApiUrl).onChange(async (value) => {
        this.plugin.settings.deepseekApiUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6A21\u578B").setDesc("\u4F7F\u7528\u7684\u6A21\u578B\uFF08\u9ED8\u8BA4\uFF1Adeepseek-v4-flash\uFF09").addText(
      (text) => text.setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6700\u5927 Token \u6570").setDesc("AI \u8F93\u51FA\u7684\u6700\u5927 Token \u6570\uFF08\u9ED8\u8BA4\uFF1A6000\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.maxTokens)).onChange(async (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num > 0) {
          this.plugin.settings.maxTokens = num;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6D4B\u8BD5\u8FDE\u63A5").setDesc("\u9A8C\u8BC1 API Key \u662F\u5426\u6709\u6548").addButton(
      (button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        await this.testConnection();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u5B58\u50A8\u914D\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u76EE\u6807\u6587\u4EF6\u5939").setDesc("\u539F\u5B50\u7B14\u8BB0\u4FDD\u5B58\u7684\u6587\u4EF6\u5939\uFF08\u9ED8\u8BA4\uFF1AAtomic Notes\uFF09").addText(
      (text) => text.setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
        this.plugin.settings.targetFolder = value.trim() || "Atomic Notes";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u53BB\u91CD\u76EE\u6807\u6587\u4EF6\u5939").setDesc("\u53BB\u91CD\u6BD4\u5BF9\u65F6\u8BFB\u53D6\u7684\u6587\u4EF6\u5939\u3002\u7559\u7A7A\u5219\u590D\u7528\u300C\u76EE\u6807\u6587\u4EF6\u5939\u300D\uFF0C\u9002\u5408\u6709\u9690\u79C1\u9700\u6C42\u7684\u7528\u6237\u9650\u5236\u53BB\u91CD\u8303\u56F4\u3002").addText(
      (text) => text.setPlaceholder("\u7559\u7A7A = \u590D\u7528\u76EE\u6807\u6587\u4EF6\u5939").setValue(this.plugin.settings.dedupTargetFolder).onChange(async (value) => {
        this.plugin.settings.dedupTargetFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6587\u4EF6\u540D\u6A21\u677F").setDesc("\u652F\u6301\u53D8\u91CF\uFF1A{{title}}, {{date}}, {{time}}, {{timestamp}}").addText(
      (text) => text.setValue(this.plugin.settings.fileNameTemplate).onChange(async (value) => {
        this.plugin.settings.fileNameTemplate = value.trim() || "{{title}}";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u4FDD\u5B58").setDesc("\u542F\u7528\u540E\uFF0C\u63D0\u70BC\u5B8C\u6210\u81EA\u52A8\u4FDD\u5B58\u5230\u77E5\u8BC6\u5E93\uFF08\u4E0D\u663E\u793A\u7ED3\u679C\u5F39\u7A97\uFF09").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoSave).onChange(async (value) => {
        this.plugin.settings.autoSave = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u6807\u7B7E\u504F\u597D" });
    new import_obsidian.Setting(containerEl).setName("\u6807\u7B7E\u8BCD\u6C47\u8868").setDesc("\u8F93\u5165\u504F\u597D\u6807\u7B7E\uFF0C\u9017\u53F7\u6216\u6362\u884C\u5206\u9694\uFF0C\u5982\uFF1A\u8BBE\u8BA1\u601D\u7EF4, \u7528\u6237\u7814\u7A76, AI").addTextArea(
      (text) => text.setPlaceholder("\u8BBE\u8BA1\u601D\u7EF4, \u7528\u6237\u7814\u7A76, AI").setValue((this.plugin.settings.tagPreferences || []).join(", ")).onChange(async (value) => {
        this.plugin.settings.tagPreferences = value.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6807\u7B7E\u6A21\u5F0F").setDesc("\u5BBD\u677E\uFF1A\u4F18\u5148\u4F7F\u7528\u504F\u597D\u6807\u7B7E\uFF0C\u5141\u8BB8\u65B0\u589E\uFF1B\u4E25\u683C\uFF1A\u4EC5\u4F7F\u7528\u504F\u597D\u6807\u7B7E").addDropdown(
      (dropdown) => dropdown.addOption("lenient", "\u5BBD\u677E\u6A21\u5F0F").addOption("strict", "\u4E25\u683C\u6A21\u5F0F").setValue(this.plugin.settings.tagMode || "lenient").onChange(async (value) => {
        this.plugin.settings.tagMode = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u53CC\u5411\u94FE\u63A5" });
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u521B\u5EFA\u6E90\u6587\u4EF6\u53CD\u5411\u94FE\u63A5").setDesc("\u4ECE\u9009\u4E2D\u6587\u672C\u63D0\u70BC\u65F6\uFF0C\u5728\u6E90\u6587\u4EF6\u63D2\u5165 [[\u7B14\u8BB0\u6807\u9898]] \u94FE\u63A5").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoBacklink).onChange(async (value) => {
        this.plugin.settings.autoBacklink = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u5185\u5BB9\u6838\u67E5" });
    new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u5185\u5BB9\u6838\u67E5").setDesc("\u63D0\u70BC\u540E\u81EA\u52A8\u6838\u67E5\u7B14\u8BB0\u4E2D\u7684\u4E8B\u5B9E\u548C\u6570\u636E\u662F\u5426\u80FD\u5728\u539F\u6587\u4E2D\u627E\u5230\u4F9D\u636E").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.factCheck).onChange(async (value) => {
        this.plugin.settings.factCheck = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u4EC5\u4FDD\u5B58\u53EF\u6EAF\u6E90\u7B14\u8BB0").setDesc("\u5F00\u542F\u65F6\u81EA\u52A8\u8FC7\u6EE4\u5305\u542B\u8D85\u6E90\u58F0\u660E\u7684\u7B14\u8BB0").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.verifiedOnly).onChange(async (value) => {
        this.plugin.settings.verifiedOnly = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u7B14\u8BB0\u590D\u67E5\uFF08AI \u53CC\u91CD\u4FDD\u9669\uFF09" });
    const reviewToggleSetting = new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u7B14\u8BB0\u590D\u67E5").setDesc("\u63D0\u70BC\u5B8C\u6210\u540E\uFF0C\u7528 AI \u5BF9\u7B14\u8BB0\u4EF7\u503C\u8BC4\u5206\uFF0C\u81EA\u52A8\u8FC7\u6EE4\u4F4E\u8D28\u91CF\u7B14\u8BB0\uFF08\u8BC4\u5206<3\uFF09").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableReview || false).onChange(async (value) => {
        this.plugin.settings.enableReview = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.enableReview) {
      new import_obsidian.Setting(containerEl).setName("\u590D\u67E5\u6A21\u578B\uFF08\u53EF\u9009\uFF09").setDesc("\u590D\u67E5\u7528\u6A21\u578B\u540D\u79F0\uFF08\u5982 gpt-4o\u3001claude-3-5-sonnet\uFF09\u3002\u7559\u7A7A\u5219\u590D\u7528\u63D0\u70BC\u6A21\u578B").addText(
        (text) => text.setPlaceholder("\u7559\u7A7A\u5219\u4F7F\u7528\u63D0\u70BC\u6A21\u578B").setValue(this.plugin.settings.reviewModel || "").onChange(async (value) => {
          this.plugin.settings.reviewModel = value.trim();
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(containerEl).setName("\u590D\u67E5 API URL\uFF08\u53EF\u9009\uFF09").setDesc("\u590D\u67E5\u7528 API \u5730\u5740\u3002\u7559\u7A7A\u5219\u590D\u7528\u63D0\u70BC API \u5730\u5740").addText(
        (text) => text.setPlaceholder("\u7559\u7A7A\u5219\u4F7F\u7528\u63D0\u70BC API \u5730\u5740").setValue(this.plugin.settings.reviewApiUrl || "").onChange(async (value) => {
          this.plugin.settings.reviewApiUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(containerEl).setName("\u590D\u67E5 API Key\uFF08\u53EF\u9009\uFF09").setDesc("\u590D\u67E5\u7528 API Key\u3002\u7559\u7A7A\u5219\u590D\u7528\u63D0\u70BC API Key").addText(
        (text) => text.setPlaceholder("\u7559\u7A7A\u5219\u4F7F\u7528\u63D0\u70BC API Key").setValue(this.plugin.settings.reviewApiKey || "").onChange(async (value) => {
          this.plugin.settings.reviewApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );
    }
    containerEl.createEl("h3", { text: "\u7B14\u8BB0\u53D1\u73B0" });
    new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u5173\u8054\u63A8\u8350").setDesc("\u9009\u4E2D\u7B14\u8BB0\u540E\u663E\u793A Top10 \u76F8\u5173\u7B14\u8BB0").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.discoveryRecommendation).onChange(async (value) => {
        this.plugin.settings.discoveryRecommendation = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u8FC7\u6EE4\u7B56\u7565" });
    new import_obsidian.Setting(containerEl).setDesc("\u4E0D\u540C\u7C7B\u578B\u7684\u6587\u7AE0\u9700\u8981\u4E0D\u540C\u7684\u8FC7\u6EE4\u5F3A\u5EA6\u3002\u6280\u672F\u6587\u732E\u4FE1\u606F\u5BC6\u96C6\uFF0C\u5E94\u4FDD\u7559\u66F4\u591A\u7B14\u8BB0\uFF1B\u89C2\u70B9\u8BC4\u8BBA\u6CE8\u91CD\u7CBE\u534E\uFF0C\u53EA\u4FDD\u7559\u6700\u6709\u4EF7\u503C\u7684\u6D1E\u89C1\u3002");
    new import_obsidian.Setting(containerEl).setName("\u667A\u80FD\u8BC6\u522B\u6587\u7AE0\u7C7B\u578B").setDesc("\u5F00\u542F\u540E\u81EA\u52A8\u5224\u65AD\u5185\u5BB9\u7279\u5F81\uFF0C\u4E3A\u6BCF\u7BC7\u6587\u7AE0\u9009\u62E9\u6700\u5408\u9002\u7684\u8FC7\u6EE4\u7B56\u7565").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoClassify).onChange(async (value) => {
        this.plugin.settings.autoClassify = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (!this.plugin.settings.autoClassify) {
      new import_obsidian.Setting(containerEl).setName("\u9009\u62E9\u7B56\u7565").setDesc("\u624B\u52A8\u6307\u5B9A\u5F53\u524D\u6587\u7AE0\u9002\u5408\u7684\u8FC7\u6EE4\u5F3A\u5EA6").addDropdown(
        (dropdown) => dropdown.addOption("dense", "\u6280\u672F\u6587\u732E\uFF08\u6280\u672F\u6587\u6863\u3001\u8BBA\u6587\u3001\u6559\u7A0B \u2014 \u4FDD\u7559\u66F4\u591A\u7B14\u8BB0\uFF09").addOption("balanced", "\u901A\u7528\u6587\u7AE0\uFF08\u4E00\u822C\u6587\u7AE0 \u2014 \u5E73\u8861\u6570\u91CF\u4E0E\u8D28\u91CF\uFF09").addOption("sparse", "\u89C2\u70B9\u8BC4\u8BBA\uFF08\u793E\u8BBA\u3001\u4E66\u8BC4\u3001\u968F\u7B14 \u2014 \u53EA\u7559\u7CBE\u534E\uFF09").setValue(this.plugin.settings.contentProfile).onChange(async (value) => {
          this.plugin.settings.contentProfile = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    const currentProfile = this.plugin.settings.autoClassify ? null : this.plugin.settings.contentProfile;
    if (!this.plugin.settings.autoClassify && currentProfile) {
      const previewMap = {
        dense: {
          label: "\u6280\u672F\u6587\u732E",
          desc: "\u53BB\u91CD\u5BBD\u677E\uFF0C\u5141\u8BB8\u76F8\u4F3C\u7B14\u8BB0\u5171\u5B58\uFF1B\u8D28\u91CF\u95E8\u69DB\u4F4E\uFF0C\u8FB9\u7F18\u6D1E\u89C1\u4E5F\u4F1A\u4FDD\u7559\u3002\u9002\u5408\u6280\u672F\u6587\u6863\u3001\u6559\u7A0B\u7B49\u4FE1\u606F\u5BC6\u96C6\u5185\u5BB9\u3002"
        },
        balanced: {
          label: "\u901A\u7528\u6587\u7AE0",
          desc: "\u9002\u5EA6\u53BB\u91CD\uFF0C\u4FDD\u7559\u4E2D\u7B49\u4EE5\u4E0A\u8D28\u91CF\u7B14\u8BB0\u3002\u9002\u5408\u5927\u591A\u6570\u6587\u7AE0\u3002"
        },
        sparse: {
          label: "\u89C2\u70B9\u8BC4\u8BBA",
          desc: "\u4E25\u683C\u53BB\u91CD\uFF0C\u907F\u514D\u91CD\u590D\u89C2\u70B9\uFF1B\u8D28\u91CF\u95E8\u69DB\u9AD8\uFF0C\u53EA\u4FDD\u7559\u6700\u6709\u4EF7\u503C\u7684\u6838\u5FC3\u6D1E\u89C1\u3002"
        }
      };
      const preview = previewMap[currentProfile];
      const previewEl = containerEl.createEl("div", {
        cls: "setting-item-description"
      });
      previewEl.style.background = "var(--background-secondary)";
      previewEl.style.padding = "8px 12px";
      previewEl.style.borderRadius = "6px";
      previewEl.style.marginBottom = "12px";
      previewEl.createEl("strong", { text: `\u5F53\u524D\uFF1A${preview.label}` });
      previewEl.createEl("br");
      previewEl.appendText(preview.desc);
    }
    const advancedToggle = new import_obsidian.Setting(containerEl).setName("\u9AD8\u7EA7\u53C2\u6570\u8C03\u6574").setDesc("\u624B\u52A8\u8C03\u6574\u5404\u7B56\u7565\u7684\u53BB\u91CD\u9608\u503C\u548C\u8D28\u91CF\u95E8\u69DB\uFF0C\u4E00\u822C\u65E0\u9700\u4FEE\u6539");
    let advancedContainer = null;
    advancedToggle.addToggle(
      (toggle) => toggle.setValue(false).onChange((show) => {
        if (show && !advancedContainer) {
          advancedContainer = containerEl.createEl("div", { cls: "filter-advanced-settings" });
          advancedToggle.settingEl.insertAdjacentElement("afterend", advancedContainer);
          advancedContainer.style.borderLeft = "3px solid var(--interactive-accent)";
          advancedContainer.style.paddingLeft = "16px";
          advancedContainer.style.marginTop = "8px";
          advancedContainer.style.marginBottom = "12px";
          new import_obsidian.Setting(advancedContainer).setName("\u6062\u590D\u9ED8\u8BA4\u53C2\u6570").setDesc("\u5C06\u6240\u6709\u7B56\u7565\u7684\u9608\u503C\u6062\u590D\u4E3A\u51FA\u5382\u8BBE\u7F6E").addButton(
            (btn) => btn.setButtonText("\u91CD\u7F6E").setWarning().onClick(async () => {
              this.plugin.settings.profileDense = { ...PROFILE_CONFIGS.dense };
              this.plugin.settings.profileBalanced = { ...PROFILE_CONFIGS.balanced };
              this.plugin.settings.profileSparse = { ...PROFILE_CONFIGS.sparse };
              await this.plugin.saveSettings();
              this.display();
            })
          );
          const profiles = [
            { key: "profileDense", label: "\u6280\u672F\u6587\u732E" },
            { key: "profileBalanced", label: "\u901A\u7528\u6587\u7AE0" },
            { key: "profileSparse", label: "\u89C2\u70B9\u8BC4\u8BBA" }
          ];
          for (const { key, label } of profiles) {
            const cfg = this.plugin.settings[key];
            advancedContainer.createEl("h4", { text: label, cls: "filter-profile-group" });
            new import_obsidian.Setting(advancedContainer).setName("\u6279\u5185\u53BB\u91CD\u4E25\u683C\u5EA6").setDesc("\u540C\u6279\u63D0\u70BC\u7684\u7B14\u8BB0\u4E4B\u95F4\uFF0C\u76F8\u4F3C\u5EA6\u591A\u9AD8\u624D\u7B97\u91CD\u590D\uFF1F\u503C\u8D8A\u9AD8\u8D8A\u5BBD\u677E").addSlider(
              (s) => s.setLimits(0.3, 1, 0.05).setValue(cfg.crossBatchThreshold).setDynamicTooltip().onChange(async (v) => {
                this.plugin.settings[key].crossBatchThreshold = v;
                await this.plugin.saveSettings();
              })
            );
            new import_obsidian.Setting(advancedContainer).setName("\u4E0E\u5DF2\u6709\u7B14\u8BB0\u53BB\u91CD\uFF08\u81EA\u52A8\u4E22\u5F03\uFF09").setDesc("\u548C\u77E5\u8BC6\u5E93\u5DF2\u6709\u7B14\u8BB0\u592A\u76F8\u4F3C\u65F6\u76F4\u63A5\u4E22\u5F03\u3002\u503C\u8D8A\u9AD8\u8D8A\u5BBD\u677E").addSlider(
              (s) => s.setLimits(0.5, 1, 0.05).setValue(cfg.vaultHighThreshold).setDynamicTooltip().onChange(async (v) => {
                this.plugin.settings[key].vaultHighThreshold = v;
                await this.plugin.saveSettings();
              })
            );
            new import_obsidian.Setting(advancedContainer).setName("\u4E0E\u5DF2\u6709\u7B14\u8BB0\u53BB\u91CD\uFF08\u5F85\u786E\u8BA4\uFF09").setDesc('\u76F8\u4F3C\u5EA6\u4F4E\u4E8E\u4E0A\u4E00\u6761\u4F46\u4ECD\u8F83\u9AD8\u65F6\uFF0C\u6807\u8BB0\u4E3A"\u5F85\u786E\u8BA4"\u8BA9\u4F60\u624B\u52A8\u51B3\u5B9A').addSlider(
              (s) => s.setLimits(0.3, 0.9, 0.05).setValue(cfg.vaultMidThreshold).setDynamicTooltip().onChange(async (v) => {
                this.plugin.settings[key].vaultMidThreshold = v;
                await this.plugin.saveSettings();
              })
            );
            new import_obsidian.Setting(advancedContainer).setName("\u8D28\u91CF\u8BC4\u5206\u95E8\u69DB").setDesc("AI \u590D\u67E5\u8BC4\u5206\u4F4E\u4E8E\u6B64\u503C\u7684\u7B14\u8BB0\u4F1A\u88AB\u4E22\u5F03\u3002\u503C\u8D8A\u4F4E\u4FDD\u7559\u8D8A\u591A").addSlider(
              (s) => s.setLimits(1, 5, 1).setValue(cfg.reviewMinScore).setDynamicTooltip().onChange(async (v) => {
                this.plugin.settings[key].reviewMinScore = v;
                await this.plugin.saveSettings();
              })
            );
          }
        } else if (!show && advancedContainer) {
          advancedContainer.remove();
          advancedContainer = null;
        }
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u6DF1\u5EA6\u63D0\u70BC" });
    new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u6DF1\u5EA6\u63D0\u70BC\u6A21\u5F0F").setDesc("\u5BF9\u8D85\u957F\u6587\u7AE0\u81EA\u52A8\u5206\u6BB5\u63D0\u70BC\uFF0C\u6D88\u8017\u66F4\u591A token").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableDeepMode).onChange(async (value) => {
        this.plugin.settings.enableDeepMode = value;
        await this.plugin.saveSettings();
      })
    );
    this.addDivider(containerEl);
    containerEl.createEl("h3", { text: "\u9762\u677F\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u9762\u677F\u4F4D\u7F6E").setDesc("\u63A7\u5236\u63D2\u4EF6\u9762\u677F\u5728 Obsidian \u754C\u9762\u4E2D\u663E\u793A\u7684\u4F4D\u7F6E").addDropdown(
      (dropdown) => dropdown.addOption("right", "\u53F3\u4FA7\u680F\uFF08\u63A8\u8350\uFF0C\u4E0E\u5C5E\u6027\u9762\u677F\u540C\u5217\uFF09").addOption("left", "\u5DE6\u4FA7\u680F\uFF08\u4E0E\u6587\u4EF6\u6811\u3001\u6807\u7B7E\u540C\u5217\uFF09").addOption("tab", "\u65B0\u6807\u7B7E\u9875").addOption("split", "\u5206\u5C4F\uFF08\u5F53\u524D\u7F16\u8F91\u5668\u5206\u5C4F\u663E\u793A\uFF09").setValue(this.plugin.settings.panelPosition || "right").onChange(async (value) => {
        this.plugin.settings.panelPosition = value;
        await this.plugin.saveSettings();
        new import_obsidian.Notice("\u9762\u677F\u4F4D\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u91CD\u65B0\u6253\u5F00\u63D2\u4EF6\u9762\u677F\u5373\u53EF\u751F\u6548");
      })
    );
  }
  async testConnection() {
    const { deepseekApiKey, deepseekApiUrl, model } = this.plugin.settings;
    if (!deepseekApiKey) {
      new import_obsidian.Notice("\u8BF7\u5148\u586B\u5199 API Key");
      return;
    }
    try {
      new import_obsidian.Notice("\u6B63\u5728\u6D4B\u8BD5\u8FDE\u63A5...");
      const startTime = Date.now();
      const response = await (0, import_obsidian.requestUrl)({
        url: deepseekApiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "\u4F60\u597D" }],
          max_tokens: 10
        })
      });
      const latency = Date.now() - startTime;
      if (response.status === 200) {
        const respModel = response.json?.model || model;
        const tokensUsed = response.json?.usage?.total_tokens;
        const tokenInfo = tokensUsed ? ` \xB7 \u6D88\u8017 ${tokensUsed} tokens` : "";
        new import_obsidian.Notice(`\u2713 \u8FDE\u63A5\u6210\u529F \xB7 \u6A21\u578B: ${respModel} \xB7 \u5EF6\u8FDF: ${latency}ms${tokenInfo}`, 8e3);
      } else {
        new import_obsidian.Notice(`API \u8FDE\u63A5\u5931\u8D25\uFF1AHTTP ${response.status}`, 8e3);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      let friendly = msg;
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        friendly = "API Key \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u68C0\u67E5";
      } else if (msg.includes("429")) {
        friendly = "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\u6216\u989D\u5EA6\u4E0D\u8DB3\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      } else if (msg.includes("Failed to fetch") || msg.includes("network")) {
        friendly = "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 API URL \u6216\u7F51\u7EDC\u8BBE\u7F6E";
      }
      new import_obsidian.Notice(`\u2717 \u8FDE\u63A5\u5931\u8D25\uFF1A${friendly}`, 1e4);
    }
  }
};

// src/extractor.ts
var import_obsidian5 = require("obsidian");

// src/utils/tokenizer.ts
function tokenize(text, options) {
  if (!text)
    return /* @__PURE__ */ new Map();
  const ngramSize = options?.ngramSize ?? 3;
  const normalized = text.toLowerCase();
  const tokens = /* @__PURE__ */ new Map();
  const chunks = normalized.replace(/[^\w\s\u4e00-\u9fff]/g, " ").split(/\s+/).filter((w) => w.length >= 1);
  for (const chunk of chunks) {
    if (/[\u4e00-\u9fff]/.test(chunk)) {
      if (chunk.length >= ngramSize) {
        for (let i = 0; i <= chunk.length - ngramSize; i++) {
          const gram = chunk.slice(i, i + ngramSize);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      } else if (chunk.length >= 2) {
        for (let i = 0; i <= chunk.length - 2; i++) {
          const gram = chunk.slice(i, i + 2);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      }
    } else {
      if (chunk.length >= 2 && !STOP_WORDS.has(chunk)) {
        tokens.set(chunk, (tokens.get(chunk) || 0) + 1);
      }
    }
  }
  return tokens;
}
function extractKeywordSet(text) {
  const tokenMap = tokenize(text, { ngramSize: 2 });
  return new Set(tokenMap.keys());
}

// src/gate/types.ts
function ok() {
  return { status: "ok" };
}
function warn(reason) {
  return { status: "warn", reason };
}
function block(reason) {
  return { status: "block", reason };
}

// src/gate/length.ts
var DEFAULT_MIN_LENGTH = 50;
var DEFAULT_WARN_LENGTH = 200;
var DEFAULT_MAX_LENGTH = 5e4;
var DEFAULT_WARN_MAX_LENGTH = 2e4;
function checkLength(content, minLength = DEFAULT_MIN_LENGTH, warnLength = DEFAULT_WARN_LENGTH, maxLength = DEFAULT_MAX_LENGTH, warnMaxLength = DEFAULT_WARN_MAX_LENGTH) {
  const len = content.length;
  if (len < minLength) {
    return block(`\u5185\u5BB9\u8FC7\u77ED\uFF08${len} \u5B57\uFF09\uFF0C\u53EF\u80FD\u4FE1\u606F\u4E0D\u8DB3`);
  }
  if (len < warnLength) {
    return warn(`\u5185\u5BB9\u504F\u77ED\uFF08${len} \u5B57\uFF09\uFF0C\u63D0\u70BC\u7ED3\u679C\u53EF\u80FD\u6709\u9650`);
  }
  if (maxLength > 0 && len > maxLength) {
    return block(`\u5185\u5BB9\u8FC7\u957F\uFF08${len} \u5B57\uFF09\uFF0C\u5DF2\u8D85\u8FC7 ${maxLength} \u5B57\u9650\u5236\uFF0C\u5EFA\u8BAE\u5206\u6BB5\u540E\u63D0\u70BC`);
  }
  if (warnMaxLength > 0 && len > warnMaxLength) {
    return warn(`\u5185\u5BB9\u8F83\u957F\uFF08${len} \u5B57\uFF09\uFF0C\u63D0\u70BC\u65F6\u95F4\u53EF\u80FD\u8F83\u957F`);
  }
  return ok();
}

// src/gate/quality.ts
var COMMERCIAL_SPAM = [
  "\u70B9\u51FB\u8FD9\u91CC",
  "\u7ACB\u5373\u8D2D\u4E70",
  "\u9650\u65F6\u4F18\u60E0",
  "\u62A2\u8D2D",
  "\u5E7F\u544A",
  "\u63A8\u5E7F",
  "\u8D5E\u52A9",
  "\u70B9\u51FB\u94FE\u63A5",
  // 英文广告词
  "buy now",
  "click here",
  "limited offer",
  "special offer",
  "order now",
  "shop now",
  "save big",
  "best price",
  "free trial",
  "sign up now",
  "subscribe now",
  "100% free",
  "no credit card",
  "act now"
];
var LOW_QUALITY_SIGNALS = [
  "\u4F60\u7EDD\u5BF9\u60F3\u4E0D\u5230",
  "\u60CA\u5446\u4E86",
  "\u70B8\u88C2",
  // 英文标题党
  "you won't believe",
  "shocking",
  "amazing trick",
  "this one weird trick",
  "doctors hate",
  "they don't want you to know"
];
var AD_VARIANT_PATTERNS = [
  /限[时期限].{0,3}[优特惠抢]/g,
  /点击.{0,3}(这里|链接|进入)/g,
  /(?:🔥|💰|🎁|👉).{0,5}(?:优惠|抢购|福利|免费)/g,
  // 英文变体模式
  /(?:100%|FREE|LIMITED).{0,10}(?:trial|offer|time)/gi
];
function checkQuality(content, blockCount, warnCount) {
  const lower = content.toLowerCase();
  const blockThreshold = blockCount ?? 3;
  const warnThreshold = warnCount ?? 1;
  const matchedAds = COMMERCIAL_SPAM.filter((kw) => lower.includes(kw.toLowerCase()));
  const matchedLowQ = LOW_QUALITY_SIGNALS.filter((kw) => lower.includes(kw.toLowerCase()));
  let variantHits = 0;
  const variantMatches = [];
  for (const pattern of AD_VARIANT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      variantHits += matches.length;
      variantMatches.push(...matches.slice(0, 3));
    }
  }
  const totalHits = matchedAds.length + matchedLowQ.length + variantHits;
  const contentLen = content.length || 1;
  const hitRate = totalHits / (contentLen / 100);
  if (totalHits >= blockThreshold) {
    const allMatches = [...matchedAds, ...matchedLowQ, ...variantMatches];
    const rateInfo = hitRate >= 0.1 ? `\uFF08\u5BC6\u5EA6 ${hitRate.toFixed(1)}/\u767E\u5B57\uFF09` : "";
    return block(`\u68C0\u6D4B\u5230\u5927\u91CF\u4F4E\u8D28\u4FE1\u53F7\uFF08${allMatches.join("\u3001")}\uFF09${rateInfo}\uFF0C\u7591\u4F3C\u4E3A\u5E7F\u544A\u6216\u8425\u9500\u5185\u5BB9`);
  }
  if (totalHits >= warnThreshold) {
    const allMatches = [...matchedAds, ...matchedLowQ, ...variantMatches];
    const rateInfo = hitRate >= 0.1 ? `\uFF08\u5BC6\u5EA6 ${hitRate.toFixed(1)}/\u767E\u5B57\uFF09` : "";
    return warn(`\u68C0\u6D4B\u5230\u5C11\u91CF\u4F4E\u8D28\u4FE1\u53F7\uFF08${allMatches.join("\u3001")}\uFF09${rateInfo}\uFF0C\u5EFA\u8BAE\u4EBA\u5DE5\u786E\u8BA4`);
  }
  return ok();
}
var STUFFING_BLOCK_RATE = 3;
var STUFFING_WARN_RATE = 1.5;
var STUFFING_MIN_LENGTH = 200;
var STUFFING_MIN_COUNT = 5;
function checkKeywordStuffing(content, tokenMap, blockRate = STUFFING_BLOCK_RATE, warnRate = STUFFING_WARN_RATE, minLength = STUFFING_MIN_LENGTH, minCount = STUFFING_MIN_COUNT, topN = 5) {
  if (content.length < minLength)
    return ok();
  if (tokenMap.size < 10)
    return ok();
  const contentLen = content.length || 1;
  const sorted = [...tokenMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  const stuffed = [];
  for (const [token, count] of sorted) {
    if (count < minCount)
      break;
    const rate = count / (contentLen / 100);
    if (rate >= warnRate) {
      stuffed.push({ token, rate });
    }
  }
  if (stuffed.length === 0)
    return ok();
  const maxRate = stuffed[0].rate;
  const labels = stuffed.map((s) => `"${s.token}"(${s.rate.toFixed(1)}/\u767E\u5B57)`).join("\u3001");
  if (maxRate >= blockRate) {
    return block(`\u5173\u952E\u8BCD\u5806\u780C\uFF1A${labels}\uFF0C\u7591\u4F3CSEO\u4F18\u5316\u5185\u5BB9`);
  }
  return warn(`\u90E8\u5206\u77ED\u8BED\u91CD\u590D\u9891\u7387\u8F83\u9AD8\uFF1A${labels}\uFF0C\u5EFA\u8BAE\u4EBA\u5DE5\u786E\u8BA4`);
}

// src/gate/density.ts
function checkDensity(content, tokenMap, minDensity = GATE_MIN_DENSITY, warnDensity = GATE_WARN_DENSITY) {
  const total = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);
  if (total < 20)
    return ok();
  const unique = tokenMap.size;
  const rawDensity = unique / total;
  const adaptiveMin = minDensity * Math.max(0.3, 1 / Math.sqrt(Math.log10(total + 10)));
  const adaptiveWarn = warnDensity * Math.max(0.5, 1 / Math.sqrt(Math.log10(total + 10)));
  if (rawDensity < adaptiveMin) {
    return block(`\u4FE1\u606F\u5BC6\u5EA6\u6781\u4F4E\uFF08${(rawDensity * 100).toFixed(0)}%\uFF09\uFF0C\u5927\u91CF\u91CD\u590D\u5185\u5BB9\uFF0C\u7591\u4F3CSEO\u6C34\u6587`);
  }
  if (rawDensity < adaptiveWarn) {
    return warn(`\u4FE1\u606F\u5BC6\u5EA6\u504F\u4F4E\uFF08${(rawDensity * 100).toFixed(0)}%\uFF09\uFF0C\u53EF\u80FD\u5B58\u5728\u91CD\u590D\u5185\u5BB9`);
  }
  return ok();
}

// src/gate/noise.ts
function checkNoiseRatio(content, maxNoise = GATE_MAX_NOISE_RATIO, warnNoise = GATE_WARN_NOISE_RATIO) {
  if (content.length < GATE_MIN_CONTENT_LENGTH)
    return ok();
  let noiseChars = 0;
  for (const ch of content) {
    if (isNoise(ch))
      noiseChars++;
  }
  const ratio = noiseChars / content.length;
  if (ratio > maxNoise) {
    return block(`\u566A\u58F0\u5360\u6BD4\u8FC7\u9AD8\uFF08${(ratio * 100).toFixed(0)}%\uFF09\uFF0C\u5185\u5BB9\u53EF\u80FD\u4E3A\u56FE\u7247\u6B8B\u7559\u6216\u4E71\u7801`);
  }
  if (ratio > warnNoise) {
    return warn(`\u566A\u58F0\u5360\u6BD4\u8F83\u9AD8\uFF08${(ratio * 100).toFixed(0)}%\uFF09\uFF0C\u5EFA\u8BAE\u68C0\u67E5\u5185\u5BB9\u5B8C\u6574\u6027`);
  }
  return ok();
}
function isNoise(ch) {
  const code = ch.codePointAt(0);
  if (code >= 32 && code <= 255)
    return false;
  if (code >= 256 && code <= 591)
    return false;
  if (code >= 1024 && code <= 1279)
    return false;
  if (code >= 880 && code <= 1023)
    return false;
  if (code >= 1536 && code <= 1791)
    return false;
  if (code >= 2304 && code <= 2431)
    return false;
  if (code >= 3584 && code <= 3711)
    return false;
  if (code >= 19968 && code <= 40959)
    return false;
  if (code >= 13312 && code <= 19903)
    return false;
  if (code >= 131072 && code <= 173791)
    return false;
  if (code >= 12352 && code <= 12447)
    return false;
  if (code >= 12448 && code <= 12543)
    return false;
  if (code >= 44032 && code <= 55215)
    return false;
  if (code === 9 || code === 10 || code === 13)
    return false;
  if (code >= 8192 && code <= 8303)
    return false;
  if (code >= 12288 && code <= 12351)
    return false;
  if (code >= 65280 && code <= 65519)
    return false;
  if (code >= 127744 && code <= 129535)
    return false;
  if (code >= 129536 && code <= 129647)
    return false;
  if (code >= 127462 && code <= 127487)
    return false;
  if (code >= 8704 && code <= 8959)
    return false;
  if (code >= 9472 && code <= 9599)
    return false;
  return true;
}

// src/gate/html.ts
var HTML_ARTIFACT_PATTERNS = [
  /<[a-z][a-z0-9]*\s[^>]*>/gi,
  /<\/[a-z][a-z0-9]*>/gi,
  /<(script|style|iframe|object|embed)[^>]*>/gi,
  /&[a-z]{2,8};/g,
  /&#[0-9]{2,5};/g
];
var HTML_BLOCK_COUNT = 5;
var HTML_WARN_COUNT = 2;
function checkHtmlArtifacts(content, blockCount = HTML_BLOCK_COUNT, warnCount = HTML_WARN_COUNT) {
  let totalHits = 0;
  const found = [];
  for (const pattern of HTML_ARTIFACT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(...matches.slice(0, 3));
    }
  }
  if (totalHits >= blockCount) {
    return block(`\u68C0\u6D4B\u5230\u5927\u91CF HTML \u6B8B\u7559\u6807\u8BB0\uFF08${found.slice(0, 3).join("\u3001")}\uFF09\uFF0C\u5185\u5BB9\u63D0\u53D6\u53EF\u80FD\u4E0D\u5B8C\u6574`);
  }
  if (totalHits >= warnCount) {
    return warn(`\u68C0\u6D4B\u5230\u5C11\u91CF HTML \u6B8B\u7559\uFF08${found.slice(0, 3).join("\u3001")}\uFF09\uFF0C\u63D0\u70BC\u7ED3\u679C\u53EF\u80FD\u53D7\u5F71\u54CD`);
  }
  return ok();
}

// src/gate/mojibake.ts
var MOJIBAKE_PATTERNS = [
  /锟斤拷/g,
  /烫烫烫/g,
  /屯屯屯/g,
  /(?:[ÂÃÄÅÆÇÈÉÊËÌÍÎÏ]){3,}/g,
  /\uFFFD{3,}/g
];
var MOJIBAKE_BLOCK_COUNT = 3;
var MOJIBAKE_WARN_COUNT = 1;
function checkMojibake(content, blockCount = MOJIBAKE_BLOCK_COUNT, warnCount = MOJIBAKE_WARN_COUNT) {
  let totalHits = 0;
  const found = [];
  for (const pattern of MOJIBAKE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(matches[0]);
    }
  }
  if (totalHits >= blockCount) {
    return block(`\u68C0\u6D4B\u5230\u4E71\u7801\u7279\u5F81\uFF08${found.slice(0, 3).join("\u3001")}\uFF09\uFF0C\u5185\u5BB9\u7F16\u7801\u53EF\u80FD\u6709\u8BEF`);
  }
  if (totalHits >= warnCount) {
    return warn(`\u68C0\u6D4B\u5230\u7591\u4F3C\u4E71\u7801\uFF08${found[0]}\uFF09\uFF0C\u5EFA\u8BAE\u68C0\u67E5\u5185\u5BB9\u7F16\u7801`);
  }
  return ok();
}

// src/gate/link-dump.ts
var LINK_PATTERNS = [
  /https?:\/\/\S+/g,
  /www\.\S+\.\S+/g
];
var NAV_SEPARATOR_PATTERN = /\s*[|·•»›▸→]\s*/g;
function checkLinkDump(content, linkBlockRatio, linkBlockDensity) {
  if (content.length < 100)
    return ok();
  const blockRatio = linkBlockRatio ?? 0.4;
  const blockDensity = linkBlockDensity ?? 1;
  let linkCount = 0;
  let linkChars = 0;
  for (const pattern of LINK_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      linkCount += matches.length;
      linkChars += matches.reduce((sum, m) => sum + m.length, 0);
    }
  }
  const navMatches = content.match(NAV_SEPARATOR_PATTERN);
  const navSeparators = navMatches ? navMatches.length : 0;
  const linkRatio = linkChars / content.length;
  const linkDensityVal = linkCount / (content.length / 100);
  if (linkRatio > blockRatio && linkCount >= 5 && linkDensityVal > blockDensity) {
    return block(`\u5185\u5BB9\u4E2D\u94FE\u63A5\u5360\u6BD4\u8FC7\u9AD8\uFF08${(linkRatio * 100).toFixed(0)}%\uFF0C${linkCount} \u4E2A\u94FE\u63A5\uFF09\uFF0C\u53EF\u80FD\u4E3A\u5BFC\u822A\u9875\u800C\u975E\u6587\u7AE0`);
  }
  if (navSeparators >= 5) {
    return warn(`\u68C0\u6D4B\u5230\u591A\u5904\u5BFC\u822A\u5206\u9694\u7B26\uFF08${navSeparators} \u5904\uFF09\uFF0C\u5185\u5BB9\u53EF\u80FD\u4E3A\u5BFC\u822A\u680F\u6216\u83DC\u5355`);
  }
  if (linkDensityVal > 0.5 && linkCount >= 5) {
    return warn(`\u5185\u5BB9\u5305\u542B\u8F83\u591A\u94FE\u63A5\uFF08${linkCount} \u4E2A\uFF09\uFF0C\u53EF\u80FD\u4E0D\u662F\u6587\u7AE0\u6B63\u6587`);
  }
  return ok();
}

// src/gate/index.ts
var WARN_BLOCK_THRESHOLD = 3;
function collect(rule, reasons, warnings) {
  const { name, check } = rule;
  if (check.status === "block") {
    reasons.push(`[${name}] ${check.reason}`);
  } else if (check.status === "warn") {
    warnings.push(`[${name}] ${check.reason}`);
  }
}
function buildSummary(reasons) {
  if (reasons.length === 0)
    return "";
  if (reasons.length === 1)
    return reasons[0];
  return `${reasons[0]}\uFF08\u53E6\u6709 ${reasons.length - 1} \u4E2A\u95EE\u9898\uFF09`;
}
function runGateChecks(content, processedContents = [], profileConfig) {
  const reasons = [];
  const warnings = [];
  collect({ name: "\u957F\u5EA6", check: checkLength(content, profileConfig?.gateMinLength, profileConfig?.gateWarnLength, profileConfig?.gateMaxLength, profileConfig?.gateWarnMaxLength) }, reasons, warnings);
  collect({ name: "\u8D28\u91CF", check: checkQuality(content, profileConfig?.gateQualityBlockCount, profileConfig?.gateQualityWarnCount) }, reasons, warnings);
  collect({ name: "HTML", check: checkHtmlArtifacts(content, profileConfig?.gateHtmlBlockCount, profileConfig?.gateHtmlWarnCount) }, reasons, warnings);
  collect({ name: "\u4E71\u7801", check: checkMojibake(content, profileConfig?.gateMojibakeBlockCount, profileConfig?.gateMojibakeWarnCount) }, reasons, warnings);
  collect({ name: "\u94FE\u63A5", check: checkLinkDump(content, profileConfig?.gateLinkBlockRatio, profileConfig?.gateLinkBlockDensity) }, reasons, warnings);
  if (reasons.length === 0) {
    const tokenMap = tokenize(content, { ngramSize: 2 });
    const minDensity = profileConfig?.gateMinDensity;
    const warnDensity = profileConfig?.gateWarnDensity;
    const maxNoise = profileConfig?.gateMaxNoiseRatio;
    const warnNoise = profileConfig?.gateWarnNoiseRatio;
    collect({ name: "\u5806\u780C", check: checkKeywordStuffing(content, tokenMap, profileConfig?.gateKeywordStuffingBlockRate, profileConfig?.gateKeywordStuffingWarnRate, profileConfig?.gateKeywordStuffingMinLength, profileConfig?.gateKeywordStuffingMinCount, profileConfig?.gateKeywordStuffingTopN) }, reasons, warnings);
    collect({ name: "\u5BC6\u5EA6", check: checkDensity(content, tokenMap, minDensity, warnDensity) }, reasons, warnings);
    collect({ name: "\u566A\u58F0", check: checkNoiseRatio(content, maxNoise, warnNoise) }, reasons, warnings);
  }
  if (reasons.length === 0 && warnings.length >= WARN_BLOCK_THRESHOLD) {
    reasons.push(`[\u7EFC\u5408] \u7D2F\u79EF ${warnings.length} \u6761\u8B66\u544A\uFF0C\u8D28\u91CF\u4E0D\u8FBE\u6807`);
  }
  return {
    passed: reasons.length === 0,
    summary: buildSummary(reasons),
    reasons,
    warnings
  };
}

// src/utils/notes-standards.ts
var CORE_CONCEPTS = [
  "\u4FDD\u62A4",
  "\u5047\u8BBE",
  "\u77DB\u76FE",
  "\u5F71\u54CD",
  "\u6548\u5E94",
  "\u673A\u5236",
  "\u7B56\u7565",
  "\u65B9\u6CD5",
  "\u601D\u7EF4",
  "\u6A21\u5F0F",
  "\u504F\u89C1",
  "\u8BEF\u533A",
  "\u529F\u80FD",
  "\u9650\u5236",
  "\u4F18\u52BF",
  "\u52A3\u52BF",
  "\u7279\u70B9",
  "\u7279\u5F81",
  "\u539F\u7406",
  "\u539F\u5219",
  "\u6807\u51C6",
  "\u89C4\u8303",
  "\u95EE\u9898",
  "\u6311\u6218",
  "\u98CE\u9669",
  "\u673A\u9047",
  "\u53D8\u5316",
  "\u8D8B\u52BF",
  "\u540E\u679C",
  "\u610F\u4E49",
  "\u4EF7\u503C",
  "Check",
  "Effect",
  "War",
  "API",
  "AI",
  "ML",
  "UX",
  "UI",
  "SDK"
];
var POSSESSIVE_PATTERN = new RegExp(
  `^(.{0,6})?(.+?(?:${CORE_CONCEPTS.join("|")}))(.{0,8})?$`
);
var TAIL_PARTIAL_WORD_RE = /[a-zA-Z]{1,4}$/;
var SAFE_BOUNDARY_RE = /([\s\u4e00-\u9fa5])(?=[a-zA-Z]*$)/;
var WEAK_ENDING_RE = /(?:的|如|和|与|或|对|在|被|将|把|了|着|吗|呢|啊|吧|么|[a-zA-Z]{1,2})$/;
var KNOWN_TERMS = [
  "AI",
  "ML",
  "UX",
  "UI",
  "API",
  "SDK",
  "OS",
  "CPU",
  "GPU",
  "RAM",
  "IO",
  "ID",
  "OK",
  "TV",
  "PC",
  "HR",
  "PR",
  "PM",
  "QA",
  "App",
  "Web",
  "Mac",
  "iOS",
  "Android",
  "Check",
  "Effect",
  "War",
  "Note",
  "Data",
  "Code",
  "Node",
  "Git",
  "HTTP",
  "JSON"
];
var SENTENCE_FRAGMENTS = ["\u7684\u5982", "\u8BA4\u4E3A", "\u53D1\u73B0", "\u6307\u51FA", "\u663E\u793A", "\u8868\u660E", "\u901A\u8FC7", "\u4EE5\u53CA"];
var TITLE_SUFFIX_RE = /(的研究|的发现|的分析|的影响|的问题|的方法|的策略|的机制|的效果|的报告|的调查)$/gi;
function validateAtomicNote(note) {
  const issues = [];
  if (!note.title || note.title.trim() === "") {
    issues.push("\u7F3A\u5C11\u6807\u9898 \u2014 AI \u672A\u751F\u6210\u6807\u9898\uFF0C\u5DF2\u8DF3\u8FC7\u6B64\u6761\u7B14\u8BB0");
  }
  const headingMatches = note.content.match(/^##\s+/gm);
  if (headingMatches && headingMatches.length > 1) {
    issues.push("\u53EF\u80FD\u5305\u542B\u591A\u4E2A\u4E3B\u9898\uFF0C\u5EFA\u8BAE\u62C6\u5206");
  }
  if (note.content.length < MIN_NOTE_CONTENT_LENGTH) {
    issues.push("\u5185\u5BB9\u8FC7\u77ED\uFF0C\u53EF\u80FD\u7F3A\u4E4F\u4FE1\u606F\u5BC6\u5EA6");
  }
  const hasHardIssue = note.content.length < MIN_NOTE_CONTENT_LENGTH || (!note.title || note.title.trim() === "");
  return {
    valid: !hasHardIssue,
    issues
  };
}
function parseTags(raw) {
  return raw.replace(/^\[|\]$/g, "").split(/[,，]/).map((t) => t.trim().replace(/^\[|\]$/g, "").replace(/^["']|["']$/g, "")).filter(Boolean);
}
function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function parseAINoteOutput(text, shouldEnsureTitles = true) {
  const notes = [];
  let cleaned = stripCodeBlocks(text.trim());
  if (/无符合标准的原子笔记|无法提炼|没有符合标准/.test(cleaned)) {
    return [];
  }
  const standardNotes = tryParseFrontmatterFormat(cleaned);
  if (standardNotes.length > 0) {
    return shouldEnsureTitles ? ensureTitles(standardNotes) : standardNotes;
  }
  if (cleaned !== text.trim()) {
    const rawNotes = tryParseFrontmatterFormat(text.trim());
    if (rawNotes.length > 0) {
      return shouldEnsureTitles ? ensureTitles(rawNotes) : rawNotes;
    }
  }
  const fallbackNotes = tryParseListFormat(cleaned);
  return shouldEnsureTitles ? ensureTitles(fallbackNotes) : fallbackNotes;
}
function stripCodeBlocks(text) {
  const codeBlockPattern = /^\s*```(?:yaml|yml|json|markdown|md)?\s*\n([\s\S]*?)\n```\s*$/;
  const match = text.match(codeBlockPattern);
  if (match) {
    return match[1].trim();
  }
  return text;
}
function tryParseFrontmatterFormat(text) {
  const notes = [];
  const notePattern = /(?:^|\n)---\n([\s\S]*?)---\n([\s\S]*?)(?=(?:\n---\s*$)|(?:\n---\n)|$)/g;
  let match;
  while ((match = notePattern.exec(text)) !== null) {
    const fmBlock = match[1];
    const bodyBlock = match[2];
    const note = {
      title: "",
      content: "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const fmLines = fmBlock.split("\n");
    for (const line of fmLines) {
      const titleMatch = line.match(/^title:\s*(.+)/);
      const sourceMatch = line.match(/^source:\s*(.+)/);
      const tagsMatch = line.match(/^tags:\s*(.+)/);
      if (titleMatch)
        note.title = stripQuotes(titleMatch[1].trim());
      if (sourceMatch)
        note.source = stripQuotes(sourceMatch[1].trim());
      if (tagsMatch)
        note.tags = parseTags(tagsMatch[1]);
    }
    let content = bodyBlock.trim();
    content = content.replace(/\n?---\s*$/, "").trim();
    if (content === "---" || content === "") {
      content = "";
    }
    note.content = content;
    if (note.title || note.content) {
      notes.push(note);
    }
  }
  if (notes.length === 0 && text.includes("---")) {
    return tryParseFrontmatterFallback(text);
  }
  return notes;
}
function tryParseFrontmatterFallback(text) {
  const notes = [];
  const blocks = text.split(/\n---\n/);
  for (let i = 0; i < blocks.length; i++) {
    const block2 = blocks[i].trim();
    if (!block2 || block2 === "---")
      continue;
    const note = {
      title: "",
      content: "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const hasMetadata = /^(title|source|tags):\s/m.test(block2);
    if (hasMetadata) {
      const lines = block2.split("\n");
      const metaEndIndex = lines.length;
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        const titleMatch = line.match(/^title:\s*(.+)/);
        const sourceMatch = line.match(/^source:\s*(.+)/);
        const tagsMatch = line.match(/^tags:\s*(.+)/);
        if (titleMatch)
          note.title = stripQuotes(titleMatch[1].trim());
        if (sourceMatch)
          note.source = stripQuotes(sourceMatch[1].trim());
        if (tagsMatch)
          note.tags = parseTags(tagsMatch[1]);
        if (!line.match(/^(title|source|tags):\s/) && j > 0 && note.title) {
          note.content = lines.slice(j).join("\n").replace(/^\n+/, "").trim();
          break;
        }
      }
      if (!note.content && i + 1 < blocks.length) {
        const nextBlock = blocks[i + 1].trim();
        if (!/^(title|source|tags):\s/m.test(nextBlock) && nextBlock !== "---") {
          note.content = nextBlock.replace(/\n?---\s*$/, "").trim();
          i++;
        }
      }
    } else {
      note.content = block2.replace(/\n?---\s*$/, "").trim();
    }
    if ((note.title || note.content) && note.content !== "---") {
      notes.push(note);
    }
  }
  return notes;
}
function tryParseListFormat(text) {
  const notes = [];
  const segments = text.split(/\n(?=\d+[\.\、]\s+\**|\#{1,3}\s)/);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed)
      continue;
    const note = {
      title: "",
      content: "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const lines = trimmed.split("\n");
    const firstLine = lines[0].trim();
    let numberedMatch = firstLine.match(/^\d+[\.\、]\s+\**([^*\n]+)\**\s*$/);
    let headingMatch = firstLine.match(/^#{1,3}\s+(.+)$/);
    let boldMatch = firstLine.match(/^\*\*(.+?)\*\*$/);
    let extractedTitle = null;
    let contentStartLine = 0;
    if (numberedMatch) {
      extractedTitle = cleanTitle(numberedMatch[1].trim());
      contentStartLine = 1;
    } else if (headingMatch) {
      extractedTitle = cleanTitle(headingMatch[1].trim());
      contentStartLine = 1;
    } else if (boldMatch) {
      extractedTitle = cleanTitle(boldMatch[1].trim());
      contentStartLine = 1;
    }
    if (extractedTitle) {
      note.title = extractedTitle;
    }
    const contentLines = [];
    for (let i = contentStartLine; i < lines.length; i++) {
      const line = lines[i].trim();
      const tagMatch = line.match(/^tags?:\s*(.+)/);
      const srcMatch = line.match(/^(?:source|来源)[:：]\s*(.+)/);
      if (tagMatch) {
        note.tags = parseTags(tagMatch[1]);
        continue;
      }
      if (srcMatch) {
        note.source = stripQuotes(srcMatch[1].trim());
        continue;
      }
      contentLines.push(lines[i]);
    }
    note.content = contentLines.join("\n").trim();
    if (note.content) {
      notes.push(note);
    }
  }
  if (notes.length === 0 && text.trim()) {
    notes.push({
      title: "",
      content: text.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return notes;
}
function cleanTitle(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^(?:\d+[\.\、]\s*|[\[【\(（]?\d+[\]】\)）]\s*|^[①②③④⑤⑥⑦⑧⑨⑩]\s*)/, "");
  cleaned = cleaned.replace(/^#{1,3}\s*/, "");
  cleaned = cleaned.replace(/^\*\*|\*\*$/g, "");
  cleaned = cleaned.replace(/^[：:\s,，]+|[：:\s,，]+$/g, "");
  if (cleaned.length < 2)
    return "";
  if (cleaned.length > 20) {
    const shortened = shortenToBulletTitle(cleaned);
    if (isQualityTitle(shortened)) {
      return shortened;
    }
    return "";
  }
  return cleaned;
}
function shortenToBulletTitle(longTitle) {
  const colonMatch = longTitle.match(/^(.+?)[：:———–—]\s*/);
  if (colonMatch) {
    const topic = colonMatch[1].trim();
    if (topic.length >= 4 && topic.length <= 22)
      return topic;
    if (topic.length > 22)
      return shortenToBulletTitle(topic);
  }
  const commaIdx = longTitle.search(/[，,]/);
  if (commaIdx > 5 && commaIdx <= 22) {
    return longTitle.slice(0, commaIdx).trim();
  }
  const possessiveMatch = longTitle.match(POSSESSIVE_PATTERN);
  if (possessiveMatch && possessiveMatch[2]) {
    const core = possessiveMatch[2].trim();
    const modifier = possessiveMatch[1]?.trim() || "";
    const combined = (modifier + core).trim();
    if (combined.length >= 4 && combined.length <= 22)
      return combined;
    if (core.length >= 4 && core.length <= 20)
      return core;
  }
  const englishTerms = longTitle.match(/[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*/g);
  if (englishTerms && englishTerms.length > 0) {
    const bestTerm = englishTerms.reduce((a, b) => a.length >= b.length ? a : b);
    if (bestTerm.length >= 4 && bestTerm.length <= 20) {
      return bestTerm;
    }
    const termIdx = longTitle.indexOf(bestTerm);
    if (termIdx > 2) {
      const prefix = longTitle.slice(Math.max(0, termIdx - 6), termIdx).replace(/^[的\s]+/, "");
      const combo = (prefix + bestTerm).trim();
      if (combo.length >= 4 && combo.length <= 20)
        return combo;
    }
  }
  return safeTruncate(longTitle, 18);
}
function safeTruncate(text, maxLen) {
  if (text.length <= maxLen)
    return text;
  const candidate = text.slice(0, maxLen);
  const tailPartialWord = candidate.match(TAIL_PARTIAL_WORD_RE);
  if (tailPartialWord) {
    const lastSafeBoundary = candidate.search(SAFE_BOUNDARY_RE);
    if (lastSafeBoundary > 3) {
      return candidate.slice(0, lastSafeBoundary + 1).trim();
    }
    return candidate.replace(/[a-zA-Z]+$/, "").trim() || text.slice(0, 12);
  }
  let result = candidate.trim();
  result = result.replace(WEAK_ENDING_RE, "");
  if (result.length < 4) {
    return text.slice(0, 10).replace(/[a-zA-Z]+$/, "").trim();
  }
  return result;
}
function ensureTitles(notes) {
  for (const note of notes) {
    if (!note.title || note.title.trim() === "") {
      note.title = extractTitleFromContent(note.content);
    } else {
      const cleaned = cleanTitle(note.title);
      if (cleaned) {
        note.title = cleaned;
      }
    }
  }
  return notes;
}
var GARBAGE_TAGS = /* @__PURE__ */ new Set(["none", "null", "n/a", "na", "\u65E0", "\u6CA1\u6709", "\u7A7A", "\u672A\u6807\u6CE8", "\u6682\u65E0", "\u5F85\u8865\u5145"]);
function ensureTags(notes, userPreferences) {
  for (const note of notes) {
    const validTags = (note.tags || []).filter(
      (t) => t.length >= 2 && !GARBAGE_TAGS.has(t.toLowerCase())
    );
    if (validTags.length > 0)
      continue;
    const keywords = extractTagCandidates(note.content, note.title);
    if (userPreferences && userPreferences.length > 0) {
      const matched = keywords.filter(
        (k) => userPreferences.some((pref) => k.includes(pref) || pref.includes(k))
      );
      const unmatched = keywords.filter(
        (k) => !userPreferences.some((pref) => k.includes(pref) || pref.includes(k))
      );
      note.tags = [...matched, ...unmatched].slice(0, 6);
    } else {
      note.tags = [.../* @__PURE__ */ new Set([...keywords])].slice(0, 6);
    }
  }
  return notes;
}
function extractTitleFromContent(content) {
  if (!content)
    return `note-${Date.now()}`;
  const firstLine = content.split("\n")[0].trim();
  const cleanedLine = cleanTitle(firstLine);
  if (cleanedLine)
    return cleanedLine;
  const sentenceEnd = firstLine.match(/^[^。！？；]{1,30}[。！？；]?/);
  if (sentenceEnd) {
    let result = sentenceEnd[0].replace(/[。，！？；：\s]+$/, "").trim();
    if (result.length > 18) {
      result = safeTruncate(result, 18);
    }
    return result.length >= 2 ? result : `note-${Date.now()}`;
  }
  const fallback = safeTruncate(firstLine, 18);
  return fallback.length >= 2 ? fallback : `note-${Date.now()}`;
}
function isQualityTitle(title) {
  const t = title.trim();
  if (t.length < 4 || t.length > 25)
    return false;
  const hasChinese = /[\u4e00-\u9fa5]/.test(t);
  const tailEnglish = t.match(/[a-zA-Z]+$/);
  if (hasChinese && tailEnglish) {
    const tail = tailEnglish[0];
    if (tail.length <= 5 && !KNOWN_TERMS.some((known) => tail === known || tail.endsWith(known))) {
      return false;
    }
  }
  for (const frag of SENTENCE_FRAGMENTS) {
    if (t.includes(frag) && t.length > 12) {
      return false;
    }
  }
  return true;
}
function extractTagCandidates(content, title) {
  const keywords = /* @__PURE__ */ new Set();
  const boldMatches = content.match(/\*\*(.+?)\*\*/g);
  if (boldMatches) {
    for (const b of boldMatches) {
      const word = b.replace(/\*\*/g, "").trim();
      if (word.length >= 2 && word.length <= 15) {
        keywords.add(word);
      }
    }
  }
  const parenMatches = content.match(/[（(]([a-zA-Z\u4e00-\u9fa5]{2,15})[）)]/g);
  if (parenMatches) {
    for (const p of parenMatches) {
      const word = p.replace(/[（()）]/g, "");
      keywords.add(word);
    }
  }
  const quoted = content.match(/[""「」『』《》]([^""「」『』《》]{2,10})[""「」『』《》]/g);
  if (quoted) {
    for (const q of quoted) {
      keywords.add(q.replace(/[""「」『』《》]/g, ""));
    }
  }
  if (title && isQualityTitle(title)) {
    const coreTitle = title.replace(TITLE_SUFFIX_RE, "").trim();
    if (coreTitle.length >= 2 && coreTitle.length <= 20) {
      keywords.add(coreTitle);
    }
  }
  if (keywords.size < 2) {
    const firstSentence = content.split(/[\n。！？]/)[0];
    const subjectMatch = firstSentence.match(/^(.{2,12})(?:是|指|通过|利用|基于|采用|包括|涉及|表现为|被称为)/);
    if (subjectMatch) {
      keywords.add(subjectMatch[1].trim());
    }
  }
  return Array.from(keywords).slice(0, 6);
}

// src/deduplicator.ts
var import_obsidian2 = require("obsidian");
function computeIdfTable(docTokens, docCount) {
  const N = docCount || docTokens.length || 1;
  const docFreq = /* @__PURE__ */ new Map();
  for (const tokens of docTokens) {
    for (const token of tokens.keys()) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }
  const idf = /* @__PURE__ */ new Map();
  for (const [token, df] of docFreq) {
    idf.set(token, Math.log((N + IDF_SMOOTH) / (df + IDF_SMOOTH)) + 1);
  }
  return { docCount: N, idf };
}
function computeTfIdfVector(tokens, idfTable) {
  const weights = /* @__PURE__ */ new Map();
  let sumSq = 0;
  for (const [token, freq] of tokens) {
    const tf = freq;
    const idf = idfTable.idf.get(token) || Math.log((idfTable.docCount + IDF_SMOOTH) / (0 + IDF_SMOOTH)) + 1;
    const weight = tf * idf;
    weights.set(token, weight);
    sumSq += weight * weight;
  }
  return {
    weights,
    norm: Math.sqrt(sumSq),
    tokenCount: tokens.size
  };
}
function cosineSimilarity(v1, v2) {
  if (v1.norm === 0 || v2.norm === 0)
    return 0;
  if (v1.tokenCount < MIN_TOKENS_THRESHOLD || v2.tokenCount < MIN_TOKENS_THRESHOLD)
    return 0;
  const [small, large] = v1.weights.size <= v2.weights.size ? [v1.weights, v2.weights] : [v2.weights, v1.weights];
  let dot = 0;
  for (const [token, weight] of small) {
    const otherWeight = large.get(token);
    if (otherWeight !== void 0) {
      dot += weight * otherWeight;
    }
  }
  const sim = dot / (v1.norm * v2.norm);
  return sim > 1 ? 1 : sim < 0 ? 0 : sim;
}
var DedupCacheManager = class {
  constructor() {
    this.caches = /* @__PURE__ */ new Map();
  }
  // folder → cache
  invalidate() {
    this.caches.clear();
  }
  /** 获取某文件夹的缓存（若未过期且文件未变动） */
  get(targetFolder, vault) {
    const cached = this.caches.get(targetFolder);
    if (!cached)
      return null;
    if (Date.now() - cached.timestamp > DEDUP_CACHE_TTL)
      return null;
    for (const note of cached.notes) {
      const file = vault.getAbstractFileByPath(note.path);
      if (!(file instanceof import_obsidian2.TFile) || file.stat.mtime !== note.mtime) {
        return null;
      }
    }
    return cached;
  }
  /** 更新某文件夹的缓存 */
  set(targetFolder, notes, idfTable) {
    this.caches.set(targetFolder, { notes, idfTable, targetFolder, timestamp: Date.now() });
  }
};
var defaultDedupCache = new DedupCacheManager();
function isPathInFolder(filePath, targetFolder) {
  if (!targetFolder)
    return false;
  const normalized = targetFolder.endsWith("/") ? targetFolder.slice(0, -1) : targetFolder;
  if (filePath === normalized)
    return true;
  if (filePath.startsWith(normalized + "/"))
    return true;
  return false;
}
function crossCheckBatch(notes, threshold) {
  const effectiveThreshold = threshold ?? CROSS_BATCH_THRESHOLD;
  const uniqueNotes = [];
  const uniqueIndices = [];
  const duplicates = [];
  const docTokens = notes.map((n) => tokenize(n.content));
  const idfTable = computeIdfTable(docTokens);
  const vectors = docTokens.map((tokens) => computeTfIdfVector(tokens, idfTable));
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const vec = vectors[i];
    const length = note.content.length;
    let isDuplicate = false;
    let bestMatch = null;
    for (let j = 0; j < uniqueIndices.length; j++) {
      const uniqueIdx = uniqueIndices[j];
      const uniqueVec = vectors[uniqueIdx];
      const otherLen = notes[uniqueIdx].content.length;
      if (Math.abs(length - otherLen) / Math.max(length, otherLen) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }
      const similarity = cosineSimilarity(vec, uniqueVec);
      if (similarity > effectiveThreshold) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: `\u540C\u6279\u7B14\u8BB0 #${j + 1}: ${uniqueNotes[j].title}`,
          matchedContent: uniqueNotes[j].content.slice(0, 200),
          removedTitle: note.title,
          removedContent: note.content
        };
        break;
      }
    }
    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(note);
      uniqueIndices.push(i);
    }
  }
  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates
  };
}
async function loadAndPreprocessExistingNotes(vault, targetFolder) {
  const allFiles = vault.getMarkdownFiles();
  const existingFiles = allFiles.filter((file) => isPathInFolder(file.path, targetFolder));
  const allTokens = [];
  const rawNotes = [];
  for (let i = 0; i < existingFiles.length; i += DEDUP_BATCH_SIZE) {
    const batch = existingFiles.slice(i, i + DEDUP_BATCH_SIZE);
    const contents = await Promise.all(batch.map((f) => vault.read(f)));
    for (let j = 0; j < batch.length; j++) {
      const file = batch[j];
      const content = contents[j];
      const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)$/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      rawNotes.push({ path: file.path, content, title, mtime: file.stat.mtime });
      allTokens.push(tokenize(content));
    }
  }
  const idfTable = computeIdfTable(allTokens, allTokens.length || 1);
  const notes = rawNotes.map((rn, idx) => {
    const tokens = allTokens[idx];
    const vector = computeTfIdfVector(tokens, idfTable);
    const titleTokens = tokenize(rn.title);
    const titleVector = titleTokens.size >= MIN_TOKENS_THRESHOLD ? computeTfIdfVector(titleTokens, idfTable) : null;
    return {
      path: rn.path,
      content: rn.content,
      tokens,
      titleTokens,
      vector,
      titleVector,
      mtime: rn.mtime
    };
  });
  return { notes, idfTable };
}
async function checkAgainstVaultDetailed(vault, notes, targetFolder, cacheManager = defaultDedupCache) {
  let existingNotes;
  let idfTable;
  const cached = cacheManager.get(targetFolder, vault);
  if (cached) {
    existingNotes = cached.notes;
    idfTable = cached.idfTable;
  } else {
    const result = await loadAndPreprocessExistingNotes(vault, targetFolder);
    existingNotes = result.notes;
    idfTable = result.idfTable;
    cacheManager.set(targetFolder, existingNotes, idfTable);
  }
  const newNoteVectors = [];
  for (const note of notes) {
    const contentTokens = tokenize(note.content);
    const titleTokens = tokenize(note.title);
    const vec = computeTfIdfVector(contentTokens, idfTable);
    const titleVec = titleTokens.size >= MIN_TOKENS_THRESHOLD ? computeTfIdfVector(titleTokens, idfTable) : null;
    newNoteVectors.push({ vec, titleVec, length: note.content.length });
  }
  const results = [];
  for (let idx = 0; idx < notes.length; idx++) {
    const note = notes[idx];
    const { vec: contentVec, titleVec: newTitleVec, length } = newNoteVectors[idx];
    let bestMatch = null;
    for (const existing of existingNotes) {
      if (Math.abs(length - existing.content.length) / Math.max(length, existing.content.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }
      const contentSim = cosineSimilarity(contentVec, existing.vector);
      let titleSim = 0;
      let hasTitleMatch = false;
      if (newTitleVec && existing.titleVector) {
        titleSim = cosineSimilarity(newTitleVec, existing.titleVector);
        hasTitleMatch = true;
      }
      const combinedSim = hasTitleMatch ? titleSim * TITLE_WEIGHT + contentSim * CONTENT_WEIGHT : contentSim;
      if (!bestMatch || combinedSim > bestMatch.similarity) {
        bestMatch = {
          similarity: combinedSim,
          path: existing.path,
          content: existing.content.slice(0, 200) + (existing.content.length > 200 ? "..." : "")
        };
      }
    }
    if (bestMatch && length < SHORT_NOTE_LENGTH) {
      bestMatch.similarity = Math.min(bestMatch.similarity * 1.15, 1);
    }
    results.push({ note, noteIndex: idx, bestMatch });
  }
  return results;
}

// src/extraction/tag-preferences.ts
var BASE_SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u77E5\u8BC6\u63D0\u70BC\u52A9\u624B\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u4ECE\u7528\u6237\u63D0\u4F9B\u7684\u6587\u7AE0/\u6587\u672C\u4E2D\u63D0\u70BC\u51FA\u9AD8\u8D28\u91CF\u7684\u539F\u5B50\u7B14\u8BB0\uFF08\u5B50\u5F39\u7B14\u8BB0 / Bullet Note\uFF09\u3002

# \u5B50\u5F39\u7B14\u8BB0\uFF08Atomic Note\uFF09\u6838\u5FC3\u7406\u5FF5
\u6BCF\u4E00\u6761\u7B14\u8BB0\u90FD\u662F\u4E00\u9897\u72EC\u7ACB\u7684\u300C\u5B50\u5F39\u300D\u2014\u2014\u77ED\u5C0F\u7CBE\u608D\u3001\u81EA\u5305\u542B\u3001\u53EF\u590D\u7528\u3002\u4E0D\u662F\u6587\u7AE0\u6458\u8981\uFF0C\u4E0D\u662F\u8981\u70B9\u5217\u8868\uFF0C\u800C\u662F\u4ECE\u539F\u6587\u4E2D\u63D0\u70BC\u51FA\u7684\u3001\u6709\u72EC\u7ACB\u4EF7\u503C\u7684\u6D1E\u89C1\u788E\u7247\u3002

# \u6807\u9898\u5373\u7CBE\u534E\uFF08\u6700\u91CD\u8981 \u26A0\uFE0F\uFF09

\u6807\u9898\u4E0D\u662F\u8BDD\u9898\u6807\u7B7E\uFF0C\u800C\u662F\u8FD9\u6761\u7B14\u8BB0\u7684\u6838\u5FC3\u65AD\u8A00\uFF08claim\uFF09\u3002\u8BFB\u8005\u770B\u5B8C\u6807\u9898\uFF0C\u5E94\u8BE5\u5DF2\u7ECF\u83B7\u5F97\u4E86\u8FD9\u6761\u7B14\u8BB0 80% \u7684\u4FE1\u606F\u3002

## \u597D\u6807\u9898\u5199\u6CD5\uFF1A\u4E00\u4E2A\u77ED\u8BED + \u4E00\u4E2A\u65AD\u8A00
  \u2705 \u300C\u54CD\u5EA6\u6218\u4E89\u635F\u5BB3\u97F3\u8D28\u300D\u2014\u2014\u6709\u65AD\u8A00\uFF08\u635F\u5BB3\uFF09
  \u2705 \u300C\u7248\u6743\u4FDD\u62A4\u7684\u96F6\u548C\u5047\u8BBE\u4E0D\u6210\u7ACB\u300D\u2014\u2014\u6709\u5224\u65AD\uFF08\u4E0D\u6210\u7ACB\uFF09
  \u2705 \u300CSound Check \u4E0D\u80FD\u89E3\u51B3\u54CD\u5EA6\u6218\u4E89\u300D\u2014\u2014\u6709\u7ACB\u573A
  \u2705 \u300C\u5B58\u91CF\u601D\u7EF4\u963B\u788D\u7248\u6743\u521B\u65B0\u300D\u2014\u2014\u6709\u56E0\u679C

## \u6807\u9898\u4E09\u539F\u5219\uFF1A\u77ED\u3001\u51C6\u3001\u72E0
  - \u77ED\uFF1A5~18 \u5B57\uFF0C\u7EDD\u4E0D\u8D85\u8FC7 20 \u5B57
  - \u51C6\uFF1A\u4E00\u4E2A\u77ED\u8BED\u8BF4\u6E05\u695A\u6838\u5FC3\u6D1E\u89C1
  - \u72E0\uFF1A\u6709\u7ACB\u573A\u3001\u6709\u5224\u65AD\uFF0C\u4E0D\u4E2D\u7ACB\u3001\u4E0D\u6A21\u7CCA

# \u539F\u5B50\u7B14\u8BB0\u4E94\u6761\u6807\u51C6
1. \u4E00\u6761\u7B14\u8BB0\u53EA\u8BF4\u4E00\u4EF6\u4E8B \u2014\u2014 \u805A\u7126\u5355\u4E00\u77E5\u8BC6\u70B9
2. \u72EC\u7ACB\u53EF\u8BFB \u2014\u2014 \u4E0D\u4F9D\u8D56\u4E0A\u4E0B\u6587\uFF0C\u5355\u72EC\u770B\u80FD\u61C2
3. \u6709\u4FE1\u606F\u5BC6\u5EA6 \u2014\u2014 \u4E0D\u662F\u5B9A\u4E49\uFF0C\u662F\u6709\u6D1E\u89C1\u7684\u9648\u8FF0\u6216\u65B9\u6CD5
4. \u53EF\u884C\u52A8\u6216\u53EF\u5F15\u7528 \u2014\u2014 \u8981\u4E48\u662F\u80FD\u7528\u7684\u65B9\u6CD5\uFF0C\u8981\u4E48\u662F\u80FD\u5F15\u7528\u7684\u89C2\u70B9/\u6570\u636E
5. \u7528\u81EA\u5DF1\u7684\u8BDD\u5199 \u2014\u2014 \u4E0D\u662F\u539F\u6587\u590D\u5236\uFF0C\u662F\u7ECF\u8FC7\u7406\u89E3\u540E\u7684\u8868\u8FBE

# \u8F93\u51FA\u683C\u5F0F\uFF08\u552F\u4E00\u5141\u8BB8\u7684\u683C\u5F0F\uFF09
\u4F60\u5FC5\u987B\u4E14\u53EA\u80FD\u4F7F\u7528\u4EE5\u4E0B YAML frontmatter \u683C\u5F0F\uFF1A

---
title: \u65AD\u8A00\u578B\u77ED\u8BED\u6807\u9898\uFF085~18\u5B57\uFF09
tags: \u6807\u7B7E1, \u6807\u7B7E2
---

\u7B14\u8BB0\u6B63\u6587\uFF082~5\u53E5\u8BDD\uFF0C\u7528\u81EA\u5DF1\u7684\u8BDD\u5199\uFF0C\u4E0D\u91CD\u590D\u6807\u9898\uFF09

---

\u5982\u679C\u6709\u591A\u6761\u7B14\u8BB0\uFF0C\u6309\u4E0A\u8FF0\u683C\u5F0F\u4F9D\u6B21\u7528 --- \u5206\u9694\u3002

# \u683C\u5F0F\u7EA6\u675F
- \u4F7F\u7528 YAML frontmatter \u683C\u5F0F\uFF0C\u4E0D\u7528\u7F16\u53F7\u5217\u8868
- \u4E0D\u8F93\u51FA"\u4EE5\u4E0B\u662F\u7ED3\u679C"\u7B49\u89E3\u91CA\u6027\u6587\u5B57
- \u4E0D\u590D\u5236\u539F\u6587\u5927\u6BB5\u5185\u5BB9`;
function buildSystemPrompt(tagPreferences, tagMode = "lenient") {
  let prompt = BASE_SYSTEM_PROMPT;
  if (tagPreferences && tagPreferences.length > 0) {
    const tagList = tagPreferences.join(", ");
    if (tagMode === "strict") {
      prompt += `

# \u6807\u7B7E\u7EA6\u675F
\u8BF7\u4EC5\u4F7F\u7528\u4EE5\u4E0B\u6807\u7B7E\uFF1A[${tagList}]\u3002\u7981\u6B62\u65B0\u589E\u6807\u7B7E\u3002`;
    } else {
      prompt += `

# \u6807\u7B7E\u7EA6\u675F
\u8BF7\u4F18\u5148\u4F7F\u7528\u4EE5\u4E0B\u6807\u7B7E\uFF1A[${tagList}]\u3002\u82E5\u65E0\u5339\u914D\uFF0C\u53EF\u65B0\u589E\u6807\u7B7E\u3002`;
    }
  }
  return prompt;
}
function buildExtractionPrompt(content) {
  return `\u8BF7\u4ECE\u4EE5\u4E0B\u5185\u5BB9\u4E2D\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0\uFF08\u5B50\u5F39\u7B14\u8BB0\uFF09\u3002

\`\`\`
${content.slice(0, INPUT_TRUNCATE_LENGTH)}
\`\`\`

\u8F93\u51FA\u8981\u6C42\uFF1A
1. \u6BCF\u6761\u7B14\u8BB0\u7528 YAML frontmatter \u683C\u5F0F\uFF08--- \u5F00\u5934\u548C\u7ED3\u5C3E\uFF09
2. title \u662F 5~18 \u5B57\u7684**\u7B80\u6D01\u65AD\u8A00\u77ED\u8BED**\uFF0C\u5305\u542B\u6838\u5FC3\u6D1E\u89C1\uFF08\u4E0D\u662F\u8BDD\u9898\u6807\u7B7E\uFF09
3. \u6B63\u6587 2~5 \u53E5\u8BDD\uFF0C\u7528\u81EA\u5DF1\u7684\u8BDD\u5199
4. \u5C3D\u91CF\u63D0\u70BC\u51FA\u81F3\u5C11 1 \u6761\u6709\u4EF7\u503C\u7684\u7B14\u8BB0\uFF1B\u5982\u679C\u539F\u6587\u786E\u5B9E\u6CA1\u6709\u4EFB\u4F55\u53EF\u63D0\u70BC\u7684\u6D1E\u89C1\uFF0C\u8F93\u51FA\u7A7A\u5373\u53EF

\u26A0\uFE0F \u6807\u9898\u662F\u5B50\u5F39\u7B14\u8BB0\u7684\u7075\u9B42\u2014\u2014\u77ED\u3001\u51C6\u3001\u72E0\u3002\u6BCF\u4E2A\u6807\u9898\u5FC5\u987B\u5305\u542B\u4E00\u4E2A\u5224\u65AD\u6216\u53D1\u73B0\u3002
`;
}

// src/extraction/fact-checker.ts
var import_obsidian3 = require("obsidian");

// src/utils/data-extractor.ts
var DATA_PATTERNS = [
  { regex: /(?:约|近|超|达|不足)?百分之[\d一二三四五六七八九十百千]+/g, type: "percent" },
  { regex: /(?:约|近|超|达|不足)?\d+(?:\.\d+)?%/g, type: "percent" },
  { regex: /\d+(?:\.\d+)?\s*(?:万亿|万|亿|千|百)?(?:美元|欧元|日元|英镑|人民币|元|美元|人|个|年|月|天|小时|kg|km|m|cm|mm)/g, type: "quantity" },
  { regex: /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/g, type: "date" },
  { regex: /\d{4}年\d{1,2}月\d{1,2}日/g, type: "date" },
  { regex: /\d{1,2}月\d{1,2}日/g, type: "date" },
  { regex: /\d{4}[-\/年]\d{1,2}/g, type: "date" },
  { regex: /(?:第[一二三四五六七八九十\d]+|[一二三四五六七八九十]+倍|\d+倍|\d+番)/g, type: "rank" }
];
var ENTITY_PATTERNS = [
  { regex: /[\u4e00-\u9fff]{2,6}(?:公司|机构|大学|学院|集团|基金|协会|部门|委员会|平台|系统|框架|协议|标准|组织|银行|医院|研究所|实验室)/g, type: "org_cn" },
  { regex: /[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+/g, type: "org_en" }
];
var CAUSAL_KEYWORDS = [
  "\u5BFC\u81F4",
  "\u4F7F\u5F97",
  "\u9020\u6210",
  "\u5F15\u8D77",
  "\u8BC1\u660E",
  "\u53D1\u73B0",
  "\u8868\u660E",
  "\u663E\u793A",
  "\u7814\u7A76\u7ED3\u679C",
  "\u6570\u636E\u8868\u660E",
  "\u7EDF\u8BA1\u663E\u793A",
  "\u8C03\u67E5\u6307\u51FA",
  "\u62A5\u544A\u6307\u51FA",
  "\u56E0\u6B64",
  "\u6240\u4EE5",
  "\u7531\u6B64\u53EF\u89C1",
  "\u8FD9\u8BF4\u660E\u4E86",
  "\u8FD9\u610F\u5473\u7740"
];
function extractVerifiableClaims(content) {
  const claims = [];
  const seen = /* @__PURE__ */ new Set();
  const sentences = content.split(/[。！？\n\.!\?]+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed || trimmed.length < 3)
      continue;
    const truncated = trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80) + "...";
    for (const pattern of DATA_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(trimmed)) !== null) {
        const anchor = match[0].trim();
        if (seen.has(anchor))
          continue;
        seen.add(anchor);
        claims.push({ claim: truncated, anchor, type: "numeric" });
      }
    }
    for (const pattern of ENTITY_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(trimmed)) !== null) {
        const anchor = match[0].trim();
        if (seen.has(anchor))
          continue;
        seen.add(anchor);
        claims.push({ claim: truncated, anchor, type: "entity" });
      }
    }
    for (const keyword of CAUSAL_KEYWORDS) {
      if (trimmed.includes(keyword) && trimmed.length >= 8) {
        const anchor = keyword;
        const key = `causal:${trimmed.slice(0, 30)}`;
        if (seen.has(key))
          break;
        seen.add(key);
        claims.push({ claim: truncated, anchor, type: "causal" });
        break;
      }
    }
  }
  return claims.slice(0, MAX_CLAIMS_PER_CHECK);
}
function locateAnchorInSource(anchor, type, originalContent) {
  const exactIndex = originalContent.indexOf(anchor);
  if (exactIndex >= 0) {
    const sourceText = extractContextSentence(originalContent, exactIndex, anchor.length);
    return { status: "\u5DF2\u6EAF\u6E90", sourceText };
  }
  if (type === "numeric") {
    const numMatch = anchor.match(/\d+(?:\.\d+)?/);
    if (numMatch) {
      const num = parseFloat(numMatch[0]);
      if (!isNaN(num)) {
        const allNumbers = originalContent.match(/\d+(?:\.\d+)?/g);
        if (allNumbers) {
          for (const candidate of allNumbers) {
            const candidateNum = parseFloat(candidate);
            if (isNaN(candidateNum))
              continue;
            if (candidateNum === num) {
              const idx = originalContent.indexOf(candidate);
              const sourceText = extractContextSentence(originalContent, idx, candidate.length);
              return { status: "\u5DF2\u6EAF\u6E90", sourceText };
            }
            const diff = Math.abs(candidateNum - num);
            const relDiff = num !== 0 ? diff / Math.abs(num) : diff;
            if (relDiff > 0 && relDiff < 0.05) {
              const idx = originalContent.indexOf(candidate);
              const sourceText = extractContextSentence(originalContent, idx, candidate.length);
              return {
                status: "\u5DF2\u6EAF\u6E90",
                sourceText,
                diffNote: `\u539F\u6587\u4E3A ${candidate}\uFF0C\u7B14\u8BB0\u4E3A ${anchor}`
              };
            }
          }
        }
      }
    }
  }
  if (type === "entity" || type === "causal") {
    const fragment = anchor.slice(0, Math.max(2, Math.ceil(anchor.length * 0.6)));
    const fragmentIndex = originalContent.indexOf(fragment);
    if (fragmentIndex >= 0) {
      const sourceText = extractContextSentence(originalContent, fragmentIndex, fragment.length);
      return {
        status: "\u9700\u5BF9\u6BD4",
        sourceText,
        diffNote: `\u539F\u6587\u542B\u76F8\u5173\u8868\u8FF0"${fragment}"\uFF0C\u4F46\u672A\u627E\u5230\u5B8C\u6574\u5339\u914D`
      };
    }
  }
  return null;
}
function extractContextSentence(content, index, matchLength) {
  const sentenceDelimiters = /[。！？\n\.!\?]/;
  let start = index;
  while (start > 0 && !sentenceDelimiters.test(content[start - 1])) {
    start--;
  }
  let end = index + matchLength;
  while (end < content.length && !sentenceDelimiters.test(content[end])) {
    end++;
  }
  if (end < content.length)
    end++;
  let sentence = content.slice(start, end).trim();
  if (sentence.length > 200) {
    sentence = sentence.slice(0, 200) + "...";
  }
  return sentence;
}

// src/utils/json-parser.ts
function parseJsonArrayFromAI(aiContent) {
  let jsonStr = aiContent.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return null;
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[JSON \u89E3\u6790] \u89E3\u6790\u5931\u8D25\uFF1A", e, "\n\u539F\u59CB\u5185\u5BB9\uFF1A", aiContent.slice(0, 500));
    return null;
  }
}

// src/extraction/fact-checker.ts
async function verifyClaims(originalContent, notes, config) {
  const allResults = /* @__PURE__ */ new Map();
  const unmatched = [];
  for (let i = 0; i < notes.length; i++) {
    const claims = extractVerifiableClaims(notes[i].content);
    const noteItems = [];
    for (const claim of claims) {
      const match = locateAnchorInSource(claim.anchor, claim.type, originalContent);
      if (match) {
        noteItems.push({
          claim: claim.claim,
          status: match.status,
          sourceText: match.sourceText,
          diffNote: match.diffNote
        });
      } else {
        unmatched.push({ noteIndex: i, claim });
      }
    }
    allResults.set(i, noteItems);
  }
  if (unmatched.length > 0) {
    console.info(`[\u6838\u67E5] \u6B63\u5728\u6BD4\u5BF9 ${unmatched.length} \u6761\u672A\u6EAF\u6E90\u58F0\u660E`);
    try {
      const aiResults = await semanticCompare(originalContent, unmatched, config);
      for (let i = 0; i < unmatched.length; i++) {
        const ctx = unmatched[i];
        const aiResult = aiResults.get(i);
        const items = allResults.get(ctx.noteIndex);
        if (!items)
          continue;
        if (aiResult) {
          if (aiResult.status === "\u9700\u5BF9\u6BD4" && aiResult.sourceText) {
            if (!originalContent.includes(aiResult.sourceText)) {
              items.push({
                claim: ctx.claim.claim,
                status: "\u8D85\u6E90",
                reason: "AI \u5F15\u7528\u7684\u539F\u6587\u53E5\u5B50\u4E0D\u5B58\u5728"
              });
            } else {
              items.push({
                claim: ctx.claim.claim,
                status: "\u9700\u5BF9\u6BD4",
                sourceText: aiResult.sourceText,
                diffNote: aiResult.diffNote
              });
            }
          } else if (aiResult.status === "\u8D85\u6E90") {
            items.push({
              claim: ctx.claim.claim,
              status: "\u8D85\u6E90",
              reason: aiResult.reason || "\u539F\u6587\u4E2D\u672A\u627E\u5230\u76F8\u5173\u5185\u5BB9"
            });
          } else {
            items.push({
              claim: ctx.claim.claim,
              status: "\u8D85\u6E90",
              reason: "AI \u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u72B6\u6001"
            });
          }
        } else {
          items.push({
            claim: ctx.claim.claim,
            status: "\u8D85\u6E90",
            reason: "\u539F\u6587\u4E2D\u672A\u627E\u5230\u53EF\u5BF9\u5E94\u7684\u5185\u5BB9"
          });
        }
      }
    } catch (err) {
      for (const ctx of unmatched) {
        const items = allResults.get(ctx.noteIndex);
        if (!items)
          continue;
        items.push({
          claim: ctx.claim.claim,
          status: "\u8D85\u6E90",
          reason: `\u8BED\u4E49\u6BD4\u5BF9\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  }
  let totalTraced = 0, totalNeedsCompare = 0, totalOutOfScope = 0;
  for (let i = 0; i < notes.length; i++) {
    const items = allResults.get(i) || [];
    notes[i].verification = items;
    notes[i].tracedCount = items.filter((v) => v.status === "\u5DF2\u6EAF\u6E90").length;
    notes[i].needsCompareCount = items.filter((v) => v.status === "\u9700\u5BF9\u6BD4").length;
    notes[i].outOfScopeCount = items.filter((v) => v.status === "\u8D85\u6E90").length;
    totalTraced += notes[i].tracedCount;
    totalNeedsCompare += notes[i].needsCompareCount;
    totalOutOfScope += notes[i].outOfScopeCount;
  }
  return {
    notes,
    traced: totalTraced,
    needsCompare: totalNeedsCompare,
    outOfScope: totalOutOfScope
  };
}
async function semanticCompare(originalContent, unmatched, config) {
  const resultMap = /* @__PURE__ */ new Map();
  const systemPrompt = `\u4F60\u662F\u539F\u6587\u6BD4\u5BF9\u52A9\u624B\u3002\u4EE5\u4E0B\u58F0\u660E\u6765\u81EA\u5BF9\u539F\u6587\u7684\u63D0\u70BC\u603B\u7ED3\uFF0C\u4F46\u5728\u539F\u6587\u4E2D\u672A\u627E\u5230\u7CBE\u786E\u5339\u914D\u3002
\u8BF7\u4E3A\u6BCF\u6761\u58F0\u660E\u627E\u51FA\u539F\u6587\u4E2D\u6700\u76F8\u5173\u7684\u53E5\u5B50\uFF08\u5FC5\u987B\u76F4\u63A5\u5F15\u7528\u539F\u6587\u539F\u53E5\uFF09\u3002
- \u5982\u679C\u627E\u5230\u76F8\u5173\u53E5\u5B50\u4F46\u4E0E\u58F0\u660E\u6709\u51FA\u5165\uFF08\u6539\u5199\u3001\u63A8\u65AD\u3001\u6269\u5C55\uFF09\uFF0C\u6807\u6CE8\u4E3A"\u9700\u5BF9\u6BD4"\u5E76\u8BF4\u660E\u5DEE\u5F02
- \u5982\u679C\u539F\u6587\u4E2D\u5B8C\u5168\u627E\u4E0D\u5230\u76F8\u5173\u5185\u5BB9\uFF0C\u6807\u6CE8\u4E3A"\u8D85\u6E90"
\u4EC5\u8FD4\u56DE JSON \u6570\u7EC4\uFF1A[{"index":n,"status":"\u9700\u5BF9\u6BD4|\u8D85\u6E90","sourceText":"\u539F\u6587\u539F\u53E5\u5F15\u7528","diffNote":"\u5DEE\u5F02\u8BF4\u660E"}]
\u5982\u679C\u6807\u8BB0\u4E3A"\u8D85\u6E90"\uFF0CsourceText \u7559\u7A7A\u3002`;
  const claimsList = unmatched.map((ctx, i) => `${i}. ${ctx.claim.claim}\uFF08\u951A\u70B9\uFF1A${ctx.claim.anchor}\uFF09`).join("\n");
  const userPrompt = `\u539F\u6587\uFF1A${originalContent}

\u672A\u5339\u914D\u58F0\u660E\u5217\u8868\uFF1A
${claimsList}`;
  const response = await (0, import_obsidian3.requestUrl)({
    url: config.deepseekApiUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.model || "deepseek-v4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: config.maxTokens || 2e3,
      temperature: 0
    }),
    signal: config.signal
  });
  if (response.status !== 200) {
    throw new Error(`API \u8FD4\u56DE ${response.status}`);
  }
  const rawOutput = response.json?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonArrayFromAI(rawOutput);
  if (parsed) {
    for (const item of parsed) {
      const status = item.status === "\u9700\u5BF9\u6BD4" ? "\u9700\u5BF9\u6BD4" : "\u8D85\u6E90";
      resultMap.set(item.index, {
        status,
        sourceText: item.sourceText,
        diffNote: item.diffNote,
        reason: item.reason
      });
    }
  }
  return resultMap;
}

// src/review/note-reviewer.ts
var import_obsidian4 = require("obsidian");
async function reviewNotes(notes, config) {
  if (notes.length === 0) {
    return { reviewedNotes: [], reviewDetails: [], success: true };
  }
  const minScore = config.minScore ?? 3;
  const prompt = buildReviewPrompt(notes, minScore);
  try {
    const response = await (0, import_obsidian4.requestUrl)({
      url: config.deepseekApiUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.deepseekApiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "\u4F60\u662F\u4E25\u683C\u7684\u7B14\u8BB0\u5BA1\u67E5\u5458\u3002\u53EA\u5BF9\u7B14\u8BB0\u8BC4\u5206\uFF0C\u4E0D\u4FEE\u6539\u7B14\u8BB0\u5185\u5BB9\u3002\u8F93\u51FA\u4E25\u683C\u7B26\u5408 JSON \u683C\u5F0F\u3002"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: config.maxTokens,
        temperature: AI_TEMPERATURE
      }),
      signal: config.signal
    });
    const aiContent = response.json?.choices?.[0]?.message?.content || "";
    const reviewDetails = parseReviewOutput(aiContent, notes.length, minScore);
    const kept = reviewDetails.filter((r) => r.verdict === "\u4FDD\u7559").sort((a, b) => b.finalScore - a.finalScore);
    const reviewedNotes = kept.map((r) => notes[r.index]).filter(Boolean);
    return { reviewedNotes, reviewDetails, success: true };
  } catch (error) {
    console.error("[\u7B14\u8BB0\u590D\u67E5] AI \u8C03\u7528\u5931\u8D25\uFF0C\u964D\u7EA7\u5904\u7406\uFF08\u8FD4\u56DE\u539F\u59CB\u7B14\u8BB0\uFF09\uFF1A", error);
    return {
      reviewedNotes: [...notes],
      reviewDetails: notes.map((_, i) => ({
        index: i,
        insightScore: 3,
        knowledgeScore: 3,
        finalScore: 3,
        verdict: "\u4FDD\u7559",
        reason: "\u590D\u67E5\u5931\u8D25\uFF0C\u9ED8\u8BA4\u4FDD\u7559"
      })),
      success: false
    };
  }
}
function buildReviewPrompt(notes, minScore) {
  const hasVerification = notes.some((n) => n.verification && n.verification.length > 0);
  let prompt = `\u4F60\u662F\u4E25\u683C\u7684\u7B14\u8BB0\u5BA1\u67E5\u5458\u3002\u5BF9\u4EE5\u4E0B\u6BCF\u6761\u539F\u5B50\u7B14\u8BB0\uFF0C\u4ECE${hasVerification ? "\u4E09" : "\u4E24"}\u4E2A\u7EF4\u5EA6\u8BC4\u5206\uFF081-5\u5206\uFF09\uFF1A

1. \u6D1E\u89C1\u4EF7\u503C\uFF1A\u662F\u5426\u5305\u542B\u72EC\u7ACB\u89C1\u89E3/\u53CD\u76F4\u89C9\u5224\u65AD\uFF1F
2. \u77E5\u8BC6\u4EF7\u503C\uFF1A\u662F\u5426\u5B66\u5230\u65B0\u7684\u9886\u57DF\u77E5\u8BC6\uFF1F
`;
  if (hasVerification) {
    prompt += `3. \u6EAF\u6E90\u53EF\u4FE1\u5EA6\uFF1A\u7B14\u8BB0\u4E2D\u7684\u58F0\u660E\u662F\u5426\u80FD\u5728\u539F\u6587\u4E2D\u627E\u5230\u4F9D\u636E\uFF1F
`;
  }
  prompt += `
\u8BC4\u5206\u6807\u51C6\uFF1A
5\u5206\uFF1A\u540C\u65F6\u5177\u5907\u6D1E\u89C1\u4EF7\u503C\u548C\u77E5\u8BC6\u4EF7\u503C${hasVerification ? "\uFF0C\u58F0\u660E\u5168\u90E8\u53EF\u6EAF\u6E90" : ""}
4\u5206\uFF1A\u5177\u5907\u5176\u4E2D\u4E00\u9879\uFF0C\u4E14\u8D28\u91CF\u5F88\u9AD8${hasVerification ? "\uFF0C\u58F0\u660E\u57FA\u672C\u53EF\u6EAF\u6E90" : ""}
3\u5206\uFF1A\u5177\u5907\u5176\u4E2D\u4E00\u9879\uFF0C\u4F46\u8F83\u6D45${hasVerification ? "\uFF0C\u90E8\u5206\u58F0\u660E\u9700\u5BF9\u6BD4\u786E\u8BA4" : ""}
2\u5206\uFF1A\u6B63\u786E\u7684\u5E9F\u8BDD\uFF0C\u65E0\u72EC\u7ACB\u89C1\u89E3\uFF0C\u65E0\u77E5\u8BC6\u589E\u91CF${hasVerification ? "\uFF0C\u5B58\u5728\u8D85\u6E90\u58F0\u660E" : ""}
1\u5206\uFF1A\u5783\u573E\u7B14\u8BB0\uFF08\u91CD\u590D/\u65E0\u5173/\u65E0\u4FE1\u606F\u91CF\uFF09${hasVerification ? "\uFF0C\u5927\u91CF\u8D85\u6E90\u58F0\u660E" : ""}

`;
  if (hasVerification) {
    prompt += `\u8BA1\u7B97\u6700\u7EC8\u5F97\u5206\uFF1Afinal_score = (insight_score + knowledge_score + source_trace_score) / 3

`;
  } else {
    prompt += `\u8BA1\u7B97\u6700\u7EC8\u5F97\u5206\uFF1Afinal_score = (insight_score + knowledge_score) / 2

`;
  }
  prompt += `\u6700\u7EC8\u5F97\u5206 < ${minScore} \u7684\u7B14\u8BB0 verdict \u586B"\u4E22\u5F03"\uFF1B\u6700\u7EC8\u5F97\u5206 \u2265 ${minScore} \u7684\u7B14\u8BB0 verdict \u586B"\u4FDD\u7559"\u3002

\u8BF7\u4EE5 JSON \u6570\u7EC4\u683C\u5F0F\u8F93\u51FA\u6BCF\u6761\u7B14\u8BB0\u7684\u8BC4\u5206\u7ED3\u679C\uFF08\u4E0D\u8981\u8F93\u51FA\u7B14\u8BB0\u6B63\u6587\uFF0C\u4E0D\u8981\u4FEE\u6539\u7B14\u8BB0\u5185\u5BB9\uFF09\uFF1A

\u8F93\u5165\u7B14\u8BB0\uFF1A

`;
  notes.forEach((note, idx) => {
    prompt += `\u7B14\u8BB0${idx + 1}:
`;
    prompt += `title: ${note.title}
`;
    const preview = (note.content || "").slice(0, 150);
    prompt += `content: ${preview}${note.content.length > 150 ? "..." : ""}
`;
    prompt += `tags: [${note.tags?.join(", ") || ""}]
`;
    if (hasVerification && note.verification && note.verification.length > 0) {
      const traced = note.tracedCount ?? 0;
      const needsCompare = note.needsCompareCount ?? 0;
      const outOfScope = note.outOfScopeCount ?? 0;
      if (outOfScope > 0) {
        const outOfScopeClaims = note.verification.filter((v) => v.status === "\u8D85\u6E90").map((v) => `"${v.claim}"`).join("; ");
        prompt += `verification: ${traced} \u6761\u5DF2\u6EAF\u6E90\uFF0C${needsCompare} \u6761\u9700\u5BF9\u6BD4\uFF0C${outOfScope} \u6761\u8D85\u6E90
`;
        prompt += `verification_warning: \u5B58\u5728 ${outOfScope} \u6761\u8D85\u6E90\u58F0\u660E\uFF1A${outOfScopeClaims}
`;
      } else if (needsCompare > 0) {
        prompt += `verification: ${traced} \u6761\u5DF2\u6EAF\u6E90\uFF0C${needsCompare} \u6761\u9700\u5BF9\u6BD4
`;
      } else {
        prompt += `verification: \u5168\u90E8\u5DF2\u6EAF\u6E90
`;
      }
    }
    prompt += "\n";
  });
  const jsonFields = hasVerification ? `"index": 1, "insight_score": X, "knowledge_score": X, "source_trace_score": X, "final_score": X, "verdict": "\u4FDD\u7559/\u4E22\u5F03", "reason": "\u7B80\u77ED\u7406\u7531"` : `"index": 1, "insight_score": X, "knowledge_score": X, "final_score": X, "verdict": "\u4FDD\u7559/\u4E22\u5F03", "reason": "\u7B80\u77ED\u7406\u7531"`;
  prompt += `\u8F93\u51FA\u683C\u5F0F\uFF08\u4E25\u683C\u6309\u6B64 JSON \u683C\u5F0F\uFF0C\u4E0D\u8981\u8F93\u51FA\u5176\u4ED6\u5185\u5BB9\uFF09\uFF1A
\`\`\`json
[
  {${jsonFields}},
  ...
]
\`\`\``;
  return prompt;
}
function parseReviewOutput(aiContent, expectedCount, minScore = 3) {
  const parsed = parseJsonArrayFromAI(aiContent);
  if (parsed && parsed.length > 0) {
    return parsed.map((r) => {
      const insight = clampScore(r.insight_score ?? 3);
      const knowledge = clampScore(r.knowledge_score ?? 3);
      const sourceTrace = r.source_trace_score != null ? clampScore(r.source_trace_score) : void 0;
      const final = r.final_score ?? (sourceTrace != null ? roundScore((insight + knowledge + sourceTrace) / 3) : roundScore((insight + knowledge) / 2));
      return {
        index: Math.max(0, (r.index ?? 1) - 1),
        // 转为 0-based
        insightScore: insight,
        knowledgeScore: knowledge,
        sourceTraceScore: sourceTrace,
        finalScore: final,
        verdict: final >= minScore ? "\u4FDD\u7559" : "\u4E22\u5F03",
        reason: r.reason ?? ""
      };
    });
  }
  return Array.from({ length: expectedCount }, (_, i) => ({
    index: i,
    insightScore: 3,
    knowledgeScore: 3,
    finalScore: 3,
    verdict: "\u4FDD\u7559",
    reason: "\u89E3\u6790\u5931\u8D25\uFF0C\u9ED8\u8BA4\u4FDD\u7559"
  }));
}
function clampScore(n) {
  return Math.max(1, Math.min(5, Math.round(n)));
}
function roundScore(n) {
  return Math.round(n * 10) / 10;
}

// src/extraction/url-extractor.ts
var DEFAULT_OPTIONS = {
  minLength: 100
};
var SEMANTIC_SELECTORS = [
  "article",
  '[role="main"]',
  "main",
  'section[role="main"]',
  ".article",
  ".post",
  ".entry",
  ".content",
  ".article-content",
  ".post-content",
  ".entry-content"
];
var NOISE_SELECTORS = [
  "nav",
  '[role="navigation"]',
  ".nav",
  ".navigation",
  "header",
  "footer",
  '[role="footer"]',
  ".footer",
  ".sidebar",
  ".aside",
  "aside",
  ".widget",
  ".ad",
  ".advertisement",
  '[class*="ad"]',
  '[id*="ad"]',
  ".banner",
  ".cookie-banner",
  ".consent-banner",
  ".modal",
  ".popup",
  ".notification",
  ".comments",
  ".comment",
  '[class*="comment"]',
  '[id*="comment"]'
];
async function extractUrlContent(html, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let bestContent = "";
  let extractedFrom = "body";
  for (const selector of SEMANTIC_SELECTORS) {
    const content = extractBySelector(html, selector);
    if (content.length > bestContent.length && content.length >= opts.minLength) {
      bestContent = content;
      extractedFrom = selector;
    }
  }
  if (!bestContent) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bestContent = bodyMatch[1];
    } else {
      bestContent = html;
    }
  }
  bestContent = removeNoiseBlocks(bestContent);
  bestContent = bestContent.replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, "");
  bestContent = bestContent.replace(/<[^>]+>/g, " ");
  bestContent = bestContent.replace(/\s+/g, " ").trim();
  if (bestContent.length < opts.minLength) {
    return {
      success: false,
      error: `\u63D0\u53D6\u5185\u5BB9\u8FC7\u77ED\uFF08\u4EC5 ${bestContent.length} \u5B57\uFF09\uFF0C\u53EF\u80FD\u4E0D\u662F\u6587\u7AE0\u5185\u5BB9\u9875\u9762`
    };
  }
  return {
    success: true,
    content: bestContent
  };
}
function extractBySelector(html, selector) {
  if (selector.startsWith("[")) {
    const attrMatch = selector.match(/\[(\w+)=["']?([^"']+)["']?\]/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2];
      const regex = new RegExp(
        `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["']?${attrValue}["']?[^>]*>([\\s\\S]*?)<\\/\\1>`,
        "gi"
      );
      const match = regex.exec(html);
      return match ? match[2] : "";
    }
  } else if (selector.startsWith(".")) {
    const className = selector.slice(1);
    const regex = new RegExp(
      `<([a-z][a-z0-9]*)[^>]*\\sclass=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "gi"
    );
    const match = regex.exec(html);
    return match ? match[2] : "";
  } else {
    const tagName = selector;
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = regex.exec(html);
    return match ? match[1] : "";
  }
  return "";
}
function removeNoiseBlocks(html) {
  let result = html;
  for (const selector of NOISE_SELECTORS) {
    let regex;
    if (selector.startsWith("[")) {
      const attrMatch = selector.match(/\[(\w+)=["']?([^"']+)["']?\]/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrValue = attrMatch[2];
        regex = new RegExp(
          `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["']?${attrValue}["']?[^>]*>[\\s\\S]*?<\\/\\1>`,
          "gi"
        );
        result = result.replace(regex, " ");
      }
    } else if (selector.startsWith(".")) {
      const className = selector.slice(1);
      regex = new RegExp(
        `<([a-z][a-z0-9]*)[^>]*\\sclass=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
        "gi"
      );
      result = result.replace(regex, " ");
    } else if (selector.startsWith("[class*=") || selector.startsWith("[id*=")) {
      const match = selector.match(/\[(\w+)\*=["']?([^"']+)["']?\]/);
      if (match) {
        const attrName = match[1];
        const attrValue = match[2];
        regex = new RegExp(
          `<([a-z][a-z0-9]*)[^>]*\\s${attrName}=["'][^"']*${attrValue}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
          "gi"
        );
        result = result.replace(regex, " ");
      }
    } else {
      const tagName = selector;
      regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
      result = result.replace(regex, " ");
    }
  }
  return result;
}

// src/extraction/chunked-extractor.ts
var CHUNK_OVERLAP = 500;
var CHUNK_DELAY_MS = 200;
function splitContent(text, chunkSize, overlap) {
  if (text.length <= chunkSize)
    return [text];
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    if (end >= text.length) {
      chunks.push(text.slice(offset));
      break;
    }
    let splitPoint = end;
    const lastParagraph = text.lastIndexOf("\n\n", end);
    if (lastParagraph > offset + chunkSize * 0.5) {
      splitPoint = lastParagraph;
    } else {
      const lastPeriod = text.lastIndexOf("\u3002", end);
      const lastPeriodEn = text.lastIndexOf(". ", end);
      const best = Math.max(lastPeriod, lastPeriodEn);
      if (best > offset + chunkSize * 0.5) {
        splitPoint = best + 1;
      }
    }
    chunks.push(text.slice(offset, splitPoint));
    const previousOffset = offset;
    offset = splitPoint - overlap;
    if (offset < 0)
      offset = splitPoint;
    if (offset <= previousOffset) {
      offset = splitPoint;
    }
  }
  return chunks;
}
async function extractChunked(content, config, onProgress) {
  const chunks = splitContent(content, INPUT_TRUNCATE_LENGTH, CHUNK_OVERLAP);
  const allNotes = [];
  let successCount = 0;
  let failCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const phaseLabel = `Phase 3.${i + 1}`;
    if (onProgress) {
      const event = {
        phase: phaseLabel,
        name: `\u6DF1\u5EA6\u63D0\u70BC \u7B2C${i + 1}/${chunks.length}\u8F6E`,
        detail: `\u5904\u7406 ${chunk.length} \u5B57...`,
        status: "running"
      };
      onProgress(event, [], 0);
    }
    const result = await extractAtomicNotes(chunk, config);
    if (result.success && result.notes) {
      allNotes.push(...result.notes);
      successCount++;
    } else {
      failCount++;
      if (onProgress) {
        const event = {
          phase: phaseLabel,
          name: `\u6DF1\u5EA6\u63D0\u70BC \u7B2C${i + 1}/${chunks.length}\u8F6E`,
          detail: `\u5931\u8D25: ${result.error || "\u672A\u77E5\u9519\u8BEF"}`,
          status: "failed"
        };
        onProgress(event, [], 0);
      }
    }
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }
  if (onProgress) {
    const event = {
      phase: "Phase 3",
      name: "\u6DF1\u5EA6\u63D0\u70BC\u603B\u7ED3",
      detail: `${chunks.length}\u6BB5\u4E2D\uFF0C${successCount}\u6BB5\u6210\u529F\uFF0C${failCount}\u6BB5\u5931\u8D25`,
      status: failCount > 0 ? "failed" : "success"
    };
    onProgress(event, [], 0);
  }
  return allNotes;
}

// src/extraction/progress.ts
function createProgressTracker(onProgress) {
  const events = [];
  const startedAt = Date.now();
  let currentIdx = -1;
  let currentStartedAt = 0;
  const emit = () => {
    if (!onProgress)
      return;
    const last = events[events.length - 1];
    if (!last)
      return;
    onProgress(last, events.slice(), Date.now() - startedAt);
  };
  const start = (phase, name, detail) => {
    currentIdx = events.length;
    currentStartedAt = Date.now();
    events.push({ phase, name, status: "running", detail: detail || "\u5F00\u59CB...", elapsedMs: 0 });
    emit();
  };
  const update = (patch) => {
    if (currentIdx < 0)
      return;
    if (patch.detail !== void 0)
      events[currentIdx].detail = patch.detail;
    if (patch.subProgress !== void 0)
      events[currentIdx].subProgress = patch.subProgress;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    emit();
  };
  const complete = (detail) => {
    if (currentIdx < 0)
      return;
    events[currentIdx].status = "success";
    if (detail !== void 0)
      events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    events[currentIdx].subProgress = null;
    emit();
  };
  const skip = (detail) => {
    if (currentIdx < 0)
      return;
    events[currentIdx].status = "skipped";
    if (detail !== void 0)
      events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = 0;
    events[currentIdx].subProgress = null;
    emit();
  };
  const fail = (detail) => {
    if (currentIdx < 0)
      return;
    events[currentIdx].status = "failed";
    if (detail !== void 0)
      events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    events[currentIdx].subProgress = null;
    emit();
  };
  const finish = () => {
    emit();
  };
  return { start, update, complete, skip, fail, finish, currentIndex: () => currentIdx, allEvents: () => events.slice() };
}

// src/extractor.ts
function noteFingerprint(note) {
  return `${note.content.length}:${note.content.slice(0, 100)}`;
}
function remapPendingDuplicates(notes, pending) {
  const postIndexMap = /* @__PURE__ */ new Map();
  notes.forEach((note, idx) => postIndexMap.set(noteFingerprint(note), idx));
  return pending.filter((p) => {
    const key = `${p.newNoteContent.length}:${p.newNoteContent.slice(0, 100)}`;
    return postIndexMap.has(key);
  }).map((p) => {
    const key = `${p.newNoteContent.length}:${p.newNoteContent.slice(0, 100)}`;
    return { ...p, newNoteIndex: postIndexMap.get(key) };
  });
}
function checkAborted(signal, tracker) {
  if (signal?.aborted) {
    tracker.fail("\u5DF2\u53D6\u6D88");
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: "\u7528\u6237\u53D6\u6D88\u4E86\u63D0\u70BC" };
  }
  return null;
}
var DEFAULT_CONFIG = {
  deepseekApiKey: "",
  deepseekApiUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-v4-flash",
  maxTokens: 6e3,
  tagPreferences: [],
  tagMode: "lenient",
  factCheck: false,
  verifiedOnly: false,
  enableReview: false,
  reviewModel: "",
  reviewApiUrl: "",
  reviewApiKey: "",
  enableVaultDedup: true
};
function eventsToSteps(events) {
  return events.map((e) => ({
    step: `${e.phase} ${e.name}`.trim(),
    status: e.status === "pending" || e.status === "running" ? "running" : e.status,
    message: e.detail || ""
  }));
}
async function readContent(input, signal) {
  if (input.type === "url") {
    try {
      const response = await (0, import_obsidian5.requestUrl)({
        url: input.content,
        method: "GET",
        signal
      });
      if (!response.text) {
        return { success: false, error: "\u65E0\u6CD5\u8BFB\u53D6 URL \u5185\u5BB9" };
      }
      const html = response.text;
      const extractResult = await extractUrlContent(html);
      if (!extractResult.success) {
        return { success: false, error: extractResult.error };
      }
      return { success: true, content: extractResult.content, type: "url" };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `\u8BFB\u53D6 URL \u5931\u8D25: ${errorMsg}` };
    }
  } else if (input.type === "selection") {
    const content = input.content;
    if (!content || content.trim().length === 0) {
      return { success: false, error: "\u672A\u9009\u4E2D\u4EFB\u4F55\u6587\u672C\u5185\u5BB9" };
    }
    return { success: true, content, type: "text" };
  } else {
    const content = input.content;
    if (!content || content.trim().length === 0) {
      return { success: false, error: "\u672A\u8F93\u5165\u4EFB\u4F55\u6587\u672C\u5185\u5BB9" };
    }
    return { success: true, content, type: "text" };
  }
}
async function extractAtomicNotes(content, config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  if (!fullConfig.deepseekApiKey) {
    return { success: false, error: "\u672A\u914D\u7F6E DeepSeek API Key" };
  }
  const systemPrompt = buildSystemPrompt(fullConfig.tagPreferences, fullConfig.tagMode);
  const userPrompt = buildExtractionPrompt(content);
  try {
    const response = await (0, import_obsidian5.requestUrl)({
      url: fullConfig.deepseekApiUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${fullConfig.deepseekApiKey}`
      },
      body: JSON.stringify({
        model: fullConfig.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: fullConfig.maxTokens,
        temperature: AI_TEMPERATURE
      }),
      signal: fullConfig.signal
    });
    const aiContent = response.json?.choices?.[0]?.message?.content;
    if (!aiContent) {
      return { success: false, error: "AI \u8FD4\u56DE\u5185\u5BB9\u4E3A\u7A7A\uFF0C\u8BF7\u68C0\u67E5 API \u914D\u7F6E\u6216\u7A0D\u540E\u91CD\u8BD5" };
    }
    const notes = parseAINoteOutput(aiContent, false);
    if (notes.length === 0) {
      console.warn("[\u63D0\u70BC] \u4E25\u683C\u6A21\u5F0F\u89E3\u6790\u5931\u8D25\uFF0C\u5C1D\u8BD5\u5BBD\u677E\u6A21\u5F0F\u964D\u7EA7...");
      const fallbackNotes = parseAINoteOutput(aiContent, true);
      if (fallbackNotes.length > 0) {
        console.warn(`[\u63D0\u70BC] \u5BBD\u677E\u6A21\u5F0F\u6210\u529F\u89E3\u6790 ${fallbackNotes.length} \u6761\u7B14\u8BB0\uFF08\u53EF\u80FD\u5305\u542B\u8D28\u91CF\u8F83\u4F4E\u7684\u6807\u9898\uFF09`);
        notes.push(...fallbackNotes);
      } else {
        console.warn("[\u63D0\u70BC] \u5BBD\u677E\u6A21\u5F0F\u4E5F\u5931\u8D25\uFF0CAI \u8F93\u51FA\u53EF\u80FD\u683C\u5F0F\u5F02\u5E38");
      }
    }
    const validationResults = notes.map((note) => ({
      note,
      validation: validateAtomicNote(note)
    }));
    const validNotes = validationResults.filter((item) => item.validation.valid).map((item) => item.note);
    if (validNotes.length === 0 && notes.length > 0) {
      const reasons = validationResults.map((item) => item.validation.issues.join("; ")).filter(Boolean).join(" | ");
      return { success: false, error: `AI \u8F93\u51FA\u7684\u7B14\u8BB0\u6821\u9A8C\u5931\u8D25: ${reasons}` };
    }
    ensureTags(validNotes, fullConfig.tagPreferences);
    return { success: true, notes: validNotes };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `AI \u8C03\u7528\u5931\u8D25: ${errorMsg}` };
  }
}
async function runExtraction(input, config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const tracker = createProgressTracker(fullConfig.onProgress || null);
  tracker.start("Phase 1", "\u8BFB\u53D6\u5185\u5BB9", "\u5F00\u59CB\u8BFB\u53D6...");
  const readResult = await readContent(input, fullConfig.signal);
  if (!readResult.success) {
    tracker.fail(readResult.error || "\u8BFB\u53D6\u5931\u8D25");
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: readResult.error };
  }
  tracker.complete(`\u6210\u529F\u8BFB\u53D6 ${readResult.content.length} \u5B57`);
  const content = readResult.content;
  const truncatedContent = content.length > INPUT_TRUNCATE_LENGTH ? content.slice(0, INPUT_TRUNCATE_LENGTH) : content;
  let detectedProfile;
  let profileSource;
  if (fullConfig.profile) {
    detectedProfile = fullConfig.profile;
    profileSource = "manual";
  } else if (fullConfig.autoClassify !== false) {
    detectedProfile = classifyContent(truncatedContent);
    profileSource = "auto";
  } else {
    detectedProfile = "balanced";
    profileSource = "manual";
  }
  const activeProfileConfig = resolveProfileConfig(detectedProfile, fullConfig.profileConfigs);
  let gateResult = {
    passed: true,
    summary: "",
    reasons: [],
    warnings: []
  };
  if (!fullConfig.skipGate) {
    tracker.start("Phase 2", "\u8D28\u91CF\u95E8\u63A7", "\u5F00\u59CB\u68C0\u67E5...");
    gateResult = runGateChecks(truncatedContent, [], activeProfileConfig);
    if (!gateResult.passed) {
      tracker.fail(gateResult.summary);
      return { success: false, steps: eventsToSteps(tracker.allEvents()), error: gateResult.summary, gateBlocked: true };
    }
    if (gateResult.warnings.length > 0) {
      tracker.complete(`\u901A\u8FC7\uFF08${gateResult.warnings.length} \u6761\u63D0\u9192\uFF1A${gateResult.warnings[0]}${gateResult.warnings.length > 1 ? "..." : ""}\uFF09`);
    } else {
      tracker.complete("\u901A\u8FC7");
    }
  } else {
    tracker.start("Phase 2", "\u8D28\u91CF\u95E8\u63A7", "\u5DF2\u8DF3\u8FC7\u963B\u65AD\uFF08\u5F3A\u5236\u63D0\u70BC\uFF09");
    gateResult = runGateChecks(truncatedContent, [], activeProfileConfig);
    if (gateResult.warnings.length > 0) {
      tracker.complete(`\u8DF3\u8FC7\u95E8\u63A7\uFF0C\u4F46\u68C0\u6D4B\u5230 ${gateResult.warnings.length} \u6761\u8D28\u91CF\u63D0\u9192`);
    } else {
      tracker.skip("\u7528\u6237\u9009\u62E9\u5F3A\u5236\u63D0\u70BC\uFF08\u65E0\u8D28\u91CF\u8B66\u544A\uFF09");
    }
  }
  tracker.complete(`\u7B56\u7565: ${PROFILE_LABELS[detectedProfile]} (${profileSource === "auto" ? "\u81EA\u52A8\u68C0\u6D4B" : "\u624B\u52A8\u6307\u5B9A"})`);
  let extractResult;
  if (fullConfig.enableDeepMode && content.length > INPUT_TRUNCATE_LENGTH) {
    tracker.start("Phase 3", "\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0\uFF08\u6DF1\u5EA6\u6A21\u5F0F\uFF09", `\u6587\u672C ${content.length} \u5B57\uFF0C\u5206\u6BB5\u63D0\u70BC\u4E2D...`);
    const chunkedNotes = await extractChunked(content, config, fullConfig.onProgress);
    if (chunkedNotes.length === 0) {
      extractResult = { success: false, error: "\u6DF1\u5EA6\u63D0\u70BC\u672A\u4EA7\u51FA\u4EFB\u4F55\u7B14\u8BB0" };
    } else {
      extractResult = { success: true, notes: chunkedNotes };
    }
  } else {
    tracker.start("Phase 3", "\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0", "\u6B63\u5728\u8C03\u7528 DeepSeek API...");
    extractResult = await extractAtomicNotes(truncatedContent, config);
  }
  if (!extractResult.success) {
    tracker.fail(extractResult.error || "\u63D0\u70BC\u5931\u8D25");
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: extractResult.error };
  }
  tracker.complete(`\u6210\u529F\u63D0\u70BC ${extractResult.notes.length} \u6761\u539F\u5B50\u7B14\u8BB0`);
  let notes = extractResult.notes;
  tracker.start("Phase 4", "\u540C\u6279\u4EA4\u53C9\u53BB\u91CD", "\u5F00\u59CB\u53BB\u91CD...");
  const dedupResult = crossCheckBatch(notes, activeProfileConfig.crossBatchThreshold);
  tracker.complete(`\u53BB\u91CD\u540E\u5269\u4F59 ${dedupResult.uniqueNotes.length} \u6761\uFF08\u53BB\u9664 ${notes.length - dedupResult.uniqueNotes.length} \u6761\u91CD\u590D\uFF09`);
  notes = dedupResult.uniqueNotes;
  if (notes.length === 0) {
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: "\u672A\u63D0\u70BC\u51FA\u4EFB\u4F55\u7B26\u5408\u6807\u51C6\u7684\u539F\u5B50\u7B14\u8BB0", notes: [] };
  }
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r)
      return r;
  }
  let vaultDedupResult;
  let vaultDedupPending = [];
  if (fullConfig.enableVaultDedup && fullConfig.vault) {
    tracker.start("Phase 4b", "\u77E5\u8BC6\u5E93\u53BB\u91CD", "\u6B63\u5728\u4E0E\u5DF2\u6709\u7B14\u8BB0\u6BD4\u5BF9...");
    const matchInfos = await checkAgainstVaultDetailed(
      fullConfig.vault,
      notes,
      fullConfig.dedupTargetFolder?.trim() || fullConfig.targetFolder || ""
    );
    const HIGH_SIM_THRESHOLD = activeProfileConfig.vaultHighThreshold;
    const MID_SIM_THRESHOLD = activeProfileConfig.vaultMidThreshold;
    const keptNotes = [];
    const highDupCount = matchInfos.filter((m) => m.bestMatch && m.bestMatch.similarity >= HIGH_SIM_THRESHOLD).length;
    const midDupCount = matchInfos.filter((m) => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD && m.bestMatch.similarity < HIGH_SIM_THRESHOLD).length;
    for (const info of matchInfos) {
      if (!info.bestMatch) {
        keptNotes.push(info.note);
      } else if (info.bestMatch.similarity >= HIGH_SIM_THRESHOLD) {
      } else if (info.bestMatch.similarity >= MID_SIM_THRESHOLD) {
        keptNotes.push(info.note);
        vaultDedupPending.push({
          similarity: info.bestMatch.similarity,
          matchedNote: info.bestMatch.path,
          matchedContent: info.bestMatch.content,
          newNoteIndex: info.noteIndex,
          newNoteTitle: info.note.title,
          newNoteContent: info.note.content
        });
      } else {
        keptNotes.push(info.note);
      }
    }
    notes = keptNotes;
    vaultDedupResult = {
      uniqueNotes: keptNotes,
      removedCount: highDupCount,
      duplicates: matchInfos.filter((m) => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD).map((m) => ({
        isDuplicate: true,
        similarity: m.bestMatch.similarity,
        matchedNote: m.bestMatch.path,
        matchedContent: m.bestMatch.content
      }))
    };
    tracker.complete(`\u77E5\u8BC6\u5E93\u53BB\u91CD\uFF1A\u53BB\u9664 ${highDupCount} \u6761\u9AD8\u76F8\u4F3C\u5EA6\u91CD\u590D\uFF0C${midDupCount} \u6761\u5F85\u786E\u8BA4`);
  } else {
    tracker.start("Phase 4b", "\u77E5\u8BC6\u5E93\u53BB\u91CD", "\u672A\u542F\u7528\u6216\u65E0 Vault");
    tracker.skip("\u672A\u542F\u7528\u6216\u65E0 Vault\uFF0C\u8DF3\u8FC7");
  }
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r)
      return r;
  }
  let verificationSummary;
  if (fullConfig.factCheck) {
    tracker.start("Phase 5", "\u5185\u5BB9\u6838\u67E5", "\u6B63\u5728\u6EAF\u6E90\u548C\u6BD4\u5BF9...");
    const verifyResult = await verifyClaims(truncatedContent, notes, {
      deepseekApiKey: fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.deepseekApiUrl,
      model: fullConfig.model,
      maxTokens: fullConfig.maxTokens,
      signal: fullConfig.signal
    });
    verificationSummary = { traced: verifyResult.traced, needsCompare: verifyResult.needsCompare, outOfScope: verifyResult.outOfScope };
    if (verifyResult.error) {
      tracker.fail(`\u6838\u67E5\u51FA\u9519: ${verifyResult.error}`);
    } else {
      if (fullConfig.verifiedOnly) {
        const originalCount = notes.length;
        notes = notes.filter((note) => {
          const v = note.verification;
          if (!v || v.length === 0)
            return true;
          return !v.some((r) => r.status === "\u8D85\u6E90");
        });
        vaultDedupPending = remapPendingDuplicates(notes, vaultDedupPending);
        tracker.complete(`\u6EAF\u6E90 ${verifyResult.traced}\uFF0C\u9700\u5BF9\u6BD4 ${verifyResult.needsCompare}\uFF0C\u8D85\u6E90 ${verifyResult.outOfScope}\uFF08\u8FC7\u6EE4\u8D85\u6E90\uFF1A${originalCount} \u2192 ${notes.length}\uFF09`);
      } else {
        tracker.complete(`\u6EAF\u6E90 ${verifyResult.traced}\uFF0C\u9700\u5BF9\u6BD4 ${verifyResult.needsCompare}\uFF0C\u8D85\u6E90 ${verifyResult.outOfScope}`);
      }
    }
  } else {
    tracker.start("Phase 5", "\u5185\u5BB9\u6838\u67E5", "\u672A\u542F\u7528");
    tracker.skip("\u672A\u542F\u7528\uFF0C\u8DF3\u8FC7");
  }
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r)
      return r;
  }
  if (fullConfig.enableReview) {
    tracker.start("Phase 6", "\u7B14\u8BB0\u590D\u67E5\uFF08AI \u53CC\u91CD\u4FDD\u9669\uFF09", "\u6B63\u5728\u5BF9\u7B14\u8BB0\u8FDB\u884C\u4EF7\u503C\u8BC4\u5206...");
    const reviewConfig = {
      deepseekApiKey: fullConfig.reviewApiKey || fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.reviewApiUrl || fullConfig.deepseekApiUrl,
      model: fullConfig.reviewModel || fullConfig.model,
      maxTokens: fullConfig.maxTokens,
      signal: fullConfig.signal,
      minScore: activeProfileConfig.reviewMinScore
    };
    const reviewResult = await reviewNotes(notes, reviewConfig);
    const filteredCount = notes.length - reviewResult.reviewedNotes.length;
    vaultDedupPending = remapPendingDuplicates(notes, vaultDedupPending);
    notes = reviewResult.reviewedNotes;
    if (!reviewResult.success) {
      tracker.fail("\u590D\u67E5\u5931\u8D25\uFF0C\u5DF2\u964D\u7EA7\u4F7F\u7528\u539F\u59CB\u7B14\u8BB0");
    } else if (filteredCount > 0) {
      tracker.complete(`\u590D\u67E5\u5B8C\u6210\uFF0C\u8FC7\u6EE4 ${filteredCount} \u6761\u4F4E\u8D28\u91CF\u7B14\u8BB0\uFF0C\u4FDD\u7559 ${notes.length} \u6761`);
    } else {
      tracker.complete("\u590D\u67E5\u5B8C\u6210\uFF0C\u65E0\u4F4E\u8D28\u91CF\u7B14\u8BB0\u9700\u8981\u8FC7\u6EE4");
    }
  } else {
    tracker.start("Phase 6", "\u7B14\u8BB0\u590D\u67E5", "\u672A\u542F\u7528");
    tracker.skip("\u672A\u542F\u7528\uFF0C\u8DF3\u8FC7");
  }
  tracker.finish();
  if (vaultDedupResult) {
    vaultDedupResult = {
      ...vaultDedupResult,
      uniqueNotes: notes
    };
  }
  const duplicateHints = vaultDedupPending.length > 0 ? vaultDedupPending.map((p) => ({
    noteIndex: p.newNoteIndex,
    similarity: p.similarity,
    matchedNote: p.matchedNote,
    matchedContent: p.matchedContent,
    newNoteTitle: p.newNoteTitle,
    newNoteContent: p.newNoteContent
  })) : void 0;
  return {
    success: true,
    notes,
    steps: eventsToSteps(tracker.allEvents()),
    gateWarnings: gateResult.warnings.length > 0 ? gateResult.warnings : void 0,
    detectedProfile,
    profileSource,
    crossBatchDuplicates: dedupResult.duplicates.length > 0 ? dedupResult.duplicates : void 0,
    verificationSummary,
    vaultDedupResult,
    vaultDedupPending: vaultDedupPending.length > 0 ? vaultDedupPending : void 0,
    duplicateHints
  };
}

// src/utils/clipboard.ts
function stripImageNoise(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "");
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, "");
  cleaned = cleaned.replace(/<img[^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/^https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)(?:\?[^\s]*)?$/gim, "");
  cleaned = cleaned.replace(/^[\w-]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico)\s*$/gim, "");
  cleaned = cleaned.replace(/^图(?:片)?\s*$/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// src/storage.ts
var import_obsidian6 = require("obsidian");
var DEFAULT_CONFIG2 = {
  targetFolder: "Atomic Notes",
  fileNameTemplate: "{{title}}"
};
async function ensureFolder(app, folderPath) {
  const normalizedPath = (0, import_obsidian6.normalizePath)(folderPath);
  const folder = app.vault.getAbstractFileByPath(normalizedPath);
  if (!folder) {
    await app.vault.createFolder(normalizedPath);
  }
}
function generateFileName(template, note) {
  const safeTemplate = template || "{{title}}";
  const now = /* @__PURE__ */ new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "-");
  let fileName = safeTemplate.replace(/{{title}}/g, sanitizeFileName(note.title)).replace(/{{date}}/g, date).replace(/{{time}}/g, time).replace(/{{timestamp}}/g, String(Date.now()));
  if (!fileName.trim()) {
    fileName = sanitizeFileName(note.title) || `note-${Date.now()}`;
  }
  return fileName;
}
function sanitizeFileName(name) {
  const sanitized = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, MAX_FILENAME_LENGTH);
  return sanitized || `note-${Date.now()}`;
}
function escapeYamlValue(value) {
  if (/[:\[\]{}#&*!|>'"%@`,?\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
function formatNoteAsMarkdown(note) {
  const lines = [];
  lines.push("---");
  lines.push(`title: ${escapeYamlValue(note.title)}`);
  lines.push(`created: ${note.createdAt}`);
  if (note.tags && note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ")}]`);
  }
  lines.push("---");
  lines.push("");
  const cleanedContent = note.content.replace(/\n?---\n?来源[：:]\s*.+$/m, "").replace(/\n?来源[：:]\s*.+$/m, "").trim();
  lines.push(cleanedContent || note.content);
  return lines.join("\n");
}
async function saveNotes(app, notes, config = {}) {
  const result = {
    success: 0,
    failed: 0,
    paths: [],
    errors: []
  };
  const fullConfig = { ...DEFAULT_CONFIG2, ...config };
  if (!fullConfig.targetFolder?.trim()) {
    fullConfig.targetFolder = DEFAULT_CONFIG2.targetFolder;
  }
  try {
    await ensureFolder(app, fullConfig.targetFolder);
    const existingFiles = app.vault.getMarkdownFiles();
    const existingPaths = new Set(
      existingFiles.filter((f) => f.path.startsWith(fullConfig.targetFolder)).map((f) => f.path)
    );
    for (const note of notes) {
      try {
        const fileName = generateFileName(fullConfig.fileNameTemplate, note);
        let filePath = (0, import_obsidian6.normalizePath)(`${fullConfig.targetFolder}/${fileName}.md`);
        const content = formatNoteAsMarkdown(note);
        if (existingPaths.has(filePath)) {
          const baseName = fileName;
          let counter = 1;
          do {
            const newFileName = `${baseName} ${counter}`;
            filePath = (0, import_obsidian6.normalizePath)(`${fullConfig.targetFolder}/${newFileName}.md`);
            counter++;
          } while (existingPaths.has(filePath));
          existingPaths.add(filePath);
        }
        await app.vault.create(filePath, content);
        result.success++;
        result.paths.push(filePath);
        existingPaths.add(filePath);
      } catch (error) {
        result.failed++;
        if (error instanceof Error) {
          result.errors.push(error.message);
        } else {
          result.errors.push(String(error));
        }
      }
    }
  } catch (error) {
    result.failed = notes.length;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  return result;
}

// src/ui/result-modal.ts
var import_obsidian7 = require("obsidian");
var STEP_COLORS = {
  success: "var(--color-green)",
  failed: "var(--color-red)",
  skipped: "var(--text-faint)"
};
var STEP_ICONS = {
  success: "\u2713",
  failed: "\u2717",
  skipped: "\u2014"
};
var ResultModal = class extends import_obsidian7.Modal {
  constructor(app, result, dedupResult, onSave) {
    super(app);
    this.selectedNotes = /* @__PURE__ */ new Set();
    this.countEl = null;
    /** 用户确认保留的疑似重复索引 */
    this.confirmedPending = /* @__PURE__ */ new Set();
    /** 用户从去重详情中恢复的批内重复索引 */
    this.restoredCrossBatch = /* @__PURE__ */ new Set();
    /** 刷新笔记卡片列表（用于恢复/变更后重新渲染） */
    this.notesListEl = null;
    this.cardsContainerEl = null;
    /** 当前筛选状态 */
    this.filterMode = "all";
    /** 当前搜索关键词 */
    this.searchQuery = "";
    /** 筛选后可见的笔记索引列表 */
    this.visibleIndices = [];
    this.result = result;
    this.dedupResult = dedupResult;
    this.onSave = onSave || (async () => {
    });
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u539F\u5B50\u7B14\u8BB0\u63D0\u70BC\u7ED3\u679C" });
    if (this.result.detectedProfile) {
      const badge = contentEl.createEl("div", {
        cls: "atomic-notes-profile-badge"
      });
      badge.style.display = "inline-block";
      badge.style.padding = "4px 12px";
      badge.style.borderRadius = "12px";
      badge.style.fontSize = "12px";
      badge.style.background = "var(--background-modifier-hover)";
      badge.style.color = "var(--text-muted)";
      badge.style.marginBottom = "8px";
      const profileName = PROFILE_LABELS[this.result.detectedProfile] || this.result.detectedProfile;
      const sourceLabel = this.result.profileSource === "auto" ? "\u81EA\u52A8\u68C0\u6D4B" : "\u624B\u52A8\u6307\u5B9A";
      badge.textContent = `\u7B56\u7565: ${profileName} (${sourceLabel})`;
    }
    this.renderSteps(contentEl);
    if (this.result.success && this.result.gateWarnings && this.result.gateWarnings.length > 0) {
      this.renderGateWarnings(contentEl);
    }
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
      const errEl = contentEl.createEl("p", { cls: "atomic-notes-error" });
      errEl.createEl("strong", { text: "\u63D0\u70BC\u5931\u8D25\uFF1A" });
      if (this.result.error?.includes("[\u8BCA\u65AD]")) {
        const pre = errEl.createEl("pre", { cls: "atomic-notes-diag", text: this.result.error });
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordWrap = "break-word";
        pre.style.maxHeight = "400px";
        pre.style.overflowY = "auto";
        pre.style.fontSize = "12px";
        pre.style.background = "var(--background-secondary)";
        pre.style.padding = "10px";
        pre.style.borderRadius = "6px";
        pre.style.marginTop = "8px";
      } else {
        errEl.appendText(this.result.error || "");
      }
    }
    this.renderActions(contentEl);
  }
  /** 时间线样式步骤展示 */
  renderSteps(container) {
    container.createEl("div", { text: "\u5904\u7406\u6D41\u7A0B", cls: "atomic-notes-section-header" });
    const timeline = container.createEl("div", { cls: "atomic-notes-timeline" });
    for (const step of this.result.steps) {
      const item = timeline.createEl("div", { cls: "atomic-notes-timeline-item" });
      const dot = item.createEl("div", { cls: "atomic-notes-timeline-dot" });
      dot.style.background = STEP_COLORS[step.status] || "var(--text-faint)";
      dot.setText(STEP_ICONS[step.status] || "?");
      item.createEl("div", { cls: "atomic-notes-timeline-step", text: step.step });
      item.createEl("div", { cls: "atomic-notes-timeline-message", text: step.message });
    }
  }
  /** 门控警告栏（黄色提示，不阻断） */
  renderGateWarnings(container) {
    const warnings = this.result.gateWarnings;
    if (!warnings || warnings.length === 0)
      return;
    const box = container.createEl("div", {
      attr: {
        style: [
          "border-left: 3px solid var(--color-orange)",
          "background: rgba(var(--color-orange-rgb, 255,160,0), 0.08)",
          "border-radius: 6px",
          "padding: 8px 12px",
          "margin-bottom: 10px"
        ].join(";")
      }
    });
    const titleRow = box.createEl("div", {
      attr: { style: "display:flex;align-items:center;gap:6px;margin-bottom:4px" }
    });
    titleRow.createEl("span", { text: "\u26A0\uFE0F", attr: { style: "font-size:13px" } });
    titleRow.createEl("span", {
      text: `\u95E8\u63A7\u8B66\u544A\uFF08${warnings.length} \u6761\uFF0C\u4E0D\u5F71\u54CD\u63D0\u70BC\u7ED3\u679C\uFF09`,
      attr: { style: "font-weight:600;font-size:12px;color:var(--color-orange)" }
    });
    const list = box.createEl("ul", {
      attr: { style: "margin:0;padding-left:18px;font-size:12px;color:var(--text-muted);line-height:1.7" }
    });
    for (const w of warnings) {
      list.createEl("li", { text: w });
    }
  }
  renderDedupReport(container) {
    if (!this.dedupResult)
      return;
    const reportEl = container.createEl("div", { cls: "atomic-notes-dedup-report" });
    reportEl.createEl("div", { text: "\u53BB\u91CD\u62A5\u544A", cls: "atomic-notes-section-header" });
    if (this.dedupResult.duplicates.length === 0) {
      reportEl.createEl("p", {
        text: "\u672A\u68C0\u6D4B\u5230\u4E0E\u77E5\u8BC6\u5E93\u91CD\u590D\u7684\u7B14\u8BB0",
        attr: { style: "color:var(--text-muted)" }
      });
    } else {
      reportEl.createEl("p", {
        text: `\u68C0\u6D4B\u5230 ${this.dedupResult.duplicates.length} \u6761\u53EF\u80FD\u91CD\u590D\u7684\u7B14\u8BB0\uFF1A`
      });
      const dupList = reportEl.createEl("ul");
      for (const dup of this.dedupResult.duplicates) {
        dupList.createEl("li").setText(
          `\u76F8\u4F3C\u5EA6\uFF1A${(dup.similarity * 100).toFixed(1)}% | \u5339\u914D\uFF1A${dup.matchedNote || "\u672A\u77E5"}`
        );
      }
    }
    reportEl.createEl("p", {
      text: `\u6700\u7EC8\u4FDD\u5B58 ${this.dedupResult.uniqueNotes.length} \u6761\u7B14\u8BB0`,
      attr: { style: "font-weight:600;color:var(--text-accent)" }
    });
  }
  /** 批内去重详情（可折叠，支持手动恢复） */
  renderCrossBatchDetails(container) {
    const dups = this.result.crossBatchDuplicates;
    if (!dups || dups.length === 0)
      return;
    const section = container.createEl("div", { cls: "atomic-notes-cross-dedup" });
    const header = section.createEl("div", {
      attr: {
        style: "display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none"
      }
    });
    const arrow = header.createEl("span", {
      text: "\u25B6",
      attr: { style: "font-size:10px;transition:transform 0.2s;display:inline-block" }
    });
    header.createEl("span", {
      text: `\u6279\u5185\u53BB\u91CD\u8BE6\u60C5\uFF08${dups.length} \u6761\u88AB\u5408\u5E76\uFF09`,
      attr: { style: "font-weight:600;font-size:13px" }
    });
    header.createEl("span", {
      text: "\u70B9\u51FB\u5C55\u5F00",
      attr: { style: "font-size:11px;color:var(--text-muted)" }
    });
    const detailContainer = section.createEl("div", {
      attr: { style: "display:none;border-left:3px solid var(--background-modifier-border);padding-left:12px;margin-top:8px" }
    });
    let isOpen = false;
    header.addEventListener("click", () => {
      isOpen = !isOpen;
      detailContainer.style.display = isOpen ? "block" : "none";
      arrow.style.transform = isOpen ? "rotate(90deg)" : "rotate(0deg)";
      hintEl.textContent = isOpen ? "\u70B9\u51FB\u6536\u8D77" : "\u70B9\u51FB\u5C55\u5F00";
    });
    const hintEl = header.lastChild;
    for (let i = 0; i < dups.length; i++) {
      const dup = dups[i];
      const card = detailContainer.createEl("div", {
        attr: {
          style: "border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--background-secondary)"
        }
      });
      const simPercent = (dup.similarity * 100).toFixed(1);
      card.createEl("div", {
        text: `\u76F8\u4F3C\u5EA6 ${simPercent}%`,
        attr: { style: "font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:4px" }
      });
      const removedRow = card.createEl("div", { attr: { style: "margin-bottom:4px" } });
      removedRow.createEl("span", {
        text: "\u88AB\u5408\u5E76\uFF1A",
        attr: { style: "font-weight:600;font-size:12px" }
      });
      removedRow.createEl("span", {
        text: dup.removedTitle,
        attr: { style: "font-size:12px" }
      });
      const removedPreview = dup.removedContent.slice(0, 120) + (dup.removedContent.length > 120 ? "..." : "");
      card.createEl("div", {
        text: removedPreview,
        attr: { style: "font-size:11px;color:var(--text-muted);margin-bottom:6px" }
      });
      const matchedRow = card.createEl("div", { attr: { style: "margin-bottom:6px" } });
      matchedRow.createEl("span", {
        text: "\u5E76\u5165\uFF1A",
        attr: { style: "font-weight:600;font-size:12px" }
      });
      matchedRow.createEl("span", {
        text: dup.matchedNote || "\u672A\u77E5",
        attr: { style: "font-size:12px" }
      });
      if (dup.matchedContent) {
        card.createEl("div", {
          text: dup.matchedContent.slice(0, 120) + (dup.matchedContent.length > 120 ? "..." : ""),
          attr: { style: "font-size:11px;color:var(--text-muted);margin-bottom:6px" }
        });
      }
      if (this.restoredCrossBatch.has(i)) {
        const restoredLabel = card.createEl("span", {
          text: "\u5DF2\u6062\u590D",
          attr: { style: "font-size:11px;color:var(--text-muted);font-style:italic" }
        });
      } else {
        const restoreBtn = card.createEl("button", {
          text: "\u6062\u590D\u4E3A\u72EC\u7ACB\u7B14\u8BB0",
          attr: { style: "font-size:11px;padding:2px 10px;cursor:pointer" }
        });
        restoreBtn.addEventListener("click", () => {
          this.restoreCrossBatchNote(dup, i);
          card.style.opacity = "0.6";
          restoreBtn.detach();
          card.createEl("span", {
            text: "\u5DF2\u6062\u590D",
            attr: { style: "font-size:11px;color:var(--text-muted);font-style:italic" }
          });
        });
      }
    }
  }
  /** 将被合并的笔记恢复为独立笔记 */
  restoreCrossBatchNote(dup, index) {
    if (!this.result.notes)
      return;
    const note = {
      title: dup.removedTitle,
      content: dup.removedContent,
      tags: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const newIdx = this.result.notes.length;
    this.result.notes.push(note);
    this.selectedNotes.add(newIdx);
    this.restoredCrossBatch.add(index);
    this.updateSelectionCount();
    this.refreshNotesList();
  }
  refreshNotesList() {
    if (!this.notesListEl)
      return;
    const parent = this.notesListEl.parentElement;
    if (!parent)
      return;
    this.notesListEl.detach();
    this.renderNotes(parent);
  }
  /** 仅刷新卡片区域（搜索/筛选时用，不重建工具栏） */
  refreshFilteredNotes() {
    if (!this.cardsContainerEl)
      return;
    this.cardsContainerEl.empty();
    this.renderNoteCardsInto(this.cardsContainerEl);
  }
  /** 疑似重复确认 UI（中相似度 60-80%） */
  renderPendingDuplicates(container) {
    const pending = this.result.vaultDedupPending;
    if (!pending || pending.length === 0)
      return;
    const section = container.createEl("div", { cls: "atomic-notes-pending-dedup" });
    section.createEl("div", { text: "\u26A0\uFE0F \u7591\u4F3C\u91CD\u590D\u7B14\u8BB0\uFF08\u9700\u786E\u8BA4\uFF09", cls: "atomic-notes-section-header" });
    section.createEl("p", {
      text: `\u53D1\u73B0 ${pending.length} \u6761\u7B14\u8BB0\u4E0E\u77E5\u8BC6\u5E93\u5DF2\u6709\u7B14\u8BB0\u76F8\u4F3C\u5EA6\u8F83\u9AD8\uFF0860%-80%\uFF09\uFF0C\u8BF7\u9010\u4E00\u786E\u8BA4\u662F\u5426\u4FDD\u7559\uFF1A`,
      attr: { style: "color:var(--text-muted);font-size:13px" }
    });
    for (const item of pending) {
      const card = section.createEl("div", {
        attr: {
          style: "border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--background-secondary)"
        }
      });
      const simPercent = (item.similarity * 100).toFixed(1);
      card.createEl("div", {
        text: `\u76F8\u4F3C\u5EA6 ${simPercent}%`,
        attr: { style: "font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:6px" }
      });
      const newNoteDiv = card.createEl("div");
      newNoteDiv.createEl("span", {
        text: "\u65B0\u7B14\u8BB0\uFF1A",
        attr: { style: "font-weight:600;font-size:13px" }
      });
      newNoteDiv.createEl("span", {
        text: item.newNoteTitle,
        attr: { style: "font-size:13px" }
      });
      const newPreview = item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? "..." : "");
      card.createEl("div", {
        text: newPreview,
        attr: { style: "font-size:12px;color:var(--text-muted);margin:4px 0 8px" }
      });
      const existingDiv = card.createEl("div");
      existingDiv.createEl("span", {
        text: "\u5DF2\u6709\u7B14\u8BB0\uFF1A",
        attr: { style: "font-weight:600;font-size:13px" }
      });
      existingDiv.createEl("span", {
        text: item.matchedNote,
        attr: { style: "font-size:13px" }
      });
      card.createEl("div", {
        text: item.matchedContent,
        attr: { style: "font-size:12px;color:var(--text-muted);margin:4px 0 8px" }
      });
      const btnRow = card.createEl("div", {
        attr: { style: "display:flex;gap:8px;justify-content:flex-end" }
      });
      const keepBtn = btnRow.createEl("button", {
        text: "\u4FDD\u7559\u65B0\u7B14\u8BB0",
        attr: { style: "font-size:12px;padding:4px 12px;cursor:pointer" }
      });
      keepBtn.addEventListener("click", () => {
        this.confirmedPending.add(item.newNoteIndex);
        card.style.opacity = "0.5";
        keepBtn.setText("\u5DF2\u4FDD\u7559");
        keepBtn.setAttribute("disabled", "true");
        discardBtn.setAttribute("disabled", "true");
      });
      const discardBtn = btnRow.createEl("button", {
        text: "\u4E22\u5F03\u65B0\u7B14\u8BB0",
        attr: { style: "font-size:12px;padding:4px 12px;cursor:pointer" }
      });
      discardBtn.addEventListener("click", () => {
        this.confirmedPending.delete(item.newNoteIndex);
        this.selectedNotes.delete(item.newNoteIndex);
        card.style.opacity = "0.5";
        discardBtn.setText("\u5DF2\u4E22\u5F03");
        discardBtn.setAttribute("disabled", "true");
        keepBtn.setAttribute("disabled", "true");
        this.updateSelectionCount();
      });
    }
    const quickActions = section.createEl("div", {
      attr: { style: "display:flex;gap:8px;margin-top:8px" }
    });
    const keepAllBtn = quickActions.createEl("button", {
      text: "\u5168\u90E8\u4FDD\u7559",
      attr: { style: "font-size:12px;padding:4px 12px;cursor:pointer" }
    });
    keepAllBtn.addEventListener("click", () => {
      for (const item of pending) {
        this.confirmedPending.add(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
    });
    const discardAllBtn = quickActions.createEl("button", {
      text: "\u5168\u90E8\u4E22\u5F03",
      attr: { style: "font-size:12px;padding:4px 12px;cursor:pointer" }
    });
    discardAllBtn.addEventListener("click", () => {
      for (const item of pending) {
        this.selectedNotes.delete(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
      this.updateSelectionCount();
    });
  }
  renderVerificationSummary(container) {
    const summary = this.result.verificationSummary;
    if (!summary)
      return;
    const el = container.createEl("div");
    el.createEl("div", { text: "\u5185\u5BB9\u6838\u67E5", cls: "atomic-notes-section-header" });
    const total = summary.traced + summary.needsCompare + summary.outOfScope;
    if (total === 0) {
      el.createEl("p", { text: "\u65E0\u53EF\u9A8C\u8BC1\u5185\u5BB9", attr: { style: "color:var(--text-muted)" } });
      return;
    }
    const row = el.createEl("div", { attr: { style: "display:flex;gap:12px;align-items:center" } });
    row.createEl("span", {
      text: `\u5DF2\u6EAF\u6E90 ${summary.traced}`,
      cls: "atomic-notes-verify-chip verified"
    });
    row.createEl("span", {
      text: `\u9700\u5BF9\u6BD4 ${summary.needsCompare}`,
      cls: "atomic-notes-verify-chip doubtful"
    });
    row.createEl("span", {
      text: `\u8D85\u6E90 ${summary.outOfScope}`,
      cls: "atomic-notes-verify-chip unverified"
    });
  }
  /** 判断笔记是否属于"有问题"（需对比或超源） */
  noteHasIssues(i) {
    const note = this.result.notes[i];
    return (note.needsCompareCount ?? 0) > 0 || (note.outOfScopeCount ?? 0) > 0;
  }
  /** 判断笔记是否属于"已溯源"（有溯源且无问题） */
  noteIsTraced(i) {
    const note = this.result.notes[i];
    return (note.tracedCount ?? 0) > 0 && (note.needsCompareCount ?? 0) === 0 && (note.outOfScopeCount ?? 0) === 0;
  }
  /** 笔记是否匹配当前筛选条件 */
  noteMatchesFilter(i) {
    if (this.filterMode === "issues")
      return this.noteHasIssues(i);
    if (this.filterMode === "traced")
      return this.noteIsTraced(i);
    return true;
  }
  /** 笔记是否匹配搜索关键词 */
  noteMatchesSearch(i) {
    if (!this.searchQuery)
      return true;
    const note = this.result.notes[i];
    const q = this.searchQuery.toLowerCase();
    return (note.title || "").toLowerCase().includes(q) || (note.content || "").toLowerCase().includes(q);
  }
  /** 卡片式笔记列表 */
  renderNotes(container) {
    const notesEl = container.createEl("div");
    this.notesListEl = notesEl;
    const headerEl = notesEl.createEl("div", {
      attr: { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px" }
    });
    headerEl.createEl("h3", {
      text: `\u63D0\u70BC\u7ED3\u679C\uFF08${this.result.notes.length} \u6761\uFF09`,
      attr: { style: "margin:0" }
    });
    const toggleBtn = headerEl.createEl("button", {
      text: "\u53D6\u6D88\u5168\u9009",
      attr: { style: "font-size:11px;padding:2px 8px;cursor:pointer" }
    });
    toggleBtn.addEventListener("click", () => {
      if (this.selectedNotes.size === this.result.notes.length) {
        this.selectedNotes.clear();
        toggleBtn.setText("\u5168\u9009");
      } else {
        this.selectedNotes = new Set(this.result.notes.map((_, i) => i));
        toggleBtn.setText("\u53D6\u6D88\u5168\u9009");
      }
      this.updateSelectionCount();
    });
    const toolbar = notesEl.createEl("div", {
      attr: { style: "display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap" }
    });
    const filterGroup = toolbar.createEl("div", {
      attr: { style: "display:flex;gap:4px" }
    });
    const filterBtns = [
      { mode: "all", label: "\u5168\u90E8" },
      { mode: "issues", label: "\u6709\u95EE\u9898" },
      { mode: "traced", label: "\u5DF2\u6EAF\u6E90" }
    ];
    const filterBtnEls = {};
    for (const { mode, label } of filterBtns) {
      const count = mode === "all" ? this.result.notes.length : mode === "issues" ? this.result.notes.filter((_, i) => this.noteHasIssues(i)).length : this.result.notes.filter((_, i) => this.noteIsTraced(i)).length;
      const btn = filterGroup.createEl("button", {
        text: `${label}${count > 0 ? ` (${count})` : ""}`,
        attr: {
          style: `font-size:11px;padding:3px 10px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:${this.filterMode === mode ? "var(--interactive-accent)" : "var(--background-secondary)"};color:${this.filterMode === mode ? "var(--text-on-accent)" : "var(--text-muted)"}`
        }
      });
      btn.addEventListener("click", () => {
        this.filterMode = mode;
        for (const [m, b] of Object.entries(filterBtnEls)) {
          const isActive = m === mode;
          b.style.background = isActive ? "var(--interactive-accent)" : "var(--background-secondary)";
          b.style.color = isActive ? "var(--text-on-accent)" : "var(--text-muted)";
        }
        this.refreshFilteredNotes();
      });
      filterBtnEls[mode] = btn;
    }
    const searchInput = toolbar.createEl("input", {
      attr: {
        type: "text",
        placeholder: "\u641C\u7D22\u6807\u9898\u6216\u5185\u5BB9...",
        style: "flex:1;min-width:120px;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary)"
      }
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.trim();
      this.refreshFilteredNotes();
    });
    this.cardsContainerEl = notesEl.createEl("div", { cls: "atomic-notes-cards-container" });
    this.renderNoteCardsInto(this.cardsContainerEl);
  }
  /** 渲染笔记卡片到指定容器（受筛选和搜索控制） */
  renderNoteCardsInto(container) {
    this.visibleIndices = [];
    for (let i = 0; i < this.result.notes.length; i++) {
      if (this.noteMatchesFilter(i) && this.noteMatchesSearch(i)) {
        this.visibleIndices.push(i);
      }
    }
    if (this.visibleIndices.length === 0) {
      container.createEl("div", {
        text: "\u6CA1\u6709\u5339\u914D\u7684\u7B14\u8BB0",
        attr: { style: "color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center" }
      });
      return;
    }
    for (const i of this.visibleIndices) {
      const note = this.result.notes[i];
      const card = container.createEl("div", { cls: "atomic-notes-card" });
      const headerRow = card.createEl("div", { cls: "atomic-notes-card-header" });
      const checkbox = headerRow.createEl("input", {
        attr: { type: "checkbox" }
      });
      checkbox.checked = true;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked)
          this.selectedNotes.add(i);
        else
          this.selectedNotes.delete(i);
        this.updateSelectionCount();
      });
      headerRow.createEl("span", {
        cls: "atomic-notes-card-title",
        text: `${i + 1}. ${note.title}`
      });
      if (note.verification && note.verification.length > 0) {
        const traced = note.tracedCount ?? 0;
        const needsCompare = note.needsCompareCount ?? 0;
        const outOfScope = note.outOfScopeCount ?? 0;
        const chipGroup = headerRow.createEl("span", {
          attr: { style: "display:inline-flex;gap:4px;margin-left:auto" }
        });
        if (traced > 0) {
          chipGroup.createEl("span", { cls: "atomic-notes-verify-chip verified", text: `\u6EAF\u6E90${traced}` });
        }
        if (needsCompare > 0) {
          chipGroup.createEl("span", { cls: "atomic-notes-verify-chip doubtful", text: `\u5BF9\u6BD4${needsCompare}` });
        }
        if (outOfScope > 0) {
          chipGroup.createEl("span", { cls: "atomic-notes-verify-chip unverified", text: `\u8D85\u6E90${outOfScope}` });
        }
      }
      const preview = note.content.slice(0, 200) + (note.content.length > 200 ? "..." : "");
      card.createEl("div", { cls: "atomic-notes-card-preview", text: preview });
      if (note.verification && note.verification.length > 0) {
        const verifySection = card.createEl("div", {
          attr: { style: "margin-top:6px" }
        });
        const verifyHeader = verifySection.createEl("div", {
          attr: {
            style: "display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:2px 0"
          }
        });
        const verifyArrow = verifyHeader.createEl("span", {
          text: "\u25B8",
          attr: { style: "font-size:10px;transition:transform 0.2s;display:inline-block;color:var(--text-muted)" }
        });
        verifyHeader.createEl("span", {
          text: "\u6838\u67E5\u8BE6\u60C5",
          attr: { style: "font-size:11px;color:var(--text-muted);font-weight:500" }
        });
        const verifyBody = verifySection.createEl("div", {
          attr: { style: "display:none;margin-top:6px;border-left:2px solid var(--background-modifier-border);padding-left:10px" }
        });
        let verifyOpen = false;
        verifyHeader.addEventListener("click", () => {
          verifyOpen = !verifyOpen;
          verifyBody.style.display = verifyOpen ? "block" : "none";
          verifyArrow.style.transform = verifyOpen ? "rotate(90deg)" : "rotate(0deg)";
        });
        const statusColorMap = {
          "\u5DF2\u6EAF\u6E90": "var(--color-green)",
          "\u9700\u5BF9\u6BD4": "var(--color-orange)",
          "\u8D85\u6E90": "var(--color-red)"
        };
        for (const item of note.verification) {
          const row = verifyBody.createEl("div", {
            attr: { style: "margin-bottom:8px" }
          });
          const claimRow = row.createEl("div", {
            attr: { style: "display:flex;align-items:flex-start;gap:6px" }
          });
          claimRow.createEl("span", {
            text: item.status,
            attr: {
              style: `font-size:9px;padding:1px 6px;border-radius:8px;color:#fff;background:${statusColorMap[item.status] || "var(--text-faint)"};white-space:nowrap;flex-shrink:0;margin-top:1px`
            }
          });
          claimRow.createEl("span", {
            text: item.claim,
            attr: { style: "font-size:11px;color:var(--text-normal);line-height:1.4" }
          });
          if (item.sourceText) {
            row.createEl("div", {
              text: `\u{1F4D6} ${item.sourceText}`,
              attr: { style: "font-size:10px;color:var(--text-muted);margin-top:3px;padding:4px 6px;background:var(--background-secondary);border-radius:4px;line-height:1.4" }
            });
          }
          if (item.diffNote) {
            row.createEl("div", {
              text: `\u26A0 ${item.diffNote}`,
              attr: { style: "font-size:10px;color:var(--color-orange);margin-top:2px" }
            });
          }
          if (item.reason && !item.sourceText) {
            row.createEl("div", {
              text: item.reason,
              attr: { style: "font-size:10px;color:var(--text-faint);margin-top:2px;font-style:italic" }
            });
          }
        }
      }
      if (note.tags && note.tags.length > 0) {
        const footer = card.createEl("div", { cls: "atomic-notes-card-footer" });
        for (const tag of note.tags) {
          footer.createEl("span", { cls: "atomic-notes-tag-chip", text: tag });
        }
      } else {
        const footer = card.createEl("div", { cls: "atomic-notes-card-footer" });
        let synthColor = "var(--text-faint)";
        let synthLabel = "\u7EFC\u5408\u5224\u65AD";
        const outOfScope = note.outOfScopeCount ?? 0;
        const needsCompare = note.needsCompareCount ?? 0;
        const traced = note.tracedCount ?? 0;
        if (outOfScope > 0) {
          synthColor = "var(--color-red)";
          synthLabel = "\u7EFC\u5408\u5224\u65AD \xB7 \u8D85\u6E90";
        } else if (needsCompare > 0) {
          synthColor = "var(--color-orange)";
          synthLabel = "\u7EFC\u5408\u5224\u65AD \xB7 \u9700\u5BF9\u6BD4";
        } else if (traced > 0) {
          synthColor = "var(--color-green)";
          synthLabel = "\u7EFC\u5408\u5224\u65AD \xB7 \u5DF2\u6EAF\u6E90";
        }
        footer.createEl("span", {
          text: synthLabel,
          attr: {
            style: `font-size:10px;padding:2px 8px;border-radius:10px;color:#fff;background:${synthColor};font-style:italic`
          }
        });
      }
    }
  }
  renderActions(container) {
    if (!this.result.success || this.result.notes.length === 0) {
      new import_obsidian7.Setting(container).addButton(
        (btn) => btn.setButtonText("\u5173\u95ED").onClick(() => this.close())
      );
      return;
    }
    this.countEl = container.createEl("p", {
      text: `\u5DF2\u9009 ${this.selectedNotes.size} / ${this.result.notes.length} \u6761`,
      attr: { style: "font-size:12px;color:var(--text-muted);margin:8px 0" }
    });
    const bar = container.createEl("div", { cls: "atomic-notes-action-bar" });
    bar.createEl("button", { text: "\u4FDD\u5B58\u9009\u4E2D\u7B14\u8BB0", cls: "mod-cta" }).addEventListener("click", async () => {
      const selected = this.result.notes.filter((_, i) => this.selectedNotes.has(i));
      if (selected.length === 0)
        return;
      await this.onSave(selected);
      this.close();
    });
    bar.createEl("button", { text: "\u5173\u95ED" }).addEventListener("click", () => this.close());
  }
  updateSelectionCount() {
    if (this.countEl) {
      this.countEl.setText(`\u5DF2\u9009 ${this.selectedNotes.size} / ${this.result.notes.length} \u6761`);
    }
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};

// src/ui/input-modal.ts
var import_obsidian8 = require("obsidian");
var InputModal = class extends import_obsidian8.Modal {
  constructor(app, options) {
    super(app);
    this.value = "";
    this.title = options.title;
    this.placeholder = options.placeholder || "";
    this.submitText = options.submitText || "\u786E\u5B9A";
    this.value = options.value || "";
    this.onSubmit = options.onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    let inputValue = this.value;
    new import_obsidian8.Setting(contentEl).setName("\u8F93\u5165").addText((text) => {
      text.setPlaceholder(this.placeholder).setValue(this.value).onChange((value) => {
        inputValue = value;
      });
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.onSubmit(inputValue);
          this.close();
        }
      });
    });
    new import_obsidian8.Setting(contentEl).addButton(
      (btn) => btn.setButtonText(this.submitText).setCta().onClick(() => {
        this.onSubmit(inputValue);
        this.close();
      })
    ).addButton(
      (btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => this.close())
    );
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};

// src/ui/panel-view.ts
var import_obsidian9 = require("obsidian");

// src/discovery/keywords.ts
function extractKeywords(text) {
  return extractKeywordSet(text);
}

// src/discovery/similarity-matrix.ts
var CACHE_TTL = 5 * 60 * 1e3;
var DiscoveryCacheManager = class {
  constructor() {
    this.discoveryCache = { matrix: null, notes: null, timestamp: 0 };
  }
  /** 清除所有缓存 */
  invalidate() {
    this.discoveryCache = { matrix: null, notes: null, timestamp: 0 };
  }
  /** 获取相似度矩阵缓存（若未过期） */
  getDiscovery() {
    if (this.discoveryCache.matrix && this.discoveryCache.timestamp > Date.now() - CACHE_TTL) {
      return { notes: this.discoveryCache.notes, matrix: this.discoveryCache.matrix };
    }
    return null;
  }
  /** 更新相似度矩阵缓存 */
  setDiscovery(notes, matrix) {
    this.discoveryCache = { matrix, notes, timestamp: Date.now() };
  }
};
var defaultCacheManager = new DiscoveryCacheManager();
function jaccardSim(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0)
    return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = /* @__PURE__ */ new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
function stripFrontmatter(content) {
  return content.replace(/^---[\s\S]*?---\n*/, "").trim();
}
async function buildSimilarityMatrix(vault, targetFolder, cacheManager = defaultCacheManager) {
  const cached = cacheManager.getDiscovery();
  if (cached) {
    return cached;
  }
  const notes = [];
  const allFiles = vault.getMarkdownFiles();
  const files = targetFolder ? allFiles.filter((f) => f.path.startsWith(targetFolder)) : allFiles;
  const limit = Math.min(files.length, 500);
  for (let i = 0; i < limit; i += DEDUP_BATCH_SIZE) {
    const batch = files.slice(i, i + DEDUP_BATCH_SIZE);
    const batchNotes = await Promise.all(
      batch.map(async (file) => {
        const raw = await vault.read(file);
        const content = stripFrontmatter(raw);
        const title = file.path.split("/").pop().replace(/\.md$/, "");
        return { path: file.path, title, content };
      })
    );
    notes.push(...batchNotes);
  }
  const keywordSets = notes.map((n) => extractKeywords(n.content));
  const matrix = [];
  for (let i = 0; i < notes.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < notes.length; j++) {
      matrix[i][j] = i === j ? 1 : jaccardSim(keywordSets[i], keywordSets[j]);
    }
  }
  cacheManager.setDiscovery(notes, matrix);
  return { notes, matrix };
}

// src/ui/panel-view.ts
var VIEW_TYPE_ATOMIC_PANEL = "atomic-notes-panel";
var AtomicNotesPanel = class extends import_obsidian9.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this._hideTimer = null;
    /** 进度 UI 元素引用 */
    this._progressWrap = null;
    this._progressTitle = null;
    this._progressBody = null;
    /** 输入面板状态 */
    this._inputElements = null;
    this._inputSubMode = "text";
    /** 发现面板相似度矩阵缓存 */
    this._simCache = null;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_ATOMIC_PANEL;
  }
  getDisplayText() {
    return "\u539F\u5B50\u7B14\u8BB0\u63D0\u70BC";
  }
  getIcon() {
    return "atom";
  }
  // ─── 主入口：只做容器初始化和 Tab 注册 ───
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("atomic-notes-panel");
    container.createEl("h3", { text: "\u539F\u5B50\u7B14\u8BB0\u63D0\u70BC" });
    const tabBar = container.createEl("div", { cls: "atomic-notes-tabs" });
    const tabs = [
      tabBar.createEl("div", { text: "\u8F93\u5165", cls: "atomic-notes-tab active" }),
      tabBar.createEl("div", { text: "\u5386\u53F2", cls: "atomic-notes-tab" }),
      tabBar.createEl("div", { text: "\u53D1\u73B0", cls: "atomic-notes-tab" }),
      tabBar.createEl("div", { text: "\u4ECB\u7ECD", cls: "atomic-notes-tab" })
    ];
    const inputPanel = container.createEl("div", { cls: "atomic-notes-tab-content active" });
    const historyPanel = container.createEl("div", { cls: "atomic-notes-tab-content", attr: { style: "max-height:500px;overflow-y:auto" } });
    const discoveryPanel = container.createEl("div", { cls: "atomic-notes-tab-content", attr: { style: "max-height:500px;overflow-y:auto" } });
    const aboutPanel = container.createEl("div", { cls: "atomic-notes-tab-content", attr: { style: "max-height:500px;overflow-y:auto" } });
    const contentPanels = [inputPanel, historyPanel, discoveryPanel, aboutPanel];
    const progressWrap = container.createEl("div", {
      cls: "atomic-notes-progress-wrap",
      attr: { style: "margin:8px 0;padding:8px 12px;border:1px solid var(--background-modifier-border);border-radius:6px;display:none;" }
    });
    this._progressWrap = progressWrap;
    const buttonWrap = container.createEl("div", { cls: "atomic-notes-btn-wrap" });
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", () => {
        for (let j = 0; j < tabs.length; j++) {
          tabs[j].classList.toggle("active", j === i);
          contentPanels[j].classList.toggle("active", j === i);
        }
        progressWrap.style.display = i > 0 ? "none" : progressWrap.style.display;
        buttonWrap.style.display = i > 0 ? "none" : "";
        if (i === 1)
          this.renderHistoryPanel(historyPanel);
        else if (i === 2)
          this.renderDiscovery(discoveryPanel);
        else if (i === 3)
          this.renderAboutPanel(aboutPanel);
      });
    }
    this.renderInputPanel(inputPanel);
    this.setupProgressUI(progressWrap);
    this.setupExtractButton(buttonWrap);
  }
  // ─── 输入面板 ───
  renderInputPanel(panel) {
    this._inputSubMode = "text";
    const subToggleBar = panel.createEl("div", {
      attr: { style: "display:flex;gap:12px;margin-bottom:10px;padding:4px 0" }
    });
    const textModeBtn = subToggleBar.createEl("span", {
      text: "\u6587\u672C",
      attr: { style: "font-size:12px;font-weight:600;color:var(--text-accent);cursor:pointer;padding:2px 0;border-bottom:2px solid var(--text-accent)" }
    });
    const urlModeBtn = subToggleBar.createEl("span", {
      text: "URL",
      attr: { style: "font-size:12px;color:var(--text-muted);cursor:pointer;padding:2px 0;border-bottom:2px solid transparent" }
    });
    const textarea = panel.createEl("textarea", {
      cls: "atomic-notes-textarea",
      attr: { placeholder: "\u5728\u6B64\u7C98\u8D34\u8981\u63D0\u70BC\u7684\u6587\u672C..." }
    });
    const pasteMeta = panel.createEl("div", { cls: "atomic-notes-meta-row" });
    const charCountEl = pasteMeta.createEl("span", { cls: "atomic-notes-char-count", text: "0 \u5B57" });
    const pasteActions = pasteMeta.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center" } });
    const readClipBtn = pasteActions.createEl("a", {
      cls: "atomic-notes-clip-btn",
      text: "\u8BFB\u53D6\u526A\u8D34\u677F",
      attr: { href: "#" }
    });
    const clearPasteLink = pasteActions.createEl("a", {
      cls: "atomic-notes-clear-link",
      text: "\u6E05\u7A7A",
      attr: { href: "#" }
    });
    const urlInput = panel.createEl("input", {
      cls: "atomic-notes-url-input",
      attr: { type: "text", placeholder: "https://..." }
    });
    urlInput.style.display = "none";
    const urlMeta = panel.createEl("div", { cls: "atomic-notes-meta-row" });
    urlMeta.style.display = "none";
    const urlMetaActions = urlMeta.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center" } });
    const pasteUrlBtn = urlMetaActions.createEl("a", {
      cls: "atomic-notes-clip-btn",
      text: "\u7C98\u8D34\u526A\u8D34\u677FURL",
      attr: { href: "#" }
    });
    urlMetaActions.createEl("a", {
      cls: "atomic-notes-clear-link",
      text: "\u6E05\u9664",
      attr: { href: "#" }
    });
    this._inputElements = { textarea, urlInput, charCountEl };
    const setInputSubMode = (mode) => {
      this._inputSubMode = mode;
      const isText = mode === "text";
      textarea.style.display = isText ? "" : "none";
      pasteMeta.style.display = isText ? "" : "none";
      urlInput.style.display = isText ? "none" : "";
      urlMeta.style.display = isText ? "none" : "";
      textModeBtn.style.color = isText ? "var(--text-accent)" : "var(--text-muted)";
      textModeBtn.style.borderBottomColor = isText ? "var(--text-accent)" : "transparent";
      urlModeBtn.style.color = isText ? "var(--text-muted)" : "var(--text-accent)";
      urlModeBtn.style.borderBottomColor = isText ? "transparent" : "var(--text-accent)";
    };
    textModeBtn.addEventListener("click", () => setInputSubMode("text"));
    urlModeBtn.addEventListener("click", () => setInputSubMode("url"));
    textarea.addEventListener("input", () => {
      charCountEl.setText(`${textarea.value.length} \u5B57`);
    });
    readClipBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        const rawText = await navigator.clipboard.readText();
        if (rawText && rawText.trim()) {
          const text = stripImageNoise(rawText);
          textarea.value = text;
          charCountEl.setText(`${text.length} \u5B57`);
          const removed = rawText.length - text.length;
          const suffix = removed > 0 ? `\uFF08\u5DF2\u8FC7\u6EE4 ${removed} \u5B57\u56FE\u7247\u566A\u97F3\uFF09` : "";
          new import_obsidian9.Notice(`\u5DF2\u8BFB\u53D6 ${text.length} \u5B57${suffix}`);
        } else {
          new import_obsidian9.Notice("\u526A\u8D34\u677F\u4E3A\u7A7A");
        }
      } catch {
        new import_obsidian9.Notice("\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650");
      }
    });
    clearPasteLink.addEventListener("click", (ev) => {
      ev.preventDefault();
      textarea.value = "";
      charCountEl.setText("0 \u5B57");
    });
    pasteUrlBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        const rawText = await navigator.clipboard.readText();
        if (rawText && rawText.trim()) {
          urlInput.value = rawText.trim();
          new import_obsidian9.Notice("\u5DF2\u7C98\u8D34\u526A\u8D34\u677F\u5185\u5BB9");
        } else {
          new import_obsidian9.Notice("\u526A\u8D34\u677F\u4E3A\u7A7A");
        }
      } catch {
        new import_obsidian9.Notice("\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650");
      }
    });
    const clearUrlLink = urlMetaActions.querySelector(".atomic-notes-clear-link");
    clearUrlLink.addEventListener("click", (ev) => {
      ev.preventDefault();
      urlInput.value = "";
    });
  }
  // ─── 历史面板 ───
  renderHistoryPanel(el) {
    el.empty();
    const history = this.plugin.settings.extractionHistory || [];
    if (history.length === 0) {
      el.createEl("p", {
        text: "\u6682\u65E0\u63D0\u70BC\u5386\u53F2",
        attr: { style: "color:var(--text-muted);padding:16px;text-align:center" }
      });
      return;
    }
    const toolbar = el.createEl("div", {
      attr: { style: "display:flex;justify-content:space-between;align-items:center;padding:4px 8px 8px" }
    });
    toolbar.createEl("span", {
      text: `${history.length} \u6761\u8BB0\u5F55`,
      attr: { style: "font-size:11px;color:var(--text-muted)" }
    });
    const clearBtn = toolbar.createEl("button", {
      text: "\u6E05\u7A7A\u5168\u90E8",
      attr: { style: "padding:2px 10px;font-size:11px;cursor:pointer;background:var(--background-modifier-error);color:var(--text-on-accent);border:none;border-radius:4px" }
    });
    clearBtn.addEventListener("click", async () => {
      const confirmModal = new class extends import_obsidian9.Modal {
        constructor(app, parent, targetEl) {
          super(app);
          this.parent = parent;
          this.targetEl = targetEl;
        }
        onOpen() {
          this.contentEl.empty();
          this.contentEl.createEl("h3", { text: "\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u5386\u53F2\u8BB0\u5F55\uFF1F" });
          this.contentEl.createEl("p", {
            text: `\u8FD9\u5C06\u5220\u9664\u5168\u90E8 ${history.length} \u6761\u63D0\u70BC\u5386\u53F2\uFF0C\u5DF2\u4FDD\u5B58\u7684\u7B14\u8BB0\u4E0D\u4F1A\u53D7\u5F71\u54CD\u3002`,
            attr: { style: "font-size:13px;color:var(--text-muted);margin:8px 0" }
          });
          const btnRow = this.contentEl.createEl("div", { attr: { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:16px" } });
          btnRow.createEl("button", { text: "\u53D6\u6D88" }).addEventListener("click", () => this.close());
          const confirmBtn = btnRow.createEl("button", {
            text: "\u786E\u8BA4\u6E05\u7A7A",
            attr: { style: "background:var(--background-modifier-error);color:var(--text-on-accent);border:none;padding:6px 16px;border-radius:6px;cursor:pointer" }
          });
          confirmBtn.addEventListener("click", async () => {
            this.parent.plugin.settings.extractionHistory = [];
            await this.parent.plugin.saveSettings();
            new import_obsidian9.Notice("\u5386\u53F2\u8BB0\u5F55\u5DF2\u6E05\u7A7A");
            this.close();
            this.parent.renderHistoryPanel(this.targetEl);
          });
        }
        onClose() {
          this.contentEl.empty();
        }
      }(this.app, this, el);
      confirmModal.open();
    });
    const listEl = el.createEl("div");
    const total = history.length;
    const displayCount = Math.min(total, 20);
    for (let i = total - 1; i >= 0; i--) {
      const entry = history[i];
      const idx = i;
      const itemEl = listEl.createEl("div", {
        attr: { style: "padding:8px 0;border-bottom:1px solid var(--background-modifier-border)" }
      });
      if (i < total - displayCount) {
        itemEl.style.display = "none";
      }
      const titleRow = itemEl.createEl("div", {
        attr: { style: "display:flex;justify-content:space-between;align-items:flex-start" }
      });
      titleRow.createEl("div", {
        text: `${entry.extractedAt.slice(0, 10)}  ${entry.sourceTitle}`,
        attr: { style: "font-size:13px;font-weight:bold;flex:1;word-break:break-all" }
      });
      const delBtn = titleRow.createEl("span", {
        text: "\xD7",
        attr: { style: "font-size:16px;color:var(--text-muted);cursor:pointer;padding:0 4px;line-height:1" }
      });
      let delConfirming = false;
      delBtn.addEventListener("click", async () => {
        if (!delConfirming) {
          delConfirming = true;
          delBtn.setText("\u786E\u8BA4?");
          delBtn.style.color = "var(--color-red)";
          setTimeout(() => {
            if (delConfirming) {
              delConfirming = false;
              delBtn.setText("\xD7");
              delBtn.style.color = "var(--text-muted)";
            }
          }, 3e3);
          return;
        }
        this.plugin.settings.extractionHistory.splice(idx, 1);
        await this.plugin.saveSettings();
        this.renderHistoryPanel(el);
      });
      itemEl.createEl("div", {
        text: `${entry.sourceType === "url" ? "[URL]" : "[\u6587\u672C]"}  ${entry.noteCount}\u6761\u7B14\u8BB0`,
        attr: { style: "font-size:11px;color:var(--text-muted);margin-top:2px" }
      });
      if (entry.savedPaths && entry.savedPaths.length > 0) {
        for (const savedPath of entry.savedPaths) {
          const linkEl = itemEl.createEl("a", {
            text: savedPath.split("/").pop(),
            attr: { href: "#", style: "font-size:11px;color:var(--text-accent);display:block;margin-left:8px" }
          });
          linkEl.addEventListener("click", (ev) => {
            ev.preventDefault();
            this.app.workspace.openLinkText(savedPath, "", false);
          });
        }
      }
    }
    if (total > 20) {
      const loadMoreBtn = listEl.createEl("button", {
        text: `\u52A0\u8F7D\u66F4\u591A (${total - 20}\u6761)`,
        attr: { style: "margin:8px auto;display:block;padding:4px 16px;font-size:12px;cursor:pointer" }
      });
      loadMoreBtn.addEventListener("click", () => {
        for (let i = total - 21; i >= 0; i--) {
          listEl.children[i].style.display = "";
        }
        loadMoreBtn.remove();
      });
    }
  }
  // ─── About 面板 ───
  renderAboutPanel(el) {
    el.empty();
    el.setAttr("style", "padding:0 2px");
    const sectionStyle = "margin:16px 0 8px;font-size:14px;font-weight:700;color:var(--text-normal);padding-bottom:4px;border-bottom:1px solid var(--background-modifier-border)";
    const textStyle = "font-size:12px;color:var(--text-muted);line-height:1.7;margin:4px 0";
    el.createEl("div", { text: "\u7AF9\u53F6\u98DE\u5203\u8BBE\u8BA1\u7406\u5FF5", attr: { style: sectionStyle } });
    el.createEl("div", {
      text: "\u7528\u6CD5\u4E00\uFF1A\u63D0\u70BC\u77E5\u8BC6\u8282\u70B9",
      attr: { style: "font-size:12px;font-weight:600;color:var(--text-accent);margin:8px 0 4px" }
    });
    el.createEl("p", {
      text: "\u539F\u5B50\u7B14\u8BB0\u662F\u4E00\u6BB5\u72EC\u7ACB\u3001\u5B8C\u6574\u3001\u53EF\u76F4\u63A5\u590D\u7528\u7684\u77E5\u8BC6\u5355\u5143\u3002\u6BCF\u6761\u7B14\u8BB0\u56F4\u7ED5\u5355\u4E00\u6982\u5FF5\uFF0C\u4E0D\u4F9D\u8D56\u4E0A\u4E0B\u6587\u5373\u53EF\u7406\u89E3\u3002AI \u63D0\u70BC\u7684\u4EF7\u503C\u4E0D\u5728\u4E8E\u66FF\u4EE3\u601D\u8003\uFF0C\u800C\u5728\u4E8E\u5F3A\u5236\u5BF9\u4FE1\u606F\u8FDB\u884C\u538B\u7F29\u548C\u7ED3\u6784\u5316\u2014\u2014\u628A\u6A21\u7CCA\u7684\u9605\u8BFB\u611F\u53D7\u8F6C\u5316\u4E3A\u53EF\u68C0\u7D22\u3001\u53EF\u5173\u8054\u7684\u77E5\u8BC6\u8282\u70B9\u3002",
      attr: { style: textStyle }
    });
    el.createEl("div", {
      text: "\u7528\u6CD5\u4E8C\uFF1A\u5BF9\u6297\u4FE1\u606F\u5783\u573E",
      attr: { style: "font-size:12px;font-weight:600;color:var(--text-accent);margin:12px 0 4px" }
    });
    el.createEl("p", {
      text: "AI \u65F6\u4EE3\u7684\u5185\u5BB9\u751F\u4EA7\u901F\u5EA6\u8FDC\u8D85\u4EBA\u7C7B\u7684\u9605\u8BFB\u901F\u5EA6\u3002\u5927\u91CF\u6587\u7AE0\u770B\u4F3C\u6D0B\u6D0B\u6D12\u6D12\uFF0C\u5B9E\u5219\u4FE1\u606F\u5BC6\u5EA6\u6781\u4F4E\u2014\u2014\u7FFB\u6765\u8986\u53BB\u8BB2\u540C\u4E00\u53E5\u8BDD\u3001\u5806\u780C SEO \u5173\u952E\u8BCD\u3001\u586B\u5145\u65E0\u610F\u4E49\u7684\u8FC7\u6E21\u6BB5\u843D\u3002",
      attr: { style: textStyle }
    });
    el.createEl("p", {
      text: "\u672C\u63D2\u4EF6\u7684\u8D28\u91CF\u95E8\u63A7\u548C\u590D\u67E5\u673A\u5236\u6B63\u662F\u4E3A\u6B64\u8BBE\u8BA1\uFF1A\u524D\u7F6E\u8FC7\u6EE4\u566A\u58F0\u5185\u5BB9\uFF0CAI \u63D0\u70BC\u540E\u4E8C\u6B21\u8BC4\u5206\uFF0C\u5E2E\u4F60\u628A\u65F6\u95F4\u82B1\u5728\u771F\u6B63\u503C\u5F97\u8BFB\u7684\u4FE1\u606F\u4E0A\uFF0C\u800C\u4E0D\u662F\u88AB\u6CE8\u6C34\u6587\u7AE0\u6D88\u8017\u6CE8\u610F\u529B\u3002",
      attr: { style: textStyle }
    });
    el.createEl("div", { text: "\u5904\u7406\u6D41\u7A0B", attr: { style: sectionStyle } });
    const phases = [
      ["Phase 1", "\u8BFB\u53D6\u5185\u5BB9", "\u4ECE\u6587\u672C\u3001URL \u6216\u526A\u8D34\u677F\u83B7\u53D6\u539F\u59CB\u5185\u5BB9"],
      ["Phase 2", "\u8D28\u91CF\u95E8\u63A7", "9 \u5C42\u89C4\u5219\u524D\u7F6E\u8FC7\u6EE4\u4F4E\u8D28/\u566A\u58F0\u5185\u5BB9\uFF0C\u786C\u62E6+\u8F6F\u8B66\u544A"],
      ["Phase 3", "AI \u63D0\u70BC", "\u8C03\u7528 DeepSeek \u5C06\u5185\u5BB9\u62C6\u89E3\u4E3A\u539F\u5B50\u7B14\u8BB0"],
      ["Phase 4", "\u540C\u6279\u53BB\u91CD", "TF-IDF + \u4F59\u5F26\u76F8\u4F3C\u5EA6\uFF0C\u68C0\u6D4B\u540C\u6279\u6B21\u9AD8\u5EA6\u76F8\u4F3C\u7B14\u8BB0"],
      ["Phase 4b", "\u77E5\u8BC6\u5E93\u53BB\u91CD", "\u4E0E\u76EE\u6807\u6587\u4EF6\u5939\u5DF2\u6709\u7B14\u8BB0\u6BD4\u5BF9\uFF0C\u4E25\u683C\u4E0D\u8DE8\u76EE\u5F55\u8BFB\u53D6"],
      ["Phase 5", "\u5185\u5BB9\u6838\u67E5", "\u4E09\u5C42\u7BA1\u7EBF\uFF1A\u539F\u6587\u6EAF\u6E90 \u2192 \u8BED\u4E49\u6BD4\u5BF9 \u2192 \u8D85\u6E90\u6807\u8BB0"],
      ["Phase 6", "\u7B14\u8BB0\u590D\u67E5", "AI \u4E8C\u6B21\u8BC4\u5206\uFF0C\u8FC7\u6EE4\u4F4E\u4EF7\u503C\u7B14\u8BB0"]
    ];
    for (const [phase, name, desc] of phases) {
      const row = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:4px 0" } });
      row.createEl("span", { text: phase, attr: { style: "font-size:11px;color:var(--text-accent);flex-shrink:0;min-width:52px" } });
      row.createEl("span", { text: name, attr: { style: "font-size:12px;font-weight:600;flex-shrink:0;min-width:56px" } });
      row.createEl("span", { text: desc, attr: { style: "font-size:11px;color:var(--text-muted)" } });
    }
    el.createEl("div", { text: "\u53BB\u91CD\u7B97\u6CD5", attr: { style: sectionStyle } });
    el.createEl("p", {
      text: "Phase 4 \u4E0E Phase 4b \u91C7\u7528 TF-IDF + \u4F59\u5F26\u76F8\u4F3C\u5EA6\u7B97\u6CD5\uFF1A",
      attr: { style: textStyle }
    });
    el.createEl("div", {
      text: "\u2022 \u4E2D\u6587\u6309\u5B57\u7B26 3-gram\uFF08\u82F1\u6587\u6309\u5B8C\u6574\u8BCD\uFF09\u63D0\u53D6 token",
      attr: { style: textStyle + ";padding-left:10px" }
    });
    el.createEl("div", {
      text: "\u2022 \u6BCF\u7BC7\u6587\u6863\u8F6C\u5316\u4E3A TF-IDF \u5411\u91CF\uFF0C\u4E24\u7BC7\u76F8\u4F3C\u5EA6\u901A\u8FC7\u5411\u91CF\u4F59\u5F26\u8BA1\u7B97",
      attr: { style: textStyle + ";padding-left:10px" }
    });
    el.createEl("div", {
      text: "\u2022 \u76F8\u6BD4\u5173\u952E\u8BCD\u5339\u914D\uFF0C\u5BF9\u540C\u4E49\u8BCD\u3001\u6362\u8BF4\u6CD5\u3001\u8FD1\u4E49\u8BCD\u66F4\u9C81\u68D2",
      attr: { style: textStyle + ";padding-left:10px" }
    });
    el.createEl("p", {
      text: '\u77E5\u8BC6\u5E93\u53BB\u91CD\u9ED8\u8BA4\u8BFB\u53D6\u76EE\u6807\u6587\u4EF6\u5939\u5185\u5BB9\uFF0C\u53EF\u5728\u8BBE\u7F6E\u4E2D\u72EC\u7ACB\u6307\u5B9A"\u53BB\u91CD\u76EE\u6807\u6587\u4EF6\u5939"\uFF0C\u9002\u5408\u6709\u9690\u79C1\u9700\u6C42\u7528\u6237\u9650\u5236\u53BB\u91CD\u8303\u56F4\u3002',
      attr: { style: textStyle }
    });
    el.createEl("div", { text: "\u5B9E\u65F6\u8FDB\u5EA6\u53CD\u9988", attr: { style: sectionStyle } });
    el.createEl("p", {
      text: '\u63D0\u70BC\u8FC7\u7A0B\u4E2D\u6BCF\u4E00\u6B65\u90FD\u5B9E\u65F6\u663E\u793A\u5F53\u524D\u9636\u6BB5\u540D\u79F0\u3001\u8017\u65F6\u3001\u5B50\u8FDB\u5EA6\uFF0C\u53EF\u968F\u65F6\u70B9\u51FB"\u53D6\u6D88"\u7EC8\u6B62\u6D41\u7A0B\u3002',
      attr: { style: textStyle }
    });
    const progressItems = [
      ["Phase 1", "\u8F93\u5165\u6587\u672C\u8BFB\u53D6"],
      ["Phase 2", "\u8D28\u91CF\u95E8\u63A7\u5224\u5B9A"],
      ["Phase 3", "AI \u8C03\u7528\u4E0E\u7B14\u8BB0\u62C6\u89E3"],
      ["Phase 4 / 4b", "\u53BB\u91CD\u8BA1\u7B97"],
      ["Phase 5", "\u5185\u5BB9\u6838\u67E5\uFF08\u4E09\u5C42\u7BA1\u7EBF\uFF09"],
      ["Phase 6", "\u590D\u67E5\u8BC4\u5206"]
    ];
    for (const [phase, detail] of progressItems) {
      const row = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:2px 0 2px 12px" } });
      row.createEl("span", { text: phase, attr: { style: "font-size:11px;color:var(--text-accent);font-weight:600;min-width:72px" } });
      row.createEl("span", { text: detail, attr: { style: "font-size:11px;color:var(--text-muted)" } });
    }
    el.createEl("div", { text: "\u8D28\u91CF\u95E8\u63A7", attr: { style: sectionStyle } });
    const gateRules = [
      ["\u957F\u5EA6", "< 50 \u5B57", "50-200 \u5B57 / > 50000 \u5B57"],
      ["\u4FE1\u606F\u5BC6\u5EA6", "< 10%\uFF08\u4E25\u91CD\u91CD\u590D\uFF09", "< 30%\uFF08\u7591\u4F3C\u6C34\u6587\uFF09"],
      ["\u566A\u58F0\u5360\u6BD4", "> 70%\uFF08\u4E71\u7801\u6B8B\u7559\uFF09", "> 40%"],
      ["HTML \u6807\u7B7E", "\u5360\u6BD4 > 60%", "\u5360\u6BD4 > 30%"],
      ["\u4E71\u7801\u6B8B\u7559", "\u975E\u6587\u5B57\u5B57\u7B26 > 70%", "\u975E\u6587\u5B57\u5B57\u7B26 > 50%"],
      ["\u94FE\u63A5\u5806\u780C", "\u5BFC\u822A\u5206\u9694\u7B26 > 3 \u7EC4", "1-2 \u7EC4"],
      ["\u5E7F\u544A/\u4F4E\u8D28", "\u2265 3 \u4E2A\u5173\u952E\u8BCD", "1-2 \u4E2A\u5173\u952E\u8BCD"],
      ["\u8D28\u91CF\u8BC4\u5206", "\u2264 1 \u5206\uFF08\u5783\u573E\uFF09", "2 \u5206\uFF08\u5B58\u7591\uFF09"],
      ["\u91CD\u590D\u68C0\u6D4B", "> 50% \u76F8\u4F3C\u5EA6", "\u2014"]
    ];
    const gateHeader = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:2px 0;font-size:11px;color:var(--text-faint)" } });
    gateHeader.createEl("span", { text: "\u89C4\u5219", attr: { style: "min-width:64px" } });
    gateHeader.createEl("span", { text: "\u786C\u963B\u65AD", attr: { style: "min-width:100px" } });
    gateHeader.createEl("span", { text: "\u8F6F\u8B66\u544A" });
    for (const [rule, block2, warn2] of gateRules) {
      const row = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:3px 0;font-size:11px;border-top:1px solid var(--background-modifier-border)" } });
      row.createEl("span", { text: rule, attr: { style: "min-width:64px;font-weight:600;color:var(--text-normal)" } });
      row.createEl("span", { text: block2, attr: { style: "min-width:100px;color:var(--text-error)" } });
      row.createEl("span", { text: warn2, attr: { style: "color:var(--text-warning)" } });
    }
    el.createEl("p", {
      text: "\u786C\u963B\u65AD\u7684\u89C4\u5219\u547D\u4E2D\u540E\u76F4\u63A5\u62D2\u7EDD\u63D0\u4EA4\u6D41\u7A0B\uFF1B\u8F6F\u8B66\u544A\u4EC5\u63D0\u9192\u7528\u6237\uFF0C\u4E0D\u5F71\u54CD\u7EE7\u7EED\u63D0\u70BC\u3002",
      attr: { style: textStyle + ";margin-top:8px" }
    });
    el.createEl("div", { text: "\u5185\u5BB9\u6838\u67E5\uFF08\u4E09\u5C42\u7BA1\u7EBF\uFF09", attr: { style: sectionStyle } });
    el.createEl("p", {
      text: "\u4ECE\u6BCF\u6761\u7B14\u8BB0\u4E2D\u63D0\u53D6\u4E8B\u5B9E\u58F0\u660E\uFF08\u6570\u5B57\u3001\u767E\u5206\u6BD4\u3001\u65E5\u671F\u3001\u5B9E\u4F53\u540D\u79F0\uFF09\uFF0C\u901A\u8FC7\u4E09\u5C42\u7BA1\u7EBF\u9010\u6761\u6838\u67E5\uFF1A",
      attr: { style: textStyle }
    });
    el.createEl("div", {
      text: "Layer 1 \xB7 \u539F\u6587\u6EAF\u6E90\uFF1A\u96F6 API \u8C03\u7528\uFF0C\u5728\u539F\u6587\u4E2D\u7CBE\u786E\u6216\u6A21\u7CCA\u5339\u914D\u58F0\u660E\u951A\u70B9",
      attr: { style: textStyle + ";padding-left:10px" }
    });
    el.createEl("div", {
      text: "Layer 2 \xB7 \u8BED\u4E49\u6BD4\u5BF9\uFF1A\u5355\u6B21 AI \u8C03\u7528\uFF0C\u5BF9\u65E0\u6CD5\u6EAF\u6E90\u7684\u58F0\u660E\u8FDB\u884C\u8BED\u4E49\u7EA7\u522B\u6BD4\u5BF9",
      attr: { style: textStyle + ";padding-left:10px" }
    });
    el.createEl("div", {
      text: 'Layer 3 \xB7 \u8D85\u6E90\u6807\u8BB0\uFF1A\u96F6 API \u8C03\u7528\uFF0C\u5C06\u8D85\u51FA\u539F\u6587\u8303\u56F4\u7684\u58F0\u660E\u6807\u8BB0\u4E3A"\u8D85\u6E90"',
      attr: { style: textStyle + ";padding-left:10px" }
    });
    const verifyStatus = [
      ["\u5DF2\u6EAF\u6E90", "\u58F0\u660E\u4E0E\u539F\u6587\u4E00\u81F4\u6216\u53EF\u63A8\u5BFC"],
      ["\u9700\u5BF9\u6BD4", "\u90E8\u5206\u76F8\u5173\u4F46\u5B58\u5728\u5DEE\u5F02\uFF0C\u9700\u4EBA\u5DE5\u786E\u8BA4"],
      ["\u8D85\u6E90", "\u58F0\u660E\u8D85\u51FA\u539F\u6587\u8303\u56F4\uFF0C\u65E0\u6CD5\u76F4\u63A5\u9A8C\u8BC1"]
    ];
    for (const [status, desc] of verifyStatus) {
      const row = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:2px 0 2px 12px" } });
      row.createEl("span", { text: status, attr: { style: "font-size:12px;font-weight:600;min-width:56px;color:var(--text-accent)" } });
      row.createEl("span", { text: desc, attr: { style: "font-size:11px;color:var(--text-muted)" } });
    }
    el.createEl("div", { text: "\u590D\u67E5\u673A\u5236", attr: { style: sectionStyle } });
    el.createEl("p", {
      text: "\u5F00\u542F\u540E AI \u4ECE\u4E24\u4E2A\u7EF4\u5EA6\u5BF9\u6BCF\u6761\u7B14\u8BB0\u6253\u5206\uFF081-5 \u5206\uFF09\uFF1A",
      attr: { style: textStyle }
    });
    const scoreItems = [
      ["\u6D1E\u5BDF\u529B\u5206", "\u662F\u5426\u5305\u542B\u72EC\u7ACB\u89C2\u70B9\u6216\u72EC\u7279\u89C6\u89D2"],
      ["\u77E5\u8BC6\u4EF7\u503C\u5206", "\u662F\u5426\u80FD\u4E3A\u8BFB\u8005\u63D0\u4F9B\u53EF\u8FC1\u79FB\u7684\u9886\u57DF\u77E5\u8BC6"]
    ];
    for (const [label, desc] of scoreItems) {
      const row = el.createEl("div", { attr: { style: "display:flex;gap:8px;padding:2px 0 2px 12px" } });
      row.createEl("span", { text: label, attr: { style: "font-size:12px;font-weight:600;min-width:72px" } });
      row.createEl("span", { text: desc, attr: { style: "font-size:11px;color:var(--text-muted)" } });
    }
    el.createEl("p", {
      text: "\u603B\u5206 < 3 \u7684\u7B14\u8BB0\u88AB\u81EA\u52A8\u8FC7\u6EE4\uFF0C\u4E0D\u8FDB\u5165\u77E5\u8BC6\u5E93\u3002\u8FD9\u662F\u63D0\u70BC\u540E\u7684\u6700\u540E\u4E00\u9053\u8D28\u91CF\u9632\u7EBF\u3002",
      attr: { style: textStyle + ";margin-top:6px" }
    });
    el.createEl("hr", {
      attr: { style: "margin:20px 0 12px;border:none;border-top:1px solid var(--background-modifier-border)" }
    });
    el.createEl("div", { text: "\u4F5C\u8005", attr: { style: sectionStyle } });
    el.createEl("div", { text: "\u7FBD\u9CDE\u541B", attr: { style: "font-size:13px;font-weight:700;color:var(--text-normal)" } });
    el.createEl("p", {
      text: "\u55B5\u5B57\u9986\u521B\u59CB\u4EBA | \u72EC\u7ACB\u54C1\u724C\u8BBE\u8BA1\u5E08 | \u8D5B\u535A\u4E50\u5B50\u4EBA",
      attr: { style: textStyle }
    });
    el.createEl("p", {
      text: "\u4EA4\u6D41\u5FAE\u4FE1\uFF1Ayanhu94\uFF08\u5907\u6CE8\uFF1A\u7AF9\u53F6\u98DE\u5203\uFF09",
      attr: { style: textStyle + ";color:var(--text-faint)" }
    });
  }
  // ─── 进度 UI（存储 DOM 引用供提炼按钮使用） ───
  setupProgressUI(wrap) {
    wrap.empty();
    this._progressTitle = wrap.createEl("div", {
      attr: { style: "font-weight:bold;font-size:13px;margin-bottom:6px;" },
      text: "\u51C6\u5907\u63D0\u70BC..."
    });
    this._progressBody = wrap.createEl("div", {
      attr: { style: "font-size:12px;color:var(--text-muted);line-height:1.8;max-height:240px;overflow-y:auto;" }
    });
  }
  // ─── 提炼按钮 ───
  setupExtractButton(wrap) {
    wrap.empty();
    wrap.style.display = "";
    const extractBtn = wrap.createEl("button", { text: "\u5F00\u59CB\u63D0\u70BC", cls: "mod-cta" });
    const cancelBtn = wrap.createEl("button", { text: "\u53D6\u6D88", cls: "mod-warning" });
    cancelBtn.style.display = "none";
    cancelBtn.style.marginLeft = "8px";
    cancelBtn.addEventListener("click", () => {
      this.plugin.cancelExtraction();
    });
    extractBtn.addEventListener("click", async () => {
      if (this.plugin._isExtracting)
        return;
      const elements = this._inputElements;
      if (!elements)
        return;
      let inputContent;
      let inputData;
      if (this._inputSubMode === "url") {
        inputContent = elements.urlInput.value;
        if (!inputContent || !inputContent.trim()) {
          new import_obsidian9.Notice("\u8BF7\u8F93\u5165\u6709\u6548\u7684 URL");
          return;
        }
        const url = inputContent.trim();
        try {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            new import_obsidian9.Notice("URL \u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934");
            return;
          }
        } catch {
          new import_obsidian9.Notice("URL \u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u68C0\u67E5");
          return;
        }
        inputData = { type: "url", content: url };
      } else {
        inputContent = elements.textarea.value;
        if (!inputContent || !inputContent.trim()) {
          new import_obsidian9.Notice("\u8BF7\u7C98\u8D34\u6587\u672C\u6216\u4F7F\u7528\u300C\u8BFB\u53D6\u526A\u8D34\u677F\u300D");
          return;
        }
        inputData = { type: "text", content: inputContent };
      }
      if (this._progressWrap)
        this._progressWrap.style.display = "";
      if (this._progressTitle)
        this._progressTitle.setText("\u6B63\u5728\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0...");
      if (this._progressBody)
        this._progressBody.empty();
      extractBtn.setText("\u63D0\u70BC\u4E2D...");
      extractBtn.disabled = true;
      cancelBtn.style.display = "";
      const panelOnProgress = (event, allEvents, totalMs) => {
        if (this._progressTitle) {
          this._progressTitle.setText(`${event.phase}\uFF1A${event.name} \u2014 \u5DF2\u7528\u65F6 ${(totalMs / 1e3).toFixed(1)}s`);
        }
        if (!this._progressBody)
          return;
        this._progressBody.empty();
        for (const ev of allEvents) {
          const icon = ev.status === "running" ? "\u27F3 " : ev.status === "success" ? "\u2713 " : ev.status === "failed" ? "\u2717 " : "\u2212 ";
          const line = this._progressBody.createEl("div", { text: `${icon}${ev.phase} ${ev.name}${ev.detail ? " \u2014 " + ev.detail : ""}` });
          if (ev.status === "running")
            line.style.color = "var(--text-accent)";
          if (ev.status === "success")
            line.style.color = "var(--text-success)";
          if (ev.status === "failed")
            line.style.color = "var(--text-error)";
        }
        if (event.subProgress) {
          const sp = event.subProgress;
          const labelText = sp.label ? "\uFF08" + sp.label + "\uFF09" : "";
          this._progressBody.createEl("div", {
            attr: { style: "margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)" },
            text: "\u8FDB\u5EA6 " + sp.current + "/" + sp.total + labelText
          });
        }
      };
      try {
        await this.plugin.runExtraction(inputData, { onProgress: panelOnProgress });
      } finally {
        extractBtn.setText("\u5F00\u59CB\u63D0\u70BC");
        extractBtn.disabled = false;
        cancelBtn.style.display = "none";
        if (this._inputSubMode === "text") {
          elements.textarea.value = "";
          elements.charCountEl.setText("0 \u5B57");
        } else {
          elements.urlInput.value = "";
        }
        this._hideTimer = setTimeout(() => {
          if (this._progressWrap)
            this._progressWrap.style.display = "none";
          if (this._progressBody)
            this._progressBody.empty();
          this._hideTimer = null;
        }, 2e3);
      }
    });
  }
  // ─── Discovery Methods（已有，未改动） ───
  renderDiscovery(container) {
    const settings = this.plugin.settings;
    container.empty();
    const placeholder = container.createEl("p", {
      text: "\u6B63\u5728\u5206\u6790\u77E5\u8BC6\u5E93...",
      attr: { style: "color:var(--text-accent);font-size:12px;padding:8px 16px" }
    });
    if (!settings.discoveryRecommendation) {
      container.createEl("p", {
        text: "\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u81F3\u5C11\u4E00\u4E2A\u53D1\u73B0\u529F\u80FD",
        attr: { style: "color:var(--text-muted);padding:16px;text-align:center" }
      });
      placeholder.remove();
      return;
    }
    const toolbar = container.createEl("div", { attr: { style: "margin-bottom:8px" } });
    toolbar.createEl("button", {
      text: "\u5237\u65B0",
      cls: "mod-cta",
      attr: { style: "font-size:12px" }
    }).addEventListener("click", async () => {
      this.renderDiscovery(container);
    });
    if (settings.discoveryRecommendation) {
      const card = container.createEl("div", { cls: "atomic-notes-discovery-card" });
      this.renderRecommendation(card);
    }
    placeholder.remove();
  }
  renderRecommendation(container) {
    const app = this.app;
    const settings = this.plugin.settings;
    container.createEl("h4", { text: "\u5173\u8054\u63A8\u8350" });
    const selectEl = container.createEl("select", {
      attr: { style: "width:100%;margin-bottom:8px;padding:4px;border-radius:4px" }
    });
    selectEl.createEl("option", { text: "\u8BF7\u5148\u9009\u62E9\u4E00\u6761\u7B14\u8BB0", value: "" });
    const noteMetas = [];
    const allFiles = app.vault.getMarkdownFiles();
    const files = settings.targetFolder ? allFiles.filter((f) => f.path.startsWith(settings.targetFolder)) : allFiles;
    for (const file of files) {
      const title = file.path.split("/").pop().replace(/\.md$/, "");
      selectEl.createEl("option", { text: title, value: file.path });
      noteMetas.push({ path: file.path, title });
    }
    const resultsContainer = container.createEl("div");
    selectEl.addEventListener("change", async () => {
      const selectedPath = selectEl.value;
      if (!selectedPath) {
        resultsContainer.empty();
        resultsContainer.createEl("p", {
          text: "\u8BF7\u5148\u9009\u62E9\u4E00\u6761\u7B14\u8BB0",
          attr: { style: "color:var(--text-muted);font-size:12px" }
        });
        return;
      }
      resultsContainer.empty();
      resultsContainer.createEl("p", {
        text: "\u6B63\u5728\u8BA1\u7B97\u76F8\u4F3C\u5EA6...",
        attr: { style: "color:var(--text-muted);font-size:12px" }
      });
      try {
        const currentFolder = settings.targetFolder || "";
        const currentCount = files.length;
        if (!this._simCache || this._simCache.folder !== currentFolder || this._simCache.noteCount !== currentCount) {
          const built = await buildSimilarityMatrix(app.vault, settings.targetFolder);
          this._simCache = {
            folder: currentFolder,
            noteCount: built.notes.length,
            notes: built.notes,
            matrix: built.matrix
          };
        }
        const notes = this._simCache.notes;
        const matrix = this._simCache.matrix;
        const idx = notes.findIndex((n) => n.path === selectedPath);
        if (idx < 0) {
          resultsContainer.empty();
          resultsContainer.createEl("p", { text: "\u672A\u627E\u5230\u8BE5\u7B14\u8BB0", attr: { style: "color:var(--text-muted)" } });
          return;
        }
        const ranked = [];
        for (let i = 0; i < notes.length; i++) {
          if (i !== idx)
            ranked.push({ idx: i, sim: matrix[idx][i] });
        }
        ranked.sort((a, b) => b.sim - a.sim);
        const top10 = ranked.slice(0, 10);
        resultsContainer.empty();
        for (const item of top10) {
          const note = notes[item.idx];
          const simPercent = (item.sim * 100).toFixed(1);
          const isHighSim = item.sim >= 0.8;
          const rowEl = resultsContainer.createEl("div", { cls: "note-link-row" });
          const badgeCls = isHighSim ? "high" : "mid";
          rowEl.createEl("span", {
            text: simPercent + "%",
            cls: `sim-badge ${badgeCls}`
          });
          const linkEl = rowEl.createEl("a", {
            text: note.title,
            attr: {
              href: "#",
              style: `font-weight:${isHighSim ? "bold" : "normal"};color:${isHighSim ? "var(--text-accent)" : "var(--text-normal)"};font-size:12px;flex:1`
            }
          });
          linkEl.addEventListener("click", (ev) => {
            ev.preventDefault();
            app.workspace.openLinkText(note.path, "", false);
          });
        }
      } catch (err) {
        resultsContainer.empty();
        resultsContainer.createEl("p", {
          text: "\u8BA1\u7B97\u5931\u8D25: " + (err instanceof Error ? err.message : String(err)),
          attr: { style: "color:var(--text-error)" }
        });
      }
    });
  }
  async onClose() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    const container = this.containerEl.children[1];
    container.empty();
  }
};

// src/services/history-service.ts
function fnv1aHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = hash * 16777619 >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
var MAX_HISTORY_SIZE = 50;
function computeSourceHash(content) {
  return fnv1aHash(content);
}
function getSourceTitle(type, content) {
  if (type === "url") {
    return content;
  }
  return content.slice(0, 50);
}
function findPreviousExtraction(history, sourceHash) {
  return history.find((entry) => entry.sourceHash === sourceHash);
}
function addHistoryEntry(history, entry) {
  history.push(entry);
  return history.slice(-MAX_HISTORY_SIZE);
}

// src/services/backlink-service.ts
function insertBacklinks(editor, notePaths) {
  let success = 0;
  let failed = 0;
  if (!editor)
    return { success: 0, failed: notePaths.length };
  for (const path of notePaths) {
    try {
      const noteName = path.split("/").pop().replace(/\.md$/, "");
      const backlink = `

[[${noteName}]]
`;
      const cursorPos = editor.getCursor();
      editor.replaceRange(backlink, cursorPos);
      success++;
    } catch {
      failed++;
    }
  }
  return { success, failed };
}

// src/main.ts
var AtomicNotesPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this._isExtracting = false;
    this._abortController = null;
  }
  async onload() {
    console.log("Bamboo Darts \u63D2\u4EF6\u52A0\u8F7D\u4E2D...");
    await this.loadSettings();
    this.registerView(VIEW_TYPE_ATOMIC_PANEL, (leaf) => new AtomicNotesPanel(leaf, this));
    this.addSettingTab(new AtomicNotesSettingTab(this.app, this));
    this.addCommand({
      id: "extract-from-selection",
      name: "\u4ECE\u9009\u4E2D\u6587\u672C\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0",
      editorCallback: (editor, view) => {
        this.extractFromSelection();
      }
    });
    this.addCommand({
      id: "extract-from-url",
      name: "\u4ECE URL \u63D0\u70BC\u539F\u5B50\u7B14\u8BB0",
      callback: () => {
        this.extractFromUrl();
      }
    });
    this.addCommand({
      id: "extract-from-clipboard",
      name: "\u4ECE\u526A\u8D34\u677F\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0",
      callback: () => {
        this.extractFromClipboard();
      }
    });
    this.addCommand({
      id: "open-panel-left",
      name: "\u6253\u5F00\u9762\u677F - \u5DE6\u4FA7\u680F",
      callback: () => this.openPanelAt("left")
    });
    this.addCommand({
      id: "open-panel-right",
      name: "\u6253\u5F00\u9762\u677F - \u53F3\u4FA7\u680F",
      callback: () => this.openPanelAt("right")
    });
    this.addCommand({
      id: "open-panel-tab",
      name: "\u6253\u5F00\u9762\u677F - \u65B0\u6807\u7B7E\u9875",
      callback: () => this.openPanelAt("tab")
    });
    this.addCommand({
      id: "open-panel-split",
      name: "\u6253\u5F00\u9762\u677F - \u5206\u5C4F",
      callback: () => this.openPanelAt("split")
    });
    this.addRibbonIcon("atom", "\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0", () => {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian10.MarkdownView);
      if (activeView) {
        const selection = activeView.editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.extractFromSelection();
          return;
        }
      }
      this.activateView();
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const selectedText = editor.getSelection();
        if (selectedText && selectedText.trim().length > 0) {
          menu.addItem((item) => {
            item.setTitle("\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0").setIcon("document").onClick(() => {
              this.extractFromSelection();
            });
          });
        }
      })
    );
    console.log("Bamboo Darts \u63D2\u4EF6\u52A0\u8F7D\u5B8C\u6210");
  }
  async onunload() {
    console.log("Bamboo Darts \u63D2\u4EF6\u5DF2\u5378\u8F7D");
  }
  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
      const currentVersion = this.settings.settingsVersion || 1;
      if (currentVersion < 2) {
        if ("enableDataCheck" in this.settings) {
          delete this.settings.enableDataCheck;
        }
        if (this.settings.maxTokens === 2e3) {
          this.settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
        }
        this.settings.settingsVersion = 2;
        await this.saveSettings();
      }
    } catch (e) {
      console.warn("[Bamboo Darts] \u8BBE\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /**
   * 激活原子笔记面板视图
   */
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const position = this.settings.panelPosition || "right";
    const leaf = position === "left" ? this.app.workspace.getLeftLeaf(false) : position === "right" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf(position === "tab" ? "tab" : "split");
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  /**
   * 在指定位置打开面板
   */
  async openPanelAt(position) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ATOMIC_PANEL);
    if (existing.length > 0) {
      await existing[0].detach();
    }
    const leaf = position === "left" ? this.app.workspace.getLeftLeaf(false) : position === "right" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf(position === "tab" ? "tab" : "split");
    await leaf.setViewState({ type: VIEW_TYPE_ATOMIC_PANEL, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async extractFromSelection() {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian10.MarkdownView);
    if (!activeView) {
      new import_obsidian10.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u6587\u4EF6");
      return;
    }
    const editor = activeView.editor;
    const selection = editor.getSelection();
    if (!selection || selection.trim().length === 0) {
      new import_obsidian10.Notice("\u8BF7\u5148\u9009\u4E2D\u8981\u63D0\u70BC\u7684\u6587\u672C");
      return;
    }
    await this.runExtraction({ type: "selection", content: selection });
  }
  async extractFromUrl() {
    new InputModal(this.app, {
      title: "\u8F93\u5165 URL",
      placeholder: "https://example.com/article",
      submitText: "\u5F00\u59CB\u63D0\u70BC",
      onSubmit: async (url) => {
        if (!url || !url.trim()) {
          new import_obsidian10.Notice("\u8BF7\u8F93\u5165\u6709\u6548\u7684 URL");
          return;
        }
        await this.runExtraction({ type: "url", content: url.trim() });
      }
    }).open();
  }
  async extractFromClipboard() {
    try {
      const rawText = await navigator.clipboard.readText();
      if (!rawText || rawText.trim().length === 0) {
        new import_obsidian10.Notice("\u526A\u8D34\u677F\u4E3A\u7A7A");
        return;
      }
      const text = stripImageNoise(rawText);
      await this.runExtraction({ type: "text", content: text });
    } catch (error) {
      new import_obsidian10.Notice("\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650");
    }
  }
  async runExtraction(input, opts = {}) {
    if (this._isExtracting) {
      new import_obsidian10.Notice("\u5DF2\u6709\u63D0\u53D6\u4EFB\u52A1\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5");
      return;
    }
    if (!opts.skipDuplicateCheck) {
      const sourceHash = computeSourceHash(input.content);
      const previous = findPreviousExtraction(this.settings.extractionHistory || [], sourceHash);
      if (previous) {
        this.showDuplicateConfirm(input, previous, opts);
        return;
      }
    }
    this._isExtracting = true;
    if (!this.settings.deepseekApiKey) {
      new import_obsidian10.Notice("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 DeepSeek API Key");
      this._isExtracting = false;
      return;
    }
    this._abortController = new AbortController();
    let progressModal = null;
    let progressCb = opts.onProgress;
    if (!progressCb) {
      const m = new class extends import_obsidian10.Modal {
        constructor(p) {
          super(p.app);
          this._cancelBtn = null;
          this._plugin = p;
        }
        onOpen() {
          this.containerEl.style.zIndex = "1000";
          this.modalEl.style.minWidth = "280px";
          this.modalEl.style.maxWidth = "420px";
          this._title = this.contentEl.createEl("div", { attr: { style: "font-weight:bold;font-size:13px;margin-bottom:8px" }, text: "\u6B63\u5728\u63D0\u70BC\u539F\u5B50\u7B14\u8BB0..." });
          this._body = this.contentEl.createEl("div", { attr: { style: "font-size:12px;color:var(--text-muted);line-height:1.6;max-height:200px;overflow-y:auto" } });
          const btnRow = this.contentEl.createEl("div", { attr: { style: "display:flex;justify-content:flex-end;margin-top:12px" } });
          this._cancelBtn = btnRow.createEl("button", { text: "\u53D6\u6D88\u63D0\u70BC", attr: { style: "font-size:12px;padding:4px 16px;cursor:pointer" } });
          this._cancelBtn.addEventListener("click", () => {
            this._plugin.cancelExtraction();
            if (this._cancelBtn) {
              this._cancelBtn.disabled = true;
              this._cancelBtn.setText("\u53D6\u6D88\u4E2D...");
            }
          });
        }
        update(event, allEvents, totalMs) {
          this._title.setText(`${event.phase}\uFF1A${event.name} \u2014 \u5DF2\u7528\u65F6 ${(totalMs / 1e3).toFixed(1)}s`);
          this._body.empty();
          for (const ev of allEvents) {
            const icon = ev.status === "running" ? "\u27F3 " : ev.status === "success" ? "\u2713 " : ev.status === "failed" ? "\u2717 " : "\u2212 ";
            const line = this._body.createEl("div", { text: `${icon}${ev.phase} ${ev.name}${ev.detail ? " \u2014 " + ev.detail : ""}` });
            if (ev.status === "running")
              line.style.color = "var(--text-accent)";
            if (ev.status === "success")
              line.style.color = "var(--text-success)";
            if (ev.status === "failed")
              line.style.color = "var(--text-error)";
          }
          if (event.subProgress) {
            this._body.createEl("div", { attr: { style: "margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);color:var(--text-accent)" }, text: `\u8FDB\u5EA6 ${event.subProgress.current}/${event.subProgress.total}${event.subProgress.label ? "\uFF08" + event.subProgress.label + "\uFF09" : ""}` });
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }(this);
      m.open();
      progressModal = m;
      progressCb = (event, allEvents, totalMs) => m.update(event, allEvents, totalMs);
    }
    try {
      const result = await runExtraction(input, {
        deepseekApiKey: this.settings.deepseekApiKey,
        deepseekApiUrl: this.settings.deepseekApiUrl,
        model: this.settings.model,
        maxTokens: this.settings.maxTokens,
        tagPreferences: this.settings.tagPreferences,
        tagMode: this.settings.tagMode,
        factCheck: this.settings.factCheck,
        verifiedOnly: this.settings.verifiedOnly,
        enableReview: this.settings.enableReview,
        reviewModel: this.settings.reviewModel,
        reviewApiUrl: this.settings.reviewApiUrl,
        reviewApiKey: this.settings.reviewApiKey,
        signal: this._abortController.signal,
        vault: this.app.vault,
        targetFolder: this.settings.targetFolder,
        dedupTargetFolder: this.settings.dedupTargetFolder,
        enableVaultDedup: true,
        onProgress: progressCb,
        // Profile 过滤策略
        autoClassify: this.settings.autoClassify,
        profile: this.settings.autoClassify ? void 0 : this.settings.contentProfile,
        profileConfigs: {
          dense: this.settings.profileDense,
          balanced: this.settings.profileBalanced,
          sparse: this.settings.profileSparse
        },
        // 深度提炼
        enableDeepMode: this.settings.enableDeepMode,
        // 强制提炼（跳过门控）
        skipGate: opts.skipGate
      });
      if (!result.success || !result.notes) {
        if (result.error && result.error.includes("\u53D6\u6D88")) {
          new import_obsidian10.Notice("\u63D0\u70BC\u5DF2\u53D6\u6D88");
        } else if (result.gateBlocked) {
          this._isExtracting = false;
          this._abortController = null;
          if (progressModal) {
            try {
              progressModal.contentEl.empty();
              progressModal.close();
              if (progressModal.containerEl?.parentNode) {
                progressModal.containerEl.parentNode.removeChild(progressModal.containerEl);
              }
            } catch {
            }
            progressModal = null;
          }
          this.showForceExtractConfirm(input, result.error || "\u5185\u5BB9\u8D28\u91CF\u4E0D\u8FBE\u6807");
          return;
        } else {
          new import_obsidian10.Notice(`\u63D0\u70BC\u5931\u8D25\uFF1A${result.error}`);
        }
        return;
      }
      new import_obsidian10.Notice(`\u63D0\u70BC\u5B8C\u6210\uFF0C\u5171 ${result.notes.length} \u6761\u539F\u5B50\u7B14\u8BB0`);
      if (this.settings.autoSave) {
        if (result.duplicateHints && result.duplicateHints.length > 0) {
          new import_obsidian10.Notice(`\u68C0\u6D4B\u5230 ${new Set(result.duplicateHints.map((h) => h.noteIndex)).size} \u7BC7\u7591\u4F3C\u91CD\u590D\u7B14\u8BB0\uFF0C\u8BF7\u786E\u8BA4\u540E\u4FDD\u5B58`);
          new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => {
            await this.saveAndBacklink(input, notes);
          }).open();
        } else {
          new import_obsidian10.Notice("\u6B63\u5728\u4FDD\u5B58\u5230\u77E5\u8BC6\u5E93...");
          await this.saveAndBacklink(input, result.notes);
        }
      } else {
        new ResultModal(this.app, result, result.vaultDedupResult, async (notes) => {
          await this.saveAndBacklink(input, notes);
        }).open();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        new import_obsidian10.Notice("\u63D0\u70BC\u5DF2\u53D6\u6D88");
        return;
      }
      new import_obsidian10.Notice(`\u63D0\u70BC\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this._isExtracting = false;
      this._abortController = null;
      if (progressModal) {
        try {
          progressModal.contentEl.empty();
          progressModal.close();
          if (progressModal.containerEl && progressModal.containerEl.parentNode) {
            progressModal.containerEl.parentNode.removeChild(progressModal.containerEl);
          }
        } catch {
        }
        progressModal = null;
      }
    }
  }
  cancelExtraction() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }
  /**
   * 门控失败后的强制提炼确认框
   */
  showForceExtractConfirm(input, gateError) {
    const modal = new class extends import_obsidian10.Modal {
      constructor(plugin, input2, gateError2) {
        super(plugin.app);
        this.plugin = plugin;
        this.input = input2;
        this.gateError = gateError2;
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "\u26A0\uFE0F \u5185\u5BB9\u8D28\u91CF\u95E8\u63A7\u672A\u901A\u8FC7" });
        const reasonBox = contentEl.createEl("div", {
          attr: {
            style: [
              "background:var(--background-secondary)",
              "border-left:3px solid var(--color-orange)",
              "border-radius:6px",
              "padding:8px 12px",
              "margin:10px 0",
              "font-size:13px",
              "color:var(--text-muted)"
            ].join(";")
          }
        });
        reasonBox.setText(this.gateError);
        contentEl.createEl("p", {
          text: "\u5F3A\u5236\u63D0\u70BC\u5C06\u8DF3\u8FC7\u8D28\u91CF\u68C0\u67E5\uFF0C\u76F4\u63A5\u53D1\u9001\u7ED9 AI\u3002\u4F4E\u8D28\u5185\u5BB9\u53EF\u80FD\u5BFC\u81F4\u63D0\u70BC\u7ED3\u679C\u8F83\u5DEE\u3002",
          attr: { style: "font-size:13px;color:var(--text-muted);margin:8px 0" }
        });
        const btnRow = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:16px" }
        });
        const cancelBtn = btnRow.createEl("button", { text: "\u653E\u5F03" });
        cancelBtn.addEventListener("click", () => this.close());
        const forceBtn = btnRow.createEl("button", {
          text: "\u5F3A\u5236\u63D0\u70BC",
          attr: { style: "background:var(--color-orange);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600" }
        });
        forceBtn.addEventListener("click", async () => {
          this.close();
          await this.plugin.runExtraction(this.input, { skipGate: true });
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    }(this, input, gateError);
    modal.open();
  }
  /**
   * 重复提炼确认框
   */
  showDuplicateConfirm(input, previous, opts) {
    const daysAgo = Math.floor((Date.now() - new Date(previous.extractedAt).getTime()) / (1e3 * 60 * 60 * 24));
    const timeStr = daysAgo === 0 ? "\u4ECA\u5929" : `${daysAgo}\u5929\u524D`;
    const modal = new class extends import_obsidian10.Modal {
      constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "\u26A0\uFE0F \u6B64\u5185\u5BB9\u5DF2\u63D0\u70BC\u8FC7" });
        const infoBox = contentEl.createEl("div", {
          attr: {
            style: [
              "background:var(--background-secondary)",
              "border-left:3px solid var(--color-orange)",
              "border-radius:6px",
              "padding:8px 12px",
              "margin:10px 0",
              "font-size:13px",
              "color:var(--text-muted)"
            ].join(";")
          }
        });
        infoBox.setText(`\u6B64\u5185\u5BB9\u5DF2\u5728${timeStr}\u63D0\u70BC\u8FC7\uFF0C\u5171 ${previous.noteCount} \u6761\u7B14\u8BB0\u3002`);
        const btnRow = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:16px" }
        });
        const cancelBtn = btnRow.createEl("button", { text: "\u53D6\u6D88" });
        cancelBtn.addEventListener("click", () => this.close());
        if (previous.savedPaths && previous.savedPaths.length > 0) {
          const viewBtn = btnRow.createEl("button", { text: "\u67E5\u770B\u4E0A\u6B21\u7ED3\u679C" });
          viewBtn.addEventListener("click", () => {
            this.close();
            const firstPath = previous.savedPaths[0];
            this.plugin.app.workspace.openLinkText(firstPath, "", false);
          });
        }
        const reExtractBtn = btnRow.createEl("button", {
          text: "\u91CD\u65B0\u63D0\u70BC",
          attr: { style: "background:var(--interactive-accent);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600" }
        });
        reExtractBtn.addEventListener("click", async () => {
          this.close();
          await this.plugin.runExtraction(input, { ...opts, skipDuplicateCheck: true });
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    }(this);
    modal.open();
  }
  async saveAndBacklink(input, notes) {
    let savedPaths = [];
    let savedCount = 0;
    try {
      new import_obsidian10.Notice("\u6B63\u5728\u4FDD\u5B58\u5230\u77E5\u8BC6\u5E93...");
      const saveResult = await saveNotes(this.app, notes, {
        targetFolder: this.settings.targetFolder || "Atomic Notes",
        fileNameTemplate: this.settings.fileNameTemplate || "{{title}}"
      });
      savedPaths = saveResult.paths;
      savedCount = saveResult.success;
      if (saveResult.failed > 0 && saveResult.errors.length > 0) {
        new import_obsidian10.Notice(`\u4FDD\u5B58\u5B8C\u6210\uFF0C\u4F46 ${saveResult.failed} \u6761\u5931\u8D25\uFF1A${saveResult.errors.slice(0, 3).join("\uFF1B")}`);
      } else {
        new import_obsidian10.Notice(`\u4FDD\u5B58\u5B8C\u6210\uFF01\u6210\u529F ${saveResult.success} \u6761`);
      }
    } catch (saveError) {
      new import_obsidian10.Notice(`\u4FDD\u5B58\u8FC7\u7A0B\u51FA\u9519\uFF1A${saveError instanceof Error ? saveError.message : String(saveError)}`);
      console.error("\u4FDD\u5B58\u5931\u8D25\uFF1A", saveError);
      return;
    }
    if (this.settings.autoBacklink && input.type === "selection") {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian10.MarkdownView);
      if (activeView) {
        const backlinkResult = insertBacklinks(activeView.editor, savedPaths);
        if (backlinkResult.success > 0) {
          new import_obsidian10.Notice(`\u5DF2\u63D2\u5165 ${backlinkResult.success} \u6761\u53CD\u5411\u94FE\u63A5`);
        }
      }
    }
    await this.recordHistory(input, savedCount, savedPaths);
  }
  async recordHistory(input, noteCount, savedPaths) {
    try {
      const sourceHash = computeSourceHash(input.content);
      const sourceTitle = getSourceTitle(input.type, input.content);
      const history = this.settings.extractionHistory || [];
      const updatedHistory = addHistoryEntry(history, { sourceHash, sourceTitle, sourceType: input.type, extractedAt: (/* @__PURE__ */ new Date()).toISOString(), noteCount, savedPaths });
      this.settings.extractionHistory = updatedHistory;
      await this.saveSettings();
    } catch (e) {
      console.warn("\u8BB0\u5F55\u63D0\u70BC\u5386\u53F2\u5931\u8D25:", e);
    }
  }
};
