import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                external: ["sqlite3", "better-sqlite3", "sql.js"],
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                input: resolve("src/main/preload.js"),
            },
        },
    },
    renderer: {
        root: "src/renderer",
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `@use "@renderer/styles/element/index.scss" as *;`,
                },
            },
        },
        plugins: [
            vue(),
            AutoImport({
                imports: ["vue"],
                dts: resolve("src/renderer/src/auto-imports.d.ts"),
                resolvers: [ElementPlusResolver({ importStyle: "sass" })],
            }),
            Components({
                resolvers: [ElementPlusResolver({ importStyle: "sass" })],
                dts: resolve("src/renderer/src/components.d.ts"),
            }),
        ],
    },
});
