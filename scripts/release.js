#!/usr/bin/env node
/**
 * scripts/release.js
 * 自动升版本号 + 打包 + 发布 GitHub Release
 *
 * 用法：
 *   node scripts/release.js          # 自动升 patch (1.1.3 → 1.1.4)
 *   node scripts/release.js minor    # 升 minor  (1.1.3 → 1.2.0)
 *   node scripts/release.js major    # 升 major  (1.1.3 → 2.0.0)
 *   node scripts/release.js 1.2.5    # 指定版本号
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const HELP_PATH = path.join(ROOT, "docs", "help.html");

// ── 读取当前版本 ───────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

// ── 计算新版本 ─────────────────────────────────────────────────
const arg = process.argv[2] || "patch";
let newVersion;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
    newVersion = arg;
} else if (arg === "major") {
    newVersion = `${major + 1}.0.0`;
} else if (arg === "minor") {
    newVersion = `${major}.${minor + 1}.0`;
} else {
    newVersion = `${major}.${minor}.${patch + 1}`;
}

console.log(`\n📦 版本升级: ${currentVersion} → ${newVersion}\n`);

// ── 更新 package.json ─────────────────────────────────────────
pkg.version = newVersion;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 4) + "\n", "utf8");
console.log("✅ package.json 已更新");

// ── 更新 help.html 里的版本号 ─────────────────────────────────
let helpHtml = fs.readFileSync(HELP_PATH, "utf8");
helpHtml = helpHtml.replace(
    /CursorHub v\d+\.\d+\.\d+ · 使用帮助文档/g,
    `CursorHub v${newVersion} · 使用帮助文档`
);
helpHtml = helpHtml.replace(
    /<div class="version">v\d+\.\d+\.\d+[^<]*<\/div>/g,
    `<div class="version">v${newVersion} · 使用帮助</div>`
);
fs.writeFileSync(HELP_PATH, helpHtml, "utf8");
console.log("✅ help.html 版本号已更新");

// ── 编译打包 ──────────────────────────────────────────────────
console.log("\n🔨 开始编译打包...");
const buildResult = spawnSync("npm", ["run", "build:mac"], {
    cwd: ROOT,
    stdio: "inherit",
});
if (buildResult.status !== 0) {
    console.error("❌ 打包失败，终止发布");
    process.exit(1);
}

// ── 查找打包产物 ──────────────────────────────────────────────
const distDir = path.join(ROOT, "dist");
const dmgFiles = fs.readdirSync(distDir)
    .filter(f => f.endsWith(".dmg"))
    .map(f => path.join(distDir, f));

if (dmgFiles.length === 0) {
    console.error("❌ 未找到 DMG 文件");
    process.exit(1);
}
console.log(`\n✅ 找到安装包:\n${dmgFiles.map(f => "  " + path.basename(f)).join("\n")}`);

// ── git commit + tag ─────────────────────────────────────────
console.log("\n📝 提交版本变更...");
try {
    execSync(`git add package.json docs/help.html`, { cwd: ROOT, stdio: "inherit" });
    execSync(`git commit -m "chore: release v${newVersion}"`, { cwd: ROOT, stdio: "inherit" });
    execSync(`git push`, { cwd: ROOT, stdio: "inherit" });
} catch (e) {
    console.warn("⚠️  git 提交/推送失败（可能无改动），继续发布...");
}

// ── 发布 GitHub Release ───────────────────────────────────────
console.log(`\n🚀 发布 GitHub Release v${newVersion}...`);

const releaseNotes = `## CursorHub v${newVersion}

### 下载
- **macOS arm64（M系列芯片）**：下载 \`CursorHub-${newVersion}-arm64.dmg\`

### 安装说明
1. 下载 DMG，双击打开，将 CursorHub.app 拖入 Applications
2. 首次打开需右键打开（绕过 macOS Gatekeeper）
   或终端执行：xattr -cr /Applications/CursorHub.app

### 联系
- QQ 交流群：569846057
- QQ：807600577`;

// 写入临时文件避免 --notes 多行参数解析问题
const tmpNotes = path.join(ROOT, "dist", `.release-notes-${newVersion}.md`);
fs.writeFileSync(tmpNotes, releaseNotes, "utf8");

// 只上传新版本的 DMG
const newDmgFiles = dmgFiles.filter(f => path.basename(f).includes(newVersion));
if (newDmgFiles.length === 0) {
    console.error("❌ 未找到新版本 DMG 文件");
    fs.unlinkSync(tmpNotes);
    process.exit(1);
}

const ghArgs = [
    "release", "create", `v${newVersion}`,
    ...newDmgFiles,
    "--repo", "SKCodeing/CursorHub",
    "--title", `CursorHub v${newVersion}`,
    "-F", tmpNotes,
];

const ghResult = spawnSync("gh", ghArgs, { cwd: ROOT, stdio: "inherit" });

// 清理临时文件
try { fs.unlinkSync(tmpNotes); } catch { /* 忽略 */ }

if (ghResult.status !== 0) {
    console.error("❌ GitHub Release 发布失败");
    process.exit(1);
}

console.log(`\n🎉 发布成功！\nhttps://github.com/SKCodeing/CursorHub/releases/tag/v${newVersion}\n`);
