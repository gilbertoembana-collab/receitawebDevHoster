import pkg from 'pg';
const { Pool } = pkg;
import { createPool } from './index.ts';
import { hashPassword, migratePlaintextPasswords } from '../auth/security.js';

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
        dimensao TEXT,
        data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        agente_id TEXT,
        observacoes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        reativar_em DATE,
        qr_code TEXT,
        area_m2 REAL,
        foto TEXT
      );
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS qr_code TEXT;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS area_m2 REAL;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS foto TEXT;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS dimensao TEXT;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS reativar_em DATE;
    `);
    const registrationDateColumn = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'contribuintes'
        AND column_name = 'data_registro'
    `);
    await client.query(`
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS data_registro TIMESTAMPTZ;
      ALTER TABLE contribuintes ADD COLUMN IF NOT EXISTS agente_id TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categoria_contribuintes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ativo'
      );
      CREATE UNIQUE INDEX IF NOT EXISTS categoria_contribuintes_nome_unique_idx
        ON categoria_contribuintes (LOWER(nome));
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
    ] as const;

    for (const [id, nome, descricao] of contributorCategories) {
      await client.query(
        `INSERT INTO categoria_contribuintes (id, nome, descricao, status)
         VALUES ($1, $2, $3, 'ativo')
         ON CONFLICT (id) DO NOTHING`,
        [id, nome, descricao],
      );
    }

    await client.query(`
      UPDATE contribuintes
      SET categoria = CASE
        WHEN atividade ~* '(roup|vestu|tecid|camisol|cal[cç]ad|sapato|chinel|alfaiat|confec|boutique)'
          THEN 'Vestuário, Tecidos e Calçados'
        WHEN atividade ~* '(celular|telefone|telem[oó]vel|eletr[oó]nic|comput|inform[aá]tic|repara[cç][aã]o.*tele|t[eé]cnic)'
          THEN 'Eletrônica, Telecomunicações e Reparação'
        WHEN atividade ~* '(carro|autom[oó]vel|pe[cç]as.*ve[ií]cul|pe[cç]as de carro)'
          THEN 'Automóvel e Peças'
        WHEN atividade ~* '(constru[cç][aã]o|canaliza[cç][aã]o|materiais de eletricidade|cimento|ferramentas|materiais de constru[cç][aã]o)'
          THEN 'Construção e Materiais'
        WHEN atividade ~* '(cosm[eé]tic|higiene|perfum|sab[oã]es)'
          THEN 'Cosmética e Higiene'
        WHEN atividade ~* '(artesan|cestaria|escultura)'
          THEN 'Artesanato e Produção'
        WHEN atividade ~* '(alimento|comida|legume|hortali[cç]|peixe|carne|fruta|bebida|cereal|mandioca|batata)'
          OR categoria IN ('Alimentos', 'Carnes/Peixes', 'Cereais')
          THEN 'Alimentos e Produtos Frescos'
        WHEN categoria = 'Confecções' THEN 'Vestuário, Tecidos e Calçados'
        WHEN categoria = 'Eletrônicos' THEN 'Eletrônica, Telecomunicações e Reparação'
        WHEN categoria = 'Artesanato' THEN 'Artesanato e Produção'
        ELSE 'Comércio Geral/Por Classificar'
      END,
      dimensao = CASE
        WHEN atividade ~* '(atacado|atacadista|grossista|distribuidor|importador)'
          THEN 'Grande'
        WHEN atividade ~* '(eletr[oó]nic|celular|telem[oó]vel|pe[cç]as de carro|autom[oó]vel|constru[cç][aã]o|materiais de eletricidade|canaliza[cç][aã]o)'
          THEN 'Médio'
        WHEN NULLIF(BTRIM(atividade), '') IS NULL
          THEN 'Micro'
        ELSE 'Pequeno'
      END
      WHERE dimensao IS NULL OR dimensao NOT IN ('Micro', 'Pequeno', 'Médio', 'Grande');
    `);
    await client.query('ALTER TABLE contribuintes ALTER COLUMN dimensao SET NOT NULL;');
    await client.query(`
      UPDATE contribuintes AS contribuinte
      SET categoria = categoria_ref.id
      FROM categoria_contribuintes AS categoria_ref
      WHERE contribuinte.categoria = categoria_ref.nome;
    `);
    await client.query(`
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
    const registrationAgentId = 'agen-f7rm38ilf';
    const registrationAgent = await client.query(
      'SELECT 1 FROM agentes WHERE id = $1 LIMIT 1',
      [registrationAgentId],
    );
    if (!registrationAgent.rowCount) {
      throw new Error(`Required contributor registration agent not found: ${registrationAgentId}`);
    }
    await client.query(
      `UPDATE contribuintes
       SET data_registro = CASE WHEN $2 THEN NOW() ELSE COALESCE(data_registro, NOW()) END,
           agente_id = COALESCE(agente_id, $1)
       WHERE $2 OR data_registro IS NULL OR agente_id IS NULL`,
      [registrationAgentId, registrationDateColumn.rowCount === 0],
    );
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'contribuintes_agente_fk'
            AND conrelid = 'contribuintes'::regclass
        ) THEN
          ALTER TABLE contribuintes
            ADD CONSTRAINT contribuintes_agente_fk
            FOREIGN KEY (agente_id)
            REFERENCES agentes(id)
            ON DELETE RESTRICT;
        END IF;
      END $$;
    `);
    await client.query(`
      ALTER TABLE contribuintes ALTER COLUMN data_registro SET DEFAULT NOW();
      ALTER TABLE contribuintes ALTER COLUMN data_registro SET NOT NULL;
      ALTER TABLE contribuintes ALTER COLUMN agente_id SET NOT NULL;
      CREATE INDEX IF NOT EXISTS contribuintes_data_registro_idx ON contribuintes(data_registro DESC);
      CREATE INDEX IF NOT EXISTS contribuintes_agente_idx ON contribuintes(agente_id);
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

    await migratePlaintextPasswords(client);

    // ==========================================
    // 4. SEEDING DEFAULT DATA IF EMPTY (Core Administrators Only)
    // ==========================================

    // 1. Usuarios (Platform / National level only - No Municipal ID required)
    const countUsers = await client.query('SELECT COUNT(*) FROM usuarios');
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (parseInt(countUsers.rows[0].count) === 0) {
      console.log('Seeding the configured bootstrap administrator.');
      if (bootstrapEmail && bootstrapPassword) {
        const passwordHash = await hashPassword(bootstrapPassword);
        const username = process.env.BOOTSTRAP_ADMIN_USERNAME || bootstrapEmail.split('@')[0];
        await client.query(
          `INSERT INTO usuarios (id, nome, email, municipio_id, perfil, status, usuario, senha)
           VALUES ($1, $2, $3, NULL, 'Platform Owner', 'ativo', $4, $5)
           ON CONFLICT DO NOTHING`,
          ['user-owner', 'Administrador de Plataforma', bootstrapEmail, username, passwordHash],
        );
      } else {
        console.warn('Bootstrap admin skipped: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.');
      }
    }

    await client.query(`
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
