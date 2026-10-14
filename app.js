import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import { createAuthSecurity, hashPassword, migratePlaintextPasswords, verifyStoredPassword } from './src/auth/security.js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do PostgreSQL via DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to connect to PostgreSQL.");
}
const parsedDatabaseUrl = new URL(databaseUrl);
const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname);
const isSslRequired = parsedDatabaseUrl.searchParams.get('sslmode') === 'require'
  || parsedDatabaseUrl.hostname.includes('supabase')
  || (process.env.NODE_ENV === 'production' && !isLocalDatabase);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isSslRequired ? { rejectUnauthorized: true } : undefined,
});
const auth = createAuthSecurity(pool);
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(auth.cors);
app.use(auth.authenticateApi);
app.use(auth.authorizeApi);

// Helper de filtro multi-tenant
const getTenantFilter = (req) => {
  const role = req.auth?.role;
  const municipioId = req.auth?.municipalityId;
  
  const isNationalUser = [
    'Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator',
    'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
  ].includes(role);
  if (isNationalUser) return null;
  
  return municipioId || null;
};

const isPlatformRole = (req) => [
  'Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator',
].includes(req.auth?.role);
const MUNICIPAL_USER_ROLES = new Set([
  'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro',
  'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios', 'Auditor',
]);

// ==========================================================
// INICIALIZA��O AUTOM�TICA DO BANCO E SEED INICIAL
// ==========================================================
async function initDatabase() {
  console.log('Verificando tabelas no PostgreSQL da PlanetHoster...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_type TEXT NOT NULL CHECK (user_type IN ('user', 'agent')),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        replaced_by_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_family_id_idx ON auth_sessions(family_id);
      CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, user_type);
    `);

    // 1. Criar Tabelas Principais se n�o existirem
    await pool.query(`
      CREATE TABLE IF NOT EXISTS municipios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        codigo TEXT NOT NULL,
        regiao TEXT NOT NULL,
        endereco TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT NOT NULL,
        responsavel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        pais_id TEXT,
        pais_nome TEXT,
        ministerio_id TEXT,
        ministerio_nome TEXT,
        plano TEXT,
        data_ativacao TEXT,
        data_validade TEXT,
        estado_licenca TEXT,
        modulos_habilitados TEXT,
        limite_usuarios INTEGER,
        limite_armazenamento INTEGER
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        municipio_id TEXT,
        perfil TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        usuario TEXT,
        senha TEXT
      );

      CREATE TABLE IF NOT EXISTS mercados (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        municipio_id TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        gps_label TEXT,
        qtd_bancas INTEGER NOT NULL,
        responsavel TEXT NOT NULL,
        telefone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo'
      );

      CREATE TABLE IF NOT EXISTS agentes (
        id TEXT PRIMARY KEY,
        foto TEXT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        usuario TEXT NOT NULL UNIQUE,
        mercado_id TEXT NOT NULL,
        municipio_id TEXT NOT NULL,
        cargo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        permissoes TEXT NOT NULL,
        reset_senha_pending BOOLEAN DEFAULT false,
        senha_temporaria TEXT,
        senha TEXT
      );

      CREATE TABLE IF NOT EXISTS contribuintes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        documento TEXT NOT NULL,
        mercado_id TEXT NOT NULL,
        num_banca TEXT NOT NULL,
        categoria TEXT NOT NULL,
        atividade TEXT NOT NULL,
        dimensao TEXT,
        observacoes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        qr_code TEXT,
        area_m2 REAL,
        foto TEXT
      );
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS dimensao TEXT;

      CREATE TABLE IF NOT EXISTS categoria_contribuintes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ativo'
      );
      CREATE UNIQUE INDEX IF NOT EXISTS categoria_contribuintes_nome_unique_idx
        ON categoria_contribuintes (LOWER(nome));

      CREATE TABLE IF NOT EXISTS tipos_receita (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL,
        valor INTEGER NOT NULL,
        periodicidade TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo'
      );

      CREATE TABLE IF NOT EXISTS pagamentos (
        id TEXT PRIMARY KEY,
        recibo_id TEXT NOT NULL,
        municipio_id TEXT NOT NULL,
        mercado_id TEXT NOT NULL,
        agente_id TEXT NOT NULL,
        contribuinte_id TEXT NOT NULL,
        tipo_receita_id TEXT NOT NULL,
        valor INTEGER NOT NULL,
        forma_pagamento TEXT NOT NULL,
        data_pagamento TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pago',
        observacao TEXT,
        comprovativo_url TEXT,
        data_criacao TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auditoria_log (
        id TEXT PRIMARY KEY,
        usuario TEXT NOT NULL,
        perfil TEXT NOT NULL,
        data TEXT NOT NULL,
        hora TEXT NOT NULL,
        ip TEXT NOT NULL,
        dispositivo TEXT NOT NULL,
        acao TEXT NOT NULL,
        descricao TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sincronizacao_log (
        id TEXT PRIMARY KEY,
        agente_id TEXT NOT NULL,
        ultima_sincronizacao TEXT NOT NULL,
        registros_sincronizados INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'sucesso'
      );

      CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY,
        logo_camara TEXT,
        nome_municipio TEXT NOT NULL,
        moeda TEXT NOT NULL,
        fuso_horario TEXT NOT NULL,
        backup_habilitado BOOLEAN NOT NULL DEFAULT true,
        tema_escuro BOOLEAN NOT NULL DEFAULT false,
        notificacoes_habilitadas BOOLEAN NOT NULL DEFAULT true,
        taxa_comissao INTEGER NOT NULL DEFAULT 10,
        comissao_paga INTEGER NOT NULL DEFAULT 0,
        meta_diaria_agente INTEGER NOT NULL DEFAULT 100000,
        percentual_incentivo INTEGER NOT NULL DEFAULT 5
      );
    `);

    const contributorCategories = [
      ['cat-alimentos-frescos', 'Alimentos e Produtos Frescos', 'Comércio de alimentos, produtos agrícolas, carnes, peixes e bebidas.'],
      ['cat-vestuario', 'Vestuário, Tecidos e Calçados', 'Roupas, tecidos, calçados e acessórios de vestuário.'],
      ['cat-eletronica', 'Eletrônica, Telecomunicações e Reparação', 'Equipamentos eletrônicos, celulares, acessórios e serviços técnicos.'],
      ['cat-automovel', 'Automóvel e Peças', 'Peças, acessórios e artigos para veículos.'],
      ['cat-construcao', 'Construção e Materiais', 'Materiais de construção, eletricidade, canalização e ferramentas.'],
      ['cat-cosmetica', 'Cosmética e Higiene', 'Cosméticos, produtos de beleza, higiene e perfumaria.'],
      ['cat-artesanato', 'Artesanato e Produção', 'Produtos artesanais, confecção e produção local.'],
      ['cat-comercio-geral', 'Comércio Geral/Por Classificar', 'Produtos diversos ou atividade ainda não especificada.'],
    ];
    for (const [id, nome, descricao] of contributorCategories) {
      await pool.query(
        `INSERT INTO categoria_contribuintes (id, nome, descricao, status)
         VALUES ($1, $2, $3, 'ativo')
         ON CONFLICT (id) DO NOTHING`,
        [id, nome, descricao],
      );
    }
    await pool.query(`
      UPDATE contribuintes AS contribuinte
      SET categoria = categoria_ref.id
      FROM categoria_contribuintes AS categoria_ref
      WHERE contribuinte.categoria = categoria_ref.nome;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'contribuintes_categoria_fk'
            AND conrelid = 'contribuintes'::regclass
        ) THEN
          ALTER TABLE contribuintes
            ADD CONSTRAINT contribuintes_categoria_fk
            FOREIGN KEY (categoria)
            REFERENCES categoria_contribuintes(id)
            ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    await migratePlaintextPasswords(pool);

    // 2. Bootstrap one administrator only when explicit credentials are configured.
    const countUsers = await pool.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(countUsers.rows[0].count, 10) === 0 && process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      const email = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
      const username = process.env.BOOTSTRAP_ADMIN_USERNAME || email.split('@')[0];
      const passwordHash = await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
      await pool.query(
        `INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha)
         VALUES ($1, $2, $3, NULL, 'Platform Owner', 'ativo', $4, $5)
         ON CONFLICT DO NOTHING`,
        ['user-owner', 'Administrador de Plataforma', email, username, passwordHash],
      );
    } else if (parseInt(countUsers.rows[0].count, 10) === 0) {
      console.warn('Bootstrap admin skipped: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.');
    }

    // 3. Configura��es Globais
    const countConf = await pool.query('SELECT COUNT(*) FROM configuracoes');
    if (parseInt(countConf.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO configuracoes (id, logo_camara, nome_municipio, moeda, fuso_horario, backup_habilitado, tema_escuro, notificacoes_habilitadas, taxa_comissao, comissao_paga) VALUES
        (1, '', 'C�mara Municipal de Bissau', 'FCFA', 'GMT-0', true, false, true, 10, 0)
        ON CONFLICT DO NOTHING;
      `);
    }

    // 4. Se a base de munic�pios estiver vazia, criar Munic�pio de Bissau, Mercados, Agentes e Taxas
    const countMuni = await pool.query('SELECT COUNT(*) FROM municipios');
    if (parseInt(countMuni.rows[0].count, 10) === 0) {
      console.log('Carregando dados iniciais da C�mara de Bissau e Mercados...');
      
      // Munic�pio de Bissau
      await pool.query(`
        INSERT INTO municipios (id, nome, codigo, regiao, endereco, telefone, email, responsavel, status, pais_id, pais_nome, ministerio_id, ministerio_nome, plano, data_ativacao, data_validade, estado_licenca, modulos_habilitados, limite_usuarios, limite_armazenamento)
        VALUES ('muni-bissau', 'C�mara Municipal de Bissau', 'CMB', 'SAB', 'Avenida Am�lcar Cabral, CP 210, Bissau', '+245 955 000 111', 'contato@cmbissau.gw', 'Presidente da CMB', 'ativo', 'gw', 'Guin�-Bissau', 'mat-gw', 'Minist�rio da Administra��o Territorial', 'Ouro', '2026-01-01', '2027-12-31', 'ativo', 'Mercados,Taxas,Financeiro,Fiscaliza��o,Tesouraria,Relat�rios,Auditoria', 500, 50);
      `);

      // Mercados
      await pool.query(`
        INSERT INTO mercados (id, nome, municipio_id, lat, lng, gps_label, qtd_bancas, responsavel, telefone, status) VALUES
        ('merc-bandim', 'Mercado Central de Bandim', 'muni-bissau', 11.8638, -15.5892, 'Bandim, Bissau', 450, 'Mamad� Sanh�', '+245 955 123 456', 'ativo'),
        ('merc-caracol', 'Mercado do Caracol', 'muni-bissau', 11.8710, -15.6015, 'Caracol, Bissau', 280, 'Fatoumata Djal�', '+245 966 234 567', 'ativo'),
        ('merc-plaque', 'Mercado da Plaque 2', 'muni-bissau', 11.8540, -15.5780, 'Plaque, Bissau', 180, 'Braima Camar�', '+245 955 889 900', 'ativo')
        ON CONFLICT DO NOTHING;
      `);

      // Tipos de Receita (Taxas)
      await pool.query(`
        INSERT INTO tipos_receita (id, nome, descricao, valor, periodicidade, status) VALUES
        ('taxa-diaria-banca', 'Taxa Di�ria de Ocupa��o de Banca', 'Tarifa fixa di�ria cobrada de feirantes em bancas cobertas', 500, 'Di�rio', 'ativo'),
        ('taxa-mensal-loja', 'Taxa Mensal de Loja Modular', 'Tarifa mensal para boxes fechados e quiosques', 15000, 'Mensal', 'ativo'),
        ('taxa-ambulante', 'Licen�a de Vendedor Ambulante', 'Ocupa��o tempor�ria em corredores de circula��o', 300, 'Di�rio', 'ativo'),
        ('taxa-saneamento', 'Taxa de Higiene e Recolha de Lixo', 'Taxa semanal de res�duos s�lidos nos mercados', 1000, 'Semanal', 'ativo')
        ON CONFLICT DO NOTHING;
      `);

      // Agentes Fiscais
      await pool.query(`
        INSERT INTO agentes (id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, senha) VALUES
        ('agent-1', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Abduramane Bald�', '+245 955 112 233', 'abduramane@receita360.gw', 'fiscal.balde', 'merc-bandim', 'muni-bissau', 'Fiscal de Cobran�a', 'ativo', 'coleta,sincronizacao,recibos', NULL),
        ('agent-2', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Aminata Embal�', '+245 966 334 455', 'aminata@receita360.gw', 'fiscal.embalo', 'merc-caracol', 'muni-bissau', 'Fiscal de Cobran�a', 'ativo', 'coleta,sincronizacao,recibos', NULL)
        ON CONFLICT DO NOTHING;
      `);

    }

    console.log('PostgreSQL pronto e populado com sucesso!');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
  }
}

// ==========================================================
// ROTA PRINCIPAL DE SINCRONIZA��O EM MASSA (SYNC-STATE)
// ==========================================================
app.get('/api/sync-state', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const platformWide = tenantId === null;
    const isAgent = req.auth.kind === 'agent';
    let muniQuery = tenantId ? 'SELECT * FROM municipios WHERE id = $1 ORDER BY nome ASC' : 'SELECT * FROM municipios ORDER BY nome ASC';
    let mercQuery = tenantId ? 'SELECT * FROM mercados WHERE municipio_id = $1' : 'SELECT * FROM mercados';
    let agentQuery = isAgent
      ? 'SELECT id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, reset_senha_pending FROM agentes WHERE id = $1'
      : tenantId
      ? 'SELECT id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, reset_senha_pending FROM agentes WHERE municipio_id = $1'
      : 'SELECT id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, reset_senha_pending FROM agentes';
    let userQuery = tenantId ? 'SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios WHERE municipio_id = $1' : 'SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios';
    let pagQuery = isAgent
      ? 'SELECT * FROM pagamentos WHERE agente_id = $1 ORDER BY data_pagamento DESC LIMIT 1000'
      : tenantId
        ? 'SELECT * FROM pagamentos WHERE municipio_id = $1 ORDER BY data_pagamento DESC LIMIT 1000'
        : 'SELECT * FROM pagamentos ORDER BY data_pagamento DESC LIMIT 1000';
    let contrQuery = tenantId ? `SELECT c.* FROM contribuintes c INNER JOIN mercados m ON c.mercado_id = m.id WHERE m.municipio_id = $1` : 'SELECT * FROM contribuintes';

    const tenantParams = tenantId ? [tenantId] : [];
    const agentParams = isAgent ? [req.auth.id] : tenantParams;

    const [
      usuariosRes,
      municipiosRes,
      mercadosRes,
      agentesRes,
      contribuintesRes,
      tiposReceitaRes,
      pagamentosRes,
      auditoriaRes,
      sincronizacaoRes,
      configRes
    ] = await Promise.all([
      isAgent ? Promise.resolve({ rows: [] }) : pool.query(userQuery, tenantParams),
      pool.query(muniQuery, tenantParams),
      pool.query(mercQuery, tenantParams),
      pool.query(agentQuery, agentParams),
      pool.query(contrQuery, tenantParams),
      pool.query('SELECT * FROM tipos_receita'),
      pool.query(pagQuery, agentParams),
      platformWide
        ? pool.query('SELECT * FROM auditoria_log ORDER BY data DESC, hora DESC LIMIT 200')
        : Promise.resolve({ rows: [] }),
      platformWide
        ? pool.query('SELECT * FROM sincronizacao_log ORDER BY ultima_sincronizacao DESC LIMIT 100')
        : isAgent
          ? pool.query('SELECT * FROM sincronizacao_log WHERE agente_id = $1 ORDER BY ultima_sincronizacao DESC LIMIT 100', [req.auth.id])
          : Promise.resolve({ rows: [] }),
      platformWide ? pool.query('SELECT * FROM configuracoes LIMIT 1') : Promise.resolve({ rows: [] })
    ]);

    const formattedMunicipios = municipiosRes.rows.map(m => ({
      ...m,
      paisId: m.pais_id,
      paisNome: m.pais_nome,
      ministerioId: m.ministerio_id,
      ministerioNome: m.ministerio_nome,
      dataAtivacao: m.data_ativacao,
      dataValidade: m.data_validade,
      estadoLicenca: m.estado_licenca,
      modulosHabilitados: m.modulos_habilitados ? m.modulos_habilitados.split(',') : [],
      limiteUsuarios: m.limite_usuarios,
      limiteArmazenamento: m.limite_armazenamento
    }));

    const formattedMercados = mercadosRes.rows.map(m => ({
      id: m.id,
      nome: m.nome,
      municipioId: m.municipio_id,
      qtdBancas: m.qtd_bancas,
      responsavel: m.responsavel,
      telefone: m.telefone,
      status: m.status,
      localizacaoGps: { lat: m.lat || 0, lng: m.lng || 0, label: m.gps_label || m.nome }
    }));

    const formattedAgentes = agentesRes.rows
      .filter(a => req.auth?.kind !== 'agent' || a.id === req.auth.id)
      .map(a => ({
      id: a.id,
      foto: a.foto,
      nome: a.nome,
      telefone: a.telefone,
      email: a.email,
      usuario: a.usuario,
      mercadoId: a.mercado_id,
      municipioId: a.municipio_id,
      cargo: a.cargo,
      status: a.status,
      resetSenhaPending: a.reset_senha_pending,
      permissoes: a.permissoes ? a.permissoes.split(',') : []
      }));

    const formattedContribuintes = contribuintesRes.rows.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      documento: c.documento,
      mercadoId: c.mercado_id,
      numBanca: c.num_banca,
      categoria: c.categoria,
      atividade: c.atividade,
      dimensao: c.dimensao,
      observacoes: c.observacoes,
      status: c.status,
      qrCode: c.qr_code,
      areaM2: c.area_m2,
      foto: c.foto
    }));

    const formattedPagamentos = pagamentosRes.rows.map(p => ({
      id: p.id,
      reciboId: p.recibo_id,
      municipioId: p.municipio_id,
      mercadoId: p.mercado_id,
      agenteId: p.agente_id,
      contribuinteId: p.contribuinte_id,
      tipoReceitaId: p.tipo_receita_id,
      valor: p.valor,
      formaPagamento: p.forma_pagamento,
      dataPagamento: p.data_pagamento,
      status: p.status,
      observacao: p.observacao,
      comprovativoUrl: p.comprovativo_url,
      dataCriacao: p.data_criacao
    }));

    const rawConf = configRes.rows[0] || {};
    const formattedConfig = {
      id: rawConf.id || 1,
      logoCamara: rawConf.logo_camara || '',
      nomeMunicipio: rawConf.nome_municipio || 'C�mara Municipal de Bissau',
      moeda: rawConf.moeda || 'FCFA',
      fusoHorario: rawConf.fuso_horario || 'GMT-0',
      backupHabilitado: rawConf.backup_habilitado ?? true,
      temaEscuro: rawConf.tema_escuro ?? false,
      notificacoesHabilitadas: rawConf.notificacoes_habilitadas ?? true,
      taxaComissao: rawConf.taxa_comissao || 10,
      comissaoPaga: rawConf.comissao_paga || 0,
      metaDiariaAgente: rawConf.meta_diaria_agente || 100000,
      percentualIncentivo: rawConf.percentual_incentivo || 5
    };

    res.json({
      usuarios: usuariosRes.rows,
      municipios: formattedMunicipios,
      mercados: formattedMercados,
      agentes: formattedAgentes,
      contribuintes: formattedContribuintes,
      tipos_receita: tiposReceitaRes.rows,
      pagamentos: formattedPagamentos,
      auditoria: auditoriaRes.rows,
      sincronizacao: sincronizacaoRes.rows,
      configuracoes: formattedConfig
    });
  } catch (error) {
    console.error('Erro no sync-state:', error);
    console.error('Sync-state request failed.');
    res.status(500).json({ error: 'Erro ao sincronizar dados.' });
  }
});

// Status de Conex�o do Banco
app.get('/api/database-status', async (req, res) => {
  const startTime = Date.now();
  try {
    const dbInfoResult = await pool.query(`
      SELECT 
        current_database() as database_name,
        current_user as user_name,
        now() as server_time,
        version() as version
    `);

    const counts = {};
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
      latencyMs: Date.now() - startTime,
      database: {
        name: dbInfoResult.rows[0]?.database_name || 'audijvwc_receita_dbtst',
        user: dbInfoResult.rows[0]?.user_name || 'audijvwc_receita',
        serverTime: dbInfoResult.rows[0]?.server_time,
        version: dbInfoResult.rows[0]?.version,
        engine: 'PostgreSQL Local (PlanetHoster)',
        ssl: false
      },
      counts,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'erro_conexao',
      success: false,
      latencyMs: Date.now() - startTime,
      error: 'Erro interno do servidor.',
      checkedAt: new Date().toISOString()
    });
  }
});

// ==========================================================
// CRUD ENDPOINTS
// ==========================================================

app.post('/api/auth/login', auth.authRateLimit, async (req, res) => {
  try {
    const { login, password } = req.body;
    if (typeof login !== 'string' || login.length > 254 || typeof password !== 'string' || !password || password.length > 128) {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    const input = login.toLowerCase().trim();
    const result = await pool.query(
      `SELECT id, nome, email, municipio_id, perfil, status, usuario, senha
       FROM usuarios
       WHERE lower(email) = $1 OR lower(COALESCE(usuario, '')) = $1 OR lower(id) = $1
       LIMIT 1`,
      [input],
    );
    const user = result.rows[0];

    if (!user || user.status !== 'ativo') {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    const check = await verifyStoredPassword(password, user.senha || '');
    if (!check.valid) {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    if (check.needsRehash) {
      await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [
        await hashPassword(password, { minimumLength: 1 }),
        user.id,
      ]);
    }
    return auth.issueSession(req, res, {
      id: user.id,
      nome: user.nome,
      email: user.email,
      usuario: user.usuario,
      municipioId: user.municipio_id,
      perfil: user.perfil,
      role: user.perfil,
      municipalityId: user.municipio_id,
      kind: 'user',
    });
  } catch {
    console.error('User authentication failed.');
    return res.status(500).json({ error: 'Não foi possível autenticar.' });
  }
});

app.post('/api/auth/refresh', auth.authRateLimit, auth.refresh);
app.post('/api/auth/logout', auth.logout);
app.get('/api/auth/me', async (req, res) => {
  const table = req.auth.kind === 'agent' ? 'agentes' : 'usuarios';
  const columns = req.auth.kind === 'agent'
    ? 'id, nome, email, usuario, municipio_id AS "municipioId", cargo AS perfil, status, permissoes, reset_senha_pending AS "resetSenhaPending"'
    : 'id, nome, email, usuario, municipio_id AS "municipioId", perfil, status';
  const result = await pool.query(`SELECT ${columns} FROM ${table} WHERE id = $1 AND status = 'ativo'`, [req.auth.id]);
  if (!result.rows[0]) return res.status(401).json({ error: 'Sessão inválida.' });
  if (req.auth.kind === 'agent') {
    result.rows[0].perfil = 'AGENTE';
    result.rows[0].permissoes = result.rows[0].permissoes?.split(',') || [];
  }
  return res.json({ user: result.rows[0] });
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    if (req.auth.kind !== 'user') return res.status(403).json({ error: 'Ação não autorizada.' });
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
      return res.status(400).json({ error: 'A senha atual e uma nova senha de 12 a 128 caracteres são obrigatórias.' });
    }
    const result = await pool.query('SELECT senha, status FROM usuarios WHERE id = $1', [req.auth.id]);
    if (!result.rows[0] || result.rows[0].status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });
    const check = await verifyStoredPassword(currentPassword, result.rows[0].senha || '');
    if (!check.valid) return res.status(401).json({ error: 'A senha atual está incorreta.' });
    await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [await hashPassword(newPassword), req.auth.id]);
    await pool.query(
      'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
      [req.auth.id, 'user'],
    );
    return res.json({ success: true });
  } catch {
    console.error('User password update failed.');
    return res.status(500).json({ error: 'Não foi possível alterar a senha.' });
  }
});

// Usu�rios
app.get('/api/usuarios', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      `SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios${tenantId === null ? '' : ' WHERE municipio_id = $1'}`,
      tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error('User list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os usuários.' });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const b = req.body;
    if (typeof b.nome !== 'string' || !b.nome.trim() || typeof b.email !== 'string' || !b.email.includes('@')
      || typeof b.senha !== 'string' || b.senha.length < 12 || b.senha.length > 128) {
      return res.status(400).json({ error: 'Nome, e-mail válido e senha de 12 a 128 caracteres são obrigatórios.' });
    }
    const tenantId = getTenantFilter(req);
    const mId = tenantId === null ? (b.municipioId || b.municipio_id || null) : tenantId;
    const perfil = b.perfil || 'Supervisor Municipal';
    if (!isPlatformRole(req) && !MUNICIPAL_USER_ROLES.has(perfil)) {
      return res.status(403).json({ error: 'Perfil não autorizado para este município.' });
    }
    const senhaHash = await hashPassword(b.senha);
    const result = await pool.query(
      `INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, email, municipio_id AS "municipioId", perfil, status, usuario`,
      [typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, b.nome.trim(), b.email.trim().toLowerCase(), mId, perfil, 'ativo', b.usuario || b.email.split('@')[0], senhaHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('User creation failed.');
    res.status(500).json({ error: 'Não foi possível criar o usuário.' });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const b = req.body;
    const tenantId = getTenantFilter(req);
    if (!isPlatformRole(req) && b.perfil !== undefined && !MUNICIPAL_USER_ROLES.has(b.perfil)) {
      return res.status(403).json({ error: 'Perfil não autorizado para este município.' });
    }
    const mId = tenantId === null ? (b.municipioId && b.municipioId !== 'null' && b.municipioId !== 'central' ? b.municipioId : null) : tenantId;
    const result = await pool.query(
      `UPDATE usuarios 
       SET nome = COALESCE($1, nome), email = COALESCE($2, email), municipio_id = $3, perfil = COALESCE($4, perfil), status = COALESCE($5, status), usuario = COALESCE($6, usuario)
       WHERE id = $7 AND ($8::text IS NULL OR municipio_id = $8)
       RETURNING id, nome, email, municipio_id AS "municipioId", perfil, status, usuario`,
      [b.nome, b.email?.toLowerCase(), mId, b.perfil, b.status, b.usuario, req.params.id, tenantId]
    );
    res.json(result.rows[0] || { success: true });
  } catch (error) {
    console.error('User update failed.');
    res.status(500).json({ error: 'Não foi possível atualizar o usuário.' });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    await pool.query(
      `DELETE FROM usuarios WHERE id = $1 AND ($2::text IS NULL OR municipio_id = $2)`,
      [req.params.id, tenantId],
    );
    res.json({ success: true });
  } catch (error) {
    console.error('User deletion failed.');
    res.status(500).json({ error: 'Não foi possível remover o usuário.' });
  }
});

// Munic�pios
app.get('/api/municipios', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      `SELECT * FROM municipios${tenantId === null ? '' : ' WHERE id = $1'} ORDER BY nome ASC`,
      tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows.map(m => ({
      ...m,
      paisId: m.pais_id,
      paisNome: m.pais_nome,
      ministerioId: m.ministerio_id,
      ministerioNome: m.ministerio_nome,
      dataAtivacao: m.data_ativacao,
      dataValidade: m.data_validade,
      estadoLicenca: m.estado_licenca,
      modulosHabilitados: m.modulos_habilitados ? m.modulos_habilitados.split(',') : [],
      limiteUsuarios: m.limite_usuarios,
      limiteArmazenamento: m.limite_armazenamento
    })));
  } catch (error) {
    console.error('Municipality list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os municípios.' });
  }
});

app.post('/api/municipios', async (req, res) => {
  try {
    if (!isPlatformRole(req)) return res.status(403).json({ error: 'Ação não autorizada.' });
    const b = req.body;
    const modulos = Array.isArray(b.modulosHabilitados) ? b.modulosHabilitados.join(',') : (b.modulosHabilitados || '');
    const result = await pool.query(
      `INSERT INTO municipios (id, nome, codigo, regiao, endereco, telefone, email, responsavel, status, modulos_habilitados)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [b.id || `muni-${Date.now()}`, b.nome, b.codigo || 'MUN', b.regiao || 'Geral', b.endereco || '', b.telefone || '', b.email || '', b.responsavel || '', b.status || 'ativo', modulos]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Municipality creation failed.');
    res.status(500).json({ error: 'Não foi possível criar o município.' });
  }
});

// Mercados
app.get('/api/mercados', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      `SELECT * FROM mercados${tenantId === null ? '' : ' WHERE municipio_id = $1'}`,
      tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows.map(m => ({
      id: m.id,
      nome: m.nome,
      municipioId: m.municipio_id,
      qtdBancas: m.qtd_bancas,
      responsavel: m.responsavel,
      telefone: m.telefone,
      status: m.status,
      localizacaoGps: { lat: m.lat || 0, lng: m.lng || 0, label: m.gps_label || m.nome }
    })));
  } catch (error) {
    console.error('Market list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os mercados.' });
  }
});

app.post('/api/mercados', async (req, res) => {
  try {
    const b = req.body;
    const tenantId = getTenantFilter(req);
    const municipioId = tenantId === null ? (b.municipioId || b.municipio_id) : tenantId;
    if (!municipioId || (tenantId !== null && (b.municipioId || b.municipio_id) !== undefined
      && (b.municipioId || b.municipio_id) !== tenantId)) {
      return res.status(403).json({ error: 'Município não autorizado.' });
    }
    const result = await pool.query(
      `INSERT INTO mercados (id, nome, municipio_id, lat, lng, gps_label, qtd_bancas, responsavel, telefone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `merc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, b.nome, municipioId, b.localizacaoGps?.lat || 0, b.localizacaoGps?.lng || 0, b.localizacaoGps?.label || b.nome, b.qtdBancas || 50, b.responsavel || '', b.telefone || '', b.status || 'ativo']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Market creation failed.');
    res.status(500).json({ error: 'Não foi possível criar o mercado.' });
  }
});

// Agentes
app.get('/api/agentes', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      req.auth.kind === 'agent'
        ? 'SELECT id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, reset_senha_pending FROM agentes WHERE id = $1'
        : `SELECT id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, reset_senha_pending FROM agentes${tenantId === null ? '' : ' WHERE municipio_id = $1'}`,
      req.auth.kind === 'agent' ? [req.auth.id] : tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows.map(a => ({
      id: a.id,
      foto: a.foto,
      nome: a.nome,
      telefone: a.telefone,
      email: a.email,
      usuario: a.usuario,
      mercadoId: a.mercado_id,
      municipioId: a.municipio_id,
      cargo: a.cargo,
      status: a.status,
      resetSenhaPending: a.reset_senha_pending,
      permissoes: a.permissoes ? a.permissoes.split(',') : []
    })));
  } catch (error) {
    console.error('Agent list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os agentes.' });
  }
});

app.post('/api/agentes', async (req, res) => {
  try {
    const b = req.body;
    const tenantId = getTenantFilter(req);
    const municipioId = tenantId === null ? (b.municipioId || b.municipio_id) : tenantId;
    const mercadoId = b.mercadoId || b.mercado_id;
    const temporaryPassword = b.senhaTemporaria || b.senha_temporaria || null;
    if (!municipioId || (tenantId !== null && (b.municipioId || b.municipio_id) !== undefined
      && (b.municipioId || b.municipio_id) !== tenantId)) {
      return res.status(403).json({ error: 'Município não autorizado.' });
    }
    const market = await pool.query('SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2', [mercadoId, municipioId]);
    if (!market.rowCount) return res.status(400).json({ error: 'Mercado inválido para o município.' });
    const permissoes = Array.isArray(b.permissoes) ? b.permissoes.join(',') : (b.permissoes || '');
    if (b.senha !== undefined && b.senha !== null && (typeof b.senha !== 'string' || b.senha.length < 12 || b.senha.length > 128)) {
      return res.status(400).json({ error: 'A senha deve ter entre 12 e 128 caracteres.' });
    }
    if (temporaryPassword !== null && (typeof temporaryPassword !== 'string' || temporaryPassword.length < 8 || temporaryPassword.length > 128)) {
      return res.status(400).json({ error: 'A senha temporária deve ter entre 8 e 128 caracteres.' });
    }
    if (!b.senha && !temporaryPassword) return res.status(400).json({ error: 'Defina uma senha ou senha temporária para o agente.' });
    const senhaHash = b.senha ? await hashPassword(b.senha) : null;
    const temporaryPasswordHash = temporaryPassword
      ? await hashPassword(temporaryPassword.toUpperCase(), { minimumLength: 8 })
      : null;
    const result = await pool.query(
      `INSERT INTO agentes (id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, senha, senha_temporaria, reset_senha_pending)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, b.foto || '', b.nome, b.telefone || '', b.email, b.usuario, mercadoId, municipioId, b.cargo || 'Fiscal', 'ativo', permissoes, senhaHash, temporaryPasswordHash, Boolean(temporaryPassword)]
    );
    const { senha, senha_temporaria, ...safeAgent } = result.rows[0];
    res.status(201).json(safeAgent);
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível criar o agente.' });
  }
});

app.post('/api/agentes/login', auth.authRateLimit, async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (typeof usuario !== 'string' || usuario.length > 128 || typeof senha !== 'string' || !senha || senha.length > 128) {
      return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
    }
    const result = await pool.query('SELECT * FROM agentes WHERE lower(usuario) = lower($1) LIMIT 1', [usuario.trim()]);
    const agent = result.rows[0];
    if (!agent || agent.status !== 'ativo') return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
    const normalCheck = await verifyStoredPassword(senha, agent.senha || '');
    const temporaryCheck = await verifyStoredPassword(senha.toUpperCase(), agent.senha_temporaria || '');
    if (!normalCheck.valid && !temporaryCheck.valid) return res.status(401).json({ error: 'Utilizador ou senha inválidos.' });
    if (normalCheck.needsRehash) {
      await pool.query('UPDATE agentes SET senha = $1 WHERE id = $2', [
        await hashPassword(senha, { minimumLength: 1 }),
        agent.id,
      ]);
    }
    if (temporaryCheck.needsRehash) {
      await pool.query('UPDATE agentes SET senha_temporaria = $1 WHERE id = $2', [
        await hashPassword(senha.toUpperCase(), { minimumLength: 8 }),
        agent.id,
      ]);
    }
    const { senha: storedPassword, senha_temporaria: storedTemporaryPassword, ...safeAgent } = agent;
    safeAgent.permissoes = agent.permissoes ? agent.permissoes.split(',') : [];
    const resetSenhaPending = Boolean(agent.reset_senha_pending || temporaryCheck.valid);
    safeAgent.resetSenhaPending = resetSenhaPending;
    return auth.issueSession(req, res, {
      id: agent.id,
      nome: agent.nome,
      email: agent.email,
      usuario: agent.usuario,
      municipioId: agent.municipio_id,
      perfil: 'AGENTE',
      role: 'AGENTE',
      municipalityId: agent.municipio_id,
      kind: 'agent',
      mustChangePassword: resetSenhaPending,
    }, undefined, { responseAlias: 'agente', responseData: safeAgent, resetSenhaPending });
  } catch {
    console.error('Agent authentication failed.');
    return res.status(500).json({ error: 'Não foi possível autenticar.' });
  }
});

app.post('/api/agentes/alterar-senha', async (req, res) => {
  try {
    if (req.auth.kind !== 'agent' || (req.body.agenteId && req.body.agenteId !== req.auth.id)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    const { senhaAtual, novaSenha } = req.body;
    if (typeof senhaAtual !== 'string' || !senhaAtual || typeof novaSenha !== 'string' || novaSenha.length < 12 || novaSenha.length > 128) {
      return res.status(400).json({ error: 'A senha atual e uma nova senha de 12 a 128 caracteres são obrigatórias.' });
    }
    const result = await pool.query('SELECT senha, senha_temporaria, status FROM agentes WHERE id = $1', [req.auth.id]);
    const agent = result.rows[0];
    if (!agent || agent.status !== 'ativo') return res.status(401).json({ error: 'Sessão inválida.' });
    const normalCheck = await verifyStoredPassword(senhaAtual, agent.senha || '');
    const temporaryCheck = await verifyStoredPassword(senhaAtual.toUpperCase(), agent.senha_temporaria || '');
    if (!normalCheck.valid && !temporaryCheck.valid) return res.status(401).json({ error: 'A senha atual está incorreta.' });
    await pool.query(
      'UPDATE agentes SET senha = $1, senha_temporaria = NULL, reset_senha_pending = false WHERE id = $2',
      [await hashPassword(novaSenha), req.auth.id],
    );
    await pool.query(
      'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND user_type = $2',
      [req.auth.id, 'agent'],
    );
    return res.json({ success: true });
  } catch {
    console.error('Agent password update failed.');
    return res.status(500).json({ error: 'Não foi possível alterar a senha.' });
  }
});

// Contribuintes
app.get('/api/contribuintes', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      tenantId === null
        ? 'SELECT * FROM contribuintes ORDER BY nome ASC'
        : 'SELECT c.* FROM contribuintes c INNER JOIN mercados m ON c.mercado_id = m.id WHERE m.municipio_id = $1 ORDER BY c.nome ASC',
      tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      documento: c.documento,
      mercadoId: c.mercado_id,
      numBanca: c.num_banca,
      categoria: c.categoria,
      atividade: c.atividade,
      observacoes: c.observacoes,
      status: c.status,
      qrCode: c.qr_code,
      areaM2: c.area_m2,
      foto: c.foto
    })));
  } catch (error) {
    console.error('Agent creation failed.');
    res.status(500).json({ error: 'Não foi possível criar o agente.' });
  }
});

app.post('/api/contribuintes', async (req, res) => {
  try {
    const b = req.body;
    const tenantId = getTenantFilter(req);
    const mercadoId = b.mercadoId || b.mercado_id;
    const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
    const documento = typeof b.documento === 'string' ? b.documento.trim() : '';
    const numBanca = typeof (b.numBanca || b.num_banca) === 'string' ? (b.numBanca || b.num_banca).trim() : '';
    const categoria = typeof b.categoria === 'string' ? b.categoria.trim() : '';
    const dimensao = typeof b.dimensao === 'string' ? b.dimensao.trim() : '';
    if (!nome || !documento || !mercadoId || !numBanca || !categoria || !['Micro', 'Pequeno', 'Médio', 'Grande'].includes(dimensao)) {
      return res.status(400).json({ error: 'Preencha nome, NIF, mercado, número da banca, categoria e dimensão válidos.' });
    }
    const market = await pool.query(
      `SELECT 1 FROM mercados WHERE id = $1${tenantId === null ? '' : ' AND municipio_id = $2'}`,
      tenantId === null ? [mercadoId] : [mercadoId, tenantId],
    );
    if (!market.rowCount) return res.status(400).json({ error: 'Mercado inválido para este município.' });
    const category = await pool.query(
      'SELECT 1 FROM categoria_contribuintes WHERE id = $1 AND status = $2',
      [categoria, 'ativo'],
    );
    if (!category.rowCount) return res.status(400).json({ error: 'Selecione uma categoria de contribuinte ativa.' });
    const areaM2 = b.areaM2 === undefined || b.areaM2 === null || b.areaM2 === '' ? 0 : Number(b.areaM2);
    if (!Number.isFinite(areaM2) || areaM2 < 0) {
      return res.status(400).json({ error: 'A área deve ser um número igual ou superior a zero.' });
    }
    const result = await pool.query(
      `INSERT INTO contribuintes (id, nome, telefone, documento, mercado_id, num_banca, categoria, atividade, dimensao, observacoes, status, qr_code, area_m2, foto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nome, typeof b.telefone === 'string' ? b.telefone.trim() : '', documento.toUpperCase(), mercadoId, numBanca.toUpperCase(), categoria, '', dimensao, typeof b.observacoes === 'string' ? b.observacoes.trim() : '', b.status === 'inativo' ? 'inativo' : 'ativo', typeof b.qrCode === 'string' && b.qrCode.trim() ? b.qrCode.trim() : null, areaM2, b.foto || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Contributor list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os contribuintes.' });
  }
});

// Tipos de Receita
app.get('/api/tipos_receita', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_receita');
    res.json(result.rows);
  } catch (error) {
    console.error('Contributor creation failed.');
    res.status(500).json({ error: 'Não foi possível criar o contribuinte.' });
  }
});

// Pagamentos
app.get('/api/pagamentos', async (req, res) => {
  try {
    const tenantId = getTenantFilter(req);
    const result = await pool.query(
      req.auth.kind === 'agent'
        ? 'SELECT * FROM pagamentos WHERE agente_id = $1 ORDER BY data_pagamento DESC LIMIT 1000'
        : `SELECT * FROM pagamentos${tenantId === null ? '' : ' WHERE municipio_id = $1'} ORDER BY data_pagamento DESC LIMIT 1000`,
      req.auth.kind === 'agent' ? [req.auth.id] : tenantId === null ? [] : [tenantId],
    );
    res.json(result.rows.map(p => ({
      id: p.id,
      reciboId: p.recibo_id,
      municipioId: p.municipio_id,
      mercadoId: p.mercado_id,
      agenteId: p.agente_id,
      contribuinteId: p.contribuinte_id,
      tipoReceitaId: p.tipo_receita_id,
      valor: p.valor,
      formaPagamento: p.forma_pagamento,
      dataPagamento: p.data_pagamento,
      status: p.status,
      observacao: p.observacao,
      comprovativoUrl: p.comprovativo_url,
      dataCriacao: p.data_criacao
    })));
  } catch (error) {
    console.error('Payment list request failed.');
    res.status(500).json({ error: 'Não foi possível obter os pagamentos.' });
  }
});

app.post('/api/pagamentos', async (req, res) => {
  try {
    const b = req.body;
    const tenantId = getTenantFilter(req);
    const municipioId = tenantId === null ? (b.municipioId || b.municipio_id) : tenantId;
    const mercadoId = b.mercadoId || b.mercado_id;
    const agenteId = req.auth.kind === 'agent' ? req.auth.id : (b.agenteId || b.agente_id);
    const contribuinteId = b.contribuinteId || b.contribuinte_id;
    const tipoReceitaId = b.tipoReceitaId || b.tipo_receita_id;
    const valor = Number(b.valor);
    const formas = new Map([
      ['dinheiro', 'Dinheiro'],
      ['orange money', 'Orange Money'],
      ['transferência bancária', 'Transferência Bancária'],
      ['transferencia bancaria', 'Transferência Bancária'],
      ['outro', 'Outro'],
    ]);
    const formaPagamento = formas.get(String(b.formaPagamento || b.forma_pagamento || 'Dinheiro').trim().toLowerCase());
    const paymentDate = new Date(b.dataPagamento || b.data_pagamento || Date.now());
    const allowedStatuses = new Set(['pago', 'cancelado', 'pendente', 'cancelamento_pendente']);
    if (!municipioId || !mercadoId || !agenteId || !contribuinteId || !tipoReceitaId
      || !Number.isSafeInteger(valor) || valor <= 0 || !formaPagamento || !Number.isFinite(paymentDate.getTime())
      || (req.auth.kind !== 'agent' && b.status !== undefined && !allowedStatuses.has(b.status))) {
      return res.status(400).json({ error: 'Dados de pagamento inválidos.' });
    }
    if (req.auth.kind !== 'agent' && tenantId !== null && (b.municipioId || b.municipio_id) && (b.municipioId || b.municipio_id) !== tenantId) {
      return res.status(403).json({ error: 'Município não autorizado.' });
    }
    const validMarket = await pool.query('SELECT 1 FROM mercados WHERE id = $1 AND municipio_id = $2', [mercadoId, municipioId]);
    const validAgent = await pool.query('SELECT 1 FROM agentes WHERE id = $1 AND municipio_id = $2 AND status = $3', [agenteId, municipioId, 'ativo']);
    const validContributor = await pool.query(
      'SELECT 1 FROM contribuintes c JOIN mercados m ON m.id = c.mercado_id WHERE c.id = $1 AND c.mercado_id = $2 AND m.municipio_id = $3',
      [contribuinteId, mercadoId, municipioId],
    );
    const validReceipt = await pool.query('SELECT 1 FROM tipos_receita WHERE id = $1 AND status = $2', [tipoReceitaId, 'ativo']);
    if (!validMarket.rowCount || !validAgent.rowCount || !validContributor.rowCount || !validReceipt.rowCount) {
      return res.status(400).json({ error: 'Os dados relacionados ao pagamento são inválidos.' });
    }
    const result = await pool.query(
      `INSERT INTO pagamentos (id, recibo_id, municipio_id, mercado_id, agente_id, contribuinte_id, tipo_receita_id, valor, forma_pagamento, data_pagamento, status, observacao, comprovativo_url, data_criacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `pag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, b.reciboId || String(Math.floor(100000 + Math.random() * 900000)), municipioId, mercadoId, agenteId, contribuinteId, tipoReceitaId, valor, formaPagamento, paymentDate.toISOString(), req.auth.kind === 'agent' ? 'pago' : (b.status || 'pago'), typeof b.observacao === 'string' ? b.observacao.slice(0, 2000) : '', typeof b.comprovativoUrl === 'string' ? b.comprovativoUrl.slice(0, 1000) : '', new Date().toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Payment creation failed.');
    res.status(500).json({ error: 'Não foi possível registrar o pagamento.' });
  }
});

// Auditoria
app.get('/api/auditoria', async (req, res) => {
  try {
    if (!['Platform Owner', 'Super Admin', 'Super Administrador', 'Administrator'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Ação não autorizada.' });
    }
    const result = await pool.query('SELECT * FROM auditoria_log ORDER BY data DESC, hora DESC LIMIT 500');
    res.json(result.rows);
  } catch (error) {
    console.error('Audit listing failed.');
    res.status(500).json({ error: 'Não foi possível obter os registros de auditoria.' });
  }
});

app.post('/api/auditoria', async (req, res) => {
  try {
    const b = req.body;
    if (typeof b.acao !== 'string' || b.acao.length > 100 || typeof b.descricao !== 'string' || b.descricao.length > 2000) {
      return res.status(400).json({ error: 'Dados de auditoria inválidos.' });
    }
    const result = await pool.query(
      `INSERT INTO auditoria_log (id, usuario, perfil, data, hora, ip, dispositivo, acao, descricao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [`audit-${Date.now()}`, req.auth.email || req.auth.id, req.auth.role, new Date().toISOString().split('T')[0], new Date().toTimeString().split(' ')[0], req.ip || '127.0.0.1', req.get('x-client-type') || 'unknown', b.acao, b.descricao]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Audit creation failed.');
    res.status(500).json({ error: 'Não foi possível registrar a auditoria.' });
  }
});

// Configura��es
app.get('/api/configuracoes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM configuracoes LIMIT 1');
    if (result.rows.length === 0) {
      return res.json({ id: 1, nomeMunicipio: 'C�mara Municipal de Bissau', moeda: 'FCFA', fusoHorario: 'GMT-0', backupHabilitado: true, temaEscuro: false, notificacoesHabilitadas: true, taxaComissao: 10, comissaoPaga: 0, metaDiariaAgente: 100000, percentualIncentivo: 5 });
    }
    const c = result.rows[0];
    res.json({ id: c.id, logoCamara: c.logo_camara, nomeMunicipio: c.nome_municipio, moeda: c.moeda, fusoHorario: c.fuso_horario, backupHabilitado: c.backup_habilitado, temaEscuro: c.tema_escuro, notificacoesHabilitadas: c.notificacoes_habilitadas, taxaComissao: c.taxa_comissao, comissaoPaga: c.comissao_paga, metaDiariaAgente: c.meta_diaria_agente, percentualIncentivo: c.percentual_incentivo });
  } catch (error) {
    console.error('Configuration listing failed.');
    res.status(500).json({ error: 'Não foi possível obter as configurações.' });
  }
});

app.put('/api/configuracoes', async (req, res) => {
  try {
    const b = req.body;
    await pool.query(`
      UPDATE configuracoes 
      SET nome_municipio = COALESCE($1, nome_municipio), moeda = COALESCE($2, moeda), taxa_comissao = COALESCE($3, taxa_comissao), meta_diaria_agente = COALESCE($4, meta_diaria_agente), percentual_incentivo = COALESCE($5, percentual_incentivo)
      WHERE id = 1
    `, [b.nomeMunicipio, b.moeda, b.taxaComissao, b.metaDiariaAgente, b.percentualIncentivo]);
    res.json({ success: true });
  } catch (error) {
    console.error('Configuration update failed.');
    res.status(500).json({ error: 'Não foi possível atualizar as configurações.' });
  }
});

// ==========================================================
// SERVI�O DE ARQUIVOS EST�TICOS (SPA REACT VITE)
// ==========================================================
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint n�o encontrado' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Iniciar Servidor
app.listen(PORT, async () => {
  console.log(`[Receita 360] Servidor rodando na porta ${PORT}`);
  await initDatabase();
});

export default app;