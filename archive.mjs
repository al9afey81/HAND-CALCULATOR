import { allowsDown, matchConfig, roundLimit, scoreRound, standings } from './scoring.mjs?v=2.8.2';

export const ARCHIVE_KEY = 'hind-calculator.archive.v1';
export const RETENTION = 7 * 24 * 60 * 60 * 1000;

export function readArchive(storage, now = Date.now()) {
  const raw = storage.getItem(ARCHIVE_KEY);
  const entries = JSON.parse(raw) ?? [];
  if (!Array.isArray(entries)) return [];
  const active = entries.filter(entry => entry && now - entry.endedAt < RETENTION);
  if (active.length !== entries.length) writeArchive(storage, active);
  return active.sort((a, b) => b.endedAt - a.endedAt);
}

export function writeArchive(storage, entries) {
  storage.setItem(ARCHIVE_KEY, JSON.stringify(entries));
}

export function archiveMatch(entries, match, now = Date.now()) {
  const config = matchConfig(match);
  const { limit, totals, complete, winners, reason } = standings(match.rounds, config);
  if (!complete) return { entries, match };
  const previous = entries.find(entry => entry.id === match.id);
  if (!previous && match.endedAt != null) return { entries, match };
  const endedAt = previous?.endedAt ?? now;
  const entry = {
    id: match.id,
    endedAt,
    mode: config.mode,
    names: match.names.slice(),
    rounds: structuredClone(match.rounds),
    scores: match.rounds.map((round, index) => scoreRound(round, config, allowsDown(index, roundLimit(match.rounds)))),
    limit, totals, winners, ...(reason ? { reason } : {}),
  };
  return {
    entries: [entry, ...entries.filter(item => item.id !== match.id)],
    match: { ...match, endedAt },
  };
}

export function moveRound(match, redo = false) {
  const future = match.redo ?? [];
  if (redo) {
    if (!future.length) return match;
    return { ...match, rounds: [...match.rounds, future[0]], redo: future.slice(1) };
  }
  if (!match.rounds.length) return match;
  return { ...match, rounds: match.rounds.slice(0, -1), redo: [match.rounds.at(-1), ...future] };
}
