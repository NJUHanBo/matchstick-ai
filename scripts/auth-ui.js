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
        handleAuthCallback();
    }

    async function handleAuthCallback() {
        if (!SupabaseClient.isReady()) return;
        const db = SupabaseClient.getClient();

        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const authError = hashParams.get('error') || hashParams.get('error_code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const authType = hashParams.get('type');

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
                window.history.replaceState(null, '', window.location.pathname);
                if (authType === 'recovery') {
                    showRecoveryScreen(data.session.user);
                    return;
                }
                onLoginSuccess(data.session.user);
                return;
            }

            window.history.replaceState(null, '', window.location.pathname);
            showAuthScreen();
            showAuthError('登录失败，请重试。');
            return;
        }

        const { data: { session } } = await db.auth.getSession();
        if (session) {
            onLoginSuccess(session.user);
            return;
        }

        if (localStorage.getItem('matchstick_auth_skip')) {
            proceedToGame();
            return;
        }

        showAuthScreen();
    }

    // ========== 密码登录 ==========

    async function loginWithPassword() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        hideError();

        if (!email || !email.includes('@')) { showAuthError('请输入有效邮箱'); return; }
        if (!password || password.length < 6) { showAuthError('密码至少6位'); return; }
        if (!SupabaseClient.isReady()) { showAuthError('网络未就绪'); return; }

        const db = SupabaseClient.getClient();
        const { data, error } = await db.auth.signInWithPassword({ email, password });

        if (error) {
            if (error.message.includes('Invalid login credentials')) {
                showAuthError('邮箱或密码错误。如果还没设置密码，点"首次设置密码"。');
            } else {
                showAuthError('登录失败：' + error.message);
            }
            return;
        }

        onLoginSuccess(data.user);
    }

    async function registerWithPassword() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        hideError();

        if (!email || !email.includes('@')) { showAuthError('请输入有效邮箱'); return; }
        if (!password || password.length < 6) { showAuthError('密码至少6位'); return; }
        if (!SupabaseClient.isReady()) { showAuthError('网络未就绪'); return; }

        const db = SupabaseClient.getClient();
        const { data, error } = await db.auth.signUp({ email, password });

        if (error) {
            if (error.message.includes('already registered')) {
                showAuthError('该邮箱已注册。请直接登录，或点"首次设置密码"。');
            } else {
                showAuthError('注册失败：' + error.message);
            }
            return;
        }

        if (data.user && data.session) {
            onLoginSuccess(data.user);
        } else {
            showAuthError('注册成功！请查收确认邮件后再登录。');
        }
    }

    // ========== 重置 / 首次设置密码 ==========

    async function resetPassword() {
        const email = document.getElementById('auth-email').value.trim();
        hideError();

        if (!email || !email.includes('@')) { showAuthError('请先输入邮箱'); return; }
        if (!SupabaseClient.isReady()) { showAuthError('网络未就绪'); return; }

        const db = SupabaseClient.getClient();
        const redirectUrl = window.location.origin + window.location.pathname;

        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });

        if (error) {
            showAuthError('发送失败：' + error.message);
            return;
        }

        document.getElementById('auth-email-step').classList.add('hidden');
        document.getElementById('auth-waiting-step').classList.remove('hidden');
    }

    function showRecoveryScreen(user) {
        if (window.SupabaseClient) SupabaseClient.setAuthUser(user);
        document.getElementById('auth-email-step').classList.add('hidden');
        document.getElementById('auth-waiting-step').classList.add('hidden');
        document.getElementById('auth-recovery-step').classList.remove('hidden');
        document.getElementById('screen-auth').classList.remove('hidden');
        document.getElementById('screen-auth').classList.add('active');
    }

    async function setNewPassword() {
        const pw = document.getElementById('auth-new-password').value;
        const pw2 = document.getElementById('auth-confirm-password').value;
        hideError();

        if (!pw || pw.length < 6) { showAuthError('密码至少6位'); return; }
        if (pw !== pw2) { showAuthError('两次密码不一致'); return; }

        const db = SupabaseClient.getClient();
        const { error } = await db.auth.updateUser({ password: pw });

        if (error) {
            showAuthError('设置失败：' + error.message);
            return;
        }

        const { data: { session } } = await db.auth.getSession();
        if (session) {
            onLoginSuccess(session.user);
        } else {
            showAuthScreen();
            showAuthError('密码已设置，请用新密码登录。');
        }
    }

    // ========== UI helpers ==========

    function showAuthScreen() {
        document.getElementById('auth-email-step').classList.remove('hidden');
        document.getElementById('auth-waiting-step').classList.add('hidden');
        document.getElementById('auth-recovery-step').classList.add('hidden');
        document.getElementById('screen-auth').classList.remove('hidden');
        document.getElementById('screen-auth').classList.add('active');
    }

    function hideAuthScreen() {
        document.getElementById('screen-auth').classList.add('hidden');
        document.getElementById('screen-auth').classList.remove('active');
    }

    function showAuthError(message) {
        var el = document.getElementById('auth-error');
        el.textContent = message;
        el.classList.remove('hidden');
    }

    function hideError() {
        document.getElementById('auth-error').classList.add('hidden');
    }

    function getAuthErrorMessage(hashParams) {
        var code = hashParams.get('error_code');
        var desc = hashParams.get('error_description');
        if (code === 'otp_expired') return '链接已过期，请重新操作。';
        if (desc) return '验证失败：' + desc;
        return '验证失败，请重试。';
    }

    function backToEmail() {
        document.getElementById('auth-waiting-step').classList.add('hidden');
        document.getElementById('auth-recovery-step').classList.add('hidden');
        document.getElementById('auth-email-step').classList.remove('hidden');
    }

    function skipLogin() {
        localStorage.setItem('matchstick_auth_skip', 'true');
        proceedToGame();
    }

    function onLoginSuccess(user) {
        if (window.SupabaseClient) SupabaseClient.setAuthUser(user);
        proceedToGame();
    }

    function proceedToGame() {
        hideAuthScreen();
        if (typeof startGameAfterAuth === 'function') startGameAfterAuth();
    }

    return {
        init,
        loginWithPassword,
        registerWithPassword,
        resetPassword,
        setNewPassword,
        backToEmail,
        skipLogin,
        showAuthScreen,
    };
})();

window.ConsentManager = ConsentManager;
window.AuthUI = AuthUI;
