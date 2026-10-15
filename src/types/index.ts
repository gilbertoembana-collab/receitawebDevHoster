export type UserProfile = 
  | 'Platform Owner'
  | 'Administrador Nacional' | 'Supervisor Nacional' | 'Auditor Nacional'
  | 'Administrador Municipal' | 'Supervisor Municipal' | 'Financeiro' | 'Tesoureiro' | 'Fiscal' | 'Agente de Cobrança' | 'Consulta / Relatórios'
  | 'Super Administrador' | 'Diretor Financeiro' | 'Departamento de Mercados' | 'Fiscal Supervisor'
  | 'Super Admin' | 'Administrator' | 'Supervisor' | 'Collection Agent' | 'Cashier' | 'Auditor';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  municipioId?: string;
  perfil: UserProfile;
  status: 'ativo' | 'inativo';
  usuario?: string;
  senha?: string;
}

export interface Municipio {
  id: string;
  nome: string;
  codigo: string;
  regiao: string;
  endereco: string;
  telefone: string;
  email: string;
  responsavel: string;
  status: 'ativo' | 'inativo';
  paisId?: string;
  paisNome?: string;
  ministerioId?: string;
  ministerioNome?: string;
  plano?: string; // e.g. 'Bronze' | 'Prata' | 'Ouro' | 'Platina'
  dataAtivacao?: string;
  dataValidade?: string;
  estadoLicenca?: 'ativo' | 'suspenso';
  modulosHabilitados?: string[]; // e.g. ['Mercados', 'Taxas', 'Património']
  limiteUsuarios?: number;
  limiteArmazenamento?: number; // in GB
}

export interface Mercado {
  id: string;
  nome: string;
  municipioId: string;
  localizacaoGps: {
    lat: number;
    lng: number;
    label: string;
  };
  qtdBancas: number;
  responsavel: string;
  telefone: string;
  status: 'ativo' | 'inativo';
}

export interface Agente {
  id: string;
  foto?: string;
  nome: string;
  telefone: string;
  email: string;
  usuario: string;
  mercadoId: string;
  municipioId: string;
  cargo: string;
  status: 'ativo' | 'inativo';
  permissoes: string[];
  metaDiaria?: number;
  resetSenhaPending?: boolean;
  senhaTemporaria?: string;
  senha?: string;
}

export interface Contribuinte {
  id: string;
  nome: string;
  telefone: string;
  documento: string;
  mercadoId: string;
  numBanca: string;
  categoria: string;
  atividade: string;
  dimensao: 'Micro' | 'Pequeno' | 'Médio' | 'Grande';
  dataRegistro: string;
  agenteId: string;
  agenteNome?: string;
  observacoes: string;
  status: 'ativo' | 'inativo';
  reativarEm?: string | null;
  qrCode?: string | null;
  areaM2?: number;
  foto?: string;
}

export interface CategoriaContribuinte {
  id: string;
  nome: string;
  descricao: string;
  status: 'ativo' | 'inativo';
}

export type PeriodicidadeTaxa = 'Diária' | 'Semanal' | 'Mensal' | 'Anual' | 'Outros';

export interface TipoReceita {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  periodicidade: PeriodicidadeTaxa;
  status: 'ativo' | 'inativo';
}

export type StatusPagamento = 'pago' | 'pendente' | 'cancelado' | 'cancelamento_pendente';

export interface Pagamento {
  id: string;
  reciboId: string; // Recibo format like "000245"
  municipioId: string;
  mercadoId: string;
  agenteId: string;
  contribuinteId: string;
  tipoReceitaId: string;
  valor: number;
  formaPagamento: 'Dinheiro' | 'Orange Money' | 'Transferência Bancária' | 'Outro';
  dataPagamento: string; // ISO string
  status: StatusPagamento;
  observacao?: string;
  dataCriacao: string; // ISO string
}

export interface AuditoriaLog {
  id: string;
  usuario: string;
  perfil: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm:ss
  ip: string;
  dispositivo: string;
  acao: 'login' | 'logout' | 'criacao' | 'alteracao' | 'exclusao' | 'cancelamento' | 'reimpressao' | 'sincronizacao' | 'backup';
  descricao: string;
}

export interface SincronizacaoLog {
  id: string;
  agenteId: string;
  ultimaSincronizacao: string;
  registrosSincronizados: number;
  status: 'sucesso' | 'falha';
}

export interface Dispositivo {
  id: string;
  codigo: string; // e.g. "POS-BISSAU-001"
  nome: string; // e.g. "Sunmi V2 Pro - Kadiatou"
  imeiUuid: string;
  agenteId?: string;
  agenteNome?: string;
  municipioId?: string;
  municipioNome?: string;
  modelo: string;
  impressoraTermica: boolean;
  bateria: number;
  versaoApp: string;
  status: 'ativo' | 'bloqueado' | 'pendente_sincronizacao';
  ultimaSincronizacao: string;
  dataAtivacao: string;
}

export interface SystemConfig {
  logoCamara?: string;
  nomeMunicipio: string;
  moeda: string; // "FCFA" or "R$" etc
  fusoHorario: string;
  backupHabilitado: boolean;
  temaEscuro: boolean;
  notificacoesHabilitadas: boolean;
  taxaComissao: number; // Percentage commission to recover (e.g., 10 for 10%)
  comissaoPaga: number; // Total amount of commission paid so far
  metaDiariaAgente?: number;
  percentualIncentivo?: number;
  // Owner Mobile Device / POS Settings
  modoOfflineHoras?: number;
  geofencingAtivo?: boolean;
  limiteDiarioColetaPorAgente?: number;
  imprimirLogoRecibo?: boolean;
  textoRodapeRecibo?: string;
  versaoMinimaApp?: string;
  dispositivos?: Dispositivo[];
}
