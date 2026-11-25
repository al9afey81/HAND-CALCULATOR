import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, THEMES, loadSettings, saveSettings } from '../settings.mjs';
import { HIND_ZAT, loadMatch, matchConfig, recordRound, saveMatch, scoreRound, standings } from '../scoring.mjs';
import { archiveMatch } from '../archive.mjs';
import { decodeLiveSnapshot, liveSnapshot } from '../live.mjs';

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
}

test('six themes, local persistence and default restoration', () => {
  const first = memoryStorage();
  const second = memoryStorage();
  assert.deepEqual(loadSettings(first), DEFAULT_SETTINGS);
  assert.equal(Object.keys(THEMES).length, 6);
  for (const theme of Object.keys(THEMES)) {
    const settings = saveSettings(first, { name: '  الديوانية  ', theme, baseRounds: 7, jokers: 2, penaltyEnabled: false });
    assert.deepEqual(loadSettings(first), settings);
    assert.equal(settings.name, 'الديوانية');
  }
  assert.deepEqual(loadSettings(second), DEFAULT_SETTINGS);
  assert.deepEqual(saveSettings(first, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(first), DEFAULT_SETTINGS);
});

for (const [mode, count] of [['teams', 2], ['teams', 3], ['solo', 3], ['solo', 4], ['solo', 5]]) {
  const names = Array.from({ length: count }, (_, i) => 'اسم ' + (i + 1));
  const round = type => ({ type, winner: 0, down: names.map(() => []), penalty: 1 });
  test(`${mode}/${count} supports both schedules, final-round restrictions, and archive/viewer scores`, () => {
    for (const baseRounds of [5, 7]) {
      for (const extend of [false, true]) {
        const match = { id: 'sample', mode, names, baseRounds, jokers: 2, penaltyEnabled: false, rounds: [] };
        const config = matchConfig(match);
        const limit = baseRounds + (extend ? 2 : 0);
        for (let i = 0; i < limit; i++) {
          if (i === limit - 1) assert.throws(() => recordRound(match.rounds, round(0), i, config), /الخالصة/);
          const next = round(extend && i === baseRounds - 1 ? 2 : 1);
          if (i === limit - 1) next.down[1] = [10];
          match.rounds = recordRound(match.rounds, next, i, config);
        }
        assert.deepEqual(match.rounds.at(-1).down[1], []);
        assert.equal(standings(match.rounds, config).limit, limit);
        assert.equal(standings(match.rounds, config).complete, true);
        assert.throws(() => recordRound(match.rounds, round(1), limit, config));
        const archived = archiveMatch([], match).entries[0];
        assert.equal(archived.limit, limit);
        const storage = memoryStorage();
        saveMatch(storage, match);
        assert.deepEqual(loadMatch(storage), match);
        const snapshot = decodeLiveSnapshot(JSON.stringify(liveSnapshot(match, undefined,
          { name: 'ديوانية الاختبار', theme: 'navy' })));
        assert.equal(snapshot.limit, limit);
        assert.deepEqual(snapshot.totals, archived.totals);
        assert.deepEqual(snapshot.scores, archived.scores);
        assert.deepEqual(snapshot.brand, { name: 'ديوانية الاختبار', theme: 'navy' });
      }
    }
  });

  test(`${mode}/${count} controls joker wins, loser declarations and penalty independently`, () => {
    const base = { mode, count };
    const off = { ...base, jokers: 2, penaltyEnabled: false };
    const on = { ...base, jokers: 3, penaltyEnabled: true };
    const noPenalty = (mode === 'teams' ? 400 : 200);
    assert.equal(scoreRound(round(1), off)[1], noPenalty);
    assert.equal(scoreRound(round(1), on)[1], noPenalty + (mode === 'teams' && count === 2 ? 0 : 50));
    for (const type of [5, 8]) {
      assert.throws(() => recordRound([], round(type), 0, off), /الجياكر/);
      assert.doesNotThrow(() => recordRound([], round(type), 0, on));
    }
    for (const declaration of [2, 6]) {
      const failed = { ...round(1), failed: [null, declaration] };
      assert.throws(() => recordRound([], failed, 0, off), /الجياكر/);
      assert.doesNotThrow(() => recordRound([], failed, 0, on));
    }
    assert.doesNotThrow(() => recordRound([], { ...round(1), failed: [null, 1] }, 0, off));
  });
}

test('legacy saves keep their rules and nine-round undo and early television finish survive', () => {
  const storage = memoryStorage();
  const round = { type: 2, winner: 0, down: [[], []] };
  const match = { mode: 'teams', names: ['ألف', 'باء'], jokers: 2, rounds: [round] };
  saveMatch(storage, match);
  assert.deepEqual(loadMatch(storage), match);
  const nine = { ...match, baseRounds: 7, rounds: Array(8).fill(round), redo: [round] };
  saveMatch(storage, nine);
  assert.deepEqual(loadMatch(storage), nine);
  const early = { ...nine, rounds: [round, { type: HIND_ZAT, winner: 1 }] };
  assert.equal(decodeLiveSnapshot(JSON.stringify(liveSnapshot(early))).scheduledLimit, 9);
});
