import { defineStore } from "pinia";

export const THEME_REGISTRY = [
    { key: "system", name: "跟随系统", icon: "monitor", preview: "linear-gradient(135deg, #94a3b8, #334155)" },
    { key: "light", name: "浅色", icon: "sun", preview: "linear-gradient(135deg, #60a5fa, #2563eb)" },
    { key: "dark", name: "深色", icon: "moon", preview: "linear-gradient(135deg, #3f3f46, #18181b)" },
    { key: "purple", name: "紫罗兰", icon: "palette", preview: "linear-gradient(135deg, #a78bfa, #6d28d9)" },
    { key: "green", name: "翠绿", icon: "palette", preview: "linear-gradient(135deg, #34d399, #059669)" },
    { key: "tech", name: "科技蓝", icon: "palette", preview: "linear-gradient(135deg, #22d3ee, #2563eb)" },
    { key: "dark-one", name: "深灰", icon: "moon", preview: "linear-gradient(135deg, #61afef, #1b1e23)" },
    { key: "business", name: "商务金", icon: "palette", preview: "linear-gradient(135deg, #fbbf24, #b45309)" },
    { key: "sunset", name: "日落", icon: "palette", preview: "linear-gradient(135deg, #fb923c, #dc2626)" },
    { key: "ocean", name: "海洋", icon: "palette", preview: "linear-gradient(135deg, #38bdf8, #0284c7)" },
    { key: "rose", name: "玫瑰", icon: "palette", preview: "linear-gradient(135deg, #fb7185, #db2777)" },
    { key: "aurora", name: "极光", icon: "palette", preview: "linear-gradient(135deg, #2dd4bf, #059669)" },
    { key: "midnight", name: "午夜", icon: "moon", preview: "linear-gradient(135deg, #fbbf24, #000000)" },
    { key: "forest", name: "森林", icon: "palette", preview: "linear-gradient(135deg, #4ade80, #166534)" },
    { key: "sakura", name: "樱花", icon: "palette", preview: "linear-gradient(135deg, #fda4af, #db2777)" },
];

export const THEME_KEYS = THEME_REGISTRY.map((t) => t.key);

const DARK_KEYS = new Set(["dark", "dark-one", "tech", "midnight"]);

function resolveTheme(key) {
    if (key === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return THEME_KEYS.includes(key) ? key : "light";
}

export function applyDocumentTheme(pref) {
    const resolved = resolveTheme(pref);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-pref", pref);
    document.documentElement.classList.toggle("dark", DARK_KEYS.has(resolved));
}

export const useUiStore = defineStore("ui", {
    state: () => ({
        theme: localStorage.getItem("ch-theme") || "light",
        sidebarCollapsed: localStorage.getItem("ch-sidebar-collapsed") === "true",
        activeNav: localStorage.getItem("ch-active-nav") || "home",
    }),
    getters: {
        currentThemeMeta: (state) => THEME_REGISTRY.find((t) => t.key === state.theme) || THEME_REGISTRY[1],
        resolvedTheme: (state) => resolveTheme(state.theme),
    },
    actions: {
        applyTheme() {
            applyDocumentTheme(this.theme);
        },
        setTheme(key) {
            this.theme = THEME_KEYS.includes(key) ? key : "light";
            localStorage.setItem("ch-theme", this.theme);
            this.applyTheme();
        },
        cycleTheme() {
            const idx = THEME_KEYS.indexOf(this.theme);
            const next = THEME_KEYS[(idx < 0 ? 0 : idx + 1) % THEME_KEYS.length];
            this.setTheme(next);
        },
        setSidebarCollapsed(val) {
            this.sidebarCollapsed = val;
            localStorage.setItem("ch-sidebar-collapsed", String(val));
        },
        toggleSidebar() {
            this.setSidebarCollapsed(!this.sidebarCollapsed);
        },
        setActiveNav(id) {
            this.activeNav = id;
            localStorage.setItem("ch-active-nav", id);
        },
    },
});
