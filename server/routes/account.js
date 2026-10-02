const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createAccountRoutes({
  progression, publishProgression, AVATARS_DIR, sendJson, readJson, readRaw, RUNTIME_POLICY,
  imagePolicy, events, auth, preferences,
}) {

  function removeAvatarFile(filename) {
    if (!filename || path.basename(filename) !== filename) return;
    fs.unlink(path.join(AVATARS_DIR, filename), () => {});
  }

  return async function handleAccount(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/events') {
      return events.subscribe(request, response, user.id, () => Boolean(auth.authenticate(request, { touch: false })));
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') return sendJson(response, 200, { user, preferences: preferences.get(user.id), progress: progression.info(user.id) });
    if (request.method === 'GET' && url.pathname === '/api/progression') return sendJson(response, 200, progression.info(user.id));
    if (request.method === 'GET' && url.pathname === '/api/preferences') return sendJson(response, 200, preferences.get(user.id));
    if (request.method === 'PUT' && url.pathname === '/api/preferences') {
      try { return sendJson(response, 200, preferences.set(user.id, await readJson(request))); }
      catch (error) { return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'PUT' && url.pathname === '/api/account') {
      try {
        const updated = await auth.updateAccount(user.id, await readJson(request));
        events.publishPublicActivity();
        return sendJson(response, 200, { user: updated }, updated.sessionInvalidated ? { 'Set-Cookie': auth.clearSessionCookie(request) } : {});
      }
      catch (error) { return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/account/avatar') {
      try {
        const source = await readRaw(request, RUNTIME_POLICY.avatarUploadMaxBytes);
        let image;
        try { image = await imagePolicy.processAvatar(source); }
        catch { return sendJson(response, 415, { error: 'Avatar must be a valid image that can be processed.' }); }
        const filename = `${user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
        const old = auth.avatarPath(user.id);
        fs.writeFileSync(path.join(AVATARS_DIR, filename), image, { flag: 'wx' });
        const avatarUrl = auth.updateAvatar(user.id, filename);
        removeAvatarFile(old);
        publishProgression(user.id, progression.recordAvatar(user.id));
        events.publishPublicActivity();
        return sendJson(response, 200, { avatarUrl });
      } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'DELETE' && url.pathname === '/api/account/avatar') {
      const old = auth.avatarPath(user.id);
      auth.updateAvatar(user.id, null);
      removeAvatarFile(old);
      events.publishPublicActivity();
      return sendJson(response, 200, { avatarUrl: null });
    }

  };
}
module.exports = { createAccountRoutes };
