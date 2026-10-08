import { 
  Municipio, Mercado, Agente, Contribuinte, TipoReceita, 
  Pagamento, AuditoriaLog, SincronizacaoLog, SystemConfig, Usuario 
} from '../types';

class PostgresSyncEngine {
  private data: {
    usuarios: Usuario[];
    municipios: Municipio[];
    mercados: Mercado[];
    agentes: Agente[];
    contribuintes: Contribuinte[];
    tipos_receita: TipoReceita[];
    pagamentos: Pagamento[];
    auditoria: AuditoriaLog[];
    sincronizacao: SincronizacaoLog[];
    configuracoes: SystemConfig;
  };

  private listeners: { [collection: string]: Array<(data: any) => void> } = {};
  private currentMunicipioId: string = '';
  private currentRole: string = '';

  constructor() {
    this.data = {
      usuarios: [],
      municipios: [],
      mercados: [],
      agentes: [],
      contribuintes: [],
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
        chaveApiGlobalDispositivos: 'R360-KEY-GLOBAL-PRODUCTION',
        dispositivos: []
      }
    };

    // Load initial cached data from localStorage to ensure immediate display
    this.loadFromLocalStorage();

    // Fetch live database data on launch and periodically with smart throttling
    this.syncAllWithServer();
    setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        this.syncAllWithServer();
      }
    }, 8000);

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.syncAllWithServer());
    }
  }

  private loadFromLocalStorage() {
    const keys = Object.keys(this.data);
    keys.forEach(k => {
      try {
        const stored = localStorage.getItem(`receita360_${k}`);
        if (stored) {
          this.data[k as keyof typeof this.data] = JSON.parse(stored);
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

  public setTenantContext(municipioId: string, role: string) {
    this.currentMunicipioId = municipioId;
    this.currentRole = role;
    this.syncAllWithServer();
  }

  private async syncAllWithServer() {
    const headers: HeadersInit = {};
    if (this.currentMunicipioId) {
      headers['x-municipio-id'] = this.currentMunicipioId;
    }
    if (this.currentRole) {
      headers['x-user-role'] = this.currentRole;
    }

    try {
      const res = await fetch('/api/sync-state', { headers });
      if (res.ok) {
        const batch = await res.json();
        const keys = ['usuarios', 'municipios', 'mercados', 'agentes', 'contribuintes', 'tipos_receita', 'pagamentos', 'auditoria', 'sincronizacao'];
        for (const k of keys) {
          if (Array.isArray(batch[k])) {
            this.data[k as keyof typeof this.data] = batch[k] as any;
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
      // Silent error to prevent UI noise in dev log
    }
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

  // Add Item
  addDocument<K extends keyof typeof this.data>(collection: K, doc: any): any {
    const id = doc.id || `${collection.slice(0, 4)}-${Math.random().toString(36).substring(2, 11)}`;
    const newDoc = {
      id,
      ...doc,
      dataCriacao: doc.dataCriacao || new Date().toISOString()
    };

    if (Array.isArray(this.data[collection])) {
      (this.data[collection] as any[]).unshift(newDoc);
    } else {
      this.data[collection] = newDoc;
    }
    this.saveToLocalStorage(collection);
    this.notify(collection);

    // Persist to Postgres database asynchronously
    const path = collection === 'tipos_receita' ? 'tipos_receita' : collection;
    fetch(`/api/${path}`, {
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
        arr[idx] = { ...arr[idx], ...updates, dataAtualizacao: new Date().toISOString() };
        updatedDoc = arr[idx];
      }
    } else if (collection === 'configuracoes') {
      this.data.configuracoes = { ...this.data.configuracoes, ...updates };
      updatedDoc = this.data.configuracoes;
    }

    if (updatedDoc) {
      this.saveToLocalStorage(collection);
      this.notify(collection);

      const path = collection === 'tipos_receita' ? 'tipos_receita' : collection;
      const url = collection === 'configuracoes' ? `/api/configuracoes` : `/api/${path}/${id}`;
      fetch(url, {
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
        fetch(`/api/${path}/${id}`, {
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
        await fetch('/api/pagamentos/all', { method: 'DELETE' });
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
        await fetch('/api/agentes/all', { method: 'DELETE' });
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
        await fetch('/api/contribuintes/all', { method: 'DELETE' });
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
        await fetch('/api/mercados/all', { method: 'DELETE' });
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
        await fetch('/api/municipios/all', { method: 'DELETE' });
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
        await fetch('/api/tipos_receita/all', { method: 'DELETE' });
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
        await fetch('/api/auditoria/all', { method: 'DELETE' });
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
        await fetch('/api/reset-all', { method: 'DELETE' });
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
      await fetch('/api/pagamentos/all', { method: 'DELETE' });
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
      const res = await fetch('/api/connection-status');
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

    fetch('/api/auditoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    }).catch(err => console.warn('Failed to sync audit log with Postgres:', err));
  }
}

export const dbService = new PostgresSyncEngine();
