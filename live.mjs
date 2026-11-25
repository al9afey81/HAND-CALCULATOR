import { firebaseConfig } from './live-config.mjs?v=2.8.2';
import { allowsDown, allowsPenalty, matchConfig, roundLimit, scoreGaps, scoreRound, standings, HIND_ZAT, validMembers } from './scoring.mjs?v=2.8.10';

export const configured = Boolean(firebaseConfig?.databaseURL && firebaseConfig?.apiKey);
export const validLiveId = id => /^[a-f0-9]{32}$/.test(id);
const cdn = 'https://www.gstatic.com/firebasejs/13.4.0/';
let database;
let owner;
let serverOffset = 0;

export const liveNow = () => Date.now() + serverOffset;

async function connect() {
  if (!configured) throw new Error('Live sharing is not configured');
  database ??= Promise.all([
    import(cdn + 'firebase-app.js'),
    import(cdn + 'firebase-database.js'),
  ]).then(([{ initializeApp }, sdk]) => {
    const app = initializeApp(firebaseConfig, 'hind-live');
    const db = sdk.getDatabase(app);
    sdk.onValue(sdk.ref(db, '.info/serverTimeOffset'), snapshot => {
      serverOffset = snapshot.val() ?? 0;
    });
    return { app, sdk, db };
  }).catch(error => {
    database = undefined;
    throw error;
  });
  return database;
}

async function ownerConnection() {
  owner ??= connect().then(async connection => {
    const { initializeAuth, browserLocalPersistence, signInAnonymously } = await import(cdn + 'firebase-auth.js');
    const auth = initializeAuth(connection.app, { persistence: browserLocalPersistence });
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return { ...connection, uid: user.uid };
  }).catch(error => {
    owner = undefined;
    throw error;
  });
  return owner;
}

export function liveSnapshot(match, kabru) {
  const config = matchConfig(match);
  const current = standings(match.rounds, config);
  const { limit, totals, complete, winners, reason } = current;
  const gaps = scoreGaps(match.rounds, config, current);
  const scheduledLimit = roundLimit(match.rounds);
  return {
    ...(config.mode === 'teams' && validMembers(match.members, config.count) ? { members: match.members } : {}),
    mode: config.mode, names: match.names, limit, totals, complete, winners, ...(reason ? { reason, scheduledLimit } : {}),
    ...(kabru ? { kabru } : {}), ...(gaps ? { gaps } : {}),
    scores: match.rounds.map((round, index) => scoreRound(round, config, allowsDown(index, scheduledLimit))),
  };
}

export function decodeLiveSnapshot(payload) {
  const { mode, names, limit, scores, totals, complete, winners, reason, scheduledLimit, kabru, gaps, members } = JSON.parse(payload);
  const count = names?.length;
  const supportedLimits = [5, 7, 9];
  const validScores = values => Array.isArray(values) && values.length === count && values.every(Number.isFinite);
  if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.trim() && name.length <= 40)
      || !(mode === 'solo' ? count >= 3 && count <= 5 : mode === 'teams' && (count === 2 || count === 3))
      || (reason === 'hind-zat'
        ? !Number.isInteger(limit) || limit < 1 || limit > 9 || complete !== true || winners?.length !== 1
        : reason !== undefined || !supportedLimits.includes(limit)) || !Array.isArray(scores) || scores.length > 9 || !scores.every(validScores)
      || !validScores(totals) || complete !== (scores.length >= limit) || !Array.isArray(winners)
      || winners.some(index => !Number.isInteger(index) || index < 0 || index >= count)
      || (complete ? !winners.length : winners.length)) throw new Error('Invalid live scores');
  const validSchedule = reason === 'hind-zat' && supportedLimits.includes(scheduledLimit) && scheduledLimit >= limit;
  const validGaps = !complete && scores.length >= 3
    && Array.isArray(gaps) && gaps.length === count && gaps.every((entry, index) => {
      if (!entry || entry.gap !== Math.min(Number.MAX_VALUE, totals[index] - Math.min(...totals))) return false;
      const { type, penalty, table, out } = entry;
      if (table !== undefined || out !== undefined) {
        const lastPlace = count >= 3 && totals.filter(total => total < totals[index]).length === count - 1
          && totals.filter(total => total === Math.min(...totals)).length === 1;
        if (!lastPlace || scores.length !== limit - 1 || (table !== undefined && table !== true)
            || (out !== undefined && out !== true)) return false;
      }
      if (type === undefined) return penalty === undefined && table === undefined;
      if (out !== undefined) return false;
      return entry.gap > 0 && Number.isInteger(type) && type >= 0 && type < HIND_ZAT
        && (penalty === undefined || (allowsPenalty({ mode, count }) && type > 0 && Number.isInteger(penalty)
          && penalty >= 0 && penalty < count && penalty !== index));
    });
  if (kabru !== undefined) {
    if (!kabru || typeof kabru.id !== 'string' || !/^[a-f0-9-]{36}$/.test(kabru.id)
        || !Array.isArray(kabru.positions) || !kabru.positions.length || kabru.positions.length >= count
        || new Set(kabru.positions).size !== kabru.positions.length
        || kabru.positions.some(index => !Number.isInteger(index) || index < 0 || index >= count)
        || (kabru.startsAt === undefined
          ? kabru.chosen !== undefined || kabru.duration !== undefined
          : !Number.isSafeInteger(kabru.startsAt) || kabru.startsAt <= 0
            || ![700, 4200].includes(kabru.duration) || !Number.isInteger(kabru.chosen)
            || kabru.chosen < 0 || kabru.chosen >= kabru.positions.length)) {
      throw new Error('Invalid live Kabru draw');
    }
  }
  return { mode, names, limit, scores, totals, complete, winners,
    ...(mode === 'teams' && validMembers(members, count) ? { members } : {}),
    ...(reason ? { reason, scheduledLimit: validSchedule ? scheduledLimit
      : supportedLimits.find(size => size >= scores.length) } : {}), ...(kabru ? { kabru } : {}), ...(validGaps ? { gaps } : {}) };

}

export async function createLive(id, payload) {
  const { sdk, db, uid } = await ownerConnection();
  await sdk.set(sdk.ref(db, 'liveMatches/' + id), { owner: uid, payload });
}

export async function publishLive(id, payload) {
  const { sdk, db } = await ownerConnection();
  await sdk.set(sdk.ref(db, 'liveMatches/' + id + '/payload'), payload);
}

export async function stopLive(id) {
  const { sdk, db } = await ownerConnection();
  await sdk.remove(sdk.ref(db, 'liveMatches/' + id));
}

export async function watchLive(id, onSnapshot, onError, onConnection) {
  const { sdk, db } = await connect();
  sdk.onValue(sdk.ref(db, '.info/connected'), snapshot => onConnection(snapshot.val() === true));
  sdk.onValue(sdk.ref(db, 'liveMatches/' + id), snapshot => {
    try {
      onSnapshot(snapshot.exists() ? decodeLiveSnapshot(snapshot.child('payload').val()) : null);
    } catch {
      onError();
    }
  }, onError);
}
