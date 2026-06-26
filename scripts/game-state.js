const GameState = {
    character: null,
    stats: {
        energy: 100,
        spirit: 50,
        sawdust: 100,
        flame: 100,
        ash: 500,
        totalDays: 1,
        burningDays: 0,
    },
    dailyTasks: [],
    projects: [],
    todos: [],
    shop: {
        activeEffects: { fireStarter: false, mirror: false, oxygenChamber: false },
    },
    vacation: { isOnVacation: false, vacationType: null, startDate: null, endDate: null },
    depression: {
        status: '黑狗缠身',
        dailySpirit: 50,
        nextMilestone: 7,
        milestones: {
            7: { status: '黑狗退后', spirit: 60 },
            14: { status: '黑狗退散', spirit: 75 },
            30: { status: '黑狗远去', spirit: 85 },
            60: { status: '战胜黑狗', spirit: 100 },
        },
    },
    lastPlayedDate: null,
    blackDogCombo: 0,
    blackDogTotalCompleted: 0,
    logs: [],
    chatHistory: [],
    thoughts: [],
    dailyThoughtCompleted: false,
    guideTourCompleted: false,
    crystalChapterUnlocked: false,
    magicAcademy: {
        discoveredParchments: [],
        lastExcavation: null,
    },
};

const GOD_INFO = {
    wise: { name: '智者', icon: '🕯️', title: '🕯️ 智者的残响', persona: '洞察与反思' },
    king: { name: '国王', icon: '⚔️', title: '⚔️ 国王的残响', persona: '决策与纪律' },
    rich: { name: '首富', icon: '⚗️', title: '⚗️ 首富的残响', persona: '效率与价值' },
};

var _cloudSaveTimer = null;

function saveGame() {
    GameState._savedAt = Date.now();
    localStorage.setItem('matchstick-ai-state', JSON.stringify(GameState));
    _scheduleCloudSave();
}

function _scheduleCloudSave() {
    if (!window.SupabaseClient || !SupabaseClient.isLoggedIn()) return;
    clearTimeout(_cloudSaveTimer);
    _cloudSaveTimer = setTimeout(_pushToCloud, 5000);
}

async function _pushToCloud() {
    if (!window.SupabaseClient || !SupabaseClient.isReady() || !SupabaseClient.isLoggedIn()) return;
    try {
        var db = SupabaseClient.getClient();
        var saveData = JSON.parse(JSON.stringify(GameState));
        delete saveData._savedAt;
        await db.from('game_saves').upsert({
            user_id: SupabaseClient.getUserId(),
            save_data: saveData,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (e) {
        console.error('Cloud save failed:', e);
    }
}

async function syncFromCloud() {
    if (!window.SupabaseClient || !SupabaseClient.isReady() || !SupabaseClient.isLoggedIn()) return false;
    try {
        var db = SupabaseClient.getClient();
        var result = await db
            .from('game_saves')
            .select('save_data, updated_at')
            .eq('user_id', SupabaseClient.getUserId())
            .maybeSingle();

        var data = result.data;
        if (!data || !data.save_data || !data.save_data.character) {
            if (GameState.character) _pushToCloud();
            return false;
        }

        var cloudTime = new Date(data.updated_at).getTime();
        var localTime = GameState._savedAt || 0;

        if (!GameState.character || cloudTime > localTime) {
            Object.assign(GameState, data.save_data);
            GameState._savedAt = cloudTime;
            localStorage.setItem('matchstick-ai-state', JSON.stringify(GameState));
            return true;
        }

        _pushToCloud();
        return false;
    } catch (e) {
        console.error('Cloud sync failed:', e);
        return false;
    }
}

function loadGame() {
    const saved = localStorage.getItem('matchstick-ai-state');
    if (saved) {
        Object.assign(GameState, JSON.parse(saved));
        return true;
    }
    return false;
}

function resetGame() {
    localStorage.removeItem('matchstick-ai-state');
    if (window.SupabaseClient && SupabaseClient.isLoggedIn()) {
        var db = SupabaseClient.getClient();
        db.from('game_saves').delete().eq('user_id', SupabaseClient.getUserId()).then(function(){}).catch(function(){});
    }
    location.reload();
}
