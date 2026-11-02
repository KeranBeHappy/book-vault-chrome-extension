/**
 * 签仓（BookVault）· 全局数据模型
 *
 * 依据：《Chrome书签管理扩展-开发需求文档-V1.1》第 3 节。
 * 本文件只声明类型，不含任何运行时逻辑；运行时默认值见 `shared/constants.ts`。
 *
 * 约定：
 * 1. 书签节点的权威数据始终来自 `chrome.bookmarks`，本地不存第二份常驻副本；
 *    本地只存「辅助状态」——规则、标签备注、检测结果、快照、回收站、任务状态。
 * 2. 所有时间戳统一为 epoch 毫秒（number）。
 * 3. 所有以 `Record<string, T>` 形式出现的键，语义见字段注释，禁止隐式换键。
 */

/** 书签节点：直接复用 Chrome 原生类型（含 id / parentId / title / url / children / dateAdded） */
export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

/** 整棵书签树：`chrome.bookmarks.getTree()` 的返回，注意是数组而不是单个节点 */
export type BookmarkTree = chrome.bookmarks.BookmarkTreeNode[];

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

/** 主题模式 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 解析后的实际主题（system 已消解为 light/dark） */
export type ResolvedTheme = 'light' | 'dark';

/** 界面语言模式；`system` 时取 `chrome.i18n.getUILanguage()` 解析 */
export type LanguageMode = 'system' | 'zh_CN' | 'en';

/** 实际生效的语言（解析后只有两种） */
export type ResolvedLanguage = 'zh_CN' | 'en';

/** WebDAV 连接配置 */
export interface WebDavSettings {
  enabled: boolean;
  /** 默认 https://dav.jianguoyun.com/dav/ */
  server: string;
  /** 坚果云账号邮箱 */
  username: string;
  /** 第三方应用授权码（非登录密码）；注意：以明文存于 storage.local，见 9 节第 9 条 */
  password: string;
  /** 远端目录，以 `/` 开头结尾，默认 /书签备份/ */
  remoteDir: string;
}

/** 云端备份加密配置 */
export interface EncryptionSettings {
  /** 默认 false：云端备份与导出 JSON 是否加密；本地快照恒为明文 */
  enabled: boolean;
  /** 默认 true：本机记住 KEK 包裹后的 DEK，使定时自动备份可无人值守 */
  rememberOnDevice: boolean;
}

/** 用户设置（单一对象，整体存于 LocalDB.settings） */
export interface Settings {
  theme: ThemeMode;
  language: LanguageMode;
  /** 检测并发数，默认 6，范围 1–12 */
  concurrency: number;
  /** 单条请求超时（秒），默认 10，范围 3–60 */
  timeoutSec: number;
  /** 本地快照保留份数，默认 10，范围 1–100 */
  localSnapshotKeep: number;
  /** 云端备份保留份数，默认 10，范围 1–100 */
  cloudSnapshotKeep: number;
  /** 回收站保留条数，默认 50，范围 1–500 */
  recycleKeep: number;
  /** 标题相似度阈值，默认 0.85，范围 0.50–1.00 */
  titleSimilarityThreshold: number;
  /** 每日自动备份开关，默认 true */
  autoBackupDaily: boolean;
  /** 每日备份触发整点（本地时区），默认 3，范围 0–23；实际执行窗口为 [hour, hour+3) */
  autoBackupHour: number;
  encryption: EncryptionSettings;
  webdav: WebDavSettings;
}

/* ------------------------------------------------------------------ */
/* 标签与备注                                                          */
/* ------------------------------------------------------------------ */

/** 书签的扩展本地附加数据，按 bookmarkId 关联，不写回原生书签 */
export interface BookmarkMeta {
  /** 标签，去重、大小写不敏感、单标签 ≤ 32 字符、每书签 ≤ 50 个 */
  tags: string[];
  /** 纯文本备注，多行，≤ 5000 字符 */
  note: string;
}

/* ------------------------------------------------------------------ */
/* 分类规则                                                            */
/* ------------------------------------------------------------------ */

/** 规则类型；匹配优先级按此顺序分桶：domainExact > domainContains > urlKeyword > titleKeyword */
export type RuleType = 'domainExact' | 'domainContains' | 'urlKeyword' | 'titleKeyword';

/** 分类规则；同类型内 order 升序优先，类型优先级不可被 order 跨越（决策 D-6） */
export interface CategoryRule {
  id: string;
  type: RuleType;
  /** 匹配式：域名类作用于 host（小写去 www.）；urlKeyword 作用于完整 URL；titleKeyword 作用于标题 */
  pattern: string;
  /** 目标一级分类名 */
  category: string;
  enabled: boolean;
  /** 同类型内优先级，升序 = 优先 */
  order: number;
}

/* ------------------------------------------------------------------ */
/* 链接检测                                                            */
/* ------------------------------------------------------------------ */

/**
 * 检测状态：
 * - ok / dead / suspect / untested 为三态口径的扩展；
 * - unsupported 表示非 http(s) 书签（javascript:/file: 等），不检测、不统计、不参与批量删除。
 */
export type LinkState = 'ok' | 'dead' | 'suspect' | 'untested' | 'unsupported';

/** 单条书签的检测结果，按 bookmarkId 存于 LocalDB.linkStatus */
export interface LinkStatus {
  status: LinkState;
  /** 最终 HTTP 状态码（跟随重定向后） */
  httpStatus?: number;
  /** 检测时间（epoch ms） */
  checkedAt?: number;
  /** 失败原因：timeout / dns / reset / removed / http401 ... */
  error?: string;
  /** 命中「疑似需代理域名」清单，不作为死链 */
  proxySuspect?: boolean;
  /** 标题刷新结果 */
  titleRefresh: 'unchanged' | 'updated' | 'failed';
}

/* ------------------------------------------------------------------ */
/* 快照与回收站                                                        */
/* ------------------------------------------------------------------ */

/** 快照来源；`restorePre` 为恢复前自动生成，`preOperation` 为不可逆操作前生成 */
export type SnapshotSource = 'manual' | 'preOperation' | 'autoDaily' | 'import' | 'restorePre';

/**
 * 快照元信息。内容不在此处，按 512KB 分片存于 `snapchunk:<id>:<n>`；
 * 恢复前必须用 contentHash 校验完整性，不一致判「快照损坏」并拒绝恢复。
 */
export interface SnapshotMeta {
  /** 同时作为分片键前缀 */
  id: string;
  createdAt: number;
  source: SnapshotSource;
  /** 书签数量 */
  count: number;
  /** 序列化后字节数 */
  bytes: number;
  /** 分片数 */
  chunkCount: number;
  /** 内容整体 SHA-256（hex） */
  contentHash: string;
  /** 本地快照恒为 false；字段保留用于结构兼容 */
  encrypted: boolean;
  note?: string;
}

/**
 * 回收站条目。
 * 计数单位：1 条 = 1 次删除的 1 个顶层节点（删文件夹含整棵子树仍计 1 条）。
 */
export interface RecycleItem {
  id: string;
  /** 删除前的完整节点快照（文件夹含 children） */
  restoredNode: BookmarkNode;
  /** 连带保存整棵子树内所有书签的标签备注，key = 原 bookmarkId */
  meta?: Record<string, BookmarkMeta>;
  /** 原父目录 id；恢复时若已不存在则落到「其他书签」根下 */
  parentId: string;
  deletedAt: number;
}

/* ------------------------------------------------------------------ */
/* 任务引擎                                                            */
/* ------------------------------------------------------------------ */

/** 任务类型 */
export type JobKind = 'linkCheck' | 'titleRefresh';

/** 任务状态机 */
export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';

/**
 * 后台任务状态。SW 被回收后靠 60s 心跳闹钟 + `runtime.onStartup` 续跑，
 * 单次唤醒处理上限 4 分钟或 200 条（决策 D-10）。
 */
export interface JobState {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** 待处理书签 id 列表；超过 5000 条时置空，改用 targetRef 分片存储 */
  targetIds: string[];
  /** 分片键，形如 `jobids:<jobId>` */
  targetRef?: string;
  /** 下一条待处理下标（断点） */
  cursor: number;
  total: number;
  done: number;
  failed: number;
  startedAt: number;
  updatedAt: number;
  lastError?: string;
}

/* ------------------------------------------------------------------ */
/* 操作日志                                                            */
/* ------------------------------------------------------------------ */

/** 可撤销的操作类型 */
export type OpAction =
  | 'move'
  | 'delete'
  | 'rename'
  | 'classify'
  | 'rewrite'
  | 'refreshTitle'
  | 'import'
  | 'capture'
  | 'restore';

/** 单步撤销依据，最多保留 20 条，撤销深度固定 1 层 */
export interface OpRecord {
  id: string;
  action: OpAction;
  createdAt: number;
  affectedIds: string[];
  /** 变更前快照 id，用于撤销回滚 */
  beforeSnapshotId: string;
}

/* ------------------------------------------------------------------ */
/* 密钥                                                                */
/* ------------------------------------------------------------------ */

/** 本机记住的密钥材料：只存 KEK 包裹后的 DEK，不存明文密码与明文 DEK */
export interface EncryptedKeyVault {
  /** PBKDF2 盐，Base64，16 字节 */
  kekSalt: string;
  /** 由 KEK 加密后的 DEK，Base64（AES-256-GCM，含 tag） */
  wrappedDek: string;
  /** 包裹 DEK 所用 IV，Base64，12 字节 */
  dekIv: string;
  /** 与当前 crypto 参数一致，解密时以文件内的值为准 */
  iterations: number;
  /**
   * 本机免输入缓存用的 KEK（Base64，32 字节）。
   *
   * 为什么需要它：K2 要求「定时自动备份无需用户输入密码」，但 KEK 由密码派生，
   * 不缓存一份可直接使用的 KEK 就无法解包 wrappedDek。缓存 KEK 仍满足
   * 「不保存明文密码、不保存明文 DEK」；9 节第 9 条已声明本机缓存可被本机读取。
   * 「清除本机记住的密钥」时连同该字段一并删除。
   */
  kek?: string;
}

/* ------------------------------------------------------------------ */
/* 界面与运行时状态                                                    */
/* ------------------------------------------------------------------ */

/** 管理页一级视图（不做路由，仅切换视图） */
export type ManagerView = 'manager' | 'stats' | 'rules' | 'tags' | 'backup' | 'settings';

/** 界面偏好：只影响展示，丢数据也不影响正确性 */
export interface UiState {
  activeView: ManagerView;
  filter: {
    status?: LinkState;
    tags?: string[];
    keyword?: string;
  };
  sort: {
    key: 'title' | 'domain' | 'dateAdded';
    dir: 'asc' | 'desc';
  };
  expandedFolderIds: string[];
  selectedFolderId?: string;
}

/** 备份去重与待办标记 */
export interface RuntimeState {
  /** 最近一次成功自动备份的本地日期，格式 YYYY-MM-DD，用于同日去重 */
  lastDailyBackupDate?: string;
  /** 上次因 vault 缺失被跳过的云端备份，下次打开扩展时提示补做 */
  pendingCloudBackup?: boolean;
  /** 需要用户补输入备份密码 */
  pendingVaultPrompt?: boolean;
  lastBackupError?: string;
  /** 最近一次成功云端上传时间 */
  lastCloudBackupAt?: number;
  /**
   * 上传后轮转删除失败、待下次上传补删的文件名（E2：单项删除失败不阻断上传，
   * 下次上传最多补删 10 个）。
   */
  pendingCloudDeletes?: string[];
  /** 最近一次「浏览器原生导入结束」的时间，用于提示「建议重新检测」（A9） */
  nativeImportEndedAt?: number;
}

/** 临时标记：跨上下文共享的瞬时状态，必须有 TTL 或显式清理 */
export interface Flags {
  /** 浏览器原生导入进行中，暂停任务引擎与自动备份 */
  importInProgress?: boolean;
  /** 扩展自身删除中，onRemoved 必须忽略这些 id；残留时按 60 秒 TTL 清理 */
  suppressRemovalIds?: string[];
  /** 抑制标记的写入时间，用于 60 秒 TTL 判定 */
  suppressAt?: number;
  /** 统计口径失效，下次进入统计视图时重算 */
  statsDirty?: boolean;
}

/* ------------------------------------------------------------------ */
/* 本地库                                                              */
/* ------------------------------------------------------------------ */

/**
 * `chrome.storage.local` 的完整结构，键名固定为 `db`（见 STORAGE_KEYS）。
 * schemaVersion 从 1 起，升级必须逐级迁移，且迁移前生成快照。
 */
export interface LocalDB {
  schemaVersion: number;
  settings: Settings;
  rules: CategoryRule[];
  /** 疑似需代理域名清单 */
  proxyBlocklist: string[];
  /** 检测结果，key = bookmarkId */
  linkStatus: Record<string, LinkStatus>;
  /** 标签备注，key = bookmarkId */
  bookmarkMeta: Record<string, BookmarkMeta>;
  /** 无法重绑的挂起 meta，key = hash(归一化 URL) 的前 40 位 hex */
  orphanMeta: Record<string, BookmarkMeta>;
  recycleBin: RecycleItem[];
  /** 仅元信息；内容在分片键中 */
  localSnapshots: SnapshotMeta[];
  /** 任务状态，key = jobId */
  jobs: Record<string, JobState>;
  /** 最多 20 条 */
  opLog: OpRecord[];
  uiState: UiState;
  runtime: RuntimeState;
  flags: Flags;
  secretVault?: EncryptedKeyVault;
}

/* ------------------------------------------------------------------ */
/* 备份文件                                                            */
/* ------------------------------------------------------------------ */

/** 加密参数描述块，随每份加密备份保存；解密时以文件中的值为准（决策 D-9） */
export interface CryptoDescriptor {
  kdf: 'PBKDF2-SHA256';
  /** 默认 600000；实测后可按 T-2 结论下调并写实值 */
  iterations: number;
  /** Base64，16 字节 */
  salt: string;
  dekCipher: 'AES-256-GCM';
  /** Base64，12 字节 */
  dekIv: string;
  /** Base64，含 16 字节 tag */
  wrappedDek: string;
  /** Base64，12 字节 */
  payloadIv: string;
  /** 固定为 bookvault-backup-v1 */
  aad: 'bookvault-backup-v1';
}

/**
 * WebDAV 云端备份 / 自有 JSON 导出的通用结构。
 * 结构互斥：encrypted=false 时必须有 bookmarks 且不得有 crypto/payload；
 *          encrypted=true 时必须有 crypto/payload 且不得有明文块。
 */
export interface BackupFile {
  format: 'bookvault-backup';
  version: 1;
  /** epoch ms，权威时间 */
  exportedAt: number;
  /** ISO 带时区偏移，仅供人读 */
  exportedAtLocal: string;
  count: number;
  encrypted: boolean;
  crypto?: CryptoDescriptor;
  /** Base64(AES-256-GCM 密文，含 tag) */
  payload?: string;
  bookmarks?: BookmarkTree;
  rules?: CategoryRule[];
  proxyBlocklist?: string[];
  bookmarkMeta?: Record<string, BookmarkMeta>;
}

/* ------------------------------------------------------------------ */
/* 视图层辅助类型                                                      */
/* ------------------------------------------------------------------ */

/** 分类预览条目：预览阶段的归属以 manual 为准，且只在当前会话有效 */
export interface ClassificationPreviewItem {
  bookmarkId: string;
  title: string;
  url: string;
  /** 命中的规则 id；未命中为 null（归入「待分类」） */
  ruleId: string | null;
  category: string;
  /** 用户手动拖拽调整过 */
  manual: boolean;
}

/** 重复组：URL 归一化后书签数 ≥ 2 的组 */
export interface DuplicateGroup {
  /** 归一化后的 URL，作为组标识 */
  normalizedUrl: string;
  bookmarkIds: string[];
}

/** 检测任务进度快照，供页面轮询展示 */
export interface JobProgress {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  done: number;
  total: number;
  failed: number;
}

/* ------------------------------------------------------------------ */
/* 快照内容 / 统计 / 导入预览                                          */
/* ------------------------------------------------------------------ */

/**
 * 快照实际内容（D1）：受管根子树 + 规则 + 代理清单 + bookmarkMeta + orphanMeta。
 * 序列化后按 512KB 分片存储，`SnapshotMeta` 只描述元信息。
 */
export interface SnapshotContent {
  bookmarks: BookmarkTree;
  rules: CategoryRule[];
  proxyBlocklist: string[];
  bookmarkMeta: Record<string, BookmarkMeta>;
  orphanMeta: Record<string, BookmarkMeta>;
}

/** 统计概览（A7 字段定义固定） */
export interface StatsSummary {
  /** 受管两根子树内 url 非空的节点数 */
  total: number;
  /** 4.2 归一化后书签数 ≥ 2 的组数 */
  duplicateGroups: number;
  /** 死链数；未检测时为 null，界面显示「—」 */
  dead: number | null;
  /** 存疑数；未检测时为 null */
  suspect: number | null;
  /** 一级文件夹书签数，key = 文件夹名 */
  categories: Array<{ name: string; count: number }>;
  /** 递归不含任何书签的文件夹数（不含根） */
  emptyFolders: number;
  /** bookmarkMeta 中出现过的去重标签数 */
  tagCount: number;
}

/** CSV 报表的一行（B8 字段顺序固定） */
export interface CsvRow {
  title: string;
  url: string;
  domain: string;
  status: string;
  httpStatus: number | null;
  checkedAt: number | null;
  error: string;
  proxySuspect: boolean;
  tags: string;
  note: string;
}

/** WebDAV 目录中的一个备份文件（E3） */
export interface RemoteBackupEntry {
  fileName: string;
  /** 从文件名解析出的时间戳（毫秒）；无法解析为 null */
  exportedAt: number | null;
  /** PROPFIND 返回的字节数；缺失为 null */
  size: number | null;
  /** 文件名是否匹配备份命名正则；不匹配者标「未知格式」且禁止恢复 */
  recognized: boolean;
}

/** WebDAV 连接测试结果（E1：必须包含最终 URL、方法、状态码、耗时、响应体前 200 字符） */
export interface WebDavTestResult {
  ok: boolean;
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  bodyPreview: string;
  /** 已本地化前的错误码，界面用 t() 映射成文案 */
  code:
    | 'ok'
    | 'unauthorized'
    | 'forbidden'
    | 'notFound'
    | 'rateLimited'
    | 'serverError'
    | 'network'
    | 'unknown';
  /** 调用方能拿到的额外信息，如 Retry-After、远端文件数 */
  detail?: string;
  fileCount?: number;
}

/** 导入解析结果（两阶段：先全量解析校验，再写入） */
export interface ImportPreview {
  kind: 'json' | 'html';
  /** 可写入的书签数（已剔除重复与非法项） */
  importable: number;
  /** 因 URL 重复被跳过的条数 */
  duplicates: number;
  /** 非法／无法解析被跳过的条数 */
  invalid: number;
  /** 解析出的规则数（仅 JSON） */
  rules: number;
  /** 解析出的标签备注条数（仅 JSON） */
  metaCount: number;
  /** 是否检测到加密（加密 JSON 需要先解密） */
  encrypted: boolean;
}

/** 导入执行选项（G2 落点） */
export interface ImportOptions {
  /** 目标文件夹 id；为空表示在「其他书签」根下新建「导入 YYYYMMDD-HHmmss」 */
  targetFolderId?: string;
  /** JSON 备份的解密密码（本机 vault 缺失时必填） */
  password?: string;
}

/** 批量改写结果（A5 结果弹窗必须列出成功数、跳过数与跳过明细） */
export interface RewriteResult {
  updated: number;
  skipped: Array<{ id: string; title: string; reason: string }>;
}

/** 当前窗口标签收藏的候选条目（J1，仅内存） */
export interface CaptureCandidate {
  title: string;
  url: string;
  /** 归一化后的 URL，用于与现有书签比对 */
  normalized: string;
  selected: boolean;
}

/** 收藏执行结果（J2：成功 / 跳过 / 排除） */
export interface CaptureResult {
  created: number;
  duplicates: number;
  failed: Array<{ title: string; reason: string }>;
}
