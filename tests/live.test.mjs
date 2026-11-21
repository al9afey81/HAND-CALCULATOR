import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveMatch } from '../archive.mjs';
import { HIND_ZAT, matchConfig, recordRound } from '../scoring.mjs';
import { decodeLiveSnapshot, liveSnapshot, validLiveId } from '../live.mjs';

const round = (count, type = 1) => ({
  winner: 0, type, down: Array.from({ length: count }, () => []),
  ...(type === 2 ? { jokerCount: 1 } : {}),
});

for (const [mode, count] of [['teams', 2], ['teams', 3], ['solo', 3], ['solo', 4], ['solo', 5]]) {
  test(`live results for ${mode} with ${count} participants`, () => {
    const names = Array.from({ length: count }, (_, index) => `اسم ${index + 1}`);
    const rounds = Array.from({ length: 5 }, () => round(count));
    const match = { mode, names, rounds, pending: { private: true }, redo: [round(count)] };
    const snapshot = decodeLiveSnapshot(JSON.stringify(liveSnapshot(match)));
    assert.deepEqual(Object.keys(snapshot).sort(), ['complete', 'limit', 'mode', 'names', 'scores', 'totals', 'winners']);
    assert.deepEqual(snapshot.names, names);
    assert.deepEqual(snapshot.winners, [0]);
    assert.equal(snapshot.complete, true);
    assert.equal(snapshot.totals[0], -300);
    assert.equal(liveSnapshot({ ...match, rounds: rounds.slice(0, -1) }).complete, false);

    const edited = [...rounds.slice(0, -1), round(count, 2)];
    assert.equal(liveSnapshot({ ...match, rounds: edited }).limit, 7);
    const suspended = liveSnapshot({ ...match, rounds: [...rounds, round(count), round(count)] });
    assert.equal(suspended.scores.length, 7);
    assert.deepEqual(suspended.totals, snapshot.totals);
  });
}

test('viewer rejects malformed snapshots and invalid link IDs', () => {
  assert.equal(validLiveId('a'.repeat(32)), true);
  assert.equal(validLiveId('../other'), false);
  assert.throws(() => decodeLiveSnapshot(null));
  const snapshot = liveSnapshot({ names: ['أ', 'ب'], rounds: [] });
  assert.throws(() => decodeLiveSnapshot(JSON.stringify({ ...snapshot, winners: [2] })));
  assert.throws(() => decodeLiveSnapshot(JSON.stringify({ ...snapshot, scores: [[1]] })));
});

test('Hind Zat ends every mode immediately and survives the live snapshot', () => {
  for (const [mode, count] of [['teams', 2], ['teams', 3], ['solo', 3], ['solo', 4], ['solo', 5]]) {
    const match = { mode, names: Array.from({ length: count }, (_, i) => String(i)), rounds: [] };
    const zat = { winner: 1, type: HIND_ZAT, overrides: [100, -999] };
    match.rounds = recordRound([], zat, 0, matchConfig(match));
    const first = decodeLiveSnapshot(JSON.stringify(liveSnapshot(match)));
    assert.equal(first.limit, 1);
    assert.deepEqual(first.totals, Array(count).fill(0));
    assert.equal(first.reason, 'hind-zat');
    assert.deepEqual(first.winners, [1]);
    assert.equal(first.complete, true);

    match.rounds = recordRound([round(count)], zat, 1, matchConfig(match));
    const later = liveSnapshot(match);
    assert.ok(later.totals[0] < later.totals[1]);
    assert.deepEqual(later.winners, [1]);
    assert.deepEqual(later.scores[1], first.totals);
    assert.equal(archiveMatch([], { ...match, id: 'zat' }).entries[0].reason, 'hind-zat');
    assert.throws(() => recordRound(match.rounds, round(count), 2, matchConfig(match)));
    assert.equal(liveSnapshot({ ...match, rounds: match.rounds.slice(0, 1) }).complete, false);
  }
});

test('live Kabru carries the owner draw without changing the scores', () => {
  const match = { mode: 'teams', names: ['أ', 'ب', 'ج'], rounds: [round(3)] };
  const scores = liveSnapshot(match);
  const ready = { id: 'a'.repeat(36), positions: [1, 2] };
  const spin = { ...ready, chosen: 1, duration: 4200, startsAt: 1700000000000 };
  const decode = kabru => decodeLiveSnapshot(JSON.stringify({ ...scores, kabru }));
  for (const draw of [ready, spin]) {
    assert.deepEqual(liveSnapshot(match, draw), { ...scores, kabru: draw });
    assert.deepEqual(decode(draw), { ...scores, kabru: draw });
  }
  assert.deepEqual(decode(undefined), scores);
  for (const invalid of [
    { ...ready, positions: [1, 1] }, { ...ready, positions: [3] },
    { ...ready, chosen: 0 }, { ...spin, chosen: 2 },
    { ...spin, startsAt: -1 }, { ...spin, duration: 0 },
  ]) assert.throws(() => decode(invalid), /Invalid live Kabru draw/);
});

test('score gaps reach viewers with existing and current snapshots supported', () => {
  const match = { mode: 'teams', names: ['أ', 'ب', 'ج'], rounds: [
    { ...round(3), overrides: [0, 0, 0] },
    { ...round(3), overrides: [0, 0, 0] },
    { ...round(3), overrides: [0, 490, 700] },
  ] };
  const snapshot = liveSnapshot(match);
  assert.deepEqual(decodeLiveSnapshot(JSON.stringify(snapshot)).gaps,
    [{ gap: 0 }, { gap: 490, type: 1, penalty: 0 }, { gap: 700, type: 2 }]);
  for (const gaps of [undefined, [{ gap: 1 }], [{ gap: 0 }, { gap: 490, type: 1, penalty: 1 }, { gap: 700 }]]) {
    const decoded = decodeLiveSnapshot(JSON.stringify({ ...snapshot, gaps }));
    assert.equal(decoded.gaps, undefined);
    assert.deepEqual(decoded.totals, snapshot.totals);
  }
});

test('optional team members travel with the live snapshot without affecting scores', () => {
  const match = { mode: 'teams', names: ['أ', 'ب'], rounds: [round(2)] };
  const original = liveSnapshot(match);
  const members = [['علي', ''], ['يوسف', 'سالم']];
  const snapshot = liveSnapshot({ ...match, members });
  assert.deepEqual(decodeLiveSnapshot(JSON.stringify(snapshot)), { ...original, members });
  assert.deepEqual(decodeLiveSnapshot(JSON.stringify({ ...snapshot, members: [['invalid']] })), original);
});
