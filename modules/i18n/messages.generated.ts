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
    "actionApply": {
      "message": "应用"
    },
    "actionApplyClassify": {
      "message": "应用分类"
    },
    "actionBackupCloud": {
      "message": "备份到云端"
    },
    "actionBackupLocal": {
      "message": "仅备份到本地"
    },
    "actionCancel": {
      "message": "取消"
    },
    "actionCaptureWindow": {
      "message": "收藏当前窗口"
    },
    "actionChangePassword": {
      "message": "修改密码"
    },
    "actionCheckLinks": {
      "message": "死链检测"
    },
    "actionClassify": {
      "message": "规则分类"
    },
    "actionClearFilter": {
      "message": "清除筛选"
    },
    "actionClearOrphans": {
      "message": "清空孤儿备注"
    },
    "actionClearRecycle": {
      "message": "清空回收站"
    },
    "actionClearSelection": {
      "message": "取消选择"
    },
    "actionClearVault": {
      "message": "清除本机密钥"
    },
    "actionClose": {
      "message": "关闭"
    },
    "actionConfirm": {
      "message": "确定"
    },
    "actionCopyLink": {
      "message": "复制链接"
    },
    "actionCopyUrl": {
      "message": "复制 URL"
    },
    "actionDedupe": {
      "message": "重复检测"
    },
    "actionDelete": {
      "message": "删除"
    },
    "actionDisable": {
      "message": "停用"
    },
    "actionEdit": {
      "message": "编辑"
    },
    "actionEnable": {
      "message": "启用"
    },
    "actionExpand": {
      "message": "展开或收起"
    },
    "actionExportCsv": {
      "message": "导出 CSV"
    },
    "actionExportHtml": {
      "message": "导出 HTML"
    },
    "actionExportJson": {
      "message": "导出 JSON"
    },
    "actionExportRules": {
      "message": "导出规则"
    },
    "actionGeneratePreview": {
      "message": "生成预览"
    },
    "actionGotoSettings": {
      "message": "前往设置"
    },
    "actionImport": {
      "message": "导入"
    },
    "actionImportHtml": {
      "message": "导入 HTML"
    },
    "actionImportJson": {
      "message": "导入 JSON"
    },
    "actionImportRules": {
      "message": "导入规则"
    },
    "actionMerge": {
      "message": "合并"
    },
    "actionMoveTo": {
      "message": "移动到"
    },
    "actionNewBookmark": {
      "message": "新建书签"
    },
    "actionNewFolder": {
      "message": "新建文件夹"
    },
    "actionNewRule": {
      "message": "新建规则"
    },
    "actionOpen": {
      "message": "打开"
    },
    "actionOpenSelected": {
      "message": "打开选中项"
    },
    "actionPreview": {
      "message": "预览"
    },
    "actionRecompute": {
      "message": "重新统计"
    },
    "actionRefresh": {
      "message": "刷新"
    },
    "actionRefreshTitles": {
      "message": "刷新标题"
    },
    "actionRename": {
      "message": "重命名"
    },
    "actionRestore": {
      "message": "恢复"
    },
    "actionRewrite": {
      "message": "批量改写"
    },
    "actionSave": {
      "message": "保存"
    },
    "actionScanEmpty": {
      "message": "清理空文件夹"
    },
    "actionSelectAll": {
      "message": "全选"
    },
    "actionStop": {
      "message": "停止"
    },
    "actionTagsNote": {
      "message": "标签与备注"
    },
    "actionTestConnection": {
      "message": "测试连接"
    },
    "actionUndo": {
      "message": "撤销"
    },
    "allBookmarks": {
      "message": "全部书签"
    },
    "backupLocalDone": {
      "message": "已备份到本地"
    },
    "backupTitle": {
      "message": "备份与恢复"
    },
    "backupUploaded": {
      "message": "已上传到云端：$name"
    },
    "bookmarkCreateTitle": {
      "message": "新建书签"
    },
    "bookmarkCreated": {
      "message": "书签已创建"
    },
    "bookmarkDeleteMessage": {
      "message": "确认删除选中的 $count 条书签？"
    },
    "bookmarkDeleteTitle": {
      "message": "删除书签"
    },
    "bookmarkDeleted": {
      "message": "已删除 $count 条书签"
    },
    "bookmarkEditTitle": {
      "message": "编辑书签"
    },
    "bookmarkSaved": {
      "message": "书签已保存"
    },
    "captureCloseWindow": {
      "message": "关闭窗口"
    },
    "captureConfirmMessage": {
      "message": "将收藏 $count 条书签到「$folder」"
    },
    "captureConfirmTitle": {
      "message": "收藏标签页"
    },
    "captureDuplicateTag": {
      "message": "已存在"
    },
    "captureEmpty": {
      "message": "当前窗口没有可收藏的页面"
    },
    "captureExcludedHint": {
      "message": "排除 $count 个不可收藏页面"
    },
    "captureLoading": {
      "message": "正在读取标签页…"
    },
    "captureModePage": {
      "message": "收藏当前页面"
    },
    "captureModeWindow": {
      "message": "收藏当前窗口的标签页"
    },
    "captureNoteLabel": {
      "message": "统一备注（可选）"
    },
    "captureNotePlaceholder": {
      "message": "写入本次新增书签的备注"
    },
    "captureResultCreated": {
      "message": "新增 $count 条"
    },
    "captureResultDuplicates": {
      "message": "跳过重复 $count 条"
    },
    "captureResultExcluded": {
      "message": "排除 $count 个页面"
    },
    "captureResultFailed": {
      "message": "失败 $count 条"
    },
    "captureResultTitle": {
      "message": "收藏结果"
    },
    "captureSelected": {
      "message": "已选 $count 条"
    },
    "captureTargetLabel": {
      "message": "目标文件夹"
    },
    "captureTitle": {
      "message": "收藏当前窗口标签",
      "description": "收藏小窗标题"
    },
    "classifyApplied": {
      "message": "已移动 $moved 条，失败 $invalid 条"
    },
    "classifyApplyMessage": {
      "message": "将按规则移动 $count 条书签"
    },
    "classifyApplyTitle": {
      "message": "应用分类结果"
    },
    "classifyDiscardHint": {
      "message": "分类后变空的原有文件夹会被删除"
    },
    "classifyImpact": {
      "message": "预览：$total 条书签，将删除 $folders 个空文件夹"
    },
    "classifyManual": {
      "message": "手动调整"
    },
    "classifyPreviewHint": {
      "message": "预览结果可在下方手动调整，仅对本次生效"
    },
    "classifyPreviewTitle": {
      "message": "分类预览"
    },
    "classifyRemovedFolders": {
      "message": "将删除 $count 个已空的文件夹"
    },
    "clearVaultDetail": {
      "message": "云端备份文件不受影响，只是本机不再记住密码。"
    },
    "clearVaultMessage": {
      "message": "确认清除本机缓存的密钥？之后解密备份需要重新输入密码。"
    },
    "clearVaultTitle": {
      "message": "清除本机密钥"
    },
    "cloudDeleteMessage": {
      "message": "确认删除云端备份 $name？"
    },
    "cloudDeleteTitle": {
      "message": "删除云端备份"
    },
    "cloudDeleted": {
      "message": "云端备份已删除"
    },
    "cloudEmpty": {
      "message": "云端暂无备份"
    },
    "cloudEncryptedOff": {
      "message": "未加密"
    },
    "cloudEncryptedOn": {
      "message": "已加密"
    },
    "cloudNotConfigured": {
      "message": "尚未配置 WebDAV"
    },
    "cloudPasswordHint": {
      "message": "密码只在本次操作中使用，不会写入磁盘"
    },
    "cloudPasswordTitle": {
      "message": "输入备份密码"
    },
    "cloudRestoreMessage": {
      "message": "从 $name 恢复 $count 条书签（$type）"
    },
    "cloudRestoreTitle": {
      "message": "从云端恢复"
    },
    "cloudTitle": {
      "message": "云端备份"
    },
    "cmdOpenManager": {
      "message": "打开签仓管理页",
      "description": "快捷键说明"
    },
    "colActions": {
      "message": "操作"
    },
    "colCount": {
      "message": "数量"
    },
    "colFileName": {
      "message": "文件名"
    },
    "colFolder": {
      "message": "文件夹"
    },
    "colSize": {
      "message": "大小"
    },
    "colSource": {
      "message": "来源"
    },
    "colStatus": {
      "message": "状态"
    },
    "colTime": {
      "message": "时间"
    },
    "colTitle": {
      "message": "标题"
    },
    "copiedCount": {
      "message": "已复制 $count 条链接"
    },
    "csvCheckedAt": {
      "message": "检测时间"
    },
    "csvDomain": {
      "message": "域名"
    },
    "csvError": {
      "message": "失败原因"
    },
    "csvHttpStatus": {
      "message": "HTTP 状态码"
    },
    "csvNoData": {
      "message": "当前列表为空，没有可导出的数据"
    },
    "csvProxySuspect": {
      "message": "疑似需代理"
    },
    "csvUrl": {
      "message": "链接"
    },
    "davCode_forbidden": {
      "message": "无访问权限（403）"
    },
    "davCode_network": {
      "message": "网络不可达，请检查网络或代理"
    },
    "davCode_notFound": {
      "message": "路径不存在（404），请检查远端目录"
    },
    "davCode_ok": {
      "message": "连接正常"
    },
    "davCode_rateLimited": {
      "message": "请求过于频繁（429），请稍后再试"
    },
    "davCode_serverError": {
      "message": "服务端错误（5xx），请稍后再试"
    },
    "davCode_unauthorized": {
      "message": "认证失败（401），请检查账号与应用授权码"
    },
    "davCode_unknown": {
      "message": "未知错误"
    },
    "davTestDetail": {
      "message": "详情"
    },
    "davTestDuration": {
      "message": "耗时"
    },
    "davTestMethod": {
      "message": "方法"
    },
    "davTestOk": {
      "message": "连接成功，远端 $count 个文件"
    },
    "davTestStatus": {
      "message": "状态码"
    },
    "davTestUrl": {
      "message": "最终地址"
    },
    "dedupeCount": {
      "message": "本组 $count 条"
    },
    "dedupeEmpty": {
      "message": "没有 URL 完全相同的书签"
    },
    "dedupeFooterHint": {
      "message": "勾选的保留，未勾选的将被删除，可用快照恢复"
    },
    "dedupeMergeHint": {
      "message": "被删除书签的标签与备注不会自动迁移到保留项"
    },
    "dedupeMergeMessage": {
      "message": "确认删除 $count 条重复书签？"
    },
    "dedupeMergeTitle": {
      "message": "合并重复书签"
    },
    "dedupeMerged": {
      "message": "已合并删除 $count 条"
    },
    "dedupeSkipped": {
      "message": "已跳过 $count 个过大的分组"
    },
    "dedupeTabTitle": {
      "message": "标题相似（$count 组）"
    },
    "dedupeTabUrl": {
      "message": "URL 重复（$count 组）"
    },
    "dedupeTitle": {
      "message": "重复书签"
    },
    "dedupeTitleEmpty": {
      "message": "没有标题相似的书签"
    },
    "dedupeTitleHint": {
      "message": "标题相似度阈值可在设置中调整"
    },
    "detailEmpty": {
      "message": "在上方列表中选择一条书签查看详情"
    },
    "detailTitle": {
      "message": "书签详情"
    },
    "emptyFolderCleaned": {
      "message": "已清理 $count 个空文件夹"
    },
    "emptyFolderMessage": {
      "message": "确认删除 $count 个空文件夹？"
    },
    "emptyFolderNone": {
      "message": "没有找到空文件夹"
    },
    "emptyFolderTitle": {
      "message": "清理空文件夹"
    },
    "encryptAck": {
      "message": "我已了解上述风险"
    },
    "encryptChangeTitle": {
      "message": "修改备份密码"
    },
    "encryptEnabledDone": {
      "message": "已开启备份加密"
    },
    "encryptNeedAck": {
      "message": "请先勾选风险确认"
    },
    "encryptSetupTitle": {
      "message": "设置备份密码"
    },
    "encryptionRiskHint": {
      "message": "密码一旦丢失，云端加密备份将无法恢复，签仓不保存密码。"
    },
    "encryptionScopeHint": {
      "message": "加密只作用于云端备份与导出文件，本地快照仍为明文。"
    },
    "errBackgroundUnavailable": {
      "message": "后台服务无响应，请稍后重试或重新加载扩展"
    },
    "errBackupCorrupted": {
      "message": "备份文件内容已损坏，无法解析"
    },
    "errBackupCryptoMissing": {
      "message": "备份文件缺少加密参数，无法解密"
    },
    "errBackupStructure": {
      "message": "备份文件格式不正确"
    },
    "errBookmarksRead": {
      "message": "读取浏览器书签失败"
    },
    "errBookmarksWrite": {
      "message": "写入浏览器书签失败"
    },
    "errDavForbidden": {
      "message": "WebDAV 拒绝访问（403），请检查授权码权限"
    },
    "errDavNameConflict": {
      "message": "云端已存在同名文件"
    },
    "errDavNetwork": {
      "message": "无法连接 WebDAV 服务器，请检查网络"
    },
    "errDavNotFound": {
      "message": "WebDAV 路径不存在（404）"
    },
    "errDavRateLimited": {
      "message": "WebDAV 请求过于频繁（429），请稍后再试"
    },
    "errDavServer": {
      "message": "WebDAV 服务端错误（5xx）"
    },
    "errDavUnauthorized": {
      "message": "WebDAV 认证失败（401），请检查账号与应用授权码"
    },
    "errDavUnknown": {
      "message": "WebDAV 操作失败（未知错误）"
    },
    "errFolderMissing": {
      "message": "目标文件夹不存在或已被删除"
    },
    "errFolderNoUrl": {
      "message": "该节点不是书签，无法改写链接"
    },
    "errJobNotFound": {
      "message": "任务不存在或已结束"
    },
    "errMobileRoot": {
      "message": "移动设备书签根目录不支持修改"
    },
    "errNoHttpBookmarks": {
      "message": "当前范围内没有可检测的 http(s) 书签"
    },
    "errNoManagedRoot": {
      "message": "找不到受管根目录，请先在设置中选择"
    },
    "errNodeMissing": {
      "message": "书签不存在或已被删除"
    },
    "errNotFolder": {
      "message": "该节点不是文件夹"
    },
    "errNothingToUndo": {
      "message": "没有可撤销的操作"
    },
    "errPasswordEmpty": {
      "message": "密码不能为空"
    },
    "errPasswordRequired": {
      "message": "该备份已加密，请输入密码"
    },
    "errPasswordWrong": {
      "message": "密码错误，无法解密"
    },
    "errRecycleItemMissing": {
      "message": "回收站条目不存在"
    },
    "errRestoreFailed": {
      "message": "恢复过程中出错"
    },
    "errRootProtected": {
      "message": "浏览器内置根目录不支持修改"
    },
    "errRuleCategoryEmpty": {
      "message": "目标分类不能为空"
    },
    "errRuleImportInvalid": {
      "message": "规则文件格式不正确"
    },
    "errRulePatternEmpty": {
      "message": "匹配式不能为空"
    },
    "errSchemaTooNew": {
      "message": "数据版本高于当前扩展版本，已进入只读模式，请更新扩展"
    },
    "errSnapshotCorrupted": {
      "message": "快照数据校验失败，可能已损坏"
    },
    "errSnapshotMissing": {
      "message": "快照不存在或已被删除"
    },
    "errSnapshotRequired": {
      "message": "该操作需要先创建快照"
    },
    "errSnapshotWrite": {
      "message": "快照写入失败，操作已中止"
    },
    "errStorageRead": {
      "message": "读取本地数据失败"
    },
    "errStorageTooLarge": {
      "message": "数据超出浏览器存储配额"
    },
    "errStorageWrite": {
      "message": "写入本地数据失败"
    },
    "errTagEmpty": {
      "message": "标签名不能为空"
    },
    "errTitleEmpty": {
      "message": "标题不能为空"
    },
    "errUndoSnapshotMissing": {
      "message": "撤销所需的数据已丢失"
    },
    "errUnknown": {
      "message": "出现未知错误"
    },
    "errUrlEmpty": {
      "message": "链接不能为空"
    },
    "errUrlInvalid": {
      "message": "链接格式不正确"
    },
    "errUrlScheme": {
      "message": "仅支持 http 与 https 链接"
    },
    "errVaultMissing": {
      "message": "本机没有保存密钥，请输入密码"
    },
    "errWebdavConfig": {
      "message": "WebDAV 配置不完整，请填写服务器、账号与授权码"
    },
    "errWebdavDisabled": {
      "message": "尚未启用 WebDAV"
    },
    "extDesc": {
      "message": "本地书签管理：批量改写、死链检测、规则分类、去重合并、标签备注、快照回滚与坚果云加密备份。",
      "description": "扩展描述"
    },
    "extName": {
      "message": "签仓",
      "description": "扩展名称（显示在扩展管理页与商店）"
    },
    "fieldAutoBackupDaily": {
      "message": "每日自动备份"
    },
    "fieldAutoBackupHour": {
      "message": "自动备份时间（整点）"
    },
    "fieldBookmarkTitle": {
      "message": "标题"
    },
    "fieldBookmarkUrl": {
      "message": "链接"
    },
    "fieldCloudKeep": {
      "message": "云端保留份数"
    },
    "fieldConcurrency": {
      "message": "检测并发数"
    },
    "fieldEnabled": {
      "message": "启用该规则"
    },
    "fieldEncryptEnabled": {
      "message": "开启备份加密"
    },
    "fieldLanguage": {
      "message": "界面语言"
    },
    "fieldLocalKeep": {
      "message": "本地快照保留份数"
    },
    "fieldNewPassword": {
      "message": "新密码"
    },
    "fieldNote": {
      "message": "备注"
    },
    "fieldOldPassword": {
      "message": "原密码"
    },
    "fieldRecycleKeep": {
      "message": "回收站保留条数"
    },
    "fieldRememberKey": {
      "message": "在本机记住密钥"
    },
    "fieldRuleCategory": {
      "message": "目标分类"
    },
    "fieldRulePattern": {
      "message": "匹配式"
    },
    "fieldRuleType": {
      "message": "规则类型"
    },
    "fieldSimilarity": {
      "message": "标题相似度阈值"
    },
    "fieldTags": {
      "message": "标签"
    },
    "fieldTargetFolder": {
      "message": "目标文件夹"
    },
    "fieldTheme": {
      "message": "主题"
    },
    "fieldTimeout": {
      "message": "单条超时（秒）"
    },
    "fieldWebdavDir": {
      "message": "远端目录"
    },
    "fieldWebdavEnabled": {
      "message": "启用 WebDAV"
    },
    "fieldWebdavPassword": {
      "message": "应用授权码"
    },
    "fieldWebdavServer": {
      "message": "服务器地址"
    },
    "fieldWebdavUser": {
      "message": "账号（邮箱）"
    },
    "filterAllStatus": {
      "message": "全部状态"
    },
    "filterTags": {
      "message": "标签筛选"
    },
    "folderCreateTitle": {
      "message": "新建文件夹"
    },
    "folderCreated": {
      "message": "文件夹已创建"
    },
    "folderDeleteCount": {
      "message": "将连带删除 $count 条书签"
    },
    "folderDeleteMessage": {
      "message": "确认删除文件夹「$name」？"
    },
    "folderDeleteTitle": {
      "message": "删除文件夹"
    },
    "folderDeleted": {
      "message": "已删除文件夹及其中 $count 条书签"
    },
    "folderMoveMessage": {
      "message": "将「$name」移动到目标文件夹"
    },
    "folderMoveTarget": {
      "message": "目标位置：$target"
    },
    "folderMoveTitle": {
      "message": "移动文件夹"
    },
    "folderRenameTitle": {
      "message": "重命名文件夹"
    },
    "folderTreeLabel": {
      "message": "文件夹树"
    },
    "foldersTitle": {
      "message": "文件夹"
    },
    "importChooseTarget": {
      "message": "选择导入位置"
    },
    "importDone": {
      "message": "导入完成：新增 $created 条，跳过重复 $duplicates 条，非法 $invalid 条"
    },
    "importDuplicates": {
      "message": "重复 $count 条将跳过"
    },
    "importInvalid": {
      "message": "非法 $count 条将跳过"
    },
    "importMessage": {
      "message": "将从「$name」导入 $count 条书签"
    },
    "importMeta": {
      "message": "将恢复 $count 条标签与备注"
    },
    "importNothing": {
      "message": "没有可导入的内容（重复 $duplicates 条，非法 $invalid 条）"
    },
    "importPasswordTitle": {
      "message": "输入备份密码"
    },
    "importRules": {
      "message": "将导入 $count 条分类规则"
    },
    "importTarget": {
      "message": "导入到「$target」"
    },
    "importTargetHint": {
      "message": "导入的书签会写入受管根目录"
    },
    "importTitle": {
      "message": "确认导入"
    },
    "ioHint": {
      "message": "支持签仓 JSON 备份与浏览器导出的 HTML 书签文件"
    },
    "ioTitle": {
      "message": "导入导出"
    },
    "jobCanceled": {
      "message": "任务已取消"
    },
    "jobLinkCheck": {
      "message": "死链检测"
    },
    "jobStarted": {
      "message": "已开始处理 $count 条"
    },
    "jobTitleRefresh": {
      "message": "标题刷新"
    },
    "labelEncrypted": {
      "message": "已加密"
    },
    "labelPlain": {
      "message": "未加密"
    },
    "labelUnknownFormat": {
      "message": "未知格式"
    },
    "languageSystem": {
      "message": "跟随系统"
    },
    "lastBackupError": {
      "message": "上次备份失败"
    },
    "lastDailyBackup": {
      "message": "上次自动备份：$date"
    },
    "loading": {
      "message": "加载中…"
    },
    "localSnapshotsTitle": {
      "message": "本地快照"
    },
    "managerTitle": {
      "message": "书签管理",
      "description": "管理页标题"
    },
    "menuAddBookmark": {
      "message": "收藏到签仓",
      "description": "浏览器右键菜单项"
    },
    "metaSaved": {
      "message": "标签与备注已保存"
    },
    "moveMessage": {
      "message": "将移动 $count 条书签到所选文件夹"
    },
    "moveTitle": {
      "message": "移动到文件夹"
    },
    "movedDone": {
      "message": "已移动 $moved 条，跳过 $skipped 条"
    },
    "no": {
      "message": "否"
    },
    "noBookmarks": {
      "message": "暂无书签"
    },
    "noFolders": {
      "message": "暂无文件夹"
    },
    "noRuleMatched": {
      "message": "未命中任何规则"
    },
    "noSnapshots": {
      "message": "暂无本地快照"
    },
    "none": {
      "message": "无"
    },
    "notePlaceholder": {
      "message": "补充这条书签的用途或上下文"
    },
    "noteTruncated": {
      "message": "备注过长，已截断"
    },
    "opAction_capture": {
      "message": "收藏"
    },
    "opAction_classify": {
      "message": "分类"
    },
    "opAction_delete": {
      "message": "删除"
    },
    "opAction_import": {
      "message": "导入"
    },
    "opAction_move": {
      "message": "移动"
    },
    "opAction_refreshTitle": {
      "message": "刷新标题"
    },
    "opAction_rename": {
      "message": "重命名"
    },
    "opAction_restore": {
      "message": "恢复"
    },
    "opAction_rewrite": {
      "message": "改写链接"
    },
    "openManyMessage": {
      "message": "将打开 $count 个标签页（单次上限 $limit），确认继续？"
    },
    "openManyTitle": {
      "message": "批量打开标签页"
    },
    "orphanClearDetail": {
      "message": "这些备注对应的书签已不存在，清空后无法恢复"
    },
    "orphanClearMessage": {
      "message": "确认清空 $count 条孤立备注？"
    },
    "orphanClearTitle": {
      "message": "清空孤儿备注"
    },
    "orphanCleared": {
      "message": "孤儿备注已清空"
    },
    "orphanHint": {
      "message": "以下标签与备注找不到对应书签，可手动清理"
    },
    "orphanTitle": {
      "message": "孤儿标签与备注"
    },
    "passwordChanged": {
      "message": "密码已修改"
    },
    "pendingCloudBackup": {
      "message": "有云端备份被跳过，稍后会自动补做"
    },
    "placeholder": {
      "message": "骨架页：功能待实现",
      "description": "占位提示，实现后移除"
    },
    "popupBackupDone": {
      "message": "备份完成"
    },
    "popupBackupFailed": {
      "message": "上次备份失败：$reason"
    },
    "popupBackupLocalDone": {
      "message": "已生成本地快照"
    },
    "popupBackupNever": {
      "message": "还没有云备份"
    },
    "popupBackupNow": {
      "message": "立即备份"
    },
    "popupLastBackup": {
      "message": "上次云备份：$time"
    },
    "popupLinkCheckStarted": {
      "message": "已开始检测 $count 个链接"
    },
    "popupOpenManager": {
      "message": "打开管理页"
    },
    "popupPendingCloud": {
      "message": "有云端备份待重试"
    },
    "popupPendingVault": {
      "message": "有加密备份等待输入密码，请到管理页处理"
    },
    "popupTitle": {
      "message": "签仓",
      "description": "Popup 标题"
    },
    "proxyHint": {
      "message": "以下域名判定失败时会被标记为「疑似需代理」"
    },
    "recycleClearDetail": {
      "message": "清空后不可恢复"
    },
    "recycleClearMessage": {
      "message": "确认清空回收站？"
    },
    "recycleClearTitle": {
      "message": "清空回收站"
    },
    "recycleCleared": {
      "message": "回收站已清空（$count 条）"
    },
    "recycleEmpty": {
      "message": "回收站为空"
    },
    "recycleHint": {
      "message": "删除的书签会在这里保留一段时间"
    },
    "recycleRecoverable": {
      "message": "可从回收站恢复"
    },
    "recycleRestored": {
      "message": "已从回收站恢复 $count 条"
    },
    "recycleTitle": {
      "message": "回收站"
    },
    "restoreDone": {
      "message": "恢复完成：$restored 条，重绑标签 $bound 条，孤立 $orphan 条"
    },
    "restoreFailedNoRollback": {
      "message": "恢复失败且回滚失败，请用快照 $id 手动恢复"
    },
    "restoreFailedRolledBack": {
      "message": "恢复失败，已回滚到操作前状态（快照 $id）"
    },
    "restoreLossHint": {
      "message": "恢复会覆盖当前书签结构，建议先备份"
    },
    "restoreMessage": {
      "message": "确认恢复 $count 条书签？"
    },
    "restoreSnapshotId": {
      "message": "恢复前快照：$id"
    },
    "restoreTitle": {
      "message": "确认恢复"
    },
    "rewriteAffected": {
      "message": "将修改 $count 条"
    },
    "rewriteCaseSensitive": {
      "message": "区分大小写"
    },
    "rewriteConfirmMessage": {
      "message": "将修改 $count 条书签"
    },
    "rewriteDone": {
      "message": "改写完成：更新 $updated 条，跳过 $skipped 条"
    },
    "rewriteEmptyTitleConfirm": {
      "message": "其中 $count 条会变成空标题，请确认"
    },
    "rewriteEmptyTitleWarn": {
      "message": "有 $count 条会变为空标题"
    },
    "rewriteHint": {
      "message": "已选 $count 条书签；只有符合规则且值真正变化的条目才会写入"
    },
    "rewriteMode": {
      "message": "操作方式"
    },
    "rewriteNoAffected": {
      "message": "没有符合规则的条目，检查规则后再试"
    },
    "rewritePrefix": {
      "message": "加前缀"
    },
    "rewritePrefixText": {
      "message": "前缀内容"
    },
    "rewritePreviewMore": {
      "message": "另有 $count 条未在预览中列出"
    },
    "rewriteReplace": {
      "message": "查找替换"
    },
    "rewriteReplacement": {
      "message": "替换为"
    },
    "rewriteResultTitle": {
      "message": "改写结果"
    },
    "rewriteSearch": {
      "message": "查找"
    },
    "rewriteSkippedCount": {
      "message": "将跳过 $count 条"
    },
    "rewriteSuffix": {
      "message": "加后缀"
    },
    "rewriteSuffixText": {
      "message": "后缀内容"
    },
    "rewriteTarget": {
      "message": "改写对象"
    },
    "rewriteTargetTitle": {
      "message": "标题"
    },
    "rewriteTargetUrl": {
      "message": "链接"
    },
    "rewriteTitle": {
      "message": "批量改写"
    },
    "rewriteUrlOnlyReplace": {
      "message": "链接只支持查找替换，结果必须通过 http/https 校验"
    },
    "ruleCategoryPlaceholder": {
      "message": "例如：开发工具"
    },
    "ruleImportDone": {
      "message": "已导入 $count 条规则"
    },
    "rulePatternPlaceholder": {
      "message": "例如：github.com 或 教程"
    },
    "ruleTypeDomainContains": {
      "message": "域名包含"
    },
    "ruleTypeDomainExact": {
      "message": "域名精确匹配"
    },
    "ruleTypeTitleKeyword": {
      "message": "标题关键词"
    },
    "ruleTypeUrlKeyword": {
      "message": "链接关键词"
    },
    "rulesDragHint": {
      "message": "拖动可调整同类型规则的优先级"
    },
    "rulesGroupEmpty": {
      "message": "该类型下暂无规则"
    },
    "rulesPriorityHint": {
      "message": "类型之间优先级固定，拖动只能在同类型内调整"
    },
    "rulesTitle": {
      "message": "分类规则"
    },
    "searchPlaceholder": {
      "message": "搜索标题、链接、标签或备注"
    },
    "selectedCount": {
      "message": "已选 $count 项"
    },
    "settingsEncryption": {
      "message": "加密"
    },
    "settingsGeneral": {
      "message": "通用"
    },
    "settingsProxy": {
      "message": "疑似需代理的域名"
    },
    "settingsSaved": {
      "message": "设置已保存"
    },
    "settingsTitle": {
      "message": "设置"
    },
    "settingsWebdav": {
      "message": "坚果云 WebDAV"
    },
    "snapshotDeleteMessage": {
      "message": "确认删除 $time 的快照？"
    },
    "snapshotDeleteTitle": {
      "message": "删除快照"
    },
    "snapshotDeleted": {
      "message": "快照已删除"
    },
    "snapshotPreviewTitle": {
      "message": "快照内容"
    },
    "snapshotRecoverable": {
      "message": "本次操作前已自动创建快照，可用它恢复"
    },
    "snapshotSource_autoDaily": {
      "message": "每日自动"
    },
    "snapshotSource_import": {
      "message": "导入前"
    },
    "snapshotSource_manual": {
      "message": "手动创建"
    },
    "snapshotSource_preOperation": {
      "message": "操作前自动"
    },
    "snapshotSource_restorePre": {
      "message": "恢复前"
    },
    "sortAsc": {
      "message": "升序"
    },
    "sortDateAdded": {
      "message": "按添加时间"
    },
    "sortDesc": {
      "message": "降序"
    },
    "sortDomain": {
      "message": "按域名"
    },
    "sortTitle": {
      "message": "按标题"
    },
    "statsCategories": {
      "message": "一级分类分布"
    },
    "statsDead": {
      "message": "死链"
    },
    "statsDuplicates": {
      "message": "重复组"
    },
    "statsEmptyFolders": {
      "message": "空文件夹"
    },
    "statsNoCategories": {
      "message": "暂无分类数据"
    },
    "statsSuspect": {
      "message": "存疑"
    },
    "statsTags": {
      "message": "标签数"
    },
    "statsTitle": {
      "message": "统计概览"
    },
    "statsTotal": {
      "message": "书签总数"
    },
    "statusDead": {
      "message": "死链"
    },
    "statusOk": {
      "message": "正常"
    },
    "statusSuspect": {
      "message": "存疑"
    },
    "statusUnsupported": {
      "message": "不支持检测"
    },
    "statusUntested": {
      "message": "未检测"
    },
    "tagDeleteDetail": {
      "message": "该标签会从所有书签上移除，备注不受影响"
    },
    "tagDeleteDone": {
      "message": "已从 $count 条书签移除该标签"
    },
    "tagDeleteMessage": {
      "message": "确认删除标签「$tag」？"
    },
    "tagDeleteTitle": {
      "message": "删除标签"
    },
    "tagHint": {
      "message": "每条书签最多 $max 个标签"
    },
    "tagPlaceholder": {
      "message": "输入标签后回车或逗号分隔"
    },
    "tagRenameDone": {
      "message": "已重命名，影响 $count 条书签"
    },
    "tagsEmpty": {
      "message": "暂无标签"
    },
    "tagsHint": {
      "message": "标签只保存在签仓本地，不写回浏览器书签"
    },
    "tagsTitle": {
      "message": "标签管理"
    },
    "themeDark": {
      "message": "深色"
    },
    "themeLight": {
      "message": "浅色"
    },
    "themeSystem": {
      "message": "跟随系统"
    },
    "titleApplied": {
      "message": "已回填 $updated 条标题，失败 $failed 条"
    },
    "titleApplyDetail": {
      "message": "修改会记入撤销日志，可撤销一次"
    },
    "titleApplyMessage": {
      "message": "将修改 $count 条书签的标题"
    },
    "titleApplyTitle": {
      "message": "回填标题"
    },
    "titleRefreshNoChange": {
      "message": "标题没有变化"
    },
    "undoEmpty": {
      "message": "暂无可撤销的操作"
    },
    "undoHint": {
      "message": "仅支持撤销最近一次操作"
    },
    "undoLatest": {
      "message": "最近可撤销：$action（$time）"
    },
    "undoMessage": {
      "message": "确认撤销「$action」？"
    },
    "undoTitle": {
      "message": "撤销"
    },
    "unnamedFolder": {
      "message": "未命名文件夹"
    },
    "vaultCached": {
      "message": "密钥已缓存在本机"
    },
    "vaultCleared": {
      "message": "本机密钥已清除"
    },
    "vaultMissing": {
      "message": "本机未保存密钥"
    },
    "view_backup": {
      "message": "备份"
    },
    "view_manager": {
      "message": "书签管理"
    },
    "view_rules": {
      "message": "规则"
    },
    "view_settings": {
      "message": "设置"
    },
    "view_stats": {
      "message": "统计"
    },
    "view_tags": {
      "message": "标签"
    },
    "webdavPasswordRisk": {
      "message": "授权码以明文保存在本地，请勿在公用电脑上填写"
    },
    "yes": {
      "message": "是"
    }
  },
  "en": {
    "actionApply": {
      "message": "Apply"
    },
    "actionApplyClassify": {
      "message": "Apply categories"
    },
    "actionBackupCloud": {
      "message": "Back up to cloud"
    },
    "actionBackupLocal": {
      "message": "Local backup only"
    },
    "actionCancel": {
      "message": "Cancel"
    },
    "actionCaptureWindow": {
      "message": "Save window tabs"
    },
    "actionChangePassword": {
      "message": "Change password"
    },
    "actionCheckLinks": {
      "message": "Check dead links"
    },
    "actionClassify": {
      "message": "Sort by rules"
    },
    "actionClearFilter": {
      "message": "Clear filter"
    },
    "actionClearOrphans": {
      "message": "Clear orphan notes"
    },
    "actionClearRecycle": {
      "message": "Empty recycle bin"
    },
    "actionClearSelection": {
      "message": "Clear selection"
    },
    "actionClearVault": {
      "message": "Clear local key"
    },
    "actionClose": {
      "message": "Close"
    },
    "actionConfirm": {
      "message": "OK"
    },
    "actionCopyLink": {
      "message": "Copy link"
    },
    "actionCopyUrl": {
      "message": "Copy URL"
    },
    "actionDedupe": {
      "message": "Find duplicates"
    },
    "actionDelete": {
      "message": "Delete"
    },
    "actionDisable": {
      "message": "Disable"
    },
    "actionEdit": {
      "message": "Edit"
    },
    "actionEnable": {
      "message": "Enable"
    },
    "actionExpand": {
      "message": "Expand or collapse"
    },
    "actionExportCsv": {
      "message": "Export CSV"
    },
    "actionExportHtml": {
      "message": "Export HTML"
    },
    "actionExportJson": {
      "message": "Export JSON"
    },
    "actionExportRules": {
      "message": "Export rules"
    },
    "actionGeneratePreview": {
      "message": "Generate preview"
    },
    "actionGotoSettings": {
      "message": "Go to settings"
    },
    "actionImport": {
      "message": "Import"
    },
    "actionImportHtml": {
      "message": "Import HTML"
    },
    "actionImportJson": {
      "message": "Import JSON"
    },
    "actionImportRules": {
      "message": "Import rules"
    },
    "actionMerge": {
      "message": "Merge"
    },
    "actionMoveTo": {
      "message": "Move to"
    },
    "actionNewBookmark": {
      "message": "New bookmark"
    },
    "actionNewFolder": {
      "message": "New folder"
    },
    "actionNewRule": {
      "message": "New rule"
    },
    "actionOpen": {
      "message": "Open"
    },
    "actionOpenSelected": {
      "message": "Open selected"
    },
    "actionPreview": {
      "message": "Preview"
    },
    "actionRecompute": {
      "message": "Recompute"
    },
    "actionRefresh": {
      "message": "Refresh"
    },
    "actionRefreshTitles": {
      "message": "Refresh titles"
    },
    "actionRename": {
      "message": "Rename"
    },
    "actionRestore": {
      "message": "Restore"
    },
    "actionRewrite": {
      "message": "Bulk rewrite"
    },
    "actionSave": {
      "message": "Save"
    },
    "actionScanEmpty": {
      "message": "Clean empty folders"
    },
    "actionSelectAll": {
      "message": "Select all"
    },
    "actionStop": {
      "message": "Stop"
    },
    "actionTagsNote": {
      "message": "Tags and notes"
    },
    "actionTestConnection": {
      "message": "Test connection"
    },
    "actionUndo": {
      "message": "Undo"
    },
    "allBookmarks": {
      "message": "All bookmarks"
    },
    "backupLocalDone": {
      "message": "Backed up locally"
    },
    "backupTitle": {
      "message": "Backup and restore"
    },
    "backupUploaded": {
      "message": "Uploaded to cloud: $name"
    },
    "bookmarkCreateTitle": {
      "message": "New bookmark"
    },
    "bookmarkCreated": {
      "message": "Bookmark created"
    },
    "bookmarkDeleteMessage": {
      "message": "Delete the $count selected bookmark(s)?"
    },
    "bookmarkDeleteTitle": {
      "message": "Delete bookmarks"
    },
    "bookmarkDeleted": {
      "message": "Deleted $count bookmark(s)"
    },
    "bookmarkEditTitle": {
      "message": "Edit bookmark"
    },
    "bookmarkSaved": {
      "message": "Bookmark saved"
    },
    "captureCloseWindow": {
      "message": "Close window"
    },
    "captureConfirmMessage": {
      "message": "Save $count bookmark(s) to \"$folder\""
    },
    "captureConfirmTitle": {
      "message": "Save tabs"
    },
    "captureDuplicateTag": {
      "message": "Already saved"
    },
    "captureEmpty": {
      "message": "No page in the current window can be saved"
    },
    "captureExcludedHint": {
      "message": "$count page(s) cannot be saved and are excluded"
    },
    "captureLoading": {
      "message": "Reading tabs…"
    },
    "captureModePage": {
      "message": "Save the current page"
    },
    "captureModeWindow": {
      "message": "Save tabs in the current window"
    },
    "captureNoteLabel": {
      "message": "Note for all (optional)"
    },
    "captureNotePlaceholder": {
      "message": "Added to the bookmarks created this time"
    },
    "captureResultCreated": {
      "message": "$count created"
    },
    "captureResultDuplicates": {
      "message": "$count duplicate(s) skipped"
    },
    "captureResultExcluded": {
      "message": "$count page(s) excluded"
    },
    "captureResultFailed": {
      "message": "$count failed"
    },
    "captureResultTitle": {
      "message": "Save result"
    },
    "captureSelected": {
      "message": "$count selected"
    },
    "captureTargetLabel": {
      "message": "Target folder"
    },
    "captureTitle": {
      "message": "Save current window tabs",
      "description": "Capture window title"
    },
    "classifyApplied": {
      "message": "Moved $moved, failed $invalid"
    },
    "classifyApplyMessage": {
      "message": "$count bookmark(s) will be moved by the rules"
    },
    "classifyApplyTitle": {
      "message": "Apply classification"
    },
    "classifyDiscardHint": {
      "message": "Original folders that become empty will be deleted"
    },
    "classifyImpact": {
      "message": "Preview: $total bookmark(s), $folders empty folder(s) will be removed"
    },
    "classifyManual": {
      "message": "Adjust manually"
    },
    "classifyPreviewHint": {
      "message": "You can adjust the preview below; changes apply to this run only"
    },
    "classifyPreviewTitle": {
      "message": "Classification preview"
    },
    "classifyRemovedFolders": {
      "message": "$count empty folder(s) will be removed"
    },
    "clearVaultDetail": {
      "message": "Cloud backup files are untouched; only the local copy of the key is removed."
    },
    "clearVaultMessage": {
      "message": "Clear the key cached on this device? You will need to enter the password again to decrypt backups."
    },
    "clearVaultTitle": {
      "message": "Clear local key"
    },
    "cloudDeleteMessage": {
      "message": "Delete cloud backup $name?"
    },
    "cloudDeleteTitle": {
      "message": "Delete cloud backup"
    },
    "cloudDeleted": {
      "message": "Cloud backup deleted"
    },
    "cloudEmpty": {
      "message": "No cloud backups yet"
    },
    "cloudEncryptedOff": {
      "message": "Not encrypted"
    },
    "cloudEncryptedOn": {
      "message": "Encrypted"
    },
    "cloudNotConfigured": {
      "message": "WebDAV is not configured"
    },
    "cloudPasswordHint": {
      "message": "The password is used for this operation only and is never written to disk"
    },
    "cloudPasswordTitle": {
      "message": "Enter backup password"
    },
    "cloudRestoreMessage": {
      "message": "Restore $count bookmark(s) from $name ($type)"
    },
    "cloudRestoreTitle": {
      "message": "Restore from cloud"
    },
    "cloudTitle": {
      "message": "Cloud backups"
    },
    "cmdOpenManager": {
      "message": "Open BookVault manager",
      "description": "Keyboard shortcut description"
    },
    "colActions": {
      "message": "Actions"
    },
    "colCount": {
      "message": "Count"
    },
    "colFileName": {
      "message": "File name"
    },
    "colFolder": {
      "message": "Folder"
    },
    "colSize": {
      "message": "Size"
    },
    "colSource": {
      "message": "Source"
    },
    "colStatus": {
      "message": "Status"
    },
    "colTime": {
      "message": "Time"
    },
    "colTitle": {
      "message": "Title"
    },
    "copiedCount": {
      "message": "Copied $count link(s)"
    },
    "csvCheckedAt": {
      "message": "Checked at"
    },
    "csvDomain": {
      "message": "Domain"
    },
    "csvError": {
      "message": "Failure reason"
    },
    "csvHttpStatus": {
      "message": "HTTP status"
    },
    "csvNoData": {
      "message": "The current list is empty; nothing to export"
    },
    "csvProxySuspect": {
      "message": "Proxy suspected"
    },
    "csvUrl": {
      "message": "URL"
    },
    "davCode_forbidden": {
      "message": "Access denied (403)"
    },
    "davCode_network": {
      "message": "Network unreachable; check your connection or proxy"
    },
    "davCode_notFound": {
      "message": "Path not found (404); check the remote directory"
    },
    "davCode_ok": {
      "message": "Connection OK"
    },
    "davCode_rateLimited": {
      "message": "Too many requests (429); try again later"
    },
    "davCode_serverError": {
      "message": "Server error (5xx); try again later"
    },
    "davCode_unauthorized": {
      "message": "Authentication failed (401); check the account and app password"
    },
    "davCode_unknown": {
      "message": "Unknown error"
    },
    "davTestDetail": {
      "message": "Details"
    },
    "davTestDuration": {
      "message": "Duration"
    },
    "davTestMethod": {
      "message": "Method"
    },
    "davTestOk": {
      "message": "Connected; $count file(s) on the server"
    },
    "davTestStatus": {
      "message": "Status"
    },
    "davTestUrl": {
      "message": "Final URL"
    },
    "dedupeCount": {
      "message": "$count item(s) in this group"
    },
    "dedupeEmpty": {
      "message": "No bookmarks share the same URL"
    },
    "dedupeFooterHint": {
      "message": "Checked items are kept, the rest are deleted and can be restored from a snapshot"
    },
    "dedupeMergeHint": {
      "message": "Tags and notes of deleted bookmarks are not migrated to the kept one"
    },
    "dedupeMergeMessage": {
      "message": "Delete $count duplicate bookmark(s)?"
    },
    "dedupeMergeTitle": {
      "message": "Merge duplicates"
    },
    "dedupeMerged": {
      "message": "Merged and deleted $count"
    },
    "dedupeSkipped": {
      "message": "Skipped $count oversized group(s)"
    },
    "dedupeTabTitle": {
      "message": "Similar titles ($count groups)"
    },
    "dedupeTabUrl": {
      "message": "Same URL ($count groups)"
    },
    "dedupeTitle": {
      "message": "Duplicate bookmarks"
    },
    "dedupeTitleEmpty": {
      "message": "No bookmarks have similar titles"
    },
    "dedupeTitleHint": {
      "message": "Adjust the similarity threshold in settings"
    },
    "detailEmpty": {
      "message": "Select a bookmark in the list to see its details"
    },
    "detailTitle": {
      "message": "Bookmark details"
    },
    "emptyFolderCleaned": {
      "message": "Removed $count empty folder(s)"
    },
    "emptyFolderMessage": {
      "message": "Delete $count empty folder(s)?"
    },
    "emptyFolderNone": {
      "message": "No empty folders found"
    },
    "emptyFolderTitle": {
      "message": "Clean empty folders"
    },
    "encryptAck": {
      "message": "I understand the risks above"
    },
    "encryptChangeTitle": {
      "message": "Change backup password"
    },
    "encryptEnabledDone": {
      "message": "Backup encryption enabled"
    },
    "encryptNeedAck": {
      "message": "Please confirm the risk notice first"
    },
    "encryptSetupTitle": {
      "message": "Set backup password"
    },
    "encryptionRiskHint": {
      "message": "If the password is lost, encrypted cloud backups cannot be recovered. BookVault never stores your password."
    },
    "encryptionScopeHint": {
      "message": "Encryption applies to cloud backups and exported files only; local snapshots stay plain text."
    },
    "errBackgroundUnavailable": {
      "message": "The background service is not responding; retry or reload the extension"
    },
    "errBackupCorrupted": {
      "message": "The backup file is corrupted and cannot be parsed"
    },
    "errBackupCryptoMissing": {
      "message": "The backup file is missing encryption parameters"
    },
    "errBackupStructure": {
      "message": "The backup file format is invalid"
    },
    "errBookmarksRead": {
      "message": "Failed to read browser bookmarks"
    },
    "errBookmarksWrite": {
      "message": "Failed to write browser bookmarks"
    },
    "errDavForbidden": {
      "message": "WebDAV access denied (403); check the app password permissions"
    },
    "errDavNameConflict": {
      "message": "A file with the same name already exists in the cloud"
    },
    "errDavNetwork": {
      "message": "Cannot reach the WebDAV server; check your network"
    },
    "errDavNotFound": {
      "message": "WebDAV path not found (404)"
    },
    "errDavRateLimited": {
      "message": "WebDAV rate limited (429); try again later"
    },
    "errDavServer": {
      "message": "WebDAV server error (5xx)"
    },
    "errDavUnauthorized": {
      "message": "WebDAV authentication failed (401); check the account and app password"
    },
    "errDavUnknown": {
      "message": "WebDAV operation failed (unknown error)"
    },
    "errFolderMissing": {
      "message": "The target folder no longer exists"
    },
    "errFolderNoUrl": {
      "message": "This node is not a bookmark, so its link cannot be rewritten"
    },
    "errJobNotFound": {
      "message": "Job not found or already finished"
    },
    "errMobileRoot": {
      "message": "The mobile bookmarks root cannot be modified"
    },
    "errNoHttpBookmarks": {
      "message": "No http(s) bookmarks to check in the current scope"
    },
    "errNoManagedRoot": {
      "message": "No managed root found; choose one in settings first"
    },
    "errNodeMissing": {
      "message": "The bookmark no longer exists"
    },
    "errNotFolder": {
      "message": "This node is not a folder"
    },
    "errNothingToUndo": {
      "message": "Nothing to undo"
    },
    "errPasswordEmpty": {
      "message": "Password cannot be empty"
    },
    "errPasswordRequired": {
      "message": "This backup is encrypted; enter the password"
    },
    "errPasswordWrong": {
      "message": "Wrong password, cannot decrypt"
    },
    "errRecycleItemMissing": {
      "message": "The recycle bin item no longer exists"
    },
    "errRestoreFailed": {
      "message": "An error occurred during restore"
    },
    "errRootProtected": {
      "message": "Built-in browser roots cannot be modified"
    },
    "errRuleCategoryEmpty": {
      "message": "Category cannot be empty"
    },
    "errRuleImportInvalid": {
      "message": "Invalid rules file format"
    },
    "errRulePatternEmpty": {
      "message": "Pattern cannot be empty"
    },
    "errSchemaTooNew": {
      "message": "Data was written by a newer version; running read-only. Please update the extension."
    },
    "errSnapshotCorrupted": {
      "message": "Snapshot checksum failed; the data may be corrupted"
    },
    "errSnapshotMissing": {
      "message": "Snapshot not found or already deleted"
    },
    "errSnapshotRequired": {
      "message": "A snapshot is required before this operation"
    },
    "errSnapshotWrite": {
      "message": "Failed to write the snapshot; the operation was aborted"
    },
    "errStorageRead": {
      "message": "Failed to read local data"
    },
    "errStorageTooLarge": {
      "message": "Data exceeds the browser storage quota"
    },
    "errStorageWrite": {
      "message": "Failed to write local data"
    },
    "errTagEmpty": {
      "message": "Tag name cannot be empty"
    },
    "errTitleEmpty": {
      "message": "Title cannot be empty"
    },
    "errUndoSnapshotMissing": {
      "message": "The data needed to undo is missing"
    },
    "errUnknown": {
      "message": "Something went wrong"
    },
    "errUrlEmpty": {
      "message": "URL cannot be empty"
    },
    "errUrlInvalid": {
      "message": "Invalid URL format"
    },
    "errUrlScheme": {
      "message": "Only http and https links are supported"
    },
    "errVaultMissing": {
      "message": "No key stored on this device; enter the password"
    },
    "errWebdavConfig": {
      "message": "WebDAV settings are incomplete; fill in server, account and app password"
    },
    "errWebdavDisabled": {
      "message": "WebDAV is not enabled"
    },
    "extDesc": {
      "message": "Local-first bookmark manager: batch edits, dead link checks, rule-based sorting, duplicate merging, tags and notes, snapshot rollback and encrypted Nutstore backups.",
      "description": "Extension description"
    },
    "extName": {
      "message": "BookVault",
      "description": "Extension name shown on the management page and store"
    },
    "fieldAutoBackupDaily": {
      "message": "Daily auto backup"
    },
    "fieldAutoBackupHour": {
      "message": "Auto backup hour"
    },
    "fieldBookmarkTitle": {
      "message": "Title"
    },
    "fieldBookmarkUrl": {
      "message": "URL"
    },
    "fieldCloudKeep": {
      "message": "Cloud backups to keep"
    },
    "fieldConcurrency": {
      "message": "Check concurrency"
    },
    "fieldEnabled": {
      "message": "Enable this rule"
    },
    "fieldEncryptEnabled": {
      "message": "Encrypt backups"
    },
    "fieldLanguage": {
      "message": "Language"
    },
    "fieldLocalKeep": {
      "message": "Local snapshots to keep"
    },
    "fieldNewPassword": {
      "message": "New password"
    },
    "fieldNote": {
      "message": "Note"
    },
    "fieldOldPassword": {
      "message": "Current password"
    },
    "fieldRecycleKeep": {
      "message": "Recycle bin items to keep"
    },
    "fieldRememberKey": {
      "message": "Remember key on this device"
    },
    "fieldRuleCategory": {
      "message": "Category"
    },
    "fieldRulePattern": {
      "message": "Pattern"
    },
    "fieldRuleType": {
      "message": "Rule type"
    },
    "fieldSimilarity": {
      "message": "Title similarity threshold"
    },
    "fieldTags": {
      "message": "Tags"
    },
    "fieldTargetFolder": {
      "message": "Target folder"
    },
    "fieldTheme": {
      "message": "Theme"
    },
    "fieldTimeout": {
      "message": "Timeout per request (s)"
    },
    "fieldWebdavDir": {
      "message": "Remote directory"
    },
    "fieldWebdavEnabled": {
      "message": "Enable WebDAV"
    },
    "fieldWebdavPassword": {
      "message": "App password"
    },
    "fieldWebdavServer": {
      "message": "Server URL"
    },
    "fieldWebdavUser": {
      "message": "Account (email)"
    },
    "filterAllStatus": {
      "message": "All statuses"
    },
    "filterTags": {
      "message": "Tag filter"
    },
    "folderCreateTitle": {
      "message": "New folder"
    },
    "folderCreated": {
      "message": "Folder created"
    },
    "folderDeleteCount": {
      "message": "$count bookmark(s) inside will be deleted too"
    },
    "folderDeleteMessage": {
      "message": "Delete folder \"$name\"?"
    },
    "folderDeleteTitle": {
      "message": "Delete folder"
    },
    "folderDeleted": {
      "message": "Folder and its $count bookmark(s) deleted"
    },
    "folderMoveMessage": {
      "message": "Move \"$name\" to the target folder"
    },
    "folderMoveTarget": {
      "message": "Target: $target"
    },
    "folderMoveTitle": {
      "message": "Move folder"
    },
    "folderRenameTitle": {
      "message": "Rename folder"
    },
    "folderTreeLabel": {
      "message": "Folder tree"
    },
    "foldersTitle": {
      "message": "Folders"
    },
    "importChooseTarget": {
      "message": "Choose import location"
    },
    "importDone": {
      "message": "Import finished: $created created, $duplicates duplicates skipped, $invalid invalid"
    },
    "importDuplicates": {
      "message": "$count duplicate(s) will be skipped"
    },
    "importInvalid": {
      "message": "$count invalid entr(ies) will be skipped"
    },
    "importMessage": {
      "message": "$count bookmark(s) will be imported from \"$name\""
    },
    "importMeta": {
      "message": "$count tag/note record(s) will be restored"
    },
    "importNothing": {
      "message": "Nothing to import ($duplicates duplicate(s), $invalid invalid)"
    },
    "importPasswordTitle": {
      "message": "Enter backup password"
    },
    "importRules": {
      "message": "$count rule(s) will be imported"
    },
    "importTarget": {
      "message": "Import into \"$target\""
    },
    "importTargetHint": {
      "message": "Imported bookmarks are written into the managed root"
    },
    "importTitle": {
      "message": "Confirm import"
    },
    "ioHint": {
      "message": "Supports BookVault JSON backups and HTML bookmark files exported by the browser"
    },
    "ioTitle": {
      "message": "Import and export"
    },
    "jobCanceled": {
      "message": "Job canceled"
    },
    "jobLinkCheck": {
      "message": "Dead link check"
    },
    "jobStarted": {
      "message": "Started on $count item(s)"
    },
    "jobTitleRefresh": {
      "message": "Title refresh"
    },
    "labelEncrypted": {
      "message": "Encrypted"
    },
    "labelPlain": {
      "message": "Not encrypted"
    },
    "labelUnknownFormat": {
      "message": "Unknown format"
    },
    "languageSystem": {
      "message": "Follow system"
    },
    "lastBackupError": {
      "message": "Last backup failed"
    },
    "lastDailyBackup": {
      "message": "Last auto backup: $date"
    },
    "loading": {
      "message": "Loading…"
    },
    "localSnapshotsTitle": {
      "message": "Local snapshots"
    },
    "managerTitle": {
      "message": "Bookmarks",
      "description": "Manager page title"
    },
    "menuAddBookmark": {
      "message": "Save to BookVault",
      "description": "Browser context menu item"
    },
    "metaSaved": {
      "message": "Tags and notes saved"
    },
    "moveMessage": {
      "message": "$count bookmark(s) will be moved to the selected folder"
    },
    "moveTitle": {
      "message": "Move to folder"
    },
    "movedDone": {
      "message": "Moved $moved, skipped $skipped"
    },
    "no": {
      "message": "No"
    },
    "noBookmarks": {
      "message": "No bookmarks"
    },
    "noFolders": {
      "message": "No folders"
    },
    "noRuleMatched": {
      "message": "No rule matched"
    },
    "noSnapshots": {
      "message": "No local snapshots"
    },
    "none": {
      "message": "None"
    },
    "notePlaceholder": {
      "message": "Add what this bookmark is for or some context"
    },
    "noteTruncated": {
      "message": "Note too long and was truncated"
    },
    "opAction_capture": {
      "message": "Capture"
    },
    "opAction_classify": {
      "message": "Classify"
    },
    "opAction_delete": {
      "message": "Delete"
    },
    "opAction_import": {
      "message": "Import"
    },
    "opAction_move": {
      "message": "Move"
    },
    "opAction_refreshTitle": {
      "message": "Refresh titles"
    },
    "opAction_rename": {
      "message": "Rename"
    },
    "opAction_restore": {
      "message": "Restore"
    },
    "opAction_rewrite": {
      "message": "Rewrite links"
    },
    "openManyMessage": {
      "message": "About to open $count tab(s) (limit $limit per run). Continue?"
    },
    "openManyTitle": {
      "message": "Open tabs in bulk"
    },
    "orphanClearDetail": {
      "message": "The bookmarks these notes belonged to are gone; clearing cannot be undone"
    },
    "orphanClearMessage": {
      "message": "Clear $count orphan note(s)?"
    },
    "orphanClearTitle": {
      "message": "Clear orphan notes"
    },
    "orphanCleared": {
      "message": "Orphan notes cleared"
    },
    "orphanHint": {
      "message": "These tags and notes no longer match any bookmark; you can clean them up"
    },
    "orphanTitle": {
      "message": "Orphan tags and notes"
    },
    "passwordChanged": {
      "message": "Password changed"
    },
    "pendingCloudBackup": {
      "message": "A cloud backup was skipped and will be retried automatically"
    },
    "placeholder": {
      "message": "Skeleton page: coming soon",
      "description": "Placeholder hint, remove after implementation"
    },
    "popupBackupDone": {
      "message": "Backup finished"
    },
    "popupBackupFailed": {
      "message": "Last backup failed: $reason"
    },
    "popupBackupLocalDone": {
      "message": "Local snapshot created"
    },
    "popupBackupNever": {
      "message": "No cloud backup yet"
    },
    "popupBackupNow": {
      "message": "Back up now"
    },
    "popupLastBackup": {
      "message": "Last cloud backup: $time"
    },
    "popupLinkCheckStarted": {
      "message": "Started checking $count link(s)"
    },
    "popupOpenManager": {
      "message": "Open manager"
    },
    "popupPendingCloud": {
      "message": "A cloud backup is waiting to be retried"
    },
    "popupPendingVault": {
      "message": "An encrypted backup is waiting for the password; handle it in the manager"
    },
    "popupTitle": {
      "message": "BookVault",
      "description": "Popup title"
    },
    "proxyHint": {
      "message": "These domains are marked as \"proxy suspected\" when checks fail"
    },
    "recycleClearDetail": {
      "message": "This cannot be undone"
    },
    "recycleClearMessage": {
      "message": "Empty the recycle bin?"
    },
    "recycleClearTitle": {
      "message": "Empty recycle bin"
    },
    "recycleCleared": {
      "message": "Recycle bin emptied ($count item(s))"
    },
    "recycleEmpty": {
      "message": "Recycle bin is empty"
    },
    "recycleHint": {
      "message": "Deleted bookmarks are kept here for a while"
    },
    "recycleRecoverable": {
      "message": "Can be restored from the recycle bin"
    },
    "recycleRestored": {
      "message": "Restored $count item(s) from the recycle bin"
    },
    "recycleTitle": {
      "message": "Recycle bin"
    },
    "restoreDone": {
      "message": "Restored $restored, re-bound tags $bound, orphan $orphan"
    },
    "restoreFailedNoRollback": {
      "message": "Restore failed and rollback also failed; use snapshot $id to restore manually"
    },
    "restoreFailedRolledBack": {
      "message": "Restore failed and was rolled back to the previous state (snapshot $id)"
    },
    "restoreLossHint": {
      "message": "Restoring overwrites the current bookmark structure; consider backing up first"
    },
    "restoreMessage": {
      "message": "Restore $count bookmark(s)?"
    },
    "restoreSnapshotId": {
      "message": "Snapshot before restore: $id"
    },
    "restoreTitle": {
      "message": "Confirm restore"
    },
    "rewriteAffected": {
      "message": "$count to update"
    },
    "rewriteCaseSensitive": {
      "message": "Match case"
    },
    "rewriteConfirmMessage": {
      "message": "$count bookmark(s) will be modified"
    },
    "rewriteDone": {
      "message": "Rewrite finished: $updated updated, $skipped skipped"
    },
    "rewriteEmptyTitleConfirm": {
      "message": "$count of them will become an empty title; please confirm"
    },
    "rewriteEmptyTitleWarn": {
      "message": "$count will become an empty title"
    },
    "rewriteHint": {
      "message": "$count bookmark(s) selected; only entries that match the rule and actually change are written"
    },
    "rewriteMode": {
      "message": "Operation"
    },
    "rewriteNoAffected": {
      "message": "No entry matches the rule; adjust it and try again"
    },
    "rewritePrefix": {
      "message": "Add prefix"
    },
    "rewritePrefixText": {
      "message": "Prefix"
    },
    "rewritePreviewMore": {
      "message": "$count more not listed in the preview"
    },
    "rewriteReplace": {
      "message": "Find and replace"
    },
    "rewriteReplacement": {
      "message": "Replace with"
    },
    "rewriteResultTitle": {
      "message": "Rewrite result"
    },
    "rewriteSearch": {
      "message": "Find"
    },
    "rewriteSkippedCount": {
      "message": "$count to skip"
    },
    "rewriteSuffix": {
      "message": "Add suffix"
    },
    "rewriteSuffixText": {
      "message": "Suffix"
    },
    "rewriteTarget": {
      "message": "Field"
    },
    "rewriteTargetTitle": {
      "message": "Title"
    },
    "rewriteTargetUrl": {
      "message": "URL"
    },
    "rewriteTitle": {
      "message": "Bulk rewrite"
    },
    "rewriteUrlOnlyReplace": {
      "message": "URLs only support find and replace; the result must pass http/https validation"
    },
    "ruleCategoryPlaceholder": {
      "message": "e.g. Dev tools"
    },
    "ruleImportDone": {
      "message": "Imported $count rule(s)"
    },
    "rulePatternPlaceholder": {
      "message": "e.g. github.com or tutorial"
    },
    "ruleTypeDomainContains": {
      "message": "Domain contains"
    },
    "ruleTypeDomainExact": {
      "message": "Exact domain"
    },
    "ruleTypeTitleKeyword": {
      "message": "Title keyword"
    },
    "ruleTypeUrlKeyword": {
      "message": "URL keyword"
    },
    "rulesDragHint": {
      "message": "Drag to reorder rules of the same type"
    },
    "rulesGroupEmpty": {
      "message": "No rules of this type yet"
    },
    "rulesPriorityHint": {
      "message": "Priority between types is fixed; dragging only reorders within a type"
    },
    "rulesTitle": {
      "message": "Classification rules"
    },
    "searchPlaceholder": {
      "message": "Search titles, links, tags or notes"
    },
    "selectedCount": {
      "message": "$count selected"
    },
    "settingsEncryption": {
      "message": "Encryption"
    },
    "settingsGeneral": {
      "message": "General"
    },
    "settingsProxy": {
      "message": "Domains that may need a proxy"
    },
    "settingsSaved": {
      "message": "Settings saved"
    },
    "settingsTitle": {
      "message": "Settings"
    },
    "settingsWebdav": {
      "message": "Nutstore WebDAV"
    },
    "snapshotDeleteMessage": {
      "message": "Delete the snapshot from $time?"
    },
    "snapshotDeleteTitle": {
      "message": "Delete snapshot"
    },
    "snapshotDeleted": {
      "message": "Snapshot deleted"
    },
    "snapshotPreviewTitle": {
      "message": "Snapshot contents"
    },
    "snapshotRecoverable": {
      "message": "A snapshot was taken before this operation and can restore it"
    },
    "snapshotSource_autoDaily": {
      "message": "Daily auto"
    },
    "snapshotSource_import": {
      "message": "Before import"
    },
    "snapshotSource_manual": {
      "message": "Manual"
    },
    "snapshotSource_preOperation": {
      "message": "Auto before change"
    },
    "snapshotSource_restorePre": {
      "message": "Before restore"
    },
    "sortAsc": {
      "message": "Ascending"
    },
    "sortDateAdded": {
      "message": "By date added"
    },
    "sortDesc": {
      "message": "Descending"
    },
    "sortDomain": {
      "message": "By domain"
    },
    "sortTitle": {
      "message": "By title"
    },
    "statsCategories": {
      "message": "Top-level distribution"
    },
    "statsDead": {
      "message": "Dead links"
    },
    "statsDuplicates": {
      "message": "Duplicate groups"
    },
    "statsEmptyFolders": {
      "message": "Empty folders"
    },
    "statsNoCategories": {
      "message": "No category data yet"
    },
    "statsSuspect": {
      "message": "Suspect links"
    },
    "statsTags": {
      "message": "Tags"
    },
    "statsTitle": {
      "message": "Overview"
    },
    "statsTotal": {
      "message": "Total bookmarks"
    },
    "statusDead": {
      "message": "Dead"
    },
    "statusOk": {
      "message": "OK"
    },
    "statusSuspect": {
      "message": "Suspect"
    },
    "statusUnsupported": {
      "message": "Not supported"
    },
    "statusUntested": {
      "message": "Untested"
    },
    "tagDeleteDetail": {
      "message": "The tag is removed from all bookmarks; notes are unaffected"
    },
    "tagDeleteDone": {
      "message": "Tag removed from $count bookmark(s)"
    },
    "tagDeleteMessage": {
      "message": "Delete tag \"$tag\"?"
    },
    "tagDeleteTitle": {
      "message": "Delete tag"
    },
    "tagHint": {
      "message": "Up to $max tags per bookmark"
    },
    "tagPlaceholder": {
      "message": "Type a tag and press Enter or comma"
    },
    "tagRenameDone": {
      "message": "Renamed; $count bookmark(s) affected"
    },
    "tagsEmpty": {
      "message": "No tags yet"
    },
    "tagsHint": {
      "message": "Tags live only inside BookVault and are not written back to browser bookmarks"
    },
    "tagsTitle": {
      "message": "Tags"
    },
    "themeDark": {
      "message": "Dark"
    },
    "themeLight": {
      "message": "Light"
    },
    "themeSystem": {
      "message": "Follow system"
    },
    "titleApplied": {
      "message": "Updated $updated title(s), $failed failed"
    },
    "titleApplyDetail": {
      "message": "Changes are recorded in the undo log and can be undone once"
    },
    "titleApplyMessage": {
      "message": "$count bookmark title(s) will change"
    },
    "titleApplyTitle": {
      "message": "Apply new titles"
    },
    "titleRefreshNoChange": {
      "message": "Titles are unchanged"
    },
    "undoEmpty": {
      "message": "Nothing to undo"
    },
    "undoHint": {
      "message": "Only the most recent operation can be undone"
    },
    "undoLatest": {
      "message": "Last undoable: $action ($time)"
    },
    "undoMessage": {
      "message": "Undo \"$action\"?"
    },
    "undoTitle": {
      "message": "Undo"
    },
    "unnamedFolder": {
      "message": "Untitled folder"
    },
    "vaultCached": {
      "message": "Key cached on this device"
    },
    "vaultCleared": {
      "message": "Local key cleared"
    },
    "vaultMissing": {
      "message": "No key stored on this device"
    },
    "view_backup": {
      "message": "Backup"
    },
    "view_manager": {
      "message": "Bookmarks"
    },
    "view_rules": {
      "message": "Rules"
    },
    "view_settings": {
      "message": "Settings"
    },
    "view_stats": {
      "message": "Stats"
    },
    "view_tags": {
      "message": "Tags"
    },
    "webdavPasswordRisk": {
      "message": "The app password is stored in plain text locally; avoid this on shared computers"
    },
    "yes": {
      "message": "Yes"
    }
  }
};
