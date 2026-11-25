import { DEFAULT_SETTINGS, THEMES, loadSettings, matchRules, normalizeBrand, saveSettings } from './settings.mjs?v=2.9.1';
import { configured, createLive, liveNow, liveSnapshot, publishLive, stopLive, validLiveId, watchLive } from './live.mjs?v=2.9.1';
import { archiveMatch, moveRound, readArchive, writeArchive } from './archive.mjs?v=2.9.1';
import { openKabru, renderWatchedKabru } from './kabru.mjs?v=2.8.3';
import { latinDigits, TYPES, HIND_ZAT, jokerLimit, FAILED_DECLARATIONS, jokerCapacity, hasLoserDeclaration, declaredJokers, roundLimit, allowsKhalasa, allowsDown, allowsPenalty, matchConfig, STORAGE_KEY, loadMatch, saveMatch, recommendationText, scoreGaps, scoreRound, standings, recordRound, removeRound } from './scoring.mjs?v=2.9.1';

const app = document.querySelector('#app');
const reset = document.querySelector('#reset');
const viewId = new URLSearchParams(location.hash.slice(1)).get('live');
const watching = viewId !== null;
const livePanel = document.querySelector('#live-panel');
const liveStatus = document.querySelector('#live-status');
const liveLink = document.querySelector('#live-link');
const liveStart = document.querySelector('#live-start');
const liveWhatsApp = document.querySelector('#live-whatsapp');
const liveRename = document.querySelector('#live-rename');
const liveNamesDialog = document.querySelector('#live-names-dialog');
const liveStop = document.querySelector('#live-stop');
const legacyLiveKey = 'hind-calculator.live.';
const liveKey = legacyLiveKey + 'session';
const memberHistoryKey = 'hind-calculator.member-history';
const notice = document.querySelector('#notice');
const archiveDialog = document.querySelector('#archive-dialog');
const archiveButton = document.querySelector('#archive-open');
const archiveContent = document.querySelector('#archive-content');
const dateFormat = new Intl.DateTimeFormat('ar', {
  numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short',
});
let selectedArchive = null;
let pendingArchiveDelete = null;
const number = new Intl.NumberFormat('ar', { numberingSystem: 'latn', maximumFractionDigits: 12 });
const teams = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث'];
const players = ['اللاعب الأول', 'اللاعب الثاني', 'اللاعب الثالث', 'اللاعب الرابع', 'اللاعب الخامس'];
const setupOptions = {
  teams: [[2, 'فريقين'], [3, 'ثلاثة أفرقة']],
  solo: [[3, 'ثلاثة لاعبين'], [4, 'أربعة لاعبين'], [5, 'خمسة لاعبين']],
};
const suits = ['♠', '♣', '♥', '♦', '♠'];
const positions = () => match.names.map((_, index) => index);
const solo = () => match.mode === 'solo';
const pencil = (index, round) => `<button type="button" class="pencil" data-manual="${index}"
  ${round === undefined ? '' : `data-round="${round}"`}
  aria-label="تعديل نقاط ${escape(match.names[index])}"><span aria-hidden="true">✎</span></button>`;
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const display = value => `<bdi class="points ${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${number.format(value)}</bdi>`;
const blank = () => ({ winner: null, type: null, penalty: null, down: match ? positions().map(() => []) : [], failed: [], overrides: [] });

let storage;
try { storage = window.localStorage; } catch {}
let settings = loadSettings(storage);
let match = watching ? null : loadMatch(storage);
let editing = match?.pending?.editing ?? null;
let draft = match?.pending?.draft ?? blank();
let manualIndex = match?.pending?.manualIndex ?? null;
let setupMode = '';
let setupCount = 0;
let setupNames = [];
let setupMembers = [];
let noticeTimer;
let sharedId;
let liveBusy = false;
let sharingOpen = false;
let liveMessage = '';
let liveKabru;
let publishVersion = 0;

function restoreSharing() {
  try {
    const id = storage?.getItem(liveKey);
    if (validLiveId(id)) {
      sharedId = id;
    } else if (match) {
      const key = legacyLiveKey + match.id;
      const legacyId = storage?.getItem(key);
      if (validLiveId(legacyId)) {
        sharedId = legacyId;
        storage.setItem(liveKey, legacyId);
        storage.removeItem(key);
      }
    }
  } catch {}
}

function renderSharing() {
  livePanel.hidden = !watching && !sharingOpen;
  liveStatus.textContent = liveMessage;
  liveStart.hidden = watching || (!match && !sharedId);
  liveStart.setAttribute('aria-expanded', String(sharingOpen));
  liveRename.hidden = !match || !sharedId;
  liveStop.hidden = !sharedId;
  liveRename.disabled = liveStop.disabled = liveBusy;
  liveWhatsApp.hidden = !sharedId;
  liveLink.hidden = !sharedId;
  if (sharedId) {
    const url = new URL(location.pathname, location.origin);
    url.hash = 'live=' + sharedId;
    liveLink.value = url.href;
    liveWhatsApp.href = 'https://wa.me/?text=' + encodeURIComponent('شاهد قيد المباراة مباشرة: ' + url.href);
  } else {
    liveLink.value = '';
    liveWhatsApp.removeAttribute('href');
  }
}

function syncSharing() {
  if (!sharedId || !match || liveBusy) return;
  const version = ++publishVersion;
  const id = sharedId;
  liveMessage = 'جارٍ مزامنة القيد…';
  renderSharing();
  publishLive(id, JSON.stringify(liveSnapshot(match, liveKabru, settings))).then(() => {
    if (version !== publishVersion || sharedId !== id || liveBusy) return;
    liveMessage = 'المشاركة المباشرة مفعّلة.';
    renderSharing();
  }).catch(() => {
    if (version !== publishVersion || sharedId !== id || liveBusy) return;
    liveMessage = 'تعذّرت المزامنة. أعد فتح الحاسبة من متصفح صاحب المباراة أو أوقف المشاركة وحاول مجدداً.';
    renderSharing();
  });
}

liveStart.addEventListener('click', async () => {
  if (watching || (!match && !sharedId)) return;
  sharingOpen = !sharingOpen;
  renderSharing();
  if (!sharingOpen || sharedId || liveBusy) return;
  if (!configured) {
    liveMessage = 'المشاركة المباشرة بانتظار إعداد الخدمة.';
    renderSharing();
    return;
  }
  liveBusy = true;
  liveMessage = 'جارٍ إنشاء رابط المشاركة…';
  renderSharing();
  const id = crypto.randomUUID().replaceAll('-', '');
  try {
    storage.setItem(liveKey, id);
    await createLive(id, JSON.stringify(liveSnapshot(match, undefined, settings)));
    sharedId = id;
  } catch {
    try { storage.removeItem(liveKey); } catch {}
    liveMessage = 'تعذّر بدء المشاركة. تحقّق من الاتصال وحاول مجدداً.';
  } finally {
    liveBusy = false;
    renderSharing();
  }
  if (sharedId) syncSharing();
});

async function endSharing() {
  if (liveBusy) return false;
  if (!sharedId) return true;
  liveBusy = true;
  liveMessage = 'جارٍ إيقاف المشاركة…';
  renderSharing();
  try {
    await stopLive(sharedId);
    try { storage.removeItem(liveKey); } catch {}
    sharedId = undefined;
    liveMessage = 'توقفت المشاركة المباشرة.';
    return true;
  } catch {
    liveMessage = 'تعذّر إيقاف المشاركة. تحقّق من الاتصال وحاول مجدداً.';
    return false;
  } finally {
    liveBusy = false;
    renderSharing();
  }
}

liveStop.addEventListener('click', endSharing);
liveLink.addEventListener('click', () => liveLink.select());
liveRename.addEventListener('click', () => {
  if (watching || !match) return;
  const labels = (solo() ? players : teams).slice(0, match.names.length);
  document.querySelector('#live-name-fields').innerHTML = nameFields(labels, match.names);
  liveNamesDialog.showModal();
});
document.querySelector('#live-cancel-names').addEventListener('click', () => liveNamesDialog.close());
document.querySelector('#live-names-form').addEventListener('submit', event => {
  event.preventDefault();
  if (watching || !match || !liveNamesDialog.open) return;
  const inputs = [...event.currentTarget.querySelectorAll('[name^="participant-"]')];
  const names = inputs.length ? inputs.map(input => input.value.trim()) : match.names;
  if (names.some(name => !name || name.length > 40)) {
    announce('أدخل اسماً لكل مشارك.');
    return;
  }
  liveNamesDialog.close();
  persist({ ...match, names });
  render();
});


function announce(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 4500);
}

function persist(next) {
  const previous = match;
  match = next;
  let archivedSuccessfully = true;
  try {
    if (next && (next.endedAt == null || previous?.rounds !== next.rounds || previous?.names !== next.names) && matchStandings().complete) {
      const entries = readArchive(storage);
      const archived = archiveMatch(entries, next);
      if (archived.entries !== entries) {
        writeArchive(storage, archived.entries);
      }
      match = archived.match;
    }
  } catch {
    archivedSuccessfully = false;
    announce('تعذّر حفظ المباراة في السجل.');
  }
  if (match && (match.rounds !== previous?.rounds || match.names !== previous?.names
      || match.members !== previous?.members)) syncSharing();
  try {
    if (match) saveMatch(storage, match);
    else storage.removeItem(STORAGE_KEY);
    return archivedSuccessfully;
  } catch {
    announce('تعذر الحفظ في هذا المتصفح. تبقى التغييرات في الصفحة الحالية.');
    return false;
  }
}

function rememberDraft() {
  persist({ ...match, pending: { draft, editing, manualIndex } });
}

function draftAllowsDown() {
  const index = editing ?? match.rounds.length;
  const rounds = match.rounds.slice();
  rounds[index] = draft;
  return allowsDown(index, roundLimit(rounds, matchConfig(match)));
}

function matchStandings(rounds = match.rounds) {
  return standings(rounds, matchConfig(match));
}

function withDraft() {
  return recordRound(match.rounds, draft, editing ?? match.rounds.length, matchConfig(match));
}

function recommendations(totals, gaps) {
  if (!gaps) return '';
  const leader = totals.indexOf(Math.min(...totals));
  let namedLeader = false;
  return gaps.map((entry, team) => {
    if (entry.gap === 0) return '';
    const { advice, chase } = recommendationText(match.names, entry, matchConfig(match),
      namedLeader ? undefined : leader);
    if (chase) namedLeader = true;
    const chaseText = chase ? ` <span class="score-advice-chase">${escape(chase)}</span>` : '';
    return `<div>يا ${escape(match.names[team])}، ${escape(advice)}${chaseText}</div>`;
  }).join('');
}

function cards(totals, winners = [], ranked = false) {
  const labels = ['المتصدر', 'الثاني', 'الخباص'];
  return `<div class="scores ${totals.length === 5 ? 'five-scores' : ''} ${ranked ? 'scores-ranked' : ''}" style="--participants: ${totals.length}">${totals.map((total, team) => {
    const rank = ranked ? totals.filter(points => points < total).length : -1;
    return `
    <div class="score-card ${winners.includes(team) || rank === 0 ? 'leading' : ''}">
      ${match.members?.[team]?.some(Boolean)
        ? `<details class="score-members"><summary><h3>${escape(match.names[team])}</h3></summary>
          <span>${match.members[team].filter(Boolean).map(escape).join('، ')}</span></details>`
        : `<h3>${escape(match.names[team])}</h3>`}
      ${ranked ? `<span class="score-rank">${labels[rank]}</span>` : ''}
      <b>${display(total)}</b>
    </div>`;
  }).join('')}</div>`;
}

function scoreHeader(totals, played, limit, gaps, owner = false) {
  const advice = recommendations(totals, gaps);
  const progress = `<span class="progress">${number.format(Math.min(played, limit))} من ${number.format(limit)} لعبات</span>`;
  return `<div class="score-title ${advice ? 'score-title-with-advice' : ''}">
    <h2 id="score-title"${owner ? ' tabindex="-1"' : ''}>مجموع النقاط</h2>
    ${progress}
    <div class="score-advice" title="محاكاة دون نزول أو إعلان فاشل" ${advice ? '' : 'hidden'}>${advice}</div>
  </div>`;
}

function resultsTable(names, totals, rows, title) {
  return `<table class="${names.length === 5 ? 'five-columns' : ''}" aria-labelledby="${title}"><thead><tr><th scope="col">اللعبة</th>
      ${names.map(name => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><th scope="row">المجموع</th>
      ${totals.map(total => `<td>${display(total)}</td>`).join('')}</tr></tfoot></table>`;
}

function history(limit, totals) {
  const overflow = match.rounds.length > limit;
  const rows = Array.from({ length: Math.max(limit, match.rounds.length) }, (_, index) => {
    const round = match.rounds[index];
    const scores = round ? scoreRound(round, matchConfig(match), allowsDown(index, roundLimit(match.rounds, matchConfig(match)))).map(display) : positions().map(() => '—');
    return `<tr class="${round ? 'recorded-row ' : ''}${index === match.rounds.length || index === editing ? 'current-row' : ''}">
      <th scope="row">${number.format(index + 1)}${round?.type === HIND_ZAT ? ' <small>هند زات</small>' : ''}</th>${scores.map((score, team) => `<td${round ? ' class="recorded-cell"' : ''}>${round ? `<div class="recorded-score">${score}${round.type === HIND_ZAT ? '' : pencil(team, index)}</div>` : score}</td>`).join('')}
    </tr>${round ? `<tr class="row-actions"><td colspan="${match.names.length + 1}">
      ${index >= limit ? '<span class="subtle">معلّقة</span>' : ''}
      <button type="button" data-edit="${index}" aria-label="تعديل اللعبة ${number.format(index + 1)}">تعديل</button>
      <button type="button" class="delete" data-delete="${index}" aria-label="حذف اللعبة ${number.format(index + 1)}">حذف</button>
    </td></tr>` : ''}`;
  }).join('');
  return `<section class="panel history-panel" aria-labelledby="history-title">
    <div class="panel-heading"><h2 id="history-title"><span class="history-icon" aria-hidden="true">▤</span> سجل اللعبات</h2>
      <div class="history-controls">
        <button class="secondary" type="button" id="undo" ${match.rounds.length ? '' : 'disabled'}>↶ تراجع</button>
        <button class="secondary" type="button" id="redo" ${match.redo?.length ? '' : 'disabled'}>↷ إعادة</button>
      </div></div>
    ${resultsTable(match.names, totals, rows, 'history-title')}
    ${overflow ? '<p class="subtle history-note">اللعبات المعلّقة محفوظة خارج المجموع. تعود إلى الحساب إذا امتدت المباراة مجدداً.</p>' : ''}
  </section>`;
}

function editor() {
  const showKhalasa = allowsKhalasa(match.rounds, editing ?? match.rounds.length, matchConfig(match));
  const maxJokers = jokerLimit(matchConfig(match));
  return `<section class="panel" aria-labelledby="round-title">
    <div class="panel-heading"><h2 id="round-title" tabindex="-1">${editing === null ? 'تسجيل اللعبة' : 'تعديل اللعبة'} ${number.format((editing ?? match.rounds.length) + 1)}</h2></div>
    <form id="round-form" novalidate>
      <div class="teams">${match.names.map((name, team) => `
        <div class="team" id="team-${team}">
          <label for="win-${team}"><span class="team-suit" aria-hidden="true">${suits[team]}</span><span>${escape(name)}</span></label>
          <select id="win-${team}" data-win="${team}" aria-label="نوع الفوز · ${escape(name)}">
            <option value="">اختر نوع الفوز</option>
            ${TYPES.map(({ label, jokers }, type) => (type === 0 && !showKhalasa) || jokers > maxJokers || (type === HIND_ZAT && editing !== null && editing >= matchStandings().limit) ? '' : `<option value="${type}" ${draft.winner === team && draft.type === type ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <div class="team-fields" id="fields-${team}"></div>
        </div>`).join('')}</div>
      <div class="round-field" id="winner-joker"></div>
      <div class="round-field penalty" id="penalty"></div>
      <div class="preview" id="preview" aria-live="polite"></div>
      <div id="manual-editor"></div>
      <p class="error" id="round-error" role="alert" hidden></p>
      <div class="controls">
        <button class="primary" id="approve" type="submit" disabled>${editing === null ? 'اعتماد اللعبة' : 'حفظ التعديل'}</button>
        ${editing === null ? '' : '<button class="secondary" id="cancel" type="button">إلغاء التعديل</button>'}
      </div>
    </form>
  </section>`;
}

function renderHands(team) {
  document.querySelector(`#hands-${team}`).innerHTML = draft.down[team].map((value, player) => {
    const label = solo() ? 'نقاط الورق المتبقي' : draft.down[team].length === 1 ? 'نقاط ورق اللاعب النازل' : `نقاط ورق اللاعب ${['الأول', 'الثاني'][player]}`;
    return `<label>${label}
      <input type="text" inputmode="decimal" autocomplete="off" maxlength="16" dir="auto"
        data-team="${team}" data-player="${player}" value="${escape(latinDigits(value))}" required>
    </label>`;
  }).join('');
}

function fitDeclarations() {
  const capacity = jokerCapacity(draft, matchConfig(match));
  if (capacity === null || !draft.failed) return;
  let remaining = capacity;
  draft.failed = draft.failed.map((value, index) => {
    const declaration = FAILED_DECLARATIONS[value];
    if (index === draft.winner || capacity === 0 || !declaration || declaration.jokers > remaining) return null;
    remaining -= declaration.jokers;
    return value;
  });
}

function declarationCapacity() {
  return jokerCapacity(draft, matchConfig(match)) ?? (TYPES[draft.type]?.jokers === null ? jokerLimit(matchConfig(match)) : 0);
}

function renderDeclarationOptions() {
  const capacity = declarationCapacity();
  document.querySelectorAll('[data-failed]').forEach(select => {
    const team = Number(select.dataset.failed);
    const remaining = capacity - declaredJokers(draft, team);
    const selected = draft.failed?.[team];
    select.innerHTML = `<option value="">بدون إعلان</option>${FAILED_DECLARATIONS.map(({ label, jokers, units }, index) => {
      const unavailable = jokers > remaining;
      if (unavailable && selected !== index) return '';
      return `<option value="${index}" ${unavailable ? 'disabled' : ''}>${label} (+${number.format(units * (solo() ? 100 : 200))})</option>`;
    }).join('')}`;
    select.value = selected ?? '';
  });
}

function renderWinnerJoker() {
  const field = document.querySelector('#winner-joker');
  field.hidden = TYPES[draft.type]?.jokers !== null || !hasLoserDeclaration(draft);
  field.innerHTML = field.hidden ? '' : `<label for="joker-count">الهند بـ</label>
    <select id="joker-count">
      <option value="">اختر جيكر أو لون</option>
      <option value="1" ${draft.jokerCount === 1 ? 'selected' : ''}>جيكر</option>
      <option value="0" ${draft.jokerCount === 0 ? 'selected' : ''}>لون</option>
    </select>`;
}

function renderFields() {
  const downAllowed = draft.type !== HIND_ZAT && draftAllowsDown();
  const showDeclarations = declarationCapacity() > 0;
  positions().forEach(team => {
    document.querySelector(`#team-${team}`).classList.toggle('selected', draft.winner === team);
    const fields = document.querySelector(`#fields-${team}`);
    if (draft.winner === null || draft.winner === team || draft.type === HIND_ZAT) {
      fields.innerHTML = '';
      return;
    }
    fields.innerHTML = `${downAllowed ? `<div class="round-field">
      <label for="down-${team}">النزول</label>
      <select id="down-${team}" data-down="${team}" aria-label="النزول · ${escape(match.names[team])}">
        ${(solo() ? ['غير نازل', 'نازل'] : ['لا يوجد نزول', 'لاعب واحد نازل', 'اللاعبان نازلان']).map((label, count) =>
          `<option value="${count}" ${draft.down[team].length === count ? 'selected' : ''}>${label}</option>`).join('')}
      </select></div>` : ''}
      ${showDeclarations ? `<div class="round-field">
        <label for="failed-${team}">إعلان</label>
        <select id="failed-${team}" data-failed="${team}"></select>
      </div>` : ''}
      ${downAllowed ? `<div class="hand-inputs" id="hands-${team}"></div>` : ''}`.trim();
    if (downAllowed) renderHands(team);
  });
  renderDeclarationOptions();
  renderWinnerJoker();
  const penalty = document.querySelector('#penalty');
  penalty.hidden = !draft.type || draft.type === HIND_ZAT || !allowsPenalty(matchConfig(match));
  penalty.innerHTML = penalty.hidden ? '' : `<label for="penalty-team">الشرهة</label>
    <select id="penalty-team"><option value="">بدون شرهة</option>
    ${positions().filter(team => team !== draft.winner).map(team =>
      `<option value="${team}" ${draft.penalty === team ? 'selected' : ''}>${escape(match.names[team])}</option>`).join('')}</select>
    <button type="button" class="kabru-gold" id="kabru-open" ${draft.kabruDrawn ? 'disabled' : ''}>كابروا</button>`;
  updatePreview();
}

function renderManual() {
  const container = document.querySelector('#manual-editor');
  container.innerHTML = manualIndex === null || draft.winner === null || draft.type === HIND_ZAT ? '' : `
    <div class="manual-controls">
      <label for="manual-value">تعديل نقاط ${escape(match.names[manualIndex])}
        <input id="manual-value" type="text" dir="auto" autocomplete="off"
          value="${escape(latinDigits(draft.overrides?.[manualIndex]))}">
      </label>
      <button type="button" class="secondary" id="restore-score">استعادة الحسبة التلقائية</button>
    </div>`;
}

function updatePreview() {
  const preview = document.querySelector('#preview');
  const error = document.querySelector('#round-error');
  const approve = document.querySelector('#approve');
  const scoreboard = document.querySelector('.scoreboard');
  const title = document.querySelector('#score-title');
  error.hidden = true;
  approve.disabled = true;
  title.textContent = 'مجموع النقاط';
  const config = matchConfig(match);
  const current = matchStandings();
  const ranked = config.mode === 'teams' && config.count === 3;
  const updateBoard = (totals, gaps) => {
    const advice = recommendations(totals, gaps);
    const notes = scoreboard.querySelector('.score-advice');
    notes.innerHTML = advice;
    notes.hidden = !advice;
    notes.parentElement.classList.toggle('score-title-with-advice', Boolean(advice));
    scoreboard.querySelector('.scores').outerHTML = cards(totals, [], ranked);
  };
  updateBoard(current.totals, scoreGaps(match.rounds, config, current));
  if (draft.winner === null) {
    preview.innerHTML = '<p class="subtle">اختر نوع الفوز تحت اسم الفائز لمعاينة النقاط.</p>';
    return;
  }
  try {
    const rounds = withDraft();
    if (draft.type === HIND_ZAT) {
      preview.innerHTML = '<p class="subtle">تنتهي المباراة بفوز صاحب هند زات دون إضافة نقاط.</p>';
      approve.disabled = false;
      return;
    }
    const projected = matchStandings(rounds);
    const index = editing ?? match.rounds.length;
    const scores = scoreRound(rounds[index], matchConfig(match), allowsDown(index, roundLimit(rounds, matchConfig(match))));
    preview.innerHTML = `<div class="preview-scores" style="--participants: ${scores.length}">${scores.map((score, team) =>
      `<div>${escape(match.names[team])}<b>${display(score)}</b>${pencil(team)}</div>`).join('')}</div>`;
    if (editing !== null || draft.overrides?.some(value => value != null)) {
      title.textContent = 'مجموع النقاط المتوقع';
      updateBoard(projected.totals, scoreGaps(rounds, config, projected));
    }
    const field = document.querySelector('#manual-value');
    if (field) field.placeholder = number.format(scores[manualIndex]);
    approve.disabled = false;
  } catch (problem) {
    preview.innerHTML = '<p class="subtle">أكمل بيانات اللعبة لمعاينة النقاط.</p>';
    error.textContent = problem.message;
    error.hidden = false;
  }
}

function memberHistory() {
  let stored;
  try { stored = JSON.parse(storage?.getItem(memberHistoryKey)); } catch {}
  const names = Array.isArray(stored) ? stored.filter(name => typeof name === 'string' && name.length <= 40) : [];
  return [...new Set([...names, ...(match?.members?.flat() ?? [])].filter(Boolean))];
}

function rememberMembers(next) {
  const names = [...new Set([...memberHistory(), ...(next?.members?.flat() ?? [])].filter(Boolean))];
  if (!names.length) return;
  try {
    storage.setItem(memberHistoryKey, JSON.stringify(names));
  } catch {
    announce('تعذّر حفظ قائمة أسماء الأعضاء السابقة.');
  }
}

function rematchMembers(names) {
  return names.map((name, index) => `<details class="rematch-members">
    <summary>${escape(name)}</summary>
    <label><input type="radio" name="members-choice-${index}" value="keep" checked> الإبقاء على نفس الأعضاء</label>
    <label><input type="radio" name="members-choice-${index}" value="change"> تغيير أعضاء الفريق</label>
    ${memberFields(name, index, match.members, true)}
  </details>`).join('');
}

function memberFields(label, index, members, choosing = false) {
  return `<fieldset class="member-fields" ${choosing ? 'hidden disabled' : ''}><legend>أعضاء ${escape(label)} · اختياري</legend>
    ${[0, 1].map(seat => `<label>العضو ${seat + 1}<input name="member-${index}-${seat}" ${choosing ? 'list="previous-members"' : ''} value="${escape(members?.[index]?.[seat] ?? '')}" maxlength="40" dir="auto"></label>`).join('')}
  </fieldset>`;
}

function readMembers(form, count, previous) {
  const data = new FormData(form);
  const members = Array.from({ length: count }, (_, index) =>
    data.get(`members-choice-${index}`) === 'keep' ? previous?.[index] ?? ['', ''] : [0, 1].map(seat => String(data.get(`member-${index}-${seat}`) ?? '').trim()));
  return members.some(team => team.some(Boolean)) ? members : undefined;
}

function nameFields(labels, names, members) {
  return labels.map((label, index) =>
    `<label>${label}<input name="participant-${index}" placeholder="${label}" value="${escape(names[index] ?? '')}" maxlength="40" dir="auto" required></label>
    ${members ? memberFields(label, index, members) : ''}`).join('');
}

function rematchControls() {
  const labels = (solo() ? players : teams).slice(0, match.names.length);
  return `<div class="rematch">
    <div class="match-actions"><button class="primary" type="button" id="rematch" aria-controls="rematch-form" aria-expanded="false">إعادة المباراة</button></div>
    <form id="rematch-form" aria-label="إعادة المباراة" hidden>
      ${nameFields(labels, match.names)}
      ${solo() ? '' : `${rematchMembers(match.names)}
        <datalist id="previous-members">${memberHistory().map(name => `<option value="${escape(name)}"></option>`).join('')}</datalist>`}
      <div class="controls">
        <button class="primary" type="submit">تأكيد إعادة المباراة</button>
        <button class="secondary" type="button" id="cancel-rematch">إلغاء</button>
      </div>
    </form>
  </div>`;
}

function showRematch(show) {
  const form = document.querySelector('#rematch-form');
  const button = document.querySelector('#rematch');
  if (!show) {
    form.reset();
    form.querySelectorAll('.rematch-members').forEach(menu => {
      menu.open = false;
      const fields = menu.querySelector('fieldset');
      fields.hidden = fields.disabled = true;
    });
    form.querySelectorAll('input').forEach(input => input.setCustomValidity(''));
  }
  form.hidden = !show;
  button.setAttribute('aria-expanded', String(show));
  (show ? form.querySelector('input') : button).focus();
}

function renderSetupFields() {
  const options = setupOptions[setupMode];
  const count = document.querySelector('#setup-count');
  count.innerHTML = `<option value="">اختر العدد</option>${(options ?? []).map(([value, label]) =>
    `<option value="${value}" ${value === setupCount ? 'selected' : ''}>${label}</option>`).join('')}`;
  count.parentElement.hidden = !options;
  count.disabled = !options;
  const labels = setupMode === 'solo' ? players : teams;
  document.querySelector('#setup-names').innerHTML = nameFields(labels.slice(0, setupCount), setupNames, setupMode === 'teams' ? setupMembers : undefined);
  const jokerSelect = document.querySelector('#setup-jokers');
  const chooseJokers = setupMode === 'teams' && setupCount === 2;
  jokerSelect.parentElement.hidden = !chooseJokers;
  jokerSelect.disabled = !chooseJokers;
  jokerSelect.value = String(settings.jokers);
  document.querySelector('#start-match').hidden = !setupCount;
}

function render() {
  app.before(livePanel, liveStart);
  liveStart.hidden = true;
  renderSharing();
  reset.hidden = !match;
  if (!match) {
    app.innerHTML = `<section class="panel setup">
      <div class="suits" aria-hidden="true">♠ ♥ ♣ ♦</div>
      <h2>ابدأ مباراة</h2>
      <form id="setup-form">
        <label>نظام اللعب<select id="setup-mode" required>
          <option value="">اختر نظام اللعب</option>
          <option value="teams">أفرقة</option>
          <option value="solo">فردي</option>
        </select></label>
        <label hidden>عدد المشاركين<select id="setup-count" required disabled></select></label>
        <label hidden>لعبكم جيكرين أو ثلاث جياكر؟
          <select id="setup-jokers" required disabled>
            <option value="">اختر عدد الجياكر</option>
            <option value="2">جيكرين</option>
            <option value="3">ثلاث جياكر</option>
          </select>
        </label>
        <div id="setup-names"></div>
        <button class="primary" id="start-match" type="submit" hidden>بدء المباراة</button>
      </form>
    </section>`;
    document.querySelector('#setup-mode').value = setupMode;
    renderSetupFields();
    return;
  }
  const current = matchStandings();
  const { limit, totals, complete, winners, reason } = current;
  app.innerHTML = `<section class="scoreboard" aria-labelledby="score-title">
    ${scoreHeader(totals, match.rounds.length, limit, scoreGaps(match.rounds, matchConfig(match), current), true)}
    ${cards(totals, [], matchConfig(match).mode === 'teams' && totals.length === 3)}
  </section>
  ${!complete ? `<section class="panel rematch-panel" aria-label="إعادة المباراة">${rematchControls()}</section>` : ''}
  ${complete ? `<section class="panel final" aria-labelledby="final-title">
    <h2 id="final-title" tabindex="-1">النتيجة النهائية</h2>
    <p>${winners.length === 1 ? 'الفائز' : 'تعادل في المركز الأول'} · ${winners.map(team => escape(match.names[team])).join('، ')}</p>
    ${reason === 'hind-zat' ? '<p class="subtle">سبب الفوز · هند زات</p>' : ''}
    ${cards(totals, winners)}
    ${rematchControls()}
  </section>` : ''}
  <div class="dashboard">${!complete || editing !== null ? editor() : ''}${history(limit, totals)}</div>`;
  document.querySelector('.match-actions').append(liveStart);
  document.querySelector('.match-actions').after(livePanel);
  if (document.querySelector('#round-form')) {
    renderManual();
    renderFields();
  }
}

function refresh(focus) {
  render();
  (document.querySelector(focus) ?? document.querySelector('#score-title'))?.focus();
}

function celebrate(winners, reason) {
  const dialog = document.querySelector('#victory-dialog');
  const final = document.querySelector('.final');
  const title = dialog.querySelector('#victory-title');
  if (dialog.open) return;
  const confetti = dialog.querySelector('.victory-confetti');
  const names = winners.map(index => match.names[index]).join('، ');
  const winnerNames = document.createElement('bdi');
  winnerNames.textContent = names;
  title.replaceChildren('مبروك يا ', winnerNames);
  if (reason === 'hind-zat') title.append(document.createElement('br'), 'هند زات');

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    confetti.replaceChildren(...Array.from({ length: 28 }, (_, index) => {
      const piece = document.createElement('i');
      piece.style.setProperty('--x', `${4 + (index * 29) % 93}%`);
      piece.style.setProperty('--drift', `${(index * 13) % 120 - 60}px`);
      piece.style.setProperty('--delay', `${(index * 137) % 1250}ms`);
      piece.style.setProperty('--fall', `${2100 + (index * 173) % 1000}ms`);
      piece.style.setProperty('--turn', `${index % 2 ? 390 : -320}deg`);
      return piece;
    }));
  }
  const visibleTime = 10000;
  const fadeTime = 800;
  dialog.style.setProperty('--victory-visible-time', `${visibleTime}ms`);
  dialog.style.setProperty('--victory-fade-time', `${fadeTime}ms`);
  dialog.showModal();
  final.hidden = true;
  const timer = setTimeout(() => dialog.close(), visibleTime + fadeTime);
  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    confetti.replaceChildren();
    const currentFinal = document.querySelector('.final');
    if (currentFinal) {
      currentFinal.hidden = false;
      currentFinal.querySelector('h2').focus();
    }
  }, { once: true });
}

app.addEventListener('change', ({ target }) => {
  if (watching) return;
  if (target.matches('#rematch-form [name^="members-choice-"]')) {
    const fields = target.closest('.rematch-members').querySelector('fieldset');
    fields.hidden = fields.disabled = target.value !== 'change';
    if (!fields.hidden) fields.querySelector('input').focus();
    return;
  }
  if (target.id === 'setup-mode' || target.id === 'setup-count') {
    if (target.id === 'setup-mode') {
      setupMode = target.value;
      setupCount = 0;
      setupNames = [];
      setupMembers = [];
    } else {
      setupCount = Number(target.value);
    }
    renderSetupFields();
    return;
  }
  if ('win' in target.dataset) {
    const team = Number(target.dataset.win);
    const type = target.value === '' ? null : Number(target.value);
    if (draft.winner !== team || type === null || draft.type === HIND_ZAT || type === HIND_ZAT) {
      const overrides = type === null || type === HIND_ZAT ? [] : draft.overrides;
      draft = { ...blank(), overrides };
      if (type === null || type === HIND_ZAT) manualIndex = null;
    }
    draft.winner = type === null ? null : team;
    if (draft.type !== type) draft.jokerCount = null;
    draft.type = type;
    if (type === 0) draft.penalty = null;
    fitDeclarations();
    document.querySelectorAll('[data-win]').forEach(select => {
      if (select !== target) select.value = '';
    });
    renderManual();
    renderFields();
  } else if (target.id === 'joker-count') {
    draft.jokerCount = target.value === '' ? null : Number(target.value);
    renderDeclarationOptions();
    updatePreview();
  } else if ('down' in target.dataset) {
    const team = Number(target.dataset.down);
    draft.down[team] = Array.from({ length: Number(target.value) }, (_, player) => draft.down[team][player] ?? '');
    renderHands(team);
    updatePreview();
  } else if ('failed' in target.dataset) {
    draft.failed ??= [];
    draft.failed[target.dataset.failed] = target.value === '' ? null : Number(target.value);
    if (!hasLoserDeclaration(draft)) draft.jokerCount = null;
    renderDeclarationOptions();
    renderWinnerJoker();
    updatePreview();
  } else if (target.id === 'penalty-team') {
    draft.penalty = target.value === '' ? null : Number(target.value);
    updatePreview();
  } else {
    return;
  }
  rememberDraft();
});

function normalizePointInput(input) {
  const value = latinDigits(input.value);
  if (value !== input.value) {
    const { selectionStart, selectionEnd, selectionDirection } = input;
    input.value = value;
    input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  }
  return value;
}

app.addEventListener('input', ({ target }) => {
  if (watching) return;
  if ('player' in target.dataset) {
    draft.down[target.dataset.team][target.dataset.player] = normalizePointInput(target);
    updatePreview();
    rememberDraft();
  } else if (target.id === 'manual-value') {
    draft.overrides ??= [];
    const value = normalizePointInput(target);
    draft.overrides[manualIndex] = value.trim() === '' ? null : value;
    updatePreview();
    rememberDraft();
  } else if (target.matches('#setup-form input, #rematch-form input')) {
    target.setCustomValidity('');
    if (target.form.id === 'setup-form') {
      const [field, index, seat] = target.name.split('-');
      if (field === 'member') (setupMembers[index] ??= [])[seat] = target.value;
      else setupNames[index] = target.value;
    }
  }
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  if (watching) return;
  const rematch = event.target.id === 'rematch-form';
  if (rematch || event.target.id === 'setup-form') {
    if (rematch && event.target.hidden) return;
    const mode = rematch ? matchConfig(match).mode : setupMode;
    const inputs = [...event.target.querySelectorAll('[name^="participant-"]')];
    if (!setupOptions[mode]?.some(([count]) => count === inputs.length)) return;
    const invalid = inputs.find(input => !input.value.trim());
    if (invalid) {
      invalid.setCustomValidity('أدخل الاسم.');
      invalid.reportValidity();
      return;
    }
    const rules = matchRules(rematch && rulesLocked() ? matchConfig(match) : settings);
    if (!rematch && mode === 'teams' && inputs.length === 2) {
      rules.jokers = Number(document.querySelector('#setup-jokers').value);
      if (rules.jokers !== 2 && rules.jokers !== 3) return;
    }
    if (liveBusy) return;
    if (!sharedId) liveMessage = '';
    const members = mode === 'teams' ? readMembers(event.target, inputs.length, rematch ? match.members : undefined) : undefined;
    rememberMembers({ members });
    persist({ id: crypto.randomUUID(), mode, names: inputs.map(input => input.value.trim()),
      members, rounds: [], ...rules });
    editing = null;
    manualIndex = null;
    draft = blank();
    refresh('#round-title');
  } else if (event.target.id === 'round-form') {
    try {
      const rounds = withDraft();
      const { complete, winners, reason } = matchStandings(rounds);
      const previous = matchStandings();
      const firstFinish = complete && (reason === 'hind-zat'
        ? previous.reason !== reason || previous.winners[0] !== winners[0]
        : editing === null && match.endedAt == null);
      const saved = persist({ ...match, rounds, redo: [], pending: undefined });
      const message = editing === null ? 'تم اعتماد اللعبة.' : 'تم حفظ التعديل.';
      editing = null;
      manualIndex = null;
      draft = blank();
      if (firstFinish) {
        render();
        celebrate(winners, reason);
      } else {
        refresh(complete ? '#final-title' : '#round-title');
      }
      if (saved && !firstFinish) announce(message);
    } catch (problem) {
      const error = document.querySelector('#round-error');
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
});

app.addEventListener('click', ({ target }) => {
  if (watching) return;
  const button = target.closest('button');
  if (!button) return;
  if (button.id === 'kabru-open') {
    if (!draft.type || draft.kabruDrawn || !allowsPenalty(matchConfig(match))) return;
    const entries = positions().filter(index => index !== draft.winner)
      .map(index => ({ index, name: match.names[index] }));
    openKabru(entries, index => {
      draft.penalty = index;
      draft.kabruDrawn = true;
      document.querySelector('#penalty-team').value = String(index);
      button.disabled = true;
      updatePreview();
      rememberDraft();
    }, (sharedId || liveBusy) ? draw => {
      liveKabru = draw;
      syncSharing();
    } : undefined, liveNow);
  } else if (button.id === 'rematch') {
    showRematch(document.querySelector('#rematch-form').hidden);
  } else if (button.id === 'cancel-rematch') {
    showRematch(false);
  } else if ('edit' in button.dataset || 'round' in button.dataset) {
    editing = Number(button.dataset.edit ?? button.dataset.round);
    draft = { ...blank(), ...structuredClone(match.rounds[editing]) };
    manualIndex = 'manual' in button.dataset ? Number(button.dataset.manual) : null;
    rememberDraft();
    refresh(manualIndex === null ? '#round-title' : '#manual-value');
  } else if ('manual' in button.dataset) {
    manualIndex = Number(button.dataset.manual);
    rememberDraft();
    renderManual();
    updatePreview();
    document.querySelector('#manual-value').focus();
  } else if (button.id === 'restore-score') {
    if (draft.overrides) draft.overrides[manualIndex] = null;
    manualIndex = null;
    rememberDraft();
    renderManual();
    updatePreview();
  } else if ('delete' in button.dataset || button.id === 'undo' || button.id === 'redo') {
    const redo = button.id === 'redo';
    const undo = button.id === 'undo';
    const index = undo ? match.rounds.length - 1 : redo ? match.rounds.length : Number(button.dataset.delete);
    if (!undo && !redo && !confirm(`حذف اللعبة ${number.format(index + 1)}؟`)) return;
    const next = undo || redo ? moveRound(match, redo)
      : { ...match, rounds: removeRound(match.rounds, index), redo: [] };
    if (next === match) return;
    const { rounds } = next;
    if (editing === index || (editing === null && matchStandings(rounds).complete)) {
      editing = null;
      manualIndex = null;
      draft = blank();
    } else if (editing !== null && editing > index) {
      editing -= 1;
    }
    const previousResult = matchStandings();
    const saved = persist({ ...next, pending: { draft, editing, manualIndex } });
    const nextButton = button.id === 'redo' && !match.redo?.length ? '#undo'
      : button.id === 'undo' && !match.rounds.length ? '#redo' : '#' + button.id;
    refresh(undo || redo ? nextButton : '#round-title');
    const result = matchStandings();
    if (redo && result.reason === 'hind-zat' && !previousResult.complete) celebrate(result.winners, result.reason);
    if (saved) announce(redo ? 'تمت إعادة اللعبة.' : undo ? 'تم التراجع عن اللعبة.' : 'تم حذف اللعبة.');
  } else if (button.id === 'cancel') {
    editing = null;
    manualIndex = null;
    draft = blank();
    persist({ ...match, pending: undefined });
    refresh('#round-title');
  }
});

reset.addEventListener('click', () => {
  if (watching || liveBusy) return;
  if (!confirm('هل تريد بدء مباراة جديدة؟ سيتم مسح الأسماء واللعبات الحالية.')) return;
  if (!sharedId) liveMessage = '';
  editing = null;
  manualIndex = null;
  setupMode = '';
  setupCount = 0;
  setupNames = [];
  setupMembers = [];
  rememberMembers();
  persist(null);
  draft = blank();
  refresh('#setup-mode');
});

function archiveSummary(entry) {
  const mode = entry.mode === 'solo' ? 'فردي' : 'أفرقة';
  const winner = entry.winners.length === 1 ? 'الفائز' : 'تعادل في المركز الأول';
  return `<span class="subtle">${dateFormat.format(entry.endedAt)} · ${mode}</span>
    <strong>${entry.names.map(escape).join(' · ')}</strong>
    <span>${winner}: ${entry.winners.map(index => escape(entry.names[index])).join('، ')}${entry.reason === 'hind-zat' ? ' · هند زات' : ''}</span>`;
}

function renderArchive(entries = readArchive(storage)) {
  const entry = entries.find(item => item.id === selectedArchive);
  if (entry) {
    const rows = entry.scores.map((scores, index) => `<tr><th scope="row">${number.format(index + 1)}
      ${entry.reason === 'hind-zat' && index === entry.limit - 1 ? ' <small>هند زات</small>' : ''}
      ${index >= entry.limit ? '<small class="subtle">معلّقة</small>' : ''}</th>
      ${scores.map(score => `<td>${display(score)}</td>`).join('')}</tr>`).join('');
    archiveContent.innerHTML = `<button type="button" class="secondary" data-archive-action="list">العودة إلى السجل</button>
      <div class="archive-summary" id="archive-detail">${archiveSummary(entry)}</div>
      ${resultsTable(entry.names, entry.totals, rows, 'archive-detail')}`;
    archiveContent.querySelector('button').focus();
    return;
  }
  selectedArchive = null;
  archiveContent.innerHTML = entries.length ? `<ul class="archive-list">${entries.map(item => `
    <li data-archive-id="${escape(item.id)}">
      <button class="archive-summary" type="button" data-archive-action="detail">${archiveSummary(item)}</button>
      <div class="history-controls">
        <button type="button" class="secondary" data-archive-action="delete">حذف</button>
      </div>${pendingArchiveDelete === item.id ? `
        <div class="archive-delete" role="group" aria-label="تأكيد حذف المباراة">
          <p class="subtle">هل تريد حذف هذه المباراة من السجل؟</p>
          <div class="history-controls">
            <button type="button" class="secondary" data-archive-action="confirm-delete">تأكيد الحذف</button>
            <button type="button" class="secondary" data-archive-action="cancel-delete">إلغاء</button>
          </div>
        </div>` : ''}
    </li>`).join('')}</ul>` : '<p class="subtle">لا توجد مباريات مكتملة في السجل.</p>';
}

archiveButton.addEventListener('click', () => {
  selectedArchive = null;
  pendingArchiveDelete = null;
  try {
    renderArchive();
  } catch {
    archiveContent.textContent = 'تعذّر فتح سجل المباريات.';
  }
  archiveDialog.showModal();
});
document.querySelector('#archive-close').addEventListener('click', () => archiveDialog.close());
archiveContent.addEventListener('click', event => {
  const button = event.target.closest('[data-archive-action]');
  if (!button) return;
  const action = button.dataset.archiveAction;
  const id = button.closest('[data-archive-id]')?.dataset.archiveId;
  try {
    let entries = readArchive(storage);
    pendingArchiveDelete = action === 'delete' ? id : null;
    if (action === 'list' || action === 'detail') {
      selectedArchive = id ?? null;
    } else if (action === 'confirm-delete') {
      entries = entries.filter(entry => entry.id !== id);
      writeArchive(storage, entries);
    }
    renderArchive(entries);
    if (action === 'delete') archiveContent.querySelector('[data-archive-action="cancel-delete"]')?.focus();
    else if (action !== 'detail') document.querySelector('#archive-close').focus();
  } catch {
    archiveContent.textContent = 'تعذّر تحديث سجل المباريات.';
  }
});

function renderLiveMatch(snapshot) {
  const victory = document.querySelector('#victory-dialog');
  const celebrateNow = snapshot?.complete && (!match?.complete || (snapshot.reason === 'hind-zat'
    && (match.reason !== snapshot.reason || match.winners[0] !== snapshot.winners[0])));
  match = snapshot;
  applyBrand(snapshot?.brand);
  renderWatchedKabru(snapshot?.kabru, snapshot?.names, liveNow);
  if (!snapshot) {
    if (victory.open) victory.close();
    app.innerHTML = '';
    return;
  }
  const { names, scores, totals, limit, complete, winners, reason } = snapshot;
  if (!complete && victory.open) victory.close();
  const rows = Array.from({ length: snapshot.scheduledLimit ?? limit }, (_, index) =>
    `<tr><th scope="row">${number.format(index + 1)}${reason === 'hind-zat' && index === limit - 1 ? ' <small>هند زات</small>' : ''}${index >= limit && scores[index] ? ' <small class="subtle">معلّقة</small>' : ''}</th>
      ${names.map((_, position) => `<td>${scores[index] ? display(scores[index][position]) : '—'}</td>`).join('')}</tr>`).join('');
  app.innerHTML = `<section class="scoreboard" aria-labelledby="score-title">
    ${scoreHeader(totals, scores.length, limit, snapshot.gaps)}
    ${cards(totals, [], snapshot.mode === 'teams' && totals.length === 3)}
  </section>
  ${complete ? `<section class="panel final" aria-labelledby="final-title" ${victory.open ? 'hidden' : ''}>
    <h2 id="final-title" tabindex="-1">النتيجة النهائية</h2>
    <p>${winners.length === 1 ? 'الفائز' : 'تعادل في المركز الأول'} · ${winners.map(index => escape(names[index])).join('، ')}</p>
    ${reason === 'hind-zat' ? '<p class="subtle">سبب الفوز · هند زات</p>' : ''}
    ${cards(totals, winners)}
  </section>` : ''}
  <section class="panel history-panel" aria-labelledby="live-history-title">
    <h2 id="live-history-title">سجل اللعبات</h2>
    ${resultsTable(names, totals, rows, 'live-history-title')}
  </section>`;
  if (celebrateNow) celebrate(winners, reason);
  scheduleViewerFit();
}

let viewerFitFrame;

function scheduleViewerFit() {
  if (viewerFitFrame !== undefined) return;
  viewerFitFrame = requestAnimationFrame(() => {
    viewerFitFrame = undefined;
    if (!match) return;
    const viewport = window.visualViewport;
    // Leave zoomed-in viewers in control of scrolling.
    const height = viewport?.scale === 1 ? viewport.height : document.documentElement.clientHeight;
    const body = document.body;
    const footer = document.querySelector('.version');
    const logo = document.querySelector('.edition-panel');
    const label = logo.querySelector('#edition-name');
    body.dataset.viewerDensity = 'comfortable';
    logo.style.removeProperty('width');
    const naturalWidth = logo.getBoundingClientRect().width;
    logo.style.width = Math.min(180, naturalWidth) + 'px';
    if (!label.hidden) label.style.fontSize = '14px';
    const minimumWidth = label.hidden ? 88 : Math.max(124, logo.offsetWidth - label.clientWidth + label.scrollWidth);
    const smallLogoWidth = Math.min(naturalWidth, Math.max(180, minimumWidth));
    const setLogoWidth = width => {
      logo.style.width = width + 'px';
      if (label.hidden) return;
      // Measure the rendered name so older TV browsers do not need container query units.
      let fontSize = Math.max(12, Math.min(40, Math.floor(width / 10), Math.floor(height / 25)));
      label.style.fontSize = fontSize + 'px';
      while (label.scrollWidth > label.clientWidth && fontSize > 1) {
        fontSize = Math.max(1, Math.min(fontSize - 1, Math.floor(fontSize * label.clientWidth / label.scrollWidth)));
        label.style.fontSize = fontSize + 'px';
      }
    };
    const pageBottom = () => footer.getBoundingClientRect().bottom + window.scrollY;

    for (const density of ['comfortable', 'compact', 'tight']) {
      body.dataset.viewerDensity = density;
      setLogoWidth(smallLogoWidth);
      const remaining = height - pageBottom();
      if (remaining >= 0) {
        setLogoWidth(Math.min(naturalWidth, Math.floor(smallLogoWidth + remaining * 1672 / 324)));
        return;
      }
    }
    const remaining = height - pageBottom() + logo.getBoundingClientRect().height;
    const availableWidth = Math.floor(remaining * 1672 / 324);
    setLogoWidth(Math.min(naturalWidth, Math.max(minimumWidth, availableWidth)));
  });
}

function startWatching() {
  document.body.classList.add('live-viewer');
  document.querySelector('#settings-menu').hidden = true;
  window.addEventListener('resize', scheduleViewerFit);
  window.visualViewport?.addEventListener('resize', scheduleViewerFit);
  document.fonts?.ready.then(scheduleViewerFit);
  app.addEventListener('toggle', scheduleViewerFit, true);
  document.querySelector('#victory-dialog').addEventListener('close', scheduleViewerFit);
  archiveButton.closest('.archive-launch').hidden = true;
  let received = false;
  let connected = false;
  let unavailable = false;
  const updateStatus = () => {
    liveMessage = unavailable ? 'تعذّر فتح القيد المباشر.'
      : received && !match ? 'المشاركة متوقفة أو الرابط غير متاح.'
      : match ? (connected ? 'مشاهدة مباشرة · للقراءة فقط' : 'انقطع الاتصال. يُعرض آخر قيد وصل.')
      : 'جارٍ الاتصال بالقيد المباشر…';
    renderSharing();
    scheduleViewerFit();
  };
  const onError = () => {
    unavailable = true;
    renderLiveMatch(null);
    updateStatus();
  };
  if (!configured || !validLiveId(viewId)) {
    onError();
    return;
  }
  updateStatus();
  watchLive(viewId, snapshot => {
    received = true;
    unavailable = false;
    renderLiveMatch(snapshot);
    updateStatus();
  }, onError, online => {
    connected = online;
    updateStatus();
  }).catch(onError);
}

function applyBrand(brand) {
  const { name, theme } = normalizeBrand(brand);
  const label = document.querySelector('#edition-name');
  label.textContent = name;
  label.hidden = name === DEFAULT_SETTINGS.name && theme === DEFAULT_SETTINGS.theme;
  label.parentElement.classList.toggle('custom-edition', !label.hidden);
  label.parentElement.setAttribute('aria-label', name);
  document.documentElement.dataset.theme = theme;
  document.title = `حاسبة الهند – ${name}`;
}

function rulesLocked() {
  return Boolean(match && !matchStandings().complete);
}

function defaultsChangeRules() {
  return Object.keys(matchRules(DEFAULT_SETTINGS)).some(key => settings[key] !== DEFAULT_SETTINGS[key]);
}

const settingsMenu = document.querySelector('#settings-menu');
const settingsDialog = document.querySelector('#settings-dialog');
const settingsForm = document.querySelector('#settings-form');
const settingsFields = settingsForm.elements;
const settingsDefaults = document.querySelector('#settings-defaults');
document.querySelector('#theme-options').innerHTML = Object.entries(THEMES).map(([value, label]) => `
  <label class="theme-option">
    <input type="radio" name="theme" value="${value}">
    <span class="theme-card" data-palette="${value}">
      <span class="theme-swatches" aria-hidden="true"><i></i><i></i></span>
      <span class="theme-label">${escape(label)}</span>
      <span class="theme-check" aria-hidden="true">✓</span>
    </span>
  </label>`).join('');

function refreshSettingsLock() {
  const locked = rulesLocked();
  document.querySelector('#settings-rules').disabled = locked;
  document.querySelector('#settings-lock').hidden = !locked;
  settingsDefaults.disabled = locked && defaultsChangeRules();
}

function updateSettings(next) {
  try {
    settings = saveSettings(storage, next);
  } catch {
    announce('تعذّر حفظ الإعدادات على هذا الجهاز.');
    return;
  }
  applyBrand(settings);
  const setupJokers = document.querySelector('#setup-jokers');
  if (setupJokers) setupJokers.value = String(settings.jokers);
  settingsDialog.close();
  if (match) syncSharing();
}

document.querySelector('#settings-open').addEventListener('click', () => {
  settingsMenu.open = false;
  settingsFields.name.value = settings.name;
  settingsFields.theme.value = settings.theme;
  settingsFields.baseRounds.value = String(settings.baseRounds);
  settingsFields.jokers.value = String(settings.jokers);
  settingsFields.penaltyEnabled.checked = settings.penaltyEnabled;
  refreshSettingsLock();
  settingsDialog.showModal();
});
document.querySelector('#settings-close').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('close', () => settingsMenu.querySelector('summary').focus());
settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  const rules = rulesLocked() ? matchRules(settings) : {
    baseRounds: Number(settingsFields.baseRounds.value),
    jokers: Number(settingsFields.jokers.value),
    penaltyEnabled: settingsFields.penaltyEnabled.checked,
  };
  updateSettings({ ...rules, name: settingsFields.name.value, theme: settingsFields.theme.value });
});
settingsDefaults.addEventListener('click', () => {
  if (rulesLocked() && defaultsChangeRules()) return;
  updateSettings(DEFAULT_SETTINGS);
});

if (watching) {
  startWatching();
} else {
  applyBrand(settings);
  try {
    readArchive(storage);
  } catch {
    // The calculator can still run if the archive is unavailable.
  }
  if (match) {
    persist({ ...match, id: match.id ?? crypto.randomUUID() });
  }
  restoreSharing();
  if (configured) syncSharing();
  if (sharedId && !match) liveMessage = 'المشاركة المباشرة مفعّلة.';
  render();
}
