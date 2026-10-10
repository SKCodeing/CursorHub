/**
 * src/main/services/accountDb.js
 * 账号池数据库管理，使用 sql.js（纯 WASM，无需原生编译）。
 * 数据持久化到 userData/fly-cursor-accounts.db 文件。
 */
import path from "path";
import fs from "fs";
import { app, dialog, BrowserWindow } from "electron";

let SQL = null;
let db = null;
let dbPath = null;

function getDbPath() {
    if (dbPath) return dbPath;
    const userDataPath = app.getPath("userData");
    // 使用固定路径，不随应用名变化，避免更名后数据丢失
    // 同时兼容旧路径（FlyCursor），如果旧文件存在则迁移过来
    const fixedPath = path.join(userDataPath, "cursor-hub-accounts.db");
    
    // 旧路径兼容迁移
    const legacyPaths = [
        path.join(path.dirname(userDataPath), "FlyCursor", "fly-cursor-accounts.db"),
        path.join(path.dirname(userDataPath), "Fly Cursor", "fly-cursor-accounts.db"),
        path.join(userDataPath, "fly-cursor-accounts.db"),
    ];
    if (!fs.existsSync(fixedPath)) {
        for (const legacy of legacyPaths) {
            if (fs.existsSync(legacy)) {
                try {
                    fs.mkdirSync(path.dirname(fixedPath), { recursive: true });
                    fs.copyFileSync(legacy, fixedPath);
                    console.log(`[DB] 从旧路径迁移数据库: ${legacy} → ${fixedPath}`);
                    break;
                } catch (e) {
                    console.warn("[DB] 迁移失败:", e.message);
                }
            }
        }
    }
    
    dbPath = fixedPath;
    return dbPath;
}

/**
 * 初始化 sql.js 和数据库
 */
async function getDb() {
    if (db) return db;

    if (!SQL) {
        const initSqlJs = require("sql.js");
        SQL = await initSqlJs();
    }

    const filePath = getDbPath();

    // 从文件加载已有数据，或新建空库
    if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // 建表
    db.run(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            accessToken TEXT,
            refreshToken TEXT,
            WorkosCursorSessionToken TEXT,
            cachedSignUpType TEXT,
            membershipType TEXT,
            daysRemainingOnTrial INTEGER,
            modelUsageUsed INTEGER,
            modelUsageTotal INTEGER,
            registerTimeStamp INTEGER,
            machineId TEXT,
            macMachineId TEXT,
            devDeviceId TEXT,
            sqmId TEXT,
            machineGuid TEXT,
            register_time INTEGER DEFAULT (strftime('%s','now') * 1000),
            updated_time INTEGER DEFAULT (strftime('%s','now') * 1000),
            used_at INTEGER DEFAULT NULL,
            quota_at INTEGER DEFAULT NULL
        )
    `);

    // 迁移：旧数据库可能没有 used_at / quota_at 列，自动补上
    try {
        db.run(`ALTER TABLE accounts ADD COLUMN used_at INTEGER DEFAULT NULL`);
    } catch (e) { /* 列已存在则忽略 */ }
    try {
        db.run(`ALTER TABLE accounts ADD COLUMN quota_at INTEGER DEFAULT NULL`);
    } catch (e) { /* 列已存在则忽略 */ }

    persist();
    return db;
}

/**
 * 将内存数据库持久化到文件
 */
function persist() {
    if (!db) return;
    try {
        const data = db.export();
        fs.writeFileSync(getDbPath(), Buffer.from(data));
    } catch (e) {
        console.error("持久化数据库失败:", e.message);
    }
}

/**
 * 执行查询，返回行数组
 */
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * 执行查询，返回单行
 */
function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────

export async function ensureDatabaseDirectoryExists() {
    const filePath = getDbPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    await getDb();
    return { success: true };
}

export async function listAccounts({ page = 1, pageSize = 100, sortByRegisterTime = "DESC" } = {}) {
    await getDb();
    const order = sortByRegisterTime === "ASC" ? "ASC" : "DESC";
    const offset = (page - 1) * pageSize;

    const countRow = queryOne("SELECT COUNT(*) as total FROM accounts");
    const total = countRow ? countRow.total : 0;

    const accounts = queryAll(
        `SELECT * FROM accounts ORDER BY register_time ${order} LIMIT ? OFFSET ?`,
        [pageSize, offset]
    );

    return { accounts, total };
}

export async function createOrUpdateAccount(account) {
    await getDb();

    const {
        email, accessToken, refreshToken, WorkosCursorSessionToken,
        cachedSignUpType, membershipType, daysRemainingOnTrial,
        modelUsageUsed, modelUsageTotal, registerTimeStamp,
        machineId, macMachineId, devDeviceId, sqmId, machineGuid,
        used_at, quota_at,
    } = account;

    if (!email) throw new Error("email 不能为空");

    const now = Date.now();
    const existing = queryOne("SELECT id FROM accounts WHERE email = ?", [email]);

    if (existing) {
        // val !== undefined  → 更新（null 表示显式清空，非 null 表示写入值）
        // val === undefined  → 跳过，保留原值不动
        const fields = {
            accessToken, refreshToken, WorkosCursorSessionToken,
            cachedSignUpType, membershipType, daysRemainingOnTrial,
            modelUsageUsed, modelUsageTotal, registerTimeStamp,
            machineId, macMachineId, devDeviceId, sqmId, machineGuid,
            used_at, quota_at,
        };
        const updates = [];
        const values = [];
        for (const [key, val] of Object.entries(fields)) {
            if (val !== undefined) {          // undefined = 不动；null = 显式清空
                updates.push(`${key} = ?`);
                values.push(val);             // null 会写入 NULL
            }
        }
        if (updates.length === 0) return { success: true };
        updates.push("updated_time = ?");
        values.push(now, email);
        db.run(`UPDATE accounts SET ${updates.join(", ")} WHERE email = ?`, values);
    } else {
        db.run(
            `INSERT INTO accounts (
                email, accessToken, refreshToken, WorkosCursorSessionToken,
                cachedSignUpType, membershipType, daysRemainingOnTrial,
                modelUsageUsed, modelUsageTotal, registerTimeStamp,
                machineId, macMachineId, devDeviceId, sqmId, machineGuid,
                register_time, updated_time, used_at, quota_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                email,
                accessToken ?? null, refreshToken ?? null,
                WorkosCursorSessionToken ?? null, cachedSignUpType ?? null,
                membershipType ?? null, daysRemainingOnTrial ?? null,
                modelUsageUsed ?? null, modelUsageTotal ?? null,
                registerTimeStamp ?? null, machineId ?? null,
                macMachineId ?? null, devDeviceId ?? null,
                sqmId ?? null, machineGuid ?? null,
                now, now, used_at ?? null, quota_at ?? null,
            ]
        );
    }

    persist();
    return { success: true };
}

/**
 * 获取下一个可用账号（用于自动换号）
 * 策略：排除当前邮箱，取 updated_time 最早（最久没用过）且有 token 的账号
 * @param {string} currentEmail - 当前账号邮箱，排除掉
 * @returns {object|null} 账号对象，或 null（没有可用账号）
 */
export async function getNextAccount(currentEmail = "") {
    await getDb();
    // 有 accessToken 或 WorkosCursorSessionToken，且不是当前账号
    const account = queryOne(
        `SELECT * FROM accounts
         WHERE email != ?
           AND (accessToken IS NOT NULL OR WorkosCursorSessionToken IS NOT NULL)
           AND quota_at IS NULL
         ORDER BY updated_time ASC
         LIMIT 1`,
        [currentEmail || ""]
    );
    return account || null;
}

/**
 * 更新账号的 updated_time（标记为"刚用过"，下次轮转时排到最后）
 */
export async function touchAccount(email) {
    await getDb();
    db.run("UPDATE accounts SET updated_time = ? WHERE email = ?", [Date.now(), email]);
    persist();
}

export async function deleteAccounts(emails, handleId = null) {
    await getDb();
    let deletedCount = 0;
    for (let i = 0; i < emails.length; i++) {
        db.run("DELETE FROM accounts WHERE email = ?", [emails[i]]);
        deletedCount++;
        if (handleId) {
            sendProgress(handleId, i + 1, emails.length, `已删除 ${i + 1}/${emails.length}`);
        }
    }
    persist();
    if (handleId) {
        sendProgress(handleId, emails.length, emails.length, "删除完成", "finished");
    }
    return deletedCount;
}

export async function importAccountsFromJSON(handleId = null) {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
        title: "选择账号 JSON 文件",
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
    });

    if (result.canceled) return { canceled: true };

    let data;
    try {
        data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
    } catch (e) {
        throw new Error("JSON 文件解析失败: " + e.message);
    }

    const accounts = Array.isArray(data) ? data : [data];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < accounts.length; i++) {
        try {
            await createOrUpdateAccount(accounts[i]);
            successful++;
        } catch {
            failed++;
        }
        if (handleId) {
            sendProgress(handleId, i + 1, accounts.length, `导入中 ${i + 1}/${accounts.length}`);
        }
    }

    if (handleId) {
        sendProgress(handleId, accounts.length, accounts.length, `导入完成，成功 ${successful}`, "finished");
    }
    return { canceled: false, successful, failed };
}

export async function exportAccountsToJSON(handleId = null) {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const saveResult = await dialog.showSaveDialog(win, {
        title: "导出账号",
        defaultPath: `fly-cursor-accounts-${Date.now()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (saveResult.canceled) return { canceled: true };

    await getDb();
    const accounts = queryAll("SELECT * FROM accounts ORDER BY register_time DESC");
    fs.writeFileSync(saveResult.filePath, JSON.stringify(accounts, null, 2), "utf8");

    if (handleId) {
        sendProgress(handleId, 1, 1, "导出完成", "finished");
    }
    return { canceled: false, filePath: saveResult.filePath };
}

/**
 * 备份数据库文件（复制 .db 文件到用户选择的位置）
 */
export async function backupDatabase() {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const saveResult = await dialog.showSaveDialog(win, {
        title: "备份账号数据库",
        defaultPath: `cursor-hub-accounts-backup-${new Date().toISOString().slice(0,10)}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
    });
    if (saveResult.canceled) return { canceled: true };

    const src = getDbPath();
    if (!fs.existsSync(src)) return { canceled: false, success: false, message: "数据库文件不存在" };

    // persist 确保最新数据已写盘
    persist();
    fs.copyFileSync(src, saveResult.filePath);
    return { canceled: false, success: true, filePath: saveResult.filePath };
}

/**
 * 从备份文件恢复数据库
 */
export async function restoreDatabase() {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const openResult = await dialog.showOpenDialog(win, {
        title: "选择数据库备份文件",
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        properties: ["openFile"],
    });
    if (openResult.canceled) return { canceled: true };

    const srcPath = openResult.filePaths[0];
    const destPath = getDbPath();

    // 关闭当前数据库连接
    if (db) {
        try { db.close(); } catch (e) { /* ignore */ }
        db = null;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);

    // 重新打开
    await getDb();
    return { canceled: false, success: true };
}

function sendProgress(handleId, processed, total, message, status = "running") {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
        wins[0].webContents.send("main-process-message", {
            type: "progress", handleId, processed, total, message, status,
        });
    }
}
