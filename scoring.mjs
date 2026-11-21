export const TYPES = [
  { label: 'خالصة', factor: 1, jokers: 0 },
  { label: 'هند عادي', factor: 2, jokers: 0 },
  { label: 'هند جيكر أو لون', factor: 4, jokers: null },
  ...[
    [1, false, 'جوكر'], [2, false, 'جوكرين'], [3, false, 'ثلاث جواكر'],
    [1, true, 'جوكر'], [2, true, 'جوكرين'], [3, true, 'ثلاث جواكر'],
  ].map(([jokers, color, label]) => ({
    label: `إعلان ${label}${color ? ' ولون' : ''}`,
    jokers,
    factor: jokers * 8 + (color ? 4 : 0),
  })),
  { label: 'هند زات', factor: 0, jokers: 0 },
];

export const HIND_ZAT = TYPES.length - 1;

export function latinDigits(value) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, digit =>
    String(digits.includes(digit) ? digits.indexOf(digit) : digit.charCodeAt(0) - 1776)
  );
}

function normalizedNumber(value) {
  return latinDigits(value).trim().replace('٫', '.');
}

export function cardValue(value) {
  const normalized = normalizedNumber(value);
  const number = Number(normalized);
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number)) {
    throw new Error('أدخل نقاط الورق بقيمة رقمية غير سالبة لكل لاعب نازل.');
  }
  return number;
}

export function manualValue(value) {
  const normalized = normalizedNumber(value).replace('−', '-');
  const number = Number(normalized);
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number)) {
    throw new Error('أدخل قيمة رقمية صالحة للتعديل اليدوي.');
  }
  return number;
}

export const FAILED_DECLARATIONS = [
  { label: 'جوكر', jokers: 1, units: 1 },
  { label: 'جوكرين', jokers: 2, units: 2 },
  { label: 'ثلاث جواكر', jokers: 3, units: 3 },
  { label: 'لون', jokers: 0, units: 1 },
  { label: 'جوكر ولون', jokers: 1, units: 2 },
  { label: 'جوكرين ولون', jokers: 2, units: 3 },
  { label: 'ثلاث جواكر ولون', jokers: 3, units: 4 },
];

export function jokerLimit({ mode, count, jokers } = {}) {
  return mode === 'teams' && count === 2 && jokers === 2 ? 2 : 3;
}

export function jokerCapacity(round, config) {
  const rule = TYPES[round.type];
  if (!rule) return null;
  if (round.type === HIND_ZAT) return 0;
  const jokers = rule.jokers ?? round.jokerCount;
  return rule.jokers !== null || jokers === 0 || jokers === 1 ? jokerLimit(config) - jokers : null;
}

export function hasLoserDeclaration({ failed, winner }) {
  return failed?.some((value, index) => index !== winner && value != null) ?? false;
}

export function declaredJokers(round, except) {
  return (round.failed ?? []).reduce((sum, declaration, index) =>
    index === round.winner || index === except ? sum : sum + (FAILED_DECLARATIONS[declaration]?.jokers ?? 0), 0);
}

export function roundLimit(rounds) {
  return rounds.some(round => TYPES[round.type]?.factor >= 4) ? 7 : 5;
}

export function allowsKhalasa(rounds, index) {
  const limit = roundLimit(rounds.filter((_, position) => position !== index));
  return index !== limit - 1;
}

export function allowsDown(index, limit) {
  return index !== limit - 1;
}

function participants({ mode = 'teams', count = 3 } = {}) {
  const allowed = mode === 'teams' ? [2, 3] : mode === 'solo' ? [3, 4, 5] : [];
  if (!allowed.includes(count)) throw new Error('عدد المشاركين غير صالح.');
  return Array.from({ length: count }, (_, index) => index);
}

export function allowsPenalty({ mode = 'teams', count = 3 } = {}) {
  return mode !== 'teams' || count !== 2;
}

export function scoreRound(round, config, downAllowed = true) {
  const { winner, type, failed = [], overrides = [] } = round;
  const penalty = allowsPenalty(config) ? round.penalty ?? null : null;
  const positions = participants(config);
  const seats = config?.mode === 'solo' ? 1 : 2;
  const down = round.down ?? positions.map(() => []);
  const rule = TYPES[type];
  if (!Number.isInteger(type) || !rule || !positions.includes(winner)) throw new Error('اختر الفائز ونوع الفوز.');
  if (type === HIND_ZAT) return positions.map(() => 0);
  if (jokerLimit(config) === 2 && (rule.jokers === 3
      || failed.some((declaration, index) => index !== winner && FAILED_DECLARATIONS[declaration]?.jokers === 3)
      || (hasLoserDeclaration(round) && (declaredJokers(round) > (jokerCapacity(round, config) ?? -1)
        || jokerCapacity(round, config) === 0)))) {
    throw new Error('الإعلان يتجاوز عدد الجياكر المتاحة.');
  }
  if (!Array.isArray(down) || down.length !== positions.length || (penalty !== null && !positions.includes(penalty))) {
    throw new Error('بيانات اللعبة غير صالحة.');
  }
  const { factor } = rule;
  return positions.map(index => {
    const hands = downAllowed ? down[index] : [];
    if (!Array.isArray(hands) || hands.length > seats) throw new Error('عدد النازلين غير صالح.');
    let score = -30 * factor;
    if (index !== winner) {
      const declaration = failed[index];
      const units = declaration == null ? 0 : FAILED_DECLARATIONS[declaration]?.units;
      score = (seats - hands.length) * 100 * factor
        + hands.reduce((sum, hand) => sum + cardValue(hand), 0) * factor
        + (factor > 1 && penalty === index ? 25 * factor : 0)
        + units * seats * 100;
    }
    if (!Number.isFinite(score)) throw new Error('نقاط اللعبة غير صالحة أو كبيرة جداً.');
    return overrides[index] == null ? score : manualValue(overrides[index]);
  });
}

export function standings(rounds, config) {
  const positions = participants(config);
  const scoringLimit = roundLimit(rounds);
  const zatIndex = rounds.findIndex(round => round.type === HIND_ZAT);
  const limit = zatIndex === -1 ? scoringLimit : zatIndex + 1;
  const active = rounds.slice(0, limit);
  const totals = active.reduce((totals, round, index) =>
    scoreRound(round, config, allowsDown(index, scoringLimit)).map((score, index) => totals[index] + score), positions.map(() => 0));
  const complete = active.length === limit;
  const winners = zatIndex !== -1 ? [rounds[zatIndex].winner] : complete ? positions.filter(index => totals[index] === Math.min(...totals)) : [];
  return { limit, totals, complete, winners, ...(zatIndex !== -1 ? { reason: 'hind-zat' } : {}) };
}

export function recordRound(rounds, round, index = rounds.length, config) {
  if (!Number.isInteger(index) || index < 0 || index > rounds.length
      || (index === rounds.length && standings(rounds, config).complete)) {
    throw new Error('لا يمكن إضافة هذه اللعبة.');
  }
  if (round.type === 0 && !allowsKhalasa(rounds, index)) {
    throw new Error('لا يمكن اعتماد الخالصة في اللعبة الأخيرة.');
  }
  const updated = rounds.slice();
  if (round.type === HIND_ZAT) {
    if (index >= standings(rounds, config).limit) throw new Error('هند زات متاح للعبات النشطة.');
    round = { type: HIND_ZAT, winner: round.winner };
  }
  const capacity = jokerCapacity(round, config);
  if (hasLoserDeclaration(round)) {
    if (capacity === null) throw new Error('حدّد هل كان الفوز بجيكر أو بلون.');
    if (capacity === 0 || declaredJokers(round) > capacity) {
      throw new Error('الإعلان يتجاوز عدد الجياكر المتاحة.');
    }
  }
  updated[index] = round;
  const downAllowed = allowsDown(index, roundLimit(updated));
  updated[index] = downAllowed ? round : { ...round, down: participants(config).map(() => []) };
  scoreRound(updated[index], config, downAllowed);
  if (standings(updated, config).totals.some(total => !Number.isFinite(total))) {
    throw new Error('مجموع النقاط كبير جداً.');
  }
  return updated;
}

// Compare a fully scored next round with every opponent. Unentered down cards
// and failed declarations are omitted from the forecast.
export function scoreGaps(rounds, config, current = standings(rounds, config)) {
  if (config.mode !== 'teams' || config.count !== 3 || current.complete || rounds.length < 3) return;
  const { totals } = current;
  const leaderTotal = Math.min(...totals);
  const positions = [0, 1, 2];
  const lastRound = rounds.length === current.limit - 1;
  const types = TYPES.map((rule, type) => ({ ...rule, type }))
    .filter(({ type }) => type !== HIND_ZAT && (type !== 0 || allowsKhalasa(rounds, rounds.length)))
    .sort((a, b) => a.factor - b.factor);

  return totals.map((total, winner) => {
    const gap = Math.min(Number.MAX_VALUE, total - leaderTotal);
    if (gap === 0) return { gap };

    const opponents = positions.filter(index => index !== winner)
      .sort((a, b) => totals[a] - totals[b]);
    const canStay = lastRound && opponents.every(index => totals[index] < total)
      && totals[opponents[0]] < totals[opponents[1]];
    let tableWin;
    for (const { type, factor } of types) {
      for (const penalty of factor > 1 ? [null, ...opponents] : [null]) {
        const round = { winner, type, penalty, ...(type === 2 ? { jokerCount: 0 } : {}) };
        try {
          const next = standings(recordRound(rounds, round, rounds.length, config), config);
          const outcome = { gap, type, ...(penalty === null ? {} : { penalty }) };
          if (opponents.every(index => next.totals[winner] < next.totals[index])) return outcome;
          if (canStay && next.totals[winner] < next.totals[opponents[1]]) {
            tableWin ??= { ...outcome, table: true };
          }
        } catch (error) {
          // A hypothetical score can overflow when existing totals include very large manual adjustments.
          if (error.message !== 'مجموع النقاط كبير جداً.') throw error;
        }
      }
    }
    return tableWin ?? { gap, ...(canStay ? { out: true } : {}) };
  });
}

export function removeRound(rounds, index = rounds.length - 1) {
  return rounds.filter((_, position) => position !== index);
}

export const STORAGE_KEY = 'hind-calculator.v1';

export function matchConfig(match) {
  return { mode: match.mode ?? 'teams', count: match.names.length, jokers: match.jokers };
}

export function validMembers(members, count) {
  return Array.isArray(members) && members.length === count && members.every(team =>
    Array.isArray(team) && team.length === 2 && team.every(name =>
      typeof name === 'string' && name.length <= 40 && name === name.trim()));
}

export function saveMatch(storage, match) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...match, ...standings(match.rounds, matchConfig(match)) }));
}

export function loadMatch(storage) {
  try {
    const match = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!Array.isArray(match?.names) || !match.names.every(name => typeof name === 'string' && name.trim())
        || !Array.isArray(match.rounds) || match.rounds.length > 7) return null;
    const config = matchConfig(match);
    for (const round of match.rounds) scoreRound(round, config);
    if (standings(match.rounds, config).totals.some(total => !Number.isFinite(total))) return null;
    const { names, rounds, mode, pending, id, endedAt, jokers, members } = match;
    const redo = Array.isArray(match.redo) && rounds.length + match.redo.length <= 7 ? match.redo : [];
    for (const round of redo) scoreRound(round, config);
    return { names, rounds, ...(mode === undefined ? {} : { mode }), ...(pending ? { pending } : {}),
      ...(config.mode === 'teams' && validMembers(members, names.length) ? { members } : {}),
      ...(jokers === 2 || jokers === 3 ? { jokers } : {}),
      ...(typeof id === 'string' ? { id } : {}),
      ...(Number.isFinite(endedAt) ? { endedAt } : {}),
      ...(redo.length ? { redo } : {}) };
  } catch {
    return null;
  }
}
