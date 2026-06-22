/**
 * vitest 全局 setup
 *
 * url-extractor.ts 使用 DOMParser / document / NodeFilter 等浏览器 API，
 * 在 Node 测试环境中需要通过 jsdom 提供这些全局变量。
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

// 将 DOM API 注入全局，供 url-extractor.ts 使用
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as Record<string, unknown>).document = dom.window.document;
(globalThis as Record<string, unknown>).NodeFilter = dom.window.NodeFilter;
(globalThis as Record<string, unknown>).Node = dom.window.Node;
(globalThis as Record<string, unknown>).Element = dom.window.Element;
(globalThis as Record<string, unknown>).Comment = dom.window.Comment;
