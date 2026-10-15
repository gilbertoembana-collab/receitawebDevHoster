import { pgTable, text, integer, boolean, doublePrecision, real, index, timestamp, date, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { Dispositivo } from '../types';

// ==========================================
// TABELAS OFICIAIS DO SISTEMA RECEITA360
// ==========================================

export const municipios = pgTable('municipios', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  codigo: text('codigo').notNull(),
  regiao: text('regiao').notNull(),
  endereco: text('endereco').notNull(),
  telefone: text('telefone').notNull(),
  email: text('email').notNull(),
  responsavel: text('responsavel').notNull(),
  status: text('status').notNull().default('ativo'),
  paisId: text('pais_id'),
  paisNome: text('pais_nome'),
  ministerioId: text('ministerio_id'),
  ministerioNome: text('ministerio_nome'),
  plano: text('plano'),
  dataAtivacao: text('data_ativacao'),
  dataValidade: text('data_validade'),
  estadoLicenca: text('estado_licenca'),
  modulosHabilitados: text('modulos_habilitados'),
  limiteUsuarios: integer('limite_usuarios'),
  limiteArmazenamento: integer('limite_armazenamento'),
}, (table) => ({
  statusIdx: index('municipios_status_idx').on(table.status),
  nomeIdx: index('municipios_nome_idx').on(table.nome),
}));

export const usuarios = pgTable('usuarios', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  municipioId: text('municipio_id').references(() => municipios.id, { onDelete: 'set null' }),
  perfil: text('perfil').notNull(),
  status: text('status').notNull().default('ativo'),
  usuario: text('usuario'),
  senha: text('senha'),
}, (table) => ({
  emailIdx: index('usuarios_email_idx').on(table.email),
  municipioIdx: index('usuarios_municipio_idx').on(table.municipioId),
}));

export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  familyId: text('family_id').notNull(),
  userId: text('user_id').notNull(),
  userType: text('user_type').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedByHash: text('replaced_by_hash'),
}, (table) => ({
  tokenHashIdx: uniqueIndex('auth_sessions_token_hash_idx').on(table.tokenHash),
  familyIdx: index('auth_sessions_family_id_idx').on(table.familyId),
  userIdx: index('auth_sessions_user_idx').on(table.userId, table.userType),
}));

export const mercados = pgTable('mercados', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  municipioId: text('municipio_id').notNull().references(() => municipios.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  gpsLabel: text('gps_label'),
  qtdBancas: integer('qtd_bancas').notNull(),
  responsavel: text('responsavel').notNull(),
  telefone: text('telefone').notNull(),
  status: text('status').notNull().default('ativo'),
}, (table) => ({
  municipioIdx: index('mercados_municipio_idx').on(table.municipioId),
  statusIdx: index('mercados_status_idx').on(table.status),
}));

export const agentes = pgTable('agentes', {
  id: text('id').primaryKey(),
  foto: text('foto'),
  nome: text('nome').notNull(),
  telefone: text('telefone').notNull(),
  email: text('email').notNull().unique(),
  usuario: text('usuario').notNull().unique(),
  mercadoId: text('mercado_id').notNull().references(() => mercados.id, { onDelete: 'restrict' }),
  municipioId: text('municipio_id').notNull().references(() => municipios.id, { onDelete: 'cascade' }),
  cargo: text('cargo').notNull(),
  status: text('status').notNull().default('ativo'),
  permissoes: text('permissoes').notNull(),
  resetSenhaPending: boolean('reset_senha_pending').default(false),
  senhaTemporaria: text('senha_temporaria'),
  senha: text('senha'),
}, (table) => ({
  emailIdx: index('agentes_email_idx').on(table.email),
  usuarioIdx: index('agentes_usuario_idx').on(table.usuario),
  mercadoIdx: index('agentes_mercado_idx').on(table.mercadoId),
  municipioIdx: index('agentes_municipio_idx').on(table.municipioId),
  statusIdx: index('agentes_status_idx').on(table.status),
}));

export const contribuintes = pgTable('contribuintes', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  telefone: text('telefone').notNull(),
  documento: text('documento').notNull(),
  mercadoId: text('mercado_id').notNull().references(() => mercados.id, { onDelete: 'restrict' }),
  numBanca: text('num_banca').notNull(),
  categoria: text('categoria').notNull().references(() => categoriasContribuintes.id, { onDelete: 'restrict' }),
  atividade: text('atividade').notNull(),
  dimensao: text('dimensao').notNull(),
  dataRegistro: timestamp('data_registro', { withTimezone: true }).notNull().defaultNow(),
  agenteId: text('agente_id').notNull().references(() => agentes.id, { onDelete: 'restrict' }),
  observacoes: text('observacoes').notNull(),
  status: text('status').notNull().default('ativo'),
  reativarEm: date('reativar_em', { mode: 'string' }),
  qrCode: text('qr_code'),
  areaM2: real('area_m2'),
  foto: text('foto'),
}, (table) => ({
  mercadoIdx: index('contribuintes_mercado_idx').on(table.mercadoId),
  documentoIdx: index('contribuintes_documento_idx').on(table.documento),
  statusIdx: index('contribuintes_status_idx').on(table.status),
  registroIdx: index('contribuintes_data_registro_idx').on(table.dataRegistro),
  agenteIdx: index('contribuintes_agente_idx').on(table.agenteId),
}));

export const categoriasContribuintes = pgTable('categoria_contribuintes', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  descricao: text('descricao').notNull().default(''),
  status: text('status').notNull().default('ativo'),
});

export const tiposReceita = pgTable('tipos_receita', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  descricao: text('descricao').notNull(),
  valor: integer('valor').notNull(),
  periodicidade: text('periodicidade').notNull(),
  status: text('status').notNull().default('ativo'),
}, (table) => ({
  statusIdx: index('tipos_receita_status_idx').on(table.status),
}));

export const pagamentos = pgTable('pagamentos', {
  id: text('id').primaryKey(),
  reciboId: text('recibo_id').notNull(),
  municipioId: text('municipio_id').notNull().references(() => municipios.id, { onDelete: 'restrict' }),
  mercadoId: text('mercado_id').notNull().references(() => mercados.id, { onDelete: 'restrict' }),
  agenteId: text('agente_id').notNull().references(() => agentes.id, { onDelete: 'restrict' }),
  contribuinteId: text('contribuinte_id').notNull().references(() => contribuintes.id, { onDelete: 'restrict' }),
  tipoReceitaId: text('tipo_receita_id').notNull().references(() => tiposReceita.id, { onDelete: 'restrict' }),
  valor: integer('valor').notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  dataPagamento: text('data_pagamento').notNull(),
  status: text('status').notNull().default('pago'),
  observacao: text('observacao'),
  dataCriacao: text('data_criacao').notNull(),
}, (table) => ({
  reciboIdx: index('pagamentos_recibo_idx').on(table.reciboId),
  municipioIdx: index('pagamentos_municipio_idx').on(table.municipioId),
  mercadoIdx: index('pagamentos_mercado_idx').on(table.mercadoId),
  agenteIdx: index('pagamentos_agente_idx').on(table.agenteId),
  contribuinteIdx: index('pagamentos_contribuinte_idx').on(table.contribuinteId),
  tipoReceitaIdx: index('pagamentos_tipo_receita_idx').on(table.tipoReceitaId),
  statusIdx: index('pagamentos_status_idx').on(table.status),
  dataPagamentoIdx: index('pagamentos_data_pagamento_idx').on(table.dataPagamento),
}));

export const auditoriaLog = pgTable('auditoria_log', {
  id: text('id').primaryKey(),
  usuario: text('usuario').notNull(),
  perfil: text('perfil').notNull(),
  data: text('data').notNull(),
  hora: text('hora').notNull(),
  ip: text('ip').notNull(),
  dispositivo: text('dispositivo').notNull(),
  acao: text('acao').notNull(),
  descricao: text('descricao').notNull(),
}, (table) => ({
  usuarioIdx: index('auditoria_log_usuario_idx').on(table.usuario),
  dataIdx: index('auditoria_log_data_idx').on(table.data),
  acaoIdx: index('auditoria_log_acao_idx').on(table.acao),
}));

export const sincronizacaoLog = pgTable('sincronizacao_log', {
  id: text('id').primaryKey(),
  agenteId: text('agente_id').notNull().references(() => agentes.id, { onDelete: 'cascade' }),
  ultimaSincronizacao: text('ultima_sincronizacao').notNull(),
  registrosSincronizados: integer('registros_sincronizados').notNull(),
  status: text('status').notNull().default('sucesso'),
}, (table) => ({
  agenteIdx: index('sincronizacao_log_agente_idx').on(table.agenteId),
}));

export const configuracoes = pgTable('configuracoes', {
  id: integer('id').primaryKey(),
  logoCamara: text('logo_camara'),
  nomeMunicipio: text('nome_municipio').notNull(),
  moeda: text('moeda').notNull(),
  fusoHorario: text('fuso_horario').notNull(),
  backupHabilitado: boolean('backup_habilitado').notNull().default(true),
  temaEscuro: boolean('tema_escuro').notNull().default(false),
  notificacoesHabilitadas: boolean('notificacoes_habilitadas').notNull().default(true),
  taxaComissao: integer('taxa_comissao').notNull().default(10),
  comissaoPaga: integer('comissao_paga').notNull().default(0),
  metaDiariaAgente: integer('meta_diaria_agente').notNull().default(100000),
  percentualIncentivo: integer('percentual_incentivo').notNull().default(5),
  modoOfflineHoras: integer('modo_offline_horas').notNull().default(24),
  geofencingAtivo: boolean('geofencing_ativo').notNull().default(true),
  limiteDiarioColetaPorAgente: integer('limite_diario_coleta_por_agente').notNull().default(500000),
  imprimirLogoRecibo: boolean('imprimir_logo_recibo').notNull().default(true),
  textoRodapeRecibo: text('texto_rodape_recibo').notNull().default('Obrigado por contribuir com o desenvolvimento do Município.'),
  versaoMinimaApp: text('versao_minima_app').notNull().default('2.4.0'),
  dispositivos: jsonb('dispositivos').$type<Dispositivo[]>().notNull().default([]),
});

// ==========================================
// DRIZZLE RELATIONAL DEFINITIONS
// ==========================================

export const municipiosRelations = relations(municipios, ({ many }) => ({
  usuarios: many(usuarios),
  mercados: many(mercados),
  agentes: many(agentes),
  pagamentos: many(pagamentos),
}));

export const usuariosRelations = relations(usuarios, ({ one }) => ({
  municipio: one(municipios, {
    fields: [usuarios.municipioId],
    references: [municipios.id],
  }),
}));

export const mercadosRelations = relations(mercados, ({ one, many }) => ({
  municipio: one(municipios, {
    fields: [mercados.municipioId],
    references: [municipios.id],
  }),
  agentes: many(agentes),
  contribuintes: many(contribuintes),
  pagamentos: many(pagamentos),
}));

export const agentesRelations = relations(agentes, ({ one, many }) => ({
  mercado: one(mercados, {
    fields: [agentes.mercadoId],
    references: [mercados.id],
  }),
  municipio: one(municipios, {
    fields: [agentes.municipioId],
    references: [municipios.id],
  }),
  pagamentos: many(pagamentos),
  sincronizacaoLogs: many(sincronizacaoLog),
}));

export const contribuintesRelations = relations(contribuintes, ({ one, many }) => ({
  mercado: one(mercados, {
    fields: [contribuintes.mercadoId],
    references: [mercados.id],
  }),
  agente: one(agentes, {
    fields: [contribuintes.agenteId],
    references: [agentes.id],
  }),
  pagamentos: many(pagamentos),
}));

export const tiposReceitaRelations = relations(tiposReceita, ({ many }) => ({
  pagamentos: many(pagamentos),
}));

export const pagamentosRelations = relations(pagamentos, ({ one }) => ({
  municipio: one(municipios, {
    fields: [pagamentos.municipioId],
    references: [municipios.id],
  }),
  mercado: one(mercados, {
    fields: [pagamentos.mercadoId],
    references: [mercados.id],
  }),
  agente: one(agentes, {
    fields: [pagamentos.agenteId],
    references: [agentes.id],
  }),
  contribuinte: one(contribuintes, {
    fields: [pagamentos.contribuinteId],
    references: [contribuintes.id],
  }),
  tipoReceita: one(tiposReceita, {
    fields: [pagamentos.tipoReceitaId],
    references: [tiposReceita.id],
  }),
}));

export const sincronizacaoLogRelations = relations(sincronizacaoLog, ({ one }) => ({
  agente: one(agentes, {
    fields: [sincronizacaoLog.agenteId],
    references: [agentes.id],
  }),
}));
