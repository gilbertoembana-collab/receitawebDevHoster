import { 
  Municipio, Mercado, Agente, Contribuinte, TipoReceita, 
  Pagamento, AuditoriaLog, SincronizacaoLog, SystemConfig, Usuario, CategoriaContribuinte
} from '../types';
import { apiFetch } from './api';

function omitCredentialFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(omitCredentialFields) as T;
  if (!value || typeof value !== 'object') return value;
  const safe = { ...value } as Record<string, unknown>;
  for (const key of ['senha', 'senhaTemporaria', 'senha_temporaria', 'password', 'refreshToken', 'accessToken']) {
    delete safe[key];
  }
  return safe as T;
}

class PostgresSyncEngine {
  private data: {
    usuarios: Usuario[];
    municipios: Municipio[];
    mercados: Mercado[];
    agentes: Agente[];
    contribuintes: Contribuinte[];
    categoria_contribuintes: CategoriaContribuinte[];
    tipos_receita: TipoReceita[];
    pagamentos: Pagamento[];
    auditoria: AuditoriaLog[];
    sincronizacao: SincronizacaoLog[];
    configuracoes: SystemConfig;
  };

  private listeners: { [collection: string]: Array<(data: any) => void> } = {};
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private syncInFlight: Promise<void> | null = null;
  private lastSyncAt = 0;
  private authenticated = false;
  private authGeneration = 0;

  constructor() {
    this.data = {
      usuarios: [],
      municipios: [],
      mercados: [],
      agentes: [],
      contribuintes: [],
      categoria_contribuintes: [],
      tipos_receita: [],
      pagamentos: [],
      auditoria: [],
      sincronizacao: [],
      configuracoes: {
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
        textoRodapeRecibo: 'Obrigado por contribuir com o desenvolvimento do Município. Conserve este recibo.',
        versaoMinimaApp: '2.4.0',
        dispositivos: []
      }
    };

    // Load initial cached data from localStorage to ensure immediate display
    this.loadFromLocalStorage();

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (Date.now() - this.lastSyncAt >= 30_000) void this.syncAllWithServer();
      });
    }
  }

  private loadFromLocalStorage() {
    const keys = Object.keys(this.data);
    keys.forEach(k => {
      try {
        const stored = localStorage.getItem(`receita360_${k}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (k === 'contribuintes' && Array.isArray(parsed)) {
            const latest = parsed
              .filter(item => !['cont-1', 'cont-2', 'cont-3'].includes(item?.id))
              .sort((a, b) => (Date.parse(b?.dataRegistro || '') || 0) - (Date.parse(a?.dataRegistro || '') || 0))
              .slice(0, 50)
              .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt', { sensitivity: 'base' }));
            this.data.contribuintes = omitCredentialFields(latest);
          } else {
            this.data[k as keyof typeof this.data] = omitCredentialFields(parsed);
          }
        }
      } catch (e) {
        console.error('Error loading key from localStorage:', k, e);
      }
    });
  }

  private saveToLocalStorage(key: string) {
    try {
      localStorage.setItem(`receita360_${key}`, JSON.stringify(this.data[key as keyof typeof this.data]));
    } catch (e) {
      console.error('Error saving key to localStorage:', key, e);
    }
  }

  get SimulatorState() {
    return this.data;
  }

  public setTenantContext(_municipioId: string, _role: string) {
    this.authenticated = true;
    this.authGeneration += 1;
    if (this.syncInterval === null) {
      this.syncInterval = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void this.syncAllWithServer();
        }
      }, 60_000);
    }
    void this.syncAllWithServer();
  }

  public clearTenantContext() {
    this.authenticated = false;
    this.authGeneration += 1;
    if (this.syncInterval !== null) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  public async loadContributorsPage(page: number, search = ''): Promise<{ items: Contribuinte[]; total: number }> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '100',
      search,
    });
    const response = await apiFetch(`/api/contribuintes?${query}`);
    if (!response.ok) {
      throw new Error(`Não foi possível carregar os contribuintes (HTTP ${response.status}).`);
    }
    const result = await response.json();
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total)) {
      throw new Error('A resposta do servidor para contribuintes é inválida.');
    }

    return {
      items: omitCredentialFields(result.items),
      total: result.total,
    };
  }

  public async createContributor(doc: Omit<Contribuinte, 'id' | 'dataRegistro' | 'agenteId'>): Promise<Contribuinte> {
    const response = await apiFetch('/api/contribuintes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Não foi possível cadastrar o contribuinte (HTTP ${response.status}).`);
    }
    const createdContributor = await response.json() as Contribuinte;
    this.addAuditLog('criacao', `Criado novo registro em contribuintes: ${createdContributor.nome}`);
    return createdContributor;
  }

  public async updateContributor(id: string, updates: Partial<Contribuinte>): Promise<Contribuinte> {
    const response = await apiFetch(`/api/contribuintes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Não foi possível atualizar o contribuinte (HTTP ${response.status}).`);
    }

    const updatedContributor = await response.json() as Contribuinte;
    const index = this.data.contribuintes.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.contribuintes[index] = { ...this.data.contribuintes[index], ...updatedContributor };
      this.saveToLocalStorage('contribuintes');
      this.notify('contribuintes');
    }
    return updatedContributor;
  }

  private syncAllWithServer(): Promise<void> {
    if (!this.authenticated) return Promise.resolve();
    if (this.syncInFlight) return this.syncInFlight;

    const authGeneration = this.authGeneration;
    this.lastSyncAt = Date.now();
    this.syncInFlight = (async () => {
      try {
        const res = await apiFetch('/api/sync-state');
        if (!this.authenticated || authGeneration !== this.authGeneration) return;
        if (res.ok) {
          const batch = await res.json();
          if (!this.authenticated || authGeneration !== this.authGeneration) return;
          const keys = ['usuarios', 'municipios', 'mercados', 'agentes', 'contribuintes', 'categoria_contribuintes', 'tipos_receita', 'pagamentos', 'auditoria', 'sincronizacao'];
          for (const k of keys) {
            if (Array.isArray(batch[k])) {
              this.data[k as keyof typeof this.data] = omitCredentialFields(batch[k]) as any;
              this.saveToLocalStorage(k);
              this.notify(k);
            }
          }
          if (batch.configuracoes && Object.keys(batch.configuracoes).length > 0) {
            this.data.configuracoes = batch.configuracoes;
            this.saveToLocalStorage('configuracoes');
            this.notify('configuracoes');
          }
        }
      } catch (error) {
        console.warn('Failed to synchronize application data:', error);
      }
    })().finally(() => {
      this.syncInFlight = null;
      if (this.authenticated && authGeneration !== this.authGeneration) {
        void this.syncAllWithServer();
      }
    });
    return this.syncInFlight;
  }

  // Subscribe to changes
  onSnapshot(collection: string, callback: (data: any) => void): () => void {
    if (!this.listeners[collection]) {
      this.listeners[collection] = [];
    }
    this.listeners[collection].push(callback);
    callback(JSON.parse(JSON.stringify(this.data[collection as keyof typeof this.data])));

    return () => {
      this.listeners[collection] = this.listeners[collection].filter(cb => cb !== callback);
    };
  }

  private notify(collection: string) {
    if (this.listeners[collection]) {
      const copy = JSON.parse(JSON.stringify(this.data[collection as keyof typeof this.data]));
      this.listeners[collection].forEach(callback => callback(copy));
    }
  }

  public replaceConfiguracoes(config: SystemConfig) {
    this.data.configuracoes = omitCredentialFields(config);
    this.saveToLocalStorage('configuracoes');
    this.notify('configuracoes');
  }

  // Add Item
  addDocument<K extends keyof typeof this.data>(collection: K, doc: any): any {
    const id = doc.id || `${collection.slice(0, 4)}-${Math.random().toString(36).substring(2, 11)}`;
    const newDoc = {
      id,
      ...doc,
      dataCriacao: doc.dataCriacao || new Date().toISOString(),
      ...(collection === 'contribuintes' ? {
        dataRegistro: new Date().toISOString(),
        agenteId: '',
      } : {}),
    };

    const safeDoc = omitCredentialFields(newDoc);
    if (Array.isArray(this.data[collection])) {
      (this.data[collection] as any[]).unshift(safeDoc);
      if (collection === 'contribuintes') {
        this.data.contribuintes = this.data.contribuintes
          .sort((a, b) => (Date.parse(b.dataRegistro || '') || 0) - (Date.parse(a.dataRegistro || '') || 0))
          .slice(0, 50)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }));
      }
    } else {
      this.data[collection] = safeDoc;
    }
    this.saveToLocalStorage(collection);
    this.notify(collection);

    // Persist to Postgres database asynchronously
    const path = collection === 'tipos_receita' ? 'tipos_receita' : collection;
    apiFetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDoc)
    }).catch(err => console.warn('Failed to sync insert with Postgres:', err));

    this.addAuditLog('criacao', `Criado novo registro em ${collection}: ${doc.nome || doc.id || ''}`);
    return newDoc;
  }

  // Update Item
  updateDocument<K extends keyof typeof this.data>(collection: K, id: string, updates: any) {
    let updatedDoc = null;

    if (Array.isArray(this.data[collection])) {
      const arr = this.data[collection] as any[];
      const idx = arr.findIndex(item => item.id === id);
      if (idx !== -1) {
        arr[idx] = omitCredentialFields({ ...arr[idx], ...updates, dataAtualizacao: new Date().toISOString() });
        updatedDoc = arr[idx];
      }
    } else if (collection === 'configuracoes') {
      this.data.configuracoes = omitCredentialFields({ ...this.data.configuracoes, ...updates });
      updatedDoc = this.data.configuracoes;
    }

    if (updatedDoc) {
      this.saveToLocalStorage(collection);
      this.notify(collection);

      const path = collection === 'tipos_receita' ? 'tipos_receita' : collection;
      const url = collection === 'configuracoes' ? `/api/configuracoes` : `/api/${path}/${id}`;
      apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }).catch(err => console.warn('Failed to sync update with Postgres:', err));
    }

    if (collection === 'configuracoes') {
      this.addAuditLog('alteracao', `Atualizadas as configurações do sistema`);
    } else {
      this.addAuditLog('alteracao', `Atualizado registro id ${id} na coleção ${collection}`);
    }

    return updatedDoc;
  }

  // Delete Item
  deleteDocument<K extends keyof typeof this.data>(collection: K, id: string, user: string = 'admin@receita360.gw', perfil: string = 'Super Administrador') {
    let deletedDoc = null;

    if (Array.isArray(this.data[collection])) {
      const arr = this.data[collection] as any[];
      const idx = arr.findIndex(item => item.id === id);
      if (idx !== -1) {
        deletedDoc = arr[idx];
        arr.splice(idx, 1);
        this.saveToLocalStorage(collection);
        this.notify(collection);

        const path = collection === 'tipos_receita' ? 'tipos_receita' : collection;
        apiFetch(`/api/${path}/${id}`, {
          method: 'DELETE'
        }).catch(err => console.warn('Failed to sync delete with Postgres:', err));
      }
    }

    if (deletedDoc) {
      const name = deletedDoc.nome || deletedDoc.descricao || deletedDoc.reciboId || deletedDoc.id;
      this.addAuditLog('exclusao', `Excluído registro de ${collection}: ${name}`, user, perfil);
    }

    return deletedDoc;
  }

  // Clear level-specific data or all operational data
  async clearLevelData(level: 'pagamentos' | 'despesas' | 'agentes' | 'contribuintes' | 'mercados' | 'municipios' | 'tipos_receita' | 'auditoria' | 'all', user: string = 'admin@receita360.gw', perfil: string = 'Super Administrador') {
    if (level === 'despesas') {
      localStorage.removeItem('receita360_despesas');
      this.addAuditLog('exclusao', 'Limpeza completa de despesas operacionais realizada', user, perfil);
      return;
    }

    if (level === 'pagamentos') {
      this.data.pagamentos = [];
      this.saveToLocalStorage('pagamentos');
      this.notify('pagamentos');
      try {
        await apiFetch('/api/pagamentos/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete pagamentos:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza completa de cobranças e arrecadações realizada', user, perfil);
      return;
    }

    if (level === 'agentes') {
      this.data.agentes = [];
      this.saveToLocalStorage('agentes');
      this.notify('agentes');
      try {
        await apiFetch('/api/agentes/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete agentes:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza completa do cadastro de agentes realizada', user, perfil);
      return;
    }

    if (level === 'contribuintes') {
      this.data.contribuintes = [];
      this.saveToLocalStorage('contribuintes');
      this.notify('contribuintes');
      try {
        await apiFetch('/api/contribuintes/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete contribuintes:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza completa do cadastro de contribuintes realizada', user, perfil);
      return;
    }

    if (level === 'mercados') {
      this.data.mercados = [];
      this.saveToLocalStorage('mercados');
      this.notify('mercados');
      try {
        await apiFetch('/api/mercados/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete mercados:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza completa de mercados e feiras realizada', user, perfil);
      return;
    }

    if (level === 'municipios') {
      this.data.municipios = [];
      this.saveToLocalStorage('municipios');
      this.notify('municipios');
      try {
        await apiFetch('/api/municipios/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete municipios:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza completa de municípios realizada', user, perfil);
      return;
    }

    if (level === 'tipos_receita') {
      this.data.tipos_receita = [];
      this.saveToLocalStorage('tipos_receita');
      this.notify('tipos_receita');
      try {
        await apiFetch('/api/tipos_receita/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete tipos_receita:', err);
      }
      this.addAuditLog('exclusao', 'Limpeza de taxas e tipos de receita realizada', user, perfil);
      return;
    }

    if (level === 'auditoria') {
      this.data.auditoria = [];
      this.saveToLocalStorage('auditoria');
      this.notify('auditoria');
      try {
        await apiFetch('/api/auditoria/all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to delete auditoria:', err);
      }
      return;
    }

    if (level === 'all') {
      this.data.pagamentos = [];
      this.data.contribuintes = [];
      this.data.agentes = [];
      this.data.mercados = [];
      this.data.auditoria = [];
      this.saveToLocalStorage('pagamentos');
      this.saveToLocalStorage('contribuintes');
      this.saveToLocalStorage('agentes');
      this.saveToLocalStorage('mercados');
      this.saveToLocalStorage('auditoria');
      localStorage.removeItem('receita360_despesas');
      this.notify('pagamentos');
      this.notify('contribuintes');
      this.notify('agentes');
      this.notify('mercados');
      this.notify('auditoria');

      try {
        await apiFetch('/api/reset-all', { method: 'DELETE' });
      } catch (err) {
        console.warn('Failed to reset all database data:', err);
      }
      this.addAuditLog('exclusao', 'ZERAMENTO E REINICIALIZAÇÃO TOTAL DA BASE DE DADOS OPERACIONAL', user, perfil);
      return;
    }
  }

  // Clear all payments and receipts
  async clearAllPagamentos(user: string = 'admin@receita360.gw', perfil: string = 'Super Administrador') {
    this.data.pagamentos = [];
    this.saveToLocalStorage('pagamentos');
    this.notify('pagamentos');

    try {
      await apiFetch('/api/pagamentos/all', { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to sync delete all pagamentos with database:', err);
    }

    this.addAuditLog('exclusao', 'Limpeza completa de todos os pagamentos e recibos de simulação realizada', user, perfil);
  }

  // Real-time Database Connection Verification
  async checkConnection(): Promise<{
    status: 'conectado' | 'erro_conexao';
    success: boolean;
    latencyMs: number;
    database?: {
      name: string;
      user: string;
      serverTime: string;
      version: string;
      engine: string;
      ssl: boolean;
    };
    counts?: Record<string, number>;
    error?: string;
    checkedAt: string;
  }> {
    const startTime = Date.now();
    try {
      const res = await apiFetch('/api/connection-status');
      if (res.ok) {
        return await res.json();
      }
      const errText = await res.text();
      return {
        status: 'erro_conexao',
        success: false,
        latencyMs: Date.now() - startTime,
        error: `HTTP ${res.status}: ${errText}`,
        checkedAt: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        status: 'erro_conexao',
        success: false,
        latencyMs: Date.now() - startTime,
        error: err?.message || 'Falha na comunicação de rede com o servidor de banco de dados',
        checkedAt: new Date().toISOString()
      };
    }
  }

  // Force immediate synchronization with server
  async forceSync(): Promise<void> {
    await this.syncAllWithServer();
  }

  // Add Audit log from actions
  addAuditLog(acao: AuditoriaLog['acao'], descricao: string, user: string = 'admin@receita360.gw', perfil: string = 'Super Administrador') {
    const log: AuditoriaLog = {
      id: `aud-${Math.random().toString(36).substring(2, 11)}`,
      usuario: user,
      perfil: perfil,
      data: new Date().toISOString().split('T')[0],
      hora: new Date().toLocaleTimeString('pt-PT'),
      ip: '182.16.1.45',
      dispositivo: 'Painel Web Admin / Simulator',
      acao,
      descricao
    };

    this.data.auditoria.unshift(log);
    this.saveToLocalStorage('auditoria');
    this.notify('auditoria');

    apiFetch('/api/auditoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    }).catch(err => console.warn('Failed to sync audit log with Postgres:', err));
  }
}

export const dbService = new PostgresSyncEngine();
