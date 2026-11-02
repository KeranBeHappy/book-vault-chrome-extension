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
 * 需求依据：《Chrome书签管理扩展-开发需求文档-V1.1》2.2 节。
 * 注意：WXT 不在源码里维护 manifest.json，构建时输出到 `.output/chrome-mv3/manifest.json`。
 */
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
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

    // 刻意不设 default_title：留空时 Chrome 用 manifest.name（__MSG_extName__）
    // 按浏览器语言解析；写死 __MSG 会被 WXT 在构建期固化成默认语言。
    action: {
      default_icon: ICONS,
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
