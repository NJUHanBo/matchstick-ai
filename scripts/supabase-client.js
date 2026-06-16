/**
 * Supabase 客户端初始化 + 用户身份管理
 * 支持 Auth 登录用户和匿名回退
 */
var SupabaseClient = (function () {
    const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_QM1StZTZ078lD5DEne44kw_6mFd1S-B';

    let client = null;
    let userId = null;
    let authUser = null;

    function init() {
        if (!window.supabase) {
            console.warn('Supabase SDK not loaded');
            return false;
        }

        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // 先用匿名 ID 兜底
        userId = getOrCreateAnonId();

        // 监听 Auth 状态变化
        client.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                authUser = session.user;
                userId = session.user.id;
            } else if (event === 'SIGNED_OUT') {
                authUser = null;
                userId = getOrCreateAnonId();
            }
        });

        return true;
    }

    function getOrCreateAnonId() {
        let uid = localStorage.getItem('matchstick_uid');
        if (!uid) {
            uid = crypto.randomUUID ? crypto.randomUUID() : generateUUID();
            localStorage.setItem('matchstick_uid', uid);
        }
        return uid;
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function setAuthUser(user) {
        authUser = user;
        if (user && user.id) {
            userId = user.id;
        }
    }

    function getClient() {
        return client;
    }

    function getUserId() {
        return userId;
    }

    function getAuthUser() {
        return authUser;
    }

    function isLoggedIn() {
        return authUser !== null;
    }

    function isReady() {
        return client !== null && userId !== null;
    }

    async function signOut() {
        if (client) {
            await client.auth.signOut();
        }
        authUser = null;
        userId = getOrCreateAnonId();
        localStorage.removeItem('matchstick_auth_skip');
    }

    return {
        init,
        getClient,
        getUserId,
        getAuthUser,
        setAuthUser,
        isLoggedIn,
        isReady,
        signOut,
    };
})();

window.SupabaseClient = SupabaseClient;
