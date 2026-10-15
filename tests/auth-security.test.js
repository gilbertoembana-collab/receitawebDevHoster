import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import {
  createAuthSecurity,
  hashPassword,
  migratePlaintextPasswords,
  verifyStoredPassword,
} from '../src/auth/security.js';

function makeSessionPool() {
  const sessions = new Map();
  const user = {
    id: 'user-test',
    nome: 'Test User',
    email: 'test@example.invalid',
    usuario: 'test-user',
    municipio_id: 'municipality-test',
    perfil: 'Supervisor Municipal',
    status: 'ativo',
  };
  const query = async (sql, values = []) => {
    const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    if (statement.startsWith('INSERT INTO AUTH_SESSIONS')) {
      const [id, familyId, userId, userType, tokenHash] = values;
      sessions.set(id, {
        id,
        family_id: familyId,
        user_id: userId,
        user_type: userType,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked_at: null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith('SELECT ID, FAMILY_ID, USER_ID, USER_TYPE, EXPIRES_AT, REVOKED_AT FROM AUTH_SESSIONS')) {
      return { rows: [...sessions.values()].filter((session) => session.token_hash === values[0]), rowCount: 1 };
    }
    if (statement.startsWith('SELECT ID, NOME, EMAIL, USUARIO, MUNICIPIO_ID, PERFIL, STATUS FROM USUARIOS')) {
      return { rows: user.id === values[0] ? [user] : [], rowCount: 1 };
    }
    if (statement.includes('WHERE FAMILY_ID = $1')) {
      for (const session of sessions.values()) {
        if (session.family_id === values[0]) session.revoked_at ||= new Date();
      }
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes('WHERE TOKEN_HASH = $1')) {
      const session = [...sessions.values()].find((entry) => entry.token_hash === values[0]);
      if (session) session.revoked_at ||= new Date();
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    if (statement.includes('WHERE ID = $1')) {
      const session = sessions.get(values[0]);
      if (session) session.revoked_at = new Date();
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    if (statement.includes('WHERE ID = $2')) {
      const session = sessions.get(values[1]);
      if (session) {
        session.revoked_at = new Date();
        session.replaced_by_hash = values[0];
      }
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    sessions,
    query,
    connect: async () => ({ query, release() {} }),
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    clearCookie() {},
  };
}

test('new passwords use Argon2id and verify only the matching password', async () => {
  const password = 'Tr0ub4dor&3-example';
  const stored = await hashPassword(password);

  assert.match(stored, /^\$argon2id\$/);
  assert.notEqual(stored, password);
  assert.equal((await verifyStoredPassword(password, stored)).valid, true);
  assert.equal((await verifyStoredPassword('incorrect-password', stored)).valid, false);
});

test('legacy SHA-256 passwords verify only for migration and request a rehash', async () => {
  const password = 'legacy-password';
  const legacyHash = createHash('sha256').update(password).digest('hex');

  assert.deepEqual(await verifyStoredPassword(password, legacyHash), {
    valid: true,
    needsRehash: true,
  });
  assert.equal((await verifyStoredPassword('incorrect-password', legacyHash)).valid, false);
});

test('legacy plaintext passwords are accepted only to migrate them on successful login', async () => {
  assert.deepEqual(await verifyStoredPassword('legacy-password', 'legacy-password'), {
    valid: true,
    needsRehash: true,
  });
  assert.deepEqual(await verifyStoredPassword('', 'legacy-password'), {
    valid: false,
    needsRehash: false,
  });
});

test('startup migration rehashes plaintext credentials without rewriting existing hashes', async () => {
  const updated = [];
  const credentials = {
    usuarios: [
      { id: 'u-plain', credential: 'plain-user-password' },
      { id: 'u-sha', credential: createHash('sha256').update('hashed-user-password').digest('hex') },
    ],
    agentes: [
      { id: 'a-plain', credential: ' plain-agent-password ' },
      { id: 'a-temp', credential: 'temp-code-123' },
    ],
  };
  const queryable = {
    async query(sql, values = []) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (statement.startsWith('SELECT id, senha AS credential FROM usuarios')) {
        return { rows: credentials.usuarios };
      }
      if (statement.startsWith('SELECT id, senha AS credential FROM agentes')) {
        return { rows: [credentials.agentes[0]] };
      }
      if (statement.startsWith('SELECT id, senha_temporaria AS credential FROM agentes')) {
        return { rows: [credentials.agentes[1]] };
      }
      if (statement.startsWith('UPDATE ')) {
        updated.push({ sql: statement, values });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected migration query: ${statement}`);
    },
  };

  await migratePlaintextPasswords(queryable);

  assert.equal(updated.length, 3);
  assert.equal((await verifyStoredPassword('plain-user-password', updated[0].values[0])).valid, true);
  assert.equal((await verifyStoredPassword('plain-agent-password', updated[1].values[0])).valid, true);
  assert.equal((await verifyStoredPassword('TEMP-CODE-123', updated[2].values[0])).valid, true);
});

test('API routes require a valid access token and do not trust caller-supplied roles', async (t) => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  process.env.NODE_ENV = 'test';
  const fakePool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release() {},
    }),
  };
  const security = createAuthSecurity(fakePool);
  let session;
  await security.issueSession(
    { get: (name) => name.toLowerCase() === 'x-client-type' ? 'mobile' : null },
    { json: (body) => { session = body; } },
    {
      id: 'user-test',
      email: 'test@example.invalid',
      role: 'Supervisor Municipal',
      perfil: 'Supervisor Municipal',
      municipalityId: 'municipality-test',
      municipioId: 'municipality-test',
      kind: 'user',
    },
  );

  const app = express();
  app.use(express.json());
  app.use(security.normalizeApiVersion);
  app.use(security.cors);
  app.use(security.authenticateApi);
  app.use(security.authorizeApi);
  app.post('/api/auth/login', security.authRateLimit, (_req, res) => res.json({ ok: true }));
  app.get('/api/pagamentos', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/backup', (_req, res) => res.status(200).send('backup'));
  app.post('/api/usuarios', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const noToken = await fetch(`${baseUrl}/api/pagamentos`, {
    headers: { 'x-user-role': 'Platform Owner' },
  });
  assert.equal(noToken.status, 401);
  const versionedNoToken = await fetch(`${baseUrl}/api/v1/pagamentos`);
  assert.equal(versionedNoToken.status, 401);
  const noTokenBackup = await fetch(`${baseUrl}/api/v1/admin/backup`);
  assert.equal(noTokenBackup.status, 401);
  const unsupportedVersion = await fetch(`${baseUrl}/api/v2/pagamentos`);
  assert.equal(unsupportedVersion.status, 404);
  const invalidToken = await fetch(`${baseUrl}/api/pagamentos`, {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  assert.equal(invalidToken.status, 401);

  const allowedRead = await fetch(`${baseUrl}/api/pagamentos`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(allowedRead.status, 200);
  assert.equal(allowedRead.headers.get('deprecation'), 'true');
  const versionedAllowedRead = await fetch(`${baseUrl}/api/v1/pagamentos`, {
    headers: { Authorization: 'Bearer ' + session.accessToken },
  });
  assert.equal(versionedAllowedRead.status, 200);
  const forbiddenBackup = await fetch(`${baseUrl}/api/v1/admin/backup`, {
    headers: { Authorization: 'Bearer ' + session.accessToken },
  });
  assert.equal(forbiddenBackup.status, 403);
  const versionedLogin = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST' });
  assert.equal(versionedLogin.status, 200);

  const deniedWrite = await fetch(`${baseUrl}/api/usuarios`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ perfil: 'Platform Owner' }),
  });
  assert.equal(deniedWrite.status, 403);

  let lastLoginResponse;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastLoginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
  }
  assert.equal(lastLoginResponse.status, 429);

  const refreshRoute = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: 'not-a-valid-refresh-token' }),
  });
  assert.notEqual(refreshRoute.status, 429);
});

test('production API endpoints reject plain HTTP, including login', async (t) => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  process.env.NODE_ENV = 'production';
  const security = createAuthSecurity({ query: async () => ({ rows: [] }) });
  const app = express();
  app.use(security.cors);
  app.use(security.authenticateApi);
  app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    process.env.NODE_ENV = 'test';
    return new Promise((resolve) => server.close(resolve));
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST',
  });
  assert.equal(response.status, 400);
});

test('contributor category changes are restricted to platform administrators', () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  const security = createAuthSecurity({ query: async () => ({ rows: [] }) });
  const municipalResponse = makeResponse();
  let municipalNextCalled = false;

  security.authorizeApi({
    path: '/api/categoria_contribuintes/category-1',
    method: 'PUT',
    auth: { role: 'Administrador Municipal', kind: 'user' },
  }, municipalResponse, () => { municipalNextCalled = true; });

  assert.equal(municipalResponse.statusCode, 403);
  assert.equal(municipalNextCalled, false);

  let platformNextCalled = false;
  security.authorizeApi({
    path: '/api/categoria_contribuintes/category-1',
    method: 'PUT',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, makeResponse(), () => { platformNextCalled = true; });

  assert.equal(platformNextCalled, true);
});

test('database backups are restricted to platform administrators and GET requests', () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  const security = createAuthSecurity({ query: async () => ({ rows: [] }) });

  const municipalResponse = makeResponse();
  let municipalNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/backup',
    method: 'GET',
    auth: { role: 'Administrador Municipal', kind: 'user' },
  }, municipalResponse, () => { municipalNextCalled = true; });
  assert.equal(municipalResponse.statusCode, 403);
  assert.equal(municipalNextCalled, false);

  const wrongMethodResponse = makeResponse();
  let wrongMethodNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/backup',
    method: 'POST',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, wrongMethodResponse, () => { wrongMethodNextCalled = true; });
  assert.equal(wrongMethodResponse.statusCode, 403);
  assert.equal(wrongMethodNextCalled, false);

  let platformNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/backup',
    method: 'GET',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, makeResponse(), () => { platformNextCalled = true; });
  assert.equal(platformNextCalled, true);
});

test('database restore and safety downloads are restricted to platform administrators', () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  const security = createAuthSecurity({ query: async () => ({ rows: [] }) });

  const municipalResponse = makeResponse();
  let municipalNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/restore',
    method: 'POST',
    auth: { role: 'Administrador Municipal', kind: 'user' },
  }, municipalResponse, () => { municipalNextCalled = true; });
  assert.equal(municipalResponse.statusCode, 403);
  assert.equal(municipalNextCalled, false);

  const wrongMethodResponse = makeResponse();
  let wrongMethodNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/restore',
    method: 'GET',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, wrongMethodResponse, () => { wrongMethodNextCalled = true; });
  assert.equal(wrongMethodResponse.statusCode, 403);
  assert.equal(wrongMethodNextCalled, false);

  let restoreNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/restore',
    method: 'POST',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, makeResponse(), () => { restoreNextCalled = true; });
  assert.equal(restoreNextCalled, true);

  let safetyDownloadNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/restore-safety/00000000-0000-4000-8000-000000000000',
    method: 'GET',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, makeResponse(), () => { safetyDownloadNextCalled = true; });
  assert.equal(safetyDownloadNextCalled, true);

  const municipalStatusResponse = makeResponse();
  security.authorizeApi({
    path: '/api/admin/restore/status/00000000-0000-4000-8000-000000000000',
    method: 'GET',
    auth: { role: 'Administrador Municipal', kind: 'user' },
  }, municipalStatusResponse, () => assert.fail('Municipal administrators must not inspect restore status.'));
  assert.equal(municipalStatusResponse.statusCode, 403);

  let platformStatusNextCalled = false;
  security.authorizeApi({
    path: '/api/admin/restore/status/00000000-0000-4000-8000-000000000000',
    method: 'GET',
    auth: { role: 'Platform Owner', kind: 'user' },
  }, makeResponse(), () => { platformStatusNextCalled = true; });
  assert.equal(platformStatusNextCalled, true);
});

test('agents can change only contributor status within their municipality', async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  const security = createAuthSecurity({
    query: async () => ({ rows: [{ municipio_id: 'municipality-agent' }] }),
  });
  let nextCalled = false;
  await new Promise((resolve) => {
    security.authorizeApi({
      path: '/api/contribuintes/contributor-1',
      method: 'PUT',
      body: { status: 'inativo', reativarEm: '2026-11-01' },
      auth: {
        id: 'agent-1',
        kind: 'agent',
        role: 'AGENTE',
        municipalityId: 'municipality-agent',
        mustChangePassword: false,
      },
    }, makeResponse(), () => {
      nextCalled = true;
      resolve();
    });
  });
  assert.equal(nextCalled, true);

  const deniedResponse = makeResponse();
  security.authorizeApi({
    path: '/api/contribuintes/contributor-1',
    method: 'PUT',
    body: { status: 'inativo', nome: 'Changed by agent' },
    auth: {
      id: 'agent-1',
      kind: 'agent',
      role: 'AGENTE',
      municipalityId: 'municipality-agent',
      mustChangePassword: false,
    },
  }, deniedResponse, () => assert.fail('Agent must not edit contributor profile fields.'));
  assert.equal(deniedResponse.statusCode, 400);
});

test('refresh rotation detects replay and logout revokes the refresh session', async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  process.env.NODE_ENV = 'test';
  const pool = makeSessionPool();
  const security = createAuthSecurity(pool);
  const principal = {
    id: 'user-test',
    email: 'test@example.invalid',
    role: 'Supervisor Municipal',
    perfil: 'Supervisor Municipal',
    municipalityId: 'municipality-test',
    municipioId: 'municipality-test',
    kind: 'user',
  };
  const requestFor = (refreshToken) => ({
    body: { refreshToken },
    get: (name) => name.toLowerCase() === 'x-client-type' ? 'mobile' : null,
  });
  const issue = async () => {
    const response = makeResponse();
    await security.issueSession(requestFor(null), response, principal);
    return response.body.refreshToken;
  };

  const originalToken = await issue();
  const rotatedResponse = makeResponse();
  await security.refresh(requestFor(originalToken), rotatedResponse);
  assert.equal(rotatedResponse.statusCode, 200);
  assert.notEqual(rotatedResponse.body.refreshToken, originalToken);

  const replayResponse = makeResponse();
  await security.refresh(requestFor(originalToken), replayResponse);
  assert.equal(replayResponse.statusCode, 401);
  const familyReplayResponse = makeResponse();
  await security.refresh(requestFor(rotatedResponse.body.refreshToken), familyReplayResponse);
  assert.equal(familyReplayResponse.statusCode, 401);

  const logoutToken = await issue();
  const logoutResponse = makeResponse();
  await security.logout(requestFor(logoutToken), logoutResponse);
  assert.equal(logoutResponse.body.success, true);
  const revokedResponse = makeResponse();
  await security.refresh(requestFor(logoutToken), revokedResponse);
  assert.equal(revokedResponse.statusCode, 401);
});

test('web refresh cookie is available to versioned auth endpoints after reload', async (t) => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  process.env.NODE_ENV = 'test';
  const security = createAuthSecurity(makeSessionPool());
  const principal = {
    id: 'user-test',
    email: 'test@example.invalid',
    role: 'Supervisor Municipal',
    perfil: 'Supervisor Municipal',
    municipalityId: 'municipality-test',
    municipioId: 'municipality-test',
    kind: 'user',
  };
  const app = express();
  app.use(express.json());
  app.use(security.normalizeApiVersion);
  app.use(security.cors);
  app.use(security.authenticateApi);
  app.use(security.authorizeApi);
  app.post('/api/auth/login', (req, res) => security.issueSession(req, res, principal));
  app.post('/api/auth/refresh', security.authRateLimit, security.refresh);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'x-client-type': 'web' },
  });
  assert.equal(login.status, 200);
  const initialCookies = login.headers.getSetCookie();
  const initialCookie = initialCookies.find((cookie) => /Path=\/api(?:;|$)/i.test(cookie));
  assert.ok(initialCookie);
  assert.ok(initialCookies.some((cookie) => /Path=\/api\/auth/i.test(cookie)));
  assert.ok(initialCookies.some((cookie) => /Path=\/api\/v1\/auth/i.test(cookie)));

  const refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'x-client-type': 'web',
      cookie: initialCookie.split(';', 1)[0],
    },
  });
  assert.equal(refresh.status, 200);
  assert.ok(refresh.headers.getSetCookie().some((cookie) => /Path=\/api(?:;|$)/i.test(cookie)));
});

test('missing versioned refresh cookie does not clear legacy cookie before fallback', async (t) => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-bytes';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-bytes';
  process.env.NODE_ENV = 'test';
  const security = createAuthSecurity(makeSessionPool());
  const principal = {
    id: 'user-test',
    email: 'test@example.invalid',
    role: 'Supervisor Municipal',
    perfil: 'Supervisor Municipal',
    municipalityId: 'municipality-test',
    municipioId: 'municipality-test',
    kind: 'user',
  };
  const app = express();
  app.use(express.json());
  app.use(security.normalizeApiVersion);
  app.use(security.cors);
  app.use(security.authenticateApi);
  app.use(security.authorizeApi);
  app.post('/api/auth/login', (req, res) => security.issueSession(req, res, principal));
  app.post('/api/auth/refresh', security.authRateLimit, security.refresh);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'x-client-type': 'web' },
  });
  const loginCookie = login.headers.getSetCookie().find((cookie) => /Path=\/api(?:;|$)/i.test(cookie));
  assert.ok(loginCookie);
  const cookieValue = loginCookie.split(';', 1)[0];

  const noCookieRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'x-client-type': 'web' },
  });
  assert.equal(noCookieRefresh.status, 401);
  assert.deepEqual(noCookieRefresh.headers.getSetCookie(), []);

  const legacyPathRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'x-client-type': 'web', cookie: cookieValue },
  });
  assert.equal(legacyPathRefresh.status, 200);
  assert.ok(legacyPathRefresh.headers.getSetCookie().some((cookie) => /Path=\/api(?:;|$)/i.test(cookie)));
});
