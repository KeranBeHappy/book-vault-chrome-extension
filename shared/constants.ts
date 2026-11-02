/**
 * 全局常量与默认值。
 *
 * 依据：《Chrome书签管理扩展-开发需求文档-V1.1》第 10 节「默认参数表」与 3.4 内置分类。
 * 原则：所有「魔法值」集中在此，业务代码不得内联字面量。
 */

import type { CategoryRule, Settings } from './types';

/**
 * storage.local 的键名约定。
 *
 * 为什么按段拆分而不是整库一个键：9 节第 13 条要求「单次 storage.local.set
 * 载荷 ≤ 1MB」。整库写会轻易超标，因此每个 LocalDB 字段独立成键；
 * `linkStatus` / `bookmarkMeta` / `orphanMeta` 是 Map 型，超过 1MB 时自动分片。
 */
export const STORAGE_KEYS = {
  schemaVersion: 'schemaVersion',
  settings: 'settings',
  rules: 'rules',
  proxyBlocklist: 'proxyBlocklist',
  linkStatus: 'linkStatus',
  bookmarkMeta: 'bookmarkMeta',
  orphanMeta: 'orphanMeta',
  recycleBin: 'recycleBin',
  /** 与 LocalDB.localSnapshots 对应，兼作 SW 冷启动的元信息镜像 */
  localSnapshots: 'snapmeta',
  jobs: 'jobs',
  opLog: 'opLog',
  uiState: 'uiState',
  runtime: 'runtime',
  flags: 'flags',
  secretVault: 'secretVault',
  /** 快照分片：`snapchunk:<snapshotId>:<n>` */
  snapshotChunkPrefix: 'snapchunk:',
  /** 任务 id 分片：`jobids:<jobId>` */
  jobIdsPrefix: 'jobids:',
  /** 任务结果分片：`jobresult:<jobId>`（标题刷新抓到的新标题） */
  jobResultPrefix: 'jobresult:',
  /** 分片 Map 的索引后缀：`<name>:meta` → { shards: string[] } */
  shardMetaSuffix: ':meta',
  /** 分片 Map 的数据键前缀：`<name>:p<n>` */
  shardChunkSuffix: ':p',
} as const;

/** 分片 Map 型字段名（其余字段单键存储） */
export const SHARDED_SECTIONS = ['linkStatus', 'bookmarkMeta', 'orphanMeta'] as const;

/** 闹钟名 */
export const ALARMS = {
  /** 任务续跑心跳，周期 1 分钟 */
  jobTick: 'job-tick',
  /** 每日自动备份 */
  dailyBackup: 'daily-backup',
} as const;

/** 右键菜单 id */
export const CONTEXT_MENU_IDS = {
  addBookmark: 'bv-add-bookmark',
} as const;

/** 页面路径（扩展内相对路径） */
export const PAGES = {
  manager: 'manager.html',
  capture: 'capture.html',
} as const;

/** capture 小窗尺寸（文档 2.1 固定 420×560） */
export const CAPTURE_WINDOW = { width: 420, height: 560 } as const;

/** 默认设置：与文档第 10 节一一对应 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'system',
  concurrency: 6,
  timeoutSec: 10,
  localSnapshotKeep: 10,
  cloudSnapshotKeep: 10,
  recycleKeep: 50,
  titleSimilarityThreshold: 0.85,
  autoBackupDaily: true,
  autoBackupHour: 3,
  encryption: {
    enabled: false,
    rememberOnDevice: true,
  },
  webdav: {
    enabled: false,
    server: 'https://dav.jianguoyun.com/dav/',
    username: '',
    password: '',
    remoteDir: '/书签备份/',
  },
};

/** 设置项取值范围：界面输入与导入校验共用 */
export const SETTINGS_BOUNDS = {
  concurrency: { min: 1, max: 12 },
  timeoutSec: { min: 3, max: 60 },
  localSnapshotKeep: { min: 1, max: 100 },
  cloudSnapshotKeep: { min: 1, max: 100 },
  recycleKeep: { min: 1, max: 500 },
  titleSimilarityThreshold: { min: 0.5, max: 1 },
  autoBackupHour: { min: 0, max: 23 },
} as const;

/** 快照分片大小：单键超过 512KB 容易整库写入失败 */
export const SNAPSHOT_CHUNK_BYTES = 512 * 1024;

/** 单次 storage.local.set 载荷上限（9 节第 13 条），超出必须分片 */
export const STORAGE_WRITE_LIMIT_BYTES = 1024 * 1024;

/** 任务引擎单次唤醒预算：先到者为准，随后强制让出，避免撞上 SW 5 分钟硬上限 */
export const JOB_BUDGET = {
  maxDurationMs: 4 * 60 * 1000,
  maxItems: 200,
} as const;

/** 任务状态写入 storage 的节流：每 25 条或每 3 秒 flush 一次 */
export const STATUS_FLUSH = {
  everyItems: 25,
  everyMs: 3000,
} as const;

/** 任务 id 列表超过该数量时改为分片存储（3.2 JobState.targetRef） */
export const JOB_TARGET_INLINE_LIMIT = 5000;

/** 检测/抓取请求上限 */
export const HTTP_LIMITS = {
  /** 标题抓取最多读 256KB 后中止 */
  titleMaxBytes: 256 * 1024,
  /** 字符集嗅探只看前 1024 字节 */
  charsetSniffBytes: 1024,
  /** 批量打开标签上限 */
  maxOpenTabs: 20,
  /** 原生删除抑制标记 TTL */
  suppressTtlMs: 60 * 1000,
  /** 连接测试响应体预览长度 */
  bodyPreviewChars: 200,
} as const;

/** opLog 保留条数 */
export const OP_LOG_KEEP = 20;

/** 内容上限 */
export const CONTENT_LIMITS = {
  noteMaxChars: 5000,
  tagMaxChars: 32,
  tagsPerBookmark: 50,
} as const;

/** 备份文件名规则：轮转只处理匹配该正则的文件，目录内其他文件一律不动 */
export const BACKUP_FILE_PATTERN = /^bookmarks-backup-\d{8}-\d{6}(-\d+)?\.json$/;
const BACKUP_FILE_CAPTURE = /^bookmarks-backup-(\d{8})-(\d{6})(?:-(\d+))?\.json$/;

/** WebDAV 上传失败退避重试间隔（E2：2s、8s、30s，最多 3 次） */
export const WEBDAV_RETRY_DELAYS = [2000, 8000, 30000] as const;

/** 单次上传后补删失败文件的上限（E2） */
export const WEBDAV_PENDING_DELETE_LIMIT = 10;

/** 加密参数（K3；iterations 可被 T-2 实测结论下调，读出时以文件为准） */
export const CRYPTO = {
  kdf: 'PBKDF2-SHA256',
  dekCipher: 'AES-256-GCM',
  iterations: 600000,
  saltBytes: 16,
  ivBytes: 12,
  aad: 'bookvault-backup-v1',
} as const;

/** 内置默认分类（一级平铺） */
export const DEFAULT_CATEGORIES = [
  '视频',
  '社交',
  '购物',
  '工具',
  '资讯',
  '开发',
  '金融',
  '学习',
  '娱乐',
  '待分类',
] as const;

/** 「待分类」桶名：无规则命中时归入 */
export const UNCATEGORIZED = '待分类';

/**
 * 内置示例规则（3.4「每类附带常见域名示例规则」）。
 * 用 domainContains + order 递增，用户可在界面增删改。
 */
const RULE_SEEDS: Array<[string, string[]]> = [
  ['视频', ['bilibili.com', 'youtube.com', 'youku.com', 'iqiyi.com', 'v.qq.com', 'vimeo.com']],
  ['社交', ['weibo.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'douban.com']],
  ['购物', ['taobao.com', 'tmall.com', 'jd.com', 'amazon.com', 'pinduoduo.com']],
  ['工具', ['notion.so', 'figma.com', 'trello.com', 'docs.google.com', 'feishu.cn']],
  ['资讯', ['36kr.com', 'sspai.com', 'thepaper.cn', 'news.ycombinator.com']],
  ['开发', ['github.com', 'gitlab.com', 'stackoverflow.com', 'developer.mozilla.org', 'npmjs.com']],
  ['金融', ['eastmoney.com', 'xueqiu.com', 'coinmarketcap.com', 'alipay.com']],
  ['学习', ['coursera.org', 'udemy.com', 'khanacademy.org', 'jianshu.com']],
  ['娱乐', ['netflix.com', 'spotify.com', 'steampowered.com', 'bilibili.com/live']],
];

/** 生成内置规则：id 固定为 `default-<category>-<i>`，便于去重与迁移 */
export const DEFAULT_RULES: CategoryRule[] = RULE_SEEDS.flatMap(([category, patterns]) =>
  patterns.map((pattern, index) => ({
    id: `default-${category}-${index + 1}`,
    type: 'domainContains' as const,
    pattern,
    category,
    enabled: true,
    order: index + 1,
  })),
);

/** 受管根：书签栏 / 其他书签；「移动设备书签」隐藏且不可操作 */
export const MANAGED_ROOT_IDS = ['1', '2'] as const;

/** 移动设备书签根 id，必须排除在一切写操作之外 */
export const MOBILE_ROOT_ID = '3';

/** 根节点识别的标题兜底（id 不存在时按标题匹配，4.3） */
export const ROOT_TITLE_FALLBACK = {
  bar: ['书签栏', 'Bookmarks Bar', 'Bookmarks bar'],
  other: ['其他书签', 'Other Bookmarks', 'Other bookmarks'],
} as const;

/** 不可收藏的协议前缀（J1 过滤规则） */
export const UNSUPPORTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'file:',
  'devtools:',
  'view-source:',
  'data:',
  'javascript:',
] as const;

/** URL 归一化时剔除的跟踪参数（4.2 第 5 条；`utm_*` 前缀另行处理） */
export const TRACKING_PARAMS = [
  'fbclid',
  'gclid',
  'spm',
  'ref',
  'from',
  'share_source',
  'share_from',
  'sourcetype',
  'source',
  'scm',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  'msclkid',
  '_hsenc',
  '_hsmi',
  'rb_clickid',
  's_cid',
  'campaign',
  'campaignid',
] as const;

/** 把备份文件名解析成 epoch 毫秒；不匹配返回 null（E5：以文件名为权威） */
export function parseBackupFileName(fileName: string): number | null {
  const match = BACKUP_FILE_CAPTURE.exec(fileName);
  if (!match) return null;
  const [, date, time] = match;
  if (!date || !time) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  const ts = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(ts) ? ts : null;
}
