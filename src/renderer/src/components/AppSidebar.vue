<script setup>
    import { computed } from "vue";
    import { storeToRefs } from "pinia";
    import { useUiStore } from "../stores/ui.js";
    import { useAppStore } from "../stores/app.js";
    import { House, Key, Setting, InfoFilled, Sunny, Moon, Monitor, Brush } from "@element-plus/icons-vue";
    import appIcon from "../assets/image/icon.png";

    const ui = useUiStore();
    const appStore = useAppStore();
    const { sidebarCollapsed, activeNav, currentThemeMeta } = storeToRefs(ui);
    const { appConfig } = storeToRefs(appStore);

    const menus = [
        { id: "home", label: "首页", icon: House },
        { id: "accounts", label: "账号", icon: Key },
        { id: "settings", label: "设置", icon: Setting },
        { id: "about", label: "关于", icon: InfoFilled },
    ];

    const themeIcon = computed(() => {
        const map = { sun: Sunny, moon: Moon, monitor: Monitor, palette: Brush };
        return map[currentThemeMeta.value.icon] || Brush;
    });

    const versionText = computed(() => appConfig.value?.version || "");

    const platform = window.api.platform;
    const closeWindow = () => window.api.closeWindow();
    const minimizeWindow = () => window.api.minimizeWindow();
    const maximizeWindow = () => window.api.maximizeWindow();
</script>

<template>
    <aside class="app-sidebar glass-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <!-- 顶部拖拽区与窗口顶栏对齐，避免品牌区「悬空」 -->
        <div class="sidebar-drag">
            <!-- macOS 红黄绿窗口控制按钮 -->
            <div v-if="platform === 'darwin'" class="mac-controls">
                <div class="mac-btn mac-close" @click.stop="closeWindow" title="关闭"></div>
                <div class="mac-btn mac-minimize" @click.stop="minimizeWindow" title="最小化"></div>
                <div class="mac-btn mac-maximize" @click.stop="maximizeWindow" title="最大化"></div>
            </div>
        </div>

        <button
            class="brand"
            type="button"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="ui.toggleSidebar()"
        >
            <div class="brand-logo-wrap">
                <img :src="appIcon" alt="CursorHub" class="brand-logo" />
            </div>
            <div v-if="!sidebarCollapsed" class="brand-text">
                <span class="brand-name">CursorHub</span>
                <span class="brand-sub">Account Manager</span>
            </div>
        </button>

        <nav class="nav">
            <el-tooltip
                v-for="item in menus"
                :key="item.id"
                :content="item.label"
                :disabled="!sidebarCollapsed"
                placement="right"
            >
                <button
                    type="button"
                    class="nav-item"
                    :class="{ active: activeNav === item.id }"
                    @click="ui.setActiveNav(item.id)"
                >
                    <span v-if="activeNav === item.id" class="active-bar" />
                    <el-icon :size="18"><component :is="item.icon" /></el-icon>
                    <span v-if="!sidebarCollapsed" class="nav-label">{{ item.label }}</span>
                </button>
            </el-tooltip>
        </nav>

        <div class="sidebar-footer">
            <el-tooltip :content="`主题：${currentThemeMeta.name}`" placement="right">
                <button type="button" class="nav-item theme-btn" @click="ui.cycleTheme()">
                    <el-icon :size="18"><component :is="themeIcon" /></el-icon>
                    <span v-if="!sidebarCollapsed" class="nav-label">{{ currentThemeMeta.name }}</span>
                </button>
            </el-tooltip>
            <div v-if="!sidebarCollapsed" class="ver">v{{ versionText }}</div>
        </div>
    </aside>
</template>

<style scoped lang="scss">
    .app-sidebar {
        width: 200px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        z-index: 2;
        transition: width 0.2s ease;
        user-select: none;
        height: 100%;
        border-right: 1px solid var(--border);

        &.collapsed {
            width: 68px;

            .brand {
                justify-content: center;
                padding: 8px 10px 14px;
            }

            .nav,
            .sidebar-footer {
                padding-inline: 10px;
            }

            .nav-item {
                justify-content: center;
                padding-inline: 0;
            }

            .active-bar {
                display: none;
            }
        }
    }

    .sidebar-drag {
        height: 36px;
        flex-shrink: 0;
        -webkit-app-region: drag;
        app-region: drag;
        display: flex;
        align-items: center;
        padding-left: 12px;
    }

    .mac-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        -webkit-app-region: no-drag;
        app-region: no-drag;
    }

    .mac-btn {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        cursor: pointer;
        position: relative;
        flex-shrink: 0;

        &::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.1s;
        }
        &:hover::before { opacity: 1; }
    }

    .mac-close {
        background: #ff5f57;
        border: 0.5px solid #e0443e;
        &::before {
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M3 3l4 4M7 3l-4 4' stroke='%23820005' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E") center/8px no-repeat;
        }
    }

    .mac-minimize {
        background: #febc2e;
        border: 0.5px solid #d79b28;
        &::before {
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 5h6' stroke='%23985700' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E") center/8px no-repeat;
        }
    }

    .mac-maximize {
        background: #28c840;
        border: 0.5px solid #1bad2e;
        &::before {
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M3 7l4-4M3 3h4v4' stroke='%23006500' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/8px no-repeat;
        }
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 10px 8px;
        padding: 8px 8px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        cursor: pointer;
        color: var(--foreground);
        -webkit-app-region: no-drag;
        app-region: no-drag;
        transition: background 0.15s ease;

        &:hover {
            background: rgb(var(--primary-rgb) / 0.08);
        }
    }

    .brand-logo-wrap {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgb(var(--surface-rgb) / 0.55);
        border: 1px solid var(--border);
        overflow: hidden;
    }

    .brand-logo {
        width: 22px;
        height: 22px;
        object-fit: contain;
        display: block;
    }

    .brand-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        min-width: 0;
        flex: 1;
        text-align: left;
    }

    .brand-name {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1.25;
    }

    .brand-sub {
        font-size: 11px;
        color: var(--muted-foreground);
        line-height: 1.2;
        margin-top: 1px;
    }

    .nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 10px;
        flex: 1;
        overflow: auto;
        -webkit-app-region: no-drag;
    }

    .nav-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 40px;
        padding: 0 12px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--muted-foreground);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.15s ease, color 0.15s ease;

        &:hover:not(.active) {
            background: rgb(var(--primary-rgb) / 0.08);
            color: var(--foreground);
        }

        &.active {
            background: var(--primary);
            color: #fff;
            font-weight: 600;
        }
    }

    .active-bar {
        position: absolute;
        left: 4px;
        width: 3px;
        height: 14px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.85;
    }

    .nav-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .sidebar-footer {
        padding: 8px 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-top: 1px solid var(--border);
        -webkit-app-region: no-drag;
    }

    .theme-btn {
        color: var(--muted-foreground);
    }

    .ver {
        font-size: 11px;
        color: var(--muted-foreground);
        padding: 2px 12px 0;
        opacity: 0.65;
    }
</style>
