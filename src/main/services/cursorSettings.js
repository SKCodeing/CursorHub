/**
 * src/main/services/cursorSettings.js
 *
 * 管理 Cursor 的用户配置文件（settings.json）：
 *   - 读取 / 写入 update.mode 禁用自动更新
 *
 * 管理 Cursor 主程序文件的注入（patch）和还原（restore）：
 *   - 注入：在 workbench.desktop.main.js 中插入热切换 token 的轮询代码
 *   - 还原：从 .bak 备份恢复原始文件
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { getAppConfig } from "./config.js";

// ─────────────────────────────────────────────────────────────
// Cursor settings.json 路径
// ─────────────────────────────────────────────────────────────

function getSettingsJsonPath() {
    const platform = process.platform;
    const homeDir = os.homedir();
    if (platform === "darwin") {
        return path.join(homeDir, "Library/Application Support/Cursor/User/settings.json");
    } else if (platform === "win32") {
        const appData = process.env.APPDATA || path.join(homeDir, "AppData/Roaming");
        return path.join(appData, "Cursor/User/settings.json");
    } else {
        return path.join(homeDir, ".config/Cursor/User/settings.json");
    }
}

function readSettingsJson() {
    const p = getSettingsJsonPath();
    if (!fs.existsSync(p)) return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
        return {};
    }
}

function writeSettingsJson(data) {
    const p = getSettingsJsonPath();
    try {
        // 确保目录存在
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(data, null, 4), "utf8");
        return true;
    } catch (e) {
        console.error("[cursorSettings] 写入 settings.json 失败:", e.message);
        return false;
    }
}

/**
 * 获取「禁用 Cursor 自动更新」的当前状态
 * @returns {boolean} true = 已禁用（settings + hosts 均已设置）
 */
export function getDisableUpdateStatus() {
    const settings = readSettingsJson();
    const settingsDisabled = settings["update.mode"] === "none";
    const hostsDisabled = _isHostsBlocked();
    // 任一生效即视为已开启
    return settingsDisabled || hostsDisabled;
}

/**
 * 设置「禁用 Cursor 自动更新」
 * 同时操作：
 *  1. Cursor settings.json → update.mode=none
 *  2. /etc/hosts → 屏蔽 Cursor 更新检测域名（彻底消除弹窗）
 * @param {boolean} disabled  true = 禁用，false = 恢复
 * @returns {{ success: boolean, message?: string }}
 */
export function setDisableUpdate(disabled) {
    const results = [];

    // 1. settings.json
    try {
        const settings = readSettingsJson();
        if (disabled) {
            settings["update.mode"] = "none";
        } else {
            delete settings["update.mode"];
        }
        const ok = writeSettingsJson(settings);
        if (!ok) results.push("写入 settings.json 失败");
    } catch (e) {
        results.push(`settings.json: ${e.message}`);
    }

    // 2. /etc/hosts
    try {
        _patchHosts(disabled);
    } catch (e) {
        results.push(`hosts: ${e.message}`);
    }

    // 3. 清除 state.vscdb 里缓存的更新状态（防止弹窗复现）
    if (disabled) {
        try {
            _clearUpdateStateFromDb();
        } catch (e) {
            // 非致命，忽略
            console.warn("[disableUpdate] 清除更新状态失败:", e.message);
        }
    }

    // 4. patch / restore workbench.js 里的弹窗触发代码（彻底屏蔽服务端下发的更新弹窗）
    try {
        const popupResult = _patchUpdatePopup(disabled);
        if (!popupResult.success && popupResult.message) {
            results.push(`popup patch: ${popupResult.message}`);
        }
    } catch (e) {
        results.push(`popup patch: ${e.message}`);
    }

    // 5. 刷新 DNS 缓存（macOS）
    if (process.platform === "darwin") {
        try {
            execSync("dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null || true", { timeout: 5000 });
        } catch { /* 非致命 */ }
    }

    const success = results.length === 0;
    return { success, message: success ? undefined : results.join("; ") };
}

// Cursor 更新相关域名列表（只屏蔽更新/下载，不影响 AI 功能）
const CURSOR_UPDATE_HOSTS = [
    "update.cursor.sh",
    "download.cursor.sh",
    "downloads.cursor.com",
];
const HOSTS_MARKER = "# CursorHub: block cursor update";

/**
 * 修改 /etc/hosts，屏蔽或恢复 Cursor 更新域名
 */
function _patchHosts(block) {
    const hostsPath = process.platform === "win32"
        ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
        : "/etc/hosts";

    let content = "";
    try {
        content = fs.readFileSync(hostsPath, "utf8");
    } catch (e) {
        throw new Error(`读取 hosts 失败: ${e.message}`);
    }

    // 先移除旧的注入块（幂等）
    const lines = content.split("\n");
    const cleaned = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed === HOSTS_MARKER) return false;
        if (CURSOR_UPDATE_HOSTS.some(h => trimmed.includes(h) && trimmed.startsWith("127.0.0.1"))) return false;
        return true;
    });

    let newContent = cleaned.join("\n").trimEnd() + "\n";

    if (block) {
        newContent += `\n${HOSTS_MARKER}\n`;
        for (const host of CURSOR_UPDATE_HOSTS) {
            newContent += `127.0.0.1 ${host}\n`;
        }
    }

    // 先尝试直接写入（可能有权限）
    try {
        fs.writeFileSync(hostsPath, newContent, "utf8");
        return;
    } catch (e) {
        if (e.code !== "EACCES" && e.code !== "EPERM") {
            throw new Error(`写入 hosts 失败: ${e.message}`);
        }
        // 权限不足，走提权写入
    }

    // 写入临时文件，再用 sudo tee 提权写入
    const tmpFile = path.join(os.tmpdir(), `cursohub_hosts_${Date.now()}.tmp`);
    try {
        fs.writeFileSync(tmpFile, newContent, "utf8");

        if (process.platform === "darwin") {
            // macOS：用 osascript 弹出系统授权框
            const script = `do shell script "cat ${tmpFile} > /etc/hosts" with administrator privileges`;
            execSync(`osascript -e '${script}'`, { timeout: 30000 });
        } else if (process.platform === "win32") {
            // Windows：用 PowerShell 提权
            execSync(
                `powershell -Command "Start-Process cmd -ArgumentList '/c copy /y ${tmpFile} ${hostsPath}' -Verb RunAs -Wait"`,
                { timeout: 30000 }
            );
        } else {
            // Linux：pkexec
            execSync(`pkexec tee ${hostsPath} < ${tmpFile}`, { timeout: 30000 });
        }
    } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* 忽略 */ }
    }
}

/**
 * 检查 hosts 中是否已屏蔽
 */
function _isHostsBlocked() {
    const hostsPath = process.platform === "win32"
        ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
        : "/etc/hosts";
    try {
        const content = fs.readFileSync(hostsPath, "utf8");
        return content.includes(HOSTS_MARKER);
    } catch {
        return false;
    }
}

/**
 * 清除 state.vscdb 里缓存的更新状态，防止 Cursor 启动时弹出「有新版本」提示
 *
 * 核心原理：
 *   Cursor 会比较 cursorupdate.lastUpdatedAndShown.version 与当前版本，
 *   若当前版本 > 上次显示的版本就弹窗。把该值设为当前版本即可消除弹窗。
 */
function _clearUpdateStateFromDb() {
    const dbPath = path.join(
        os.homedir(),
        process.platform === "win32"
            ? "AppData/Roaming/Cursor/User/globalStorage/state.vscdb"
            : "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    );
    if (!fs.existsSync(dbPath)) return;

    // 读取 Cursor 当前版本
    let cursorVersion = "999.99.99";
    try {
        const config = getAppConfig();
        if (config.cursorVersion) cursorVersion = config.cursorVersion;
    } catch { /* 忽略 */ }

    // 用系统 sqlite3 命令行操作（避免 ESM 环境下 require/import 打包问题）
    try {
        const keysToDelete = [
            "cursor.update.ready",
            "cursor.update.targetVersion",
            "cursor.update.lastInstallFailed",
            "cursor.update.promptShown",
            "cursor.update.installationStarted",
        ];

        // 删除旧的更新状态 key
        for (const key of keysToDelete) {
            try {
                execSync(
                    `sqlite3 "${dbPath}" "DELETE FROM ItemTable WHERE key='${key}';"`,
                    { timeout: 5000, stdio: "pipe" }
                );
            } catch { /* 忽略单条失败 */ }
        }

        // 将 lastUpdatedAndShown.version 更新为当前版本，消除「新版本可用」弹窗
        try {
            execSync(
                `sqlite3 "${dbPath}" "INSERT OR REPLACE INTO ItemTable(key,value) VALUES('cursorupdate.lastUpdatedAndShown.version','${cursorVersion}');"`,
                { timeout: 5000, stdio: "pipe" }
            );
        } catch (e) {
            console.warn("[clearUpdateState] 更新版本标记失败:", e.message);
        }

        console.log("[clearUpdateState] 已清除更新状态缓存，版本标记设为:", cursorVersion);
    } catch (e) {
        console.warn("[clearUpdateState] DB 操作失败:", e.message);
    }
}

// ─────────────────────────────────────────────────────────────
// patch / restore workbench.desktop.main.js
// ─────────────────────────────────────────────────────────────

function getWorkbenchPath() {
    const config = getAppConfig();
    const platform = process.platform;

    if (platform === "darwin") {
        const base = config.path_cursor_exe || "/Applications/Cursor.app";
        return path.join(base, "Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js");
    } else if (platform === "win32") {
        if (config.path_cursor_exe) {
            return path.join(path.dirname(config.path_cursor_exe), "resources/app/out/vs/workbench/workbench.desktop.main.js");
        }
    } else {
        // Linux
        const linuxPaths = [
            "/opt/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js",
            "/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js",
        ];
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 禁用更新弹窗 patch（直接修改 workbench.js 里的弹窗触发条件）
// ─────────────────────────────────────────────────────────────
const UPDATE_POPUP_MARKER = "/*__FLY_CURSOR_NO_UPDATE_POPUP__*/";
// 原始触发条件：updateLevel 为 RECOMMENDED 或 REQUIRED 时弹窗
const UPDATE_POPUP_ORIGINAL = "(d===l_n.REQUIRED||d===l_n.RECOMMENDED)&&!e()&&(o(!0),t(!0))";
// 替换后：永远不触发弹窗
const UPDATE_POPUP_PATCHED  = `${UPDATE_POPUP_MARKER}(false)&&!e()&&(o(!0),t(!0))`;

/**
 * 在 workbench.js 中屏蔽更新弹窗
 * @returns {{ success: boolean, message?: string }}
 */
function _patchUpdatePopup(disable) {
    const targetPath = getWorkbenchPath();
    if (!targetPath || !fs.existsSync(targetPath)) {
        return { success: false, message: "找不到 workbench 文件" };
    }

    let content;
    try { content = fs.readFileSync(targetPath, "utf8"); } catch (e) {
        return { success: false, message: `读取失败: ${e.message}` };
    }

    if (disable) {
        // 已经 patch 过了，幂等
        if (content.includes(UPDATE_POPUP_MARKER)) return { success: true };
        // 找不到目标字符串（Cursor 版本更新改了代码？）
        if (!content.includes(UPDATE_POPUP_ORIGINAL)) {
            console.warn("[patchUpdatePopup] 找不到弹窗触发代码，可能 Cursor 已更新");
            return { success: false, message: "找不到弹窗触发代码，Cursor 版本可能已更新" };
        }
        content = content.replace(UPDATE_POPUP_ORIGINAL, UPDATE_POPUP_PATCHED);
    } else {
        // 恢复
        if (!content.includes(UPDATE_POPUP_MARKER)) return { success: true }; // 未 patch，无需恢复
        content = content.replace(UPDATE_POPUP_PATCHED, UPDATE_POPUP_ORIGINAL);
    }

    try { fs.writeFileSync(targetPath, content, "utf8"); } catch (e) {
        return { success: false, message: `写入失败（可能需要管理员权限）: ${e.message}` };
    }
    return { success: true };
}

const INJECT_MARKER = "/*__FLY_CURSOR_PATCH__*/";

const INJECT_CODE = `${INJECT_MARKER}
(function(){
  try {
    var _ports=[14620,14621,14622,14623,14624,14520,14521,14522,14523,14524];
    var _port=0,_needResolve=true,_lastToken="",_self=this;
    function _url(p){return"http://127.0.0.1:"+(_port||_ports[0])+p;}
    async function _resolve(){
      for(var i=0;i<_ports.length;i++){
        var p=_ports[i];
        try{
          var r=await fetch("http://127.0.0.1:"+p+"/api/ping",{signal:AbortSignal.timeout(800)});
          if(!r.ok)continue;
          var d=await r.json();
          if(d&&d.service==="cursor-login-assistant"){_port=p;_needResolve=false;return;}
        }catch(e){}
      }
      _needResolve=true;
    }
    async function _tick(){
      try{
        if(_needResolve)await _resolve();
        if(_needResolve)return;
        var resp=await fetch(_url("/api/get-token"),{signal:AbortSignal.timeout(3000)});
        if(!resp.ok)return;
        var data=await resp.json();
        if(!data||!data.enabled||!data.accessToken)return;
        var newTok=String(data.accessToken||"").trim();
        if(!newTok||newTok===_lastToken)return;
        _lastToken=newTok;
        var refreshTok=String(data.refreshToken||newTok).trim();
        _self.storeAccessRefreshToken(newTok,refreshTok);
        if(data.email){try{_self.storageService.store("cursorAuth/cachedEmail",data.email,-1,1);}catch(e){}}
        console.log("[FlyCursor] hot-switched to",data.email||newTok.slice(0,20));
        try{fetch(_url("/api/ack-switch"),{method:"POST"}).catch(function(){});}catch(e){}
      }catch(e){
        if(e&&e.name==="TypeError")_needResolve=true;
      }
    }
    setInterval(_tick,1500);
    _tick();
  }catch(e){console.warn("[FlyCursor] patch error",e);}
}).call(this);`;

const INJECT_BEFORE = "this.storeEmailAndSignUpType=(r,s)=>{";

/**
 * 检查当前注入状态
 * @returns {Promise<{ patched: boolean, targetExists: boolean, backupExists: boolean, targetPath: string|null }>}
 */
export async function getPatchStatus() {
    const targetPath = getWorkbenchPath();
    if (!targetPath) {
        return { patched: false, targetExists: false, backupExists: false, targetPath: null };
    }
    const targetExists = fs.existsSync(targetPath);
    const backupExists = fs.existsSync(targetPath + ".bak");
    let patched = false;

    if (targetExists) {
        try {
            // -F fixed-string 模式，完全不做正则/glob 解析
            const result = execSync(
                `grep -Fc '${INJECT_MARKER}' "${targetPath}" 2>/dev/null || echo 0`,
                { encoding: "utf8", timeout: 5000 }
            ).trim();
            patched = parseInt(result, 10) > 0;
        } catch {
            patched = false;
        }
    }

    return { patched, targetExists, backupExists, targetPath };
}

/**
 * 关闭并重启 Cursor
 */
export async function restartCursor() {
    const { execSync, spawn } = await import("child_process");
    const config = getAppConfig();
    const platform = process.platform;

    // 关闭
    try {
        if (platform === "darwin") {
            execSync("pkill -f 'Cursor' || true", { timeout: 5000 });
        } else if (platform === "win32") {
            execSync("taskkill /F /IM Cursor.exe /T 2>nul || exit 0", { shell: true, timeout: 5000 });
        } else {
            execSync("pkill -f cursor || true", { timeout: 5000 });
        }
    } catch { /* 忽略 */ }

    // 等待进程退出
    await new Promise(r => setTimeout(r, 1800));

    // 重启
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
        console.error("重启 Cursor 失败:", e.message);
    }
}

/**
 * 注入 patch
 * @returns {{ success: boolean, message: string }}
 */
export async function applyPatch() {
    const targetPath = getWorkbenchPath();
    if (!targetPath) {
        return { success: false, message: "找不到 Cursor workbench 文件路径，请确认 Cursor 已安装" };
    }
    if (!fs.existsSync(targetPath)) {
        return { success: false, message: `目标文件不存在: ${targetPath}` };
    }

    let content;
    try {
        content = fs.readFileSync(targetPath, "utf8");
    } catch (e) {
        return { success: false, message: `读取文件失败: ${e.message}` };
    }

    // 幂等检查（-F fixed-string，完全不做正则解析）
    let alreadyPatched = false;
    try {
        const cnt = execSync(
            `grep -Fc '${INJECT_MARKER}' "${targetPath}" 2>/dev/null || echo 0`,
            { encoding: "utf8", timeout: 5000 }
        ).trim();
        alreadyPatched = parseInt(cnt, 10) > 0;
    } catch {
        alreadyPatched = false;
    }
    if (alreadyPatched) {
        return { success: true, message: "已经注入过了，无需重复操作" };
    }

    // 找注入点
    const idx = content.indexOf(INJECT_BEFORE);
    if (idx === -1) {
        return {
            success: false,
            message: "找不到注入点，当前 Cursor 版本可能已更新，请联系作者适配",
        };
    }

    // 备份（只在第一次）
    const backupPath = targetPath + ".bak";
    if (!fs.existsSync(backupPath)) {
        try {
            fs.copyFileSync(targetPath, backupPath);
        } catch (e) {
            return { success: false, message: `备份失败（可能需要管理员权限）: ${e.message}` };
        }
    }

    // 注入
    const patched = content.slice(0, idx) + INJECT_CODE + "\n" + content.slice(idx);
    try {
        fs.writeFileSync(targetPath, patched, "utf8");
    } catch (e) {
        return { success: false, message: `写入失败（可能需要管理员权限）: ${e.message}` };
    }

    return { success: true, message: "注入成功，正在重启 Cursor..." };
}

/**
 * 还原 patch（从备份恢复）
 * @returns {{ success: boolean, message: string }}
 */
export function restorePatch() {
    const targetPath = getWorkbenchPath();
    if (!targetPath) {
        return { success: false, message: "找不到 Cursor workbench 文件路径" };
    }

    const backupPath = targetPath + ".bak";
    if (!fs.existsSync(backupPath)) {
        return { success: false, message: "找不到备份文件，可能从未注入过" };
    }

    try {
        fs.copyFileSync(backupPath, targetPath);
    } catch (e) {
        return { success: false, message: `还原失败（可能需要管理员权限）: ${e.message}` };
    }

    return { success: true, message: "已还原为原始文件，正在重启 Cursor..." };
}
