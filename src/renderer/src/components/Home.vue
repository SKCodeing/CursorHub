<script setup>
    import { ref, nextTick, provide, computed, watch } from "vue";
    import { onMounted, onUnmounted } from "vue";
    import { storeToRefs } from "pinia";
    import { useAppStore } from "../stores/app.js";
    import { useUiStore, THEME_REGISTRY } from "../stores/ui.js";
    // eslint-disable-next-line no-unused-vars
    import { getUsage, getStripeProfile } from "../api/cursor_api.js";
    import AccountManagement from "./AccountManagement.vue";
    import About from "./About.vue";
    import UseAccountConfirmationDialog from "./UseAccountConfirmationDialog.vue";
    import SettingsDialog from "./SettingsDialog.vue";
    import BackupSettingsDialog from "./BackupSettingsDialog.vue";
    import RestoreBackupDialog from "./RestoreBackupDialog.vue";
    import { Refresh } from "@element-plus/icons-vue";
    import { ElMessage, ElMessageBox } from "element-plus";
    import { jwtDecode } from "jwt-decode";
    const SUBSCRIBE_FREE_NAME = "free";
    const SUBSCRIBE_PRO_NAME = "free_trial";

    const appStore = useAppStore();
    const uiStore = useUiStore();
    const { cursorInfo, appConfig, systemInfo, cursorAccountsInfo } = storeToRefs(appStore);
    const { activeNav, theme } = storeToRefs(uiStore);
    const accountManagementRef = ref(null);
    let unsubscribeLog;
    const isRefreshLoading = ref(false);
    let refreshIntervalId = null;
    // 定时采集：轮询 storage.json 检测账号变化
    let autoCollectIntervalId = null;
    const autoCollectEnabled = ref(false);
    const collectedEmails = new Set();  // 已采集过的邮箱集合，避免两来源交替触发死循环
    const isInitLoading = ref(false);
    const useAccountDialogVisible = ref(false);
    const settingsDialogVisible = ref(false);
    const backupSettingsDialogVisible = ref(false);
    const restoreBackupDialogVisible = ref(false);
    const accountToUse = ref(null);
    const isAdmin = ref(false);
    const loopCount = ref(1);
    const settingsFormRef = ref(null);
    const settingsRules = ref({
        EMAIL_DOMAIN: [{ required: true, message: "请输入域名", trigger: "blur" }],
        RECEIVING_EMAIL: [
            { required: true, message: "请输入tempmail邮箱", trigger: "blur" },
            { type: "email", message: "请输入正确的邮箱格式", trigger: ["blur", "change"] },
        ],
        RECEIVING_EMAIL_PIN: [{ required: true, message: "请输入PIN码", trigger: "blur" }],
    });
    const localConfig = ref({
        EMAIL_DOMAIN: "",
        RECEIVING_EMAIL: "",
        RECEIVING_EMAIL_PIN: "",
    });
    const autoSwitchEnabled = ref(false);
    const autoSwitchStats = ref({ currentEmail: "", todaySwitchCount: 0, lastSwitchTime: "" });
    let unsubAutoSwitch = null;
    const patchStatus = ref({ patched: false, targetExists: false, backupExists: false });
    const patchLoading = ref(false);
    const disableUpdateEnabled = ref(false);
    const disableUpdateLoading = ref(false);

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
    const loadPatchStatus = async () => {
        const status = await window.api.getPatchStatus();
        patchStatus.value = status;
    };
    const handleApplyPatch = async () => {
        patchLoading.value = true;
        try {
            const result = await window.api.applyPatch();
            if (result.success) { ElMessage.success(result.message); } else { ElMessage.error(result.message); }
            await loadPatchStatus();
        } finally { patchLoading.value = false; }
    };
    const handleRestorePatch = async () => {
        patchLoading.value = true;
        try {
            const result = await window.api.restorePatch();
            if (result.success) { ElMessage.success(result.message); } else { ElMessage.error(result.message); }
            await loadPatchStatus();
        } finally { patchLoading.value = false; }
    };
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
            } else { ElMessage.error(result.message || "操作失败"); }
        } finally { disableUpdateLoading.value = false; }
    };
    const updateSettingsConfig = () => {
        if (appConfig.value) {
            localConfig.value = JSON.parse(JSON.stringify(appConfig.value));
            settingsFormRef.value?.clearValidate();
        }
    };
    const saveConfig = async () => {
        if (!settingsFormRef.value) return;
        try { await settingsFormRef.value.validate(); } catch { return; }
        const newConfig = JSON.parse(JSON.stringify(localConfig.value));
        try {
            let setResult = await window.api.setAppConfig(newConfig);
            if (setResult.success) { ElMessage.success("修改配置成功"); await appStore.fetchAppConfig(); }
            else { ElMessage.error("修改配置失败"); }
        } catch { ElMessage.error("修改配置失败"); }
    };
    // ──────────────────────────────────────────────────────────────────────────
    const logs = ref([]);
    const logScrollbarRef = ref(null);

    const loadingAutoRegister = ref(false);
    const isAutoRegistAndLogin = ref(false);

    const addLog = async ({ level = "info", data }) => {
        const message = `[${new Date().toLocaleTimeString()}] ${data}`;
        logs.value.push({ level, message });
        if (logs.value.length > 400) {
            logs.value.shift();
        }
        await nextTick();
        if (logScrollbarRef.value) {
            const scrollWrapper = logScrollbarRef.value.wrapRef;
            if (scrollWrapper) {
                logScrollbarRef.value.scrollTo({
                    top: scrollWrapper.scrollHeight,
                    behavior: "smooth",
                });
            }
        }
    };

    // 将 addLog 方法通过 provide 暴露给后代组件使用
    provide("addLog", addLog);

    const accountInfoShow = computed(() => {
        let info = { ...cursorAccountsInfo.value };
        info.membershipTypeShow = checkMembershipType(info);
        console.log("membershipTypeShow :>> ", info.membershipTypeShow);

        info.accessTokenExpStatus = checkAccessTokenExpireTime(info.accessToken);

        return info;
    });

    const checkAdminRights = async () => {
        isAdmin.value = await window.api.checkAdminRights();
    };

    onMounted(async () => {
        // 监听来自主进程的日志
        unsubscribeLog = window.api.onLog(handleLogFromMain);
        isInitLoading.value = true;
        try {
            await Promise.allSettled([
                window.api.getAppLicenseInfo(),
                window.api.initAppConfig(),
                window.api.renderOnMounted(),
                checkAdminRights(),
            ]);
        } catch (error) {
            console.error("初始化路径失败", error);
        } finally {
            isInitLoading.value = false;
        }
        updateSettingsConfig();
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
        await refresh();
    });

    onUnmounted(() => {
        // 组件卸载时取消监听
        if (unsubscribeLog) {
            unsubscribeLog();
        }
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
        stopAutoCollect();
        unsubAutoSwitch?.();
    });

    const handleLogFromMain = async (log) => {
        const { level, data } = log;
        switch (level) {
            case "info":
            case "success":
            case "warning":
            case "error":
                await addLog(log);
                break;
            case "begin":
                loadingAutoRegister.value = true;
                break;
            case "end":
                loadingAutoRegister.value = false;
                break;
            case "account": {
                const isAutoLoginFlow = appStore.isAutoLoginFlow;
                if (isAutoLoginFlow) {
                    // 自动登录，并重置机器码
                    await addLog({ level: "info", data: "正在使用新账号登录..." });
                    await window.api.resetCursorAccount({
                        ...data,
                        isResetMachines: true,
                        isResetCursor: true,
                        isResetCursorAll: false,
                    });
                    await addLog({ level: "info", data: "登录完成" });
                    await refresh();
                }
                break;
            }
            case "license": {
                appStore.setAppLicenseInfo(data);
                break;
            }
            case "license-error": {
                ElMessage.error(data);
                addLog({ level: "error", data: data });
                break;
            }
            case "box-tips": {
                ElMessageBox.confirm(data.message, data.title || "提示", {
                    confirmButtonText: "确定",
                    showCancelButton: false,
                    type: data.type || "",
                });
                break;
            }
            case "log-tips": {
                addLog({ level: "warning", data: data });
                break;
            }
            case "about-notice": {
                appStore.setAboutNotice(data);
                break;
            }
            default:
                break;
        }
    };

    watch(
        activeNav,
        async (nav) => {
            if (nav === "accounts") {
                await nextTick();
                accountManagementRef.value?.fetchAccounts();
            }
        },
        { immediate: true }
    );

    const emailLetter = computed(() => {
        const email = cursorAccountsInfo.value?.email;
        return email ? String(email).charAt(0).toUpperCase() : "?";
    });

    const usagePercent = computed(() => {
        const total = accountInfoShow.value?.modelUsageTotal;
        const used = accountInfoShow.value?.modelUsageUsed;
        if (!total) return 0;
        return Math.min(100, Math.round((used / total) * 100));
    });

    const platformLabel = computed(() => {
        const p = systemInfo.value?.platform;
        if (p === "win32") return "Windows";
        if (p === "darwin") return "Mac";
        if (p === "linux") return "Linux";
        return p ? "未知" : "";
    });

    const refresh = async () => {
        if (isRefreshLoading.value) return;
        await window.api.initAppConfig(); //初始化路径
        isRefreshLoading.value = true;
        const timeStart = Date.now();
        try {
            await Promise.allSettled([
                appStore.fetchCursorInfo(),
                appStore.fetchAppConfig(),
                appStore.fetchSystemInfo(),
            ]);
            if (!cursorAccountsInfo.value.accessToken || !cursorAccountsInfo.value.email) {
                throw new Error("未登录");
            }

            await getStripeProfile(cursorAccountsInfo.value.accessToken, cursorAccountsInfo.value.workosUserId)
                .then((stripeProfileResult) => {
                    console.log("home stripeProfileResult :>> ", stripeProfileResult);
                    appStore.setCursorAccountsInfo({
                        membershipType: stripeProfileResult.membershipType,
                        daysRemainingOnTrial: stripeProfileResult.daysRemainingOnTrial,
                    });
                    addLog({ level: "info", data: "更新订阅信息成功" });
                })
                .catch(() => {
                    addLog({ level: "error", data: "更新订阅信息失败" });
                });

            await getUsage(cursorAccountsInfo.value.accessToken)
                .then((usageResult) => {
                    appStore.setCursorAccountsInfo({
                        modelUsageUsed: usageResult.numRequestsTotal ?? 0,
                        modelUsageTotal: usageResult.maxRequestUsage ?? 0,
                        registerTimeStamp: usageResult.startOfMonth
                            ? new Date(usageResult.startOfMonth).getTime()
                            : undefined,
                    });
                    addLog({ level: "info", data: "更新用量信息成功" });
                })
                .catch(() => {
                    addLog({ level: "warning", data: "更新用量信息失败" });
                });
        } catch (error) {
            console.error(error);
            addLog({ level: "error", data: "刷新页面信息失败" });
            // ElMessage.error("刷新失败");
            // ElMessage.error("刷新订阅信息失败");
        } finally {
            // 采集当前登录账号到数据库，刷新进来的账号都应是「未使用」状态
            const snapshot = JSON.parse(JSON.stringify(cursorAccountsInfo.value));
            if (snapshot.email) {
                // 显式传 null 清除旧的 used_at / quota_at，确保刷新/采集不污染使用状态
                snapshot.used_at = null;
                snapshot.quota_at = null;
                await window.api.accounts.createOrUpdateAccount(snapshot);
            }

            const timeEnd = Date.now();
            setTimeout(
                () => {
                    isRefreshLoading.value = false;
                },
                2000 - ((timeEnd - timeStart) % 2000)
            );
            console.log("cursorInfo :>> ", cursorInfo.value);

            if (refreshIntervalId) {
                clearInterval(refreshIntervalId);
            }
            // refreshIntervalId = setInterval(refresh, 10 * 60 * 1000);

            console.log("cursorAccountsInfo :>> ", appStore.cursorAccountsInfo);
        }
    };

    const showUseAccountDialog = (account) => {
        accountToUse.value = account;
        useAccountDialogVisible.value = true;
    };

    // 切换账号
    const handleConfirmUseAccount = async (data) => {
        // 热切换模式：token server 已推送 + storage.json 已写入，直接刷新
        if (data.hotSwitch) {
            useAccountDialogVisible.value = false;
            // 稍等 Cursor 内存生效后刷新显示
            setTimeout(async () => {
                await refresh();
            }, 1500);
            return;
        }

        const account = Object.assign({}, accountToUse.value, data);

        console.log("准备使用账号 :>> ", account.email);

        try {
            let result = await window.api.resetCursorAccount(JSON.parse(JSON.stringify(account)));
            useAccountDialogVisible.value = false;
            if (result.success) {
                // 标记账号已使用
                await window.api.accounts.createOrUpdateAccount({
                    email: account.email,
                    used_at: Date.now(),
                });
                ElMessage.success("切换账号成功");
            } else {
                ElMessage.error("切换账号失败");
            }

            await refresh();
        } catch (error) {
            console.error(error);
            ElMessage.error("切换账号失败");
        }
    };

    const checkAccessTokenExpireTime = (token) => {
        if (typeof token !== "string") return null;

        try {
            const decodedToken = jwtDecode(token);
            // 检查解码后的 token 是否有 exp 字段
            if (decodedToken && typeof decodedToken.exp === "number") {
                let expTimestamp = decodedToken.exp * 1000; // 返回毫秒级时间戳
                const now = Date.now();

                const remainingMilliseconds = expTimestamp - now;
                if (remainingMilliseconds < 0) {
                    return {
                        label: "已过期",
                        type: "danger",
                        isExpired: true,
                    };
                }
                const days = Math.floor(remainingMilliseconds / (1000 * 60 * 60 * 24));
                if (days > 0) {
                    return {
                        label: `${days}天`,
                        type: "success",
                        isExpired: false,
                    };
                }

                const hours = Math.floor(remainingMilliseconds / (1000 * 60 * 60));
                if (hours > 0) {
                    return {
                        label: `${hours}小时`,
                        type: "warning",
                        isExpired: false,
                    };
                }

                // 小于一小时，显示分钟。向上取整以避免显示0分钟。
                const minutes = Math.ceil(remainingMilliseconds / (1000 * 60));
                return {
                    label: `${minutes}分钟`,
                    type: "danger",
                    isExpired: false,
                };
            }
        } catch {
            // 解码失败，不是有效的JWT，继续尝试下一个
            console.warn("JWT decoding failed for a token, continuing...");
            return null;
        }
    };

    const checkMembershipType = (info) => {
        let remainingDays = info.daysRemainingOnTrial
            ? info.daysRemainingOnTrial
            : calculateRemainingDays(info.registerTimeStamp);
        if (info.membershipType === SUBSCRIBE_FREE_NAME) {
            remainingDays = 0;
        }
        let membershipTypeShow = "";
        if (info.membershipType === SUBSCRIBE_FREE_NAME) {
            membershipTypeShow = "（已失效）" + info.membershipType;
        } else if (info.membershipType === SUBSCRIBE_PRO_NAME) {
            membershipTypeShow = "（" + remainingDays + "天试用）" + info.membershipType;
        } else if (info.membershipType) {
            membershipTypeShow = info.membershipType;
            remainingDays = 999;
        } else {
            membershipTypeShow = "";
        }
        return membershipTypeShow;
    };

    /**
     * 计算剩余天数
     * @param {string} registerTime - 格式为 "YYYY-MM-DD HH:MM:SS" 的注册时间
     * @returns {number} 剩余天数
     */
    const calculateRemainingDays = (registerTime) => {
        if (!registerTime) return 0;
        const now = new Date();
        const registerDate = new Date(registerTime);
        // 15天后过期
        const expiryDate = new Date(new Date(registerTime).setDate(registerDate.getDate() + 15));

        // 如果已过期，返回0
        if (now > expiryDate) {
            return 0;
        }

        // 计算剩余毫秒数并转换为天数
        const remainingMilliseconds = expiryDate - now;
        // 计算剩余天数，1天=24小时*60分钟*60秒*1000毫秒，向上取整保证有剩余时间时显示为1天
        const remainingDays = Math.ceil(remainingMilliseconds / (1000 * 60 * 60 * 24));
        return remainingDays;
    };

    const resetMachine = async () => {
        ElMessageBox.confirm("确定要重置机器码？依赖机器码的软件可能失效，此操作需要管理员权限", "重置机器码", {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
        })
            .then(async () => {
                await window.api.setRandomMachineInfo();
                await appStore.fetchSystemInfo();
                await appStore.fetchCursorInfo();
                ElMessage.success("机器码已重置");
            })
            .catch(() => {
                // ElMessage.info("已取消重置机器码");
            });
    };

    const backup = async () => {
        backupSettingsDialogVisible.value = true;
    };

    const restoreBackup = async () => {
        restoreBackupDialogVisible.value = true;
    };

    const backupAccountDb = async () => {
        try {
            const result = await window.api.accounts.backupDatabase();
            if (result.canceled) return;
            if (result.success) {
                ElMessage.success("账号库备份成功");
                addLog({ level: "success", data: `账号库已备份到: ${result.filePath}` });
            } else {
                ElMessage.error(result.message || "备份失败");
            }
        } catch (e) {
            ElMessage.error("备份失败: " + e.message);
        }
    };

    const restoreAccountDb = async () => {
        try {
            await ElMessageBox.confirm(
                "恢复将覆盖当前所有账号数据，确定继续吗？",
                "恢复账号库",
                { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" }
            );
            const result = await window.api.accounts.restoreDatabase();
            if (result.canceled) return;
            if (result.success) {
                ElMessage.success("账号库恢复成功，请切换到「账号」页查看");
                addLog({ level: "success", data: "账号库已从备份文件恢复" });
            } else {
                ElMessage.error(result.message || "恢复失败");
            }
        } catch (e) {
            if (e !== "cancel") ElMessage.error("恢复失败: " + e.message);
        }
    };

    const autoRegisterAndLogin = async () => {
        if (loadingAutoRegister.value) {
            ElMessage.error("正在执行注册程序，请稍后再试");
            return;
        }

        const { RECEIVING_EMAIL, RECEIVING_EMAIL_PIN, EMAIL_DOMAIN } = appConfig.value;

        if (!RECEIVING_EMAIL || !RECEIVING_EMAIL_PIN || !EMAIL_DOMAIN) {
            settingsDialogVisible.value = true;
            return;
        }

        const emailRegex =
            /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/;
        if (!emailRegex.test(RECEIVING_EMAIL)) {
            ElMessage.error("收件邮箱格式不正确，请修改");
            settingsDialogVisible.value = true;
            return;
        }

        ElMessageBox.confirm("确定要一键注册并使用新账号登录吗？此操作将重置机器码、覆盖登录账号。", "一键注册登录", {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
        })
            .then(() => {
                try {
                    isAutoRegistAndLogin.value = true;
                    // ElMessage.success("已开始一键注册登录，请关注日志输出...");
                    addLog({ data: "开始一键注册登录..." });
                    appStore.setIsAutoLoginFlow(true);
                    window.api.runAutoRegister({
                        email: RECEIVING_EMAIL,
                        pin: RECEIVING_EMAIL_PIN,
                        domain: EMAIL_DOMAIN,
                        LOOP_COUNT: 1, // 只注册一个
                    });
                } catch (e) {
                    console.error(e);
                    ElMessage.error("一键注册登录过程中发生错误");
                    addLog({ level: "error", data: `一键注册登录过程中发生错误: ${e.message}` });
                    appStore.setIsAutoLoginFlow(false);
                }
            })
            .catch(() => {
                // ElMessage.info("已取消一键注册登录");
            });
    };

    const autoRegister = async () => {
        if (loadingAutoRegister.value) {
            ElMessage.error("正在执行注册程序，请稍后再试");
            return;
        }

        const { RECEIVING_EMAIL, RECEIVING_EMAIL_PIN, EMAIL_DOMAIN } = appConfig.value;

        if (!RECEIVING_EMAIL || !RECEIVING_EMAIL_PIN || !EMAIL_DOMAIN) {
            settingsDialogVisible.value = true;
            return;
        }

        const emailRegex =
            /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/;
        if (!emailRegex.test(RECEIVING_EMAIL)) {
            ElMessage.error("收件邮箱格式不正确，请修改");
            settingsDialogVisible.value = true;
            return;
        }
        loopCount.value = 1; // 重置循环次数

        let registerNum = appStore.appLicenseInfo?.license?.permissions?.registerNum || 2;
        ElMessageBox.prompt("请输入批量注册的数量，注册过多可能被封域名", "批量自动注册", {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            customClass: "auto-register-dialog",
            inputValue: loopCount.value,
            inputPattern: /^\d+$/,
            inputValidator: (value) => {
                const num = Number(value);
                if (!Number.isInteger(num) || num < 1 || num > registerNum) {
                    return `请输入1到${registerNum}之间的整数`;
                }
                return true;
            },
        })
            .then(({ value }) => {
                loopCount.value = parseInt(value, 10);
                try {
                    isAutoRegistAndLogin.value = false;
                    // ElMessage.success("已开始批量自动注册，请关注日志输出...");
                    // addLog({ data: `开始批量自动注册，共 ${loopCount.value} 次...` });
                    window.api.runAutoRegister({
                        email: RECEIVING_EMAIL,
                        pin: RECEIVING_EMAIL_PIN,
                        domain: EMAIL_DOMAIN,
                        LOOP_COUNT: loopCount.value,
                        AUTO_LOGIN: false,
                    });
                } catch (e) {
                    console.error(e);
                    ElMessage.error("批量自动注册过程中发生错误");
                    addLog({ level: "error", data: `批量自动注册过程中发生错误: ${e.message}` });
                }
            })
            .catch(() => {
                // addLog({ data: "已取消批量自动注册" });
                // ElMessage.info("已取消批量自动注册");
            });
    };

    const cancelAutoRegister = () => {
        if (loadingAutoRegister.value) {
            ElMessageBox.confirm("正在执行注册程序，确定要取消吗？", "提示", {
                confirmButtonText: "确定",
                cancelButtonText: "取消",
                type: "warning",
            }).then(async () => {
                await window.api.cleanupAutoRegister();
                addLog({ level: "warning", data: "正在取消自动注册程序..." });
            });
        }
    };

    const clearLogs = () => {
        logs.value = [];
    };

    // ── 定时采集：每 1 秒轮询，同时检测 storage.json 和各 token server 的账号变化 ──
    const startAutoCollect = () => {
        if (autoCollectIntervalId) return;
        // 把当前已知的所有账号邮箱预填入 Set，避免启动时把现有账号当作新切换
        collectedEmails.clear();
        if (cursorAccountsInfo.value?.email) collectedEmails.add(cursorAccountsInfo.value.email);
        addLog({ level: "info", data: "已开启定时采集，每秒检测账号变化..." });

        autoCollectIntervalId = setInterval(async () => {
            try {
                const result = await window.api.getActiveCursorEmail();
                const storageEmail = result?.storage?.email || "";
                const liveList = result?.live || [];

                // 收集所有有效账号（storage + 所有 live 端口），去重
                const candidates = [];
                if (storageEmail) {
                    candidates.push({
                        email: storageEmail,
                        accessToken: result.storage.accessToken || "",
                        refreshToken: result.storage.refreshToken || "",
                        source: "storage",
                    });
                }
                for (const live of liveList) {
                    if (live.email && !candidates.find(c => c.email === live.email)) {
                        candidates.push({
                            email: live.email,
                            accessToken: live.accessToken || "",
                            refreshToken: live.refreshToken || "",
                            source: `live(port ${live.port})`,
                        });
                    }
                }

                // 找出还没采集过的新账号
                const newOnes = candidates.filter(c => c.email && !collectedEmails.has(c.email));
                if (newOnes.length === 0) return;

                for (const item of newOnes) {
                    collectedEmails.add(item.email);
                    addLog({ level: "success", data: `检测到账号切换（${item.source}）：${item.email}，正在采集...` });

                    // 更新首页显示（用第一个新账号）
                    if (item === newOnes[0]) {
                        appStore.setCursorAccountsInfo({
                            email: item.email,
                            accessToken: item.accessToken,
                            refreshToken: item.refreshToken,
                        });
                    }

                    // 写入数据库，清除使用状态
                    await window.api.accounts.createOrUpdateAccount({
                        email: item.email,
                        accessToken: item.accessToken,
                        refreshToken: item.refreshToken,
                        used_at: null,
                        quota_at: null,
                    });

                    addLog({ level: "success", data: `采集成功：${item.email}（未使用状态）` });
                }

                // 如果账号管理面板是激活状态，刷新列表
                if (activeNav.value === "accounts") {
                    accountManagementRef.value?.fetchAccounts();
                }
            } catch (e) {
                console.warn("[autoCollect] poll error:", e.message);
            }
        }, 1000);
    };

    const stopAutoCollect = () => {
        if (autoCollectIntervalId) {
            clearInterval(autoCollectIntervalId);
            autoCollectIntervalId = null;
        }
        if (autoCollectEnabled.value) {
            addLog({ level: "info", data: "已关闭定时采集" });
        }
        collectedEmails.clear();
        autoCollectEnabled.value = false;
    };

    const toggleAutoCollect = () => {
        if (autoCollectEnabled.value) {
            stopAutoCollect();
        } else {
            autoCollectEnabled.value = true;
            startAutoCollect();
        }
    };

</script>

<template>
    <div v-loading="isInitLoading" class="page-root">
        <!-- 首页 -->
        <div v-show="activeNav === 'home'" class="page-view home-view">
            <header class="page-header">
                <div>
                    <h1 class="page-title">首页</h1>
                    <p class="page-sub">查看当前账号状态，管理无感换号</p>
                </div>
                <el-button size="small" :loading="isRefreshLoading" @click="refresh">
                    <el-icon class="btn-icon" :class="{ spinning: isRefreshLoading }"><Refresh /></el-icon>
                    刷新
                </el-button>
            </header>

            <div class="home-grid">
                <div class="home-col">
                    <div class="glass-card account-hero">
                        <div class="card-head">
                            <span>当前账号</span>
                            <el-tag
                                size="small"
                                :type="accountInfoShow.membershipType === SUBSCRIBE_FREE_NAME ? 'danger' : accountInfoShow.membershipType === SUBSCRIBE_PRO_NAME ? 'warning' : 'success'"
                            >
                                {{ accountInfoShow.membershipTypeShow || "未知订阅" }}
                            </el-tag>
                        </div>
                        <div class="hero-body">
                            <div class="avatar">{{ emailLetter }}</div>
                            <div class="hero-meta">
                                <div class="hero-email" :class="{ muted: !cursorAccountsInfo.email }">
                                    {{ cursorAccountsInfo.email || "未登录" }}
                                </div>
                                <div class="usage-line">
                                    <span class="muted">模型用量</span>
                                    <span v-if="accountInfoShow.modelUsageTotal">
                                        {{ accountInfoShow.modelUsageUsed }} / {{ accountInfoShow.modelUsageTotal }}
                                    </span>
                                    <span v-else class="ok">无限制</span>
                                </div>
                                <el-progress
                                    v-if="accountInfoShow.modelUsageTotal"
                                    class="usage-bar"
                                    :percentage="usagePercent"
                                    :show-text="false"
                                    :stroke-width="8"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="stat-grid">
                        <div class="glass-card stat-card">
                            <div class="stat-label">注入状态</div>
                            <div class="stat-value" :class="patchStatus.patched ? 'ok' : ''">
                                {{ patchStatus.patched ? "已注入" : "未注入" }}
                            </div>
                        </div>
                        <div class="glass-card stat-card">
                            <div class="stat-label">今日换号</div>
                            <div class="stat-value">{{ autoSwitchStats.todaySwitchCount ?? 0 }}</div>
                        </div>
                        <div class="glass-card stat-card">
                            <div class="stat-label">Cursor</div>
                            <div class="stat-value small">{{ appConfig.cursorVersion || "—" }}</div>
                        </div>
                    </div>

                    <div class="glass-card feature-card">
                        <div class="card-head">
                            <span>无感换号</span>
                            <el-tag :type="patchStatus.patched ? 'success' : 'info'" size="small">
                                {{ patchStatus.patched ? "运行中" : "未开启" }}
                            </el-tag>
                        </div>
                        <div class="feature-row">
                            <div class="feature-copy">
                                <div class="toggle-title">热切换注入</div>
                                <div class="toggle-desc">开启后换号无需重启 Cursor；请保持本应用在后台运行</div>
                            </div>
                            <div>
                                <el-button v-if="!patchStatus.patched" type="primary" size="small" :loading="patchLoading" :disabled="!patchStatus.targetExists" @click="handleApplyPatch">开启</el-button>
                                <el-button v-else type="danger" size="small" plain :loading="patchLoading" @click="handleRestorePatch">关闭</el-button>
                            </div>
                        </div>
                        <div v-if="!patchStatus.targetExists" class="tip-box tip-warning">未找到 Cursor，请确认已安装到默认路径</div>
                        <div v-if="patchStatus.patched" class="tip-box">换号后稍等几秒或新开对话；若仍提示额度不足，可关闭后重新登录。</div>
                        <div v-if="patchStatus.patched" class="toggle-row">
                            <div>
                                <div class="toggle-title">额度用尽自动换号</div>
                                <div class="toggle-desc">可能中断正在进行的对话；关闭后需手动切换账号</div>
                            </div>
                            <el-switch :model-value="autoSwitchEnabled" @change="toggleAutoSwitch" />
                        </div>
                        <div v-if="patchStatus.patched && autoSwitchEnabled" class="stat-row">
                            <div class="mini-stat">
                                <div class="muted">当前邮箱</div>
                                <div class="mini-val">{{ autoSwitchStats.currentEmail || "—" }}</div>
                            </div>
                            <div class="mini-stat">
                                <div class="muted">今日换号</div>
                                <div class="mini-val">{{ autoSwitchStats.todaySwitchCount ?? 0 }} 次</div>
                            </div>
                            <div class="mini-stat">
                                <div class="muted">上次换号</div>
                                <div class="mini-val">{{ autoSwitchStats.lastSwitchTime || "—" }}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="home-col home-col-right">
                    <div class="glass-card version-card">
                        <div class="card-head">环境信息</div>
                        <div class="kv"><span class="muted">系统</span><span>{{ platformLabel }} · {{ appConfig.appName }} {{ appConfig.version }}</span></div>
                        <div class="kv"><span class="muted">Cursor</span><span>{{ appConfig.cursorVersion || "—" }}</span></div>
                        <div class="kv"><span class="muted">machineGuid</span><span class="mono" :title="cursorAccountsInfo.machineGuid">{{ cursorAccountsInfo.machineGuid || "—" }}</span></div>
                        <div class="kv"><span class="muted">machineId</span><span class="mono" :title="cursorAccountsInfo.machineId">{{ cursorAccountsInfo.machineId || "—" }}</span></div>
                    </div>
                    <div class="glass-card log-card">
                        <div class="card-head">
                            <span>运行日志</span>
                            <el-button link type="primary" size="small" @click="clearLogs">清空</el-button>
                        </div>
                        <el-scrollbar ref="logScrollbarRef" class="log-container">
                            <div v-for="(log, index) in logs" :key="index" class="log-item" :class="`log-item-${log.level}`">
                                {{ log.message }}
                            </div>
                            <div v-if="!logs.length" class="muted empty-log">暂无日志</div>
                        </el-scrollbar>
                    </div>
                </div>
            </div>
        </div>

        <!-- 账号 -->
        <div v-show="activeNav === 'accounts'" class="page-view accounts-view">
            <header class="page-header">
                <div>
                    <h1 class="page-title">账号</h1>
                    <p class="page-sub">管理本地账号库，切换与批量更新</p>
                </div>
            </header>
            <div class="accounts-body">
                <AccountManagement ref="accountManagementRef" @show-use-account-dialog="showUseAccountDialog" />
            </div>
        </div>

        <!-- 设置 -->
        <div v-show="activeNav === 'settings'" class="page-view settings-view">
            <el-scrollbar>
                <div class="settings-inner">
                    <header class="page-header">
                        <h1 class="page-title">设置</h1>
                        <p class="page-sub">外观、环境与常用工具</p>
                    </header>

                    <section class="glass-card section-card">
                        <div class="card-head">外观</div>
                        <p class="section-desc">选择主题；也可点侧栏底部图标快速轮换。</p>
                        <div class="theme-grid">
                            <button
                                v-for="item in THEME_REGISTRY"
                                :key="item.key"
                                type="button"
                                class="theme-tile"
                                :class="{ active: theme === item.key }"
                                @click="uiStore.setTheme(item.key)"
                            >
                                <div class="theme-preview" :style="{ background: item.preview }"></div>
                                <div class="theme-name">
                                    <span>{{ item.name }}</span>
                                    <span v-if="theme === item.key" class="theme-check">✓</span>
                                </div>
                            </button>
                        </div>
                    </section>

                    <section class="glass-card section-card">
                        <div class="card-head">环境</div>
                        <el-tooltip :visible="!appConfig.path_cursor_exe ? undefined : false" content="未找到 Cursor 安装路径，打开 Cursor 后点首页刷新再试" placement="right">
                            <div class="check-row">
                                <div>
                                    <div class="row-title">Cursor 安装路径</div>
                                    <div class="toggle-desc">用于注入与版本检测</div>
                                </div>
                                <el-tag size="small" :type="appConfig.path_cursor_exe ? 'success' : 'danger'" effect="plain">
                                    {{ appConfig.path_cursor_exe ? "已就绪" : "未找到" }}
                                </el-tag>
                            </div>
                        </el-tooltip>
                        <el-tooltip :visible="!appConfig.path_cursor_user_db ? undefined : false" content="未找到 Cursor 数据路径，建议使用默认安装位置" placement="right">
                            <div class="check-row">
                                <div>
                                    <div class="row-title">Cursor 数据路径</div>
                                    <div class="toggle-desc">用于读写登录状态</div>
                                </div>
                                <el-tag size="small" :type="appConfig.path_cursor_user_db ? 'success' : 'danger'" effect="plain">
                                    {{ appConfig.path_cursor_user_db ? "已就绪" : "未找到" }}
                                </el-tag>
                            </div>
                        </el-tooltip>
                        <div class="check-row">
                            <div>
                                <div class="row-title">禁用 Cursor 更新</div>
                                <div class="toggle-desc">避免升级覆盖本地补丁</div>
                            </div>
                            <el-switch :model-value="disableUpdateEnabled" :loading="disableUpdateLoading" @change="toggleDisableUpdate" />
                        </div>
                    </section>

                    <section class="glass-card section-card">
                        <div class="card-head">备份与维护</div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">备份 Cursor 设置</div>
                                <div class="toggle-desc">设置、快捷键等</div>
                            </div>
                            <el-button size="small" @click="backup">备份</el-button>
                        </div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">恢复 Cursor 设置</div>
                                <div class="toggle-desc">从本地备份还原</div>
                            </div>
                            <el-button size="small" @click="restoreBackup">恢复</el-button>
                        </div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">账号库备份</div>
                                <div class="toggle-desc">导出本地账号数据库</div>
                            </div>
                            <el-button size="small" @click="backupAccountDb">备份</el-button>
                        </div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">账号库恢复</div>
                                <div class="toggle-desc">将覆盖当前账号数据</div>
                            </div>
                            <el-button size="small" type="danger" plain @click="restoreAccountDb">恢复</el-button>
                        </div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">重置机器码</div>
                                <div class="toggle-desc">需管理员权限，可能影响其他软件</div>
                            </div>
                            <el-button size="small" type="warning" plain @click="resetMachine">重置</el-button>
                        </div>
                        <div class="tool-row">
                            <div>
                                <div class="row-title">定时采集</div>
                                <div class="toggle-desc">检测账号切换并写入账号库（未使用）</div>
                            </div>
                            <el-button :type="autoCollectEnabled ? 'danger' : 'primary'" plain size="small" @click="toggleAutoCollect">
                                {{ autoCollectEnabled ? "停止" : "开始" }}
                            </el-button>
                        </div>
                    </section>
                </div>
            </el-scrollbar>
        </div>

        <!-- 关于 -->
        <div v-show="activeNav === 'about'" class="page-view about-view">
            <header class="page-header">
                <div>
                    <h1 class="page-title">关于</h1>
                    <p class="page-sub">版本信息、文档与支持</p>
                </div>
            </header>
            <div class="about-body">
                <About />
            </div>
        </div>

        <UseAccountConfirmationDialog v-model="useAccountDialogVisible" :account="accountToUse" @confirm="handleConfirmUseAccount" />
        <SettingsDialog v-model="settingsDialogVisible" />
        <BackupSettingsDialog v-model="backupSettingsDialogVisible" />
        <RestoreBackupDialog v-model="restoreBackupDialogVisible" />
    </div>
</template>

<style lang="scss" scoped>
    .page-root {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        color: var(--foreground);
    }

    .page-view {
        height: 100%;
        min-height: 0;
        padding: 4px 20px 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
    }

    .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        flex-shrink: 0;
    }

    .page-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
        color: var(--foreground);
    }

    .page-sub {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--muted-foreground);
        line-height: 1.4;
    }

    .btn-icon {
        margin-right: 4px;
        vertical-align: middle;
        &.spinning { animation: spin 0.9s linear infinite; }
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .home-view {
        overflow: hidden;
    }

    .home-grid {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
        gap: 12px;
    }

    .home-col {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow: auto;
    }

    .home-col-right {
        min-height: 0;
    }

    .accounts-view {
        padding-bottom: 12px;
    }

    .accounts-body,
    .about-body {
        flex: 1;
        min-height: 0;
    }

    .about-view {
        overflow: hidden;
    }

    .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 14px;
        font-weight: 650;
        margin-bottom: 12px;
        color: var(--foreground);
    }

    .account-hero,
    .feature-card,
    .version-card,
    .log-card,
    .section-card {
        padding: 16px 18px;
    }

    .hero-body {
        display: flex;
        gap: 14px;
        align-items: flex-start;
    }

    .avatar {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 700;
        font-size: 18px;
        background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #111827));
        box-shadow: 0 8px 18px rgb(var(--primary-rgb) / 0.25);
    }

    .hero-meta {
        flex: 1;
        min-width: 0;
    }

    .hero-email {
        font-size: 15px;
        font-weight: 600;
        word-break: break-all;
        line-height: 1.35;
    }

    .usage-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        margin-top: 10px;
    }

    .usage-bar {
        margin-top: 8px;
    }

    .muted { color: var(--muted-foreground); }
    .ok { color: var(--success) !important; }
    .bad { color: var(--destructive); }

    .stat-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
    }

    .stat-card {
        padding: 12px 14px;
    }

    .stat-label {
        font-size: 12px;
        color: var(--muted-foreground);
    }

    .stat-value {
        font-size: 17px;
        font-weight: 700;
        margin-top: 4px;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;

        &.small {
            font-size: 14px;
            font-weight: 600;
        }
    }

    .feature-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .feature-copy {
        min-width: 0;
    }

    .tip-box {
        font-size: 12px;
        color: var(--muted-foreground);
        background: rgb(var(--primary-rgb) / 0.06);
        border-radius: 8px;
        padding: 8px 12px;
        line-height: 1.55;
        margin-top: 10px;
    }

    .tip-warning {
        color: var(--warning);
        background: rgb(245 158 11 / 0.1);
    }

    .toggle-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
    }

    .toggle-title,
    .row-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 2px;
        color: var(--foreground);
    }

    .toggle-desc {
        font-size: 12px;
        color: var(--muted-foreground);
        line-height: 1.5;
        max-width: 420px;
    }

    .stat-row {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
        margin-top: 12px;
    }

    .mini-val {
        font-size: 13px;
        font-weight: 600;
        margin-top: 2px;
        word-break: break-all;
    }

    .kv {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        margin-top: 8px;
        align-items: center;
    }

    .mono {
        max-width: 42ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: rtl;
        text-align: left;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--muted-foreground);
    }

    .log-card {
        flex: 1;
        min-height: 160px;
        display: flex;
        flex-direction: column;
    }

    .log-container {
        flex: 1;
        min-height: 0;
        background: rgb(var(--surface-contrast-rgb) / 0.55);
        border-radius: 10px;
        border: 1px solid var(--border);
    }

    :deep(.log-container .el-scrollbar__view) {
        padding: 10px 12px;
    }

    .log-item {
        font-size: 12px;
        color: var(--muted-foreground);
        padding: 2px 0;
        word-break: break-all;
        white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .log-item-error { color: var(--destructive); }
    .log-item-account,
    .log-item-success { color: var(--success); }
    .log-item-warning { color: var(--warning); }

    .empty-log {
        padding: 24px 8px;
        text-align: center;
    }

    .settings-inner {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 720px;
        padding-bottom: 24px;
    }

    .settings-inner .page-header {
        margin-bottom: 4px;
    }

    .section-desc {
        font-size: 12px;
        color: var(--muted-foreground);
        margin: -4px 0 12px;
        line-height: 1.5;
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
        gap: 10px;
    }

    .theme-tile {
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        background: rgb(var(--surface-rgb) / 0.55);
        cursor: pointer;
        padding: 0;
        text-align: left;
        color: var(--foreground);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;

        &:hover {
            border-color: rgb(var(--primary-rgb) / 0.45);
        }

        &.active {
            border-color: var(--primary);
            box-shadow: 0 0 0 1px rgb(var(--primary-rgb) / 0.35);
        }
    }

    .theme-preview {
        height: 36px;
    }

    .theme-name {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 10px;
    }

    .theme-check {
        color: var(--primary);
        font-size: 12px;
    }

    .check-row,
    .tool-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        font-size: 13px;
        border-bottom: 1px solid var(--border);

        &:last-child {
            border-bottom: 0;
            padding-bottom: 0;
        }

        &:first-of-type {
            padding-top: 0;
        }
    }

</style>
