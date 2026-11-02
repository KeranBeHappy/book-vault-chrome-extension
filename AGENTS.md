# AGENTS.md — 签仓 BookVault

写给在本仓库工作的 AI 编码助手（与人）。内容基于本项目实际情况，不是模板。

## 项目概览

- **是什么**：Chrome 114+ 的书签管理扩展（Manifest V3），本地优先，书签数据以浏览器原生书签库为权威源。
- **需求依据**：`Chrome书签管理扩展-开发需求文档-V1.1.md`（在用户 Downloads 目录，不在本仓库）。实现以该文档为准；文档与本文件冲突时，先问用户。
- **形态**：WXT 构建的 Vue3 + TS 工程，**有构建步骤**。产物在 `.output/chrome-mv3/`，加载扩展时选这个目录。
- **隐私边界**：除用户自配的坚果云 WebDAV 外，书签数据不上传任何第三方；`tabs` 权限只在用户触发收藏时即时读取，不落盘、不监听、不采集历史。

## 常用命令

```bash
pnpm dev            # 开发模式
pnpm build          # 构建
pnpm compile        # vue-tsc 类型检查（改动后必须过）
pnpm i18n:check     # 语言包一致性（新增文案后必须过）
```

验证手段 = `pnpm compile` + `pnpm i18n:check` + `pnpm build` + 加载扩展实测。

## 沟通约定（用户明确要求）

- 只读查询直接答；**改代码 / 改文档 / 跑命令 / 撤销操作前先问**。
- 动手前一次性问完边界与验收方式，之后连续做完，中间不打断（除非遇到真岔路）。
- 不主动 commit / amend / force push。

## 代码风格（用户明确要求）

- 2 空格缩进；单引号；语句末尾分号；每行不超过 100 字符。
- **函数上方必须有中文 JSDoc**；复杂逻辑写中文行内注释，说明「为什么」。
- 可能出错的代码用 try-catch：详细错误进 console，给用户看的是友好文案。

## 关键不变量

1. **书签不落副本**：`chrome.bookmarks` 是唯一权威源，本地只存规则/标签/状态/快照。
2. **写操作统一走 SW**：页面发 `BvRequest`（`shared/messages.ts`），SW 内用 Promise 队列串行化；页面不直接写 storage 或 bookmarks。
3. **不可逆操作固定序列**：算影响 → 生成快照 → 二次确认 → 执行；取消时删除本次快照（文档 4.1）。
4. **恢复失败可回滚，不承诺「不破坏」**：`chrome.bookmarks` 无事务，靠 `restorePre` 快照兜底（D4）。
5. **SW 无内存状态**：所有可恢复状态落 storage；长任务单次唤醒 ≤ 4 分钟或 200 条，靠 `job-tick` 闹钟续跑。
6. **文案不硬编码**：走 `t('key')`；中英两份 `messages.json` 必须 key 集合一致（`pnpm i18n:check` 卡住）。
7. **色值不硬编码**：一律用 `styles/tokens.css` 的 CSS 变量，浅/深两套都定义。
8. **规则优先级不可跨越类型**：类型分桶顺序固定，`order` 只在桶内生效（D-6）。
9. **同 URL 多书签是合法状态**：meta 重绑按先序遍历一一分配，冲突进 `orphanMeta`（I1）。

## 改动后的固定动作

- 改了 `wxt.config.ts` 的 manifest → 跑 `pnpm build`，确认 `.output/chrome-mv3/manifest.json` 正确。
- 加了 i18n key → 同时改两份语言包 → 跑 `pnpm i18n:check`。
- 改了 `shared/types.ts` → 跑 `pnpm compile`，并检查 `LocalDB.schemaVersion` 是否需要 +1 与迁移函数。
- 改了 SW 的事件注册 → 同步 `README.md` 与本文档的架构描述。

## 边界

- 不在本仓库引入不必要的运行时依赖；新增依赖前先问。
- `modules/` 之间只通过各自 `index.ts` 暴露的接口互相调用，禁止跨模块 import 内部文件。
- 不实现文档 1.5 列出的非目标功能（自动双向同步、AI 分类、移动设备书签、标签写回原生书签等）。
