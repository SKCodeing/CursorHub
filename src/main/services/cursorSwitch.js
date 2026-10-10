/**
 * src/main/services/cursorSwitch.js
 * 切换 Cursor 登录账号。
 * 核心：将目标账号的 token 写入 storage.json，并可选重置 machine-id。
 */
import { writeCursorAccount } from "./cursor.js";
import { setRandomMachineId } from "./system.js";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { getAppConfig } from "./config.js";

/**
 * 关闭 Cursor 进程
 */
function killCursorProcess() {
    const platform = process.platform;
    try {
        if (platform === "darwin") {
            execSync("pkill -f 'Cursor' || true", { timeout: 5000 });
        } else if (platform === "win32") {
            execSync("taskkill /F /IM Cursor.exe /T 2>nul || exit 0", {
                shell: true,
                timeout: 5000,
            });
        } else {
            execSync("pkill -f cursor || true", { timeout: 5000 });
        }
        // 等待进程退出
        return new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
        return Promise.resolve();
    }
}

/**
 * 启动 Cursor
 */
function launchCursor() {
    const config = getAppConfig();
    const platform = process.platform;

    try {
        if (platform === "darwin") {
            const cursorApp = config.path_cursor_exe || "/Applications/Cursor.app";
            if (fs.existsSync(cursorApp)) {
                spawn("open", [cursorApp], { detached: true, stdio: "ignore" }).unref();
            }
        } else if (platform === "win32") {
            if (config.path_cursor_exe && fs.existsSync(config.path_cursor_exe)) {
                spawn(config.path_cursor_exe, [], { detached: true, stdio: "ignore" }).unref();
            }
        }
    } catch (e) {
        console.error("启动 Cursor 失败:", e.message);
    }
}

/**
 * 清理 Cursor 认证缓存（删除部分缓存文件，让 Cursor 重新读取 storage.json）
 */
function clearCursorCache() {
    const config = getAppConfig();
    const globalStorage = config.path_cursor_user_db;
    if (!globalStorage) return;

    // 删除 WAL 文件和 shm 文件（可能有锁住的旧状态）
    const toDelete = [
        path.join(globalStorage, "state.vscdb-shm"),
        path.join(globalStorage, "state.vscdb-wal"),
    ];

    for (const f of toDelete) {
        try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
            // 文件被占用时忽略
        }
    }
}

/**
 * 切换账号主流程
 * @param {object} account - 目标账号信息
 * @param {boolean} account.isResetMachines - 是否重置 machine-id
 * @param {boolean} account.isResetCursor - 是否重启 Cursor
 * @param {boolean} account.isResetCursorAll - 是否完全重置（清除缓存）
 */
export async function resetCursorAccount(account) {
    const { isResetMachines = false, isResetCursor = true, isResetCursorAll = false } = account;

    try {
        // 1. 关闭 Cursor
        if (isResetCursor || isResetCursorAll) {
            await killCursorProcess();
        }

        // 2. 重置 machine-id
        if (isResetMachines) {
            try {
                setRandomMachineId();
            } catch (e) {
                console.warn("重置 machine-id 失败（非致命）:", e.message);
            }
        }

        // 3. 清理缓存
        if (isResetCursorAll) {
            clearCursorCache();
        }

        // 4. 写入新账号信息到 storage.json
        // optimalToken 是前端解析后的纯 JWT，优先使用
        const written = writeCursorAccount({
            email: account.email,
            accessToken: account.optimalToken || account.accessToken,
            refreshToken: account.refreshToken,
            cachedSignUpType: account.cachedSignUpType,
        });

        if (!written) {
            return { success: false, message: "写入账号信息失败" };
        }

        // 5. 重启 Cursor
        if (isResetCursor || isResetCursorAll) {
            launchCursor();
        }

        return { success: true };
    } catch (e) {
        console.error("切换账号失败:", e.message);
        return { success: false, message: e.message };
    }
}
