#!/usr/bin/env node
/**
 * 语言包校验 + 静态打包（文档 4.5 / 11.3 自检项）。
 *
 * 校验三件事，任一不满足即以非 0 退出，让构建前置步骤卡住：
 * 1. 两种语言的 key 集合完全一致；
 * 2. 每条 message 非空；
 * 3. 同一条文案里的 `$1`/`$2` 占位符数量与编号一致（防止翻译漏参数）。
 *
 * 校验通过后把两份 messages.json 写成 `modules/i18n/messages.generated.ts`，
 * 运行时直接 import（4.5 第 1 条：构建时打包为静态 JSON，运行时不用 getMessage）。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['zh_CN', 'en'];
const GENERATED = join(ROOT, 'modules', 'i18n', 'messages.generated.ts');

/** 读取某个语言的语言包 */
function loadMessages(locale) {
  const file = join(ROOT, 'public', '_locales', locale, 'messages.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 提取文案里的占位符编号集合，如 "$1 ... $2" → [1, 2] */
function placeholders(text) {
  return [...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
}

const messages = Object.fromEntries(LOCALES.map((locale) => [locale, loadMessages(locale)]));
const errors = [];

const [base, ...rest] = LOCALES;
const baseKeys = new Set(Object.keys(messages[base]));

for (const locale of rest) {
  const keys = new Set(Object.keys(messages[locale]));
  for (const key of baseKeys) {
    if (!keys.has(key)) errors.push(`[missing] ${locale} 缺少 key: ${key}`);
  }
  for (const key of keys) {
    if (!baseKeys.has(key)) errors.push(`[extra] ${locale} 多出 key: ${key}`);
  }
}

for (const locale of LOCALES) {
  for (const [key, entry] of Object.entries(messages[locale])) {
    if (!entry?.message || entry.message.trim() === '') {
      errors.push(`[empty] ${locale} 的 ${key} 文案为空`);
      continue;
    }
    const expected = placeholders(messages[base][key]?.message ?? '');
    const actual = placeholders(entry.message);
    if (expected.join(',') !== actual.join(',')) {
      errors.push(
        `[placeholder] ${locale} 的 ${key} 占位符不一致：期望 [${expected}]，实际 [${actual}]`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n 校验失败（${errors.length} 项）：`);
  for (const line of errors) console.error(`  - ${line}`);
  process.exit(1);
}

// 生成静态模块：key 按字典序，便于 diff
const sorted = Object.fromEntries(
  [...baseKeys].sort().map((key) => [
    key,
    {
      message: messages[base][key].message,
      ...(messages[base][key].description ? { description: messages[base][key].description } : {}),
    },
  ]),
);
const sortedEn = Object.fromEntries(
  [...baseKeys].sort().map((key) => [
    key,
    {
      message: messages.en[key].message,
      ...(messages.en[key].description ? { description: messages.en[key].description } : {}),
    },
  ]),
);

const banner = `/**
 * 本文件由 scripts/i18n-check.mjs 自动生成，请勿手改。
 * 源头：public/_locales/{zh_CN,en}/messages.json
 */

export interface MessageEntry {
  message: string;
  description?: string;
}

`;
const body =
  `export const MESSAGES: Record<'zh_CN' | 'en', Record<string, MessageEntry>> = ` +
  `${JSON.stringify({ zh_CN: sorted, en: sortedEn }, null, 2)};\n`;

writeFileSync(GENERATED, `${banner}${body}`, 'utf8');

console.log(`i18n 校验通过：${baseKeys.size} 个 key，语言 ${LOCALES.join(' / ')}`);
console.log(`已生成 ${GENERATED.replace(ROOT, '.')}`);
