<template>
    <div class="title-bar" @dblclick="handleDoubleClick">
        <div class="title-bar-container">
            <div class="title-bar-left"></div>
            <div class="title-bar-right">
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
