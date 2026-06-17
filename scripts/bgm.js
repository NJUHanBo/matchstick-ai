/**
 * 背景音乐管理器
 * 循环播放、淡入淡出、场景切换
 */
var BGMusic = (function () {
    let audio = null;
    let currentTrack = null;
    let volume = 0.3;
    let muted = false;
    let fadeInterval = null;

    // 音乐曲目配置（替换为你自己下载的文件路径）
    const TRACKS = {
        // 默认/地图探索：暗色 ambient
        explore: 'audio/explore.mp3',
        // 营地/对话：温暖 lo-fi
        camp: 'audio/camp.mp3',
        // 通用 fallback（如果只有一首就用这个）
        default: 'audio/main-loop.mp3',
    };

    function init() {
        audio = new Audio();
        audio.loop = true;
        audio.volume = volume;

        // 从 localStorage 恢复设置
        const savedVol = localStorage.getItem('matchstick_bgm_vol');
        if (savedVol !== null) volume = parseFloat(savedVol);

        const savedMute = localStorage.getItem('matchstick_bgm_mute');
        if (savedMute === 'true') muted = true;

        audio.volume = muted ? 0 : volume;
    }

    function play(trackKey) {
        if (!audio) init();
        const track = TRACKS[trackKey] || TRACKS.default;

        if (currentTrack === track) return;
        currentTrack = track;

        // 淡出当前 → 切换 → 淡入
        if (!audio.paused) {
            fadeOut(function () {
                audio.src = track;
                audio.play().then(function () { fadeIn(); }).catch(function () {});
            });
        } else {
            audio.src = track;
            audio.volume = 0;
            audio.play().then(function () { fadeIn(); }).catch(function () {});
        }
    }

    function stop() {
        if (!audio) return;
        fadeOut(function () {
            audio.pause();
            currentTrack = null;
        });
    }

    function fadeIn() {
        if (fadeInterval) clearInterval(fadeInterval);
        const target = muted ? 0 : volume;
        audio.volume = 0;
        fadeInterval = setInterval(function () {
            if (audio.volume < target - 0.02) {
                audio.volume = Math.min(audio.volume + 0.02, target);
            } else {
                audio.volume = target;
                clearInterval(fadeInterval);
                fadeInterval = null;
            }
        }, 50);
    }

    function fadeOut(callback) {
        if (fadeInterval) clearInterval(fadeInterval);
        fadeInterval = setInterval(function () {
            if (audio.volume > 0.02) {
                audio.volume = Math.max(audio.volume - 0.03, 0);
            } else {
                audio.volume = 0;
                clearInterval(fadeInterval);
                fadeInterval = null;
                if (callback) callback();
            }
        }, 50);
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (!muted && audio) audio.volume = volume;
        localStorage.setItem('matchstick_bgm_vol', volume);
    }

    function toggleMute() {
        muted = !muted;
        if (audio) audio.volume = muted ? 0 : volume;
        localStorage.setItem('matchstick_bgm_mute', muted);
        return muted;
    }

    function isMuted() {
        return muted;
    }

    // 首次用户交互后才能播放（浏览器策略）
    function tryAutoplay() {
        if (!audio) init();
        document.addEventListener('click', function handler() {
            if (!currentTrack) {
                play('default');
            }
            document.removeEventListener('click', handler);
        }, { once: true });
    }

    return {
        init,
        play,
        stop,
        setVolume,
        toggleMute,
        isMuted,
        tryAutoplay,
    };
})();

window.BGMusic = BGMusic;
