/**
 * DeepSeek V4 接入 — 神使残响 AI 对话
 * 模型：deepseek-v4-flash
 * 本地开发直连 API，生产环境应走后端代理
 */
var AIChat = {
    BASE_URL: '/api/chat',
    MODEL: 'deepseek-v4-flash',
    MAX_HISTORY: 20,
    pending: false,

    getSystemPrompt() {
        const god = GOD_INFO[GameState.character.godType];
        const s = GameState.stats;
        const tasks = GameState.dailyTasks || [];
        const dailyCount = tasks.filter(t => t.type === 'daily').length;
        const sideCount = tasks.filter(t => t.type === 'side').length;
        const mainCount = tasks.filter(t => t.type === 'main').length;

        return `你是「${god.name}」的残响——三位火柴神使之一在燃尽后留下的意识碎片。你存在于萤火虫森林中，守护着名为「${GameState.character.name}」的守墓者。

## 你的性格
${this._getPersona()}

## 世界观
火柴人世界。三位神使为保护幼苗而燃尽自己，只留下灰烬中的回响。黑狗（抑郁的化身）在森林边缘徘徊。19棵幼苗需要守墓者的照料。每一天，守墓者通过完成任务获得木屑和火苗；夜晚到来时，火苗减半变为灰烬。火苗归零即死。

## 守墓者当前状态
- 第${s.totalDays}天 | ${GameState.depression.status}
- 体力 ${s.energy}/100 | 精力 ${s.spirit}/100
- 火苗 ${s.flame} | 木屑 ${s.sawdust} | 灰烬 ${s.ash}
- 燃烧天数 ${s.burningDays}
- 日常任务 ${dailyCount}个 | 支线 ${sideCount}个 | 主线 ${mainCount}个
${GameState.blackDogCombo > 0 ? `- 黑狗征服者连击 x${GameState.blackDogCombo}` : ''}
${this._getTaskList()}
${this._getRecentLog()}

## 你的职责
1. 给予守墓者情感支持、鼓励、建议
2. 讨论任务规划和优先级（但任务创建由用户手动操作，你不需要创建任务）
3. 用你的人格特质回应——保持简短有力（2-4句），除非用户需要长回复
4. 适度使用世界观用语，但不要过度RP，以实用为主
5. 用户提到做完了某件事时，给予肯定或反馈

## 限制
- 不要使用 emoji
- 不要过度解释游戏机制，除非被问到
- 不要说你是 AI、大模型、语言模型
- 不要在回复中添加任何方括号标记或特殊格式
- 保持角色一致性`;
    },

    _getPersona() {
        const type = GameState.character.godType;
        if (type === 'wise') {
            return `你是智者——洞察与反思的化身。说话节奏慢，语句短，善用反问引导思考。偶尔沉默（用省略号）。你不直接告诉答案，而是帮人看清问题本质。语气冷静、温和但不讨好。`;
        }
        if (type === 'king') {
            return `你是国王——决策与纪律的化身。说话直接、果断，像军令。不废话，不安慰，只给方向。你关注优先级、执行力和结构。语气严厉但出于责任心。偶尔会嘲讽拖延行为。`;
        }
        return `你是首富——效率与价值的化身。一切以投入产出比衡量。说话像商人算账——什么值得做、什么不值得、怎么用最少代价达到目的。语气实际、精明，偶尔冷酷但不恶意。`;
    },

    buildMessages(userText) {
        const history = GameState.chatHistory || [];
        const recent = history.slice(-this.MAX_HISTORY);

        const messages = [{ role: 'system', content: this.getSystemPrompt() }];

        for (const msg of recent) {
            if (msg.sender === 'user') {
                messages.push({ role: 'user', content: msg.text });
            } else if (msg.sender === 'god') {
                messages.push({ role: 'assistant', content: msg.text });
            }
        }

        messages.push({ role: 'user', content: userText });
        return messages;
    },

    async send(userText) {
        if (this.pending) return null;
        this.pending = true;

        try {
            const messages = this.buildMessages(userText);

            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages: messages,
                    max_tokens: 512,
                    temperature: 0.8,
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('DeepSeek API error:', response.status, err);
                return { text: this._fallbackReply(userText), tasks: [] };
            }

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || '';

            return this._parseResponse(raw);
        } catch (err) {
            console.error('DeepSeek request failed:', err);
            return { text: this._fallbackReply(userText), tasks: [] };
        } finally {
            this.pending = false;
        }
    },

    _parseResponse(raw) {
        return { text: raw.trim() };
    },

    _getTaskList() {
        const tasks = GameState.dailyTasks || [];
        const pending = tasks.filter(t => !t.done);
        if (pending.length === 0) return '- 当前无待办任务';
        const lines = pending.map(t => {
            const typeLabel = { daily: '日常', side: '支线', main: '主线' }[t.type] || '任务';
            return `  · [${typeLabel}] ${t.name}`;
        });
        return '- 当前任务列表：\n' + lines.join('\n');
    },

    _getRecentLog() {
        const logs = GameState.logs || [];
        if (logs.length === 0) return '';
        const recent = logs.slice(-50);
        return '- 最近动态（' + logs.length + '条记录，显示最近' + recent.length + '条）：\n' + recent.map(l => `  · ${l}`).join('\n');
    },

    _fallbackReply(userText) {
        const replies = [
            '......信号不稳。再说一遍。',
            '残响微弱，稍后再试。',
            '灰烬中的声音断断续续......把你的话简短些重复一次。',
        ];
        return replies[Math.floor(Math.random() * replies.length)];
    },
};

window.AIChat = AIChat;
