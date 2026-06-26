/**
 * 数据收集同意管理 + Auth 登录 UI
 */

// ========== 同意管理 ==========
var ConsentManager = (function () {
    const STORAGE_KEY = 'matchstick_consent';

    function init() {
        const status = localStorage.getItem(STORAGE_KEY);
        if (!status) {
            show();
        }
    }

    function show() {
        document.getElementById('consent-banner').classList.remove('hidden');
    }

    function accept() {
        localStorage.setItem(STORAGE_KEY, 'accepted');
        document.getElementById('consent-banner').classList.add('hidden');
    }

    function decline() {
        localStorage.setItem(STORAGE_KEY, 'declined');
        document.getElementById('consent-banner').classList.add('hidden');
    }

    function isAccepted() {
        return localStorage.getItem(STORAGE_KEY) === 'accepted';
    }

    return { init, show, accept, decline, isAccepted };
})();

// ========== Auth UI ==========
var AuthUI = (function () {

    function init() {
        // 检查 URL 中是否有 Supabase Auth 回调（magic link 点击后跳转回来）
        handleAuthCallback();
    }

    async function handleAuthCallback() {
        if (!SupabaseClient.isReady()) return;
        const db = SupabaseClient.getClient();

        // Supabase 会在 URL hash 中带回 access_token
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const authError = hashParams.get('error') || hashParams.get('error_code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (authError) {
            window.history.replaceState(null, '', window.location.pathname);
            showAuthScreen();
            showAuthError(getAuthErrorMessage(hashParams));
            return;
        }

        if (accessToken && refreshToken) {
            const { data, error } = await db.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });

            if (!error && data.session) {
                // 清理 URL hash
                window.history.replaceState(null, '', window.location.pathname);
                onLoginSuccess(data.session.user);
                return;
            }

            window.history.replaceState(null, '', window.location.pathname);
            showAuthScreen();
            showAuthError('登录状态保存失败，请重新发送验证邮件。');
            return;
        }

        // 检查是否已有 session
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            onLoginSuccess(session.user);
            return;
        }

        // 没有登录，检查是否有匿名跳过记录
        if (localStorage.getItem('matchstick_auth_skip')) {
            proceedToGame();
            return;
        }

        // 显示登录屏幕
        showAuthScreen();
    }

    function showAuthScreen() {
        document.getElementById('auth-email-step').classList.remove('hidden');
        document.getElementById('auth-waiting-step').classList.add('hidden');
        document.getElementById('screen-auth').classList.remove('hidden');
        document.getElementById('screen-auth').classList.add('active');
    }

    function hideAuthScreen() {
        document.getElementById('screen-auth').classList.add('hidden');
        document.getElementById('screen-auth').classList.remove('active');
    }

    function showAuthError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function getAuthErrorMessage(hashParams) {
        const errorCode = hashParams.get('error_code');
        const description = hashParams.get('error_description');

        if (errorCode === 'otp_expired') {
            return '验证链接已过期或已被使用，请重新发送验证邮件。';
        }

        if (description) {
            return '登录验证失败：' + description;
        }

        return '登录验证失败，请重新发送验证邮件。';
    }

    async function sendMagicLink() {
        const emailInput = document.getElementById('auth-email');
        const email = emailInput.value.trim();
        const errorEl = document.getElementById('auth-error');

        if (!email || !email.includes('@')) {
            showAuthError('请输入有效邮箱地址');
            return;
        }

        errorEl.classList.add('hidden');

        if (!SupabaseClient.isReady()) {
            showAuthError('网络未就绪，请稍后重试');
            return;
        }

        const db = SupabaseClient.getClient();
        const isElectron = window.location.hostname === '127.0.0.1';
        const redirectUrl = isElectron
            ? 'matchstick-ai://auth-callback'
            : window.location.origin + window.location.pathname;

        const { error } = await db.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: redirectUrl },
        });

        if (error) {
            showAuthError('发送失败：' + error.message);
            return;
        }

        // 切换到等待步骤
        document.getElementById('auth-email-step').classList.add('hidden');
        document.getElementById('auth-waiting-step').classList.remove('hidden');
    }

    function backToEmail() {
        document.getElementById('auth-waiting-step').classList.add('hidden');
        document.getElementById('auth-email-step').classList.remove('hidden');
    }

    function skipLogin() {
        localStorage.setItem('matchstick_auth_skip', 'true');
        proceedToGame();
    }

    function onLoginSuccess(user) {
        // 更新 SupabaseClient 的 userId
        if (window.SupabaseClient) {
            SupabaseClient.setAuthUser(user);
        }
        proceedToGame();
    }

    function proceedToGame() {
        hideAuthScreen();
        // 触发正常的游戏初始化
        if (typeof startGameAfterAuth === 'function') {
            startGameAfterAuth();
        }
    }

    return {
        init,
        sendMagicLink,
        backToEmail,
        skipLogin,
        showAuthScreen,
    };
})();

window.ConsentManager = ConsentManager;
window.AuthUI = AuthUI;
