import { defineConfig } from 'wxt';

/**
 * 图标按「夜鹰」命名约定（icon16/32/48/128.png）放置，显式声明，
 * 以免 WXT 依赖 `public/` 下的文件名正则自动发现。
 */
const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

/**
 * 扩展清单的唯一来源。
 * 需求依据：《Chrome书签管理扩展-开发需求文档-V1.3》2.2 节。
 * 注意：WXT 不在源码里维护 manifest.json，构建时输出到 `.output/chrome-mv3/manifest.json`。
 */
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],

  /**
   * 关键：本仓库的 `modules/` 是领域代码（bookmarks/backup/...），与 WXT 的
   * 「用户模块目录」约定同名。若不改指，WXT 会把每个 `modules/xxx/index.ts`
   * 当扩展模块用 jiti 加载，而 jiti 不认 `@/` 别名，构建会直接失败。
   * 指向一个不存在的目录即可让 WXT 跳过扫描。
   */
  modulesDir: 'wxt-user-modules',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDesc__',
    default_locale: 'zh_CN',
    minimum_chrome_version: '114',

    permissions: [
      'bookmarks',
      'storage',
      'unlimitedStorage',
      'alarms',
      'contextMenus',
      'tabs',
      'favicon',
    ],

    host_permissions: [
      'https://*/*',
      'http://*/*',
      'https://dav.jianguoyun.com/*',
    ],

    icons: ICONS,

    // 必须显式写 __MSG_extName__：留空时 WXT 会用 popup 页的 <title> 填充，
    // 而它在 Windows 上按 GBK 解码 UTF-8 的 html，标题会变成乱码。
    action: {
      default_icon: ICONS,
      default_title: '__MSG_extName__',
    },

    commands: {
      'open-manager': {
        suggested_key: {
          default: 'Alt+Shift+B',
          mac: 'Alt+Shift+B',
        },
        description: '__MSG_cmdOpenManager__',
      },
    },
  },
});
