/**
 * src/main/preload.js
 * 通过 contextBridge 将 window.api 暴露给渲染进程。
 * 所有渲染层的 window.api.xxx 调用都在这里映射到对应的 IPC channel。
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    // 平台信息（同步，直接读取）
    platform: process.platform,

    // ── 应用配置 ──────────────────────────────────────────────
    getAppConfig: () => ipcRenderer.invoke("get-app-config"),
    setAppConfig: (config) => ipcRenderer.invoke("set-app-config", config),
    initAppConfig: () => ipcRenderer.invoke("init-app-config"),

    // ── Cursor 信息 ───────────────────────────────────────────
    getCursorInfo: () => ipcRenderer.invoke("get-cursor-info"),
    getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
    getActiveCursorEmail: () => ipcRenderer.invoke("get-active-cursor-email"),

    // ── 账号切换 ──────────────────────────────────────────────
    resetCursorAccount: (account) => ipcRenderer.invoke("reset-cursor-account", account),

    // ── 无感热切换（token server，无需重启 Cursor） ───────────
    hotSwitchAccount: (account) => ipcRenderer.invoke("hot-switch-account", account),
    clearPendingToken: () => ipcRenderer.invoke("clear-pending-token"),
    getTokenServerPort: () => ipcRenderer.invoke("get-token-server-port"),

    // ── 自动换号 ──────────────────────────────────────────────
    setAutoSwitch: (enabled) => ipcRenderer.invoke("set-auto-switch", enabled),
    getAutoSwitchStats: () => ipcRenderer.invoke("get-auto-switch-stats"),
    setCurrentEmail: (email) => ipcRenderer.invoke("set-current-email", email),
    onAutoSwitchEvent: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on("auto-switch-event", handler);
        return () => ipcRenderer.removeListener("auto-switch-event", handler);
    },

    // ── 机器码 ────────────────────────────────────────────────
    setRandomMachineInfo: () => ipcRenderer.invoke("set-random-machine-info"),
    setMachineGuid: (guid) => ipcRenderer.invoke("set-machine-guid", guid),

    // ── 权限检查 ──────────────────────────────────────────────
    checkAdminRights: () => ipcRenderer.invoke("check-admin-rights"),

    // ── 备份/恢复 ─────────────────────────────────────────────
    backup: () => ipcRenderer.invoke("backup"),
    listBackups: () => ipcRenderer.invoke("list-backups"),
    restoreBackup: (backupName) => ipcRenderer.invoke("restore-backup", backupName),

    // ── 许可证 ────────────────────────────────────────────────
    getAppLicenseInfo: () => ipcRenderer.invoke("get-app-license-info"),

    // ── 渲染层挂载通知 ────────────────────────────────────────
    renderOnMounted: () => ipcRenderer.invoke("render-on-mounted"),

    // ── HTTP 代理请求 ─────────────────────────────────────────
    request: (options) => ipcRenderer.invoke("api-request", options),

    // ── 注入 / 还原 ───────────────────────────────────────────
    getPatchStatus: () => ipcRenderer.invoke("get-patch-status"),
    applyPatch: () => ipcRenderer.invoke("apply-patch"),
    restorePatch: () => ipcRenderer.invoke("restore-patch"),

    // ── 禁用 Cursor 更新 ──────────────────────────────────────
    getDisableUpdateStatus: () => ipcRenderer.invoke("get-disable-update-status"),
    setDisableUpdate: (disabled) => ipcRenderer.invoke("set-disable-update", disabled),

    // ── GitHub 版本更新检查 ───────────────────────────────────
    checkGithubUpdate: () => ipcRenderer.invoke("check-github-update"),

    // ── 免责声明 ──────────────────────────────────────────────
    getDisclaimerAgreed: () => ipcRenderer.invoke("get-disclaimer-agreed"),
    setDisclaimerAgreed: () => ipcRenderer.invoke("set-disclaimer-agreed"),

    // ── 外部链接 ──────────────────────────────────────────────
    openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),

    // ── 窗口控制 ──────────────────────────────────────────────
    minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
    maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
    closeWindow: () => ipcRenderer.invoke("window-close"),

    // ── 日志监听（主进程 → 渲染层推送） ─────────────────────────
    onLog: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on("log-message", handler);
        // 返回取消订阅函数
        return () => ipcRenderer.removeListener("log-message", handler);
    },

    // ── 主进程消息监听（进度等） ──────────────────────────────
    onMainProcessMessage: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on("main-process-message", handler);
        return () => ipcRenderer.removeListener("main-process-message", handler);
    },

    // ── 账号数据库操作（嵌套对象） ────────────────────────────
    accounts: {
        ensureDatabaseDirectoryExists: () => ipcRenderer.invoke("accounts-ensure-db"),
        listAccounts: (opts) => ipcRenderer.invoke("accounts-list", opts),
        createOrUpdateAccount: (account) => ipcRenderer.invoke("accounts-create-or-update", account),
        deleteAccounts: (emails, handleId) => ipcRenderer.invoke("accounts-delete", emails, handleId),
        importAccountsFromJSON: (handleId) => ipcRenderer.invoke("accounts-import", handleId),
        exportAccountsToJSON: (handleId) => ipcRenderer.invoke("accounts-export", handleId),
        backupDatabase: () => ipcRenderer.invoke("accounts-backup-db"),
        restoreDatabase: () => ipcRenderer.invoke("accounts-restore-db"),
    },

    // ── 帮助文档 ──────────────────────────────────────────────
    openHelpDoc: () => ipcRenderer.invoke("open-help-doc"),
    getHelpDocPath: () => ipcRenderer.invoke("get-help-doc-path"),});
