import { firebaseConfig } from './live-config.mjs?v=2.8.2';
import { allowsDown, matchConfig, roundLimit, scoreRound, standings } from './scoring.mjs?v=2.8.2';

export const configured = Boolean(firebaseConfig?.databaseURL && firebaseConfig?.apiKey);
export const validLiveId = id => /^[a-f0-9]{32}$/.test(id);
const cdn = 'https://www.gstatic.com/firebasejs/13.4.0/';
let database;
let owner;

async function connect() {
  if (!configured) throw new Error('Live sharing is not configured');
  database ??= Promise.all([
    import(cdn + 'firebase-app.js'),
    import(cdn + 'firebase-database.js'),
  ]).then(([{ initializeApp }, sdk]) => {
    const app = initializeApp(firebaseConfig, 'hind-live');
    return { app, sdk, db: sdk.getDatabase(app) };
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

export function liveSnapshot(match) {
  const config = matchConfig(match);
  const { limit, totals, complete, winners, reason } = standings(match.rounds, config);
  return {
    mode: config.mode, names: match.names, limit, totals, complete, winners, ...(reason ? { reason } : {}),
    scores: match.rounds.map((round, index) => scoreRound(round, config, allowsDown(index, roundLimit(match.rounds)))),
  };
}

export function decodeLiveSnapshot(payload) {
  const { mode, names, limit, scores, totals, complete, winners, reason } = JSON.parse(payload);
  const count = names?.length;
  const validScores = values => Array.isArray(values) && values.length === count && values.every(Number.isFinite);
  if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.trim() && name.length <= 40)
      || !(mode === 'solo' ? count >= 3 && count <= 5 : mode === 'teams' && (count === 2 || count === 3))
      || (reason === 'hind-zat'
        ? !Number.isInteger(limit) || limit < 1 || limit > 7 || complete !== true || winners?.length !== 1
        : reason !== undefined || ![5, 7].includes(limit)) || !Array.isArray(scores) || scores.length > 7 || !scores.every(validScores)
      || !validScores(totals) || complete !== (scores.length >= limit) || !Array.isArray(winners)
      || winners.some(index => !Number.isInteger(index) || index < 0 || index >= count)
      || (complete ? !winners.length : winners.length)) throw new Error('Invalid live scores');
  return { mode, names, limit, scores, totals, complete, winners, ...(reason ? { reason } : {}) };
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
