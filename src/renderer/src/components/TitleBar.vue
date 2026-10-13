<template>
    <div class="title-bar" @dblclick="handleDoubleClick">
        <div class="title-bar-container">
            <div class="title-bar-left"></div>
            <div class="title-bar-right">
                <!-- Windows/Linux：按钮在右侧 -->
                <div v-if="platform !== 'darwin'" class="window-controls">
                    <div class="control-button" @click.stop="minimizeWindow">
                        <img :src="minimizeIcon" alt="minimize" />
                    </div>
                    <div class="control-button" @click.stop="maximizeWindow">
                        <img :src="maximizeIcon" alt="maximize" />
                    </div>
                    <div class="control-button close-button" @click.stop="closeWindow">
                        <img :src="closeIcon" alt="close" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import minimizeIcon from "../assets/image/minus.svg";
    import maximizeIcon from "../assets/image/max.svg";
    import closeIcon from "../assets/image/close.svg";

    const platform = window.api.platform;
    const minimizeWindow = () => window.api.minimizeWindow();
    const maximizeWindow = () => window.api.maximizeWindow();
    const closeWindow = () => window.api.closeWindow();

    const handleDoubleClick = (event) => {
        if (event.target.closest(".window-controls")) {
            return;
        }
        maximizeWindow();
    };
</script>

<style scoped lang="scss">
    .title-bar {
        color: var(--foreground);
        -webkit-app-region: no-drag;
        app-region: no-drag;
        user-select: none;
        padding: 0 8px 0 12px;
        position: relative;
        z-index: 20;
        flex-shrink: 0;
        background: transparent;

        .title-bar-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 36px;
            -webkit-app-region: drag;
            app-region: drag;

            .title-bar-left,
            .title-bar-right {
                display: flex;
                align-items: center;
                position: relative;
                z-index: 2;
            }

            .mac-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 4px;
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
        transition: filter 0.1s;

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

    .window-controls {
                display: flex;
                -webkit-app-region: no-drag;
                app-region: no-drag;

                .control-button {
                    width: 32px;
                    height: 28px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    cursor: pointer;
                    border-radius: 6px;
                    transition: background-color 0.15s;

                    &:hover {
                        background-color: rgb(var(--primary-rgb) / 0.12);
                    }

                    &.close-button:hover {
                        background-color: #e81123;
                        img {
                            filter: brightness(10);
                        }
                    }

                    img {
                        width: 12px;
                        height: 12px;
                        opacity: 0.7;
                    }
                }
            }
        }
    }

    :global(html.dark) .control-button img {
        filter: invert(1);
        opacity: 0.85;
    }
</style>
