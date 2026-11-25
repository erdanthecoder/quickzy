// tools/security.cjs — switches on the account-safety features of Firebase
// Authentication for Quickzy, using the deploy service account:
//   1. Identity Platform (needed for 2-step verification); harmless if on
//   2. 2-step verification with authenticator apps (TOTP codes)
//   3. email enumeration protection (sign-in errors never reveal which
//      addresses have accounts)
// Run by .github/workflows/security.yml. Prints what worked.

const admin = require('firebase-admin');

const project = process.env.PROJECT;
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: project });

async function token() {
  const t = await admin.credential.applicationDefault().getAccessToken();
  return t.access_token;
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': project },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 600) };
}

(async () => {
  let bad = 0;
  const base = `https://identitytoolkit.googleapis.com/v2/projects/${project}`;

  const init = await call('POST', `${base}/identityPlatform:initializeAuth`, {});
  console.log('Identity Platform:', init.ok ? 'on' : `${init.status} ${init.text}`);

  try {
    await admin.auth().projectConfigManager().updateProjectConfig({
      multiFactorConfig: { providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }] },
      emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
    });
    const cfg = await admin.auth().projectConfigManager().getProjectConfig();
    console.log('2-step verification (TOTP):', JSON.stringify(cfg.multiFactorConfig || {}));
    console.log('Email privacy:', JSON.stringify(cfg.emailPrivacyConfig || {}));
  } catch (err) {
    bad += 1;
    console.error('Could not switch on 2-step verification:', err.code || '', err.message);
  }
  process.exit(bad ? 1 : 0);
})();
