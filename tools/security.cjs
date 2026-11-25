// tools/security.cjs — switches on email enumeration protection in Firebase
// Authentication (sign-in errors never reveal which addresses have accounts).
// 2-step verification and passkeys run in the free "guard" function
// (supabase/functions/guard), not here.
// Run by .github/workflows/security.yml. Prints what worked.

const admin = require('firebase-admin');

const project = process.env.PROJECT;
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: project });

(async () => {
  try {
    await admin.auth().projectConfigManager().updateProjectConfig({
      emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
    });
    const cfg = await admin.auth().projectConfigManager().getProjectConfig();
    console.log('Email privacy:', JSON.stringify(cfg.emailPrivacyConfig || {}));
    process.exit(0);
  } catch (err) {
    console.error('Could not switch on email privacy:', err.code || '', err.message);
    process.exit(1);
  }
})();
