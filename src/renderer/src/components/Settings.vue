<script setup>
    import { useAppStore } from "../stores/app.js";
    import { storeToRefs } from "pinia";
    import { ref, onMounted, onUnmounted } from "vue";
    import { ElMessage } from "element-plus";

    const formRef = ref(null);

    const rules = ref({
        EMAIL_DOMAIN: [{ required: true, message: "请输入域名", trigger: "blur" }],
        RECEIVING_EMAIL: [
            { required: true, message: "请输入tempmail邮箱", trigger: "blur" },
            { type: "email", message: "请输入正确的邮箱格式", trigger: ["blur", "change"] },
        ],
        RECEIVING_EMAIL_PIN: [{ required: true, message: "请输入PIN码", trigger: "blur" }],
    });

    const appStore = useAppStore();
    const { appConfig } = storeToRefs(appStore);

    const localConfig = ref({
        EMAIL_DOMAIN: "",
        RECEIVING_EMAIL: "",
        RECEIVING_EMAIL_PIN: "",
    });

    // ── 自动换号状态 ───────────────────────────────────────────
    const autoSwitchEnabled = ref(false);
    const autoSwitchStats = ref({
        currentEmail: "",
        todaySwitchCount: 0,
        lastSwitchTime: "",
    });

    let unsubAutoSwitch = null;

    const loadAutoSwitchStats = async () => {
        const stats = await window.api.getAutoSwitchStats();
        autoSwitchEnabled.value = stats.enabled;
        autoSwitchStats.value = stats;
    };

    const toggleAutoSwitch = async (val) => {
        await window.api.setAutoSwitch(val);
        autoSwitchEnabled.value = val;
        ElMessage.success(val ? "自动换号已开启" : "自动换号已关闭");
    };

    // ──────────────────────────────────────────────────────────

    const updateConfig = () => {
        if (appConfig.value) {
            localConfig.value = JSON.parse(JSON.stringify(appConfig.value));
            formRef.value?.clearValidate();
        }
    };

    onMounted(() => {
        updateConfig();
        loadAutoSwitchStats();
        // 监听自动换号事件，实时刷新统计
        unsubAutoSwitch = window.api.onAutoSwitchEvent(({ channel, data }) => {
            if (channel === "auto-switched") {
                autoSwitchStats.value.currentEmail = data.email;
                autoSwitchStats.value.todaySwitchCount = data.todaySwitchCount;
                autoSwitchStats.value.lastSwitchTime = data.lastSwitchTime;
                ElMessage.success(`已自动切换到: ${data.email}`);
            } else if (channel === "auto-switch-failed") {
                ElMessage.warning("自动换号失败：账号池已耗尽");
            }
        });
    });

    onUnmounted(() => {
        unsubAutoSwitch?.();
    });

    defineExpose({
        updateConfig,
    });

    const saveConfig = async () => {
        if (!formRef.value) return;
        try {
            await formRef.value.validate();
        } catch {
            return;
        }

        const newConfig = JSON.parse(JSON.stringify(localConfig.value));

        try {
            let setResult = await window.api.setAppConfig(newConfig);
            if (setResult.success) {
                ElMessage.success(`修改配置成功`);
                await appStore.fetchAppConfig();
            } else {
                ElMessage.error("修改配置失败");
            }
        } catch (error) {
            console.log("error1 :>> ", error);
            ElMessage.error("修改配置失败");
        }
    };

    const openLink = (url) => {
        window.api.openExternalLink(url);
    };
</script>

<template>
    <div v-if="localConfig" class="settings-container">

        <!-- 自动换号卡片 -->
        <div class="auto-switch-card">
            <div class="auto-switch-header">
                <div>
                    <div class="card-title">自动换号</div>
                    <div class="card-desc">用量耗尽自动切换账号 · 套餐模型：Auto</div>
                </div>
                <div class="switch-wrap">
                    <span class="switch-label">{{ autoSwitchEnabled ? "已开启" : "已关闭" }}</span>
                    <el-switch
                        :model-value="autoSwitchEnabled"
                        :active-color="'#67c23a'"
                        @change="toggleAutoSwitch"
                    />
                </div>
            </div>
            <div class="auto-switch-body">
                <div class="stat-item">
                    <div class="stat-label">当前邮箱</div>
                    <div class="stat-value highlight">{{ autoSwitchStats.currentEmail || "—" }}</div>
                </div>
                <div class="stat-row">
                    <div class="stat-item">
                        <div class="stat-label">今日换号次数</div>
                        <div class="stat-value">{{ autoSwitchStats.todaySwitchCount ?? 0 }}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">上次换号时间</div>
                        <div class="stat-value highlight">{{ autoSwitchStats.lastSwitchTime || "—" }}</div>
                    </div>
                </div>
            </div>
        </div>

        <el-divider />

        <el-form ref="formRef" :model="localConfig" :rules="rules" label-width="150px" style="max-width: 450px">
            <el-form-item label="域名" prop="EMAIL_DOMAIN">
                <el-input v-model="localConfig.EMAIL_DOMAIN" placeholder="个人域名 例：flyxx.com 阿里云1元购买" />
            </el-form-item>
            <el-form-item label="tempmail邮箱" prop="RECEIVING_EMAIL">
                <el-input v-model="localConfig.RECEIVING_EMAIL" placeholder="临时邮箱 https://tempmail.plus免费申请" />
            </el-form-item>
            <el-form-item label="PIN码" prop="RECEIVING_EMAIL_PIN">
                <el-input v-model="localConfig.RECEIVING_EMAIL_PIN" placeholder="临时邮箱PIN码" />
            </el-form-item>
            <el-form-item label="">
                <p class="open-link" @click.prevent="openLink('https://tempmail.plus')">
                    临时邮箱申请地址:https://tempmail.plus
                </p>
            </el-form-item>
            <el-form-item label="">
                <p class="open-link" @click.prevent="openLink('https://www.bilibili.com/opus/951275934028136469')">
                    Cloudflare路由无限邮箱配置教程
                </p>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" @click="saveConfig">保存</el-button>
            </el-form-item>
        </el-form>
    </div>
    <div v-else>正在加载配置...</div>
</template>

<style scoped>
    .settings-container {
        padding: 20px;
    }
    .open-link {
        color: var(--el-color-primary);
        cursor: pointer;
        text-decoration: underline;
    }
    :deep(.el-form-item) {
        label {
            color: var(--ev-c-text-1);
        }
    }

    /* 自动换号卡片 */
    .auto-switch-card {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 16px;
        max-width: 500px;
    }
    .auto-switch-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }
    .card-title {
        font-size: 15px;
        font-weight: 600;
        color: #e0e0e0;
    }
    .card-desc {
        font-size: 12px;
        color: #999;
        margin-top: 2px;
    }
    .switch-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .switch-label {
        font-size: 12px;
        color: #999;
    }
    .auto-switch-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .stat-row {
        display: flex;
        gap: 32px;
    }
    .stat-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .stat-label {
        font-size: 12px;
        color: #999;
    }
    .stat-value {
        font-size: 14px;
        color: #e0e0e0;
    }
    .stat-value.highlight {
        color: #67c23a;
        font-weight: 500;
    }
</style>
