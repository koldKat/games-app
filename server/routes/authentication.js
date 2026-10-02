function createAuthenticationRoutes({
  progression, sendJson, readJson, PUBLIC_URL, events, activity, auth, userLocation,
  userActivity, preferences, mailer,
}) {

  return async function handleAuthentication(request, response, url, user) {
    if (request.method === 'POST' && url.pathname === '/api/register') {
      const ip = auth.clientIp(request);
      if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
      try {
        const input = await readJson(request);
        if (input.password !== input.passwordConfirm) return sendJson(response, 400, { error: 'Passwords do not match.' });
        const user = await auth.register(input.username, input.password, input.email);
        userActivity.record(user.id, { force: true });
        const token = auth.createSession(user.id);
        if (activity.recordJoin(user.id)) events.publishPublicActivity();
        auth.clearFailures(ip);
        return sendJson(response, 201, { user, preferences: preferences.get(user.id), progress: progression.info(user.id) }, { 'Set-Cookie': auth.sessionCookie(token, request) });
      } catch (error) { auth.recordFailure(ip); return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/login') {
      const ip = auth.clientIp(request);
      if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
      try {
        const input = await readJson(request);
        const user = await auth.login(input.username, input.password);
        if (!user) { auth.recordFailure(ip); return sendJson(response, 401, { error: 'Invalid username or password.' }); }
        auth.clearFailures(ip);
        userLocation.record(user.id, ip, { force: true });
        userActivity.record(user.id, { force: true });
        const token = auth.createSession(user.id);
        return sendJson(response, 200, { user, preferences: preferences.get(user.id), progress: progression.info(user.id) }, { 'Set-Cookie': auth.sessionCookie(token, request) });
      } catch (error) {
        if (error.code === 'ACCOUNT_LOCKED') return sendJson(response, error.status, { error: error.message });
        auth.recordFailure(ip);
        return sendJson(response, 400, { error: error.message });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/password-reset/request') {
      const ip = auth.clientIp(request);
      if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
      try {
        const reset = auth.preparePasswordReset((await readJson(request)).identity);
        if (reset) {
          try {
            const link = `${PUBLIC_URL}/?reset=${encodeURIComponent(reset.token)}`;
            await mailer.sendPasswordReset({ to: reset.email, username: reset.username, link });
            auth.storePasswordReset(reset);
          } catch (error) { console.error(`[mail] password-reset delivery failed: ${error.message}`); }
        }
        return sendJson(response, 200, { message: 'If that account has an email address, a password reset link has been sent.' });
      } catch (error) { auth.recordFailure(ip); return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/password-reset') {
      try {
        const input = await readJson(request);
        if (input.password !== input.passwordConfirm) return sendJson(response, 400, { error: 'Passwords do not match.' });
        await auth.resetPassword(input.token, input.password);
        return sendJson(response, 200, { message: 'Password reset. You can now sign in.' });
      } catch (error) { return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
      auth.logout(request);
      return sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.clearSessionCookie(request) });
    }

  };
}
module.exports = { createAuthenticationRoutes };
