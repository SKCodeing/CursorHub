<template>
    <el-dialog
        :model-value="modelValue"
        title="切换账号"
        width="500px"
        :close-on-click-modal="false"
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <div v-if="account">
            <p>
                确定要切换到账号 <strong>{{ account.email }}</strong> 吗？
            </p>

            <!-- 热切换模式 -->
            <el-alert
                v-if="hotSwitchAvailable"
                type="success"
                :closable="false"
                style="margin-bottom: 12px"
            >
                <template #title>
                    <span>✅ 检测到已 patch 的 Cursor，支持无感热切换（无需重启）</span>
                </template>
            </el-alert>
            <el-alert
                v-else
                type="warning"
                :closable="false"
                style="margin-bottom: 12px"
            >
                <template #title>
                    <span>⚠️ 未开启无感换号注入，将使用传统重启切换（需关闭并重启 Cursor）</span>
                </template>
            </el-alert>

            <p>
                <el-checkbox v-model="useHotSwitch" :disabled="!hotSwitchAvailable">
                    无感热切换（推荐，Cursor 无需重启）
                </el-checkbox>
            </p>

            <template v-if="!useHotSwitch">
                <p><el-checkbox v-model="isResetMachines">重置机器码（推荐）</el-checkbox></p>
                <p><el-checkbox v-model="isResetCursor">特殊重置 Cursor（推荐）</el-checkbox></p>
                <p><el-checkbox v-model="isResetCursorAll">完全重置 Cursor</el-checkbox></p>
            </template>
        </div>
        <template #footer>
            <span class="dialog-footer">
                <el-button @click="$emit('update:modelValue', false)">取消</el-button>
                <el-button type="primary" :loading="confirming" @click="handleConfirm">确定</el-button>
            </span>
        </template>
    </el-dialog>
</template>

<script setup>
    import { ElMessage } from "element-plus";

    const props = defineProps({
        modelValue: { type: Boolean, required: true },
        account: { type: Object, default: null },
    });

    const emit = defineEmits(["update:modelValue", "confirm"]);

    const isResetMachines = ref(true);
    const isResetCursor = ref(true);
    const isResetCursorAll = ref(false);
    const useHotSwitch = ref(true);
    const hotSwitchAvailable = ref(false);
    const confirming = ref(false);

    // 打开对话框时检测 token server 是否在运行
    watch(
        () => props.modelValue,
        async (newVal) => {
            if (newVal) {
                const [port, patchStatus] = await Promise.all([
                    window.api.getTokenServerPort(),
                    window.api.getPatchStatus(),
                ]);
                hotSwitchAvailable.value = port > 0 && patchStatus.patched === true;
                useHotSwitch.value = hotSwitchAvailable.value;
            } else {
                // 关闭时重置
                isResetMachines.value = true;
                isResetCursor.value = true;
                isResetCursorAll.value = false;
                confirming.value = false;
            }
        }
    );

    const handleConfirm = async () => {
        if (!props.account) return;
        confirming.value = true;

        try {
            if (useHotSwitch.value && hotSwitchAvailable.value) {
                // 无感热切换
                const result = await window.api.hotSwitchAccount({
                    accessToken: props.account.optimalToken || props.account.accessToken,
                    refreshToken: props.account.refreshToken || "",
                    email: props.account.email || "",
                });
                if (result.success) {
                    ElMessage.success("已推送到 Cursor，约 1.5 秒内完成切换");
                    emit("update:modelValue", false);
                    emit("confirm", { hotSwitch: true });
                } else if (result.needTakeover) {
                    // 有其他 token server 在运行，提示用户
                    ElMessage({
                        type: "warning",
                        duration: 6000,
                        showClose: true,
                        message: result.message,
                    });
                    // 仍然关闭对话框，pending 已设置好，用户关掉 AI助手后会自动生效
                    emit("update:modelValue", false);
                    emit("confirm", { hotSwitch: true });
                } else {
                    ElMessage.error("热切换失败：" + result.message);
                }
            } else {
                // 传统重启切换
                emit("confirm", {
                    hotSwitch: false,
                    isResetMachines: isResetMachines.value,
                    isResetCursor: isResetCursor.value,
                    isResetCursorAll: isResetCursorAll.value,
                });
                emit("update:modelValue", false);
            }
        } finally {
            confirming.value = false;
        }
    };
</script>

<style scoped>
    .dialog-footer {
        text-align: right;
    }
</style>
