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

    // ── 注入状态 ───────────────────────────────────────────────
    const patchStatus = ref({ patched: false, targetExists: false, backupExists: false });
    const patchLoading = ref(false);

    const loadPatchStatus = async () => {
        const status = await window.api.getPatchStatus();
        patchStatus.value = status;
    };

    const handleApplyPatch = async () => {
        patchLoading.value = true;
        try {
            const result = await window.api.applyPatch();
            if (result.success) {
                ElMessage.success(result.message);
            } else {
                ElMessage.error(result.message);
            }
            await loadPatchStatus();
        } finally {
            patchLoading.value = false;
        }
    };

    const handleRestorePatch = async () => {
        patchLoading.value = true;
        try {
            const result = await window.api.restorePatch();
            if (result.success) {
                ElMessage.success(result.message);
            } else {
                ElMessage.error(result.message);
            }
            await loadPatchStatus();
        } finally {
            patchLoading.value = false;
        }
    };

    // ── 禁用 Cursor 更新 ───────────────────────────────────────
    const disableUpdateEnabled = ref(false);
    const disableUpdateLoading = ref(false);

    const loadDisableUpdateStatus = async () => {
        const result = await window.api.getDisableUpdateStatus();
        disableUpdateEnabled.value = result.disabled;
    };

    const toggleDisableUpdate = async (val) => {
        disableUpdateLoading.value = true;
        try {
            const result = await window.api.setDisableUpdate(val);
            if (result.success) {
                disableUpdateEnabled.value = val;
                ElMessage.success(val ? "已禁用 Cursor 自动更新" : "已恢复 Cursor 自动更新");
            } else {
                ElMessage.error(result.message || "操作失败");
            }
        } finally {
            disableUpdateLoading.value = false;
        }
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
        loadPatchStatus();
        loadDisableUpdateStatus();

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

    defineExpose({ updateConfig });

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
                ElMessage.success("修改配置成功");
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

        <!-- 无感换号卡片 -->
        <div class="feature-card">
            <div class="feature-card-header">
                <div class="header-left">
                    <div class="section-bar"></div>
                    <span class="card-title">无感换号</span>
                </div>
            </div>

            <!-- 注入状态行 -->
            <div class="feature-row">
                <div class="feature-info">
                    <span class="feature-label">注入状态</span>
                    <el-tag
                        :type="patchStatus.patched ? 'success' : 'info'"
                        size="small"
                        style="margin-left: 8px"
                    >
                        {{ patchStatus.patched ? "已注入" : "未注入" }}
                    </el-tag>
                </div>
                <div class="feature-actions">
                    <el-button
                        v-if="!patchStatus.patched"
                        type="primary"
                        size="small"
                        :loading="patchLoading"
                        :disabled="!patchStatus.targetExists"
                        @click="handleApplyPatch"
                    >
                        开启无感换号
                    </el-button>
                    <el-button
                        v-else
                        type="danger"
                        size="small"
                        plain
                        :loading="patchLoading"
                        @click="handleRestorePatch"
                    >
                        关闭无感换号
                    </el-button>
                </div>
            </div>

            <!-- 无 Cursor 文件时的提示 -->
            <div v-if="!patchStatus.targetExists" class="tip-box tip-warning">
                未找到 Cursor 安装文件，请确认 Cursor 已安装到默认路径
            </div>

            <template v-if="patchStatus.patched">
                <div class="tip-box">开启后请保持 AI助手在后台运行，请不要完全退出，否则自动换号将无法生效。</div>
                <div class="tip-box">换号后请稍等几秒，或新开一个对话再试。若仍提示额度不足：关闭无感后重新获取账号登录。</div>

                <!-- 自动换号开关 -->
                <div class="toggle-row">
                    <div>
                        <div class="toggle-title">额度用尽时自动换号</div>
                        <div class="toggle-desc">
                            默认关闭；开启后聊天出现 usage limit 或官方用量达标将自动换号（可能中断正在进行的 Agent/对话），关闭则需手动点「获取账号并登录」
                        </div>
                    </div>
                    <el-switch
                        :model-value="autoSwitchEnabled"
                        @change="toggleAutoSwitch"
                    />
                </div>

                <!-- 统计信息 -->
                <div v-if="autoSwitchEnabled" class="stat-row">
                    <div class="stat-item">
                        <div class="stat-label">当前邮箱</div>
                        <div class="stat-value highlight">{{ autoSwitchStats.currentEmail || "—" }}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">今日换号</div>
                        <div class="stat-value">{{ autoSwitchStats.todaySwitchCount ?? 0 }} 次</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">上次换号</div>
                        <div class="stat-value highlight">{{ autoSwitchStats.lastSwitchTime || "—" }}</div>
                    </div>
                </div>
            </template>
        </div>

        <!-- 禁用 Cursor 更新卡片 -->
        <div class="feature-card">
            <div class="toggle-row">
                <div>
                    <div class="toggle-title">禁用 Cursor 更新</div>
                    <div class="toggle-desc">写入 update.mode=none，避免升级覆盖指纹补丁</div>
                </div>
                <div class="switch-with-label">
                    <span class="switch-status-label" :class="{ active: disableUpdateEnabled }">
                        {{ disableUpdateEnabled ? "已开启" : "已关闭" }}
                    </span>
                    <el-switch
                        :model-value="disableUpdateEnabled"
                        :loading="disableUpdateLoading"
                        active-color="#67c23a"
                        @change="toggleDisableUpdate"
                    />
                </div>
            </div>
        </div>

        <el-divider />

        <!-- 邮箱配置表单 -->
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

    /* 通用卡片 */
    .feature-card {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 12px;
        max-width: 560px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .feature-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .section-bar {
        width: 4px;
        height: 16px;
        background: var(--el-color-primary);
        border-radius: 2px;
    }

    .card-title {
        font-size: 15px;
        font-weight: 600;
        color: #e0e0e0;
    }

    /* 注入状态行 */
    .feature-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .feature-info {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .feature-label {
        font-size: 13px;
        color: #bbb;
    }

    .feature-actions {
        display: flex;
        gap: 8px;
    }

    /* 提示框 */
    .tip-box {
        font-size: 12px;
        color: #999;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        padding: 8px 12px;
        line-height: 1.6;
    }

    .tip-warning {
        color: #e6a23c;
        background: rgba(230, 162, 60, 0.08);
    }

    /* 开关行 */
    .toggle-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
    }

    .toggle-title {
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 4px;
    }

    .toggle-desc {
        font-size: 12px;
        color: #888;
        max-width: 380px;
        line-height: 1.6;
    }

    /* 带状态标签的开关 */
    .switch-with-label {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .switch-status-label {
        font-size: 12px;
        color: #888;
    }

    .switch-status-label.active {
        color: #67c23a;
    }

    /* 统计行 */
    .stat-row {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
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
        font-size: 13px;
        color: #e0e0e0;
    }

    .stat-value.highlight {
        color: #67c23a;
        font-weight: 500;
    }
</style>
