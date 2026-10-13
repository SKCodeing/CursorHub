/**
 * src/main/services/config.js
 * 应用配置管理，使用 electron-store 持久化存储。
 * 同时负责探测 Cursor 相关路径。
 */
import ElectronStore from "electron-store";
import path from "path";
import fs from "fs";
import os from "os";
import { app } from "electron";

// electron-store v10+ 使用具名导出，兼容处理
const Store = ElectronStore.default || ElectronStore;
const store = new Store({
    name: "fly-cursor-config",
    defaults: {
        EMAIL_DOMAIN: "",
        RECEIVING_EMAIL: "",
        RECEIVING_EMAIL_PIN: "",
        autoSwitchEnabled: false,
        disclaimerAgreed: false,
    },
});

/**
 * 探测 Cursor 相关路径
 */
function detectCursorPaths() {
    const platform = process.platform;
    const homeDir = os.homedir();
    let paths = {
        path_cursor_user_db: null,   // globalStorage 目录
        path_cursor_exe: null,        // Cursor 可执行文件
        path_chrome: null,            // Chrome 路径（注册用，此版本不需要）
        cursorVersion: null,
    };

    if (platform === "darwin") {
        // macOS
        const globalStorage = path.join(homeDir, "Library/Application Support/Cursor/User/globalStorage");
        if (fs.existsSync(globalStorage)) {
            paths.path_cursor_user_db = globalStorage;
        }

        const cursorApp = "/Applications/Cursor.app";
        if (fs.existsSync(cursorApp)) {
            paths.path_cursor_exe = cursorApp;
            // 读取版本号
            try {
                const pkgPath = path.join(cursorApp, "Contents/Resources/app/package.json");
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
                    paths.cursorVersion = pkg.version || null;
                }
            } catch {
                // ignore
            }
        }

        const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        if (fs.existsSync(chromePath)) {
            paths.path_chrome = chromePath;
        }
    } else if (platform === "win32") {
        // Windows
        const appData = process.env.APPDATA || path.join(homeDir, "AppData/Roaming");
        const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, "AppData/Local");

        const globalStorage = path.join(appData, "Cursor/User/globalStorage");
        if (fs.existsSync(globalStorage)) {
            paths.path_cursor_user_db = globalStorage;
        }

        const cursorExePaths = [
            path.join(localAppData, "Programs/cursor/Cursor.exe"),
            path.join(localAppData, "cursor/Cursor.exe"),
        ];
        for (const p of cursorExePaths) {
            if (fs.existsSync(p)) {
                paths.path_cursor_exe = p;
                break;
            }
        }

        const chromePaths = [
            path.join(localAppData, "Google/Chrome/Application/chrome.exe"),
            path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
        ];
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                paths.path_chrome = p;
                break;
            }
        }
    } else if (platform === "linux") {
        const globalStorage = path.join(homeDir, ".config/Cursor/User/globalStorage");
        if (fs.existsSync(globalStorage)) {
            paths.path_cursor_user_db = globalStorage;
        }
    }

    return paths;
}

/**
 * 获取完整配置（持久化配置 + 动态探测路径）
 */
export function getAppConfig() {
    const stored = store.store;
    const detected = detectCursorPaths();
    return {
        ...stored,
        ...detected,
        appName: "CursorHub",
        version: app.getVersion(),
        originalMachineGuid: store.get("originalMachineGuid", null),
    };
}

/**
 * 更新用户可配置项（邮箱域名等）
 */
export function setAppConfig(config) {
    const allowedKeys = ["EMAIL_DOMAIN", "RECEIVING_EMAIL", "RECEIVING_EMAIL_PIN", "autoSwitchEnabled"];
    for (const key of allowedKeys) {
        if (key in config) {
            store.set(key, config[key]);
        }
    }
    return { success: true };
}

/**
 * 获取免责声明是否已同意
 */
export function getDisclaimerAgreed() {
    return store.get("disclaimerAgreed", false);
}

/**
 * 设置免责声明已同意
 */
export function setDisclaimerAgreed() {
    store.set("disclaimerAgreed", true);
    return { success: true };
}

/**
 * 保存原始 machineGuid（首次记录）
 */
export function saveOriginalMachineGuid(guid) {
    if (!store.get("originalMachineGuid")) {
        store.set("originalMachineGuid", guid);
    }
}

export { store };
