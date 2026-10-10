#!/usr/bin/env node
/**
 * patch-cursor.js
 * 为 Cursor 的 workbench.desktop.main.js 注入热切换 token 的代码。
 *
 * 原理：
 *   找到 auth service（omg 类）的 storeAccessRefreshToken 方法定义，
 *   在其后注入一段轮询代码，每 1.5s 从本地 token server 拉取新 token，
 *   如果有变化就调用 storeAccessRefreshToken 完成无感切换。
 *
 * 用法：node scripts/patch-cursor.js [--restore]
 */

import fs from "fs";
import path from "path";

const TARGET = "/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js";
const BACKUP = TARGET + ".bak";

// ── 要注入的代码 ──────────────────────────────────────────────────────────────
// 注入位置：storeAccessRefreshToken 定义完成后，找到 this.storeEmailAndSignUpType 的地方注入
// 注入标记：用于幂等检测
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
        console.log("[CursorHub] hot-switched to",data.email||newTok.slice(0,20));
        try{fetch(_url("/api/ack-switch"),{method:"POST"}).catch(function(){});}catch(e){}
      }catch(e){
        if(e&&e.name==="TypeError")_needResolve=true;
      }
    }
    setInterval(_tick,1500);
    _tick();
  }catch(e){console.warn("[CursorHub] patch error",e);}
}).call(this);`;

// ── 注入点：storeEmailAndSignUpType 方法定义前 ────────────────────────────────
// 找到 this.storeEmailAndSignUpType= 在 auth service 构造函数内的位置
const INJECT_BEFORE = "this.storeEmailAndSignUpType=(r,s)=>{";

// ─────────────────────────────────────────────────────────────────────────────

function patch() {
    if (!fs.existsSync(TARGET)) {
        console.error("找不到目标文件:", TARGET);
        process.exit(1);
    }

    let content = fs.readFileSync(TARGET, "utf8");

    // 幂等检查
    if (content.includes(INJECT_MARKER)) {
        console.log("已经 patch 过了，无需重复操作。");
        return;
    }

    // 确保备份存在
    if (!fs.existsSync(BACKUP)) {
        fs.copyFileSync(TARGET, BACKUP);
        console.log("已备份原始文件:", BACKUP);
    }

    // 找注入点
    const idx = content.indexOf(INJECT_BEFORE);
    if (idx === -1) {
        console.error("找不到注入点，Cursor 版本可能已更新，需要重新分析。");
        process.exit(1);
    }

    // 注入：在 INJECT_BEFORE 之前插入代码
    const patched = content.slice(0, idx) + INJECT_CODE + "\n" + content.slice(idx);

    fs.writeFileSync(TARGET, patched, "utf8");
    console.log(`✅ patch 成功！注入位置: ${idx}`);
    console.log("请重启 Cursor 使 patch 生效。");
}

function restore() {
    if (!fs.existsSync(BACKUP)) {
        console.error("找不到备份文件:", BACKUP);
        process.exit(1);
    }
    fs.copyFileSync(BACKUP, TARGET);
    console.log("✅ 已恢复原始文件。");
}

// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--restore")) {
    restore();
} else {
    patch();
}
