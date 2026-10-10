<script setup>
    import { ref, computed } from "vue";
    import { storeToRefs } from "pinia";
    import { useAppStore } from "../stores/app.js";
    import {
        Link,
        Document,
        ChatDotRound,
        Coffee,
        InfoFilled,
        Close,
    } from "@element-plus/icons-vue";
    import appIcon from "../assets/image/icon.png";
    import alipayQR from "../assets/donate/alipay.png";
    import wechatQR from "../assets/donate/wechat.png";
    import qqGroupQR from "../assets/donate/qq-group.jpg";

    const CURRENT_YEAR = new Date().getFullYear();

    const LINKS = {
        github: "https://github.com/liqiang-xxfy/fly-cursor-free/releases/latest",
        docs: "https://docs.qq.com/aio/DUGd6V2t5WUVoQUdG",
        qqGroup: "https://qun.qq.com/universal-share/share?ac=1&authKey=ZpKpMm4QdN1I2eWzqZYinybEpN1PfyrUlmgA01ZG0mAVSUVg0fWQWngzBnl7jG79&busi_data=eyJncm91cENvZGUiOiIxMDAyMzg4NTM3IiwidG9rZW4iOiJNR0hENmlHS0xHSzdmMm0xRmZSNjJpczdJMWl5WkhrNWI0SHVQOUZhemNuSTcvN0VQNUNSZVZ4Ty9kbU1KSFBWIiwidWluIjoiMzY2Mzg1NjQyOSJ9&data=ghmRHANkTOdaEFfbxNKWtfgZ5emKN2-RQ-FKgFvWnukdfbup51jtrgQKlbPS_2O-0QHYmuRUd7her7DzYjH43A&svctype=4&tempid=h5_group_info",
        pan123: "https://www.123865.com/s/uY80Td-AtUh",
        baidu: "https://pan.baidu.com/s/1UPg4D4VO_F_47Fl1A7oc8g?pwd=9gmc",
    };

    const appStore = useAppStore();
    const { appConfig, aboutNotice, appLicenseInfo } = storeToRefs(appStore);

    const previewImg = ref(null);

    const versionText = computed(() => (appConfig.value?.version || "").trim());
    const signatureText = computed(() => appLicenseInfo.value?.signature || "");
    const appName = computed(() => appConfig.value?.appName || "CursorHub");
    const contactQQ = "807600577";
    const qqGroupNo = "1002388537";

    const techStack = [
        { label: "Electron" },
        { label: "Vue 3" },
        { label: "Element Plus" },
    ];

    const openLink = (url) => {
        if (url) window.api.openExternalLink(url);
    };

    const openHelpDoc = () => {
        window.api.openHelpDoc();
    };
</script>

<template>
    <div class="about-page">
        <el-scrollbar>
            <div class="about-stack">
                <!-- 应用介绍 -->
                <section class="glass-card intro-card">
                    <div class="intro-row">
                        <div class="logo-wrap">
                            <img :src="appIcon" alt="CursorHub" class="app-logo" />
                        </div>
                        <div class="intro-meta">
                            <div class="intro-title-row">
                                <h1 class="app-name">{{ appName }}</h1>
                                <el-tag size="small" effect="plain" class="ver-tag">v{{ versionText || "—" }}</el-tag>
                            </div>
                            <p class="app-desc">
                                Cursor 账号管理助手：本地账号库、无感换号与环境维护，让切换账号更省事。
                            </p>
                            <div class="tech-chips">
                                <span v-for="item in techStack" :key="item.label" class="tech-chip">{{ item.label }}</span>
                            </div>
                            <div class="intro-actions">
                                <el-button type="primary" size="small" @click="openHelpDoc">使用帮助</el-button>
                                <el-button size="small" @click="openLink(LINKS.github)">下载更新</el-button>
                            </div>
                        </div>
                    </div>

                    <div v-if="aboutNotice?.length" class="notice-block">
                        <div
                            v-for="(notice, index) in aboutNotice"
                            :key="index"
                            class="notice-item"
                            :class="{ 'has-link': notice.url }"
                            :style="{
                                color: notice.color || (notice.url ? 'var(--el-color-primary)' : ''),
                                fontSize: notice.fontSize || '',
                            }"
                            @click="notice.url ? openLink(notice.url) : null"
                        >
                            <span class="notice-title">{{ notice.title }}</span>
                            <span v-if="notice.message">：{{ notice.message }}</span>
                        </div>
                    </div>
                </section>

                <!-- 相关链接 -->
                <section class="glass-card section-card">
                    <div class="section-head">
                        <el-icon class="section-icon link-tone"><Link /></el-icon>
                        <span>相关链接</span>
                    </div>
                    <div class="link-list">
                        <button type="button" class="link-row" @click="openHelpDoc">
                            <div class="link-icon doc-tone"><el-icon :size="15"><Document /></el-icon></div>
                            <div class="link-text">
                                <div class="link-label">使用帮助文档</div>
                                <div class="link-desc">常见问题与配置说明</div>
                            </div>
                        </button>
                        <button type="button" class="link-row" @click="openLink(LINKS.docs)">
                            <div class="link-icon doc-tone"><el-icon :size="15"><Document /></el-icon></div>
                            <div class="link-text">
                                <div class="link-label">在线文档</div>
                                <div class="link-desc">docs.qq.com</div>
                            </div>
                        </button>
                        <button type="button" class="link-row" @click="openLink(LINKS.github)">
                            <div class="link-icon gh-tone"><el-icon :size="15"><Link /></el-icon></div>
                            <div class="link-text">
                                <div class="link-label">GitHub Releases</div>
                                <div class="link-desc">liqiang-xxfy/fly-cursor-free</div>
                            </div>
                        </button>
                        <div class="link-grid">
                            <button type="button" class="link-row" @click="openLink(LINKS.pan123)">
                                <div class="link-icon primary-tone"><el-icon :size="15"><Link /></el-icon></div>
                                <div class="link-text">
                                    <div class="link-label">123 云盘</div>
                                    <div class="link-desc">备用下载</div>
                                </div>
                            </button>
                            <button type="button" class="link-row" @click="openLink(LINKS.baidu)">
                                <div class="link-icon primary-tone"><el-icon :size="15"><Link /></el-icon></div>
                                <div class="link-text">
                                    <div class="link-label">百度网盘</div>
                                    <div class="link-desc">提取码 9gmc</div>
                                </div>
                            </button>
                        </div>
                        <button type="button" class="link-row" @click="openLink(LINKS.qqGroup)">
                            <div class="link-icon chat-tone"><el-icon :size="15"><ChatDotRound /></el-icon></div>
                            <div class="link-text">
                                <div class="link-label">QQ 交流群</div>
                                <div class="link-desc">{{ qqGroupNo }}</div>
                            </div>
                        </button>
                    </div>
                </section>

                <!-- 赞赏支持 -->
                <section class="glass-card section-card">
                    <div class="section-head">
                        <el-icon class="section-icon coffee-tone"><Coffee /></el-icon>
                        <span>赞赏支持</span>
                    </div>
                    <p class="section-desc">如果觉得有帮助，欢迎请作者喝杯咖啡，鼓励持续更新。</p>

                    <div class="tip-bar">
                        <el-icon :size="14" class="tip-icon"><InfoFilled /></el-icon>
                        <span>扫码赞赏后，可加 QQ 联系作者反馈问题：{{ contactQQ }}</span>
                    </div>

                    <div class="qr-grid">
                        <button type="button" class="qr-card" @click="previewImg = wechatQR">
                            <img :src="wechatQR" alt="微信赞赏" />
                            <span>微信</span>
                        </button>
                        <button type="button" class="qr-card" @click="previewImg = alipayQR">
                            <img :src="alipayQR" alt="支付宝赞赏" />
                            <span>支付宝</span>
                        </button>
                        <button type="button" class="qr-card" @click="previewImg = qqGroupQR">
                            <img :src="qqGroupQR" alt="交流群" />
                            <span>交流群</span>
                        </button>
                    </div>
                    <p class="qr-hint">点击二维码可放大查看</p>
                </section>

                <footer class="about-footer">
                    <span>Made with care</span>
                    <span class="dot">·</span>
                    <span>联系 QQ {{ contactQQ }}</span>
                    <span class="dot">·</span>
                    <span>© {{ CURRENT_YEAR }}</span>
                </footer>
                <p v-if="signatureText" class="signature">{{ signatureText }}</p>
            </div>
        </el-scrollbar>

        <el-dialog
            :model-value="!!previewImg"
            width="360px"
            align-center
            :show-close="false"
            class="qr-preview-dialog"
            @update:model-value="(v) => !v && (previewImg = null)"
        >
            <div class="preview-wrap">
                <img v-if="previewImg" :src="previewImg" alt="预览" class="preview-img" />
                <button type="button" class="preview-close" @click="previewImg = null">
                    <el-icon :size="16"><Close /></el-icon>
                </button>
            </div>
        </el-dialog>
    </div>
</template>

<style scoped lang="scss">
    .about-page {
        height: 100%;
        min-height: 0;
    }

    .about-stack {
        max-width: 720px;
        margin: 0 auto;
        padding: 4px 4px 28px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .intro-card,
    .section-card {
        padding: 18px 20px;
    }

    .intro-row {
        display: flex;
        gap: 16px;
        align-items: flex-start;
    }

    .logo-wrap {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(145deg, rgb(var(--primary-rgb) / 0.18), rgb(var(--primary-rgb) / 0.05));
        border: 1px solid rgb(var(--primary-rgb) / 0.2);
        box-shadow: 0 8px 20px rgb(var(--primary-rgb) / 0.15);
        overflow: hidden;
    }

    .app-logo {
        width: 44px;
        height: 44px;
        object-fit: contain;
        display: block;
    }

    .intro-meta {
        flex: 1;
        min-width: 0;
    }

    .intro-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .app-name {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.02em;
    }

    .ver-tag {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .app-desc {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.55;
        color: var(--muted-foreground);
    }

    .tech-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
    }

    .tech-chip {
        font-size: 11px;
        color: var(--muted-foreground);
        border: 1px solid var(--border);
        background: rgb(var(--surface-contrast-rgb) / 0.55);
        border-radius: 999px;
        padding: 2px 8px;
    }

    .intro-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
    }

    .notice-block {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .notice-item {
        font-size: 13px;
        color: var(--muted-foreground);
        line-height: 1.5;

        &.has-link {
            cursor: pointer;
            color: var(--primary);

            &:hover {
                text-decoration: underline;
            }
        }
    }

    .notice-title {
        font-weight: 600;
    }

    .section-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 650;
        margin-bottom: 10px;
    }

    .section-icon {
        font-size: 16px;
    }

    .link-tone { color: #3b82f6; }
    .coffee-tone { color: #f59e0b; }

    .section-desc {
        margin: -2px 0 12px;
        font-size: 12px;
        color: var(--muted-foreground);
        line-height: 1.5;
    }

    .link-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .link-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .link-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: rgb(var(--surface-rgb) / 0.45);
        color: var(--foreground);
        cursor: pointer;
        text-align: left;
        transition: background 0.15s ease, border-color 0.15s ease;

        &:hover {
            background: rgb(var(--primary-rgb) / 0.06);
            border-color: rgb(var(--primary-rgb) / 0.28);
        }
    }

    .link-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.doc-tone {
            color: #3b82f6;
            background: rgb(59 130 246 / 0.1);
        }
        &.gh-tone {
            color: var(--foreground);
            background: rgb(var(--foreground) / 0.06);
        }
        &.primary-tone {
            color: var(--primary);
            background: rgb(var(--primary-rgb) / 0.1);
        }
        &.chat-tone {
            color: #22c55e;
            background: rgb(34 197 94 / 0.1);
        }
    }

    .link-text {
        min-width: 0;
        flex: 1;
    }

    .link-label {
        font-size: 13px;
        font-weight: 600;
    }

    .link-desc {
        font-size: 11px;
        color: var(--muted-foreground);
        margin-top: 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .tip-bar {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgb(59 130 246 / 0.2);
        background: rgb(59 130 246 / 0.06);
        font-size: 12px;
        line-height: 1.5;
        color: var(--foreground);
        margin-bottom: 12px;
    }

    .tip-icon {
        color: #3b82f6;
        margin-top: 1px;
        flex-shrink: 0;
    }

    .qr-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
    }

    .qr-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: rgb(var(--surface-rgb) / 0.5);
        cursor: pointer;
        color: var(--foreground);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;

        &:hover {
            border-color: rgb(var(--primary-rgb) / 0.4);
            box-shadow: 0 4px 14px rgb(15 23 42 / 0.06);
        }

        img {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border-radius: 8px;
            background: #fff;
        }

        span {
            font-size: 12px;
            font-weight: 600;
        }
    }

    .qr-hint {
        margin: 10px 0 0;
        text-align: center;
        font-size: 11px;
        color: var(--muted-foreground);
    }

    .about-footer {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 0 0;
        font-size: 12px;
        color: var(--muted-foreground);
    }

    .dot {
        opacity: 0.45;
    }

    .signature {
        text-align: center;
        font-size: 11px;
        color: var(--muted-foreground);
        white-space: pre-wrap;
        margin: 0;
        opacity: 0.75;
    }

    .preview-wrap {
        position: relative;
        display: flex;
        justify-content: center;
    }

    .preview-img {
        width: 280px;
        max-width: 100%;
        border-radius: 12px;
        background: #fff;
    }

    .preview-close {
        position: absolute;
        top: -10px;
        right: -10px;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgb(var(--surface-rgb) / 0.95);
        color: var(--foreground);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }
</style>

<style>
    .qr-preview-dialog .el-dialog__header {
        display: none;
    }
    .qr-preview-dialog .el-dialog__body {
        padding: 16px;
    }
</style>
