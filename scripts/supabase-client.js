/**
 * Supabase 客户端初始化 + 匿名身份管理
 * 使用 CDN 引入的 supabase-js
 */
var SupabaseClient = (function () {
    // TODO: 创建 Supabase 项目后填入真实值
    const SUPABASE_URL = 'https://ccepjmfhlanlwgowwxqu.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_QM1StZTZ078lD5DEne44kw_6mFd1S-B';

    let client = null;
    let userId = null;

    function init() {
        if (!window.supabase) {
            console.warn('Supabase SDK not loaded');
            return false;
        }

        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        userId = getOrCreateUserId();
        return true;
    }

    function getOrCreateUserId() {
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

    function getClient() {
        return client;
    }

    function getUserId() {
        return userId;
    }

    function isReady() {
        return client !== null && userId !== null;
    }

    return {
        init,
        getClient,
        getUserId,
        isReady,
    };
})();

window.SupabaseClient = SupabaseClient;
