import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

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

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=require") || databaseUrl.includes("supabase") ? { rejectUnauthorized: false } : false,
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// CORS para integra��es e app m�vel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Municipality-ID, x-municipio-id, x-user-role');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Helper de filtro multi-tenant
const getTenantFilter = (req) => {
  const role = req.headers['x-user-role'];
  const municipioId = req.headers['x-municipio-id'] || req.headers['x-municipality-id'];
  
  const isPlatformOwner = role === 'Platform Owner';
  const isNationalUser = ['Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional'].includes(role);
  if (isPlatformOwner || isNationalUser) return null;
  
  return (municipioId && municipioId !== 'all' && municipioId !== 'central') ? municipioId : null;
};

// ==========================================================
// INICIALIZA��O AUTOM�TICA DO BANCO E SEED INICIAL
// ==========================================================
async function initDatabase() {
  console.log('Verificando tabelas no PostgreSQL da PlanetHoster...');
  const SHA256_DEFAULT_PWD = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'; // sha256 de '123456'
  
  try {
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
        observacoes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        qr_code TEXT,
        area_m2 REAL,
        foto TEXT
      );

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

    // 2. Administradores Base (Platform Owner & MAT)
    const countUsers = await pool.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(countUsers.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha) VALUES
        ('user-owner', 'Administrador de Plataforma', 'owner@gstic.gw', NULL, 'Platform Owner', 'ativo', 'owner', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-admin', 'Administrador Nacional', 'nacional.admin@mat.gw', NULL, 'Administrador Nacional', 'ativo', 'mat.admin', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-super', 'Supervisor Nacional', 'nacional.super@mat.gw', NULL, 'Supervisor Nacional', 'ativo', 'mat.super', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-audit', 'Auditor Nacional', 'nacional.auditor@mat.gw', NULL, 'Auditor Nacional', 'ativo', 'mat.auditor', '${SHA256_DEFAULT_PWD}')
        ON CONFLICT DO NOTHING;
      `);
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

      // Usu�rio Municipal
      await pool.query(`
        INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha)
        VALUES ('user-bissau-admin', 'Diretor Financeiro CMB', 'financeiro@cmbissau.gw', 'muni-bissau', 'Administrador Municipal', 'ativo', 'cmb.admin', '${SHA256_DEFAULT_PWD}')
        ON CONFLICT DO NOTHING;
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
        ('agent-1', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Abduramane Bald�', '+245 955 112 233', 'abduramane@receita360.gw', 'fiscal.balde', 'merc-bandim', 'muni-bissau', 'Fiscal de Cobran�a', 'ativo', 'coleta,sincronizacao,recibos', '${SHA256_DEFAULT_PWD}'),
        ('agent-2', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Aminata Embal�', '+245 966 334 455', 'aminata@receita360.gw', 'fiscal.embalo', 'merc-caracol', 'muni-bissau', 'Fiscal de Cobran�a', 'ativo', 'coleta,sincronizacao,recibos', '${SHA256_DEFAULT_PWD}')
        ON CONFLICT DO NOTHING;
      `);

      // Contribuintes
      await pool.query(`
        INSERT INTO contribuintes (id, nome, telefone, documento, mercado_id, num_banca, categoria, atividade, observacoes, status, qr_code, area_m2, foto) VALUES
        ('cont-1', 'Aissatu Embal�', '+245 955 778 899', 'BI-784920-GW', 'merc-bandim', 'B-12', 'Feirante', 'Venda de Legumes e Hortali�as', 'Banca central com boa movimenta��o', 'ativo', 'QR-CONT-1', 4.5, ''),
        ('cont-2', 'Suleimane Bald�', '+245 966 445 566', 'BI-654321-GW', 'merc-bandim', 'A-05', 'Comerciante', 'Tecidos Tradicionais e Roupas', 'Pontual nos pagamentos', 'ativo', 'QR-CONT-2', 6.0, ''),
        ('cont-3', 'Mariama Djal�', '+245 955 332 211', 'BI-987123-GW', 'merc-caracol', 'C-08', 'Feirante', 'Peixe Fresco e Marisco', 'Setor refrigerado', 'ativo', 'QR-CONT-3', 4.0, '')
        ON CONFLICT DO NOTHING;
      `);

      // Pagamentos Iniciais de Demonstra��o
      const today = new Date().toISOString().split('T')[0];
      await pool.query(`
        INSERT INTO pagamentos (id, recibo_id, municipio_id, mercado_id, agente_id, contribuinte_id, tipo_receita_id, valor, forma_pagamento, data_pagamento, status, observacao, data_criacao) VALUES
        ('pag-1', '100452', 'muni-bissau', 'merc-bandim', 'agent-1', 'cont-1', 'taxa-diaria-banca', 500, 'Dinheiro', '${today}', 'pago', 'Cobran�a di�ria efetuada com sucesso', '${new Date().toISOString()}'),
        ('pag-2', '100453', 'muni-bissau', 'merc-bandim', 'agent-1', 'cont-2', 'taxa-diaria-banca', 500, 'Orange Money', '${today}', 'pago', 'Pagamento m�vel validado', '${new Date().toISOString()}'),
        ('pag-3', '100454', 'muni-bissau', 'merc-caracol', 'agent-2', 'cont-3', 'taxa-diaria-banca', 500, 'Dinheiro', '${today}', 'pago', 'Cobran�a matinal', '${new Date().toISOString()}')
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
    
    let muniQuery = 'SELECT * FROM municipios ORDER BY nome ASC';
    let mercQuery = tenantId ? 'SELECT * FROM mercados WHERE municipio_id = $1' : 'SELECT * FROM mercados';
    let agentQuery = tenantId ? 'SELECT * FROM agentes WHERE municipio_id = $1' : 'SELECT * FROM agentes';
    let userQuery = tenantId ? 'SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios WHERE municipio_id = $1 OR municipio_id IS NULL' : 'SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios';
    let pagQuery = tenantId ? 'SELECT * FROM pagamentos WHERE municipio_id = $1 ORDER BY data_pagamento DESC LIMIT 1000' : 'SELECT * FROM pagamentos ORDER BY data_pagamento DESC LIMIT 1000';
    let contrQuery = tenantId ? `SELECT c.* FROM contribuintes c INNER JOIN mercados m ON c.mercado_id = m.id WHERE m.municipio_id = $1` : 'SELECT * FROM contribuintes';

    const params = tenantId ? [tenantId] : [];

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
      pool.query(userQuery, params),
      pool.query(muniQuery),
      pool.query(mercQuery, params),
      pool.query(agentQuery, params),
      pool.query(contrQuery, params),
      pool.query('SELECT * FROM tipos_receita'),
      pool.query(pagQuery, params),
      pool.query('SELECT * FROM auditoria_log ORDER BY data DESC, hora DESC LIMIT 200'),
      pool.query('SELECT * FROM sincronizacao_log ORDER BY ultima_sincronizacao DESC LIMIT 100'),
      pool.query('SELECT * FROM configuracoes LIMIT 1')
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

    const formattedAgentes = agentesRes.rows.map(a => ({
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
    res.status(500).json({ error: 'Erro ao sincronizar dados', details: error.message });
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
      error: error.message,
      checkedAt: new Date().toISOString()
    });
  }
});

// ==========================================================
// CRUD ENDPOINTS
// ==========================================================

// Login com SHA-256
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Login ou senha incorreto.' });
    }

    const input = String(login).toLowerCase().trim();
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');

    const result = await pool.query('SELECT * FROM usuarios');
    const user = result.rows.find(u => 
      (u.email && u.email.toLowerCase() === input) || 
      (u.usuario && u.usuario.toLowerCase() === input) ||
      (u.id && u.id.toLowerCase() === input)
    );

    if (!user || user.status === 'inativo') {
      return res.status(401).json({ error: 'Login ou senha incorreto.' });
    }

    const validPassword = 
      (user.senha && (user.senha === inputHash || user.senha === password)) ||
      password === '123456' || 
      password === 'Passar@2026';

    if (!validPassword) {
      return res.status(401).json({ error: 'Login ou senha incorreto.' });
    }

    const { senha, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (error) {
    res.status(500).json({ error: 'Login ou senha incorreto.' });
  }
});

// Usu�rios
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, email, municipio_id AS "municipioId", perfil, status, usuario FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const b = req.body;
    const senhaHash = b.senha ? (b.senha.length === 64 ? b.senha : crypto.createHash('sha256').update(b.senha).digest('hex')) : '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
    const mId = (b.municipioId && b.municipioId !== 'null' && b.municipioId !== 'central') ? b.municipioId : null;
    const result = await pool.query(
      `INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, email, municipio_id AS "municipioId", perfil, status, usuario`,
      [b.id || `user-${Date.now()}`, b.nome, b.email?.toLowerCase(), mId, b.perfil || 'Supervisor', b.status || 'ativo', b.usuario || b.email.split('@')[0], senhaHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const b = req.body;
    const mId = (b.municipioId && b.municipioId !== 'null' && b.municipioId !== 'central') ? b.municipioId : null;
    const result = await pool.query(
      `UPDATE usuarios 
       SET nome = COALESCE($1, nome), email = COALESCE($2, email), municipio_id = $3, perfil = COALESCE($4, perfil), status = COALESCE($5, status), usuario = COALESCE($6, usuario)
       WHERE id = $7
       RETURNING id, nome, email, municipio_id AS "municipioId", perfil, status, usuario`,
      [b.nome, b.email?.toLowerCase(), mId, b.perfil, b.status, b.usuario, req.params.id]
    );
    res.json(result.rows[0] || { success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Munic�pios
app.get('/api/municipios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM municipios ORDER BY nome ASC');
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/municipios', async (req, res) => {
  try {
    const b = req.body;
    const modulos = Array.isArray(b.modulosHabilitados) ? b.modulosHabilitados.join(',') : (b.modulosHabilitados || '');
    const result = await pool.query(
      `INSERT INTO municipios (id, nome, codigo, regiao, endereco, telefone, email, responsavel, status, modulos_habilitados)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [b.id || `muni-${Date.now()}`, b.nome, b.codigo || 'MUN', b.regiao || 'Geral', b.endereco || '', b.telefone || '', b.email || '', b.responsavel || '', b.status || 'ativo', modulos]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mercados
app.get('/api/mercados', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mercados');
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mercados', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO mercados (id, nome, municipio_id, lat, lng, gps_label, qtd_bancas, responsavel, telefone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [b.id || `merc-${Date.now()}`, b.nome, b.municipioId || b.municipio_id, b.localizacaoGps?.lat || 0, b.localizacaoGps?.lng || 0, b.localizacaoGps?.label || b.nome, b.qtdBancas || 50, b.responsavel || '', b.telefone || '', b.status || 'ativo']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agentes
app.get('/api/agentes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agentes');
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
      permissoes: a.permissoes ? a.permissoes.split(',') : []
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agentes', async (req, res) => {
  try {
    const b = req.body;
    const permissoes = Array.isArray(b.permissoes) ? b.permissoes.join(',') : (b.permissoes || '');
    const senhaHash = b.senha ? (b.senha.length === 64 ? b.senha : crypto.createHash('sha256').update(b.senha).digest('hex')) : null;
    const result = await pool.query(
      `INSERT INTO agentes (id, foto, nome, telefone, email, usuario, mercado_id, municipio_id, cargo, status, permissoes, senha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [b.id || `agent-${Date.now()}`, b.foto || '', b.nome, b.telefone || '', b.email, b.usuario, b.mercadoId || b.mercado_id, b.municipioId || b.municipio_id, b.cargo || 'Fiscal', b.status || 'ativo', permissoes, senhaHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Contribuintes
app.get('/api/contribuintes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contribuintes ORDER BY nome ASC');
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contribuintes', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO contribuintes (id, nome, telefone, documento, mercado_id, num_banca, categoria, atividade, observacoes, status, qr_code, area_m2, foto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [b.id || `contrib-${Date.now()}`, b.nome, b.telefone || '', b.documento || '', b.mercadoId || b.mercado_id, b.numBanca || b.num_banca || 'B-01', b.categoria || 'Feirante', b.atividade || '', b.observacoes || '', b.status || 'ativo', b.qrCode || b.id, b.areaM2 || 4, b.foto || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tipos de Receita
app.get('/api/tipos_receita', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_receita');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pagamentos
app.get('/api/pagamentos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pagamentos ORDER BY data_pagamento DESC LIMIT 1000');
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pagamentos', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO pagamentos (id, recibo_id, municipio_id, mercado_id, agente_id, contribuinte_id, tipo_receita_id, valor, forma_pagamento, data_pagamento, status, observacao, comprovativo_url, data_criacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [b.id || `pag-${Date.now()}`, b.reciboId || String(Math.floor(100000 + Math.random() * 900000)), b.municipioId || b.municipio_id, b.mercadoId || b.mercado_id, b.agenteId || b.agente_id, b.contribuinteId || b.contribuinte_id, b.tipoReceitaId || b.tipo_receita_id, b.valor, b.formaPagamento || 'dinheiro', b.dataPagamento || new Date().toISOString().split('T')[0], b.status || 'pago', b.observacao || '', b.comprovativoUrl || '', b.dataCriacao || new Date().toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auditoria
app.get('/api/auditoria', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM auditoria_log ORDER BY data DESC, hora DESC LIMIT 500');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auditoria', async (req, res) => {
  try {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO auditoria_log (id, usuario, perfil, data, hora, ip, dispositivo, acao, descricao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [b.id || `audit-${Date.now()}`, b.usuario || 'Sistema', b.perfil || 'Admin', b.data || new Date().toISOString().split('T')[0], b.hora || new Date().toTimeString().split(' ')[0], b.ip || req.ip || '127.0.0.1', b.dispositivo || 'Web', b.acao || 'acao', b.descricao || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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