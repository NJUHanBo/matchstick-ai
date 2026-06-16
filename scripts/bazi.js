/**
 * 命火祭坛 · 八字命理分析模块
 * 前端排盘计算 + DeepSeek AI 解读
 */
var BaziModule = (function () {
    const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const WUXING_TG = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
    const WUXING_DZ = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
    const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

    const CANGGAN = [
        ['癸'],           // 子
        ['己', '癸', '辛'], // 丑
        ['甲', '丙', '戊'], // 寅
        ['乙'],           // 卯
        ['戊', '乙', '癸'], // 辰
        ['丙', '戊', '庚'], // 巳
        ['丁', '己'],     // 午
        ['己', '丁', '乙'], // 未
        ['庚', '壬', '戊'], // 申
        ['辛'],           // 酉
        ['戊', '辛', '丁'], // 戌
        ['壬', '甲'],     // 亥
    ];

    const SHISHEN_NAME = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'];

    // 节气近似日期 (公历月-日)，按公历月升序排列
    // offset: 0=寅月, 1=卯月, ..., 10=子月, 11=丑月
    const JIEQI = [
        { month: 1, day: 6, offset: 11 },  // 小寒 → 丑月
        { month: 2, day: 4, offset: 0 },   // 立春 → 寅月
        { month: 3, day: 6, offset: 1 },   // 惊蛰 → 卯月
        { month: 4, day: 5, offset: 2 },   // 清明 → 辰月
        { month: 5, day: 6, offset: 3 },   // 立夏 → 巳月
        { month: 6, day: 6, offset: 4 },   // 芒种 → 午月
        { month: 7, day: 7, offset: 5 },   // 小暑 → 未月
        { month: 8, day: 8, offset: 6 },   // 立秋 → 申月
        { month: 9, day: 8, offset: 7 },   // 白露 → 酉月
        { month: 10, day: 8, offset: 8 },  // 寒露 → 戌月
        { month: 11, day: 7, offset: 9 },  // 立冬 → 亥月
        { month: 12, day: 7, offset: 10 }, // 大雪 → 子月
    ];

    let state = {
        gender: 'male',
        chartData: null,
        history: [],
    };

    function init() {
        // 每次打开面板时恢复状态
    }

    function setGender(g) {
        state.gender = g;
        document.querySelectorAll('.bazi-gender-btn').forEach(b => {
            b.classList.toggle('bazi-gender-active', b.dataset.gender === g);
        });
    }

    // ========== 排盘核心计算 ==========

    function getYearGanZhi(year) {
        const tgIdx = (year - 4) % 10;
        const dzIdx = (year - 4) % 12;
        return { tg: tgIdx, dz: dzIdx };
    }

    function getMonthGanZhi(yearTg, month, day) {
        // 根据节气确定月支 (寅月=0起始偏移)
        let monthDzOffset = getMonthByJieqi(month, day);
        let dzIdx = (monthDzOffset + 2) % 12; // 寅=2

        // 月干：年上起月口诀
        const startTg = [2, 4, 6, 8, 0]; // 甲己→丙, 乙庚→戊, 丙辛→庚, 丁壬→壬, 戊癸→甲
        const base = startTg[yearTg % 5];
        const tgIdx = (base + monthDzOffset) % 10;

        return { tg: tgIdx, dz: dzIdx };
    }

    function getMonthByJieqi(month, day) {
        // 返回值 0=寅月, 1=卯月, ..., 11=丑月
        // 正序遍历，找最后一个满足条件的节气
        let result = 10; // 默认子月（12月大雪后到次年小寒前）
        for (let i = 0; i < JIEQI.length; i++) {
            const jq = JIEQI[i];
            if (month > jq.month || (month === jq.month && day >= jq.day)) {
                result = jq.offset;
            } else {
                break;
            }
        }
        return result;
    }

    function getDayGanZhi(year, month, day) {
        // 使用基准日推算：2000年1月1日 = 甲子日 → 实际查表
        // 简化：用儒略日数计算
        const jd = toJulianDay(year, month, day);
        const baseJd = toJulianDay(2000, 1, 7); // 2000-01-07 是甲子日
        const diff = jd - baseJd;
        const tgIdx = ((diff % 10) + 10) % 10;
        const dzIdx = ((diff % 12) + 12) % 12;
        return { tg: tgIdx, dz: dzIdx };
    }

    function toJulianDay(y, m, d) {
        if (m <= 2) { y--; m += 12; }
        const A = Math.floor(y / 100);
        const B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }

    function getHourGanZhi(dayTg, hourIdx) {
        if (hourIdx < 0) return null;
        const dzIdx = hourIdx; // 子=0, 丑=1, ..., 亥=11
        // 日上起时口诀
        const startTg = [0, 2, 4, 6, 8]; // 甲己→甲, 乙庚→丙, 丙辛→戊, 丁壬→庚, 戊癸→壬
        const base = startTg[dayTg % 5];
        const tgIdx = (base + hourIdx) % 10;
        return { tg: tgIdx, dz: dzIdx };
    }

    function calcBazi(year, month, day, hourIdx) {
        // 年柱需考虑立春（简化：2月4日前算上一年）
        let baziYear = year;
        if (month < 2 || (month === 2 && day < 4)) {
            baziYear--;
        }

        const yearGZ = getYearGanZhi(baziYear);
        const monthGZ = getMonthGanZhi(yearGZ.tg, month, day);
        const dayGZ = getDayGanZhi(year, month, day);
        const hourGZ = getHourGanZhi(dayGZ.tg, hourIdx);

        return {
            year: yearGZ,
            month: monthGZ,
            day: dayGZ,
            hour: hourGZ,
            baziYear: baziYear,
        };
    }

    function getShiShen(dayTg, targetTg) {
        const dayWx = Math.floor(dayTg / 2); // 0木1火2土3金4水
        const tgtWx = Math.floor(targetTg / 2);
        const sameYinYang = (dayTg % 2) === (targetTg % 2);

        if (dayWx === tgtWx) return sameYinYang ? 0 : 1;         // 比肩/劫财
        if ((dayWx + 1) % 5 === tgtWx) return sameYinYang ? 2 : 3; // 食神/伤官
        if ((dayWx + 2) % 5 === tgtWx) return sameYinYang ? 4 : 5; // 偏财/正财
        if ((tgtWx + 1) % 5 === dayWx) return sameYinYang ? 8 : 9; // 偏印/正印
        if ((tgtWx + 2) % 5 === dayWx) return sameYinYang ? 6 : 7; // 七杀/正官
        return 0;
    }

    function analyzeWuxing(bazi) {
        const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
        const pillars = [bazi.year, bazi.month, bazi.day];
        if (bazi.hour) pillars.push(bazi.hour);

        pillars.forEach(p => {
            count[WUXING_TG[p.tg]]++;
            count[WUXING_DZ[p.dz]]++;
            CANGGAN[p.dz].forEach(cg => {
                const idx = TIANGAN.indexOf(cg);
                count[WUXING_TG[idx]] += 0.5;
            });
        });

        return count;
    }

    function judgeDayStrength(bazi) {
        const dayTg = bazi.day.tg;
        const dayWx = WUXING_TG[dayTg];
        const monthDz = bazi.month.dz;
        const monthWx = WUXING_DZ[monthDz];

        // 得令判断
        const shengMap = { '木': '水', '火': '木', '土': '火', '金': '土', '水': '金' };
        const deLing = (monthWx === dayWx) || (shengMap[dayWx] === monthWx);

        // 通根计数
        let roots = 0;
        const pillars = [bazi.year, bazi.month, bazi.day];
        if (bazi.hour) pillars.push(bazi.hour);
        pillars.forEach(p => {
            CANGGAN[p.dz].forEach(cg => {
                const idx = TIANGAN.indexOf(cg);
                if (WUXING_TG[idx] === dayWx) roots++;
            });
        });

        // 简化判断
        if (deLing && roots >= 2) return '身强';
        if (!deLing && roots <= 1) return '身弱';
        if (deLing) return '中偏强';
        return '中偏弱';
    }

    function formatChart(bazi, gender) {
        const pillars = [
            { label: '年柱', gz: bazi.year },
            { label: '月柱', gz: bazi.month },
            { label: '日柱', gz: bazi.day },
        ];
        if (bazi.hour) pillars.push({ label: '时柱', gz: bazi.hour });

        const dayTg = bazi.day.tg;
        const wuxing = analyzeWuxing(bazi);
        const strength = judgeDayStrength(bazi);

        let html = '<div class="bazi-chart-table">';
        html += '<div class="bazi-chart-row bazi-chart-header">';
        pillars.forEach(p => html += `<div class="bazi-chart-cell">${p.label}</div>`);
        html += '</div>';

        // 天干行
        html += '<div class="bazi-chart-row">';
        pillars.forEach((p, i) => {
            const tg = TIANGAN[p.gz.tg];
            const wx = WUXING_TG[p.gz.tg];
            const isDay = i === 2;
            html += `<div class="bazi-chart-cell bazi-tg ${isDay ? 'bazi-day-master' : ''}" data-wx="${wx}">${tg}<span class="bazi-wx-tag">${wx}</span></div>`;
        });
        html += '</div>';

        // 地支行
        html += '<div class="bazi-chart-row">';
        pillars.forEach(p => {
            const dz = DIZHI[p.gz.dz];
            const wx = WUXING_DZ[p.gz.dz];
            html += `<div class="bazi-chart-cell bazi-dz" data-wx="${wx}">${dz}<span class="bazi-wx-tag">${wx}</span></div>`;
        });
        html += '</div>';

        // 藏干行
        html += '<div class="bazi-chart-row bazi-canggan-row">';
        pillars.forEach(p => {
            const cgs = CANGGAN[p.gz.dz].join(' ');
            html += `<div class="bazi-chart-cell bazi-canggan">${cgs}</div>`;
        });
        html += '</div>';

        // 十神行
        html += '<div class="bazi-chart-row bazi-shishen-row">';
        pillars.forEach((p, i) => {
            if (i === 2) {
                html += '<div class="bazi-chart-cell bazi-shishen">日主</div>';
            } else {
                const ss = getShiShen(dayTg, p.gz.tg);
                html += `<div class="bazi-chart-cell bazi-shishen">${SHISHEN_NAME[ss]}</div>`;
            }
        });
        html += '</div>';
        html += '</div>';

        // 五行统计
        html += '<div class="bazi-wuxing-summary">';
        html += '<span class="bazi-summary-title">五行：</span>';
        Object.entries(wuxing).forEach(([wx, val]) => {
            const v = Math.round(val * 10) / 10;
            html += `<span class="bazi-wx-item" data-wx="${wx}">${wx} ${v}</span>`;
        });
        html += `<span class="bazi-strength">| 日主 ${TIANGAN[dayTg]}（${WUXING_TG[dayTg]}）· ${strength}</span>`;
        html += '</div>';

        // 基本信息
        const shengxiao = SHENGXIAO[bazi.year.dz];
        html += `<div class="bazi-meta">生肖：${shengxiao} | 性别：${gender === 'male' ? '男' : '女'}</div>`;

        return html;
    }

    // ========== AI 解读 ==========

    function buildBaziPrompt(bazi, gender, focus) {
        const dayTg = bazi.day.tg;
        const wuxing = analyzeWuxing(bazi);
        const strength = judgeDayStrength(bazi);

        const pillarsStr = [
            `年柱：${TIANGAN[bazi.year.tg]}${DIZHI[bazi.year.dz]}`,
            `月柱：${TIANGAN[bazi.month.tg]}${DIZHI[bazi.month.dz]}`,
            `日柱：${TIANGAN[bazi.day.tg]}${DIZHI[bazi.day.dz]}`,
            bazi.hour ? `时柱：${TIANGAN[bazi.hour.tg]}${DIZHI[bazi.hour.dz]}` : '时柱：未知',
        ].join('\n');

        const wuxingStr = Object.entries(wuxing).map(([k, v]) => `${k}:${Math.round(v * 10) / 10}`).join(' ');

        const focusMap = {
            general: '请做综合命盘解读，涵盖性格、事业、财运、感情、健康的概况',
            career: '请重点分析事业发展方向、职业适性、贵人运',
            wealth: '请重点分析财运走向、正财偏财、投资建议',
            love: '请重点分析婚姻感情、姻缘特征、桃花运',
            health: '请重点分析健康注意事项、身体弱点、养生方向',
            year: `请重点分析今年（${new Date().getFullYear()}年）的流年运势`,
        };

        return `你是一位精通八字命理的命理师。请根据以下命盘信息进行专业解读。

## 命盘信息
${pillarsStr}
日主：${TIANGAN[dayTg]}（五行属${WUXING_TG[dayTg]}）
日主强弱：${strength}
五行分布：${wuxingStr}
性别：${gender === 'male' ? '男' : '女'}
生肖：${SHENGXIAO[bazi.year.dz]}

## 分析要求
${focusMap[focus] || focusMap.general}

## 输出格式要求
- 使用简洁明了的中文
- 结构清晰，分点论述
- 用"倾向于""可能""有迹象"等措辞，避免绝对化判断
- 给出具体可行的建议
- 最后加一句简短的寄语
- 不要使用 emoji
- 总长度控制在 400-600 字`;
    }

    async function callAI(systemPrompt, userMsg) {
        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMsg },
            ];

            // 追问时加入历史
            if (state.history.length > 0) {
                const hist = state.history.slice(-6);
                messages.splice(1, 0, ...hist);
            }

            const response = await fetch(AIChat.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: AIChat.MODEL,
                    messages: messages,
                    max_tokens: 1024,
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                console.error('Bazi AI error:', response.status);
                return null;
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        } catch (err) {
            console.error('Bazi AI request failed:', err);
            return null;
        }
    }

    // ========== UI 操作 ==========

    async function analyze() {
        const dateInput = document.getElementById('bazi-date');
        const hourSelect = document.getElementById('bazi-hour');
        const focusSelect = document.getElementById('bazi-focus');

        if (!dateInput.value) {
            alert('请选择出生日期');
            return;
        }

        // 消耗灰烬
        if (typeof GameState !== 'undefined' && GameState.stats.ash < 100) {
            alert('灰烬不足（需要100）');
            return;
        }

        const [year, month, day] = dateInput.value.split('-').map(Number);
        const hourIdx = parseInt(hourSelect.value);
        const focus = focusSelect.value;

        // 扣除灰烬
        if (typeof GameState !== 'undefined') {
            GameState.stats.ash -= 100;
            if (typeof saveGame === 'function') saveGame();
            if (typeof updateResources === 'function') updateResources();
        }

        // 显示 loading
        document.getElementById('bazi-form').classList.add('hidden');
        document.getElementById('bazi-loading').classList.remove('hidden');

        // 排盘
        const bazi = calcBazi(year, month, day, hourIdx);
        state.chartData = bazi;

        // 渲染命盘图表
        const chartHtml = formatChart(bazi, state.gender);
        document.getElementById('bazi-chart').innerHTML = chartHtml;

        // AI 解读
        const prompt = buildBaziPrompt(bazi, state.gender, focus);
        const reading = await callAI(prompt, '请开始解读。');

        // 保存到历史
        state.history = [
            { role: 'assistant', content: reading || '' },
        ];

        // 显示结果
        document.getElementById('bazi-loading').classList.add('hidden');
        document.getElementById('bazi-result').classList.remove('hidden');
        document.getElementById('bazi-reading').innerHTML = formatReading(reading);
    }

    function formatReading(text) {
        if (!text) return '<p class="bazi-error">紫火摇曳不定……命运的信号暂时中断了。请稍后再试。</p>';
        return text
            .split('\n')
            .filter(l => l.trim())
            .map(l => `<p>${l}</p>`)
            .join('');
    }

    function reset() {
        state.chartData = null;
        state.history = [];
        document.getElementById('bazi-result').classList.add('hidden');
        document.getElementById('bazi-followup').classList.add('hidden');
        document.getElementById('bazi-form').classList.remove('hidden');
    }

    function askMore() {
        document.getElementById('bazi-followup').classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('bazi-question').focus();
        }, 100);
    }

    async function sendFollowup() {
        const input = document.getElementById('bazi-question');
        const question = input.value.trim();
        if (!question || !state.chartData) return;

        input.value = '';
        const answerEl = document.getElementById('bazi-followup-answer');
        answerEl.innerHTML = '<p class="bazi-loading-text">思索中……</p>';

        // 构建追问上下文
        state.history.push({ role: 'user', content: question });

        const bazi = state.chartData;
        const prompt = buildBaziPrompt(bazi, state.gender, 'general');
        const answer = await callAI(prompt, question);

        if (answer) {
            state.history.push({ role: 'assistant', content: answer });
        }

        answerEl.innerHTML = formatReading(answer);
    }

    return {
        init,
        setGender,
        analyze,
        reset,
        askMore,
        sendFollowup,
    };
})();

window.BaziModule = BaziModule;
