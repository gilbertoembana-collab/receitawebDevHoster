import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
dotenv.config();

import { db } from './src/db/index.ts';
import { 
  usuarios, municipios, mercados, agentes, contribuintes, 
  categoriasContribuintes, tiposReceita, pagamentos, auditoriaLog, sincronizacaoLog, configuracoes
} from './src/db/schema.ts';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { initializeDatabase } from './src/db/init.ts';
import { createAuthSecurity, hashPassword, verifyStoredPassword } from './src/auth/security.js';

async function hashImportedPassword(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('$argon2id$') || /^[a-f0-9]{64}$/i.test(value)) return value;
  return hashPassword(value, { minimumLength: 1 });
}

function classifyImportedContributor(activityValue: unknown, categoryValue: unknown) {
  const activity = typeof activityValue === 'string' ? activityValue.trim() : '';
  const activityKey = activity.toLocaleLowerCase('pt');
  const oldCategory = typeof categoryValue === 'string' ? categoryValue.trim() : '';
  let category = 'Comércio Geral/Por Classificar';

  if (/(roup|vestu|tecid|camisol|calçad|calcad|sapato|chinel|alfaiat|confec|boutique)/i.test(activityKey)) {
    category = 'Vestuário, Tecidos e Calçados';
  } else if (/(celular|telefone|telemóvel|telemovel|eletrónic|eletronic|comput|informátic|informatic|técnic|tecnic)/i.test(activityKey)) {
    category = 'Eletrônica, Telecomunicações e Reparação';
  } else if (/(carro|automóvel|automovel|peças de carro|pecas de carro|peças.*veículo|pecas.*veiculo)/i.test(activityKey)) {
    category = 'Automóvel e Peças';
  } else if (/(construção|construcao|canalização|canalizacao|materiais de eletricidade|cimento|ferramentas)/i.test(activityKey)) {
    category = 'Construção e Materiais';
  } else if (/(cosmétic|cosmetic|higiene|perfum|sabão|sabao)/i.test(activityKey)) {
    category = 'Cosmética e Higiene';
  } else if (/(artesan|cestaria|escultura)/i.test(activityKey)) {
    category = 'Artesanato e Produção';
  } else if (/(alimento|comida|legume|hortaliç|hortalic|peixe|carne|fruta|bebida|cereal|mandioca|batata)/i.test(activityKey)
    || ['Alimentos', 'Carnes/Peixes', 'Cereais'].includes(oldCategory)) {
    category = 'Alimentos e Produtos Frescos';
  } else if (oldCategory === 'Confecções') {
    category = 'Vestuário, Tecidos e Calçados';
  } else if (oldCategory === 'Eletrônicos') {
    category = 'Eletrônica, Telecomunicações e Reparação';
  } else if (oldCategory === 'Artesanato') {
    category = 'Artesanato e Produção';
  }

  const dimensao = /(atacado|atacadista|grossista|distribuidor|importador)/i.test(activityKey)
    ? 'Grande'
    : /(eletrónic|eletronic|celular|telemóvel|telemovel|peças de carro|pecas de carro|automóvel|automovel|construção|construcao|materiais de eletricidade|canalização|canalizacao)/i.test(activityKey)
      ? 'Médio'
      : activity ? 'Pequeno' : 'Micro';

  return { atividade: activity, categoria: category, dimensao };
}

const LEGACY_REGISTRATION_AGENT_ID = 'agen-f7rm38ilf';
const CONFIGURATION_FIELDS = new Set([
  'logoCamara', 'nomeMunicipio', 'moeda', 'fusoHorario', 'backupHabilitado',
  'temaEscuro', 'notificacoesHabilitadas', 'taxaComissao', 'comissaoPaga',
  'metaDiariaAgente', 'percentualIncentivo', 'modoOfflineHoras', 'geofencingAtivo',
  'limiteDiarioColetaPorAgente', 'imprimirLogoRecibo', 'textoRodapeRecibo',
  'versaoMinimaApp', 'dispositivos',
]);
const CONFIGURATION_BOOLEAN_FIELDS = new Set([
  'backupHabilitado', 'temaEscuro', 'notificacoesHabilitadas', 'geofencingAtivo', 'imprimirLogoRecibo',
]);
const CONFIGURATION_INTEGER_RANGES: Record<string, [number, number]> = {
  taxaComissao: [0, 100],
  comissaoPaga: [0, 2_000_000_000],
  metaDiariaAgente: [1, 2_000_000_000],
  percentualIncentivo: [0, 100],
  modoOfflineHoras: [1, 168],
  limiteDiarioColetaPorAgente: [1, 2_000_000_000],
};
const CONFIGURATION_STRING_LIMITS: Record<string, number> = {
  logoCamara: 1_500_000,
  nomeMunicipio: 200,
  moeda: 8,
  fusoHorario: 50,
  textoRodapeRecibo: 500,
  versaoMinimaApp: 30,
};

function validateConfigurationUpdates(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const updates = body as Record<string, unknown>;
  const keys = Object.keys(updates);
  if (!keys.length || keys.some((key) => !CONFIGURATION_FIELDS.has(key))) return null;

  for (const [key, value] of Object.entries(updates)) {
    if (CONFIGURATION_BOOLEAN_FIELDS.has(key) && typeof value !== 'boolean') return null;
    const integerRange = CONFIGURATION_INTEGER_RANGES[key];
    if (integerRange && (
      typeof value !== 'number'
      || !Number.isSafeInteger(value)
      || value < integerRange[0]
      || value > integerRange[1]
    )) return null;
    const stringLimit = CONFIGURATION_STRING_LIMITS[key];
    if (stringLimit && (
      typeof value !== 'string'
      || value.length > stringLimit
      || (key === 'nomeMunicipio' && !value.trim())
    )) return null;
    if (key === 'dispositivos' && (
      !Array.isArray(value)
      || value.length > 1000
      || value.some((device) => !device || typeof device !== 'object' || Array.isArray(device))
    )) return null;
  }

  return updates;
}

async function resolveContributorRegistrationAgent(req: express.Request): Promise<string> {
  if (req.auth?.kind === 'agent') {
    const [agent] = await db.select({ id: agentes.id }).from(agentes)
      .where(eq(agentes.id, req.auth.id)).limit(1);
    if (agent) return agent.id;
    throw new Error('Authenticated agent does not exist.');
  }

  if (req.auth?.email) {
    const [matchingAgent] = await db.select({ id: agentes.id }).from(agentes)
      .where(eq(agentes.email, req.auth.email)).limit(1);
    if (matchingAgent) return matchingAgent.id;
  }

  const [defaultAgent] = await db.select({ id: agentes.id }).from(agentes)
    .where(eq(agentes.id, LEGACY_REGISTRATION_AGENT_ID)).limit(1);
  if (defaultAgent) return defaultAgent.id;
  throw new Error('No agent is available to attribute the contributor registration.');
}

async function getContributorsPage(
  tenantId: string | null,
  page: number,
  pageSize: number,
  search = '',
) {
  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(mercados.municipioId, tenantId));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(contribuintes.nome, pattern),
      ilike(contribuintes.documento, pattern),
      ilike(contribuintes.numBanca, pattern),
      ilike(contribuintes.telefone, pattern),
      ilike(contribuintes.qrCode, pattern),
      ilike(contribuintes.dimensao, pattern),
      ilike(categoriasContribuintes.nome, pattern),
    )!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [countResult, items] = await Promise.all([
    db.select({ total: count() })
      .from(contribuintes)
      .innerJoin(mercados, eq(contribuintes.mercadoId, mercados.id))
      .innerJoin(categoriasContribuintes, eq(contribuintes.categoria, categoriasContribuintes.id))
      .where(where),
    db.select({
      id: contribuintes.id,
      nome: contribuintes.nome,
      telefone: contribuintes.telefone,
      documento: contribuintes.documento,
      mercadoId: contribuintes.mercadoId,
      numBanca: contribuintes.numBanca,
      categoria: contribuintes.categoria,
      atividade: contribuintes.atividade,
      dimensao: contribuintes.dimensao,
      dataRegistro: contribuintes.dataRegistro,
      agenteId: contribuintes.agenteId,
      agenteNome: agentes.nome,
      reativarEm: contribuintes.reativarEm,
      observacoes: contribuintes.observacoes,
      status: contribuintes.status,
      qrCode: contribuintes.qrCode,
      areaM2: contribuintes.areaM2,
      foto: contribuintes.foto,
    })
      .from(contribuintes)
      .innerJoin(mercados, eq(contribuintes.mercadoId, mercados.id))
      .innerJoin(categoriasContribuintes, eq(contribuintes.categoria, categoriasContribuintes.id))
      .innerJoin(agentes, eq(contribuintes.agenteId, agentes.id))
      .where(where)
      .orderBy(asc(contribuintes.nome), asc(contribuintes.id))
      .limit(pageSize)
      .offset(page * pageSize),
  ]);

  return { items, total: countResult[0]?.total || 0, page, pageSize };
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: string;
        kind: 'user' | 'agent';
        role: string;
        email: string | null;
        municipalityId: string | null;
        mustChangePassword: boolean;
      };
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10) || 3000;
  const { createPool } = await import('./src/db/index.ts');
  const pool = createPool();
  const auth = createAuthSecurity(pool);
  let backupInProgress = false;
  const reactivateExpiredContributors = async () => {
    await pool.query(
      `UPDATE contribuintes
       SET status = 'ativo', reativar_em = NULL
       WHERE status = 'inativo' AND reativar_em <= CURRENT_DATE`,
    );
  };
  const validateReactivationDate = async (value: unknown): Promise<string | null> => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Informe uma data válida para a reativação automática.');
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error('Informe uma data válida para a reativação automática.');
    }
    const [dateCheck] = (await pool.query(
      'SELECT $1::date > CURRENT_DATE AS is_future',
      [value],
    )).rows;
    if (!dateCheck.is_future) {
      throw new Error('A data de reativação deve ser posterior à data de hoje.');
    }
    return value;
  };
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

  // Express middleware to parse json bodies
  app.use(express.json({ limit: '15mb' }));
  app.use(auth.normalizeApiVersion);
  app.use(auth.cors);
  app.use(auth.authenticateApi);
  app.use(auth.authorizeApi);

  // Add simple console logger for APIs
  app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  // Health check and real-time database connection diagnostics
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/connection-status', async (req, res) => {
    if (!['Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator'].includes(req.auth?.role || '')) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    const startTime = Date.now();
    try {
      const { createPool } = await import('./src/db/index.ts');
      const pool = createPool();
      const dbInfoResult = await pool.query('SELECT current_database() as database_name, current_user as user_name, version() as version, NOW() as server_time');
      const latencyMs = Date.now() - startTime;

      const counts: Record<string, number> = {};
      const tables = ['usuarios', 'municipios', 'mercados', 'agentes', 'contribuintes', 'tipos_receita', 'pagamentos', 'auditoria_log', 'sincronizacao_log', 'configuracoes'];
      for (const t of tables) {
        try {
          const countRes = await pool.query(`SELECT COUNT(*) FROM ${t}`);
          counts[t] = parseInt(countRes.rows[0].count, 10);
        } catch {
          counts[t] = 0;
        }
      }

      res.json({
        status: 'conectado',
        success: true,
        latencyMs,
        database: {
          name: dbInfoResult.rows[0]?.database_name || 'cloud_sql_development_database',
          user: dbInfoResult.rows[0]?.user_name || 'ai_studio_app_user',
          serverTime: dbInfoResult.rows[0]?.server_time,
          version: dbInfoResult.rows[0]?.version,
          engine: 'PostgreSQL (Cloud SQL / Drizzle ORM)',
          ssl: Boolean(process.env.DATABASE_URL?.includes('sslmode=require') || process.env.DATABASE_URL?.includes('supabase'))
        },
        counts,
        checkedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Connection status check error:', error);
      res.status(500).json({
        status: 'erro_conexao',
        success: false,
        latencyMs: Date.now() - startTime,
        error: error?.message || 'Falha ao conectar ao banco de dados',
        checkedAt: new Date().toISOString()
      });
    }
  });

  app.get('/api/admin/backup', async (req, res) => {
    if (!['Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator'].includes(req.auth?.role || '')) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    if (backupInProgress) {
      return res.status(409).json({ error: 'Já existe um backup em execução.' });
    }

    let databaseUrl: URL;
    let databaseName: string;
    let host: string;
    let username: string;
    let password: string;
    try {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado.');
      databaseUrl = new URL(process.env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
        throw new Error('DATABASE_URL não é uma ligação PostgreSQL válida.');
      }
      databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
      host = databaseUrl.hostname.replace(/^\[|\]$/g, '');
      username = decodeURIComponent(databaseUrl.username);
      password = decodeURIComponent(databaseUrl.password);
    } catch (error) {
      console.error('PostgreSQL backup configuration is invalid:', error);
      return res.status(500).json({ error: 'A configuração do banco de dados não permite gerar o backup.' });
    }

    if (!databaseName || !host) {
      return res.status(500).json({ error: 'A configuração do banco de dados não permite gerar o backup.' });
    }

    const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(host);
    const configuredSslMode = databaseUrl.searchParams.get('sslmode');
    const sslRequired = configuredSslMode === 'require'
      || host.includes('supabase')
      || (process.env.NODE_ENV === 'production' && !isLocalDatabase);
    const sslModes = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);
    const sslMode = configuredSslMode && sslModes.has(configuredSslMode)
      ? configuredSslMode
      : sslRequired ? 'require' : 'disable';
    const childEnvironment: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: process.env.LANG || 'C',
      PGHOST: host,
      PGPORT: databaseUrl.port || '5432',
      PGUSER: username,
      PGPASSWORD: password,
      PGDATABASE: databaseName,
      PGSSLMODE: sslRequired && sslMode === 'disable' ? 'require' : sslMode,
      PGAPPNAME: 'receita360-backup',
    };
    const rootCertificate = databaseUrl.searchParams.get('sslrootcert');
    if (rootCertificate) childEnvironment.PGSSLROOTCERT = rootCertificate;

    const backupStartedAt = new Date();
    const recordBackupAudit = async (outcome: string) => {
      try {
        await db.insert(auditoriaLog).values({
          id: `audit-${randomUUID()}`,
          usuario: req.auth?.email || req.auth?.id || 'unknown',
          perfil: req.auth?.role || 'unknown',
          data: backupStartedAt.toISOString().slice(0, 10),
          hora: new Date().toISOString().slice(11, 19),
          ip: req.ip || 'unknown',
          dispositivo: req.get('x-client-type') || 'web',
          acao: 'backup',
          descricao: `Exportação PostgreSQL ${outcome}.`,
        });
      } catch (error) {
        console.error('Could not record PostgreSQL backup audit event:', error);
      }
    };

    backupInProgress = true;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        process.env.PG_DUMP_PATH || 'pg_dump',
        ['--format=custom', '--no-owner', '--no-privileges', '--no-password', '--dbname', databaseName],
        { env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch (error) {
      backupInProgress = false;
      console.error('Could not start PostgreSQL backup process:', error);
      return res.status(503).json({ error: 'Não foi possível iniciar o pg_dump no servidor.' });
    }

    const filename = `receita360-postgres-${backupStartedAt.toISOString().replace(/[:.]/g, '-')}.dump`;
    let stderr = '';
    let finished = false;
    const finishOnce = () => {
      if (finished) return false;
      finished = true;
      backupInProgress = false;
      return true;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/vnd.postgresql.custom');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      if (!res.write(chunk)) child.stdout.pause();
    });
    res.on('drain', () => child.stdout.resume());
    res.on('close', () => {
      if (!res.writableEnded && child.exitCode === null) child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.on('error', async (error) => {
      if (!finishOnce()) return;
      console.error('PostgreSQL backup process could not run:', error.message);
      await recordBackupAudit('falhou ao iniciar');
      if (!res.headersSent && !res.destroyed) {
        res.status(503).json({ error: 'O pg_dump não está instalado ou não pode ser executado neste servidor.' });
      } else if (!res.destroyed) {
        res.destroy(error);
      }
    });
    child.on('close', async (code) => {
      if (!finishOnce()) return;
      if (code === 0) {
        await recordBackupAudit('concluída');
        if (!res.destroyed) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'application/vnd.postgresql.custom');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
          }
          res.end();
        }
        return;
      }

      console.error('PostgreSQL backup process failed:', { code, stderr });
      await recordBackupAudit('falhou');
      if (!res.headersSent && !res.destroyed) {
        res.status(500).json({ error: 'O PostgreSQL não conseguiu gerar o backup. Verifique o pg_dump e as permissões do servidor.' });
      } else if (!res.destroyed) {
        res.destroy(new Error('PostgreSQL backup failed.'));
      }
    });
  });

  // --- API ROUTES ---

  function getTenantFilter(req: express.Request) {
    const role = req.auth?.role;
    const municipioId = req.auth?.municipalityId;
    const isGlobalRole = [
      'Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator',
      'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
    ].includes(role || '');
    return isGlobalRole ? null : municipioId;
  }

  async function recordExists(table: any, column: any, value: string): Promise<boolean> {
    if (!value) return false;
    try {
      const res = await db.select({ id: column }).from(table).where(eq(column, value)).limit(1);
      return res.length > 0;
    } catch (e) {
      return false;
    }
  }

  async function normalizePagamentoPayload(body: any, principal: express.Request['auth']) {
    let id = body.id || body.reciboId || body.recibo_id || body.recibo || `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let reciboId = body.reciboId || body.recibo_id || body.recibo || body.id || `REC-${Date.now()}`;
    const isGlobalRole = [
      'Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator',
      'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
    ].includes(principal?.role || '');
    const tenantId = isGlobalRole ? null : principal?.municipalityId;
    let municipioId = principal?.kind === 'agent'
      ? principal.municipalityId
      : tenantId || body.municipioId || body.municipio_id || body.municipio;
    let mercadoId = body.mercadoId || body.mercado_id || body.mercado;
    let agenteId = principal?.kind === 'agent' ? principal.id : (body.agenteId || body.agente_id || body.agente);
    let contribuinteId = body.contribuinteId || body.contribuinte_id || body.contribuinte;
    let tipoReceitaId = body.tipoReceitaId || body.tipo_receita_id || body.taxaId || body.tipo_receita;

    if (!municipioId || !mercadoId || !agenteId || !contribuinteId || !tipoReceitaId) {
      throw new Error('Missing payment references.');
    }
    if (!(await recordExists(municipios, municipios.id, municipioId))) throw new Error('Invalid municipality.');
    const marketRows = await pool.query(
      'SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2',
      [mercadoId, municipioId],
    );
    if (!marketRows.rowCount) throw new Error('Invalid market.');
    const agentRows = await db.select({ id: agentes.id, municipioId: agentes.municipioId, status: agentes.status })
      .from(agentes).where(eq(agentes.id, agenteId)).limit(1);
    if (!agentRows[0] || agentRows[0].municipioId !== municipioId || agentRows[0].status !== 'ativo') {
      throw new Error('Invalid agent.');
    }
    if (principal?.kind === 'agent' && agenteId !== principal.id) throw new Error('Agent identity mismatch.');
    const contributorRows = await db.select({
      id: contribuintes.id,
      mercadoId: contribuintes.mercadoId,
      status: contribuintes.status,
    })
      .from(contribuintes).where(eq(contribuintes.id, contribuinteId)).limit(1);
    if (!contributorRows[0] || contributorRows[0].mercadoId !== mercadoId || contributorRows[0].status !== 'ativo') {
      throw new Error('Invalid contributor.');
    }
    if (!(await recordExists(tiposReceita, tiposReceita.id, tipoReceitaId))) throw new Error('Invalid revenue type.');

    const valorNum = Number(body.valor !== undefined ? body.valor : (body.valor_pago !== undefined ? body.valor_pago : 0));
    if (!Number.isSafeInteger(valorNum) || valorNum <= 0) throw new Error('Invalid payment amount.');
    const valor = valorNum;

    let rawForma = String(body.formaPagamento || body.forma_pagamento || body.metodo_pagamento || body.metodoPagamento || body.meio_pagamento || 'Dinheiro').trim();
    let formaPagamento = 'Dinheiro';
    if (/orange/i.test(rawForma)) {
      formaPagamento = 'Orange Money';
    } else if (/transf|banc|banco|mbway/i.test(rawForma)) {
      formaPagamento = 'Transferência Bancária';
    } else if (/outro|cartao|card/i.test(rawForma)) {
      formaPagamento = 'Outro';
    } else {
      formaPagamento = 'Dinheiro';
    }

    const rawData = body.dataPagamento || body.data_pagamento || body.data_hora || body.dataHora || body.created_at || new Date().toISOString();
    const parsedPaymentDate = new Date(rawData);
    if (!Number.isFinite(parsedPaymentDate.getTime())) throw new Error('Invalid payment date.');
    const dataPagamento = parsedPaymentDate.toISOString();

    const rawCriacao = body.dataCriacao || body.data_criacao || rawData;
    const parsedCreationDate = new Date(rawCriacao);
    if (!Number.isFinite(parsedCreationDate.getTime())) throw new Error('Invalid creation date.');
    const dataCriacao = parsedCreationDate.toISOString();

    let rawStatus = String(body.status || 'pago').toLowerCase();
    let status = 'pago';
    if (['sucesso', 'sucesso_pago', 'pago', 'paid', 'success'].includes(rawStatus)) {
      status = 'pago';
    } else if (['cancelado', 'cancelled'].includes(rawStatus)) {
      status = 'cancelado';
    } else if (['pendente', 'pending'].includes(rawStatus)) {
      status = 'pendente';
    } else if (rawStatus === 'cancelamento_pendente') {
      status = 'cancelamento_pendente';
    }

    const posInfo = body.pos_device_id || body.posDeviceId ? `[POS: ${body.pos_device_id || body.posDeviceId}]` : '';
    const userObs = body.observacao || body.observacoes || body.obs || '';
    const observacao = ([posInfo, userObs].filter(Boolean).join(' ') || '').slice(0, 2000);

    return {
      id: String(id),
      reciboId: String(reciboId),
      municipioId: String(municipioId),
      mercadoId: String(mercadoId),
      agenteId: String(agenteId),
      contribuinteId: String(contribuinteId),
      tipoReceitaId: String(tipoReceitaId),
      valor,
      formaPagamento,
      dataPagamento,
      status,
      observacao,
      dataCriacao,
    };
  }

  // Consolidated Single Batch Sync Endpoint (prevents connection pool saturation)
  app.get('/api/sync-state', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      const isAgent = req.auth?.kind === 'agent';
      const canSeeSystemLogs = ['Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator'].includes(req.auth?.role || '');

      const [
        usuariosRes,
        municipiosRes,
        mercadosRes,
        agentesRes,
        contribuintesRes,
        categoriasContribuintesRes,
        tiposReceitaRes,
        pagamentosRes,
        auditoriaRes,
        sincronizacaoRes,
        configuracoesRes
      ] = await Promise.all([
        isAgent
          ? Promise.resolve([])
          : tenantId
          ? db.select({
              id: usuarios.id,
              nome: usuarios.nome,
              email: usuarios.email,
              municipioId: usuarios.municipioId,
              perfil: usuarios.perfil,
              status: usuarios.status,
              usuario: usuarios.usuario,
            }).from(usuarios).where(eq(usuarios.municipioId, tenantId))
          : db.select({
              id: usuarios.id,
              nome: usuarios.nome,
              email: usuarios.email,
              municipioId: usuarios.municipioId,
              perfil: usuarios.perfil,
              status: usuarios.status,
              usuario: usuarios.usuario,
            }).from(usuarios),
        tenantId ? db.select().from(municipios).where(eq(municipios.id, tenantId)) : db.select().from(municipios),
        tenantId ? db.select().from(mercados).where(eq(mercados.municipioId, tenantId)) : db.select().from(mercados),
        isAgent
          ? db.select().from(agentes).where(eq(agentes.id, req.auth!.id))
          : tenantId ? db.select().from(agentes).where(eq(agentes.municipioId, tenantId)) : db.select().from(agentes),
        getContributorsPage(tenantId, 0, 100).then(result => result.items),
        db.select().from(categoriasContribuintes),
        db.select().from(tiposReceita),
        isAgent
          ? db.select().from(pagamentos).where(eq(pagamentos.agenteId, req.auth!.id))
          : tenantId ? db.select().from(pagamentos).where(eq(pagamentos.municipioId, tenantId)) : db.select().from(pagamentos),
        canSeeSystemLogs ? db.select().from(auditoriaLog) : Promise.resolve([]),
        canSeeSystemLogs
          ? db.select().from(sincronizacaoLog)
          : isAgent
            ? db.select().from(sincronizacaoLog).where(eq(sincronizacaoLog.agenteId, req.auth!.id))
            : Promise.resolve([]),
        db.select().from(configuracoes).where(eq(configuracoes.id, 1))
      ]);

      const formattedMunicipios = municipiosRes.map(m => {
        let modulos = ['Mercados', 'Taxas', 'Financeiro', 'Fiscalização', 'Tesouraria', 'Relatórios', 'Auditoria'];
        if (m.modulosHabilitados) {
          try {
            modulos = JSON.parse(m.modulosHabilitados);
          } catch (e) {
            modulos = m.modulosHabilitados.split(',');
          }
        }
        return { ...m, modulosHabilitados: modulos };
      });

      const formattedMercados = mercadosRes.map(m => ({
        id: m.id,
        nome: m.nome,
        municipioId: m.municipioId,
        qtdBancas: m.qtdBancas,
        responsavel: m.responsavel,
        telefone: m.telefone,
        status: m.status,
        localizacaoGps: {
          lat: m.lat,
          lng: m.lng,
          label: m.gpsLabel || m.nome
        }
      }));

      const formattedAgentes = agentesRes
        .filter(a => req.auth?.kind !== 'agent' || a.id === req.auth.id)
        .map(({ senha, senhaTemporaria, ...a }) => ({
          ...a,
          permissoes: a.permissoes ? a.permissoes.split(',') : []
        }));

      const config = configuracoesRes[0] || {};
      res.json({
        usuarios: usuariosRes,
        municipios: formattedMunicipios,
        mercados: formattedMercados,
        agentes: formattedAgentes,
        contribuintes: contribuintesRes,
        categoria_contribuintes: categoriasContribuintesRes,
        tipos_receita: tiposReceitaRes,
        pagamentos: pagamentosRes,
        auditoria: auditoriaRes,
        sincronizacao: sincronizacaoRes,
        configuracoes: config
      });
    } catch (error: any) {
      console.error('Error in sync-state endpoint:', error);
      res.status(500).json({ error: 'Erro ao sincronizar dados.' });
    }
  });

  // 1. Usuarios & Authentication (Server-Side Cryptographic Security)
  app.post('/api/auth/login', auth.authRateLimit, async (req, res) => {
    try {
      const { login, password } = req.body;
      if (typeof login !== 'string' || login.length > 254 || typeof password !== 'string' || !password || password.length > 128) {
        return res.status(401).json({ error: 'Login ou senha inválidos.' });
      }

      const input = login.toLowerCase().trim();
      const rows = await db.select().from(usuarios).where(or(
        eq(usuarios.email, input),
        eq(usuarios.usuario, input),
        eq(usuarios.id, input),
      )).limit(1);
      const user = rows[0];

      if (!user || user.status !== 'ativo') {
        return res.status(401).json({ error: 'Login ou senha inválidos.' });
      }

      const passwordCheck = await verifyStoredPassword(password, user.senha || '');
      if (!passwordCheck.valid) {
        return res.status(401).json({ error: 'Login ou senha inválidos.' });
      }

      if (passwordCheck.needsRehash) {
        await createPool().query(
          'UPDATE usuarios SET senha = $1 WHERE id = $2',
          [await hashPassword(password, { minimumLength: 1 }), user.id],
        );
      }

      return auth.issueSession(req, res, {
        id: user.id,
        nome: user.nome,
        email: user.email,
        usuario: user.usuario,
        municipioId: user.municipioId,
        perfil: user.perfil,
        role: user.perfil,
        municipalityId: user.municipioId,
        kind: 'user',
      });
    } catch (error: any) {
      console.error('User authentication failed.');
      res.status(500).json({ error: 'Não foi possível autenticar.' });
    }
  });

  app.post('/api/auth/refresh', auth.authRateLimit, auth.refresh);
  app.post('/api/auth/logout', auth.logout);
  app.get('/api/auth/me', async (req, res) => {
    if (req.auth?.kind === 'agent') {
      const rows = await db.select({
        id: agentes.id,
        nome: agentes.nome,
        email: agentes.email,
        usuario: agentes.usuario,
        municipioId: agentes.municipioId,
        cargo: agentes.cargo,
        status: agentes.status,
        permissoes: agentes.permissoes,
        resetSenhaPending: agentes.resetSenhaPending,
      }).from(agentes).where(eq(agentes.id, req.auth.id)).limit(1);
      if (!rows[0] || rows[0].status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });
      const user = { ...rows[0], perfil: 'AGENTE', permissoes: rows[0].permissoes?.split(',') || [] };
      return res.json({ user });
    }
    const rows = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      usuario: usuarios.usuario,
      municipioId: usuarios.municipioId,
      perfil: usuarios.perfil,
      status: usuarios.status,
    }).from(usuarios).where(eq(usuarios.id, req.auth.id)).limit(1);
    if (!rows[0] || rows[0].status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });
    return res.json({ user: rows[0] });
  });
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      if (req.auth?.kind !== 'user') return res.status(403).json({ error: 'Ação não autorizada.' });
      const { currentPassword, newPassword } = req.body;
      if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
        return res.status(400).json({ error: 'A senha atual e uma nova senha de 12 a 128 caracteres são obrigatórias.' });
      }
      const rows = await db.select().from(usuarios).where(eq(usuarios.id, req.auth.id)).limit(1);
      const user = rows[0];
      if (!user || user.status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });
      const currentCheck = await verifyStoredPassword(currentPassword, user.senha || '');
      if (!currentCheck.valid) return res.status(401).json({ error: 'A senha atual está incorreta.' });
      await createPool().query(
        'UPDATE usuarios SET senha = $1 WHERE id = $2',
        [await hashPassword(newPassword), user.id],
      );
      await createPool().query(
        'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
        [user.id, 'user'],
      );
      return res.json({ success: true });
    } catch {
      console.error('User password update failed.');
      return res.status(500).json({ error: 'Não foi possível alterar a senha.' });
    }
  });

  app.get('/api/usuarios', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      const columns = {
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        municipioId: usuarios.municipioId,
        perfil: usuarios.perfil,
        status: usuarios.status,
        usuario: usuarios.usuario,
      };
      const result = tenantId
        ? await db.select(columns).from(usuarios).where(eq(usuarios.municipioId, tenantId))
        : await db.select(columns).from(usuarios);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching usuarios:', error);
      res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
  });

  app.post('/api/usuarios', async (req, res) => {
    try {
      const b = req.body;
      if (typeof b.senha !== 'string' || b.senha.length < 12 || b.senha.length > 128) {
        return res.status(400).json({ error: 'A senha é obrigatória e deve ter entre 12 e 128 caracteres.' });
      }
      const senhaHash = await hashPassword(b.senha);

      const mId = b.municipioId ?? b.municipio_id;
      const cleanMunicipioId = (mId && typeof mId === 'string' && mId.trim() !== '' && mId !== 'null' && mId !== 'central') ? mId.trim() : null;

      const value = {
        id: b.id || `user-${Math.random().toString(36).substring(2, 11)}`,
        nome: b.nome || 'Utilizador',
        email: b.email ? b.email.trim().toLowerCase() : `user_${Date.now()}@receita360.gw`,
        municipioId: cleanMunicipioId,
        perfil: b.perfil || 'Supervisor',
        status: b.status || 'ativo',
        usuario: b.usuario || b.username || (b.email ? b.email.split('@')[0] : `user_${Date.now()}`),
        senha: senhaHash
      };

      const result = await db.insert(usuarios).values(value).returning();
      const { senha, ...safeUser } = result[0];
      res.status(201).json(safeUser);
    } catch (error: any) {
      console.error('Error creating usuario:', error);
      res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
  });

  app.put('/api/usuarios/:id', async (req, res) => {
    try {
      const b = req.body;
      const updateData: any = {};
      if (b.nome !== undefined) updateData.nome = b.nome;
      if (b.email !== undefined) updateData.email = b.email ? b.email.trim().toLowerCase() : b.email;
      if (b.perfil !== undefined) updateData.perfil = b.perfil;
      if (b.status !== undefined) updateData.status = b.status;
      if (b.usuario !== undefined) updateData.usuario = b.usuario;
      
      if (b.municipioId !== undefined || b.municipio_id !== undefined) {
        const mId = b.municipioId ?? b.municipio_id;
        updateData.municipioId = (mId && typeof mId === 'string' && mId.trim() !== '' && mId !== 'null' && mId !== 'central') ? mId.trim() : null;
      }
      
      if (b.senha !== undefined && b.senha !== null && b.senha !== '') {
        if (typeof b.senha !== 'string' || b.senha.length < 12 || b.senha.length > 128) {
          return res.status(400).json({ error: 'A senha deve ter entre 12 e 128 caracteres.' });
        }
        updateData.senha = await hashPassword(b.senha);
      }

      const result = await db.update(usuarios)
        .set(updateData)
        .where(eq(usuarios.id, req.params.id))
        .returning();
      if (result[0] && updateData.senha) {
        await createPool().query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
          [req.params.id, 'user'],
        );
      }
      const resObj = result[0] ? (({ senha, ...rest }) => rest)(result[0]) : { success: true };
      res.json(resObj);
    } catch (error: any) {
      console.error('Error updating usuario:', error);
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  app.delete('/api/usuarios/:id', async (req, res) => {
    try {
      await db.delete(usuarios).where(eq(usuarios.id, req.params.id));
      res.json({ success: true, message: 'Usuário removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting usuario:', error);
      res.status(500).json({ error: 'Erro ao remover usuário.' });
    }
  });

  // 2. Municipios (Municipalities)
  app.get('/api/municipios', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      let result;
      if (tenantId) {
        result = await db.select().from(municipios).where(eq(municipios.id, tenantId));
      } else {
        result = await db.select().from(municipios);
      }
      const formatted = result.map(m => {
        let modulos = ['Mercados', 'Taxas', 'Financeiro', 'Fiscalização', 'Tesouraria', 'Relatórios', 'Auditoria'];
        if (m.modulosHabilitados) {
          try {
            modulos = JSON.parse(m.modulosHabilitados);
          } catch (e) {
            modulos = m.modulosHabilitados.split(',');
          }
        }
        return {
          ...m,
          modulosHabilitados: modulos
        };
      });
      res.json(formatted);
    } catch (error: any) {
      console.error('Error fetching municipios:', error);
      res.status(500).json({ error: 'Erro ao buscar municípios.' });
    }
  });

  app.post('/api/municipios', async (req, res) => {
    try {
      const { modulosHabilitados, ...rest } = req.body;
      const value = {
        ...rest,
        modulosHabilitados: Array.isArray(modulosHabilitados) ? JSON.stringify(modulosHabilitados) : (modulosHabilitados || null)
      };
      const result = await db.insert(municipios).values(value).returning();
      const created = result[0];
      if (created && created.modulosHabilitados) {
        try {
          created.modulosHabilitados = JSON.parse(created.modulosHabilitados) as any;
        } catch (e) {}
      }
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating municipio:', error);
      res.status(500).json({ error: 'Erro ao criar município.' });
    }
  });

  app.put('/api/municipios/:id', async (req, res) => {
    try {
      const { modulosHabilitados, ...rest } = req.body;
      const value: any = { ...rest };
      if (modulosHabilitados !== undefined) {
        value.modulosHabilitados = Array.isArray(modulosHabilitados) ? JSON.stringify(modulosHabilitados) : modulosHabilitados;
      }
      const result = await db.update(municipios)
        .set(value)
        .where(eq(municipios.id, req.params.id))
        .returning();
      const updated = result[0];
      if (updated && updated.modulosHabilitados) {
        try {
          updated.modulosHabilitados = JSON.parse(updated.modulosHabilitados) as any;
        } catch (e) {}
      }
      res.json(updated || { success: true });
    } catch (error: any) {
      console.error('Error updating municipio:', error);
      res.status(500).json({ error: 'Erro ao atualizar município.' });
    }
  });

  app.delete('/api/municipios/all', async (req, res) => {
    try {
      await db.delete(municipios);
      res.json({ success: true, message: 'Todos os municípios foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all municipios:', error);
      res.status(500).json({ error: 'Erro ao limpar municípios.' });
    }
  });

  app.delete('/api/municipios/:id', async (req, res) => {
    try {
      await db.delete(municipios).where(eq(municipios.id, req.params.id));
      res.json({ success: true, message: 'Município removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting municipio:', error);
      res.status(500).json({ error: 'Erro ao remover município.' });
    }
  });


  // 3. Mercados (Markets)
  app.get('/api/mercados', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      let result;
      if (tenantId) {
        result = await db.select().from(mercados).where(eq(mercados.municipioId, tenantId));
      } else {
        result = await db.select().from(mercados);
      }
      // Map to expected frontend format which uses localizacaoGps object
      const formatted = result.map(m => ({
        id: m.id,
        nome: m.nome,
        municipioId: m.municipioId,
        qtdBancas: m.qtdBancas,
        responsavel: m.responsavel,
        telefone: m.telefone,
        status: m.status,
        localizacaoGps: {
          lat: m.lat,
          lng: m.lng,
          label: m.gpsLabel || m.nome
        }
      }));
      res.json(formatted);
    } catch (error: any) {
      console.error('Error fetching mercados:', error);
      res.status(500).json({ error: 'Erro ao buscar mercados.' });
    }
  });

  app.post('/api/mercados', async (req, res) => {
    try {
      const { id, nome, municipioId, qtdBancas, responsavel, telefone, status, localizacaoGps } = req.body;
      const result = await db.insert(mercados).values({
        id,
        nome,
        municipioId,
        qtdBancas,
        responsavel,
        telefone,
        status: status || 'ativo',
        lat: localizacaoGps?.lat || 0,
        lng: localizacaoGps?.lng || 0,
        gpsLabel: localizacaoGps?.label || nome
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating mercado:', error);
      res.status(500).json({ error: 'Erro ao criar mercado.' });
    }
  });

  app.put('/api/mercados/:id', async (req, res) => {
    try {
      const { nome, municipioId, qtdBancas, responsavel, telefone, status, localizacaoGps } = req.body;
      const updateData: any = {};
      if (nome !== undefined) updateData.nome = nome;
      if (municipioId !== undefined) updateData.municipioId = municipioId;
      if (qtdBancas !== undefined) updateData.qtdBancas = qtdBancas;
      if (responsavel !== undefined) updateData.responsavel = responsavel;
      if (telefone !== undefined) updateData.telefone = telefone;
      if (status !== undefined) updateData.status = status;
      if (localizacaoGps !== undefined) {
        updateData.lat = localizacaoGps?.lat || 0;
        updateData.lng = localizacaoGps?.lng || 0;
        updateData.gpsLabel = localizacaoGps?.label || nome;
      }
      
      const result = await db.update(mercados)
        .set(updateData)
        .where(eq(mercados.id, req.params.id))
        .returning();
      res.json(result[0] || { success: true });
    } catch (error: any) {
      console.error('Error updating mercado:', error);
      res.status(500).json({ error: 'Erro ao atualizar mercado.' });
    }
  });

  app.delete('/api/mercados/all', async (req, res) => {
    try {
      await db.delete(mercados);
      res.json({ success: true, message: 'Todos os mercados foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all mercados:', error);
      res.status(500).json({ error: 'Erro ao limpar mercados.' });
    }
  });

  app.delete('/api/mercados/:id', async (req, res) => {
    try {
      await db.delete(mercados).where(eq(mercados.id, req.params.id));
      res.json({ success: true, message: 'Mercado removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting mercado:', error);
      res.status(500).json({ error: 'Erro ao remover mercado.' });
    }
  });


  // 4. Agentes (Agents)
  app.get('/api/agentes', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      let result;
      if (tenantId) {
        result = await db.select().from(agentes).where(eq(agentes.municipioId, tenantId));
      } else {
        result = await db.select().from(agentes);
      }
      const formatted = result.map(a => ({
        id: a.id,
        foto: a.foto,
        nome: a.nome,
        telefone: a.telefone,
        email: a.email,
        usuario: a.usuario,
        mercadoId: a.mercadoId,
        municipioId: a.municipioId,
        cargo: a.cargo,
        status: a.status,
        resetSenhaPending: a.resetSenhaPending,
        permissoes: a.permissoes ? a.permissoes.split(',') : []
      }));
      res.json(formatted);
    } catch (error: any) {
      console.error('Error fetching agentes:', error);
      res.status(500).json({ error: 'Erro ao buscar agentes.' });
    }
  });

  app.post('/api/agentes', async (req, res) => {
    try {
      const b = req.body;
      const permissoes = b.permissoes;
      if (b.senha !== undefined && b.senha !== null && (typeof b.senha !== 'string' || b.senha.length < 12 || b.senha.length > 128)) {
        return res.status(400).json({ error: 'A senha deve ter entre 12 e 128 caracteres.' });
      }
      const temporaryPassword = b.senhaTemporaria || b.senha_temporaria || null;
      const value = {
        id: b.id || `agent-${Date.now()}`,
        foto: b.foto || null,
        nome: b.nome || 'Agente',
        telefone: b.telefone || '',
        email: b.email || `agente_${Date.now()}@receita360.gw`,
        usuario: b.usuario || b.username || `agente_${Date.now()}`,
        mercadoId: b.mercadoId || b.mercado_id || 'merc-1',
        municipioId: b.municipioId || b.municipio_id || 'muni-1',
        cargo: b.cargo || 'Fiscal de Terreno',
        status: b.status || 'ativo',
        permissoes: Array.isArray(permissoes) ? permissoes.join(',') : (permissoes || ''),
        resetSenhaPending: Boolean(b.resetSenhaPending || b.reset_senha_pending || temporaryPassword),
        senhaTemporaria: temporaryPassword ? await hashPassword(temporaryPassword, { minimumLength: 8 }) : null,
        senha: b.senha ? await hashPassword(b.senha) : null
      };
      const result = await db.insert(agentes).values(value).returning();
      const { senha, senhaTemporaria, ...safeAgent } = result[0];
      res.status(201).json(safeAgent);
    } catch (error: any) {
      console.error('Error creating agente:', error);
      res.status(500).json({ error: 'Erro ao criar agente.' });
    }
  });

  app.put('/api/agentes/:id', async (req, res) => {
    try {
      const { permissoes, senha_temporaria, senhaTemporaria, reset_senha_pending, resetSenhaPending, senha, ...rest } = req.body;
      const updateData: any = { ...rest };
      if (permissoes !== undefined) {
        updateData.permissoes = Array.isArray(permissoes) ? permissoes.join(',') : (permissoes || '');
      }
      const requestedTemporaryPassword = senhaTemporaria ?? senha_temporaria;
      if (requestedTemporaryPassword !== undefined) {
        updateData.senhaTemporaria = requestedTemporaryPassword
          ? await hashPassword(requestedTemporaryPassword.toUpperCase(), { minimumLength: 8 })
          : null;
        if (requestedTemporaryPassword) updateData.resetSenhaPending = true;
      }
      if (resetSenhaPending !== undefined || reset_senha_pending !== undefined) {
        updateData.resetSenhaPending = resetSenhaPending ?? reset_senha_pending;
      }
      if (senha !== undefined && senha !== null) {
        if (typeof senha !== 'string' || senha.length < 12 || senha.length > 128) {
          return res.status(400).json({ error: 'A senha deve ter entre 12 e 128 caracteres.' });
        }
        updateData.senha = await hashPassword(senha);
      }
      const result = await db.update(agentes)
        .set(updateData)
        .where(eq(agentes.id, req.params.id))
        .returning();
      if (result[0] && (updateData.senha || updateData.senhaTemporaria)) {
        await createPool().query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
          [req.params.id, 'agent'],
        );
      }
      if (result[0]) {
        const { senha: storedPassword, senhaTemporaria: storedTemporaryPassword, ...safeAgent } = result[0];
        return res.json(safeAgent);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating agente:', error);
      res.status(500).json({ error: 'Erro ao atualizar agente.' });
    }
  });

  // Autenticação para aplicativo móvel de agente
  app.post('/api/agentes/login', auth.authRateLimit, async (req, res) => {
    try {
      const { usuario, senha } = req.body;
      if (typeof usuario !== 'string' || usuario.length > 128 || typeof senha !== 'string' || !senha || senha.length > 128) {
        return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
      }

      const rows = await db.select().from(agentes).where(eq(agentes.usuario, usuario.trim()));
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
      }

      const agente = rows[0];
      if (agente.status !== 'ativo') {
        return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
      }

      const regularCheck = await verifyStoredPassword(senha.trim(), agente.senha || '');
      const temporaryCheck = await verifyStoredPassword(senha.trim().toUpperCase(), agente.senhaTemporaria || '');
      if (!regularCheck.valid && !temporaryCheck.valid) {
        return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
      }

      if (regularCheck.needsRehash) {
        await db.update(agentes).set({
          senha: await hashPassword(senha.trim(), { minimumLength: 1 }),
        }).where(eq(agentes.id, agente.id));
      }
      if (temporaryCheck.needsRehash) {
        await db.update(agentes).set({
          senhaTemporaria: await hashPassword(senha.trim().toUpperCase(), { minimumLength: 8 }),
        }).where(eq(agentes.id, agente.id));
      }
      const { senha: storedPassword, senhaTemporaria: storedTemporaryPassword, ...safeAgent } = agente;
      const mobileAgent = {
        ...safeAgent,
        permissoes: agente.permissoes ? agente.permissoes.split(',') : [],
      };
      const needsPasswordChange = Boolean(agente.resetSenhaPending || temporaryCheck.valid);
      return auth.issueSession(
        req,
        res,
        {
          id: agente.id,
          nome: agente.nome,
          email: agente.email,
          usuario: agente.usuario,
          municipioId: agente.municipioId,
          perfil: 'AGENTE',
          role: 'AGENTE',
          municipalityId: agente.municipioId,
          kind: 'agent',
          mustChangePassword: needsPasswordChange,
        },
        undefined,
        { responseAlias: 'agente', responseData: mobileAgent, resetSenhaPending: needsPasswordChange },
      );
    } catch (error: any) {
      console.error('Agent authentication failed.');
      res.status(500).json({ error: 'Não foi possível autenticar.' });
    }
  });

  // Atualização/definição de nova senha pelo aplicativo móvel
  app.post('/api/agentes/alterar-senha', async (req, res) => {
    try {
      const { agenteId, usuario, senhaAtual, novaSenha } = req.body;
      if (req.auth?.kind !== 'agent' || (agenteId && agenteId !== req.auth.id)) {
        return res.status(403).json({ error: 'Ação não autorizada.' });
      }
      if (typeof senhaAtual !== 'string' || !senhaAtual || typeof novaSenha !== 'string' || novaSenha.length < 12 || novaSenha.length > 128) {
        return res.status(400).json({ error: 'A senha atual e uma nova senha de 12 a 128 caracteres são obrigatórias.' });
      }

      const rows = await db.select().from(agentes).where(eq(agentes.id, req.auth.id)).limit(1);
      const agente = rows[0];
      if (!agente || agente.status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });

      const normalMatch = await verifyStoredPassword(senhaAtual, agente.senha || '');
      const temporaryMatch = await verifyStoredPassword(senhaAtual.toUpperCase(), agente.senhaTemporaria || '');
      if (!normalMatch.valid && !temporaryMatch.valid) {
        return res.status(401).json({ error: 'A senha atual está incorreta.' });
      }

      const hashedNovaSenha = await hashPassword(novaSenha);
      await db.update(agentes)
        .set({
          senha: hashedNovaSenha,
          senhaTemporaria: null,
          resetSenhaPending: false
        })
        .where(eq(agentes.id, agente.id));

      await createPool().query(
        'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
        [agente.id, 'agent'],
      );
      res.json({ success: true, message: 'Nova senha pessoal cadastrada com sucesso!' });
    } catch (error: any) {
      console.error('Agent password update failed.');
      res.status(500).json({ error: 'Não foi possível alterar a senha.' });
    }
  });

  app.delete('/api/agentes/all', async (req, res) => {
    try {
      await db.delete(agentes);
      res.json({ success: true, message: 'Todos os agentes foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all agentes:', error);
      res.status(500).json({ error: 'Erro ao limpar agentes.' });
    }
  });

  app.delete('/api/agentes/:id', async (req, res) => {
    try {
      await db.delete(agentes).where(eq(agentes.id, req.params.id));
      res.json({ success: true, message: 'Agente removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting agente:', error);
      res.status(500).json({ error: 'Erro ao remover agente.' });
    }
  });


  // 5. Contribuintes (Taxpayers)
  app.get('/api/contribuintes', async (req, res) => {
    try {
      await reactivateExpiredContributors();
      const tenantId = getTenantFilter(req);
      const pageValue = Number(req.query.page ?? 0);
      const pageSizeValue = Number(req.query.pageSize ?? 100);
      const page = Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
      const pageSize = Number.isSafeInteger(pageSizeValue)
        ? Math.max(1, Math.min(pageSizeValue, 100))
        : 100;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
      res.json(await getContributorsPage(tenantId, page, pageSize, search));
    } catch (error: any) {
      console.error('Error fetching contribuintes:', error);
      res.status(500).json({ error: 'Erro ao buscar contribuintes.' });
    }
  });

  app.post('/api/contribuintes', async (req, res) => {
    try {
      const b = req.body;
      const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
      const documento = typeof b.documento === 'string' ? b.documento.trim() : '';
      const mercadoId = typeof (b.mercadoId ?? b.mercado_id) === 'string' ? (b.mercadoId ?? b.mercado_id).trim() : '';
      const numBanca = typeof (b.numBanca ?? b.num_banca) === 'string' ? (b.numBanca ?? b.num_banca).trim() : '';
      const categoria = typeof b.categoria === 'string' ? b.categoria.trim() : '';
      const dimensao = typeof b.dimensao === 'string' ? b.dimensao.trim() : '';
      if (!nome || !documento || !mercadoId || !numBanca || !categoria || !['Micro', 'Pequeno', 'Médio', 'Grande'].includes(dimensao)) {
        return res.status(400).json({ error: 'Preencha nome, NIF, mercado, número da banca, categoria e dimensão válidos.' });
      }
      const [market, category] = await Promise.all([
        db.select({ id: mercados.id }).from(mercados).where(eq(mercados.id, mercadoId)).limit(1),
        db.select({ id: categoriasContribuintes.id, status: categoriasContribuintes.status }).from(categoriasContribuintes)
          .where(eq(categoriasContribuintes.id, categoria)).limit(1),
      ]);
      if (!market.length) return res.status(400).json({ error: 'Selecione um mercado válido.' });
      if (!category.length || category[0].status !== 'ativo') {
        return res.status(400).json({ error: 'Selecione uma categoria de contribuinte ativa.' });
      }
      const agenteId = await resolveContributorRegistrationAgent(req);
      const areaM2 = b.areaM2 !== undefined && b.areaM2 !== null && b.areaM2 !== '' ? Number(b.areaM2) : 0;
      if (!Number.isFinite(areaM2) || areaM2 < 0) {
        return res.status(400).json({ error: 'A área deve ser um número igual ou superior a zero.' });
      }
      const value = {
        id: b.id || `cont-${Date.now()}`,
        nome,
        telefone: typeof b.telefone === 'string' ? b.telefone.trim() : '',
        documento: documento.toUpperCase(),
        mercadoId,
        numBanca: numBanca.toUpperCase(),
        categoria,
        atividade: typeof b.atividade === 'string' ? b.atividade.trim() : '',
        dimensao,
        dataRegistro: new Date(),
        agenteId,
        observacoes: typeof (b.observacoes ?? b.observacao) === 'string' ? (b.observacoes ?? b.observacao).trim() : '',
        status: b.status || 'ativo',
        qrCode: typeof (b.qrCode ?? b.qr_code) === 'string' && (b.qrCode ?? b.qr_code).trim()
          ? (b.qrCode ?? b.qr_code).trim()
          : null,
        areaM2,
        foto: b.foto || null
      };
      const result = await db.insert(contribuintes).values(value).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating contribuinte:', error);
      res.status(500).json({ error: 'Erro ao criar contribuinte.' });
    }
  });

  app.put('/api/contribuintes/:id', async (req, res) => {
    try {
      const existing = await db.select().from(contribuintes).where(eq(contribuintes.id, req.params.id)).limit(1);
      if (!existing.length) return res.status(404).json({ error: 'Contribuinte não encontrado.' });
      if (req.auth?.kind === 'agent') {
        const keys = Object.keys(req.body || {});
        if (
          keys.some(key => !['status', 'reativarEm'].includes(key))
          || !['ativo', 'inativo'].includes(req.body?.status)
          || (req.body.status === 'ativo' && req.body.reativarEm != null)
          || (req.body.reativarEm != null && typeof req.body.reativarEm !== 'string')
        ) {
          return res.status(400).json({ error: 'O agente pode alterar apenas o estado e a data de reativação.' });
        }
        let reativarEm: string | null;
        try {
          reativarEm = req.body.status === 'inativo'
            ? await validateReactivationDate(req.body.reativarEm)
            : null;
        } catch (error) {
          return res.status(400).json({
            error: error instanceof Error ? error.message : 'A data de reativação é inválida.',
          });
        }
        const [updated] = await db.update(contribuintes)
          .set({ status: req.body.status, reativarEm })
          .where(eq(contribuintes.id, req.params.id))
          .returning();
        return res.json(updated);
      }
      const merged = { ...existing[0], ...req.body };
      const nome = typeof merged.nome === 'string' ? merged.nome.trim() : '';
      const documento = typeof merged.documento === 'string' ? merged.documento.trim() : '';
      const mercadoId = typeof merged.mercadoId === 'string' ? merged.mercadoId.trim() : '';
      const numBanca = typeof merged.numBanca === 'string' ? merged.numBanca.trim() : '';
      const categoria = typeof merged.categoria === 'string' ? merged.categoria.trim() : '';
      const dimensao = typeof merged.dimensao === 'string' ? merged.dimensao.trim() : '';
      if (!nome || !documento || !mercadoId || !numBanca || !categoria || !['Micro', 'Pequeno', 'Médio', 'Grande'].includes(dimensao)) {
        return res.status(400).json({ error: 'Preencha nome, NIF, mercado, número da banca, categoria e dimensão válidos.' });
      }
      const [market, category] = await Promise.all([
        db.select({ id: mercados.id }).from(mercados).where(eq(mercados.id, mercadoId)).limit(1),
        db.select({ id: categoriasContribuintes.id, status: categoriasContribuintes.status }).from(categoriasContribuintes)
          .where(eq(categoriasContribuintes.id, categoria)).limit(1),
      ]);
      if (!market.length) return res.status(400).json({ error: 'Selecione um mercado válido.' });
      if (!category.length || (category[0].status !== 'ativo' && categoria !== existing[0].categoria)) {
        return res.status(400).json({ error: 'Selecione uma categoria de contribuinte ativa.' });
      }
      const areaM2 = Number(merged.areaM2 ?? 0);
      if (!Number.isFinite(areaM2) || areaM2 < 0) {
        return res.status(400).json({ error: 'A área deve ser um número igual ou superior a zero.' });
      }
      const updates = {
        nome,
        telefone: typeof merged.telefone === 'string' ? merged.telefone.trim() : '',
        documento: documento.toUpperCase(),
        mercadoId,
        numBanca: numBanca.toUpperCase(),
        categoria,
        atividade: typeof merged.atividade === 'string' ? merged.atividade.trim() : '',
        dimensao,
        observacoes: typeof merged.observacoes === 'string' ? merged.observacoes.trim() : '',
        status: merged.status,
        reativarEm: merged.status === 'inativo' ? (merged.reativarEm || null) : null,
        qrCode: typeof merged.qrCode === 'string' && merged.qrCode.trim() ? merged.qrCode.trim() : null,
        areaM2,
        foto: merged.foto || null,
      };
      if (!['ativo', 'inativo'].includes(updates.status)) {
        return res.status(400).json({ error: 'Selecione um estado válido para o contribuinte.' });
      }
      try {
        updates.reativarEm = updates.status === 'inativo'
          ? await validateReactivationDate(updates.reativarEm)
          : null;
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : 'A data de reativação é inválida.',
        });
      }
      const result = await db.update(contribuintes)
        .set(updates)
        .where(eq(contribuintes.id, req.params.id))
        .returning();
      res.json(result[0] || { success: true });
    } catch (error: any) {
      console.error('Error updating contribuinte:', error);
      res.status(500).json({ error: 'Erro ao atualizar contribuinte.' });
    }
  });

  app.get('/api/categoria_contribuintes', async (_req, res) => {
    try {
      const result = await db.select().from(categoriasContribuintes).orderBy(categoriasContribuintes.nome);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching contributor categories:', error);
      res.status(500).json({ error: 'Erro ao buscar categorias de contribuintes.' });
    }
  });

  app.post('/api/categoria_contribuintes', async (req, res) => {
    try {
      const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
      const descricao = typeof req.body?.descricao === 'string' ? req.body.descricao.trim() : '';
      if (!nome) return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      const result = await db.insert(categoriasContribuintes).values({
        id: req.body.id || `categoria-${Date.now()}`,
        nome,
        descricao,
        status: req.body.status === 'inativo' ? 'inativo' : 'ativo',
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
      console.error('Error creating contributor category:', error);
      res.status(500).json({ error: 'Erro ao criar categoria de contribuinte.' });
    }
  });

  app.put('/api/categoria_contribuintes/:id', async (req, res) => {
    try {
      const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
      const descricao = typeof req.body?.descricao === 'string' ? req.body.descricao.trim() : '';
      if (!nome) return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      const result = await db.update(categoriasContribuintes)
        .set({ nome, descricao, status: req.body.status === 'inativo' ? 'inativo' : 'ativo' })
        .where(eq(categoriasContribuintes.id, req.params.id))
        .returning();
      if (!result.length) return res.status(404).json({ error: 'Categoria não encontrada.' });
      res.json(result[0]);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
      console.error('Error updating contributor category:', error);
      res.status(500).json({ error: 'Erro ao atualizar categoria de contribuinte.' });
    }
  });

  app.delete('/api/contribuintes/all', async (req, res) => {
    try {
      await db.update(contribuintes).set({ status: 'inativo', reativarEm: null });
      res.json({ success: true, message: 'Todos os contribuintes foram desativados sem remover os seus dados.' });
    } catch (error: any) {
      console.error('Error deactivating all contribuintes:', error);
      res.status(500).json({ error: 'Erro ao desativar contribuintes.' });
    }
  });

  app.delete('/api/contribuintes/:id', async (req, res) => {
    try {
      const [result] = await db.update(contribuintes)
        .set({ status: 'inativo', reativarEm: null })
        .where(eq(contribuintes.id, req.params.id))
        .returning({ id: contribuintes.id });
      if (!result) return res.status(404).json({ error: 'Contribuinte não encontrado.' });
      res.json({ success: true, message: 'Contribuinte desativado sem remover os seus dados.' });
    } catch (error: any) {
      console.error('Error deleting contribuinte:', error);
      res.status(500).json({ error: 'Erro ao remover contribuinte.' });
    }
  });


  // 6. Tipos de Receita (Revenue types)
  app.get('/api/tipos_receita', async (req, res) => {
    try {
      const result = await db.select().from(tiposReceita);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching tiposReceita:', error);
      res.status(500).json({ error: 'Erro ao buscar tipos de receita.' });
    }
  });

  app.post('/api/tipos_receita', async (req, res) => {
    try {
      const result = await db.insert(tiposReceita).values(req.body).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating tipo_receita:', error);
      res.status(500).json({ error: 'Erro ao criar tipo de receita.' });
    }
  });

  app.put('/api/tipos_receita/:id', async (req, res) => {
    try {
      const result = await db.update(tiposReceita)
        .set(req.body)
        .where(eq(tiposReceita.id, req.params.id))
        .returning();
      res.json(result[0] || { success: true });
    } catch (error: any) {
      console.error('Error updating tipo_receita:', error);
      res.status(500).json({ error: 'Erro ao atualizar tipo de receita.' });
    }
  });

  app.delete('/api/tipos_receita/all', async (req, res) => {
    try {
      await db.delete(tiposReceita);
      res.json({ success: true, message: 'Todos os tipos de receita foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all tipos_receita:', error);
      res.status(500).json({ error: 'Erro ao limpar tipos de receita.' });
    }
  });

  app.delete('/api/tipos_receita/:id', async (req, res) => {
    try {
      await db.delete(tiposReceita).where(eq(tiposReceita.id, req.params.id));
      res.json({ success: true, message: 'Tipo de receita removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting tipo_receita:', error);
      res.status(500).json({ error: 'Erro ao remover tipo de receita.' });
    }
  });


  // 7. Pagamentos (Payments)
  app.get('/api/pagamentos', async (req, res) => {
    try {
      const tenantId = getTenantFilter(req);
      let result;
      if (req.auth?.kind === 'agent') {
        result = await db.select().from(pagamentos).where(eq(pagamentos.agenteId, req.auth.id));
      } else if (tenantId) {
        result = await db.select().from(pagamentos).where(eq(pagamentos.municipioId, tenantId));
      } else {
        result = await db.select().from(pagamentos);
      }
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching pagamentos:', error);
      res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
    }
  });

  app.post('/api/pagamentos', async (req, res) => {
    try {
      const normalized = await normalizePagamentoPayload(req.body, req.auth);
      const existing = await db.select().from(pagamentos).where(eq(pagamentos.id, normalized.id)).limit(1);
      if (existing[0] && (
        existing[0].municipioId !== normalized.municipioId
        || (req.auth?.kind === 'agent' && existing[0].agenteId !== req.auth.id)
      )) {
        return res.status(409).json({ error: 'O identificador do pagamento já está em uso.' });
      }
      let result;
      if (existing.length > 0) {
        result = await db.update(pagamentos)
          .set(normalized)
          .where(eq(pagamentos.id, normalized.id))
          .returning();
      } else {
        result = await db.insert(pagamentos).values(normalized).returning();
      }
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating pagamento:', error);
      res.status(500).json({ error: 'Erro ao registrar pagamento.' });
    }
  });

  app.put('/api/pagamentos/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await db.select().from(pagamentos).where(eq(pagamentos.id, id)).limit(1);
      if (!existing.length) {
        return res.status(404).json({ error: 'Pagamento não encontrado' });
      }
      const merged = { ...existing[0], ...req.body, id };
      const normalized = await normalizePagamentoPayload(merged, req.auth);
      const result = await db.update(pagamentos)
        .set(normalized)
        .where(eq(pagamentos.id, id))
        .returning();
      res.json(result[0] || { success: true });
    } catch (error: any) {
      console.error('Error updating pagamento:', error);
      res.status(500).json({ error: 'Erro ao atualizar pagamento.' });
    }
  });

  app.delete('/api/pagamentos/all', async (req, res) => {
    try {
      await db.delete(pagamentos);
      res.json({ success: true, message: 'Todos os pagamentos e recibos foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all pagamentos:', error);
      res.status(500).json({ error: 'Erro ao limpar todos os pagamentos.' });
    }
  });

  app.delete('/api/pagamentos/:id', async (req, res) => {
    try {
      await db.delete(pagamentos).where(eq(pagamentos.id, req.params.id));
      res.json({ success: true, message: 'Pagamento removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting pagamento:', error);
      res.status(500).json({ error: 'Erro ao remover pagamento.' });
    }
  });


  // 8. Auditoria (Audit logs)
  app.get('/api/auditoria', async (req, res) => {
    try {
      const result = await db.select().from(auditoriaLog);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching auditoria logs:', error);
      res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
    }
  });

  app.post('/api/auditoria', async (req, res) => {
    try {
      const { acao, descricao } = req.body || {};
      if (typeof acao !== 'string' || acao.length > 100 || typeof descricao !== 'string' || descricao.length > 2000) {
        return res.status(400).json({ error: 'Dados de auditoria inválidos.' });
      }
      const now = new Date();
      const result = await db.insert(auditoriaLog).values({
        id: `audit-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        usuario: req.auth?.email || req.auth?.id || 'unknown',
        perfil: req.auth?.role || 'unknown',
        data: now.toISOString().slice(0, 10),
        hora: now.toISOString().slice(11, 19),
        ip: req.ip || 'unknown',
        dispositivo: req.get('x-client-type') || 'unknown',
        acao,
        descricao,
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating auditoria log:', error);
      res.status(500).json({ error: 'Erro ao criar log de auditoria.' });
    }
  });

  app.delete('/api/auditoria/all', async (req, res) => {
    try {
      await db.delete(auditoriaLog);
      res.json({ success: true, message: 'Todos os logs de auditoria foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all auditoria logs:', error);
      res.status(500).json({ error: 'Erro ao limpar logs de auditoria.' });
    }
  });


  // 9. Sincronizacao (Sync logs)
  app.get('/api/sincronizacao', async (req, res) => {
    try {
      const result = await db.select().from(sincronizacaoLog);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching sincronizacao logs:', error);
      res.status(500).json({ error: 'Erro ao buscar logs de sincronização.' });
    }
  });

  app.post('/api/sincronizacao', async (req, res) => {
    try {
      if (req.auth?.kind !== 'agent') return res.status(403).json({ error: 'Ação não autorizada.' });
      const registrosSincronizados = Number(req.body?.registrosSincronizados);
      if (!Number.isSafeInteger(registrosSincronizados) || registrosSincronizados < 0) {
        return res.status(400).json({ error: 'Contagem de sincronização inválida.' });
      }
      const result = await db.insert(sincronizacaoLog).values({
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agenteId: req.auth.id,
        ultimaSincronizacao: new Date().toISOString(),
        registrosSincronizados,
        status: 'sucesso',
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating sincronizacao log:', error);
      res.status(500).json({ error: 'Erro ao criar log de sincronização.' });
    }
  });

  app.delete('/api/sincronizacao/all', async (req, res) => {
    try {
      await db.delete(sincronizacaoLog);
      res.json({ success: true, message: 'Todos os logs de sincronização foram limpos com sucesso' });
    } catch (error: any) {
      console.error('Error deleting all sincronizacao logs:', error);
      res.status(500).json({ error: 'Erro ao limpar logs de sincronização.' });
    }
  });

  // Bridge Sync Helper for PlanetHoster
  async function syncFromPlanetHosterBridge() {
    try {
      const https = await import('https');
      const bridgeUrl = 'https://receita.audicontabissau.gw/api-bridge.php?action=all';
      const bridgeData: any = await new Promise((resolve, reject) => {
        const req = https.get(bridgeUrl, { timeout: 10000 }, (res) => {
          let raw = '';
          res.on('data', (c) => raw += c);
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error('Invalid JSON from bridge'));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout connecting to bridge'));
        });
      });

      if (bridgeData.municipios?.length) {
        for (const m of bridgeData.municipios) {
          await db.insert(municipios).values({
            id: m.id,
            nome: m.nome,
            codigo: m.codigo,
            regiao: m.regiao,
            endereco: m.endereco,
            telefone: m.telefone,
            email: m.email,
            responsavel: m.responsavel,
            status: m.status || 'ativo',
            paisId: m.pais_id || 'gw',
            paisNome: m.pais_nome || 'Guiné-Bissau',
            ministerioId: m.ministerio_id || 'mat-gw',
            ministerioNome: m.ministerio_nome || 'Ministério da Administração Territorial',
            plano: m.plano || 'Prata',
            dataAtivacao: m.data_ativacao || '2026-01-01',
            dataValidade: m.data_validade || '2027-01-01',
            estadoLicenca: m.estado_licenca || 'ativo',
            modulosHabilitados: typeof m.modulos_habilitados === 'object' ? JSON.stringify(m.modulos_habilitados) : (m.modulos_habilitados || '[]'),
            limiteUsuarios: parseInt(m.limite_usuarios || '100', 10),
            limiteArmazenamento: parseInt(m.limite_armazenamento || '10', 10)
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.mercados?.length) {
        for (const mk of bridgeData.mercados) {
          await db.insert(mercados).values({
            id: mk.id,
            nome: mk.nome,
            municipioId: mk.municipio_id,
            lat: parseFloat(mk.lat || '0'),
            lng: parseFloat(mk.lng || '0'),
            gpsLabel: mk.gps_label || mk.nome,
            qtdBancas: parseInt(mk.qtd_bancas || '0', 10),
            responsavel: mk.responsavel,
            telefone: mk.telefone,
            status: mk.status || 'ativo'
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.agentes?.length) {
        for (const a of bridgeData.agentes) {
          await db.insert(agentes).values({
            id: a.id,
            foto: a.foto || '',
            nome: a.nome,
            telefone: a.telefone,
            email: a.email,
            usuario: a.usuario,
            mercadoId: a.mercado_id,
            municipioId: a.municipio_id,
            cargo: a.cargo,
            status: a.status || 'ativo',
            permissoes: a.permissoes || '',
            senha: await hashImportedPassword(a.senha)
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.contribuintes?.length) {
        for (const c of bridgeData.contribuintes) {
          const nome = typeof c.nome === 'string' ? c.nome.trim() : '';
          const documento = typeof c.documento === 'string' ? c.documento.trim() : '';
          const mercadoId = typeof c.mercado_id === 'string' ? c.mercado_id.trim() : '';
          const numBanca = typeof c.num_banca === 'string' ? c.num_banca.trim() : '';
          if (!c.id || !nome || !documento || !mercadoId || !numBanca) {
            console.warn('Skipped bridge contributor without required name, NIF, market, stall number, or id.');
            continue;
          }
          const classification = classifyImportedContributor(c.atividade, c.categoria);
          const [category] = await db.select({ id: categoriasContribuintes.id })
            .from(categoriasContribuintes)
            .where(eq(categoriasContribuintes.nome, classification.categoria))
            .limit(1);
          if (!category) {
            console.warn('Skipped bridge contributor because its category is not configured.');
            continue;
          }
          await db.insert(contribuintes).values({
            id: c.id,
            nome,
            telefone: typeof c.telefone === 'string' ? c.telefone.trim() : '',
            documento: documento.toUpperCase(),
            mercadoId,
            numBanca: numBanca.toUpperCase(),
            categoria: category.id,
            atividade: classification.atividade,
            dimensao: classification.dimensao,
            dataRegistro: new Date(),
            agenteId: LEGACY_REGISTRATION_AGENT_ID,
            observacoes: typeof c.observacoes === 'string' ? c.observacoes.trim() : '',
            status: c.status || 'ativo',
            qrCode: typeof c.qr_code === 'string' && c.qr_code.trim() ? c.qr_code.trim() : null,
            areaM2: c.area_m2 !== undefined && c.area_m2 !== null && c.area_m2 !== '' ? parseFloat(c.area_m2) : 0,
            foto: c.foto || ''
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.tipos_receita?.length) {
        for (const t of bridgeData.tipos_receita) {
          await db.insert(tiposReceita).values({
            id: t.id,
            nome: t.nome,
            descricao: t.descricao,
            valor: parseFloat(t.valor || '0'),
            periodicidade: t.periodicidade || 'Diário',
            status: t.status || 'ativo'
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.pagamentos?.length) {
        for (const p of bridgeData.pagamentos) {
          await db.insert(pagamentos).values({
            id: p.id,
            reciboId: p.recibo_id,
            municipioId: p.municipio_id,
            mercadoId: p.mercado_id,
            agenteId: p.agente_id,
            contribuinteId: p.contribuinte_id,
            tipoReceitaId: p.tipo_receita_id,
            valor: parseFloat(p.valor || '0'),
            formaPagamento: p.forma_pagamento,
            dataPagamento: p.data_pagamento,
            status: p.status || 'pago',
            observacao: p.observacao,
            dataCriacao: p.data_criacao || p.data_pagamento
          }).onConflictDoNothing();
        }
      }

      if (bridgeData.usuarios?.length) {
        for (const u of bridgeData.usuarios) {
          await db.insert(usuarios).values({
            id: u.id,
            nome: u.nome,
            email: u.email,
            municipioId: (u.municipio_id && u.municipio_id !== '' && u.municipio_id !== 'null') ? u.municipio_id : null,
            perfil: u.perfil || 'Supervisor',
            status: u.status || 'ativo',
            usuario: u.usuario || u.username,
            senha: await hashImportedPassword(u.senha)
          }).onConflictDoNothing();
        }
      }

      return { success: true, countContribuintes: bridgeData.contribuintes?.length || 0 };
    } catch (err: any) {
      console.warn('Bridge sync note:', err.message);
      return { success: false, error: err.message };
    }
  }

  // PlanetHoster Bridge Sync Endpoint
  app.post('/api/sync-bridge', async (req, res) => {
    const result = await syncFromPlanetHosterBridge();
    res.json(result);
  });

  // Bulk Reset All Operational Data Endpoint
  app.delete('/api/reset-all', async (req, res) => {
    try {
      await db.delete(pagamentos);
      await db.delete(contribuintes);
      await db.delete(agentes);
      await db.delete(mercados);
      await db.delete(auditoriaLog);
      await db.delete(sincronizacaoLog);
      res.json({ success: true, message: 'Todos os dados operacionais do sistema foram redefinidos e zerados com sucesso' });
    } catch (error: any) {
      console.error('Error in reset-all endpoint:', error);
      res.status(500).json({ error: 'Erro ao redefinir base de dados.' });
    }
  });


  // 10. Configuracoes (System config)
  app.get('/api/configuracoes', async (req, res) => {
    try {
      const result = await db.select().from(configuracoes).where(eq(configuracoes.id, 1));
      res.json(result[0] || {});
    } catch (error: any) {
      console.error('Error fetching configuracoes:', error);
      res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
  });

  app.put('/api/configuracoes', async (req, res) => {
    try {
      const updates = validateConfigurationUpdates(req.body);
      if (!updates) {
        return res.status(400).json({ error: 'Os dados de configuração são inválidos ou contêm campos não suportados.' });
      }
      const result = await db.update(configuracoes)
        .set(updates)
        .where(eq(configuracoes.id, 1))
        .returning();
      if (!result[0]) {
        return res.status(404).json({ error: 'A configuração do sistema ainda não foi inicializada.' });
      }
      res.json(result[0]);
    } catch (error: any) {
      console.error('Error updating configuracoes:', error);
      res.status(500).json({ error: 'Erro ao atualizar configurações.' });
    }
  });

  // --- VITE DEV / PRODUCTION HANDLERS ---
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === "production"
    || (hasDist && process.env.NODE_ENV !== "development");

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint não encontrado' });
      }
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          next(err);
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    // Run DB initialization in background without blocking server startup / Cloud Run healthchecks
    initializeDatabase().then(async () => {
      await reactivateExpiredContributors();
      setInterval(() => {
        reactivateExpiredContributors().catch(error => {
          console.error('Failed to reactivate contributors whose scheduled date has arrived:', error);
        });
      }, 60_000);
      console.log('Synchronizing initial data from PlanetHoster bridge...');
      await syncFromPlanetHosterBridge();
    }).catch((err) => {
      console.error('Database initialization failed in background:', err);
    });
  });
}

startServer();
