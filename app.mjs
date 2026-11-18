import { TYPES, FAILED_DECLARATIONS, jokerCapacity, declaredJokers, roundLimit, allowsDown, matchConfig, STORAGE_KEY, loadMatch, saveMatch, scoreRound, standings, recordRound, removeRound } from './scoring.mjs?v=2.2.0';

const app = document.querySelector('#app');
const reset = document.querySelector('#reset');
const notice = document.querySelector('#notice');
const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 12 });
const teams = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث'];
const players = ['اللاعب الأول', 'اللاعب الثاني', 'اللاعب الثالث', 'اللاعب الرابع', 'اللاعب الخامس'];
const setupOptions = {
  teams: [[2, 'فريقين'], [3, 'ثلاثة أفرقة']],
  solo: [[3, 'ثلاثة لاعبين'], [4, 'أربعة لاعبين'], [5, 'خمسة لاعبين']],
};
const positions = () => match.names.map((_, index) => index);
const solo = () => match.mode === 'solo';
const pencil = (index, round) => `<button type="button" class="pencil" data-manual="${index}"
  ${round === undefined ? '' : `data-round="${round}"`}
  aria-label="تعديل نقاط ${escape(match.names[index])}"><span aria-hidden="true">✎</span></button>`;
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const display = value => `<bdi class="${value < 0 ? 'negative' : ''}">${number.format(value)}</bdi>`;
const blank = () => ({ winner: null, type: null, penalty: null, down: match ? positions().map(() => []) : [], failed: [], overrides: [] });

let storage;
try { storage = window.localStorage; } catch {}
let match = loadMatch(storage);
let editing = match?.pending?.editing ?? null;
let draft = match?.pending?.draft ?? blank();
let manualIndex = match?.pending?.manualIndex ?? null;
let setupMode = '';
let setupCount = 0;
let setupNames = [];
let noticeTimer;

function announce(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 4500);
}

function persist(next) {
  match = next;
  try {
    if (next) saveMatch(storage, next);
    else storage.removeItem(STORAGE_KEY);
    return true;
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
  return allowsDown(index, roundLimit(rounds));
}

function matchStandings(rounds = match.rounds) {
  return standings(rounds, matchConfig(match));
}

function withDraft() {
  return recordRound(match.rounds, draft, editing ?? match.rounds.length, matchConfig(match));
}

function cards(totals, winners = []) {
  return `<div class="scores ${totals.length === 5 ? 'five-scores' : ''}" style="--participants: ${totals.length}">${totals.map((total, team) => `
    <div class="score-card ${winners.includes(team) ? 'leading' : ''}">
      <h3>${escape(match.names[team])}</h3><b>${display(total)}</b>
    </div>`).join('')}</div>`;
}

function history(limit, totals) {
  const overflow = match.rounds.length > limit;
  const rows = Array.from({ length: Math.max(limit, match.rounds.length) }, (_, index) => {
    const round = match.rounds[index];
    const scores = round ? scoreRound(round, matchConfig(match), allowsDown(index, limit)).map(display) : positions().map(() => '—');
    return `<tr class="${index === match.rounds.length || index === editing ? 'current-row' : ''}">
      <th scope="row">${number.format(index + 1)}</th>${scores.map((score, team) => `<td>${score}${round ? pencil(team, index) : ''}</td>`).join('')}
    </tr>${round ? `<tr class="row-actions"><td colspan="${match.names.length + 1}">
      ${index >= limit ? '<span class="subtle">معلّقة</span>' : ''}
      <button type="button" data-edit="${index}" aria-label="تعديل اللعبة ${number.format(index + 1)}">تعديل</button>
      <button type="button" class="delete" data-delete="${index}" aria-label="حذف اللعبة ${number.format(index + 1)}">حذف</button>
    </td></tr>` : ''}`;
  }).join('');
  return `<section class="panel" aria-labelledby="history-title">
    <div class="panel-heading"><h2 id="history-title">سجل اللعبات</h2>
      <button class="secondary" type="button" id="undo" ${match.rounds.length ? '' : 'disabled'}>التراجع عن آخر لعبة</button></div>
    <table aria-labelledby="history-title"><thead><tr><th scope="col">اللعبة</th>
      ${match.names.map(name => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><th scope="row">المجموع</th>
      ${totals.map(total => `<td>${display(total)}</td>`).join('')}</tr></tfoot></table>
    ${overflow ? '<p class="subtle history-note">اللعبات المعلّقة محفوظة خارج المجموع. تعود إلى الحساب إذا امتدت المباراة مجدداً.</p>' : ''}
  </section>`;
}

function editor() {
  return `<section class="panel" aria-labelledby="round-title">
    <div class="panel-heading"><h2 id="round-title" tabindex="-1">${editing === null ? 'تسجيل اللعبة' : 'تعديل اللعبة'} ${number.format((editing ?? match.rounds.length) + 1)}</h2></div>
    <form id="round-form" novalidate>
      <div class="teams">${match.names.map((name, team) => `
        <div class="team" id="team-${team}">
          <label for="win-${team}">${escape(name)}</label>
          <select id="win-${team}" data-win="${team}" aria-label="نوع الفوز · ${escape(name)}">
            <option value="">اختر نوع الفوز</option>
            ${TYPES.map(({ label }, type) => `<option value="${type}" ${draft.winner === team && draft.type === type ? 'selected' : ''}>${label}</option>`).join('')}
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
        data-team="${team}" data-player="${player}" value="${escape(value)}" required>
    </label>`;
  }).join('');
}

function fitDeclarations() {
  const capacity = jokerCapacity(draft);
  if (capacity === null || !draft.failed) return;
  let remaining = capacity;
  draft.failed = draft.failed.map((value, index) => {
    const declaration = FAILED_DECLARATIONS[value];
    if (index === draft.winner || capacity === 0 || !declaration || declaration.jokers > remaining) return null;
    remaining -= declaration.jokers;
    return value;
  });
}

function renderDeclarationOptions() {
  const capacity = jokerCapacity(draft);
  document.querySelectorAll('[data-failed]').forEach(select => {
    const team = Number(select.dataset.failed);
    const remaining = capacity - declaredJokers(draft, team);
    select.innerHTML = `<option value="">بدون إعلان</option>${FAILED_DECLARATIONS.map(({ label, jokers, units }, index) =>
      jokers > remaining ? '' : `<option value="${index}">${label} (+${number.format(units * (solo() ? 100 : 200))})</option>`).join('')}`;
    select.value = draft.failed?.[team] ?? '';
  });
}

function renderFields() {
  fitDeclarations();
  const downAllowed = draftAllowsDown();
  const showDeclarations = jokerCapacity(draft) > 0;
  positions().forEach(team => {
    document.querySelector(`#team-${team}`).classList.toggle('selected', draft.winner === team);
    const fields = document.querySelector(`#fields-${team}`);
    if (draft.winner === null || draft.winner === team) {
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
  const winnerJoker = document.querySelector('#winner-joker');
  winnerJoker.hidden = TYPES[draft.type]?.jokers !== null;
  winnerJoker.innerHTML = winnerJoker.hidden ? '' : `<label for="joker-count">الهند بـ</label>
    <select id="joker-count">
      <option value="">اختر جوكر أو لون</option>
      <option value="1" ${draft.jokerCount === 1 ? 'selected' : ''}>جوكر</option>
      <option value="0" ${draft.jokerCount === 0 ? 'selected' : ''}>لون</option>
    </select>`;
  const penalty = document.querySelector('#penalty');
  penalty.hidden = !draft.type;
  penalty.innerHTML = penalty.hidden ? '' : `<label for="penalty-team">الشرهة</label>
    <select id="penalty-team"><option value="">بدون شرهة</option>
    ${positions().filter(team => team !== draft.winner).map(team =>
      `<option value="${team}" ${draft.penalty === team ? 'selected' : ''}>${escape(match.names[team])}</option>`).join('')}</select>`;
  updatePreview();
}

function renderManual() {
  const container = document.querySelector('#manual-editor');
  container.innerHTML = manualIndex === null || draft.winner === null ? '' : `
    <div class="manual-controls">
      <label for="manual-value">تعديل نقاط ${escape(match.names[manualIndex])}
        <input id="manual-value" type="text" dir="auto" autocomplete="off"
          value="${escape(draft.overrides?.[manualIndex] ?? '')}">
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
  scoreboard.querySelector('.scores').outerHTML = cards(matchStandings().totals);
  if (draft.winner === null) {
    preview.innerHTML = '<p class="subtle">اختر نوع الفوز تحت اسم الفائز لمعاينة النقاط.</p>';
    return;
  }
  try {
    const rounds = withDraft();
    const projected = matchStandings(rounds);
    const index = editing ?? match.rounds.length;
    const scores = scoreRound(rounds[index], matchConfig(match), allowsDown(index, projected.limit));
    preview.innerHTML = `<div class="preview-scores" style="--participants: ${scores.length}">${scores.map((score, team) =>
      `<div>${escape(match.names[team])}<b>${display(score)}</b>${pencil(team)}</div>`).join('')}</div>`;
    if (editing !== null || draft.overrides?.some(value => value != null)) {
      title.textContent = 'مجموع النقاط المتوقع';
      scoreboard.querySelector('.scores').outerHTML = cards(projected.totals);
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

function nameFields(labels, names) {
  return labels.map((label, index) =>
    `<label>${label}<input name="participant-${index}" placeholder="${label}" value="${escape(names[index] ?? '')}" maxlength="40" dir="auto" required></label>`).join('');
}

function rematchControls() {
  const labels = (solo() ? players : teams).slice(0, match.names.length);
  return `<div class="rematch">
    <button class="primary" type="button" id="rematch" aria-controls="rematch-form" aria-expanded="false">إعادة المباراة</button>
    <form id="rematch-form" aria-label="إعادة المباراة" hidden>
      ${nameFields(labels, match.names)}
      <div class="controls">
        <button class="primary" type="submit">بدء المباراة</button>
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
  document.querySelector('#setup-names').innerHTML = nameFields(labels.slice(0, setupCount), setupNames);
  document.querySelector('#start-match').hidden = !setupCount;
}

function render() {
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
        <div id="setup-names"></div>
        <button class="primary" id="start-match" type="submit" hidden>بدء المباراة</button>
      </form>
    </section>`;
    document.querySelector('#setup-mode').value = setupMode;
    renderSetupFields();
    return;
  }
  const { limit, totals, complete, winners } = matchStandings();
  app.innerHTML = `<section class="scoreboard" aria-labelledby="score-title">
    <div class="score-title"><h2 id="score-title" tabindex="-1">مجموع النقاط</h2>
      <span class="progress">${number.format(Math.min(match.rounds.length, limit))} من ${number.format(limit)} لعبات</span></div>
    ${cards(totals)}
  </section>
  ${complete ? `<section class="panel final" aria-labelledby="final-title">
    <h2 id="final-title" tabindex="-1">النتيجة النهائية</h2>
    <p>${winners.length === 1 ? 'الفائز' : 'تعادل في المركز الأول'} · ${winners.map(team => escape(match.names[team])).join('، ')}</p>
    ${cards(totals, winners)}
    ${rematchControls()}
  </section>` : ''}
  <div class="dashboard">${!complete || editing !== null ? editor() : ''}${history(limit, totals)}</div>`;
  if (document.querySelector('#round-form')) {
    renderManual();
    renderFields();
  }
}

function refresh(focus) {
  render();
  (document.querySelector(focus) ?? document.querySelector('#score-title'))?.focus();
}

app.addEventListener('change', ({ target }) => {
  if (target.id === 'setup-mode' || target.id === 'setup-count') {
    if (target.id === 'setup-mode') {
      setupMode = target.value;
      setupCount = 0;
      setupNames = [];
    } else {
      setupCount = Number(target.value);
    }
    renderSetupFields();
    return;
  }
  if ('win' in target.dataset) {
    const team = Number(target.dataset.win);
    const type = target.value === '' ? null : Number(target.value);
    if (draft.winner !== team || type === null) {
      const overrides = type === null ? [] : draft.overrides;
      draft = { ...blank(), overrides };
      if (type === null) manualIndex = null;
    }
    draft.winner = type === null ? null : team;
    if (draft.type !== type) draft.jokerCount = null;
    draft.type = type;
    if (type === 0) draft.penalty = null;
    document.querySelectorAll('[data-win]').forEach(select => {
      if (select !== target) select.value = '';
    });
    renderManual();
    renderFields();
  } else if (target.id === 'joker-count') {
    draft.jokerCount = target.value === '' ? null : Number(target.value);
    renderFields();
    document.querySelector('#joker-count').focus();
  } else if ('down' in target.dataset) {
    const team = Number(target.dataset.down);
    draft.down[team] = Array.from({ length: Number(target.value) }, (_, player) => draft.down[team][player] ?? '');
    renderHands(team);
    updatePreview();
  } else if ('failed' in target.dataset) {
    draft.failed ??= [];
    draft.failed[target.dataset.failed] = target.value === '' ? null : Number(target.value);
    renderDeclarationOptions();
    updatePreview();
  } else if (target.id === 'penalty-team') {
    draft.penalty = target.value === '' ? null : Number(target.value);
    updatePreview();
  } else {
    return;
  }
  rememberDraft();
});

app.addEventListener('input', ({ target }) => {
  if ('player' in target.dataset) {
    draft.down[target.dataset.team][target.dataset.player] = target.value;
    updatePreview();
    rememberDraft();
  } else if (target.id === 'manual-value') {
    draft.overrides ??= [];
    draft.overrides[manualIndex] = target.value.trim() === '' ? null : target.value;
    updatePreview();
    rememberDraft();
  } else if (target.matches('#setup-form input, #rematch-form input')) {
    target.setCustomValidity('');
    if (target.form.id === 'setup-form') setupNames[Number(target.name.split('-')[1])] = target.value;
  }
});

app.addEventListener('submit', event => {
  event.preventDefault();
  const rematch = event.target.id === 'rematch-form';
  if (rematch || event.target.id === 'setup-form') {
    if (rematch && !matchStandings().complete) return;
    const mode = rematch ? matchConfig(match).mode : setupMode;
    const inputs = [...event.target.querySelectorAll('input')];
    if (!setupOptions[mode]?.some(([count]) => count === inputs.length)) return;
    const invalid = inputs.find(input => !input.value.trim());
    if (invalid) {
      invalid.setCustomValidity('أدخل الاسم.');
      invalid.reportValidity();
      return;
    }
    persist({ mode, names: inputs.map(input => input.value.trim()), rounds: [] });
    editing = null;
    manualIndex = null;
    draft = blank();
    refresh('#round-title');
  } else if (event.target.id === 'round-form') {
    try {
      const rounds = withDraft();
      const saved = persist({ ...match, rounds, pending: undefined });
      const message = editing === null ? 'تم اعتماد اللعبة.' : 'تم حفظ التعديل.';
      editing = null;
      manualIndex = null;
      draft = blank();
      refresh(matchStandings(rounds).complete ? '#final-title' : '#round-title');
      if (saved) announce(message);
    } catch (problem) {
      const error = document.querySelector('#round-error');
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
});

app.addEventListener('click', ({ target }) => {
  const button = target.closest('button');
  if (!button) return;
  if (button.id === 'rematch') {
    showRematch(document.querySelector('#rematch-form').hidden);
  } else if (button.id === 'cancel-rematch') {
    showRematch(false);
  } else if ('edit' in button.dataset || 'round' in button.dataset) {
    editing = Number(button.dataset.edit ?? button.dataset.round);
    draft = structuredClone(match.rounds[editing]);
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
  } else if ('delete' in button.dataset || button.id === 'undo') {
    const index = button.id === 'undo' ? match.rounds.length - 1 : Number(button.dataset.delete);
    if (button.id !== 'undo' && !confirm(`حذف اللعبة ${number.format(index + 1)}؟`)) return;
    const rounds = removeRound(match.rounds, index);
    if (editing === index || (editing === null && matchStandings(rounds).complete)) {
      editing = null;
      manualIndex = null;
      draft = blank();
    } else if (editing !== null && editing > index) {
      editing -= 1;
    }
    const saved = persist({ ...match, rounds, pending: { draft, editing, manualIndex } });
    refresh('#round-title');
    if (saved) announce('تم حذف اللعبة.');
  } else if (button.id === 'cancel') {
    editing = null;
    manualIndex = null;
    draft = blank();
    persist({ ...match, pending: undefined });
    refresh('#round-title');
  }
});

reset.addEventListener('click', () => {
  if (!confirm('هل تريد بدء مباراة جديدة؟ سيتم مسح الأسماء واللعبات الحالية.')) return;
  editing = null;
  manualIndex = null;
  setupMode = '';
  setupCount = 0;
  setupNames = [];
  persist(null);
  draft = blank();
  refresh('#setup-mode');
});

render();
