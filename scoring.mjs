export const TYPES = [
  { label: 'خالصة', factor: 1 },
  { label: 'هند عادي', factor: 2 },
  { label: 'هند جوكر أو لون', factor: 4 },
  ...[
    [1, false, 'جوكر'], [2, false, 'جوكرين'], [3, false, 'ثلاث جواكر'],
    [1, true, 'جوكر'], [2, true, 'جوكرين'], [3, true, 'ثلاث جواكر'],
  ].map(([jokers, color, label]) => ({
    label: `إعلان ${label}${color ? ' ولون' : ''}`,
    factor: jokers * 8 + (color ? 4 : 0),
  })),
];

export function cardValue(value) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const normalized = String(value ?? '').trim().replace(/[٠-٩۰-۹]/g, digit =>
    String(digits.includes(digit) ? digits.indexOf(digit) : digit.charCodeAt(0) - 1776)
  ).replace('٫', '.');
  const number = Number(normalized);
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number)) {
    throw new Error('أدخل نقاط الورق بقيمة رقمية غير سالبة لكل لاعب نازل.');
  }
  return number;
}

export function scoreRound({ winner, type, penalty = null, down = [[], [], []] }) {
  const rule = TYPES[type];
  if (!rule || ![0, 1, 2].includes(winner)) throw new Error('اختر فريقاً فائزاً ونوع الفوز.');
  const { factor } = rule;
  return [0, 1, 2].map(team => {
    if (team === winner) return -30 * factor;
    const hands = down[team];
    const score = (2 - hands.length) * 100 * factor
      + hands.reduce((sum, hand) => sum + cardValue(hand), 0) * factor
      + (factor > 1 && penalty === team ? 25 * factor : 0);
    if (!Number.isFinite(score)) throw new Error('قيمة نقاط الورق كبيرة جداً.');
    return score;
  });
}

export function standings(rounds) {
  const limit = rounds.some(round => TYPES[round.type].factor >= 4) ? 7 : 5;
  const active = rounds.slice(0, limit);
  const totals = active.reduce((totals, round) =>
    scoreRound(round).map((score, team) => totals[team] + score), [0, 0, 0]);
  const complete = active.length === limit;
  const winners = complete ? [0, 1, 2].filter(team => totals[team] === Math.min(...totals)) : [];
  return { limit, totals, complete, winners };
}

export function recordRound(rounds, round, index = rounds.length) {
  scoreRound(round);
  if (!Number.isInteger(index) || index < 0 || index > rounds.length
      || (index === rounds.length && standings(rounds).complete)) {
    throw new Error('لا يمكن إضافة هذه اللعبة.');
  }
  const updated = rounds.slice();
  updated[index] = round;
  if (standings(updated).totals.some(total => !Number.isFinite(total))) {
    throw new Error('مجموع النقاط كبير جداً.');
  }
  return updated;
}

export function removeRound(rounds, index = rounds.length - 1) {
  return rounds.filter((_, position) => position !== index);
}

export const STORAGE_KEY = 'hind-calculator.v1';

export function saveMatch(storage, match) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...match, ...standings(match.rounds) }));
}

export function loadMatch(storage) {
  try {
    const match = JSON.parse(storage.getItem(STORAGE_KEY));
    if (match?.names.length !== 3 || !match.names.every(name => typeof name === 'string' && name.trim())
        || !Array.isArray(match.rounds) || match.rounds.length > 7 || !match.rounds.every(round => {
          if (!Number.isInteger(round.type) || !TYPES[round.type]
              || ![0, 1, 2, null].includes(round.penalty)
              || !Array.isArray(round.down) || round.down.length !== 3
              || !round.down.every(hands => Array.isArray(hands) && hands.length <= 2)) return false;
          scoreRound(round);
          return true;
        })) return null;
    if (standings(match.rounds).totals.some(total => !Number.isFinite(total))) return null;
    return { names: match.names, rounds: match.rounds };
  } catch {
    return null;
  }
}
