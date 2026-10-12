# CursorHub · Cursor 账号管理助手

> 本地账号库、无感换号与环境维护，让切换账号更省事。

<div align="center">

[![版本](https://img.shields.io/badge/版本-v1.1.3-green)](#下载)
[![平台](https://img.shields.io/badge/平台-macOS%20arm64-blue)](#下载)
[![QQ群](https://img.shields.io/badge/QQ交流群-569846057-orange)](https://qun.qq.com/universal-share/share?ac=1&authKey=ZpKpMm4QdN1I2eWzqZYinybEpN1PfyrUlmgA01ZG0mAVSUVg0fWQWngzBnl7jG79&busi_data=eyJncm91cENvZGUiOiIxMDAyMzg4NTM3IiwidG9rZW4iOiJNR0hENmlHS0xHSzdmMm0xRmZSNjJpczdJMWl5WkhrNWI0SHVQOUZhemNuSTcvN0VQNUNSZVZ4Ty9kbU1KSFBWIiwidWluIjoiMzY2Mzg1NjQyOSJ9&data=ghmRHANkTOdaEFfbxNKWtfgZ5emKN2-RQ-FKgFvWnukdfbup51jtrgQKlbPS_2O-0QHYmuRUd7her7DzYjH43A&svctype=4&tempid=h5_group_info)

</div>

---

## 下载

| 渠道 | 地址 |
|------|------|
| 🐙 GitHub Releases | [最新版本](https://github.com/SKCodeing/CursorHub/releases/latest) |
| 🔷 夸克网盘 | [夸克网盘下载](https://pan.quark.cn/s/47124c66291d)（提取码 RDfL）|
| 📦 百度网盘 | [百度网盘下载](https://pan.baidu.com/s/1UPg4D4VO_F_47Fl1A7oc8g?pwd=9gmc) |

---

## 核心功能

- 🔄 **无感换号**：注入 Cursor 本体，额度用尽时自动推送新账号 token，无需重启 Cursor，对话不中断
- 📦 **账号池管理**：本地数据库存储多个账号，支持增删查、导入导出、批量刷新订阅状态
- 🤖 **自动换号**：开启后额度耗尽自动从账号池切换下一个账号，完全无人工干预
- 🛡️ **禁用更新弹窗**：全面屏蔽 Cursor 所有更新提示，保护注入补丁不被版本升级覆盖
- 💾 **备份恢复**：一键备份 Cursor 设置、快捷键、扩展、代码片段，随时还原
- 🖥️ **重置机器码**：重置设备标识符，使 Cursor 认为是一台新设备
- 📡 **定时采集**：实时监听 Cursor 账号变化，自动将新账号写入本地账号池
- 🔔 **版本更新提示**：启动后自动检查 GitHub 最新版本，有更新时顶部提示

---

## 使用帮助

### 安装与启动

1. 下载 `CursorHub-x.x.x-arm64.dmg`，双击打开
2. 将 CursorHub.app 拖入 Applications 文件夹
3. 首次打开需**右键 → 打开**（绕过 macOS Gatekeeper），之后可正常双击启动
4. 首页点击刷新图标，自动检测 Cursor 安装路径

> 也可以通过终端去掉隔离属性：
> ```bash
> xattr -cr /Applications/CursorHub.app
> ```

---

### 无感换号

无感换号是核心功能，开启后 Cursor 在需要时会自动获取新的账号 token，整个过程无需重启、不中断对话。

**开启步骤：**
1. 首页点击「开启无感换号」，注入成功后状态变为「已注入」
2. 保持 CursorHub 在后台运行（不能完全退出）
3. （可选）开启「额度用尽时自动换号」，实现全自动切换

> ⚠️ Cursor 版本升级会覆盖注入补丁，建议同时开启「禁用更新」，或升级后重新点击「开启无感换号」

---

### 账号管理

| 操作 | 说明 |
|------|------|
| 手动新增 | 填入邮箱和 accessToken 即可添加 |
| 导入 JSON | 批量导入账号文件 |
| 导出 JSON | 导出备份，便于迁移到其他设备 |
| 批量刷新 | 重新拉取所有账号的订阅状态和用量 |
| 切换账号 | 支持热切换（无感）、重置机器码、重启 Cursor 三种模式 |

**账号状态：**

| 状态 | 说明 |
|------|------|
| 🟢 使用中 | 当前 Cursor 正在使用的账号 |
| ⚪ 未使用 | 从未被切换使用过 |
| 🔵 已使用 | 用过但额度未耗尽 |
| 🔴 已用尽 | 触发过额度耗尽，自动换号会跳过此账号 |

---

### 禁用更新

开启后全面屏蔽 Cursor 所有更新提示与弹窗，保护无感换号功能不被版本升级破坏。

> 若需手动升级 Cursor：先关闭此开关 → 升级完成 → 重新开启 → 重新点击「开启无感换号」

---

### 备份与恢复

支持备份 Cursor 的以下配置：
- 用户设置（settings.json）
- 键盘快捷键（keybindings.json）
- 已安装扩展列表
- 代码片段（snippets）

首页点击「备份设置」选择保存位置；点击「备份恢复」选择备份文件还原。

---

### 定时采集

每秒检测 Cursor 当前登录账号，发现新账号自动写入本地账号池（状态为「未使用」）。

适用场景：在 Cursor 里手动登录多个账号、配合批量注册脚本边注册边采集。

---

### 重置机器码

重置设备标识符，使 Cursor 认为是一台新设备。

> ⚠️ 需要管理员权限，操作时会弹出系统授权请求

---

## 常见问题

**Q：打开应用提示「无法打开，因为 Apple 无法检查其是否包含恶意软件」**  
右键 → 打开 → 弹窗中点「打开」。或终端执行 `xattr -cr /Applications/CursorHub.app`

**Q：首页显示「未找到 Cursor 安装路径」**  
确认 Cursor 已安装到默认路径（`/Applications/Cursor.app`），打开 Cursor 后再点击 CursorHub 刷新按钮。

**Q：无感换号注入后热切换没效果**  
1. 确认 CursorHub 没有完全退出
2. 切换后等待 1-3 秒，或新开一个对话窗口
3. 如仍无效：关闭无感换号 → 重新开启 → 重新切换账号

**Q：升级 Cursor 后换号功能失效**  
重新打开 CursorHub，点击「开启无感换号」重新注入即可。建议平时保持「禁用更新」开启。

**Q：如何获取账号 token？**  
在 Cursor 官网登录后，从 cookie 中提取 `WorkosCursorSessionToken`，或从本地 `storage.json` 中获取 `cursorAuth/accessToken`，填入账号管理的 Token 字段。

**Q：账号池数据存在哪里？**  
`~/Library/Application Support/CursorHub/cursor-hub-accounts.db`

---

## 推荐工作流

> 开启无感换号 → 开启禁用更新 → 导入多个账号 → 开启自动换号 → 正常使用 Cursor  
> 额度到了自动切换，完全无感。

| 场景 | 建议操作 |
|------|---------|
| 日常使用 | 开启无感换号 + 自动换号，保持 CursorHub 后台运行 |
| 账号快用完了 | 账号管理页批量刷新，确认有「未使用」账号可用 |
| Cursor 需要更新 | 先关闭「禁用更新」，更新完后重新开启并重新注入 |
| 换新电脑 | 导出账号池 JSON → 新电脑导入 → 重置机器码 → 切换账号 |

---

## 💰 赞赏支持

如果觉得有帮助，欢迎请作者喝杯咖啡，鼓励持续更新。扫码赞赏后可加 QQ `807600577` 联系作者反馈问题。

<div align="center">
  <table>
    <tr>
      <td align="center"><img src="img/pay2.png" width="180"/><br>微信</td>
      <td align="center"><img src="img/pay1.png" width="180"/><br>支付宝</td>
      <td align="center"><img src="img/chat.jpg" width="180"/><br>QQ 交流群</td>
    </tr>
  </table>
</div>

---

## 免责声明

本工具仅供学习和研究使用，使用本工具所产生的任何后果由使用者自行承担。
