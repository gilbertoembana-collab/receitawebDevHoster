import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_COOKIE = 'receita360_refresh';
const REFRESH_COOKIE_PATH = '/api';
const LEGACY_REFRESH_COOKIE_PATHS = ['/api/auth', '/api/v1/auth'];
const ISSUER = 'receita360-api';
const AUDIENCE = 'receita360-clients';
const ARGON_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const PLATFORM_ROLES = new Set(['Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator']);
const NATIONAL_ROLES = new Set(['Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional']);
const ADMIN_ROLES = new Set([
  ...PLATFORM_ROLES,
  ...NATIONAL_ROLES,
  'Supervisor Nacional',
  'Administrator',
  'Administrador Municipal',
]);
const READ_ONLY_ROLES = new Set(['Auditor Nacional', 'Auditor']);
const AGENT_READ_PATHS = new Set([
  '/api/sync-state',
  '/api/mercados',
  '/api/contribuintes',
  '/api/categoria_contribuintes',
  '/api/tipos_receita',
  '/api/pagamentos',
]);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookieValue(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function isMobileClient(req) {
  return req.get('x-client-type') === 'mobile' && !req.get('origin');
}

function tokenDigest(token, secret) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function publicPrincipal(row, kind) {
  const role = kind === 'agent' ? 'AGENTE' : row.perfil;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    usuario: row.usuario || null,
    municipioId: row.municipio_id || null,
    perfil: role,
    role,
    municipalityId: row.municipio_id || null,
    kind,
    mustChangePassword: kind === 'agent' && Boolean(row.reset_senha_pending),
  };
}

function isArgonHash(value) {
  return typeof value === 'string' && value.startsWith('$argon2id$');
}

export async function hashPassword(password, { minimumLength = 12 } = {}) {
  if (typeof password !== 'string' || password.length < minimumLength || password.length > 128) {
    throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  }
  return hash(password, ARGON_OPTIONS);
}

export async function verifyStoredPassword(password, storedHash) {
  if (typeof password !== 'string' || !password || typeof storedHash !== 'string' || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  if (isArgonHash(storedHash)) {
    try {
      return { valid: await verify(storedHash, password), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  const legacySha256 = /^[a-f0-9]{64}$/i.test(storedHash)
    && safeEqual(createHash('sha256').update(password).digest('hex'), storedHash.toLowerCase());
  const legacyPlaintext = safeEqual(password, storedHash);
  return {
    valid: legacySha256 || legacyPlaintext,
    needsRehash: legacySha256 || legacyPlaintext,
  };
}

export async function migratePlaintextPasswords(queryable) {
  const columns = [
    { table: 'usuarios', column: 'senha', normalize: (value) => value },
    { table: 'agentes', column: 'senha', normalize: (value) => value.trim() },
    { table: 'agentes', column: 'senha_temporaria', normalize: (value) => value.trim().toUpperCase() },
  ];

  for (const { table, column, normalize } of columns) {
    const result = await queryable.query(
      `SELECT id, ${column} AS credential FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`,
    );
    for (const row of result.rows) {
      if (isArgonHash(row.credential) || /^[a-f0-9]{64}$/i.test(row.credential)) continue;
      const normalized = normalize(row.credential) || row.credential;
      const encoded = await hashPassword(normalized, { minimumLength: 1 });
      await queryable.query(
        `UPDATE ${table} SET ${column} = $1 WHERE id = $2 AND ${column} = $3`,
        [encoded, row.id, row.credential],
      );
    }
  }
}

export function createAuthSecurity(pool) {
  const accessSecretValue = process.env.JWT_ACCESS_SECRET;
  const refreshSecretValue = process.env.JWT_REFRESH_SECRET;
  if (!accessSecretValue || Buffer.byteLength(accessSecretValue) < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }
  if (!refreshSecretValue || Buffer.byteLength(refreshSecretValue) < 32) {
    throw new Error('JWT_REFRESH_SECRET must contain at least 32 bytes.');
  }

  const accessSecret = new TextEncoder().encode(accessSecretValue);
  const refreshSecret = refreshSecretValue;
  const allowedOrigins = new Set(
    (process.env.APP_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  );
  const production = process.env.NODE_ENV === 'production';
  if (!production) {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
      allowedOrigins.add(origin);
    }
  }

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${req.path}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas tentativas. Tente novamente mais tarde.' },
  });

  function clearRefreshCookie(res) {
    for (const cookiePath of [REFRESH_COOKIE_PATH, ...LEGACY_REFRESH_COOKIE_PATHS]) {
      res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: cookiePath,
      });
    }
  }

  function setRefreshCookie(res, token) {
    for (const cookiePath of LEGACY_REFRESH_COOKIE_PATHS) {
      res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: cookiePath,
      });
    }
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TTL_SECONDS * 1000,
    });
  }

  function checkOrigin(req, res) {
    const origin = req.get('origin');
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    res.status(403).json({ error: 'Origem não autorizada.' });
    return false;
  }

  async function issueAccessToken(principal) {
    return new SignJWT({
      role: principal.role,
      kind: principal.kind,
      email: principal.email || null,
      municipalityId: principal.municipalityId || null,
      mustChangePassword: Boolean(principal.mustChangePassword),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(principal.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(accessSecret);
  }

  async function storeRefreshToken(client, principal, familyId, token) {
    const digest = tokenDigest(token, refreshSecret);
    await client.query(
      `INSERT INTO auth_sessions (id, family_id, user_id, user_type, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '30 days')`,
      [randomBytes(16).toString('hex'), familyId, principal.id, principal.kind, digest],
    );
    return digest;
  }

  async function sendSession(req, res, principal, familyId = randomBytes(16).toString('hex'), options = {}) {
    const refreshToken = randomBytes(48).toString('base64url');
    await storeRefreshToken(pool, principal, familyId, refreshToken);

    const accessToken = await issueAccessToken(principal);
    const response = { success: true, accessToken, expiresIn: ACCESS_TTL_SECONDS, user: principal };
    if (options.responseAlias) response[options.responseAlias] = options.responseData || principal;
    if (options.resetSenhaPending !== undefined) response.resetSenhaPending = options.resetSenhaPending;
    if (isMobileClient(req)) {
      response.refreshToken = refreshToken;
    } else {
      setRefreshCookie(res, refreshToken);
    }
    return res.json(response);
  }

  async function findActivePrincipal(client, userId, kind) {
    const query = kind === 'agent'
      ? `SELECT id, nome, email, usuario, municipio_id, cargo AS perfil, status, reset_senha_pending
         FROM agentes WHERE id = $1`
      : `SELECT id, nome, email, usuario, municipio_id, perfil, status
         FROM usuarios WHERE id = $1`;
    const result = await client.query(query, [userId]);
    const row = result.rows[0];
    if (!row || row.status !== 'ativo') return null;
    return publicPrincipal(row, kind);
  }

  async function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
    if (!match) return res.status(401).json({ error: 'Autenticação necessária.' });
    try {
      const { payload } = await jwtVerify(match[1], accessSecret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (!payload.sub || !['user', 'agent'].includes(payload.kind) || typeof payload.role !== 'string') {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
      }
      req.auth = {
        id: payload.sub,
        kind: payload.kind,
        role: payload.role,
        email: typeof payload.email === 'string' ? payload.email : null,
        municipalityId: typeof payload.municipalityId === 'string' ? payload.municipalityId : null,
        mustChangePassword: payload.mustChangePassword === true,
      };
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
  }

  function isPublicAuthRequest(req) {
    return req.method === 'POST' && [
      '/api/auth/login',
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/agentes/login',
    ].includes(req.path);
  }

  function normalizeApiVersion(req, res, next) {
    const versionedPath = req.url.match(/^\/api\/v(\d+)(?=\/|(?:\?|$))/);
    if (!versionedPath) {
      if (req.url.startsWith('/api/')) res.setHeader('Deprecation', 'true');
      return next();
    }
    if (versionedPath[1] !== '1') {
      return res.status(404).json({ error: 'Versão da API não suportada.' });
    }
    req.url = req.url.replace(/^\/api\/v1(?=\/|(?:\?|$))/, '/api');
    next();
  }

  function authenticateApi(req, res, next) {
    if (!req.path.startsWith('/api/')) return next();
    if (production && req.path !== '/health' && req.path !== '/api/health' && !req.secure) {
      return res.status(400).json({ error: 'HTTPS é obrigatório.' });
    }
    if (req.path === '/health' || req.path === '/api/health' || isPublicAuthRequest(req)) return next();
    return authenticate(req, res, (error) => {
      if (error) return next(error);
      next();
    });
  }

  async function authorizeMunicipalAdmin(req, res) {
    const tenantId = req.auth.municipalityId;
    const parts = req.path.split('/').filter(Boolean);
    const resource = parts[1];
    const resourceId = parts[2];
    const method = req.method.toUpperCase();
    const scopedResources = {
      usuarios: 'SELECT municipio_id FROM usuarios WHERE id = $1',
      mercados: 'SELECT municipio_id FROM mercados WHERE id = $1',
      agentes: 'SELECT municipio_id FROM agentes WHERE id = $1',
      pagamentos: 'SELECT municipio_id FROM pagamentos WHERE id = $1',
      contribuintes: 'SELECT m.municipio_id FROM contribuintes c JOIN mercados m ON m.id = c.mercado_id WHERE c.id = $1',
    };
    const locallyAssignableRoles = new Set([
      'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro',
      'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios', 'Auditor',
    ]);

    if (['municipios', 'tipos_receita', 'configuracoes', 'auditoria', 'sincronizacao'].includes(resource)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (!scopedResources[resource]) return res.status(403).json({ error: 'Ação não autorizada.' });
    if (resourceId === 'all') return res.status(403).json({ error: 'Ação não autorizada.' });

    const bodyMunicipality = req.body?.municipioId ?? req.body?.municipio_id;
    if (bodyMunicipality !== undefined && bodyMunicipality !== tenantId) {
      return res.status(403).json({ error: 'Município não autorizado.' });
    }
    if (
      method === 'POST'
      && ['usuarios', 'mercados', 'agentes', 'pagamentos'].includes(resource)
      && bodyMunicipality !== tenantId
    ) {
      return res.status(403).json({ error: 'Município não autorizado.' });
    }
    if (resource === 'usuarios' && req.body?.perfil !== undefined && !locallyAssignableRoles.has(req.body.perfil)) {
      return res.status(403).json({ error: 'Perfil não autorizado para este município.' });
    }

    if (method === 'POST') {
      if (resource === 'usuarios') return true;
      const marketId = req.body?.mercadoId ?? req.body?.mercado_id;
      if (['agentes', 'contribuintes'].includes(resource)) {
        const query = resource === 'agentes'
          ? 'SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2'
          : 'SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2';
        const market = await pool.query(query, [marketId, tenantId]);
        if (!market.rowCount) return res.status(403).json({ error: 'Mercado não autorizado.' });
      }
      return true;
    }

    if (!['PUT', 'PATCH', 'DELETE'].includes(method) || !resourceId) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    const result = await pool.query(scopedResources[resource], [resourceId]);
    if (!result.rows[0] || result.rows[0].municipio_id !== tenantId) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }
    const marketId = req.body?.mercadoId ?? req.body?.mercado_id;
    if (['agentes', 'contribuintes'].includes(resource) && marketId !== undefined) {
      const market = await pool.query(
        'SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2',
        [marketId, tenantId],
      );
      if (!market.rowCount) return res.status(403).json({ error: 'Mercado não autorizado.' });
    }
    return true;
  }

  function authorizeApi(req, res, next) {
    if (!req.path.startsWith('/api/') || !req.auth) return next();
    const { role, kind } = req.auth;
    const method = req.method.toUpperCase();
    const path = req.path;

    if (path === '/api/auth/logout' || path === '/api/auth/change-password') return next();
    if (
      (path === '/api/admin/backup' && method !== 'GET')
      || (path === '/api/admin/restore' && method !== 'POST')
      || (path.startsWith('/api/admin/restore/status/') && method !== 'GET')
      || (path.startsWith('/api/admin/restore-safety/') && method !== 'GET')
    ) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (
      path === '/api/admin/backup'
      || path === '/api/admin/restore'
      || path.startsWith('/api/admin/restore/status/')
      || path.startsWith('/api/admin/restore-safety/')
    ) {
      if (!PLATFORM_ROLES.has(role)) {
        return res.status(403).json({ error: 'Ação não autorizada.' });
      }
    }
    if (
      path.startsWith('/api/categoria_contribuintes')
      && method !== 'GET'
      && !PLATFORM_ROLES.has(role)
    ) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (['/api/database-status', '/api/connection-status'].includes(path) && !PLATFORM_ROLES.has(role)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (path === '/api/auditoria' && method === 'GET' && !PLATFORM_ROLES.has(role) && !NATIONAL_ROLES.has(role)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (path === '/api/sincronizacao' && method === 'GET' && !PLATFORM_ROLES.has(role)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (path === '/api/configuracoes' && !PLATFORM_ROLES.has(role)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (
      method === 'DELETE'
      && (path === '/api/reset-all' || path.endsWith('/all'))
      && !PLATFORM_ROLES.has(role)
    ) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }

    if (
      kind === 'user'
      && !PLATFORM_ROLES.has(role)
      && !NATIONAL_ROLES.has(role)
      && (!req.auth.municipalityId || ['all', 'central'].includes(req.auth.municipalityId))
    ) {
      return res.status(403).json({ error: 'A sessão não está associada a um município.' });
    }

    if (kind === 'agent') {
      const isSelfPasswordChange = method === 'POST' && path === '/api/agentes/alterar-senha';
      const isOwnProfileRead = method === 'GET' && path === '/api/auth/me';
      const isContributorStatusUpdate = method === 'PUT' && /^\/api\/contribuintes\/[^/]+$/.test(path);
      const isAllowedRead = method === 'GET' && AGENT_READ_PATHS.has(path);
      const isAllowedWrite = method === 'POST' && (
        path === '/api/pagamentos' || path === '/api/auditoria' || path === '/api/sincronizacao'
      );
      if (req.auth.mustChangePassword && !isSelfPasswordChange && !isOwnProfileRead) {
        return res.status(403).json({ error: 'É necessário alterar a senha antes de continuar.' });
      }
      if (isContributorStatusUpdate) {
        const bodyKeys = Object.keys(req.body || {});
        if (
          bodyKeys.some(key => !['status', 'reativarEm'].includes(key))
          || !['ativo', 'inativo'].includes(req.body?.status)
          || (req.body?.status === 'ativo' && req.body?.reativarEm != null)
          || (req.body?.reativarEm != null && typeof req.body.reativarEm !== 'string')
        ) {
          return res.status(400).json({ error: 'O agente pode alterar apenas o estado e a data de reativação.' });
        }
        pool.query(
          `SELECT m.municipio_id
           FROM contribuintes c
           JOIN mercados m ON m.id = c.mercado_id
           WHERE c.id = $1`,
          [path.split('/').at(-1)],
        ).then(result => {
          if (!result.rows[0] || result.rows[0].municipio_id !== req.auth.municipalityId) {
            return res.status(404).json({ error: 'Contribuinte não encontrado.' });
          }
          return next();
        }).catch(() => res.status(500).json({ error: 'Não foi possível validar o contribuinte.' }));
        return;
      }
      if (!isSelfPasswordChange && !isOwnProfileRead && !isAllowedRead && !isAllowedWrite) {
        return res.status(403).json({ error: 'Ação não autorizada.' });
      }
      return next();
    }

    if (READ_ONLY_ROLES.has(role) && method !== 'GET' && method !== 'HEAD') {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }

    if (ADMIN_ROLES.has(role)) {
      if (path === '/api/sync-bridge' && !PLATFORM_ROLES.has(role)) {
        return res.status(403).json({ error: 'Ação não autorizada.' });
      }
      if (
        role === 'Administrador Municipal'
        && !['GET', 'HEAD', 'OPTIONS'].includes(method)
      ) {
        authorizeMunicipalAdmin(req, res)
          .then((allowed) => {
            if (allowed === true) next();
          })
          .catch(() => res.status(500).json({ error: 'Não foi possível validar as permissões.' }));
        return;
      }
      return next();
    }

    const isRead = method === 'GET' || method === 'HEAD';
    const isLimitedWrite = method === 'POST' && (
      path === '/api/pagamentos' || path === '/api/auditoria' || path === '/api/sincronizacao'
    );
    if (isRead || isLimitedWrite) return next();
    return res.status(403).json({ error: 'Ação não autorizada.' });
  }

  function cors(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
      if (allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        return res.status(403).json({ error: 'Origem não autorizada.' });
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Client-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  }

  async function refresh(req, res) {
    if (!checkOrigin(req, res)) return;
    const mobile = isMobileClient(req);
    const token = mobile ? req.body?.refreshToken : cookieValue(req, REFRESH_COOKIE);
    if (typeof token !== 'string' || token.length < 40 || token.length > 256) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const digest = tokenDigest(token, refreshSecret);
    const client = await pool.connect();
    let principal;
    let familyId;
    let replacementToken;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT id, family_id, user_id, user_type, expires_at, revoked_at FROM auth_sessions WHERE token_hash = $1 FOR UPDATE',
        [digest],
      );
      const session = result.rows[0];
      if (!session) {
        await client.query('ROLLBACK');
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      if (session.revoked_at) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1',
          [session.family_id],
        );
        await client.query('COMMIT');
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Sessão revogada.' });
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
        await client.query('COMMIT');
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      principal = await findActivePrincipal(client, session.user_id, session.user_type);
      if (!principal) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1',
          [session.family_id],
        );
        await client.query('COMMIT');
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      familyId = session.family_id;
      replacementToken = randomBytes(48).toString('base64url');
      const replacementDigest = await storeRefreshToken(client, principal, familyId, replacementToken);
      await client.query(
        'UPDATE auth_sessions SET revoked_at = NOW(), replaced_by_hash = $1 WHERE id = $2',
        [replacementDigest, session.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Refresh session operation failed.');
      return res.status(500).json({ error: 'Não foi possível renovar a sessão.' });
    } finally {
      client.release();
    }

    const accessToken = await issueAccessToken(principal);
    const response = { success: true, accessToken, expiresIn: ACCESS_TTL_SECONDS, user: principal };
    if (mobile) response.refreshToken = replacementToken;
    else setRefreshCookie(res, replacementToken);
    return res.json(response);
  }

  async function logout(req, res) {
    if (!checkOrigin(req, res)) return;
    const mobile = isMobileClient(req);
    const token = mobile ? req.body?.refreshToken : cookieValue(req, REFRESH_COOKIE);
    if (typeof token === 'string' && token.length <= 256) {
      await pool.query(
        'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1',
        [tokenDigest(token, refreshSecret)],
      );
    }
    clearRefreshCookie(res);
    return res.json({ success: true });
  }

  return {
    authRateLimit,
    normalizeApiVersion,
    authenticateApi,
    authorizeApi,
    authenticate,
    cors,
    issueSession: sendSession,
    refresh,
    logout,
  };
}
