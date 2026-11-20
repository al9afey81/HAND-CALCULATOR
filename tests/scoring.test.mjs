import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardValue, scoreRound, standings, recordRound, removeRound, saveMatch, loadMatch, STORAGE_KEY } from '../scoring.mjs';

function round(type = 0, penalty = null, down = [[], [], []], winner = 0) {
  return { type, penalty, down, winner, ...(type === 2 ? { jokerCount: 1 } : {}) };
}

const cases = [
  ['خالصة', round(), [-30, 200, 200]],
  ['هند عادي', round(1), [-60, 400, 400]],
  ['هند مع شرهة', round(1, 1), [-60, 450, 400]],
  ['هند جوكر أو لون', round(2), [-120, 800, 800]],
  ['إعلان جوكر', round(3), [-240, 1600, 1600]],
  ['إعلان جوكرين', round(4), [-480, 3200, 3200]],
  ['إعلان ثلاث جواكر', round(5), [-720, 4800, 4800]],
  ['إعلان جوكر ولون', round(6), [-360, 2400, 2400]],
  ['إعلان جوكرين ولون', round(7), [-600, 4000, 4000]],
  ['إعلان ثلاث جواكر ولون', round(8), [-840, 5600, 5600]],
  ['إعلان ثلاث جواكر مع شرهة', round(5, 1), [-720, 5400, 4800]],
  ['نازل بيده ٤ في الهند', round(1, null, [[], [4], []]), [-60, 208, 400]],
  ['نازل بيده ٥ في الخالصة', round(0, null, [[], [5], []]), [-30, 105, 200]],
  ['نازل بيده ١٠ في هند جوكر أو لون', round(2, null, [[], [10], []]), [-120, 440, 800]],
  ['نازل بيده ١٠ في إعلان جوكر', round(3, null, [[], [10], []]), [-240, 880, 1600]],
  ['لاعبان نازلان', round(1, null, [[], [10, 15], []]), [-60, 50, 400]],
  ['نزول في كلا الفريقين مع شرهة', round(1, 2, [[], [4], [10, 15]]), [-60, 208, 100]],
  ['تجاهل الشرهة في الخالصة', round(0, 1), [-30, 200, 200]],
  ['منع الشرهة على الفائز', round(1, 2, [[], [], []], 2), [400, 400, -60]],
];
for (const [name, data, expected] of cases) {
  test(name, () => assert.deepEqual(scoreRound(data), expected));
}

test('قيم ورق غير صالحة', () => {
  for (const value of [-1, '', null, ' ', 'abc', '3e2', Infinity, NaN, '4-1']) {
    assert.throws(() => scoreRound(round(1, null, [[], [value], []])), /غير سالبة/);
  }
  assert.equal(cardValue('٠'), 0);
  assert.equal(cardValue('۱۲٫۵'), 12.5);
});

test('تمديد المباراة في اللعبة الخامسة لكل نوع مؤهل وحد أقصى سبع لعبات', () => {
  const firstFour = [round(), round(1), round(), round()];
  for (const type of [2, 3, 4, 5, 6, 7, 8]) {
    let rounds = recordRound(firstFour, round(type));
    assert.equal(standings(rounds).limit, 7);
    assert.equal(standings(rounds).complete, false);
    rounds = recordRound(recordRound(rounds, round(type)), round(1));
    assert.equal(standings(rounds).complete, true);
    assert.throws(() => recordRound(rounds, round(type)));
  }
  const rounds = recordRound(firstFour, round(1));
  assert.equal(standings(rounds).limit, 5);
  assert.throws(() => recordRound(rounds, round()));
});

test('إعادة الحساب بعد التعديل والحذف والتراجع مع استعادة اللعبات المعلّقة', () => {
  const original = [round(2), ...Array.from({ length: 6 }, () => round())];
  const edited = recordRound(original, round(), 0);
  assert.deepEqual(standings(edited), { limit: 5, totals: [-150, 1000, 1000], complete: true, winners: [0] });
  assert.equal(edited.length, 7);
  assert.deepEqual(standings(recordRound(edited, round(2), 0)), standings(original));
  assert.equal(standings(removeRound(original, 0)).limit, 5);
  assert.deepEqual(standings(removeRound(original)).totals, [-270, 1800, 1800]);
  assert.equal(standings(removeRound(original)).complete, false);
});

test('النتيجة النهائية تسمح بالتعادل في أقل مجموع', () => {
  const zeroHands = [[0, 0], [0, 0], []];
  const rounds = [round(1, 2, zeroHands, 0), round(1, 2, zeroHands, 1),
    round(0, null, zeroHands, 0), round(0, null, zeroHands, 1), round(0, null, zeroHands, 2)];
  assert.deepEqual(standings(rounds).winners, [0, 1]);
});

test('حفظ المباراة واستعادتها من التخزين في جلسة جديدة', () => {
  const entries = new Map();
  const session = () => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  const match = { names: ['الأول', 'الثاني', 'الثالث'], rounds: [round(2, 1, [[], ['١٠'], []])] };
  saveMatch(session(), match);
  assert.deepEqual(loadMatch(session()), match);
  const stored = JSON.parse(entries.get(STORAGE_KEY));
  assert.deepEqual(stored.totals, [-120, 540, 800]);
  assert.equal(stored.limit, 7);
  assert.equal(stored.complete, false);
  entries.set(STORAGE_KEY, '{اختبار');
  assert.equal(loadMatch(session()), null);
});

const phaseTwoModes = [
  { mode: 'teams', count: 2 },
  { mode: 'teams', count: 3 },
  { mode: 'solo', count: 3 },
  { mode: 'solo', count: 4 },
  { mode: 'solo', count: 5 },
];
const factors = [1, 2, 4, 8, 16, 24, 12, 20, 28];

for (const config of phaseTwoModes) {
  const { mode, count } = config;
  const seats = mode === 'solo' ? 1 : 2;
  const hasPenalty = mode !== 'teams' || count !== 2;
  const regular = (type = 0) => round(type, null, Array.from({ length: count }, () => []));
  test(`${mode} / ${count}: جميع أنواع الفوز والنزول والشرهة`, () => {
    for (const [type, factor] of factors.entries()) {
      const data = regular(type);
      assert.deepEqual(scoreRound(data, config), [-30 * factor, ...Array(count - 1).fill(100 * seats * factor)]);
      data.down[1] = [10];
      data.penalty = 1;
      const scores = scoreRound(data, config);
      assert.equal(scores[1], ((seats - 1) * 100 + 10 + (type !== 0 && hasPenalty ? 25 : 0)) * factor);
      assert.equal(scores[0], -30 * factor);
      assert.ok(scores.slice(2).every(score => score === 100 * seats * factor));
    }
  });

  test(`${mode} / ${count}: الغرامات مستقلة عن الشرهة والنزول`, () => {
    for (const [kind, units] of [1, 2, 3, 1, 2, 3, 4].entries()) {
      const data = { ...regular(1), failed: [kind, kind], penalty: 1 };
      data.down[1] = Array(seats).fill(10);
      const scores = scoreRound(data, config);
      assert.equal(scores[0], -60);
      assert.equal(scores[1], 20 * seats + (hasPenalty ? 50 : 0) + units * 100 * seats);
      assert.ok(scores.slice(2).every(score => score === 200 * seats));
    }
  });

  test(`${mode} / ${count}: مجموع الجياكر المتاحة والإعلان باللون`, () => {
    const failed = [null, 2];
    assert.doesNotThrow(() => recordRound([], { ...regular(1), failed }, 0, config));
    assert.throws(() => recordRound([], { ...regular(2), failed }, 0, config), /الجياكر/);
    assert.doesNotThrow(() => recordRound([], { ...regular(2), jokerCount: 0, failed }, 0, config));
    const unspecified = { ...regular(2), jokerCount: null };
    assert.deepEqual(standings(recordRound([], unspecified, 0, config), config).totals,
      scoreRound(regular(2), config));
    assert.throws(() => recordRound([], { ...unspecified, failed }, 0, config), /حدّد/);
    assert.throws(() => recordRound([], { ...unspecified, failed: [null, 3] }, 0, config), /حدّد/);
    assert.doesNotThrow(() => recordRound([], { ...regular(2), failed: [null, 1] }, 0, config));
    assert.throws(() => recordRound([], { ...regular(5), failed: [null, 3] }, 0, config), /الجياكر/);
    assert.doesNotThrow(() => recordRound([], { ...regular(4), failed: [null, 4] }, 0, config));
    if (count > 2) {
      assert.throws(() => recordRound([], { ...regular(3), failed: [null, 1, 0] }, 0, config), /الجياكر/);
      assert.doesNotThrow(() => recordRound([], { ...regular(3), failed: [null, 1, 3] }, 0, config));
    }
  });

  test(`${mode} / ${count}: منع النزول في الخامسة أو السابعة حسب حد المباراة`, () => {
    const four = Array.from({ length: 4 }, () => regular());
    const downRound = regular(1);
    downRound.down[1] = [10];
    const five = recordRound(four, downRound, 4, config);
    assert.deepEqual(five[4].down[1], []);
    assert.equal(standings([...four, downRound], config).totals[1], 600 * seats);

    const extended = regular(2);
    extended.down[1] = [10];
    const fifth = recordRound(four, extended, 4, config);
    assert.deepEqual(fifth[4].down[1], [10]);
    const sixth = recordRound(fifth, downRound, 5, config);
    const seventh = recordRound(sixth, downRound, 6, config);
    assert.deepEqual(seventh[6].down[1], []);
    assert.equal(standings([...sixth, downRound], config).totals[1], standings(seventh, config).totals[1]);
    const shortened = recordRound(seventh, regular(1), 4, config);
    assert.equal(standings(shortened, config).limit, 5);
    assert.equal(standings(shortened, config).totals[1], 600 * seats);
  });

  test(`${mode} / ${count}: الخالصة مسموحة قبل اللعبة الأخيرة فقط`, () => {
    const firstFour = Array.from({ length: 4 }, () => regular());
    assert.throws(() => recordRound(firstFour, regular(), 4, config), /الخالصة في اللعبة الأخيرة/);
    const extended = [regular(2), ...firstFour.slice(1)];
    const fifth = recordRound(extended, regular(), 4, config);
    const sixth = recordRound(fifth, regular(), 5, config);
    assert.throws(() => recordRound(sixth, regular(), 6, config), /الخالصة في اللعبة الأخيرة/);
    const extensionAtFive = recordRound(firstFour, regular(2), 4, config);
    assert.throws(() => recordRound(extensionAtFive, regular(), 4, config), /الخالصة في اللعبة الأخيرة/);
    assert.doesNotThrow(() => standings([...firstFour, regular()], config));
  });

  test(`${mode} / ${count}: حد اللعبات والحفظ واستبدال النقاط`, () => {
    const firstFour = Array.from({ length: 4 }, () => regular());
    const five = recordRound(firstFour, regular(1), 4, config);
    assert.equal(standings(five, config).complete, true);
    for (const type of [2, 3, 4, 5, 6, 7, 8]) {
      const extended = recordRound(firstFour, regular(type), 4, config);
      assert.equal(standings(extended, config).limit, 7);
      const six = recordRound(extended, regular(), 5, config);
      const seven = recordRound(six, regular(1), 6, config);
      assert.equal(standings(seven, config).complete, true);
      assert.throws(() => recordRound(seven, regular(), 7, config));
    }
    const overridden = { ...regular(1), overrides: ['+١٥٠', '−٥'] };
    let rounds = recordRound([], overridden, 0, config);
    assert.deepEqual(standings(rounds, config).totals.slice(0, 2), [150, -5]);
    rounds = recordRound(rounds, { ...overridden, overrides: [null, 0] }, 0, config);
    assert.deepEqual(standings(rounds, config).totals.slice(0, 2), [-60, 0]);
    assert.throws(() => scoreRound({ ...overridden, overrides: ['abc'] }, config));
    const entries = new Map();
    const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
    const match = { mode, names: Array.from({ length: count }, (_, index) => `اسم ${index}`), rounds };
    saveMatch(storage, match);
    assert.deepEqual(loadMatch(storage), match);
  });
}


test('تجاهل شرهة كابروا المحفوظة في مباراة فريقين مع الحفاظ على بيانات الجولة', () => {
  const savedRound = { ...round(1, 1, [[], []]), kabruDrawn: true };
  const match = { mode: 'teams', names: ['اسم 1', 'اسم 2'], rounds: [savedRound] };
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  saveMatch(storage, match);
  assert.deepEqual(loadMatch(storage), match);
  assert.deepEqual(JSON.parse(entries.get(STORAGE_KEY)).totals, [-60, 400]);
  assert.deepEqual(scoreRound({ ...savedRound, overrides: [null, 450] }, { mode: 'teams', count: 2 }), [-60, 450]);
});

test('two-team games can cap winning and losing declarations at two jokers', () => {
  const two = { mode: 'teams', count: 2, jokers: 2 };
  const three = { ...two, jokers: 3 };
  const hands = [[], []];
  for (const type of [5, 8]) {
    const data = round(type, null, hands);
    assert.throws(() => scoreRound(data, two));
    assert.doesNotThrow(() => recordRound([], data, 0, three));
  }
  for (const declaration of [2, 6]) {
    const data = { ...round(1, null, hands), failed: [null, declaration] };
    assert.throws(() => scoreRound(data, two));
    assert.doesNotThrow(() => recordRound([], data, 0, three));
  }
  const combined = { ...round(3, null, hands), failed: [null, 1] };
  assert.throws(() => recordRound([], combined, 0, two));
  assert.doesNotThrow(() => recordRound([], combined, 0, three));
  assert.doesNotThrow(() => recordRound([], { ...round(1, null, hands), failed: [null, 5] }, 0, two));
});
