/**
 * 通用工具：时间格式化、UUID、Base64、SHA-256、延时。
 *
 * 全部只依赖 Web 标准 API，SW 与页面均可调用（不使用 DOM）。
 */

/** 等待指定毫秒 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 生成随机 id（快照 / 任务 / 回收站条目 / opLog 共用） */
export function uid(prefix = ''): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}${Date.now().toString(36)}${random}`;
}

/** 两位补零 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** 本地时区 `YYYY-MM-DD`（用于每日备份同日去重） */
export function formatLocalDate(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地时区 `YYYY-MM-DD HH:mm:ss`（CSV、界面展示通用） */
export function formatLocalDateTime(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${formatLocalDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 本地时区 `YYYYMMDD-HHmmss`（备份文件名、导入文件夹名通用） */
export function formatLocalStamp(ts: number = Date.now()): string {
  const d = new Date(ts);
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${date}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 带时区偏移的 ISO 字符串（备份文件 exportedAtLocal，仅供人读） */
export function formatIsoWithOffset(ts: number = Date.now()): string {
  const d = new Date(ts);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${formatLocalDate(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Uint8Array → 标准 Base64（无换行、无 data URL 前缀） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    // 分段避免 apply 参数过多导致栈溢出
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** 标准 Base64 → Uint8Array */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 字符串 → UTF-8 字节 */
export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** UTF-8 字节 → 字符串 */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** SHA-256（hex，小写） */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 截断文本，避免错误提示过长 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
