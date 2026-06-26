/**
 * 背景音乐 + 环境音管理器
 * 双轨系统：音乐层（单曲循环）+ 环境音层（可叠加多个）
 */
var BGMusic = (function () {
    var audio = null;
    var currentTrack = null;
    var volume = 0.3;
    var muted = false;
    var fadeInterval = null;

    var TRACKS = {
        explore: { src: 'audio/explore.mp3', name: '暗色旷野' },
        camp:    { src: 'audio/camp.mp3',    name: '温暖篝火' },
        default: { src: 'audio/main-loop.mp3', name: '萤火虫森林' },
    };

    // --- 环境音层 ---
    var AMBIENTS = {
        crickets:  { src: 'audio/amb-crickets.mp3',  name: '虫鸣', icon: '🦗' },
        campfire:  { src: 'audio/amb-campfire.mp3',  name: '篝火', icon: '🔥' },
        wind:      { src: 'audio/amb-wind.mp3',      name: '风声', icon: '🍃' },
    };
    var ambientAudios = {};
    var ambientActive = {};
    var ambientVolume = 0.25;

    function init() {
        audio = new Audio();
        audio.loop = true;
        audio.volume = volume;

        var savedVol = localStorage.getItem('matchstick_bgm_vol');
        if (savedVol !== null) volume = parseFloat(savedVol);

        var savedMute = localStorage.getItem('matchstick_bgm_mute');
        if (savedMute === 'true') muted = true;

        var savedAmbVol = localStorage.getItem('matchstick_amb_vol');
        if (savedAmbVol !== null) ambientVolume = parseFloat(savedAmbVol);

        var savedAmb = localStorage.getItem('matchstick_amb_active');
        if (savedAmb) {
            try { ambientActive = JSON.parse(savedAmb); } catch (e) { ambientActive = {}; }
        }

        audio.volume = muted ? 0 : volume;
    }

    function play(trackKey) {
        if (!audio) init();
        var t = TRACKS[trackKey] || TRACKS.default;
        var src = t.src || t;

        if (currentTrack === src) return;
        currentTrack = src;

        if (!audio.paused) {
            fadeOut(function () {
                audio.src = src;
                audio.play().then(function () { fadeIn(); }).catch(function () {});
            });
        } else {
            audio.src = src;
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
        var target = muted ? 0 : volume;
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
        Object.keys(ambientAudios).forEach(function (k) {
            ambientAudios[k].volume = muted ? 0 : (ambientActive[k] ? ambientVolume : 0);
        });
        localStorage.setItem('matchstick_bgm_mute', muted);
        return muted;
    }

    function isMuted() { return muted; }

    // --- 环境音控制 ---
    function toggleAmbient(key) {
        if (!AMBIENTS[key]) return;

        if (ambientActive[key]) {
            ambientActive[key] = false;
            if (ambientAudios[key]) {
                ambientAudios[key].pause();
            }
        } else {
            ambientActive[key] = true;
            if (!ambientAudios[key]) {
                ambientAudios[key] = new Audio(AMBIENTS[key].src);
                ambientAudios[key].loop = true;
            }
            ambientAudios[key].volume = muted ? 0 : ambientVolume;
            ambientAudios[key].play().catch(function () {});
        }

        localStorage.setItem('matchstick_amb_active', JSON.stringify(ambientActive));
    }

    function setAmbientVolume(v) {
        ambientVolume = Math.max(0, Math.min(1, v));
        Object.keys(ambientAudios).forEach(function (k) {
            if (ambientActive[k] && !muted) {
                ambientAudios[k].volume = ambientVolume;
            }
        });
        localStorage.setItem('matchstick_amb_vol', ambientVolume);
    }

    function restoreAmbients() {
        Object.keys(ambientActive).forEach(function (k) {
            if (ambientActive[k] && AMBIENTS[k]) {
                if (!ambientAudios[k]) {
                    ambientAudios[k] = new Audio(AMBIENTS[k].src);
                    ambientAudios[k].loop = true;
                }
                ambientAudios[k].volume = muted ? 0 : ambientVolume;
                ambientAudios[k].play().catch(function () {});
            }
        });
    }

    function tryAutoplay() {
        if (!audio) init();
        document.addEventListener('click', function handler() {
            if (!currentTrack) {
                play('default');
            }
            restoreAmbients();
            document.removeEventListener('click', handler);
        }, { once: true });
    }

    // --- 控制面板 UI ---
    function renderPanel() {
        var panel = document.getElementById('audio-panel');
        if (!panel) return;

        var musicHtml = '<div class="audio-section">' +
            '<div class="audio-section-title">音乐</div>' +
            '<div class="audio-tracks">';
        Object.keys(TRACKS).forEach(function (k) {
            var t = TRACKS[k];
            var isActive = currentTrack === t.src;
            musicHtml += '<button class="audio-track-btn' + (isActive ? ' audio-track-active' : '') +
                '" onclick="BGMusic.play(\'' + k + '\');BGMusic.renderPanel()">' + t.name + '</button>';
        });
        musicHtml += '</div>' +
            '<div class="audio-slider-row">' +
            '<span class="audio-slider-label">音量</span>' +
            '<input type="range" class="audio-slider" min="0" max="100" value="' + Math.round(volume * 100) +
            '" oninput="BGMusic.setVolume(this.value/100)">' +
            '</div></div>';

        var ambHtml = '<div class="audio-section">' +
            '<div class="audio-section-title">环境音</div>' +
            '<div class="audio-amb-grid">';
        Object.keys(AMBIENTS).forEach(function (k) {
            var a = AMBIENTS[k];
            var isOn = !!ambientActive[k];
            ambHtml += '<button class="audio-amb-btn' + (isOn ? ' audio-amb-on' : '') +
                '" onclick="BGMusic.toggleAmbient(\'' + k + '\');BGMusic.renderPanel()">' +
                a.icon + ' ' + a.name + '</button>';
        });
        ambHtml += '</div>' +
            '<div class="audio-slider-row">' +
            '<span class="audio-slider-label">音量</span>' +
            '<input type="range" class="audio-slider" min="0" max="100" value="' + Math.round(ambientVolume * 100) +
            '" oninput="BGMusic.setAmbientVolume(this.value/100)">' +
            '</div></div>';

        var muteHtml = '<button class="audio-mute-btn" onclick="BGMusic.toggleMute();BGMusic.renderPanel()">' +
            (muted ? '🔇 已静音' : '🔊 静音') + '</button>';

        panel.innerHTML = musicHtml + ambHtml + muteHtml;
    }

    function togglePanel() {
        var panel = document.getElementById('audio-panel');
        if (!panel) return;
        if (panel.classList.contains('hidden')) {
            renderPanel();
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }

    return {
        init: init,
        play: play,
        stop: stop,
        setVolume: setVolume,
        toggleMute: toggleMute,
        isMuted: isMuted,
        tryAutoplay: tryAutoplay,
        toggleAmbient: toggleAmbient,
        setAmbientVolume: setAmbientVolume,
        renderPanel: renderPanel,
        togglePanel: togglePanel,
        TRACKS: TRACKS,
        AMBIENTS: AMBIENTS,
    };
})();

window.BGMusic = BGMusic;
