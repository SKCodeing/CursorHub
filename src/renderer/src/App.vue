<script setup>
    import Home from "./components/Home.vue";
    import TitleBar from "./components/TitleBar.vue";
    import AppSidebar from "./components/AppSidebar.vue";
</script>

<template>
    <div class="app-shell">
        <div class="bg-glow bg-glow-1"></div>
        <div class="bg-glow bg-glow-2"></div>
        <div class="workspace">
            <AppSidebar />
            <div class="main-column">
                <TitleBar />
                <main class="app-main">
                    <Home />
                </main>
            </div>
        </div>
    </div>
</template>

<style lang="scss">
    .app-shell {
        position: relative;
        height: calc(100vh - 6px);
        width: calc(100vw - 6px);
        margin: 3px;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: transparent;
        box-shadow: 0 8px 32px rgb(0 0 0 / 18%);
        display: flex;
        flex-direction: column;
    }

    .workspace {
        position: relative;
        z-index: 1;
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .main-column {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .app-main {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding-top: 0;
    }

    .auto-register-dialog {
        .el-input {
            width: 80px;
        }
    }
</style>
