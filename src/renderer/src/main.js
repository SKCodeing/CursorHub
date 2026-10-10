import "./assets/main.css";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-message-box.css";
import "./styles/theme.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import App from "./App.vue";
import { useUiStore } from "./stores/ui.js";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus, {
    locale: zhCn,
});

const ui = useUiStore();
ui.applyTheme();

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (ui.theme === "system") ui.applyTheme();
});

app.mount("#app");
