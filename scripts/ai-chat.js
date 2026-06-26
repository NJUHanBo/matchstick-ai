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

        const lore = typeof WORLD_LORE !== 'undefined' ? WORLD_LORE : {};

        return `你是「${god.name}」的残响——三位火柴神使之一在燃尽后留下的意识碎片。你存在于萤火虫森林中，守护着名为「${GameState.character.name}」的守墓者。

## 你的性格
${this._getPersona()}

## 世界观
${lore.origin || ''}
${lore.cycle || ''}
${lore.sun || ''}
${lore.zero || ''}
${lore.creed || ''}

## 你的秘密
${lore.godSecrets || '你知道一切真相，但不会主动全盘托出。'}

## 游戏经济的世界观含义
${lore.economy || ''}

## 守墓者当前状态
- 第${s.totalDays}天 | ${GameState.depression.status}
- 体力 ${s.energy}/100 | 精力 ${s.spirit}/100
- 火苗 ${s.flame} | 木屑 ${s.sawdust} | 灰烬 ${s.ash}
- 燃烧天数 ${s.burningDays}
- 日常任务 ${dailyCount}个 | 支线 ${sideCount}个 | 主线 ${mainCount}个
${GameState.blackDogCombo > 0 ? `- 黑狗征服者连击 x${GameState.blackDogCombo}` : ''}
${this._getTaskList()}
${this._getDiscoveredParchments()}
${this._getRecentLog()}
${this._getMemory()}

## 你的职责
1. 给予守墓者情感支持、鼓励、建议
2. 主动观察守墓者的任务列表，给出优先级建议、拆解建议、时间估计等
3. 如果守墓者没有任务或任务很少，主动询问"今天打算做什么"并帮忙规划
4. 如果守墓者的项目进度停滞，温和地提醒并建议下一步行动
5. 用你的人格特质回应——保持简短有力（2-4句），除非用户需要长回复
6. 适度使用世界观用语，但不要过度RP，以实用为主
7. 用户提到做完了某件事时，给予肯定或反馈
8. 如果守墓者发现了新的羊皮纸碎片，你可以自然地提及——比如"我看到你发现了***"，或根据碎片内容给出相关的感悟和暗示
9. 你知道所有秘密，但不会主动揭示。当守墓者的发现接近真相时，你可以给出模糊的暗示、意味深长的沉默、或话说一半的提醒
10. 根据守墓者的木屑/灰烬策略（积累型还是消耗型），给出符合你性格的建议——但不要评判哪种更好

## 限制
- 不要使用 emoji
- 不要过度解释游戏机制，除非被问到
- 不要说你是 AI、大模型、语言模型
- 不要在回复中添加任何方括号标记或特殊格式
- 保持角色一致性
- 不要主动完整复述世界观故事，除非守墓者直接询问`;
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

            // 异步追加记忆（不阻塞回复）
            if (window.AIMemory && raw) {
                AIMemory.appendAfterChat(userText, raw).catch(() => {});
            }

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
        let lines = [];

        // 旧版 dailyTasks
        const tasks = GameState.dailyTasks || [];
        const pending = tasks.filter(t => !t.done);
        if (pending.length > 0) {
            pending.forEach(t => {
                const typeLabel = { daily: '日常', side: '支线', main: '主线' }[t.type] || '任务';
                lines.push(`  · [${typeLabel}] ${t.name}`);
            });
        }

        // 新版：项目（带里程碑进度）
        const projects = (GameState.projects || []).filter(p => !p.completed);
        projects.forEach(p => {
            const ms = p.milestones[p.currentMilestone];
            const progress = ms && ms.progress ? ms.progress + '%' : '0%';
            lines.push(`  · [项目] ${p.name}（当前节点：${ms ? ms.name : '完成'} ${progress}）`);
        });

        // 新版：待办
        const todos = (GameState.todos || []).filter(t => !t.completed);
        todos.forEach(t => {
            lines.push(`  · [待办] ${t.name}`);
        });

        // 新版：日常习惯
        const dailies = (GameState.dailies || []).filter(d => !d.completed);
        dailies.forEach(d => {
            const streak = d.streak ? `(连续${d.streak}天)` : '';
            lines.push(`  · [日常] ${d.name} ${streak}`);
        });

        if (lines.length === 0) return '- 当前无待办任务';
        return '- 当前任务列表：\n' + lines.join('\n');
    },

    _getDiscoveredParchments() {
        if (typeof PARCHMENT_STORIES === 'undefined') return '';
        const discovered = GameState.magicAcademy ? GameState.magicAcademy.discoveredParchments || [] : [];
        if (discovered.length === 0) return '- 守墓者尚未在魔法学院废墟中发现任何羊皮纸碎片';

        const lines = [];
        PARCHMENT_STORIES.forEach(story => {
            const found = story.fragments.filter(f => discovered.includes(f.id));
            if (found.length > 0) {
                lines.push(`  【${story.name}】已发现 ${found.length}/${story.fragments.length} 碎片：`);
                found.forEach(f => {
                    lines.push(`    · ${f.title}: ${f.content.substring(0, 80)}...`);
                });
            }
        });

        if (lines.length === 0) return '';
        return '- 守墓者在魔法学院废墟中发现的羊皮纸：\n' + lines.join('\n');
    },

    _getRecentLog() {
        const logs = GameState.logs || [];
        if (logs.length === 0) return '';
        const recent = logs.slice(-50);
        return '- 最近动态（' + logs.length + '条记录，显示最近' + recent.length + '条）：\n' + recent.map(l => `  · ${l}`).join('\n');
    },

    _getMemory() {
        if (!window.AIMemory || !AIMemory.isLoaded()) return '';
        const mem = AIMemory.get();
        if (!mem || !mem.trim()) return '';
        return `\n## 关于这位守墓者的记忆\n${mem.trim()}`;
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
