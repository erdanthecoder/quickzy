// guard — Quickzy's free sign-in guard: 2-step verification codes and
// passkeys, for accounts that live in Firebase Authentication.
//
// How it stays safe:
//   * Every request (except passkey sign-in) carries the person's Firebase
//     ID token, checked here against Google's public keys.
//   * When a code or a passkey is right, this function hands back a Firebase
//     custom token carrying { mfa: true }. Signing in with it gives a session
//     that the Firestore rules accept. A session that skipped the code (a
//     password alone) cannot change anything once 2-step is on.
//   * The 2-step keys and passkeys are kept in the "guard" schema, which the
//     public Supabase API cannot reach. The Firebase key is a Supabase secret
//     (FIREBASE_SERVICE_ACCOUNT) that only the owner sets.
//   * Wrong codes are limited: 5 tries in 15 minutes, then wait.

import postgres from 'npm:postgres@3.4.5';
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'npm:jose@5.10.0';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@13.3.3';

const PROJECT = 'akylduukodo';
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 3, prepare: false });
const ORIGINS = ['https://quickzy.web.app', 'https://quickzy.work.gd', 'https://akylduukodo.web.app', 'https://akylduukodo.firebaseapp.com'];
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

/* ----------------------------------------------------------- helpers */

const json = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  },
});
class Fail extends Error { constructor(public code: string, public status = 400) { super(code); } }

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Who is asking: a verified Firebase ID token. */
async function caller(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Fail('auth/requires-recent-login', 401);
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    if (!payload.sub || (payload as any).firebase?.sign_in_provider === 'anonymous') throw new Error('anon');
    return payload as Record<string, any> & { sub: string; auth_time: number; email?: string };
  } catch {
    throw new Fail('auth/requires-recent-login', 401);
  }
}
const recent = (who: { auth_time: number }) => Date.now() / 1000 - who.auth_time < 10 * 60;

/** The Firebase service-account key: a Supabase secret the owner pastes in once. */
function serviceAccount() {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Fail('auth/operation-not-allowed', 503);
  const sa = JSON.parse(raw);
  if (sa.project_id !== PROJECT) throw new Fail('auth/operation-not-allowed', 503);
  return sa;
}

async function googleToken(sa: any, scope: string) {
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: sa.private_key_id })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}`);
  return (await r.json()).access_token as string;
}

/** A Firebase custom token: signing in with it makes a session marked as verified. */
async function customToken(uid: string, claims: Record<string, unknown>) {
  const sa = serviceAccount();
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid, claims })
    .setProtectedHeader({ alg: 'RS256', kid: sa.private_key_id })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
}

/** Tell the Firestore rules whether this account needs the code: mfa/{uid}. */
async function markFirestore(uid: string, on: boolean) {
  const sa = serviceAccount();
  const token = await googleToken(sa, 'https://www.googleapis.com/auth/datastore');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/mfa/${encodeURIComponent(uid)}`;
  const r = on
    ? await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { on: { booleanValue: true }, at: { integerValue: String(Date.now()) } } }) })
    : await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`firestore ${r.status}`);
}

/* ------------------------------------------------- time-based codes */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes: Uint8Array) { let bits = ''; for (const b of bytes) bits += b.toString(2).padStart(8, '0'); let out = ''; for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function unbase32(s: string) { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); }
async function codeAt(secret: string, step: number) {
  const key = await crypto.subtle.importKey('raw', unbase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const ctr = new Uint8Array(8); new DataView(ctr.buffer).setBigUint64(0, BigInt(step));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, ctr));
  const o = mac[mac.length - 1] & 15;
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
/** The 30-second step a code belongs to (one step either side allowed), or -1. */
async function matchStep(secret: string, code: string) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return -1;
  const now = Math.floor(Date.now() / 30000);
  for (const s of [now, now - 1, now + 1]) if (await codeAt(secret, s) === clean) return s;
  return -1;
}
async function limit(key: string) {
  await sql`delete from guard.attempts where at < now() - interval '15 minutes'`;
  const [{ n }] = await sql`select count(*)::int as n from guard.attempts where key = ${key}`;
  if (n >= 5) throw new Fail('auth/too-many-requests', 429);
}
const missed = (key: string) => sql`insert into guard.attempts (key) values (${key})`;

/** Check a code for an account with 2-step on; never accepts the same code twice. */
async function checkCode(uid: string, code: string) {
  await limit(`totp:${uid}`);
  const [row] = await sql`select secret, last_step from guard.totp where uid = ${uid} and enabled_at is not null`;
  if (!row) throw new Fail('auth/operation-not-allowed');
  const step = await matchStep(row.secret, code);
  if (step < 0 || step <= Number(row.last_step)) { await missed(`totp:${uid}`); throw new Fail('auth/invalid-verification-code'); }
  await sql`update guard.totp set last_step = ${step} where uid = ${uid}`;
}

/* ---------------------------------------------------------- routes */

async function route(path: string, req: Request, body: any, origin: string) {
  if (path === 'health') {
    try { serviceAccount(); return { ready: true }; } catch { return { ready: false }; }
  }

  const rpID = new URL(origin).hostname;

  // passkey sign-in: nobody is signed in yet
  if (path === 'passkey/login/options') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    const id = crypto.randomUUID();
    await sql`delete from guard.challenges where created_at < now() - interval '10 minutes'`;
    await sql`insert into guard.challenges (id, kind, challenge) values (${id}, 'login', ${options.challenge})`;
    return { id, options };
  }
  if (path === 'passkey/login/verify') {
    const [ch] = await sql`delete from guard.challenges where id = ${String(body.id || '')} and kind = 'login' and created_at > now() - interval '5 minutes' returning challenge`;
    if (!ch) throw new Fail('auth/timeout');
    const resp = body.response;
    const [cred] = await sql`select * from guard.passkeys where id = ${String(resp && resp.id || '')}`;
    if (!cred) throw new Fail('auth/passkey-unknown');
    const v = await verifyAuthenticationResponse({
      response: resp, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: cred.id, publicKey: unb64url(cred.public_key), counter: Number(cred.counter), transports: cred.transports || undefined },
    });
    if (!v.verified) throw new Fail('auth/passkey-failed');
    await sql`update guard.passkeys set counter = ${v.authenticationInfo.newCounter}, last_used = now() where id = ${cred.id}`;
    return { token: await customToken(cred.uid, { mfa: true, pk: true }) };
  }

  // everything else: a signed-in person
  const who = await caller(req);
  const uid = who.sub;
  const [totp] = await sql`select enabled_at from guard.totp where uid = ${uid}`;
  const totpOn = Boolean(totp && totp.enabled_at);
  // with 2-step on, changing security settings needs a session that passed the code
  const verified = !totpOn || who.mfa === true;

  if (path === 'status') {
    const keys = await sql`select id, name, created_at, last_used from guard.passkeys where uid = ${uid} order by created_at`;
    return { totp: totpOn, verified, passkeys: keys.map((k: any) => ({ id: k.id, name: k.name, created: Date.parse(k.created_at), used: k.last_used ? Date.parse(k.last_used) : null })) };
  }
  if (path === 'totp/verify') {
    await checkCode(uid, body.code);
    return { token: await customToken(uid, { mfa: true }) };
  }
  if (path === 'totp/start') {
    if (totpOn) throw new Fail('auth/maximum-second-factor-count-exceeded');
    if (!recent(who)) throw new Fail('auth/requires-recent-login', 401);
    if (!who.email_verified && who.firebase?.sign_in_provider === 'password') throw new Fail('auth/unverified-email');
    const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
    await sql`insert into guard.totp (uid, pending, pending_at) values (${uid}, ${secret}, now())
      on conflict (uid) do update set pending = ${secret}, pending_at = now()`;
    const label = encodeURIComponent(`Quickzy:${who.email || uid}`);
    return { key: secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Quickzy&algorithm=SHA1&digits=6&period=30` };
  }
  if (path === 'totp/enable') {
    await limit(`totp:${uid}`);
    const [row] = await sql`select pending from guard.totp where uid = ${uid} and pending_at > now() - interval '15 minutes'`;
    if (!row || !row.pending) throw new Fail('auth/missing-multi-factor-session');
    const step = await matchStep(row.pending, body.code);
    if (step < 0) { await missed(`totp:${uid}`); throw new Fail('auth/invalid-verification-code'); }
    await sql`update guard.totp set secret = pending, pending = null, enabled_at = now(), last_step = ${step} where uid = ${uid}`;
    await markFirestore(uid, true);
    // this device stays signed in: hand it a verified session at once
    return { token: await customToken(uid, { mfa: true }) };
  }
  if (path === 'totp/disable') {
    if (!verified || !recent(who)) throw new Fail('auth/requires-recent-login', 401);
    await sql`delete from guard.totp where uid = ${uid}`;
    await markFirestore(uid, false);
    return { ok: true };
  }
  if (path === 'passkey/register/options') {
    if (!verified || !recent(who)) throw new Fail('auth/requires-recent-login', 401);
    const existing = await sql`select id, transports from guard.passkeys where uid = ${uid}`;
    if (existing.length >= 10) throw new Fail('auth/passkey-limit');
    const options = await generateRegistrationOptions({
      rpName: 'Quickzy', rpID, userName: who.email || uid, userDisplayName: who.name || who.email || 'Quickzy account',
      userID: new TextEncoder().encode(uid),
      excludeCredentials: existing.map((c: any) => ({ id: c.id, transports: c.transports || undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestationType: 'none',
    });
    const id = crypto.randomUUID();
    await sql`insert into guard.challenges (id, uid, kind, challenge) values (${id}, ${uid}, 'register', ${options.challenge})`;
    return { id, options };
  }
  if (path === 'passkey/register/verify') {
    const [ch] = await sql`delete from guard.challenges where id = ${String(body.id || '')} and uid = ${uid} and kind = 'register' and created_at > now() - interval '5 minutes' returning challenge`;
    if (!ch) throw new Fail('auth/timeout');
    const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!v.verified || !v.registrationInfo) throw new Fail('auth/passkey-failed');
    const c = v.registrationInfo.credential;
    const name = String(body.name || 'Passkey').slice(0, 40);
    await sql`insert into guard.passkeys (id, uid, public_key, counter, transports, name) values (${c.id}, ${uid}, ${b64url(c.publicKey)}, ${c.counter}, ${c.transports || null}, ${name})`;
    return { ok: true };
  }
  if (path === 'passkey/remove') {
    if (!verified) throw new Fail('auth/requires-recent-login', 401);
    await sql`delete from guard.passkeys where uid = ${uid} and id = ${String(body.id || '')}`;
    return { ok: true };
  }
  throw new Fail('unknown', 404);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const allowed = ORIGINS.includes(origin) ? origin : '';
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      ...(allowed ? { 'Access-Control-Allow-Origin': allowed, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
      'Access-Control-Max-Age': '600',
    } });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405, allowed);
  const path = new URL(req.url).pathname.replace(/^.*\/guard\/?/, '').replace(/\/$/, '');
  // only Quickzy's own pages may use it
  if (!allowed) return json({ error: 'origin' }, 403);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    return json(await route(path, req, body, allowed || 'https://quickzy.web.app'), 200, allowed);
  } catch (err) {
    if (err instanceof Fail) return json({ error: err.code }, err.status, allowed);
    console.error(path, err);
    return json({ error: 'server' }, 500, allowed);
  }
});
