# 签仓 BookVault · Chrome 书签管理扩展

本地优先的 Chrome 书签管理扩展。书签节点以浏览器原生书签库为权威源，扩展只保存规则、标签备注、检测状态、快照与任务状态。

- 需求文档：`C:\Users\pc\Downloads\Chrome书签管理扩展-开发需求文档-V1.2.md`
- 技术栈：Manifest V3 + Vue3 + TypeScript + Vite，构建工具 WXT
- 最低 Chrome 版本：114（`storage.local` 10MB、`_favicon` 可用）

## 快速开始

```bash
pnpm install        # 安装依赖（postinstall 会执行 wxt prepare 生成 .wxt/ 类型）
pnpm dev            # 开发模式，自动打开带扩展的 Chrome
pnpm build          # 产物输出到 .output/chrome-mv3/
pnpm compile        # vue-tsc 类型检查
pnpm i18n:check     # 语言包一致性校验
```

**加载扩展**：Chrome → `chrome://extensions` → 开启开发者模式 → 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3/`（注意不是项目根目录，WXT 的 manifest 是构建产物）。

## 目录结构

```
book-vault-chrome-extension/
├── wxt.config.ts               # manifest 唯一来源 + 构建配置
├── entrypoints/
│   ├── background.ts           # Service Worker：任务引擎 / 闹钟 / WebDAV / 书签监听
│   ├── popup/                  # 工具栏弹窗
│   ├── manager/                # 管理页（主界面）
│   └── capture/                # 右键菜单唤起的收藏小窗
├── modules/                    # 领域实现，按职责隔离
│   ├── bookmarks/  scanner/  jobs/  classifier/  dedupe/
│   ├── tags/  tabs-capture/  backup/  webdav/  encrypt/
│   ├── io/  storage/  i18n/
├── components/                 # 通用组件
├── composables/                # 主题 / 语言 / 任务进度 / 状态同步
├── stores/                     # Pinia：LocalDB 镜像与界面状态
├── shared/                     # types / constants / 消息协议
├── styles/                     # 千苍设计令牌与全局样式
├── public/
│   ├── icons/                  # icon16/32/48/128.png
│   └── _locales/{zh_CN,en}/    # messages.json（chrome.i18n 兼容）
└── scripts/                    # i18n-check 等构建期校验
```

## 关键约定

1. **书签数据不落副本**：页面只读 `chrome.bookmarks`，本地只存辅助状态。
2. **写操作统一走 SW**：页面不直接写 storage/bookmarks，避免多页面竞争（文档 4.6）。
3. **不硬编码文案**：所有可见文本走 `t('key')`，新增 key 必须同时更新中英两份语言包。
4. **不硬编码色值**：颜色一律用 `styles/tokens.css` 的变量，浅/深两套。
5. **SW 无内存状态**：所有可恢复状态存 storage，长任务靠 1 分钟心跳续跑。

## 当前进度

V1 功能已全部接线，处于交付前自检阶段（文档 11.3 / 11.4）：

- **管理页**：6 个视图（书签 / 统计 / 规则 / 标签 / 备份 / 设置）、文件夹树拖拽移动、虚拟滚动列表、跨字段搜索（标题 / URL / 域名 / 标签 / 备注）、详情面板、批量选择 / 移动 / 打开 / 复制 / 删除、批量标题与 URL 改写、重复合并、任务进度与取消。
- **后台**：标题刷新、死链检测（1 分钟心跳切片续跑，单次 ≤ 4 分钟或 200 条）、规则分类、快照回滚、回收站、单步撤销、坚果云 WebDAV 备份与轮转、云端备份加密、导入（可选落点）导出。
- **入口**：工具栏 popup（打开管理页 / 收藏窗口标签 / 立即备份 / 检测死链 / 规则分类）、右键菜单收藏当前页、快捷键 `Alt+Shift+B`。
- **尚未实测**：1 万书签性能基线（文档 9 节第 13 条）、坚果云 WebDAV 状态码与频率与 PBKDF2 迭代耗时（文档第 0 节 T-1 / T-2）。
