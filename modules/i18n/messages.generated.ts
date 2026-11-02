/**
 * 本文件由 scripts/i18n-check.mjs 自动生成，请勿手改。
 * 源头：public/_locales/{zh_CN,en}/messages.json
 */

export interface MessageEntry {
  message: string;
  description?: string;
}

export const MESSAGES: Record<'zh_CN' | 'en', Record<string, MessageEntry>> = {
  "zh_CN": {
    "captureTitle": {
      "message": "收藏当前窗口标签",
      "description": "收藏小窗标题"
    },
    "cmdOpenManager": {
      "message": "打开签仓管理页",
      "description": "快捷键说明"
    },
    "extDesc": {
      "message": "本地书签管理：批量改写、死链检测、规则分类、去重合并、标签备注、快照回滚与坚果云加密备份。",
      "description": "扩展描述"
    },
    "extName": {
      "message": "签仓",
      "description": "扩展名称（显示在扩展管理页与商店）"
    },
    "managerTitle": {
      "message": "书签管理",
      "description": "管理页标题"
    },
    "placeholder": {
      "message": "骨架页：功能待实现",
      "description": "占位提示，实现后移除"
    },
    "popupTitle": {
      "message": "签仓",
      "description": "Popup 标题"
    }
  },
  "en": {
    "captureTitle": {
      "message": "Save window tabs",
      "description": "Capture window title"
    },
    "cmdOpenManager": {
      "message": "Open BookVault manager",
      "description": "Keyboard shortcut description"
    },
    "extDesc": {
      "message": "Local bookmark management: bulk rewrite, dead-link scan, rule based classification, duplicate merge, tags and notes, snapshots and encrypted WebDAV backups.",
      "description": "Extension description"
    },
    "extName": {
      "message": "BookVault",
      "description": "Extension name (shown on the extensions page and store)"
    },
    "managerTitle": {
      "message": "Bookmarks",
      "description": "Manager page title"
    },
    "placeholder": {
      "message": "Skeleton page: features not implemented yet",
      "description": "Placeholder hint, remove after implementation"
    },
    "popupTitle": {
      "message": "BookVault",
      "description": "Popup title"
    }
  }
};
