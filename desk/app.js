const $ = (id) => document.getElementById(id);

const API_ENDPOINT = '/api/desk';
const TOKEN_KEY = 'desk-access-token';
const PREFS_KEY = 'desk-quick-prefs';
const LOCAL_NOTES_KEY = 'desk-local-notes';

const PRESET_HINTS = {
  default: '',
  brief:
    '请用三四段简明说明文快速摸底：（1）这件事具体是什么、准确时间地点与主办规格；（2）核心议题、文件或主要变化；（3）为什么选在这个节点或地点。跳过场面宣传套话。',
  substance:
    '请剥掉公文宣传套话，直接分析这件事背后的实质动因、各方真实诉求、制度或现实约束，以及真正值得留心的信号。',
  concept:
    '请平实准确地讲清这个概念或机制：它解决什么真问题、核心原理是什么、学术或政策语境里最容易混淆的地方在哪里。',
  research:
    '韩博从事土地系统科学、高标准农田与全域土地整治因果评估、自然资源资产组合配置、农产品贸易与远端生物多样性研究。请在如实回答事实后，用一小段点出这件事与上述研究方向有无潜在关联、政策背景素材或数据线索；若无直接关联就直说无须硬扯。',
};

let activePreset = 'default';
let chatMessages = [];
let latestSources = [];
let quickBusy = false;
let cloudReady = true;

function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || '').trim();
}
function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t.trim());
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

function setStatus(text) {
  $('status').textContent = text;
}

/* =========================================================================
   安全轻量 Markdown 渲染（手机读起来比纯文本清楚得多）
   ========================================================================= */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(line) {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    html.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
    para = [];
  };
  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeLists();
      continue;
    }
    const hM = line.match(/^(#{1,3})\s+(.+)$/);
    if (hM) {
      flushPara();
      closeLists();
      html.push(`<h3>${renderInline(hM[2])}</h3>`);
      continue;
    }
    const ulM = line.match(/^[-*•]\s+(.+)$/);
    if (ulM) {
      flushPara();
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${renderInline(ulM[1])}</li>`);
      continue;
    }
    const olM = line.match(/^\d+[.、]\s+(.+)$/);
    if (olM) {
      flushPara();
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${renderInline(olM[1])}</li>`);
      continue;
    }
    closeLists();
    para.push(line);
  }
  flushPara();
  closeLists();
  return html.join('');
}

/* =========================================================================
   一、访问口令校验与锁屏
   ========================================================================= */
function showLock(errMsg = '') {
  $('lockScreen').classList.remove('hidden');
  $('lockErr').textContent = errMsg;
  setTimeout(() => $('lockPwd').focus(), 60);
}
function hideLock() {
  $('lockScreen').classList.add('hidden');
  $('lockErr').textContent = '';
}

async function verifyToken(token, silent = false) {
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desk-token': token },
      body: JSON.stringify({ action: 'verify' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!silent) $('lockErr').textContent = data.error || `验证失败 (${res.status})`;
      return false;
    }
    setToken(token);
    cloudReady = Boolean(data.supabase_ready);
    hideLock();
    await loadNotes($('noteSearch').value);
    return true;
  } catch (err) {
    if (!silent) $('lockErr').textContent = `连接失败：${err.message || err}`;
    return false;
  }
}

$('lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = $('lockPwd').value.trim();
  if (!pwd) return;
  $('lockSubmit').disabled = true;
  $('lockErr').textContent = '验证中…';
  const ok = await verifyToken(pwd, false);
  $('lockSubmit').disabled = false;
  if (ok) {
    $('lockPwd').value = '';
    showToast('已解锁');
  }
});

$('logoutBtn').addEventListener('click', () => {
  clearToken();
  closeDrawer();
  showLock('请输入新的访问口令');
});

/* =========================================================================
   二、移动端抽屉 & 模型偏好
   ========================================================================= */
function openDrawer() {
  $('sideDrawer').classList.add('open');
  $('drawerBackdrop').classList.remove('hidden');
}
function closeDrawer() {
  $('sideDrawer').classList.remove('open');
  $('drawerBackdrop').classList.add('hidden');
}

$('mobileNotesBtn').addEventListener('click', openDrawer);
$('mobileModelPill').addEventListener('click', openDrawer);
$('closeDrawerBtn').addEventListener('click', closeDrawer);
$('drawerBackdrop').addEventListener('click', closeDrawer);

function updatePrefsUI() {
  const m = $('qModel').value;
  const eff = $('qEffort').value;
  const s = $('qSearch').checked;
  $('qMeta').textContent = `${m} · effort=${eff} · ${s ? '实时联网开启' : '纯模型直答'}`;
  $('mobileModelLabel').textContent = m.replace(/^Claude-/, '');
  $('mobileNetTag').textContent = s ? '联网' : '直答';
  $('mobileNetTag').classList.toggle('off', !s);
  localStorage.setItem(PREFS_KEY, JSON.stringify({ model: m, effort: eff, search: s }));
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (p.model && [...$('qModel').options].some((o) => o.value === p.model)) $('qModel').value = p.model;
    if (p.effort) $('qEffort').value = p.effort;
    if (typeof p.search === 'boolean') $('qSearch').checked = p.search;
  } catch (_) {}
  updatePrefsUI();
}

$('qModel').addEventListener('change', () => {
  const m = $('qModel').value;
  if (m.includes('Fable') || m.includes('Astra') || m.includes('Opus')) {
    $('qEffort').value = 'high';
  } else if (m.startsWith('GLM-5')) {
    $('qEffort').value = 'low';
  }
  updatePrefsUI();
});
$('qEffort').addEventListener('change', updatePrefsUI);
$('qSearch').addEventListener('change', updatePrefsUI);

document.querySelectorAll('#presetChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#presetChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activePreset = chip.dataset.preset || 'default';
  });
});

document.querySelectorAll('.example-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('qInput').value = btn.dataset.q || '';
    autoResizeInput();
    sendQuickChat();
  });
});

/* 自动增高输入框 */
function autoResizeInput() {
  const ta = $('qInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}
$('qInput').addEventListener('input', autoResizeInput);

/* =========================================================================
   三、流式速查与追问
   ========================================================================= */
function appendUserBubble(text) {
  $('emptyGuide')?.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  $('chatStream').appendChild(div);
  $('chatStream').scrollTop = $('chatStream').scrollHeight;
}

function createAssistantBubble(modelLabel) {
  $('emptyGuide')?.classList.add('hidden');
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = `${modelLabel} · 准备中…`;

  const srcDetails = document.createElement('details');
  srcDetails.className = 'sources-box hidden';
  const srcSum = document.createElement('summary');
  const srcList = document.createElement('ol');
  srcList.className = 'sources-list';
  srcDetails.append(srcSum, srcList);

  const rsnDetails = document.createElement('details');
  rsnDetails.className = 'reasoning-box hidden';
  const rsnSum = document.createElement('summary');
  rsnSum.textContent = '展开思考过程';
  const rsnBody = document.createElement('div');
  rsnBody.className = 'reasoning-body';
  rsnDetails.append(rsnSum, rsnBody);

  const body = document.createElement('div');
  body.className = 'msg-body';

  const actions = document.createElement('div');
  actions.className = 'msg-actions hidden';

  wrap.append(meta, srcDetails, rsnDetails, body, actions);
  $('chatStream').appendChild(wrap);
  $('chatStream').scrollTop = $('chatStream').scrollHeight;

  return { wrap, meta, srcDetails, srcSum, srcList, rsnDetails, rsnBody, body, actions };
}

function attachAnswerActions(ui, rawText) {
  ui.actions.innerHTML = '';
  const btnCopy = document.createElement('button');
  btnCopy.type = 'button';
  btnCopy.textContent = '复制';
  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      showToast('已复制');
    } catch {
      showToast('复制失败，请长按选字');
    }
  };

  const btnNote = document.createElement('button');
  btnNote.type = 'button';
  btnNote.textContent = '记笔记';
  btnNote.onclick = () => {
    $('noteDrawer').classList.remove('hidden');
    $('userNoteInput').focus();
  };

  const btnFable = document.createElement('button');
  btnFable.type = 'button';
  btnFable.textContent = '换 Fable 深想';
  btnFable.onclick = triggerFableDeep;

  ui.actions.append(btnNote, btnFable, btnCopy);
  ui.actions.classList.remove('hidden');
}

async function sendQuickChat(overrideModel = null, overrideEffort = null) {
  if (quickBusy) return;
  const token = getToken();
  if (!token) {
    showLock();
    return;
  }

  const rawInput = $('qInput').value.trim();
  if (!rawInput && !overrideModel) return;

  if (rawInput) {
    chatMessages.push({ role: 'user', content: rawInput });
    appendUserBubble(rawInput);
    $('qInput').value = '';
    autoResizeInput();
  } else if (!chatMessages.length) {
    showToast('先输入一个问题');
    return;
  }

  const useModel = overrideModel || $('qModel').value;
  const useEffort = overrideEffort || $('qEffort').value;
  const useSearch = $('qSearch').checked;

  quickBusy = true;
  $('qSendBtn').disabled = true;
  $('deepFollowBtn').disabled = true;
  setStatus('速查中…');

  const ui = createAssistantBubble(useModel);
  const t0 = Date.now();
  const timer = setInterval(() => {
    setStatus(`响应中 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }, 300);

  let answerText = '';
  let reasoningText = '';

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desk-token': token },
      body: JSON.stringify({
        action: 'chat',
        model: useModel,
        effort: useEffort,
        web_search: useSearch,
        system_hint: PRESET_HINTS[activePreset] || '',
        messages: chatMessages,
      }),
    });

    if (res.status === 401) {
      clearToken();
      showLock('访问口令已失效，请重新输入');
      throw new Error('口令验证未通过');
    }
    if (!res.ok || !res.body) {
      const errObj = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errObj.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let streamDone = false;

    while (!streamDone) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';

      for (const part of parts) {
        const line = part.split('\n').find((x) => x.startsWith('data: '));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));

        if (ev.type === 'sources') {
          latestSources = ev.sources || [];
          if (latestSources.length) {
            ui.srcDetails.classList.remove('hidden');
            ui.srcSum.textContent = `已实时检索 ${latestSources.length} 条来源（${ev.search_seconds}s）`;
            ui.srcList.innerHTML = '';
            for (const s of latestSources) {
              const li = document.createElement('li');
              const a = document.createElement('a');
              a.href = s.url || '#';
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.textContent = s.title || s.url;
              li.appendChild(a);
              ui.srcList.appendChild(li);
            }
          }
        } else if (ev.type === 'meta') {
          ui.meta.textContent = `${ev.model} · effort=${ev.effort}` + (ev.sources_count ? ` · 联网 ${ev.sources_count} 条` : '');
        } else if (ev.type === 'delta') {
          if (ev.reasoning) {
            reasoningText += ev.reasoning;
            ui.rsnDetails.classList.remove('hidden');
            ui.rsnBody.textContent = reasoningText;
          }
          if (ev.text) {
            answerText += ev.text;
            ui.body.innerHTML = renderMarkdown(answerText);
            $('chatStream').scrollTop = $('chatStream').scrollHeight;
          }
        } else if (ev.type === 'done') {
          ui.meta.textContent += ` · ${ev.chars_out} 字 · ${ev.seconds}s`;
          setStatus(`完成（${ev.seconds}s）`);
          streamDone = true;
          break;
        } else if (ev.type === 'error') {
          throw new Error(ev.error);
        }
      }
    }

    if (answerText.trim()) {
      chatMessages.push({ role: 'assistant', content: answerText });
      attachAnswerActions(ui, answerText);
    }
  } catch (err) {
    ui.body.classList.add('error');
    ui.body.textContent = String(err.message || err);
    setStatus('出错');
  } finally {
    clearInterval(timer);
    quickBusy = false;
    $('qSendBtn').disabled = false;
    $('deepFollowBtn').disabled = false;
  }
}

function triggerFableDeep() {
  if (quickBusy) return;
  if (!chatMessages.length) {
    $('qModel').value = 'Claude-Fable-5.1';
    $('qEffort').value = 'high';
    updatePrefsUI();
    showToast('已切到 Claude-Fable-5.1');
    return;
  }
  const lastRole = chatMessages[chatMessages.length - 1].role;
  if (lastRole === 'assistant') {
    chatMessages.push({
      role: 'user',
      content: '请基于上面的事实，换更深一层的视角，剖析这件事背后的结构性逻辑、潜在转折与值得长期观察的指标。',
    });
    appendUserBubble('↻ 换 Claude-Fable-5.1 深入剖析一层');
  }
  sendQuickChat('Claude-Fable-5.1', 'high');
}

$('qSendBtn').addEventListener('click', () => sendQuickChat());
$('deepFollowBtn').addEventListener('click', triggerFableDeep);
$('qInput').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    sendQuickChat();
  }
});

$('clearChatBtn').addEventListener('click', () => {
  chatMessages = [];
  latestSources = [];
  $('chatStream').innerHTML = '';
  const guide = document.createElement('div');
  guide.className = 'empty-guide';
  guide.id = 'emptyGuide';
  guide.innerHTML = `<div class="guide-seal">案</div><p class="guide-title">已清空，随时问下一题。</p>`;
  $('chatStream').appendChild(guide);
  $('noteDrawer').classList.add('hidden');
  setStatus('待命');
  $('qInput').focus();
});

/* =========================================================================
   四、一键记笔记（云端 Supabase + 本地兜底）
   ========================================================================= */
function loadLocalNotes() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_NOTES_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveLocalNote(record) {
  const list = loadLocalNotes().filter((n) => n.id !== record.id);
  list.unshift(record);
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(list.slice(0, 80)));
}

$('openNoteBoxBtn').addEventListener('click', () => {
  if (!chatMessages.length) {
    showToast('先问一句再记笔记');
    return;
  }
  $('noteDrawer').classList.toggle('hidden');
  if (!$('noteDrawer').classList.contains('hidden')) {
    $('userNoteInput').focus();
  }
});
$('closeNoteBoxBtn').addEventListener('click', () => $('noteDrawer').classList.add('hidden'));

async function saveNote(mode) {
  if (!chatMessages.length) {
    showToast('还没有可保存的问答');
    return;
  }
  const token = getToken();
  if (!token) { showLock(); return; }

  $('saveDistillBtn').disabled = true;
  $('saveRawBtn').disabled = true;
  setStatus(mode === 'distill' ? '提炼留底中…' : '保存中…');

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desk-token': token },
      body: JSON.stringify({
        action: 'note_save',
        mode,
        user_note: $('userNoteInput').value.trim(),
        messages: chatMessages,
        sources: latestSources,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');

    saveLocalNote(data.record);
    $('userNoteInput').value = '';
    $('noteDrawer').classList.add('hidden');

    if (data.cloud_saved) {
      cloudReady = true;
      showToast(`已云端留底：${data.record.title}`);
      setStatus('已云端留底');
    } else {
      cloudReady = false;
      showToast(`已暂存本机浏览器：${data.record.title}`);
      setStatus('暂存本机（待建云表）');
    }
    await loadNotes($('noteSearch').value);
  } catch (err) {
    showToast(`记笔记失败：${err.message || err}`);
    setStatus('保存失败');
  } finally {
    $('saveDistillBtn').disabled = false;
    $('saveRawBtn').disabled = false;
  }
}

$('saveDistillBtn').addEventListener('click', () => saveNote('distill'));
$('saveRawBtn').addEventListener('click', () => saveNote('raw'));
$('userNoteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveNote('distill');
  }
});

async function deleteNote(id) {
  const token = getToken();
  if (!confirm('确认删除这条留底笔记吗？')) return;
  const kept = loadLocalNotes().filter((n) => n.id !== id);
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(kept));
  if (token && cloudReady) {
    await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desk-token': token },
      body: JSON.stringify({ action: 'note_delete', id }),
    }).catch(() => {});
  }
  showToast('已删除');
  await loadNotes($('noteSearch').value);
}

async function loadNotes(query = '') {
  const token = getToken();
  const box = $('notesList');
  let notes = [];

  if (token) {
    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-desk-token': token },
        body: JSON.stringify({ action: 'notes_list', query }),
      });
      if (res.ok) {
        const data = await res.json();
        cloudReady = Boolean(data.supabase_ready);
        if (cloudReady) {
          notes = data.notes || [];
          if (!query) localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
        }
      }
    } catch (_) {}
  }

  const hint = $('syncHint');
  if (!cloudReady) {
    hint.classList.remove('hidden');
    hint.textContent = '云端留底表尚未初始化（在 Supabase 跑一次 supabase-desk.sql 即可多端同步）；当前先显示本机暂存。';
    const q = query.trim().toLowerCase();
    notes = loadLocalNotes().filter((n) => !q || JSON.stringify(n).toLowerCase().includes(q));
  } else {
    hint.classList.add('hidden');
  }

  $('notesCount').textContent = `${notes.length} 条`;
  $('mobileNotesBadge').textContent = String(notes.length);
  box.innerHTML = '';

  if (!notes.length) {
    box.innerHTML = `<div class="q-meta">还没有留底记录。有用的问答点「记笔记」就会出现在这里。</div>`;
    return;
  }

  for (const n of notes) {
    const card = document.createElement('div');
    card.className = 'note-card';
    const tagsHtml = (n.tags || []).map((t) => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('');
    const bulletsHtml = (n.bullets || []).length
      ? `<ul>${n.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
      : `<div style="white-space:pre-wrap">${escapeHtml((n.raw_body || '').slice(0, 180))}</div>`;
    const userNoteHtml = n.user_note ? `<div class="note-card-note">批注：${escapeHtml(n.user_note)}</div>` : '';

    card.innerHTML = `
      <div class="note-card-top">
        <div class="note-card-head">${escapeHtml(n.title)}</div>
        <button type="button" class="note-del" title="删除">×</button>
      </div>
      <div class="note-card-meta">${escapeHtml(n.timestamp || '')} ${tagsHtml}</div>
      ${userNoteHtml}
      ${bulletsHtml}
    `;
    card.querySelector('.note-card-head').addEventListener('click', () => {
      $('qInput').value = `结合我之前留底的「${n.title}」，继续聊聊：`;
      closeDrawer();
      autoResizeInput();
      $('qInput').focus();
    });
    card.querySelector('.note-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(n.id);
    });
    box.appendChild(card);
  }
}

let searchTimer = null;
$('noteSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadNotes($('noteSearch').value), 220);
});

/* =========================================================================
   五、启动初始化 & 注册 Service Worker
   ========================================================================= */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/desk/sw.js', { scope: '/desk/' }).catch(() => {});
}

loadPrefs();
const savedToken = getToken();
if (!savedToken) {
  showLock();
} else {
  verifyToken(savedToken, true).then((ok) => {
    if (!ok) showLock('访问口令已变更，请重新输入');
  });
}
