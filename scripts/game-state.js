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

function saveGame() {
    localStorage.setItem('matchstick-ai-state', JSON.stringify(GameState));
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
    location.reload();
}
