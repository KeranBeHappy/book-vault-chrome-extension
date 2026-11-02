/**
 * LocalDB 读写、schemaVersion 迁移支持、配额与容量保护。
 *
 * 文档出处：3.2、4.7、9 节第 7 / 13 条。
 *
 * 设计要点：
 * 1. 按字段拆键存储，避免「整库一次 set」超过 1MB 上限（9.13）。
 * 2. `linkStatus` / `bookmarkMeta` / `orphanMeta` 是 Map 型且可能很大，
 *    超过 1MB 时自动切成 `<name>:p0..pn`，索引写在 `<name>:meta`。
 * 3. 所有写操作经 `withWriteLock`（shared/lock）串行化，页面永不直接写 storage。
 * 4. 版本高于当前扩展时置只读模式，拒绝一切写入（4.7）。
 */

import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  SHARDED_SECTIONS,
  STORAGE_KEYS,
  STORAGE_WRITE_LIMIT_BYTES,
} from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import type { DeepPartial } from '@/shared/messages';
import type {
  CategoryRule,
  EncryptedKeyVault,
  Flags,
  JobState,
  LinkStatus,
  LocalDB,
  OpRecord,
  RecycleItem,
  RuntimeState,
  Settings,
  SnapshotMeta,
  UiState,
} from '@/shared/types';

/** 当前扩展支持的 schema 版本；升级必须 +1 并补迁移函数（4.7） */
export const SCHEMA_VERSION = 1;

/** 字段 → storage 键 */
const SECTION_KEYS: Record<keyof LocalDB, string> = {
  schemaVersion: STORAGE_KEYS.schemaVersion,
  settings: STORAGE_KEYS.settings,
  rules: STORAGE_KEYS.rules,
  proxyBlocklist: STORAGE_KEYS.proxyBlocklist,
  linkStatus: STORAGE_KEYS.linkStatus,
  bookmarkMeta: STORAGE_KEYS.bookmarkMeta,
  orphanMeta: STORAGE_KEYS.orphanMeta,
  recycleBin: STORAGE_KEYS.recycleBin,
  localSnapshots: STORAGE_KEYS.localSnapshots,
  jobs: STORAGE_KEYS.jobs,
  opLog: STORAGE_KEYS.opLog,
  uiState: STORAGE_KEYS.uiState,
  runtime: STORAGE_KEYS.runtime,
  flags: STORAGE_KEYS.flags,
  secretVault: STORAGE_KEYS.secretVault,
};

/** 页面侧监听 storage 变更时需要匹配的键集合 */
export const DB_WATCH_KEYS: string[] = Object.values(SECTION_KEYS);

/** 只读模式：当库版本高于当前扩展时置位，所有写入口拒绝执行 */
let readOnlyMode = false;

/** 是否处于只读模式（版本过新，提示用户升级扩展） */
export function isReadOnly(): boolean {
  return readOnlyMode;
}

/** 空库（首次安装或键缺失时的兜底） */
export function createEmptyDb(): LocalDB {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: structuredClone(DEFAULT_SETTINGS),
    rules: DEFAULT_RULES.map((rule) => ({ ...rule })),
    proxyBlocklist: [],
    linkStatus: {},
    bookmarkMeta: {},
    orphanMeta: {},
    recycleBin: [],
    localSnapshots: [],
    jobs: {},
    opLog: [],
    uiState: {
      activeView: 'manager',
      filter: {},
      sort: { key: 'title', dir: 'asc' },
      expandedFolderIds: [],
    },
    runtime: {},
    flags: {},
  };
}

/* ------------------------------------------------------------------ */
/* 原始 storage 原语                                                    */
/* ------------------------------------------------------------------ */

/** 读取一批键；缺省的键不会出现在返回对象里 */
export async function getItems<T = unknown>(keys: string[]): Promise<Record<string, T>> {
  if (keys.length === 0) return {};
  try {
    return (await chrome.storage.local.get(keys)) as Record<string, T>;
  } catch (err) {
    console.error('[storage] 读取失败', err);
    throw new Error('errStorageRead');
  }
}

/**
 * 写入一批键。
 * 失败（多为配额/序列化异常）抛出可读错误，调用方必须中止当前操作（4.1）。
 */
export async function setItems(items: Record<string, unknown>): Promise<void> {
  if (Object.keys(items).length === 0) return;
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    console.error('[storage] 写入失败', err);
    throw new Error('errStorageWrite');
  }
}

/** 删除一批键 */
export async function removeItems(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await chrome.storage.local.remove(keys);
  } catch (err) {
    console.error('[storage] 删除失败', err);
    throw new Error('errStorageWrite');
  }
}

/** 列出所有键名（快照/任务分片清理时用） */
export async function listKeys(): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all);
}

/** 按前缀列出键名 */
export async function listKeysByPrefix(prefix: string): Promise<string[]> {
  const keys = await listKeys();
  return keys.filter((key) => key.startsWith(prefix));
}

/* ------------------------------------------------------------------ */
/* 分片 Map 读写                                                        */
/* ------------------------------------------------------------------ */

interface ShardMeta {
  shards: string[];
}

/** 读取分片 Map；单键形态与分片形态都能读 */
async function readShardedMap<T>(name: string): Promise<Record<string, T>> {
  const metaKey = `${name}${STORAGE_KEYS.shardMetaSuffix}`;
  const metaRaw = await getItems<ShardMeta>([metaKey]);
  const meta = metaRaw[metaKey];
  if (meta?.shards && meta.shards.length > 0) {
    const parts = await getItems<Record<string, T>>(meta.shards);
    const merged: Record<string, T> = {};
    for (const key of meta.shards) Object.assign(merged, parts[key] ?? {});
    return merged;
  }
  const single = await getItems<Record<string, T>>([name]);
  return single[name] ?? {};
}

/**
 * 写入分片 Map。
 * 小于 1MB 时退回单键形态（读得更快），超过则按条目切分，索引写入 `<name>:meta`。
 */
async function writeShardedMap<T>(name: string, map: Record<string, T>): Promise<void> {
  const nameMetaKey = `${name}${STORAGE_KEYS.shardMetaSuffix}`;
  const oldMetaRaw = await getItems<ShardMeta>([nameMetaKey]);
  const oldShards = oldMetaRaw[nameMetaKey]?.shards ?? [];

  const serialized = JSON.stringify(map);
  if (serialized.length <= STORAGE_WRITE_LIMIT_BYTES) {
    await setItems({ [name]: map });
    // 清理可能残留的分片与索引
    const stale = [...oldShards, nameMetaKey];
    await removeItems(stale);
    return;
  }

  const chunks: Array<Record<string, T>> = [];
  let current: Record<string, T> = {};
  let currentSize = 2;
  for (const [key, value] of Object.entries(map)) {
    const itemSize = JSON.stringify({ [key]: value }).length;
    if (currentSize + itemSize > STORAGE_WRITE_LIMIT_BYTES && currentSize > 2) {
      chunks.push(current);
      current = {};
      currentSize = 2;
    }
    current[key] = value;
    currentSize += itemSize;
  }
  if (currentSize > 2) chunks.push(current);

  const shardKeys = chunks.map((_, index) => `${name}${STORAGE_KEYS.shardChunkSuffix}${index}`);
  const payload: Record<string, unknown> = {};
  chunks.forEach((chunk, index) => {
    payload[shardKeys[index] as string] = chunk;
  });
  payload[nameMetaKey] = { shards: shardKeys } satisfies ShardMeta;
  await setItems(payload);
  await removeItems([name, ...oldShards.filter((key) => !shardKeys.includes(key))]);
}

/* ------------------------------------------------------------------ */
/* LocalDB 读写                                                         */
/* ------------------------------------------------------------------ */

/** 读一个单键段，缺失或类型不符时用兜底值 */
async function readSection<T>(key: string, fallback: T): Promise<T> {
  const raw = await getItems<T>([key]);
  const value = raw[key];
  return value === undefined || value === null ? fallback : value;
}

/** 读取整个 LocalDB；缺失的段用默认值补齐（不自动写回） */
export async function readDb(): Promise<LocalDB> {
  const base = createEmptyDb();
  const keys = Object.values(SECTION_KEYS);
  const raw = await getItems<unknown>(keys);

  const version = typeof raw[STORAGE_KEYS.schemaVersion] === 'number'
    ? (raw[STORAGE_KEYS.schemaVersion] as number)
    : SCHEMA_VERSION;
  readOnlyMode = version > SCHEMA_VERSION;

  const [linkStatus, bookmarkMeta, orphanMeta] = await Promise.all([
    readShardedMap<LinkStatus>(STORAGE_KEYS.linkStatus),
    readShardedMap<LocalDB['bookmarkMeta'][string]>(STORAGE_KEYS.bookmarkMeta),
    readShardedMap<LocalDB['orphanMeta'][string]>(STORAGE_KEYS.orphanMeta),
  ]);

  return {
    schemaVersion: version,
    settings: mergeSettings(base.settings, (raw[STORAGE_KEYS.settings] as Partial<Settings>) ?? {}),
    rules: (raw[STORAGE_KEYS.rules] as CategoryRule[]) ?? base.rules,
    proxyBlocklist: (raw[STORAGE_KEYS.proxyBlocklist] as string[]) ?? [],
    linkStatus,
    bookmarkMeta,
    orphanMeta,
    recycleBin: (raw[STORAGE_KEYS.recycleBin] as RecycleItem[]) ?? [],
    localSnapshots: (raw[STORAGE_KEYS.localSnapshots] as SnapshotMeta[]) ?? [],
    jobs: (raw[STORAGE_KEYS.jobs] as Record<string, JobState>) ?? {},
    opLog: (raw[STORAGE_KEYS.opLog] as OpRecord[]) ?? [],
    uiState: (raw[STORAGE_KEYS.uiState] as UiState) ?? base.uiState,
    runtime: (raw[STORAGE_KEYS.runtime] as RuntimeState) ?? {},
    flags: (raw[STORAGE_KEYS.flags] as Flags) ?? {},
    secretVault: raw[STORAGE_KEYS.secretVault] as EncryptedKeyVault | undefined,
  };
}

/** 只读快照元信息（SW 冷启动用，避免整库反序列化） */
export async function readSnapshots(): Promise<SnapshotMeta[]> {
  return readSection<SnapshotMeta[]>(STORAGE_KEYS.localSnapshots, []);
}

/** 写回指定的段；分片 Map 走分片逻辑 */
async function writeSections(db: LocalDB, sections: Array<keyof LocalDB>): Promise<void> {
  const plain: Record<string, unknown> = {};
  for (const section of sections) {
    const value = db[section];
    if (value === undefined) continue;
    const isSharded = (SHARDED_SECTIONS as readonly string[]).includes(section);
    if (isSharded) {
      await writeShardedMap(section, value as Record<string, unknown>);
      continue;
    }
    plain[SECTION_KEYS[section]] = value;
  }
  if (Object.keys(plain).length > 0) {
    // 单字段超过 1MB 说明设计有问题，这里直接拦截，避免整库写入失败
    for (const [key, value] of Object.entries(plain)) {
      const size = JSON.stringify(value).length;
      if (size > STORAGE_WRITE_LIMIT_BYTES) {
        console.error(`[storage] 字段 ${key} 序列化后 ${size} 字节，超过 1MB 上限`);
        throw new Error('errStorageTooLarge');
      }
    }
    await setItems(plain);
  }
}

/** 断言可写（只读模式一律拒绝） */
function assertWritable(): void {
  if (readOnlyMode) throw new Error('errSchemaTooNew');
}

/**
 * 深合并设置：只写变更字段（4.6 要求 patch 合并，降低多窗口互相踩踏）。
 */
export function mergeSettings(base: Settings, patch: DeepPartial<Settings>): Settings {
  return {
    ...base,
    ...(patch as Partial<Settings>),
    encryption: { ...base.encryption, ...(patch.encryption ?? {}) },
    webdav: { ...base.webdav, ...(patch.webdav ?? {}) },
  };
}

/** 判断是否为可递归合并的普通对象（数组整体替换） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 按 patch 语义合并：对象递归合并，数组/原始值整体替换 */
function mergePatch<T>(target: T, patch: unknown): T {
  if (patch === undefined) return target;
  if (!isPlainObject(target) || !isPlainObject(patch)) return patch as T;
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = mergePatch(result[key], value);
  }
  return result as T;
}

/** patch 选项：`replace` 里的段按整段替换落盘 */
export interface PatchOptions {
  /**
   * 需要「删键」语义的段。默认 patch 是递归合并（只增不删），
   * 清空 meta、删标签、删回收站条目等场景必须显式声明为整段替换，
   * 否则旧键会被合并保留（I1/I2/I4/D2/D4 都依赖这个语义）。
   */
  replace?: Array<keyof LocalDB>;
}

/**
 * 合并写入 LocalDB（只落盘被 patch 命中的段）。
 * 整段替换的段（如 linkStatus 全量）也走这里，调用方注意不要整体覆盖 status。
 */
export async function patchDb(
  patch: DeepPartial<LocalDB>,
  options?: PatchOptions,
): Promise<LocalDB> {
  return withWriteLock(() => applyPatch(patch, options));
}

/**
 * 同 `patchDb`，但**不自带锁**。
 * 只允许在已经持有 `withWriteLock` 的调用链里使用（锁不可重入，嵌套会死锁）。
 */
export async function applyPatch(
  patch: DeepPartial<LocalDB>,
  options?: PatchOptions,
): Promise<LocalDB> {
  assertWritable();
  const db = await readDb();
  const replaceKeys = new Set<keyof LocalDB>(options?.replace ?? []);
  const changed: Array<keyof LocalDB> = [];
  for (const key of Object.keys(patch) as Array<keyof LocalDB>) {
    const value = (patch as Record<string, unknown>)[key];
    // 值为 undefined 时视为「本段不变」；否则 replace 会把整段置成 undefined
    if (value === undefined) continue;
    const next = replaceKeys.has(key)
      ? (structuredClone(value) as LocalDB[typeof key])
      : mergePatch(db[key], value);
    if (next !== db[key]) {
      (db as unknown as Record<string, unknown>)[key] = next;
      changed.push(key);
    }
  }
  if (changed.length > 0) await writeSections(db, changed);
  return db;
}

/**
 * 整段替换某个字段（用于需要「删键」语义的段，如 runtime.lastBackupError）。
 * patch 语义只增不删，因此这里显式覆盖整段。
 */
export async function replaceSection<K extends keyof LocalDB>(
  key: K,
  value: LocalDB[K],
): Promise<void> {
  return withWriteLock(async () => {
    assertWritable();
    const db = await readDb();
    db[key] = value;
    await writeSections(db, [key]);
  });
}

/** 设置 patch（只写 settings 一段） */
export async function patchSettings(patch: DeepPartial<Settings>): Promise<LocalDB> {
  return withWriteLock(async () => {
    assertWritable();
    const db = await readDb();
    db.settings = mergeSettings(db.settings, patch);
    await writeSections(db, ['settings']);
    return db;
  });
}

/** 直接写回整库（迁移、导入恢复等场景；内部使用，自动串行化） */
export async function writeDb(db: LocalDB): Promise<void> {
  return withWriteLock(async () => {
    assertWritable();
    db.schemaVersion = SCHEMA_VERSION;
    await writeSections(db, Object.keys(SECTION_KEYS) as Array<keyof LocalDB>);
  });
}

/**
 * 只在键不存在时初始化（首次安装）。
 * 返回是否发生了初始化，调用方据此决定是否注册默认闹钟。
 */
export async function ensureDb(): Promise<{ db: LocalDB; created: boolean }> {
  const raw = await getItems<unknown>([STORAGE_KEYS.schemaVersion]);
  const exists = raw[STORAGE_KEYS.schemaVersion] !== undefined;
  if (exists) return { db: await readDb(), created: false };

  const db = createEmptyDb();
  await writeDb(db);
  return { db, created: true };
}

/**
 * 是否需要迁移（schemaVersion < 当前版本）。
 * 迁移前的快照由 background 负责生成（storage 不依赖 backup，避免循环引用）。
 */
export async function needsMigration(): Promise<boolean> {
  const raw = await getItems<number>([STORAGE_KEYS.schemaVersion]);
  const version = raw[STORAGE_KEYS.schemaVersion];
  if (typeof version !== 'number') return false;
  return version < SCHEMA_VERSION;
}

/** 迁移函数表：key 为「迁移到的目标版本」，逐级执行（4.7） */
const MIGRATIONS: Record<number, (db: LocalDB) => Promise<LocalDB> | LocalDB> = {
  // 当前只有 v1，占位示例：2: async (db) => { ...; return db; }
};

/**
 * 逐级迁移到当前版本；调用前必须先由调用方生成 preOperation 快照。
 * 迁移失败时抛错，库保持旧版本（写入是最后一步）。
 */
export async function runMigrations(): Promise<LocalDB> {
  let db = await readDb();
  const from = db.schemaVersion;
  if (from > SCHEMA_VERSION) throw new Error('errSchemaTooNew');
  if (from === SCHEMA_VERSION) return db;

  for (let version = from + 1; version <= SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    // 缺迁移函数说明 SCHEMA_VERSION 提了但没写迁移：明确告警，避免「静默跳级」
    if (!migrate) {
      console.warn(`[storage] 缺少 v${version} 的迁移函数，按无变更处理（检查 SCHEMA_VERSION）`);
      continue;
    }
    db = await migrate(db);
    db.schemaVersion = version;
  }
  await writeDb(db);
  console.info(`[storage] 已完成迁移：v${from} → v${SCHEMA_VERSION}`);
  return db;
}

/* ------------------------------------------------------------------ */
/* 常用小工具                                                           */
/* ------------------------------------------------------------------ */

/**
 * 读取受管的两根之外的「键前缀」数据不在这里做——快照分片与任务分片
 * 直接使用 storage 原语，避免 storage 模块知道业务细节。
 */
export async function getSnapshotChunk<T>(key: string): Promise<T | null> {
  const raw = await getItems<T>([key]);
  return raw[key] ?? null;
}

/** 标记扩展自身删除中（A9：onRemoved 需忽略这些 id） */
export async function pushSuppressRemoval(ids: string[]): Promise<void> {
  const db = await readDb();
  const merged = new Set([...(db.flags.suppressRemovalIds ?? []), ...ids]);
  db.flags = { ...db.flags, suppressRemovalIds: [...merged], suppressAt: Date.now() };
  await writeSections(db, ['flags']);
}

/** 清除删除抑制标记 */
export async function clearSuppressRemoval(): Promise<void> {
  const db = await readDb();
  if (!db.flags.suppressRemovalIds && !db.flags.suppressAt) return;
  const { suppressRemovalIds: _ids, suppressAt: _at, ...rest } = db.flags;
  db.flags = { ...rest, suppressRemovalIds: [] };
  await writeSections(db, ['flags']);
}

/** 读取当前删除抑制标记，并按 60 秒 TTL 清理残留（A9） */
export async function readSuppressRemoval(ttlMs: number): Promise<string[]> {
  const db = await readDb();
  const ids = db.flags.suppressRemovalIds ?? [];
  const at = db.flags.suppressAt ?? 0;
  if (ids.length === 0) return [];
  if (Date.now() - at > ttlMs) {
    await clearSuppressRemoval();
    return [];
  }
  return ids;
}
