import { create } from 'zustand';
import { 
  Municipio, Mercado, Agente, Contribuinte, TipoReceita, 
  Pagamento, AuditoriaLog, SincronizacaoLog, SystemConfig, Usuario, UserProfile,
  CategoriaContribuinte
} from '../types';
import { dbService } from '../services/db';
import { apiFetch, logoutSession } from '../services/api';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'info' | 'success' | 'warning';
}

interface AppStore {
  // Authentication & Profile State
  currentUser: Usuario | null;
  authInitialized: boolean;
  activeProfile: UserProfile;
  availableUsers: Usuario[];
  setProfile: (profile: UserProfile) => void;
  setCurrentUser: (user: Usuario | null) => void;
  setAuthInitialized: (initialized: boolean) => void;

  // Real-time collections
  usuarios: Usuario[];
  municipios: Municipio[];
  mercados: Mercado[];
  agentes: Agente[];
  contribuintes: Contribuinte[];
  categoriasContribuintes: CategoriaContribuinte[];
  tiposReceita: TipoReceita[];
  pagamentos: Pagamento[];
  auditoriaLogs: AuditoriaLog[];
  sincronizacoes: SincronizacaoLog[];
  configuracoes: SystemConfig;

  // Global UI states
  darkMode: boolean;
  toggleDarkMode: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  notifications: NotificationItem[];
  addNotification: (notification: Omit<NotificationItem, 'id' | 'time' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // CRUD Operations linking back to dbService
  addUsuario: (item: Omit<Usuario, 'id'>) => void;
  updateUsuario: (id: string, updates: Partial<Usuario>) => void;
  deleteUsuario: (id: string) => void;

  addMunicipio: (item: Omit<Municipio, 'id'>) => void;
  updateMunicipio: (id: string, updates: Partial<Municipio>) => void;
  deleteMunicipio: (id: string) => void;

  addMercado: (item: Omit<Mercado, 'id'>) => void;
  updateMercado: (id: string, updates: Partial<Mercado>) => void;
  deleteMercado: (id: string) => void;

  addAgente: (item: Omit<Agente, 'id'>) => void;
  updateAgente: (id: string, updates: Partial<Agente>) => void;
  deleteAgente: (id: string) => void;

  addContribuinte: (item: Omit<Contribuinte, 'id' | 'dataRegistro' | 'agenteId'>) => Promise<Contribuinte>;
  loadContributorsPage: (page: number, search?: string) => Promise<{ items: Contribuinte[]; total: number }>;
  updateContribuinte: (id: string, updates: Partial<Contribuinte>) => Promise<Contribuinte>;

  addCategoriaContribuinte: (item: Omit<CategoriaContribuinte, 'id'>) => void;
  updateCategoriaContribuinte: (id: string, updates: Partial<CategoriaContribuinte>) => void;

  addTipoReceita: (item: Omit<TipoReceita, 'id'>) => void;
  updateTipoReceita: (id: string, updates: Partial<TipoReceita>) => void;
  deleteTipoReceita: (id: string) => void;

  addPagamento: (item: Omit<Pagamento, 'id'>) => void;
  updatePagamento: (id: string, updates: Partial<Pagamento>) => void;
  approveCancellation: (id: string) => void;
  cancelPayment: (id: string, reason: string) => void;

  updateConfiguracoes: (updates: Partial<SystemConfig>) => void;
  saveConfiguracoes: (updates: Partial<SystemConfig>) => Promise<void>;
}

const INITIAL_USUARIOS: Usuario[] = [
  { id: 'user-owner', nome: 'Administrador de Plataforma', email: 'owner@gstic.gw', perfil: 'Platform Owner', status: 'ativo' },
  { id: 'user-nat-admin', nome: 'Administrador Nacional', email: 'nacional.admin@mat.gw', perfil: 'Administrador Nacional', status: 'ativo' },
  { id: 'user-nat-super', nome: 'Supervisor Nacional', email: 'nacional.super@mat.gw', perfil: 'Supervisor Nacional', status: 'ativo' },
  { id: 'user-nat-audit', nome: 'Auditor Nacional', email: 'nacional.auditor@mat.gw', perfil: 'Auditor Nacional', status: 'ativo' },
  
  // Clean default fallback profiles with generic names
  { id: 'user-admin', nome: 'Administrador Geral', email: 'admin@receita360.gw', perfil: 'Super Admin', status: 'ativo' },
  { id: 'user-muni', nome: 'Administrador Municipal', email: 'muni@receita360.gw', perfil: 'Administrator', status: 'ativo' },
  { id: 'user-fiscal', nome: 'Supervisor de Campo', email: 'supervisor@receita360.gw', perfil: 'Supervisor', status: 'ativo' },
  { id: 'user-agent', nome: 'Agente de Cobrança', email: 'agent@receita360.gw', perfil: 'Collection Agent', status: 'ativo' },
  { id: 'user-cashier', nome: 'Operador de Caixa', email: 'cashier@receita360.gw', perfil: 'Cashier', status: 'ativo' },
  { id: 'user-auditor', nome: 'Auditor de Sistema', email: 'auditor@receita360.gw', perfil: 'Auditor', status: 'ativo' }
];

const DEFAULT_CONFIG: SystemConfig = {
  logoCamara: '',
  nomeMunicipio: 'Receita 360',
  moeda: 'FCFA',
  fusoHorario: 'GMT-0',
  backupHabilitado: true,
  temaEscuro: false,
  notificacoesHabilitadas: true,
  taxaComissao: 10,
  comissaoPaga: 0,
  modoOfflineHoras: 24,
  geofencingAtivo: true,
  limiteDiarioColetaPorAgente: 500000,
  imprimirLogoRecibo: true,
  textoRodapeRecibo: 'Obrigado por contribuir com o desenvolvimento do Município.',
  versaoMinimaApp: '2.4.0',
  dispositivos: [],
};

export const useAppStore = create<AppStore>((set, get) => {
  // Listeners Setup
  const unsubscribeFuncs: Array<() => void> = [];

  // Initialize listeners
  const initListeners = () => {
    unsubscribeFuncs.push(
      dbService.onSnapshot('usuarios', (data) => set({ usuarios: data, availableUsers: data.length > 0 ? data : INITIAL_USUARIOS })),
      dbService.onSnapshot('municipios', (data) => set({ municipios: data })),
      dbService.onSnapshot('mercados', (data) => set({ mercados: data })),
      dbService.onSnapshot('agentes', (data) => set({ agentes: data })),
      dbService.onSnapshot('contribuintes', (data) => set({ contribuintes: data })),
      dbService.onSnapshot('categoria_contribuintes', (data) => set({ categoriasContribuintes: data })),
      dbService.onSnapshot('tipos_receita', (data) => set({ tiposReceita: data })),
      dbService.onSnapshot('pagamentos', (data) => set({ pagamentos: data })),
      dbService.onSnapshot('auditoria', (data) => set({ auditoriaLogs: data })),
      dbService.onSnapshot('sincronizacao', (data) => set({ sincronizacoes: data })),
      dbService.onSnapshot('configuracoes', (data) => set({ configuracoes: data }))
    );
  };

  // Defer listener initialization to ensure store state is fully instantiated beforehand
  setTimeout(() => {
    initListeners();
    apiFetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.user) get().setCurrentUser(data.user);
      })
      .catch(() => {})
      .finally(() => get().setAuthInitialized(true));
  }, 0);

  // Handle live collection simulator events
  window.addEventListener('receita_nova_cobranca', (e: any) => {
    const pay: Pagamento = e.detail;
    const { agentes, tiposReceita, contribuintes, configuracoes } = get();
    const ag = agentes.find(a => a.id === pay.agenteId);
    const tx = tiposReceita.find(t => t.id === pay.tipoReceitaId);
    const ct = contribuintes.find(c => c.id === pay.contribuinteId);

    get().addNotification({
      title: 'Nova Arrecadação',
      message: `${ag?.nome || 'Agente'} arrecadou ${pay.valor.toLocaleString()} ${configuracoes.moeda} de ${ct?.nome || 'Contribuinte'} (${tx?.nome || 'Taxa'})`,
      type: 'success'
    });
  });

  return {
    // Auth - Start with no user logged in so the login screen is requested upon opening
    currentUser: null,
    authInitialized: false,
    activeProfile: 'Platform Owner',
    availableUsers: INITIAL_USUARIOS,
    setProfile: (profile) => {
      const u = INITIAL_USUARIOS.find(user => user.perfil === profile) || null;
      set({ activeProfile: profile, currentUser: u, authInitialized: true });
      dbService.addAuditLog('login', `Troca de perfil administrativo para: ${profile}`, u?.email || 'sistema@receita360.gw');
      dbService.setTenantContext(u?.municipioId || '', profile);
    },
    setCurrentUser: (user) => {
      if (!user) {
        void logoutSession();
        dbService.clearTenantContext();
        set({ currentUser: null, activeProfile: 'Super Admin', authInitialized: true });
        return;
      }
      set({ currentUser: user, activeProfile: user.perfil, authInitialized: true });
      dbService.setTenantContext(user.municipioId || '', user.perfil);
    },
    setAuthInitialized: (initialized) => set({ authInitialized: initialized }),

    // Preload items initially to prevent empty tables before updates or snapshots
    usuarios: dbService.SimulatorState.usuarios || [],
    municipios: dbService.SimulatorState.municipios || [],
    mercados: dbService.SimulatorState.mercados || [],
    agentes: dbService.SimulatorState.agentes || [],
    contribuintes: dbService.SimulatorState.contribuintes || [],
    categoriasContribuintes: dbService.SimulatorState.categoria_contribuintes || [],
    tiposReceita: dbService.SimulatorState.tipos_receita || [],
    pagamentos: dbService.SimulatorState.pagamentos || [],
    auditoriaLogs: dbService.SimulatorState.auditoria || [],
    sincronizacoes: dbService.SimulatorState.sincronizacao || [],
    configuracoes: dbService.SimulatorState.configuracoes || DEFAULT_CONFIG,

    // UI States
    darkMode: false,
    toggleDarkMode: () => set((state) => {
      const next = !state.darkMode;
      dbService.updateDocument('configuracoes', '', { temaEscuro: next });
      return { darkMode: next };
    }),
    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),
    notifications: [
      { id: '1', title: 'Fase Piloto Ativada', message: 'Sistema pronto para início da operação piloto com dados em tempo real da base de dados.', time: 'Agora', read: false, type: 'info' }
    ],
    addNotification: (n) => set((state) => state.configuracoes.notificacoesHabilitadas ? ({
      notifications: [
        {
          id: Math.random().toString(36).substr(2, 9),
          time: 'Agora',
          read: false,
          ...n
        },
        ...state.notifications
      ]
    }) : state),
    markNotificationRead: (id) => set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
    })),
    markAllNotificationsRead: () => set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true }))
    })),
    clearNotifications: () => set({ notifications: [] }),

    // CRUD Municipios
    addMunicipio: (item) => dbService.addDocument('municipios', item),
    updateMunicipio: (id, updates) => dbService.updateDocument('municipios', id, updates),
    deleteMunicipio: (id) => {
      const { currentUser, activeProfile, agentes } = get();
      const hasAgentes = agentes.some(a => a.municipioId === id);
      if (hasAgentes) {
        get().addNotification({
          title: 'Exclusão Bloqueada',
          message: 'Não é possível excluir este município porque existem agentes vinculados a ele.',
          type: 'warning'
        });
        return;
      }
      const userEmail = currentUser?.email || 'admin@receita360.gw';
      const deleted = dbService.deleteDocument('municipios', id, userEmail, activeProfile);
      if (deleted) {
        get().addNotification({
          title: 'Município Excluído',
          message: `O município "${deleted.nome}" foi excluído com sucesso por ${currentUser?.nome || 'Administrador'}.`,
          type: 'warning'
        });
      }
    },

    // CRUD Mercados
    addMercado: (item) => dbService.addDocument('mercados', item),
    updateMercado: (id, updates) => dbService.updateDocument('mercados', id, updates),
    deleteMercado: (id) => {
      const { currentUser, activeProfile, pagamentos } = get();
      const hasPayments = pagamentos.some(p => p.mercadoId === id);
      if (hasPayments) {
        get().addNotification({
          title: 'Exclusão Bloqueada',
          message: 'Não é possível excluir este mercado devido a cobranças existentes vinculadas.',
          type: 'warning'
        });
        return;
      }
      const userEmail = currentUser?.email || 'admin@receita360.gw';
      const deleted = dbService.deleteDocument('mercados', id, userEmail, activeProfile);
      if (deleted) {
        get().addNotification({
          title: 'Mercado Excluído',
          message: `O mercado "${deleted.nome}" foi excluído com sucesso por ${currentUser?.nome || 'Administrador'}.`,
          type: 'warning'
        });
      }
    },

    // CRUD Agentes
    addAgente: (item) => dbService.addDocument('agentes', item),
    updateAgente: (id, updates) => dbService.updateDocument('agentes', id, updates),
    deleteAgente: (id) => {
      const { currentUser, activeProfile, pagamentos } = get();
      const hasPayments = pagamentos.some(p => p.agenteId === id);
      if (hasPayments) {
        get().addNotification({
          title: 'Exclusão Bloqueada',
          message: 'Não é possível excluir este agente devido a cobranças existentes vinculadas.',
          type: 'warning'
        });
        return;
      }
      const userEmail = currentUser?.email || 'admin@receita360.gw';
      const deleted = dbService.deleteDocument('agentes', id, userEmail, activeProfile);
      if (deleted) {
        get().addNotification({
          title: 'Agente Excluído',
          message: `O agente "${deleted.nome}" foi excluído com sucesso por ${currentUser?.nome || 'Administrador'}.`,
          type: 'warning'
        });
      }
    },

    // CRUD Contribuintes
    addContribuinte: (item) => dbService.createContributor(item),
    loadContributorsPage: (page, search) => dbService.loadContributorsPage(page, search),
    updateContribuinte: (id, updates) => dbService.updateContributor(id, updates),

    // Contributor categories
    addCategoriaContribuinte: (item) => dbService.addDocument('categoria_contribuintes', item),
    updateCategoriaContribuinte: (id, updates) => dbService.updateDocument('categoria_contribuintes', id, updates),

    // CRUD TiposReceita
    addTipoReceita: (item) => dbService.addDocument('tipos_receita', item),
    updateTipoReceita: (id, updates) => dbService.updateDocument('tipos_receita', id, updates),
    deleteTipoReceita: (id) => {
      const { currentUser, activeProfile } = get();
      const userEmail = currentUser?.email || 'admin@receita360.gw';
      const deleted = dbService.deleteDocument('tipos_receita', id, userEmail, activeProfile);
      if (deleted) {
        get().addNotification({
          title: 'Taxa Excluída',
          message: `A taxa de receita "${deleted.nome}" foi excluída com sucesso por ${currentUser?.nome || 'Administrador'}.`,
          type: 'warning'
        });
      }
    },

    // Payments / Collections Actions
    addPagamento: (item) => dbService.addDocument('pagamentos', item),
    updatePagamento: (id, updates) => dbService.updateDocument('pagamentos', id, updates),
    approveCancellation: (id) => {
      const { pagamentos, currentUser } = get();
      const pay = pagamentos.find(p => p.id === id);
      if (pay) {
        dbService.updateDocument('pagamentos', id, { status: 'cancelado' });
        dbService.addAuditLog('cancelamento', `Cancelamento aprovado para recibo #${pay.reciboId} pelo administrador`, currentUser?.email);
        get().addNotification({
          title: 'Cancelamento Aprovado',
          message: `O recibo #${pay.reciboId} foi cancelado com sucesso.`,
          type: 'success'
        });
      }
    },
    cancelPayment: (id, reason) => {
      const { pagamentos, currentUser } = get();
      const pay = pagamentos.find(p => p.id === id);
      if (pay) {
        dbService.updateDocument('pagamentos', id, { 
          status: 'cancelamento_pendente', 
          observacao: reason || 'Cancelamento solicitado' 
        });
        dbService.addAuditLog('cancelamento', `Cancelamento solicitado para recibo #${pay.reciboId}`, currentUser?.email);
        get().addNotification({
          title: 'Cancelamento Solicitado',
          message: `Solicitação para recibo #${pay.reciboId} enviada para supervisão.`,
          type: 'warning'
        });
      }
    },

    updateConfiguracoes: (updates) => {
      dbService.updateDocument('configuracoes', '', updates);
    },
    saveConfiguracoes: async (updates) => {
      const response = await apiFetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível guardar as configurações.');
      }
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('O servidor devolveu uma resposta de configuração inválida.');
      }
      dbService.replaceConfiguracoes(result);
      dbService.addAuditLog('alteracao', 'Configurações do sistema atualizadas');
    },

    // CRUD Usuarios
    addUsuario: (item) => dbService.addDocument('usuarios', item),
    updateUsuario: (id, updates) => dbService.updateDocument('usuarios', id, updates),
    deleteUsuario: (id) => {
      const { currentUser, activeProfile } = get();
      const userEmail = currentUser?.email || 'admin@receita360.gw';
      const deleted = dbService.deleteDocument('usuarios', id, userEmail, activeProfile);
      if (deleted) {
        get().addNotification({
          title: 'Usuário Excluído',
          message: `O usuário "${deleted.nome}" foi excluído com sucesso por ${currentUser?.nome || 'Administrador'}.`,
          type: 'warning'
        });
      }
    }
  };
});
