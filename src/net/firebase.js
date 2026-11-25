// net/firebase.js — the real servers: Firebase Auth, Firestore and the
// Realtime Database. Same interface as dev.js.
//
// Firestore holds things that last: accounts, quizzes, answer keys.
// The Realtime Database holds live games, because it pushes small changes to
// many players in a few tens of milliseconds and charges by bandwidth rather
// than by write, which is what a game needs.

import { firebaseConfig, FIREBASE_SDK, SUPABASE } from '../config.js';
import { useEmulator } from './index.js';

export async function create() {
  // a school network can be slow or block the CDN; never hang for ever
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sdk-timeout')), 15000));
  const [A, F, D, S] = await Promise.race([Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-database.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]), timeout]);

  const app = A.initializeApp(firebaseConfig);
  const fa = F.getAuth(app);
  const db = D.getDatabase(app);
  const fs = S.getFirestore(app);
  if (useEmulator()) {
    // tests on localhost: the real SDK and the real rules, on local emulators
    F.connectAuthEmulator(fa, 'http://127.0.0.1:9099', { disableWarnings: true });
    D.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    S.connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }

  /* ------------------------------------------------------------ auth */

  // 2-step verification and passkeys run on Quickzy's own guard (a Supabase
  // function, free): it checks the code or the passkey, then hands back a
  // Firebase sign-in that is marked as verified ({ mfa: true }).
  const GUARD = `${SUPABASE.url}/functions/v1/guard`;
  async function guard(path, body = {}, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && fa.currentUser) headers.Authorization = `Bearer ${await fa.currentUser.getIdToken()}`;
    const r = await fetch(`${GUARD}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { const e = new Error(d.error || 'auth/network-request-failed'); e.code = d.error || 'auth/network-request-failed'; throw e; }
    return d;
  }
  let twoStepOn = false;   // the last answer from the guard, for shape()
  const WEBAUTHN = 'https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@13.3.0/+esm';

  const shape = (u) => (u ? {
    uid: u.uid,
    email: u.email || null,
    displayName: u.displayName || null,
    emailVerified: Boolean(u.emailVerified),
    isAnonymous: Boolean(u.isAnonymous),
    providers: (u.providerData || []).map((p) => p.providerId),
    mfa: twoStepOn ? [{ uid: 'totp', name: 'Authenticator app', kind: 'totp', at: null }] : [],
    lastSignIn: Date.parse(u.metadata && u.metadata.lastSignInTime) || null,
    created: Date.parse(u.metadata && u.metadata.creationTime) || null,
  } : null);

  /**
   * Run a sign-in (or a "prove it's you"). If the account has 2-step on and
   * this session has not passed the code, stop: the error carries finish(code),
   * which checks the code and signs in again as verified, and cancel(), which
   * signs out. `after` runs once signed in properly.
   */
  async function gated(fn, after) {
    const r = await fn();
    let st = null;
    try { st = await guard('status'); } catch { st = null; }
    twoStepOn = Boolean(st && st.totp);
    const claims = (await F.getIdTokenResult(fa.currentUser)).claims;
    if (st && st.totp && claims.mfa !== true) {
      const e = new Error('Two-step verification');
      e.code = 'auth/multi-factor-auth-required';
      e.finish = async (code) => {
        const { token } = await guard('totp/verify', { code: String(code).replace(/\D/g, '') });
        const c = await F.signInWithCustomToken(fa, token);
        if (after) await after();
        return shape(c.user);
      };
      e.cancel = () => F.signOut(fa);
      throw e;
    }
    if (after) await after();
    return shape((r && r.user) || fa.currentUser);
  }

  // wait for the persisted session before the app draws anything
  await new Promise((resolve) => {
    const stop = F.onAuthStateChanged(fa, () => { stop(); resolve(); });
  });

  const auth = {
    current: () => shape(fa.currentUser),
    onChange: (fn) => F.onAuthStateChanged(fa, (u) => fn(shape(u))),
    anon: async () => shape((await F.signInAnonymously(fa)).user),
    async google() {
      const provider = new F.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // a pop-up keeps working when the site and the auth domain differ,
      // which is the case on quickzy.web.app (auth domain akylduukodo.firebaseapp.com); a redirect does not reliably
      return gated(() => F.signInWithPopup(fa, provider));
    },
    signUp: async (email, password) => shape((await F.createUserWithEmailAndPassword(fa, email, password)).user),
    signIn: (email, password) => gated(() => F.signInWithEmailAndPassword(fa, email, password)),
    signOut: () => F.signOut(fa),
    // Firebase sends these emails itself: no mail server of our own is needed
    sendReset: (email) => F.sendPasswordResetEmail(fa, email, { url: `${location.origin}/login` }),
    sendVerify: () => F.sendEmailVerification(fa.currentUser, { url: `${location.origin}/settings` }),
    setDisplayName: (name) => F.updateProfile(fa.currentUser, { displayName: name }),
    changePassword(current, next) {
      const u = fa.currentUser;
      return gated(() => F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, current)), () => F.updatePassword(fa.currentUser, next));
    },
    /** Prove it is really them before something drastic. */
    reauth(password) {
      const u = fa.currentUser;
      return gated(() => (password ? F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, password)) : F.reauthenticateWithPopup(u, new F.GoogleAuthProvider())));
    },
    /** When this device last proved who it is (password, Google or code), in ms. */
    async authTime() {
      const r = await F.getIdTokenResult(fa.currentUser, true);
      return Date.parse(r.authTime);
    },
    /** The claims of this session ({ mfa: true } once the code or a passkey was used). */
    claims: async () => (fa.currentUser ? (await F.getIdTokenResult(fa.currentUser)).claims : {}),
    // 2-step verification with an authenticator app, checked by the guard
    mfa: {
      ready: async () => { try { return (await guard('health', {}, false)).ready === true; } catch { return false; } },
      async status() { const st = await guard('status'); twoStepOn = Boolean(st.totp); return st; },
      async start() {
        const r = await guard('totp/start');
        return {
          key: r.key, uri: r.uri,
          finish: async (code) => {
            const { token } = await guard('totp/enable', { code: String(code).replace(/\D/g, '') });
            await F.signInWithCustomToken(fa, token);
            twoStepOn = true;
          },
        };
      },
      async remove() { await guard('totp/disable'); twoStepOn = false; },
    },
    // passkeys: the fingerprint, face or screen lock of this device
    passkeys: {
      supported: () => typeof window !== 'undefined' && Boolean(window.PublicKeyCredential),
      async add(name) {
        const { id, options } = await guard('passkey/register/options');
        const { startRegistration } = await import(WEBAUTHN);
        const response = await startRegistration({ optionsJSON: options });
        await guard('passkey/register/verify', { id, response, name });
      },
      remove: (id) => guard('passkey/remove', { id }),
      async signIn() {
        const { id, options } = await guard('passkey/login/options', {}, false);
        const { startAuthentication } = await import(WEBAUTHN);
        const response = await startAuthentication({ optionsJSON: options });
        const { token } = await guard('passkey/login/verify', { id, response }, false);
        return shape((await F.signInWithCustomToken(fa, token)).user);
      },
    },
    // call reauth() first: Firebase refuses to delete an account signed in long ago
    deleteAccount: async () => F.deleteUser(fa.currentUser),
    async reload() { if (fa.currentUser) { await F.reload(fa.currentUser); try { twoStepOn = Boolean((await guard('status')).totp); } catch { /* keep */ } } return shape(fa.currentUser); },
  };

  /* ----------------------------------------------------------- store */

  // Firestore hands back Timestamp objects; the app works in milliseconds
  const plain = (v) => {
    if (v && typeof v === 'object') {
      if (typeof v.toMillis === 'function') return v.toMillis();
      if (Array.isArray(v)) return v.map(plain);
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = plain(x);
      return out;
    }
    return v;
  };
  const docRef = (col, id) => S.doc(fs, col, id);
  const build = (col, q = {}) => {
    const parts = [S.collection(fs, col)];
    for (const [field, op, value] of q.where || []) parts.push(S.where(field, op, value));
    if (q.orderBy) parts.push(S.orderBy(q.orderBy[0], q.orderBy[1] || 'asc'));
    if (q.limit) parts.push(S.limit(q.limit));
    return S.query(...parts);
  };

  const store = {
    async get(col, id) {
      const snap = await S.getDoc(docRef(col, id));
      return snap.exists() ? { id: snap.id, ...plain(snap.data()) } : null;
    },
    set: (col, id, data, opts = {}) => S.setDoc(docRef(col, id), data, { merge: Boolean(opts.merge) }),
    update: (col, id, data) => S.updateDoc(docRef(col, id), data),
    del: (col, id) => S.deleteDoc(docRef(col, id)),
    add: async (col, data) => (await S.addDoc(S.collection(fs, col), data)).id,
    async query(col, q = {}) {
      const snap = await S.getDocs(build(col, q));
      return snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
    },
    async count(col, q = {}) {
      const snap = await S.getCountFromServer(build(col, { where: q.where }));
      return snap.data().count;
    },
    async batch(steps) {
      const b = S.writeBatch(fs);
      for (const s of steps) {
        const ref = docRef(s.col, s.id);
        if (s.op === 'set') b.set(ref, s.data, { merge: Boolean(s.merge) });
        else if (s.op === 'update') b.update(ref, s.data);
        else if (s.op === 'del' || s.op === 'delete') b.delete(ref);
      }
      await b.commit();
    },
    serverTime: () => S.serverTimestamp(),
    increment: (n) => S.increment(n),
    deleteField: () => S.deleteField(),
  };

  /* ------------------------------------------------------------ live */

  let offset = 0;
  D.onValue(D.ref(db, '.info/serverTimeOffset'), (snap) => { offset = Number(snap.val()) || 0; });

  const live = {
    TIMESTAMP: D.serverTimestamp(),
    increment: (n) => D.increment(n),
    now: () => Date.now() + offset,
    get: async (path) => (await D.get(D.ref(db, path))).val(),
    set: (path, value) => D.set(D.ref(db, path), value),
    update: (path, value) => D.update(D.ref(db, path), value),
    remove: (path) => D.remove(D.ref(db, path)),
    push: async (path, value) => (await D.push(D.ref(db, path), value)).key,
    async query(path, o = {}) {
      const parts = [D.ref(db, path)];
      if (o.orderBy === '$value') parts.push(D.orderByValue());
      else if (o.orderBy) parts.push(D.orderByChild(o.orderBy));
      if (o.equalTo !== undefined) parts.push(D.equalTo(o.equalTo));
      if (o.endAt !== undefined) parts.push(D.endAt(o.endAt));
      if (o.limitToFirst) parts.push(D.limitToFirst(o.limitToFirst));
      if (o.limitToLast) parts.push(D.limitToLast(o.limitToLast));
      return (await D.get(D.query(...parts))).val();
    },
    on(path, fn) {
      return D.onValue(D.ref(db, path), (snap) => fn(snap.val()), (err) => console.warn('live read refused', path, err.code));
    },
    /** Each child of `path` once, as it is added, oldest first. */
    onChild(path, fn) {
      return D.onChildAdded(D.ref(db, path), (snap) => fn(snap.key, snap.val()), (err) => console.warn('live read refused', path, err.code));
    },
    async transaction(path, fn) {
      const r = await D.runTransaction(D.ref(db, path), (current) => fn(current === undefined ? null : current));
      return { committed: r.committed, value: r.snapshot.val() };
    },
    onDisconnect(path, action) {
      const od = D.onDisconnect(D.ref(db, path));
      if (action.remove) od.remove(); else od.set(action.set);
      return () => od.cancel();
    },
  };

  // a refused write is reported in the console even where the caller shrugs
  // it off, so it never fails silently
  const loud = (obj, names, kind) => {
    for (const n of names) {
      const fn = obj[n];
      obj[n] = (...args) => {
        const out = fn(...args);
        if (out && typeof out.catch === 'function') {
          out.catch((err) => console.warn(`${kind}.${n} refused`, String(args[0]), err && (err.code || err.message)));
        }
        return out;
      };
    }
  };
  loud(live, ['set', 'update', 'remove', 'push'], 'live');
  loud(store, ['set', 'update', 'del', 'add', 'batch'], 'store');

  return { kind: 'firebase', auth, store, live };
}
