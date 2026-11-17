import { TYPES, STORAGE_KEY, loadMatch, saveMatch, scoreRound, standings, recordRound, removeRound } from './scoring.mjs';

const app = document.querySelector('#app');
const reset = document.querySelector('#reset');
const notice = document.querySelector('#notice');
const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 12 });
const teams = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث'];
const positions = [0, 1, 2];
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const display = value => `<bdi class="${value < 0 ? 'negative' : ''}">${number.format(value)}</bdi>`;
const blank = () => ({ winner: null, type: null, penalty: null, down: [[], [], []] });

let storage;
try { storage = window.localStorage; } catch {}
let match = loadMatch(storage);
let editing = null;
let draft = blank();
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

function cards(totals, winners = []) {
  return `<div class="scores">${totals.map((total, team) => `
    <div class="score-card ${winners.includes(team) ? 'leading' : ''}">
      <h3>${escape(match.names[team])}</h3><b>${display(total)}</b>
    </div>`).join('')}</div>`;
}

function history(limit, totals) {
  const overflow = match.rounds.length > limit;
  const rows = Array.from({ length: Math.max(limit, match.rounds.length) }, (_, index) => {
    const round = match.rounds[index];
    const scores = round ? scoreRound(round).map(display) : ['—', '—', '—'];
    return `<tr class="${index === match.rounds.length || index === editing ? 'current-row' : ''}">
      <th scope="row">${number.format(index + 1)}</th>${scores.map(score => `<td>${score}</td>`).join('')}
    </tr>${round ? `<tr class="row-actions"><td colspan="4">
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
          <select id="win-${team}" data-win="${team}" aria-label="نوع الفوز لفريق ${escape(name)}">
            <option value="">اختر نوع الفوز</option>
            ${TYPES.map(({ label }, type) => `<option value="${type}" ${draft.winner === team && draft.type === type ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <div class="team-fields" id="fields-${team}"></div>
        </div>`).join('')}</div>
      <div class="penalty" id="penalty"></div>
      <div class="preview" id="preview" aria-live="polite"></div>
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
    const label = draft.down[team].length === 1 ? 'نقاط ورق اللاعب النازل' : `نقاط ورق اللاعب ${['الأول', 'الثاني'][player]}`;
    return `<label>${label}
      <input type="text" inputmode="decimal" autocomplete="off" maxlength="16" dir="auto"
        data-team="${team}" data-player="${player}" value="${escape(value)}" required>
    </label>`;
  }).join('');
}

function renderFields() {
  positions.forEach(team => {
    document.querySelector(`#team-${team}`).classList.toggle('selected', draft.winner === team);
    const fields = document.querySelector(`#fields-${team}`);
    if (draft.winner === null || draft.winner === team) {
      fields.innerHTML = '';
      return;
    }
    fields.innerHTML = `<label for="down-${team}">النزول</label>
      <select id="down-${team}" data-down="${team}" aria-label="النزول لفريق ${escape(match.names[team])}">
      ${['لا يوجد نزول', 'لاعب واحد نازل', 'اللاعبان نازلان'].map((label, count) =>
        `<option value="${count}" ${draft.down[team].length === count ? 'selected' : ''}>${label}</option>`).join('')}
      </select><div class="hand-inputs" id="hands-${team}"></div>`;
    renderHands(team);
  });
  const penalty = document.querySelector('#penalty');
  penalty.hidden = draft.type === null || draft.type === 0;
  penalty.innerHTML = penalty.hidden ? '' : `<label for="penalty-team">الشرهة (+${number.format(TYPES[draft.type].factor * 25)})</label>
    <select id="penalty-team"><option value="">بدون شرهة</option>
    ${positions.filter(team => team !== draft.winner).map(team =>
      `<option value="${team}" ${draft.penalty === team ? 'selected' : ''}>${escape(match.names[team])}</option>`).join('')}</select>`;
  updatePreview();
}

function updatePreview() {
  const preview = document.querySelector('#preview');
  const error = document.querySelector('#round-error');
  error.hidden = true;
  const approve = document.querySelector('#approve');
  approve.disabled = true;
  if (draft.winner === null) {
    preview.innerHTML = '<p class="subtle">اختر نوع الفوز تحت اسم الفريق الفائز لمعاينة النقاط.</p>';
    return;
  }
  try {
    const scores = scoreRound(draft);
    preview.innerHTML = `<div class="preview-scores">${scores.map((score, team) =>
      `<div>${escape(match.names[team])}<b>${display(score)}</b></div>`).join('')}</div>`;
    approve.disabled = false;
  } catch (problem) {
    preview.innerHTML = '<p class="subtle">أكمل نقاط الورق لمعاينة نتيجة اللعبة.</p>';
    const fields = [...document.querySelectorAll('[data-player]')];
    if (fields.some(field => field.value.trim() !== '')) {
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
}

function render() {
  reset.hidden = !match;
  if (!match) {
    app.innerHTML = `<section class="panel setup">
      <div class="suits" aria-hidden="true">♠ ♥ ♣ ♦</div>
      <h2>ابدأ مباراة</h2><p class="subtle">أدخل أسماء الأفرقة الثلاثة.</p>
      <form id="setup-form">
        ${teams.map((team, index) => `<label>${team}<input name="team-${index}" placeholder="${team}" maxlength="40" dir="auto" required></label>`).join('')}
        <button class="primary" type="submit">بدء المباراة</button>
      </form>
    </section>`;
    return;
  }
  const { limit, totals, complete, winners } = standings(match.rounds);
  app.innerHTML = `<section class="scoreboard" aria-labelledby="score-title">
    <div class="score-title"><h2 id="score-title" tabindex="-1">مجموع النقاط</h2>
      <span class="progress">${number.format(Math.min(match.rounds.length, limit))} من ${number.format(limit)} لعبات</span></div>
    ${cards(totals)}
  </section>
  ${complete ? `<section class="panel final" aria-labelledby="final-title">
    <h2 id="final-title" tabindex="-1">النتيجة النهائية</h2>
    <p>${winners.length === 1 ? 'الفائز' : 'تعادل في المركز الأول'} · ${winners.map(team => escape(match.names[team])).join('، ')}</p>
    ${cards(totals, winners)}
  </section>` : ''}
  <div class="dashboard">${!complete || editing !== null ? editor() : ''}${history(limit, totals)}</div>`;
  if (document.querySelector('#round-form')) renderFields();
}

function refresh(focus) {
  render();
  (document.querySelector(focus) ?? document.querySelector('#score-title'))?.focus();
}

app.addEventListener('change', ({ target }) => {
  if ('win' in target.dataset) {
    const team = Number(target.dataset.win);
    const type = target.value === '' ? null : Number(target.value);
    if (draft.winner !== team || type === null) draft = blank();
    draft.winner = type === null ? null : team;
    draft.type = type;
    if (type === 0) draft.penalty = null;
    document.querySelectorAll('[data-win]').forEach(select => {
      if (select !== target) select.value = '';
    });
    renderFields();
  } else if ('down' in target.dataset) {
    const team = Number(target.dataset.down);
    draft.down[team] = Array.from({ length: Number(target.value) }, (_, player) => draft.down[team][player] ?? '');
    renderHands(team);
    updatePreview();
  } else if (target.id === 'penalty-team') {
    draft.penalty = target.value === '' ? null : Number(target.value);
    updatePreview();
  }
});

app.addEventListener('input', ({ target }) => {
  if ('player' in target.dataset) {
    draft.down[target.dataset.team][target.dataset.player] = target.value;
    updatePreview();
  } else if (target.matches('#setup-form input')) {
    target.setCustomValidity('');
  }
});

app.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'setup-form') {
    const inputs = [...event.target.querySelectorAll('input')];
    const invalid = inputs.find(input => !input.value.trim());
    if (invalid) {
      invalid.setCustomValidity('أدخل اسم الفريق.');
      invalid.reportValidity();
      return;
    }
    persist({ names: inputs.map(input => input.value.trim()), rounds: [] });
    refresh('#round-title');
  } else if (event.target.id === 'round-form') {
    try {
      const rounds = recordRound(match.rounds, draft, editing ?? match.rounds.length);
      const saved = persist({ ...match, rounds });
      const message = editing === null ? 'تم اعتماد اللعبة.' : 'تم حفظ التعديل.';
      editing = null;
      draft = blank();
      refresh(standings(rounds).complete ? '#final-title' : '#round-title');
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
  if ('edit' in button.dataset) {
    editing = Number(button.dataset.edit);
    draft = structuredClone(match.rounds[editing]);
    refresh('#round-title');
  } else if ('delete' in button.dataset || button.id === 'undo') {
    const index = button.id === 'undo' ? match.rounds.length - 1 : Number(button.dataset.delete);
    if (button.id !== 'undo' && !confirm(`حذف اللعبة ${number.format(index + 1)}؟`)) return;
    const rounds = removeRound(match.rounds, index);
    const saved = persist({ ...match, rounds });
    if (editing === index) {
      editing = null;
      draft = blank();
    } else if (editing !== null && editing > index) {
      editing -= 1;
    }
    if (editing === null && standings(rounds).complete) draft = blank();
    refresh('#round-title');
    if (saved) announce('تم حذف اللعبة.');
  } else if (button.id === 'cancel') {
    editing = null;
    draft = blank();
    refresh('#round-title');
  }
});

reset.addEventListener('click', () => {
  if (!confirm('هل تريد بدء مباراة جديدة؟ سيتم مسح أسماء الأفرقة واللعبات الحالية.')) return;
  editing = null;
  draft = blank();
  persist(null);
  refresh('#setup-form input');
});

render();
