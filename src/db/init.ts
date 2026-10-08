import pkg from 'pg';
const { Pool } = pkg;
import { createPool } from './index.ts';

export async function initializeDatabase() {
  const pool = createPool();
  console.log('Initializing PostgreSQL database schema...');

  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    console.error('Could not connect to PostgreSQL database:', err?.message || err);
    return;
  }

  try {
    await client.query('BEGIN');

    // ==========================================
    // 1. DROP ALL UNUSED LEGACY TABLES (IF EXIST)
    // ==========================================
    await client.query(`
      DROP TABLE IF EXISTS receipt_items CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS cash_transactions CASCADE;
      DROP TABLE IF EXISTS daily_cash CASCADE;
      DROP TABLE IF EXISTS market_stalls CASCADE;
      DROP TABLE IF EXISTS companies CASCADE;
      DROP TABLE IF EXISTS user_roles CASCADE;
      DROP TABLE IF EXISTS collection_agents CASCADE;
      DROP TABLE IF EXISTS taxpayers CASCADE;
      DROP TABLE IF EXISTS municipal_markets CASCADE;
      DROP TABLE IF EXISTS neighborhoods CASCADE;
      DROP TABLE IF EXISTS villages CASCADE;
      DROP TABLE IF EXISTS zones CASCADE;
      DROP TABLE IF EXISTS municipalities CASCADE;
      DROP TABLE IF EXISTS regions CASCADE;
      DROP TABLE IF EXISTS roles CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS tax_rates CASCADE;
      DROP TABLE IF EXISTS tax_categories CASCADE;
      DROP TABLE IF EXISTS payment_methods CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS system_settings CASCADE;
      DROP TABLE IF EXISTS licenses CASCADE;
      DROP TABLE IF EXISTS devices CASCADE;
      DROP TABLE IF EXISTS sync_logs CASCADE;
      DROP TABLE IF EXISTS reports CASCADE;
      DROP TABLE IF EXISTS despesas CASCADE;
      DROP TABLE IF EXISTS recibos CASCADE;
      DROP TABLE IF EXISTS logs_auditoria CASCADE;
      DROP TABLE IF EXISTS relatorios_agendados CASCADE;
      DROP TABLE IF EXISTS metas_arrecadacao CASCADE;
    `);

    // ==========================================
    // 2. CREATE ACTIVE CORE TABLES
    // ==========================================

    // 1. Municipios
    await client.query(`
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
    `);

    await client.query(`
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS pais_id TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS pais_nome TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS ministerio_id TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS ministerio_nome TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS plano TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS data_ativacao TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS data_validade TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS estado_licenca TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS modulos_habilitados TEXT;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS limite_usuarios INTEGER;
      ALTER TABLE municipios ADD COLUMN IF NOT EXISTS limite_armazenamento INTEGER;
    `);

    // 2. Usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        municipio_id TEXT REFERENCES municipios(id) ON DELETE SET NULL,
        perfil TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        usuario TEXT,
        senha TEXT
      );
    `);

    await client.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha TEXT;
    `);

    // 3. Mercados
    await client.query(`
      CREATE TABLE IF NOT EXISTS mercados (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        municipio_id TEXT NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        gps_label TEXT,
        qtd_bancas INTEGER NOT NULL,
        responsavel TEXT NOT NULL,
        telefone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo'
      );
    `);

    // 4. Agentes
    await client.query(`
      CREATE TABLE IF NOT EXISTS agentes (
        id TEXT PRIMARY KEY,
        foto TEXT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        usuario TEXT NOT NULL UNIQUE,
        mercado_id TEXT NOT NULL REFERENCES mercados(id) ON DELETE RESTRICT,
        municipio_id TEXT NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
        cargo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        permissoes TEXT NOT NULL,
        reset_senha_pending BOOLEAN DEFAULT false,
        senha_temporaria TEXT,
        senha TEXT
      );
      ALTER TABLE agentes ADD COLUMN IF NOT EXISTS reset_senha_pending BOOLEAN DEFAULT false;
      ALTER TABLE agentes ADD COLUMN IF NOT EXISTS senha_temporaria TEXT;
      ALTER TABLE agentes ADD COLUMN IF NOT EXISTS senha TEXT;
    `);

    // 5. Contribuintes
    await client.query(`
      CREATE TABLE IF NOT EXISTS contribuintes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        documento TEXT NOT NULL,
        mercado_id TEXT NOT NULL REFERENCES mercados(id) ON DELETE RESTRICT,
        num_banca TEXT NOT NULL,
        categoria TEXT NOT NULL,
        atividade TEXT NOT NULL,
        observacoes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        qr_code TEXT,
        area_m2 REAL,
        foto TEXT
      );
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS qr_code TEXT;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS area_m2 REAL;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS foto TEXT;
    `);

    // 6. Tipos de Receita
    await client.query(`
      CREATE TABLE IF NOT EXISTS tipos_receita (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL,
        valor INTEGER NOT NULL,
        periodicidade TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo'
      );
    `);

    // 7. Pagamentos (Recibos e Cobranças)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pagamentos (
        id TEXT PRIMARY KEY,
        recibo_id TEXT NOT NULL,
        municipio_id TEXT NOT NULL REFERENCES municipios(id) ON DELETE RESTRICT,
        mercado_id TEXT NOT NULL REFERENCES mercados(id) ON DELETE RESTRICT,
        agente_id TEXT NOT NULL REFERENCES agentes(id) ON DELETE RESTRICT,
        contribuinte_id TEXT NOT NULL REFERENCES contribuintes(id) ON DELETE RESTRICT,
        tipo_receita_id TEXT NOT NULL REFERENCES tipos_receita(id) ON DELETE RESTRICT,
        valor INTEGER NOT NULL,
        forma_pagamento TEXT NOT NULL,
        data_pagamento TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pago',
        observacao TEXT,
        data_criacao TEXT NOT NULL
      );
    `);

    // 8. Auditoria Log
    await client.query(`
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
    `);

    // 9. Sincronizacao Log
    await client.query(`
      CREATE TABLE IF NOT EXISTS sincronizacao_log (
        id TEXT PRIMARY KEY,
        agente_id TEXT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
        ultima_sincronizacao TEXT NOT NULL,
        registros_sincronizados INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'sucesso'
      );
    `);

    // 10. Configuracoes
    await client.query(`
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

    await client.query(`
      ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS meta_diaria_agente INTEGER NOT NULL DEFAULT 100000;
      ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS percentual_incentivo INTEGER NOT NULL DEFAULT 5;
    `);

    // ==========================================
    // 3. INDEXES FOR ACTIVE TABLES
    // ==========================================
    await client.query('CREATE INDEX IF NOT EXISTS municipios_status_idx ON municipios(status);');
    await client.query('CREATE INDEX IF NOT EXISTS municipios_nome_idx ON municipios(nome);');

    await client.query('CREATE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios(email);');
    await client.query('CREATE INDEX IF NOT EXISTS usuarios_municipio_idx ON usuarios(municipio_id);');

    await client.query('CREATE INDEX IF NOT EXISTS mercados_municipio_idx ON mercados(municipio_id);');
    await client.query('CREATE INDEX IF NOT EXISTS mercados_status_idx ON mercados(status);');

    await client.query('CREATE INDEX IF NOT EXISTS agentes_email_idx ON agentes(email);');
    await client.query('CREATE INDEX IF NOT EXISTS agentes_usuario_idx ON agentes(usuario);');
    await client.query('CREATE INDEX IF NOT EXISTS agentes_mercado_idx ON agentes(mercado_id);');
    await client.query('CREATE INDEX IF NOT EXISTS agentes_municipio_idx ON agentes(municipio_id);');
    await client.query('CREATE INDEX IF NOT EXISTS agentes_status_idx ON agentes(status);');

    await client.query('CREATE INDEX IF NOT EXISTS contribuintes_mercado_idx ON contribuintes(mercado_id);');
    await client.query('CREATE INDEX IF NOT EXISTS contribuintes_documento_idx ON contribuintes(documento);');
    await client.query('CREATE INDEX IF NOT EXISTS contribuintes_status_idx ON contribuintes(status);');

    await client.query('CREATE INDEX IF NOT EXISTS tipos_receita_status_idx ON tipos_receita(status);');

    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_recibo_idx ON pagamentos(recibo_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_municipio_idx ON pagamentos(municipio_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_mercado_idx ON pagamentos(mercado_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_agente_idx ON pagamentos(agente_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_contribuinte_idx ON pagamentos(contribuinte_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_tipo_receita_idx ON pagamentos(tipo_receita_id);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_status_idx ON pagamentos(status);');
    await client.query('CREATE INDEX IF NOT EXISTS pagamentos_data_pagamento_idx ON pagamentos(data_pagamento);');

    await client.query('CREATE INDEX IF NOT EXISTS auditoria_log_usuario_idx ON auditoria_log(usuario);');
    await client.query('CREATE INDEX IF NOT EXISTS auditoria_log_data_idx ON auditoria_log(data);');
    await client.query('CREATE INDEX IF NOT EXISTS auditoria_log_acao_idx ON auditoria_log(acao);');

    await client.query('CREATE INDEX IF NOT EXISTS sincronizacao_log_agente_idx ON sincronizacao_log(agente_id);');

    // ==========================================
    // 4. SEEDING DEFAULT DATA IF EMPTY (Core Administrators Only)
    // ==========================================

    // 1. Usuarios (Platform / National level only - No Municipal ID required)
    const countUsers = await client.query('SELECT COUNT(*) FROM usuarios');
    const SHA256_DEFAULT_PWD = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'; // sha256 of '123456'

    if (parseInt(countUsers.rows[0].count) === 0) {
      console.log('Seeding core national administrator accounts with SHA-256 encrypted passwords...');
      await client.query(`
        INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha) VALUES
        ('user-owner', 'Administrador de Plataforma', 'owner@gstic.gw', NULL, 'Platform Owner', 'ativo', 'owner', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-admin', 'Administrador Nacional', 'nacional.admin@mat.gw', NULL, 'Administrador Nacional', 'ativo', 'mat.admin', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-super', 'Supervisor Nacional', 'nacional.super@mat.gw', NULL, 'Supervisor Nacional', 'ativo', 'mat.super', '${SHA256_DEFAULT_PWD}'),
        ('user-nat-audit', 'Auditor Nacional', 'nacional.auditor@mat.gw', NULL, 'Auditor Nacional', 'ativo', 'mat.auditor', '${SHA256_DEFAULT_PWD}');
      `);
    } else {
      // Automatic security migration: Encrypt any legacy plain-text password to SHA-256
      await client.query(`
        UPDATE usuarios 
        SET senha = '${SHA256_DEFAULT_PWD}'
        WHERE senha = '123456' OR senha IS NULL OR length(senha) < 60;
      `);
    }

    // 2. Configuracoes (Standard Neutral Settings with ID 1)
    const countConf = await client.query('SELECT COUNT(*) FROM configuracoes');
    if (parseInt(countConf.rows[0].count) === 0) {
      console.log('Seeding standard system configuracoes...');
      await client.query(`
        INSERT INTO configuracoes (id, logo_camara, nome_municipio, moeda, fuso_horario, backup_habilitado, tema_escuro, notificacoes_habilitadas, taxa_comissao, comissao_paga) VALUES
        (1, '', 'Receita 360', 'FCFA', 'GMT-0', true, false, true, 10, 0);
      `);
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully with core administrators!');
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('Failed to initialize database schema and migrations:', err);
  } finally {
    if (client) {
      client.release();
    }
  }
}
