import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardValue, scoreRound, standings, recordRound, removeRound, saveMatch, loadMatch, STORAGE_KEY } from '../scoring.mjs';

function round(type = 0, penalty = null, down = [[], [], []], winner = 0) {
  return { type, penalty, down, winner };
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
    rounds = recordRound(recordRound(rounds, round(type)), round());
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
  const zeroHands = [[0, 0], [0, 0], [0, 0]];
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
