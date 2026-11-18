import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveMatch, moveRound, readArchive, writeArchive, RETENTION } from '../archive.mjs';
import { loadMatch, saveMatch, standings, matchConfig } from '../scoring.mjs';

const basic = { winner: 0, type: 0, down: [[], [], []] };
const special = { winner: 1, type: 2, jokerCount: 1, penalty: 2, kabruDrawn: true,
  failed: [null, null, 0], overrides: [null, -111, null], down: [[4], [], []] };
const completed = { id: 'match-1', names: ['أ', 'ب', 'ج'], rounds: Array.from({ length: 5 }, () => basic) };

function storageFixture() {
  const data = new Map();
  return () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
}

test('أرشفة النتيجة واللعبات مرة واحدة مع الحفاظ على وقت الانتهاء', () => {
  const archived = archiveMatch([], completed, 1000);
  const [entry] = archived.entries;
  assert.equal(entry.endedAt, 1000);
  assert.equal(entry.mode, 'teams');
  assert.deepEqual(entry.winners, [0]);
  assert.deepEqual(entry.rounds, completed.rounds);
  assert.deepEqual(entry.scores[0], [-30, 200, 200]);
  assert.deepEqual(entry.totals, [-150, 1000, 1000]);
  const updated = archiveMatch([{ ...entry, pinned: true }], archived.match, 2000);
  assert.deepEqual(updated.entries, [entry]);
  assert.deepEqual(archiveMatch([], archived.match, 3000).entries, []);
  assert.deepEqual(archiveMatch([], moveRound(completed), 1000).entries, []);
});

test('ترتيب السجل وحذف كل مباراة بعد سبعة أيام بما فيها المثبّتة سابقاً', () => {
  const session = storageFixture();
  const first = archiveMatch([], completed, 1000).entries[0];
  const newer = { ...first, id: 'match-2', endedAt: 2000 };
  const pinned = { ...first, id: 'pinned', pinned: true };
  writeArchive(session(), [first, pinned, newer]);
  assert.deepEqual(readArchive(session(), RETENTION + 999), [newer, first, pinned]);
  assert.deepEqual(readArchive(session(), RETENTION + 1000), [newer]);
  assert.deepEqual(readArchive(session(), RETENTION + 999), [newer]);
  writeArchive(session(), []);
  assert.deepEqual(readArchive(session()), []);
});

test('التراجع والإعادة المتسلسلان يعيدان بيانات اللعبة كاملة بعد إعادة التحميل', () => {
  const session = storageFixture();
  const match = { ...completed, mode: 'solo', rounds: [...completed.rounds.slice(0, 3), special, basic] };
  const expected = standings(match.rounds, matchConfig(match));
  let undone = moveRound(moveRound(match));
  assert.equal(undone.rounds.length, 3);
  assert.deepEqual(undone.redo, [special, basic]);
  assert.equal(standings(undone.rounds, matchConfig(match)).limit, 5);
  saveMatch(session(), undone);
  undone = loadMatch(session());
  const restored = moveRound(moveRound(undone, true), true);
  assert.deepEqual(restored.rounds, match.rounds);
  assert.deepEqual(restored.redo, []);
  assert.deepEqual(standings(restored.rounds, matchConfig(match)), expected);
  assert.equal(moveRound(restored, true), restored);
});

test('استعادة اللعبة الأخيرة تعيد حالة انتهاء المباراة وتحافظ على السجل بعد مباراة جديدة', () => {
  const session = storageFixture();
  const archived = archiveMatch([], completed, 1000);
  writeArchive(session(), archived.entries);
  saveMatch(session(), moveRound(archived.match));
  let match = loadMatch(session());
  assert.equal(standings(match.rounds, matchConfig(match)).complete, false);
  match = moveRound(match, true);
  assert.equal(standings(match.rounds, matchConfig(match)).complete, true);
  saveMatch(session(), { ...completed, id: 'match-2', rounds: [] });
  assert.deepEqual(readArchive(session(), 1500), archived.entries);
});
