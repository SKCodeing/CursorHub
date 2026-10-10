/**
 * src/main/ipc/index.js
 * 注册所有 IPC Handler，对接渲染层 window.api.*
 */
import { ipcMain, shell, app } from "electron";
import path from "path";
import fs from "fs";
import { getAppConfig, setAppConfig } from "../services/config.js";
import { getCursorInfo, writeCursorAccount, getActiveCursorInfoFromTokenServers, getAllActiveFromTokenServers } from "../services/cursor.js";
import { getSystemInfo, setRandomMachineId, setMachineGuid, checkAdminRights } from "../services/system.js";
import { resetCursorAccount } from "../services/cursorSwitch.js";
import { backup, listBackups, restoreBackup } from "../services/backup.js";
import { handleApiRequest } from "../../utils/api.js";
import { pushTokenToCursor, clearPendingToken, getServerPort } from "../services/tokenServer.js";
import { setAutoSwitch, isAutoSwitchEnabled, setCurrentEmail, getAutoSwitchStats, getCurrentEmail } from "../services/autoSwitch.js";
import { getPatchStatus, applyPatch, restorePatch, restartCursor, getDisableUpdateStatus, setDisableUpdate } from "../services/cursorSettings.js";
import {
    ensureDatabaseDirectoryExists,
    listAccounts,
    createOrUpdateAccount,
    deleteAccounts,
    importAccountsFromJSON,
    exportAccountsToJSON,
    backupDatabase,
    restoreDatabase,
} from "../services/accountDb.js";

export function registerIpcHandlers() {

// ── 工具：从 JWT 字符串提取 exp 时间戳（秒），解析失败返回 0 ──
function getJwtExp(token) {
    if (!token || typeof token !== "string") return 0;
    try {
        const jwt = token.match(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\./)?.[1];
        if (!jwt) return 0;
        const payload = JSON.parse(Buffer.from(jwt, "base64url").toString("utf8"));
        return typeof payload.exp === "number" ? payload.exp : 0;
    } catch {
        return 0;
    }
}
    // ── 应用配置 ──────────────────────────────────────────────
    ipcMain.handle("get-app-config", () => {
        return getAppConfig();
    });

    ipcMain.handle("set-app-config", (_, config) => {
        return setAppConfig(config);
    });

    ipcMain.handle("init-app-config", () => {
        // 重新探测路径，返回最新配置
        return getAppConfig();
    });

    // ── Cursor 信息 ───────────────────────────────────────────
    ipcMain.handle("get-cursor-info", () => {
        return getCursorInfo();
    });

    ipcMain.handle("get-system-info", () => {
        return getSystemInfo();
    });

    /**
     * 获取 Cursor 当前实际使用的账号。
     *
     * 策略：
     * - storage.json 反映「写盘型」助手（AI助手）的最新状态
     * - token server 反映「热推型」助手（cursor登录助手）的最新状态
     * - 两个来源独立上报，调用方（定时采集/刷新）自行对比变化
     *
     * 返回：{ storage, live[] } 两个来源的完整信息
     */
    ipcMain.handle("get-active-cursor-email", async () => {
        // 1. storage.json
        const storageInfo = getCursorInfo();

        // 2. 所有 token server（取全部，不只第一个）
        let liveList = [];
        try {
            liveList = await getAllActiveFromTokenServers(getServerPort());
        } catch (e) {
            console.warn("[get-active-cursor-email] 扫描失败:", e.message);
        }

        // 3. 组合：storage email + live emails 去重，找出 storage 里没有的就是纯热推账号
        const storageEmail = storageInfo.cachedEmail || "";
        const liveEmails = liveList.map(l => l.email);

        // 打日志
        if (storageEmail || liveList.length) {
            console.log(`[get-active-cursor-email] storage=${storageEmail} | live=[${liveEmails.join(",")}]`);
        }

        return {
            storage: {
                email: storageEmail,
                accessToken: storageInfo.accessToken || "",
                refreshToken: storageInfo.refreshToken || "",
            },
            live: liveList,
        };
    });

    // ── 账号切换 ──────────────────────────────────────────────
    ipcMain.handle("reset-cursor-account", (_, account) => {
        return resetCursorAccount(account);
    });

    // ── 无感热切换（token server 推送，无需重启 Cursor） ───────
    ipcMain.handle("hot-switch-account", async (_, account) => {
        try {
            // optimalToken 是前端解析后的纯 JWT，优先使用
            const token = account?.optimalToken || account?.accessToken;
            if (!token) {
                return { success: false, message: "缺少有效 accessToken" };
            }
            const result = await pushTokenToCursor({
                accessToken: token,
                refreshToken: account.refreshToken || "",
                email: account.email || "",
            });
            // 同时写入 storage.json，让后续 refresh() 能读到正确的账号
            try {
                writeCursorAccount({
                    email: account.email,
                    accessToken: token,
                    refreshToken: account.refreshToken,
                    cachedSignUpType: account.cachedSignUpType || "Auth_0",
                });
            } catch (e) {
                console.warn("[hot-switch] 写入 storage.json 失败（非致命）:", e.message);
            }
            // 标记账号已使用
            try {
                const { createOrUpdateAccount } = await import("../services/accountDb.js");
                await createOrUpdateAccount({ email: account.email, used_at: Date.now() });
            } catch (e) { /* 忽略 */ }
            // 更新自动换号的当前邮箱
            setCurrentEmail(account.email);
            return result;
        } catch (e) {
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle("clear-pending-token", () => {
        clearPendingToken();
        return { success: true };
    });

    ipcMain.handle("get-token-server-port", () => {
        return getServerPort();
    });

    // ── 自动换号 ──────────────────────────────────────────────
    ipcMain.handle("set-auto-switch", (_, enabled) => {
        setAutoSwitch(enabled);
        return { success: true };
    });

    ipcMain.handle("get-auto-switch-stats", () => {
        return getAutoSwitchStats();
    });

    ipcMain.handle("set-current-email", (_, email) => {
        setCurrentEmail(email);
        return { success: true };
    });

    // ── 机器码 ────────────────────────────────────────────────
    ipcMain.handle("set-random-machine-info", () => {
        try {
            const result = setRandomMachineId();
            return { success: true, ...result };
        } catch (e) {
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle("set-machine-guid", (_, guid) => {
        return setMachineGuid(guid);
    });

    // ── 权限检查 ──────────────────────────────────────────────
    ipcMain.handle("check-admin-rights", () => {
        return checkAdminRights();
    });

    // ── 备份/恢复 ─────────────────────────────────────────────
    ipcMain.handle("backup", () => backup());
    ipcMain.handle("list-backups", () => listBackups());
    ipcMain.handle("restore-backup", (_, backupName) => restoreBackup(backupName));

    // ── 账号数据库 ────────────────────────────────────────────
    ipcMain.handle("accounts-ensure-db", () => ensureDatabaseDirectoryExists());
    ipcMain.handle("accounts-list", (_, opts) => listAccounts(opts));
    ipcMain.handle("accounts-create-or-update", (_, account) => createOrUpdateAccount(account));
    ipcMain.handle("accounts-delete", (_, emails, handleId) => deleteAccounts(emails, handleId));
    ipcMain.handle("accounts-import", (_, handleId) => importAccountsFromJSON(handleId));
    ipcMain.handle("accounts-export", (_, handleId) => exportAccountsToJSON(handleId));
    ipcMain.handle("accounts-backup-db", () => backupDatabase());
    ipcMain.handle("accounts-restore-db", () => restoreDatabase());

    // ── HTTP 代理请求（渲染层不能直接跨域，走主进程） ──────────
    ipcMain.handle("api-request", (_, options) => {
        return handleApiRequest(options);
    });

    // ── 许可证（本地直接放行） ────────────────────────────────
    ipcMain.handle("get-app-license-info", () => {
        return {
            status: 0,
            message: "本地构建版本，无需许可证",
            license: { permissions: { registerNum: 10 } },
            signature: "本地构建版本",
        };
    });

    // ── 注入 / 还原 ───────────────────────────────────────────
    ipcMain.handle("get-patch-status", async () => {
        return getPatchStatus();
    });

    ipcMain.handle("apply-patch", async () => {
        const result = await applyPatch();
        if (result.success) {
            // 异步重启，不阻塞响应，让前端先收到成功消息
            restartCursor().catch(e => console.error("[apply-patch] 重启失败:", e.message));
        }
        return result;
    });

    ipcMain.handle("restore-patch", async () => {
        const result = await restorePatch();
        if (result.success) {
            restartCursor().catch(e => console.error("[restore-patch] 重启失败:", e.message));
        }
        return result;
    });

    // ── 禁用 Cursor 更新 ──────────────────────────────────────
    ipcMain.handle("get-disable-update-status", () => {
        return { disabled: getDisableUpdateStatus() };
    });

    ipcMain.handle("set-disable-update", (_, disabled) => {
        return setDisableUpdate(disabled);
    });

    // ── 外部链接 ──────────────────────────────────────────────
    ipcMain.handle("open-external-link", (_, url) => {
        if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
            shell.openExternal(url);
        }
    });

    // ── 帮助文档 ──────────────────────────────────────────────
    ipcMain.handle("open-help-doc", () => {
        const helpPath = path.join(app.getAppPath(), "docs", "help.html");
        shell.openPath(helpPath);
    });

    ipcMain.handle("get-help-doc-path", () => {
        const helpPath = path.join(app.getAppPath(), "docs", "help.html");
        try {
            const content = fs.readFileSync(helpPath, "utf8");
            return { success: true, content };
        } catch (e) {
            return { success: false, message: e.message };
        }
    });}
