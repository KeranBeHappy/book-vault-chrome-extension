/**
 * 云端备份加密：AES-256-GCM 载荷 + PBKDF2-SHA256 包裹 DEK、本机 vault、格式识别与校验。
 *
 * 文档出处：5.K（K1–K5）、3.3（备份结构）、决策 D-9、9 节第 9 条。
 *
 * 边界：
 * - 本地快照保持明文；加密只覆盖云端备份与手动导出 JSON。
 * - 明文密码与明文 DEK 不落盘；vault 只存「密码派生 KEK 包裹的 DEK」。
 *   为了让定时备份无需用户输入密码，vault 额外缓存 KEK（见 EncryptedKeyVault.kek 注释）——
 *   这仍不满足「防本机取证」，9 节第 9 条已明确该防护边界。
 * - 解密一律以文件里的 `crypto` 参数为准，不硬编码（D-9）。
 */

import { CRYPTO, STORAGE_KEYS } from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
} from '@/shared/util';
import { applyPatch, readDb, removeItems } from '@/modules/storage';
import type {
  BackupFile,
  BookmarkMeta,
  BookmarkTree,
  CryptoDescriptor,
  EncryptedKeyVault,
} from '@/shared/types';

/** 加密载荷的明文结构（加密前整体序列化） */
export interface PlainBackupPayload {
  bookmarks: BookmarkTree;
  proxyBlocklist: string[];
  bookmarkMeta: Record<string, BookmarkMeta>;
  /** 挂起的标签备注；旧备份没有该字段（I1 / D-5） */
  orphanMeta?: Record<string, BookmarkMeta>;
}

/** 随机字节 */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Uint8Array → ArrayBuffer 副本。
 * 为什么要拷贝：TS 5.9 的 BufferSource 要求 ArrayBuffer（不含 SharedArrayBuffer），
 * 直接传 Uint8Array<ArrayBufferLike> 会类型不兼容；复制后语义也更安全。
 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

/** PBKDF2-SHA256 派生 256 位 KEK（返回原始字节，便于同时缓存与使用） */
async function deriveKekBytes(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    toBuffer(encodeUtf8(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/** 原始 256 位密钥 → AES-GCM CryptoKey */
function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM 加密，输出「密文 + tag」 */
async function gcmEncrypt(
  rawKey: Uint8Array,
  iv: Uint8Array,
  plain: Uint8Array,
  aad: string,
): Promise<Uint8Array> {
  const key = await aesKey(rawKey);
  const buffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv), additionalData: toBuffer(encodeUtf8(aad)) },
    key,
    toBuffer(plain),
  );
  return new Uint8Array(buffer);
}

/** AES-GCM 解密；认证失败抛 OperationError（K4 归为「密码错误或文件已损坏」） */
async function gcmDecrypt(
  rawKey: Uint8Array,
  iv: Uint8Array,
  cipher: Uint8Array,
  aad: string,
): Promise<Uint8Array> {
  const key = await aesKey(rawKey);
  try {
    const buffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBuffer(iv), additionalData: toBuffer(encodeUtf8(aad)) },
      key,
      toBuffer(cipher),
    );
    return new Uint8Array(buffer);
  } catch (err) {
    console.warn('[encrypt] 解密失败（密码错误或数据被篡改）', err);
    throw new Error('errPasswordWrong');
  }
}

/* ------------------------------------------------------------------ */
/* vault                                                              */
/* ------------------------------------------------------------------ */

/**
 * 生成 DEK 并用密码派生的 KEK 包裹，得到 vault 与明文 DEK。
 * @param cacheKek 是否把 KEK 一起缓存（对应「本机记住密钥」）
 */
export async function createVault(
  password: string,
  cacheKek: boolean,
  iterations: number = CRYPTO.iterations,
): Promise<{ vault: EncryptedKeyVault; dek: Uint8Array }> {
  const salt = randomBytes(CRYPTO.saltBytes);
  const kek = await deriveKekBytes(password, salt, iterations);
  const dek = randomBytes(32);
  const dekIv = randomBytes(CRYPTO.ivBytes);
  const wrapped = await gcmEncrypt(kek, dekIv, dek, CRYPTO.aad);

  const vault: EncryptedKeyVault = {
    kekSalt: bytesToBase64(salt),
    wrappedDek: bytesToBase64(wrapped),
    dekIv: bytesToBase64(dekIv),
    iterations,
    ...(cacheKek ? { kek: bytesToBase64(kek) } : {}),
  };
  return { vault, dek };
}

/** 用 vault 缓存的 KEK 解包 DEK（免输入密码） */
async function unwrapWithCachedKek(vault: EncryptedKeyVault): Promise<Uint8Array | null> {
  if (!vault.kek) return null;
  const kek = base64ToBytes(vault.kek);
  const wrapped = base64ToBytes(vault.wrappedDek);
  const iv = base64ToBytes(vault.dekIv);
  try {
    return await gcmDecrypt(kek, iv, wrapped, CRYPTO.aad);
  } catch {
    return null;
  }
}

/** 用密码派生 KEK 解包 DEK */
async function unwrapWithPassword(vault: EncryptedKeyVault, password: string): Promise<Uint8Array> {
  const salt = base64ToBytes(vault.kekSalt);
  const kek = await deriveKekBytes(password, salt, vault.iterations);
  const wrapped = base64ToBytes(vault.wrappedDek);
  const iv = base64ToBytes(vault.dekIv);
  return gcmDecrypt(kek, iv, wrapped, CRYPTO.aad);
}

/** 解包 vault 的 DEK：优先用本机缓存的 KEK，其次用密码 */
export async function unlockVault(vault: EncryptedKeyVault, password?: string): Promise<Uint8Array> {
  const cached = await unwrapWithCachedKek(vault);
  if (cached) return cached;
  if (!password) throw new Error('errPasswordRequired');
  return unwrapWithPassword(vault, password);
}

/** 读取本机 vault */
export async function getVault(): Promise<EncryptedKeyVault | undefined> {
  const db = await readDb();
  return db.secretVault;
}

/** 写入本机 vault；传 undefined 表示删除该键 */
export async function saveVault(vault: EncryptedKeyVault | undefined): Promise<void> {
  await withWriteLock(async () => {
    if (!vault) {
      await removeItems([STORAGE_KEYS.secretVault]);
      return;
    }
    await applyPatch({ secretVault: vault });
  });
}

/** 清除本机记住的密钥（不影响凭原密码从备份文件恢复） */
export async function clearVault(): Promise<void> {
  await saveVault(undefined);
}

/**
 * 开启加密：生成 DEK + vault 并落盘（rememberOnDevice 决定是否缓存 KEK）。
 * 返回描述块，供当前这次导出/上传直接使用。
 */
export async function setupVault(password: string): Promise<CryptoDescriptor> {
  const db = await readDb();
  const cacheKek = db.settings.encryption.rememberOnDevice;
  const { vault } = await createVault(password, cacheKek);
  await saveVault(vault);
  return descriptorFromVault(vault);
}

/** 修改密码：校验原密码解包 DEK，再用新密码重新包裹 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const db = await readDb();
  const vault = db.secretVault;
  if (!vault) throw new Error('errVaultMissing');
  let dek: Uint8Array;
  try {
    dek = await unwrapWithPassword(vault, oldPassword);
  } catch {
    throw new Error('errPasswordWrong');
  }

  const iterations = vault.iterations;
  const salt = randomBytes(CRYPTO.saltBytes);
  const kek = await deriveKekBytes(newPassword, salt, iterations);
  const dekIv = randomBytes(CRYPTO.ivBytes);
  const wrapped = await gcmEncrypt(kek, dekIv, dek, CRYPTO.aad);
  const next: EncryptedKeyVault = {
    kekSalt: bytesToBase64(salt),
    wrappedDek: bytesToBase64(wrapped),
    dekIv: bytesToBase64(dekIv),
    iterations,
    ...(db.settings.encryption.rememberOnDevice ? { kek: bytesToBase64(kek) } : {}),
  };
  await saveVault(next);
}

/** 由 vault 组装描述块的公共字段（payloadIv/salt 在加密时补齐） */
function descriptorFromVault(vault: EncryptedKeyVault): CryptoDescriptor {
  return {
    kdf: CRYPTO.kdf,
    iterations: vault.iterations,
    salt: vault.kekSalt,
    dekCipher: CRYPTO.dekCipher,
    dekIv: vault.dekIv,
    wrappedDek: vault.wrappedDek,
    payloadIv: '',
    aad: CRYPTO.aad,
  };
}

/* ------------------------------------------------------------------ */
/* 备份加解密                                                          */
/* ------------------------------------------------------------------ */

/**
 * 加密明文载荷。
 * 优先用本机 vault 的 DEK；vault 缺失时用传入密码新建 DEK 与 vault（K4 / E2）。
 */
export async function encryptPayload(
  payload: PlainBackupPayload,
  password?: string,
): Promise<{ payload: string; crypto: CryptoDescriptor }> {
  const db = await readDb();
  const vault = db.secretVault;

  let dek: Uint8Array;
  let descriptor: CryptoDescriptor;

  if (vault) {
    dek = await unlockVault(vault, password);
    descriptor = descriptorFromVault(vault);
  } else {
    if (!password) throw new Error('errPasswordRequired');
    const created = await createVault(password, db.settings.encryption.rememberOnDevice);
    dek = created.dek;
    descriptor = descriptorFromVault(created.vault);
    // 重建本机缓存，使后续定时备份可无人值守
    await saveVault(created.vault);
  }

  const iv = randomBytes(CRYPTO.ivBytes);
  const cipher = await gcmEncrypt(dek, iv, encodeUtf8(JSON.stringify(payload)), descriptor.aad);
  return {
    payload: bytesToBase64(cipher),
    crypto: { ...descriptor, payloadIv: bytesToBase64(iv) },
  };
}

/** 3.3 结构互斥校验；不满足一律拒绝导入/恢复 */
export function assertBackupStructure(file: unknown): asserts file is BackupFile {
  if (!file || typeof file !== 'object') throw new Error('errBackupStructure');
  const candidate = file as Partial<BackupFile>;
  if (candidate.format !== 'bookvault-backup') throw new Error('errBackupStructure');
  if (candidate.version !== 1) throw new Error('errBackupStructure');
  if (typeof candidate.exportedAt !== 'number' || !Number.isFinite(candidate.exportedAt)) {
    throw new Error('errBackupStructure');
  }
  if (typeof candidate.count !== 'number') throw new Error('errBackupStructure');

  if (candidate.encrypted === false) {
    if (!Array.isArray(candidate.bookmarks)) throw new Error('errBackupStructure');
    if (candidate.crypto !== undefined || candidate.payload !== undefined) {
      throw new Error('errBackupStructure');
    }
    return;
  }
  if (candidate.encrypted === true) {
    if (typeof candidate.payload !== 'string' || !candidate.payload) {
      throw new Error('errBackupStructure');
    }
    if (!candidate.crypto) throw new Error('errBackupCryptoMissing');
    if (
      candidate.bookmarks !== undefined ||
      candidate.proxyBlocklist !== undefined ||
      candidate.bookmarkMeta !== undefined ||
      candidate.orphanMeta !== undefined
    ) {
      throw new Error('errBackupStructure');
    }
    assertCryptoDescriptor(candidate.crypto);
    return;
  }
  throw new Error('errBackupStructure');
}

/** `crypto` 块的必需字段校验（K4：缺字段给出专门提示） */
function assertCryptoDescriptor(descriptor: CryptoDescriptor): void {
  const required: Array<keyof CryptoDescriptor> = [
    'kdf',
    'iterations',
    'salt',
    'dekCipher',
    'dekIv',
    'wrappedDek',
    'payloadIv',
    'aad',
  ];
  for (const key of required) {
    const value = descriptor[key];
    if (value === undefined || value === null || value === '') {
      throw new Error('errBackupCryptoMissing');
    }
  }
}

/**
 * 解密备份（K4）：
 * 1. 本机 vault 存在 → 用缓存 KEK 解包 DEK；
 * 2. vault 缺失/失效 → 用文件内 crypto 参数 + 用户密码解包；
 * 3. 明文备份直接返回。
 */
export async function decryptPayload(file: BackupFile, password?: string): Promise<PlainBackupPayload> {
  assertBackupStructure(file);
  if (!file.encrypted) {
    return {
      bookmarks: file.bookmarks ?? [],
      proxyBlocklist: file.proxyBlocklist ?? [],
      bookmarkMeta: file.bookmarkMeta ?? {},
    };
  }

  const descriptor = file.crypto;
  if (!descriptor || !file.payload) throw new Error('errBackupCryptoMissing');

  const db = await readDb();
  const vault = db.secretVault;
  const aad = descriptor.aad || CRYPTO.aad;

  let dek: Uint8Array | null = null;
  if (vault) {
    // 只信任 vault 里缓存的 KEK；解不开再退回密码
    if (vault.kek) {
      const kek = base64ToBytes(vault.kek);
      try {
        dek = await gcmDecrypt(
          kek,
          base64ToBytes(vault.dekIv),
          base64ToBytes(vault.wrappedDek),
          CRYPTO.aad,
        );
      } catch {
        dek = null;
      }
    }
  }

  if (!dek) {
    if (!password) throw new Error('errPasswordRequired');
    const kek = await deriveKekBytes(password, base64ToBytes(descriptor.salt), descriptor.iterations);
    dek = await gcmDecrypt(
      kek,
      base64ToBytes(descriptor.dekIv),
      base64ToBytes(descriptor.wrappedDek),
      aad,
    );
  }

  const plain = await gcmDecrypt(
    dek,
    base64ToBytes(descriptor.payloadIv),
    base64ToBytes(file.payload),
    aad,
  );

  try {
    const parsed = JSON.parse(decodeUtf8(plain)) as PlainBackupPayload;
    return {
      bookmarks: parsed.bookmarks ?? [],
      proxyBlocklist: parsed.proxyBlocklist ?? [],
      bookmarkMeta: parsed.bookmarkMeta ?? {},
    };
  } catch (err) {
    console.error('[encrypt] 载荷解析失败', err);
    throw new Error('errBackupCorrupted');
  }
}

/** 组装备份文件（明文分支） */
export function buildPlainBackupFile(
  payload: PlainBackupPayload,
  exportedAt: number,
  exportedAtLocal: string,
): BackupFile {
  return {
    format: 'bookvault-backup',
    version: 1,
    exportedAt,
    exportedAtLocal,
    count: countBackupBookmarks(payload.bookmarks),
    encrypted: false,
    bookmarks: payload.bookmarks,
    proxyBlocklist: payload.proxyBlocklist,
    bookmarkMeta: payload.bookmarkMeta,
    orphanMeta: payload.orphanMeta,
  };
}

/** 组装备份文件（加密分支） */
export function buildEncryptedBackupFile(
  encrypted: { payload: string; crypto: CryptoDescriptor },
  count: number,
  exportedAt: number,
  exportedAtLocal: string,
): BackupFile {
  return {
    format: 'bookvault-backup',
    version: 1,
    exportedAt,
    exportedAtLocal,
    count,
    encrypted: true,
    crypto: encrypted.crypto,
    payload: encrypted.payload,
  };
}

/** 统计树内书签数（不含文件夹） */
export function countBackupBookmarks(tree: BookmarkTree): number {
  let count = 0;
  const walk = (node: chrome.bookmarks.BookmarkTreeNode): void => {
    if (node.url !== undefined) {
      count += 1;
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of tree) walk(root);
  return count;
}
