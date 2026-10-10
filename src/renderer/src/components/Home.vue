<script setup>
    import { ref, nextTick, provide, computed } from "vue";
    import { onMounted, onUnmounted } from "vue";
    import { storeToRefs } from "pinia";
    import { useAppStore } from "../stores/app.js";
    // eslint-disable-next-line no-unused-vars
    import { getUsage, getStripeProfile } from "../api/cursor_api.js";
    import AccountManagement from "./AccountManagement.vue";
    import UseAccountConfirmationDialog from "./UseAccountConfirmationDialog.vue";
    import SettingsDialog from "./SettingsDialog.vue";
    import BackupSettingsDialog from "./BackupSettingsDialog.vue";
    import RestoreBackupDialog from "./RestoreBackupDialog.vue";
    import { Refresh, CircleCheck, WarningFilled, Delete } from "@element-plus/icons-vue";
    import { ElMessage, ElMessageBox } from "element-plus";
    import { jwtDecode } from "jwt-decode";
    const SUBSCRIBE_FREE_NAME = "free";
    const SUBSCRIBE_PRO_NAME = "free_trial";

    const appStore = useAppStore();
    const { cursorInfo, appConfig, systemInfo, cursorAccountsInfo, appLicenseInfo, aboutNotice } =
        storeToRefs(appStore);

    const activeName = ref("first");
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

    const versionText = computed(() => {
        // const name = appConfig.value.appName || "";
        const ver = appConfig.value.version || "";
        return `${ver}`.trim();
    });

    const signatureText = computed(() => appLicenseInfo.value?.signature || "");

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

    const handleClick = (tab, event) => {
        console.log(tab, event);
        if (tab.props.name === "second") {
            accountManagementRef.value?.fetchAccounts();
        }
    };

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

    const openHelpDoc = () => {
        window.api.openHelpDoc();
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
                if (activeName.value === "second") {
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

    const openLink = (url) => {
        if (url) {
            window.api.openExternalLink(url);
        }
    };
</script>

<template>
    <div v-loading="isInitLoading" class="body-card">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">

            <!-- ══ 首页 ══ -->
            <el-tab-pane label="首页" name="first">
                <div class="body-card-item">
                    <div class="home-layout">

                        <!-- 左列 -->
                        <div class="home-col-left">
                            <div class="left-col-inner">

                                <!-- 当前登录账号 -->
                                <el-card>
                                    <div class="card-header">
                                        <span>当前登录账号</span>
                                    </div>
                                    <div class="card-item">
                                        <span class="card-item-label">登录邮箱:</span>
                                        <span :class="{ 'is-expired': !cursorAccountsInfo.email, 'is-trial': cursorAccountsInfo.email }">
                                            {{ cursorAccountsInfo.email || "未登录" }}
                                        </span>
                                    </div>
                                    <div class="card-item">
                                        <span class="card-item-label">订阅状态:</span>
                                        <span :class="{ 'is-expired': accountInfoShow.membershipType === SUBSCRIBE_FREE_NAME, 'is-trial': accountInfoShow.membershipType === SUBSCRIBE_PRO_NAME }">
                                            {{ accountInfoShow.membershipTypeShow }}
                                        </span>
                                    </div>
                                    <div class="card-item">
                                        <span class="card-item-label">模型用量:</span>
                                        <span v-if="accountInfoShow.modelUsageTotal">
                                            {{ accountInfoShow.modelUsageUsed }} / {{ accountInfoShow.modelUsageTotal }}
                                        </span>
                                        <span v-else class="is-trial">无限制</span>
                                    </div>
                                    <el-progress
                                        v-if="accountInfoShow.modelUsageTotal"
                                        class="model-usage-progress"
                                        :percentage="(accountInfoShow.modelUsageUsed / accountInfoShow.modelUsageTotal) * 100"
                                        :show-text="false"
                                        :stroke-width="10"
                                        striped
                                        striped-flow
                                        :duration="15"
                                    />
                                    <el-icon class="refresh-icon" :class="{ 'is-loading': isRefreshLoading }" :size="20" @click="refresh">
                                        <Refresh />
                                    </el-icon>
                                </el-card>

                                <!-- 功能 -->
                                <el-card>
                                    <div class="card-header">功能</div>
                                    <el-tooltip :visible="!appConfig.path_cursor_exe ? undefined : false" content="未找到Cursor安装路径，打开Cursor后点击刷新重新查找" effect="customized" placement="right">
                                        <div class="card-item check-item">
                                            <span class="card-item-label">获取 Cursor 安装路径</span>
                                            <el-icon v-if="appConfig.path_cursor_exe" class="check-icon" :size="20" style="color: #67c23a"><CircleCheck /></el-icon>
                                            <el-icon v-else class="check-icon" :size="20" style="color: #f56c6c"><WarningFilled /></el-icon>
                                        </div>
                                    </el-tooltip>
                                    <el-tooltip :visible="!appConfig.path_cursor_user_db ? undefined : false" content="未找到Cursor数据文件路径，建议安装默认路径" effect="customized" placement="right">
                                        <div class="card-item check-item">
                                            <span class="card-item-label">获取 Cursor 数据文件路径</span>
                                            <el-icon v-if="appConfig.path_cursor_user_db" class="check-icon" :size="20" style="color: #67c23a"><CircleCheck /></el-icon>
                                            <el-icon v-else class="check-icon" :size="20" style="color: #f56c6c"><WarningFilled /></el-icon>
                                        </div>
                                    </el-tooltip>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">重置机器码</span>
                                        <el-button @click="resetMachine">重置机器码</el-button>
                                    </div>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">备份Cursor设置、快捷键...</span>
                                        <el-button @click="backup">备份设置</el-button>
                                    </div>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">备份恢复</span>
                                        <el-button @click="restoreBackup">备份恢复</el-button>
                                    </div>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">账号库备份</span>
                                        <el-button @click="backupAccountDb">备份账号库</el-button>
                                    </div>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">账号库恢复</span>
                                        <el-button @click="restoreAccountDb">恢复账号库</el-button>
                                    </div>
                                    <div class="card-item btn-item">
                                        <span class="card-item-label">
                                            定时采集
                                            <span class="collect-desc">每秒检测账号切换，自动存入账号库（未使用状态）</span>
                                        </span>
                                        <el-button :type="autoCollectEnabled ? 'danger' : 'success'" plain @click="toggleAutoCollect">
                                            {{ autoCollectEnabled ? "停止采集" : "开始采集" }}
                                        </el-button>
                                    </div>
                                </el-card>

                                <!-- 无感换号 -->
                                <div class="feature-card">
                                    <div class="feature-card-header">
                                        <div class="header-left">
                                            <div class="section-bar"></div>
                                            <span class="card-title">无感换号</span>
                                        </div>
                                    </div>
                                    <div class="feature-row">
                                        <div class="feature-info">
                                            <span class="feature-label">注入状态</span>
                                            <el-tag :type="patchStatus.patched ? 'success' : 'info'" size="small" style="margin-left: 8px">
                                                {{ patchStatus.patched ? "已注入" : "未注入" }}
                                            </el-tag>
                                        </div>
                                        <div class="feature-actions">
                                            <el-button v-if="!patchStatus.patched" type="primary" size="small" :loading="patchLoading" :disabled="!patchStatus.targetExists" @click="handleApplyPatch">开启无感换号</el-button>
                                            <el-button v-else type="danger" size="small" plain :loading="patchLoading" @click="handleRestorePatch">关闭无感换号</el-button>
                                        </div>
                                    </div>
                                    <div v-if="!patchStatus.targetExists" class="tip-box tip-warning">
                                        未找到 Cursor 安装文件，请确认 Cursor 已安装到默认路径
                                    </div>
                                    <div v-if="patchStatus.patched" class="tip-box">开启后请保持 AI助手在后台运行，请不要完全退出，否则自动换号将无法生效。</div>
                                    <div v-if="patchStatus.patched" class="tip-box">换号后请稍等几秒，或新开一个对话再试。若仍提示额度不足：关闭无感后重新获取账号登录。</div>
                                    <div v-if="patchStatus.patched" class="toggle-row">
                                        <div>
                                            <div class="toggle-title">额度用尽时自动换号</div>
                                            <div class="toggle-desc">默认关闭；开启后聊天出现 usage limit 或官方用量达标将自动换号（可能中断正在进行的 Agent/对话），关闭则需手动点「获取账号并登录」</div>
                                        </div>
                                        <el-switch :model-value="autoSwitchEnabled" @change="toggleAutoSwitch" />
                                    </div>
                                    <div v-if="patchStatus.patched && autoSwitchEnabled" class="stat-row">
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
                                </div>

                                <!-- 禁用 Cursor 更新 -->
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
                                            <el-switch :model-value="disableUpdateEnabled" :loading="disableUpdateLoading" active-color="#67c23a" @change="toggleDisableUpdate" />
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- 右列 -->
                        <div class="home-col-right">

                            <!-- 版本信息 -->
                            <el-card class="version-card">
                                <div class="card-header">版本信息</div>
                                <div class="card-item">
                                    <span class="card-item-label">版本:</span>
                                    <span v-if="systemInfo.platform === 'win32'">Windows</span>
                                    <span v-else-if="systemInfo.platform === 'darwin'">Mac</span>
                                    <span v-else-if="systemInfo.platform === 'linux'">Linux</span>
                                    <span v-else-if="systemInfo.platform">未知</span>
                                    <span v-else></span>
                                    &nbsp;|&nbsp;
                                    <span>{{ appConfig.appName }}{{ appConfig.version }}</span>
                                    &nbsp;|&nbsp;
                                    <span>Cursor {{ appConfig.cursorVersion }}</span>
                                </div>
                                <div class="card-item">
                                    <span class="card-item-label">machineGuid:</span>
                                    <span class="card-item-value">{{ cursorAccountsInfo.machineGuid }}</span>
                                </div>
                                <div class="card-item">
                                    <span class="card-item-label">machineId:</span>
                                    <span class="card-item-value">{{ cursorAccountsInfo.machineId }}</span>
                                </div>
                            </el-card>

                            <!-- 日志 -->
                            <el-card class="log-card">
                                <div class="card-header">
                                    <span>日志</span>
                                    <el-icon class="refresh-icon clear-logs-icon" style="font-size: 16px; right: 25px; top: 18px" @click="clearLogs">
                                        <Delete />
                                    </el-icon>
                                </div>
                                <el-scrollbar ref="logScrollbarRef" class="log-container">
                                    <div v-for="(log, index) in logs" :key="index" class="log-item" :class="`log-item-${log.level}`">
                                        {{ log.message }}
                                    </div>
                                </el-scrollbar>
                            </el-card>

                        </div>
                    </div>
                </div>
            </el-tab-pane>

            <!-- ══ 账号 ══ -->
            <el-tab-pane label="账号" name="second">
                <div class="body-card-item">
                    <AccountManagement ref="accountManagementRef" @show-use-account-dialog="showUseAccountDialog" />
                </div>
            </el-tab-pane>

            <!-- ══ 关于 ══ -->
            <el-tab-pane label="关于" name="fifth">
                <el-scrollbar>
                    <div class="body-card-item" style="padding-top: 20px">
                        <div class="about-notice-container">
                            <div
                                v-for="(notice, index) in aboutNotice"
                                :key="index"
                                class="about-notice-item"
                                :class="{ 'has-link': notice.url }"
                                :style="{ color: notice.color || (notice.url ? 'var(--el-color-primary)' : ''), 'font-size': notice.fontSize || '' }"
                                @click="notice.url ? openLink(notice.url) : null"
                            >
                                {{ notice.title }}: {{ notice.message }}
                            </div>
                        </div>
                        <!-- 帮助文档按钮 -->
                        <div class="about-actions">
                            <el-button type="primary" plain @click="openHelpDoc">📖 使用帮助文档</el-button>
                        </div>
                        <div class="license-display">
                            <div>CursorHub {{ versionText }}</div>
                            <div>联系QQ：807600577</div>
                            <div v-if="signatureText">{{ signatureText }}</div>
                        </div>
                    </div>
                </el-scrollbar>
            </el-tab-pane>

        </el-tabs>
        <UseAccountConfirmationDialog v-model="useAccountDialogVisible" :account="accountToUse" @confirm="handleConfirmUseAccount" />
        <SettingsDialog v-model="settingsDialogVisible" />
        <BackupSettingsDialog v-model="backupSettingsDialogVisible" />
        <RestoreBackupDialog v-model="restoreBackupDialogVisible" />
    </div>
</template>

<style lang="scss" scoped>
    // .body-card {
    //     font-size: 20px;
    // }
    // .el-tabs__item.is-active {
    //     // background-color: #262c321c;
    // }

    :deep(.el-tabs__item) {
        color: var(--ev-c-text-1);
        user-select: none;
    }
    :deep(.el-tabs__nav-wrap::after) {
        background-color: #f8f9fa26;
    }
    .body-card-item {
        position: relative;
        height: calc(100vh - 120px);
        padding: 10px;
        background-color: #f8f9fa26;
        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.05);
        border-radius: 10px;
        box-sizing: border-box;

        /* ── 两列主布局 ── */
        .home-layout {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 10px;
            height: 100%;
        }

        /* 左列：高度自适应内容，内容超出时滚动 */
        .home-col-left {
            flex: 1;
            min-width: 0;
            height: fit-content;
            overflow-x: hidden;

            .left-col-inner {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-right: 4px;
            }
        }

        /* 右列：撑满剩余高度，flex 竖排，日志撑满剩余高度 */
        .home-col-right {
            flex: 1;
            min-width: 0;
            align-self: stretch;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        /* 版本卡片高度自适应 */
        .version-card {
            flex-shrink: 0;
        }

        /* 日志卡片撑满剩余高度 */
        .log-card {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;

            :deep(.el-card__body) {
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                padding-top: 10px;
            }
        }

        /* el-card 通用样式 */
        .el-card {
            --el-card-bg-color: #f8f9fa0a;
            --el-card-border-color: #f8f9fa00;
            --el-card-border-radius: 10px;
            color: var(--ev-c-text-1);
            position: relative;

            :deep(.el-card__body) {
                padding-top: 10px;
            }
        }

        .card-header {
            font-size: 16px;
            font-weight: 800;
            color: var(--el-color-primary);
            user-select: none;
            margin-bottom: 3px;

            .clear-logs-icon {
                cursor: pointer;
                position: absolute;
                right: 20px;
                top: 20px;
                color: var(--ev-c-text-2);
                &:hover {
                    color: var(--el-color-primary);
                }
            }
        }

        .card-item {
            display: flex;
            font-size: 14px;
            margin-top: 10px;
            word-break: break-all;

            &.check-item {
                align-items: center;
                justify-content: space-between;
                margin-top: 0px;
            }
            &.btn-item {
                align-items: center;
                justify-content: space-between;
                .el-button {
                    color: var(--ev-c-text-1);
                    --el-button-bg-color: #ffffff15;
                    --el-button-border-color: #ffffff15;
                    &:hover {
                        color: var(--el-color-primary);
                    }
                }
                .collect-desc {
                    display: block;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.2);
                    margin-top: 2px;
                    font-weight: normal;
                }
            }

            .card-item-label {
                flex-grow: 1;
                flex-shrink: 0;
                color: rgba(255, 255, 255, 0.308);
                display: inline-block;
                margin-right: 10px;
                user-select: none;
            }
            .card-item-value {
                display: inline-block;
                max-width: 38ch;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                direction: rtl;
                text-align: left;
                vertical-align: bottom;
            }
            .is-trial {
                color: #67c23a;
            }
            .is-expired {
                color: #f56c6c;
            }
        }

        .refresh-icon {
            cursor: pointer;
            position: absolute;
            right: 20px;
            top: 20px;
            &:hover {
                color: var(--el-color-primary);
            }
        }

        .model-usage-progress {
            margin-top: 10px;
            .el-progress-bar__outer {
                background-color: #f8f9fa1f;
            }
        }

        .log-container {
            flex: 1;
            min-height: 0;
            margin-top: 10px;
            background-color: #0000001a;
            border-radius: 5px;
            font-size: 12px;

            :deep(.el-scrollbar) {
                height: 100%;
            }
            :deep(.el-scrollbar__wrap) {
                height: 100%;
            }
            :deep(.el-scrollbar__view) {
                padding: 10px;
            }
            .log-item {
                margin: 0;
                padding: 2px 0;
                color: var(--ev-c-text-2);
                word-break: break-all;
                white-space: pre-wrap;
            }
            .log-item-error   { color: #f56c6c; }
            .log-item-account { color: #67c23a; }
            .log-item-success { color: #67c23a; }
            .log-item-warning { color: #e6a23c; }
        }
    }
    .license-display {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 12px;
        opacity: 0.5;
        color: var(--ev-c-text-1);
        white-space: pre-wrap;
        text-align: center;
    }

    /* about notice */
    .about-notice-item {
        margin-bottom: 10px;
        text-align: center;

        &.has-link {
            cursor: pointer;
            text-decoration: underline;
        }
    }

    .about-actions {
        display: flex;
        justify-content: center;
        margin: 20px 0 10px;
    }

    /* ── feature card 样式（左列内使用） ── */
    .feature-card {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px 20px;
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
