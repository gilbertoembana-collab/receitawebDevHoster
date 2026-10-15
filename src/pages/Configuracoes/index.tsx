import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { dbService } from '../../services/db';
import { Dispositivo } from '../../types';
import FormattedCurrencyInput from '../../components/FormattedCurrencyInput';
import { apiFetch } from '../../services/api';
import { 
  Settings, Image, Database, Radio, Trash2, ShieldAlert, 
  Users, ShoppingBag, Landmark, Coins, Receipt, AlertTriangle, 
  RefreshCw, Layers, FileSpreadsheet, Smartphone, Key, Wifi, 
  QrCode, Lock, Unlock, PlusCircle, RotateCw, Printer, BatteryCharging, 
  CheckCircle2, ShieldCheck, Target, Upload
} from 'lucide-react';
import { 
  Box, Typography, Card, CardContent, TextField, Button, Switch, Alert,
  FormControl, Select, MenuItem, InputLabel, FormControlLabel, Divider, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, IconButton, LinearProgress, CircularProgress
} from '@mui/material';

const RESTORE_STEPS = [
  'A receber e validar o ficheiro',
  'A verificar a ligação, a base de dados e as permissões',
  'A verificar a estrutura do backup',
  'A criar o backup de segurança dos dados atuais',
  'A aplicar o backup na base de dados',
];
const RESTORE_FAILED_STEP_INDEX: Record<string, number> = {
  'Validação do ficheiro': 0,
  'Verificação da base de dados': 1,
  'Validação da estrutura do backup': 2,
  'Criação do backup de segurança': 3,
  'Aplicação do backup': 4,
  Finalização: 4,
};

export default function Configuracoes() {
  const { 
    configuracoes, saveConfiguracoes, addNotification, currentUser, activeProfile,
    pagamentos, agentes, mercados, contribuintes, municipios, tiposReceita, auditoriaLogs
  } = useAppStore();

  // Check if user has Owner / Super Admin privilege
  const isOwner = ['Platform Owner', 'Super Administrador', 'Super Admin', 'Administrator'].includes(activeProfile);

  const isInitializedRef = React.useRef(false);

  // Local state for fields
  const [nomeMunicipio, setNomeMunicipio] = useState(configuracoes.nomeMunicipio);
  const [moeda, setMoeda] = useState(configuracoes.moeda);
  const [fusoHorario, setFusoHorario] = useState(configuracoes.fusoHorario);
  const [notificacoesHabilitadas, setNotificacoesHabilitadas] = useState(configuracoes.notificacoesHabilitadas);
  const [taxaComissao, setTaxaComissao] = useState(configuracoes.taxaComissao ?? 10);
  const [logoCamara, setLogoCamara] = useState(configuracoes.logoCamara || '');
  const [metaDiariaAgente, setMetaDiariaAgente] = useState(configuracoes.metaDiariaAgente ?? 10000);
  const [metaDiariaSalva, setMetaDiariaSalva] = useState(configuracoes.metaDiariaAgente ?? 10000);
  const [percentualIncentivo, setPercentualIncentivo] = useState(configuracoes.percentualIncentivo ?? 5);

  // Local state for Device / POS Owner Settings
  const [modoOfflineHoras, setModoOfflineHoras] = useState(configuracoes.modoOfflineHoras ?? 24);
  const [geofencingAtivo, setGeofencingAtivo] = useState(configuracoes.geofencingAtivo ?? true);
  const [limiteDiarioColetaPorAgente, setLimiteDiarioColetaPorAgente] = useState(configuracoes.limiteDiarioColetaPorAgente ?? 500000);
  const [imprimirLogoRecibo, setImprimirLogoRecibo] = useState(configuracoes.imprimirLogoRecibo ?? true);
  const [textoRodapeRecibo, setTextoRodapeRecibo] = useState(configuracoes.textoRodapeRecibo || 'Obrigado por contribuir com o desenvolvimento do Município.');
  const [versaoMinimaApp, setVersaoMinimaApp] = useState(configuracoes.versaoMinimaApp || '2.4.0');
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>(configuracoes.dispositivos || []);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [safetyBackupId, setSafetyBackupId] = useState('');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restoreStages, setRestoreStages] = useState<string[]>([]);
  const [restoreCompletedStages, setRestoreCompletedStages] = useState<string[]>([]);
  const [restoreStatusWarning, setRestoreStatusWarning] = useState('');
  const [restoreFailedStage, setRestoreFailedStage] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');

  // Modal State for New Device Registration
  const [openDeviceModal, setOpenDeviceModal] = useState(false);
  const [devCodigo, setDevCodigo] = useState('');
  const [devNome, setDevNome] = useState('');
  const [devImeiUuid, setDevImeiUuid] = useState('');
  const [devAgenteId, setDevAgenteId] = useState('');
  const [devMunicipioId, setDevMunicipioId] = useState('');
  const [devModelo, setDevModelo] = useState('Sunmi V2 Pro (Android 11)');
  const [devImpressoraTermica, setDevImpressoraTermica] = useState(true);
  const [deviceFormErrors, setDeviceFormErrors] = useState<{
    codigo?: string;
    nome?: string;
    imeiUuid?: string;
  }>({});

  // Modal State for QR Code Activation
  const [openQrModal, setOpenQrModal] = useState(false);
  const [selectedDeviceForQr, setSelectedDeviceForQr] = useState<Dispositivo | null>(null);

  // State for Despesas count
  const [despesasCount, setDespesasCount] = useState<number>(0);

  // Real Database Connection Diagnostics State
  const [connectionDiagnostics, setConnectionDiagnostics] = useState<{
    status: 'conectado' | 'erro_conexao' | 'verificando';
    success?: boolean;
    latencyMs?: number;
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
    checkedAt?: string;
  }>({
    status: 'verificando'
  });
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const runConnectionCheck = async () => {
    setIsCheckingConnection(true);
    try {
      const result = await dbService.checkConnection();
      setConnectionDiagnostics(result);
    } catch (err: any) {
      setConnectionDiagnostics({
        status: 'erro_conexao',
        success: false,
        error: err?.message || 'Erro ao conectar ao banco de dados',
        checkedAt: new Date().toISOString()
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };

  useEffect(() => {
    if (isOwner) void runConnectionCheck();
  }, [isOwner]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('receita360_despesas');
      const parsed = stored ? JSON.parse(stored) : [];
      setDespesasCount(parsed.length);
    } catch {
      setDespesasCount(0);
    }
  }, [pagamentos]);

  // Dialog state for Granular Reset Confirmation
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [targetLevel, setTargetLevel] = useState<'pagamentos' | 'despesas' | 'agentes' | 'contribuintes' | 'mercados' | 'municipios' | 'tipos_receita' | 'auditoria' | 'all' | null>(null);
  const [targetLabel, setTargetLabel] = useState('');

  // Synchronize state with store values (e.g. after async load)
  useEffect(() => {
    if (configuracoes) {
      const savedMeta = configuracoes.metaDiariaAgente ?? 10000;
      setMetaDiariaSalva(savedMeta);

      if (!isInitializedRef.current) {
        setNomeMunicipio(configuracoes.nomeMunicipio || '');
        setMoeda(configuracoes.moeda || 'FCFA');
        setFusoHorario(configuracoes.fusoHorario || 'GMT-0');
        setNotificacoesHabilitadas(!!configuracoes.notificacoesHabilitadas);
        setTaxaComissao(configuracoes.taxaComissao ?? 10);
        setLogoCamara(configuracoes.logoCamara || '');
        setMetaDiariaAgente(savedMeta);
        setPercentualIncentivo(configuracoes.percentualIncentivo ?? 5);

        setModoOfflineHoras(configuracoes.modoOfflineHoras ?? 24);
        setGeofencingAtivo(configuracoes.geofencingAtivo ?? true);
        setLimiteDiarioColetaPorAgente(configuracoes.limiteDiarioColetaPorAgente ?? 500000);
        setImprimirLogoRecibo(configuracoes.imprimirLogoRecibo ?? true);
        setTextoRodapeRecibo(configuracoes.textoRodapeRecibo || 'Obrigado por contribuir com o desenvolvimento do Município.');
        setVersaoMinimaApp(configuracoes.versaoMinimaApp || '2.4.0');
        setDispositivos(configuracoes.dispositivos || []);
        isInitializedRef.current = true;
      }
    }
  }, [configuracoes]);

  const handleSaveDeviceConfig = async () => {
    try {
      await saveConfiguracoes({
        modoOfflineHoras: Number(modoOfflineHoras),
        geofencingAtivo,
        limiteDiarioColetaPorAgente: Number(limiteDiarioColetaPorAgente),
        imprimirLogoRecibo,
        textoRodapeRecibo,
        versaoMinimaApp,
        dispositivos
      });

      addNotification({
        title: 'Configurações de Dispositivos Salvas',
        message: 'As configurações dos dispositivos foram guardadas no PostgreSQL.',
        type: 'success'
      });
    } catch (error) {
      addNotification({
        title: 'Erro ao Guardar',
        message: error instanceof Error ? error.message : 'Não foi possível guardar as configurações dos dispositivos.',
        type: 'warning'
      });
    }
  };

  const persistDevices = async (updated: Dispositivo[], successTitle: string, successMessage: string) => {
    try {
      await saveConfiguracoes({ dispositivos: updated });
      setDispositivos(updated);
      addNotification({ title: successTitle, message: successMessage, type: 'success' });
      return true;
    } catch (error) {
      addNotification({
        title: 'Erro ao Guardar Dispositivos',
        message: error instanceof Error ? error.message : 'Não foi possível guardar os dispositivos.',
        type: 'warning'
      });
      return false;
    }
  };

  const handleToggleDeviceStatus = async (devId: string) => {
    const updated = dispositivos.map(d => {
      if (d.id === devId) {
        const newStatus = d.status === 'ativo' ? 'bloqueado' : 'ativo';
        return { ...d, status: newStatus as 'ativo' | 'bloqueado' };
      }
      return d;
    });

    const target = dispositivos.find(d => d.id === devId);
    await persistDevices(
      updated,
      'Status de Dispositivo Alterado',
      `O dispositivo ${target?.codigo} foi ${target?.status === 'ativo' ? 'bloqueado' : 'desbloqueado'}.`,
    );
  };

  const handleForceSyncDevice = async (devId: string) => {
    const nowIso = new Date().toISOString();
    const updated = dispositivos.map(d => {
      if (d.id === devId) {
        return { ...d, status: 'ativo' as const, ultimaSincronizacao: nowIso };
      }
      return d;
    });

    const target = dispositivos.find(d => d.id === devId);
    await persistDevices(
      updated,
      'Registo Atualizado',
      `A data de sincronização do terminal ${target?.codigo} foi atualizada. Não foi enviado um sinal ao dispositivo.`,
    );
  };

  const handleDeleteDevice = async (devId: string) => {
    if (!confirm('Deseja realmente remover este dispositivo autorizador do sistema?')) return;
    const updated = dispositivos.filter(d => d.id !== devId);
    await persistDevices(updated, 'Dispositivo Desvinculado', 'O terminal móvel foi removido.');
  };

  const handleAddDeviceSubmit = async () => {
    const validationErrors: typeof deviceFormErrors = {};
    if (!devCodigo.trim()) validationErrors.codigo = 'Informe o código do terminal.';
    if (!devNome.trim()) validationErrors.nome = 'Informe o nome do aparelho.';
    if (!devImeiUuid.trim()) validationErrors.imeiUuid = 'Informe o IMEI/UUID do aparelho.';
    setDeviceFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      addNotification({
        title: 'Verifique os campos obrigatórios',
        message: 'Corrija os campos assinalados a vermelho antes de autorizar o dispositivo.',
        type: 'warning',
      });
      return;
    }

    const ag = agentes.find(a => a.id === devAgenteId);
    const mun = municipios.find(m => m.id === devMunicipioId);

    const newDev: Dispositivo = {
      id: `dev-${Date.now()}`,
      codigo: devCodigo.trim(),
      nome: devNome.trim(),
      imeiUuid: devImeiUuid.trim(),
      agenteId: devAgenteId,
      agenteNome: ag ? ag.nome : 'Sem Agente Fixo',
      municipioId: devMunicipioId || ag?.municipioId,
      municipioNome: mun ? mun.nome : 'Município Geral',
      modelo: devModelo,
      impressoraTermica: devImpressoraTermica,
      bateria: 100,
      versaoApp: versaoMinimaApp || 'v2.4.1',
      status: 'ativo',
      ultimaSincronizacao: new Date().toISOString(),
      dataAtivacao: new Date().toISOString().split('T')[0]
    };

    const updated = [...dispositivos, newDev];
    const saved = await persistDevices(
      updated,
      'Dispositivo Registado',
      `O terminal ${devCodigo} foi registado.`,
    );
    if (!saved) return;

    setOpenDeviceModal(false);
    setDevCodigo('');
    setDevNome('');
    setDevImeiUuid('');
    setDevAgenteId('');
    setDevMunicipioId('');
    setDeviceFormErrors({});
  };

  const handleOpenResetModal = (level: 'pagamentos' | 'despesas' | 'agentes' | 'contribuintes' | 'mercados' | 'municipios' | 'tipos_receita' | 'auditoria' | 'all', label: string) => {
    setTargetLevel(level);
    setTargetLabel(label);
    setResetDialogOpen(true);
  };

  const handleConfirmReset = async () => {
    if (!targetLevel) return;

    await dbService.clearLevelData(targetLevel, currentUser?.nome || currentUser?.email || 'Platform Owner', activeProfile);

    addNotification({
      title: 'Limpeza de Dados Executada',
      message: `Os dados referentes a "${targetLabel}" foram zerados com sucesso na base de dados.`,
      type: 'success'
    });

    if (targetLevel === 'despesas') {
      setDespesasCount(0);
    }

    setResetDialogOpen(false);
    setTargetLevel(null);
    setTargetLabel('');

    alert(`Limpeza concluída com sucesso para: ${targetLabel}`);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        addNotification({
          title: 'Erro no Upload',
          message: 'A imagem é muito grande. O tamanho máximo permitido é de 1MB.',
          type: 'warning'
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setLogoCamara(base64String);
        addNotification({
          title: 'Imagem Carregada',
          message: 'O logo foi carregado com sucesso. Clique em "Salvar Alterações" para persistir.',
          type: 'success'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleValidarMeta = async () => {
    const novoValor = Number(metaDiariaAgente);
    if (isNaN(novoValor) || novoValor <= 0) {
      addNotification({
        title: 'Valor Inválido',
        message: 'Por favor, insira um valor numérico válido e maior que zero para a meta diária.',
        type: 'warning'
      });
      return;
    }

    const antigoValor = metaDiariaSalva;
    
    try {
      await saveConfiguracoes({ metaDiariaAgente: novoValor });
      setMetaDiariaSalva(novoValor);
      addNotification({
        title: 'Meta Diária Atualizada',
        message: `Meta alterada de ${antigoValor.toLocaleString('pt-PT')} ${moeda} para ${novoValor.toLocaleString('pt-PT')} ${moeda}.`,
        type: 'success'
      });
    } catch (error) {
      addNotification({
        title: 'Erro ao Guardar Meta',
        message: error instanceof Error ? error.message : 'Não foi possível guardar a meta diária.',
        type: 'warning'
      });
    }
  };

  const handleSaveMunicipais = async () => {
    const novoValorMeta = Number(metaDiariaAgente);
    try {
      await saveConfiguracoes({
        nomeMunicipio,
        moeda,
        fusoHorario,
        taxaComissao: Number(taxaComissao),
        logoCamara,
        metaDiariaAgente: novoValorMeta,
        percentualIncentivo: Number(percentualIncentivo)
      });

      setMetaDiariaSalva(novoValorMeta);
      addNotification({
        title: 'Parâmetros Municipais Salvos',
        message: `Os parâmetros municipais para ${nomeMunicipio || 'o município'} foram guardados no PostgreSQL.`,
        type: 'success'
      });
    } catch (error) {
      addNotification({
        title: 'Erro ao Guardar',
        message: error instanceof Error ? error.message : 'Não foi possível guardar os parâmetros municipais.',
        type: 'warning'
      });
    }
  };

  const handleSaveSeguranca = async () => {
    setSecurityMessage('');
    try {
      await saveConfiguracoes({ notificacoesHabilitadas });
      setSecurityMessage('Preferência de notificações guardada.');
      addNotification({
        title: 'Preferência Guardada',
        message: 'A preferência de notificações dentro do sistema foi guardada.',
        type: 'success'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível guardar a preferência de notificações.';
      setSecurityMessage(errorMessage);
      addNotification({
        title: 'Erro ao Guardar',
        message: errorMessage,
        type: 'warning'
      });
    }
  };

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    setBackupMessage('A gerar a cópia de segurança do PostgreSQL...');
    try {
      const response = await apiFetch('/api/admin/backup');
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível gerar a cópia de segurança.');
      }

      const backup = await response.blob();
      if (!backup.size) throw new Error('O servidor devolveu um ficheiro de backup vazio.');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const objectUrl = URL.createObjectURL(backup);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = `receita360-postgresql-${timestamp}.dump`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      const successMessage = 'Backup PostgreSQL descarregado. Guarde o ficheiro num local seguro.';
      setBackupMessage(successMessage);
      addNotification({
        title: 'Backup Descarregado',
        message: successMessage,
        type: 'success'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível gerar a cópia de segurança.';
      setBackupMessage(`Falha no backup: ${errorMessage}`);
      addNotification({
        title: 'Falha no Backup',
        message: errorMessage,
        type: 'warning'
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile || restoreConfirmation !== 'RESTAURAR') return;
    const operationId = crypto.randomUUID();
    setIsRestoring(true);
    setRestoreMessage('A iniciar verificação do ficheiro...');
    setRestoreStages([]);
    setRestoreCompletedStages([]);
    setRestoreStatusWarning('');
    setRestoreFailedStage('');
    const statusInterval = window.setInterval(async () => {
      try {
        const statusResponse = await apiFetch(`/api/admin/restore/status/${operationId}`);
        if (!statusResponse.ok) {
          throw new Error(`HTTP ${statusResponse.status}`);
        }
        const status = await statusResponse.json();
        if (typeof status.stage === 'string') setRestoreMessage(status.stage);
        if (Array.isArray(status.completedStages)) setRestoreCompletedStages(status.completedStages);
        if (typeof status.error === 'string') setRestoreStatusWarning(status.error);
      } catch (error) {
        setRestoreStatusWarning(
          error instanceof Error ? `Não foi possível consultar o progresso: ${error.message}` : 'Não foi possível consultar o progresso.',
        );
      }
    }, 800);
    try {
      const response = await apiFetch('/api/admin/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Backup-Filename': restoreFile.name,
          'X-Restore-Operation-Id': operationId,
        },
        body: restoreFile,
      });
      const result = await response.json().catch(() => null);
      if (typeof result?.safetyBackupId === 'string') setSafetyBackupId(result.safetyBackupId);
      if (Array.isArray(result?.stages)) setRestoreStages(result.stages);
      if (Array.isArray(result?.completedStages)) setRestoreCompletedStages(result.completedStages);
      if (!response.ok) {
        if (typeof result?.stage === 'string') setRestoreFailedStage(result.stage);
        const errorMessage = typeof result?.error === 'string' ? result.error : 'Não foi possível restaurar a cópia.';
        throw new Error(errorMessage);
      }

      setRestoreMessage(result.message || 'Restauro concluído.');
      setRestoreCompletedStages(Array.isArray(result.stages) ? result.stages : []);
      setBackupMessage('Restauro concluído. Descarregue e guarde o backup de segurança.');
      setRestoreDialogOpen(false);
      setRestoreFile(null);
      setRestoreConfirmation('');
      addNotification({
        title: 'Restauro Concluído',
        message: 'A base de dados foi restaurada. Foi criado um backup de segurança anterior ao restauro.',
        type: 'success',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível restaurar a cópia.';
      setRestoreMessage(`Falha no restauro — ${errorMessage}`);
      addNotification({
        title: 'Falha no Restauro',
        message: errorMessage,
        type: 'warning',
      });
    } finally {
      window.clearInterval(statusInterval);
      setIsRestoring(false);
    }
  };

  const handleDownloadSafetyBackup = async () => {
    if (!safetyBackupId) return;
    try {
      const response = await apiFetch(`/api/admin/restore-safety/${safetyBackupId}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível descarregar o backup de segurança.');
      }
      const backup = await response.blob();
      if (!backup.size) throw new Error('O servidor devolveu um backup de segurança vazio.');
      const objectUrl = URL.createObjectURL(backup);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = `receita360-pre-restauro-${safetyBackupId}.dump`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      addNotification({
        title: 'Falha no Download',
        message: error instanceof Error ? error.message : 'Não foi possível descarregar o backup de segurança.',
        type: 'warning',
      });
    }
  };

  if (!isOwner) {
    return (
      <Box sx={{ py: 2 }}>
        <Alert severity="error">Não tem permissões para aceder às configurações globais do sistema.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h1">Configurações Gerais do Sistema</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Personalização de layout institucional, moedas de arrecadação, terminais móveis e segurança do servidor
        </Typography>
      </Box>

      {/* Pure Tailwind CSS responsive grid structure for perfect compilation */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Institutional Settings */}
        <div className="md:col-span-7">
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
                <Settings className="text-blue-600" size={20} />
                <Typography variant="h4">Parâmetros Municipais</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  required
                  label="Nome do Ente Público (Município)"
                  fullWidth
                  size="small"
                  value={nomeMunicipio}
                  onChange={(e) => setNomeMunicipio(e.target.value)}
                  id="config-field-municipio"
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="moeda-label">Moeda Padrão</InputLabel>
                    <Select
                      labelId="moeda-label"
                      value={moeda}
                      label="Moeda Padrão"
                      onChange={(e) => setMoeda(e.target.value)}
                      id="config-field-moeda"
                    >
                      <MenuItem value="FCFA">Franco CFA (FCFA)</MenuItem>
                      <MenuItem value="R$">Real (R$)</MenuItem>
                      <MenuItem value="USD">Dólar Americano ($)</MenuItem>
                      <MenuItem value="EUR">Euro (€)</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel id="tz-label">Fuso Horário</InputLabel>
                    <Select
                      labelId="tz-label"
                      value={fusoHorario}
                      label="Fuso Horário"
                      onChange={(e) => setFusoHorario(e.target.value)}
                      id="config-field-tz"
                    >
                      <MenuItem value="GMT-0">GMT -0 (Bissau/Gabu)</MenuItem>
                      <MenuItem value="GMT-3">GMT -3 (Brasília)</MenuItem>
                      <MenuItem value="GMT+1">GMT +1 (Europa Central)</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <TextField
                  required
                  label="Percentual de Recuperação/Comissão por Taxa (%)"
                  type="number"
                  fullWidth
                  size="small"
                  value={taxaComissao}
                  onChange={(e) => setTaxaComissao(Math.max(0, Math.min(100, Number(e.target.value))))}
                  helperText="Define a taxa percentual aplicada sobre o valor de cada cobrança efetuada para calcular o valor a ser recuperado pelo cliente."
                  id="config-field-comissao"
                />

                {/* Seção de Meta Diária e Incentivos com Validação Explícita */}
                <Box 
                  sx={{ 
                    p: 2.5, 
                    bgcolor: 'background.default', 
                    borderRadius: 3, 
                    border: '1px solid', 
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2.5
                  }}
                  id="section-meta-diaria-admin"
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Target size={18} className="text-blue-600" />
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        Meta Diária de Cobrança por Agente
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span className="text-[11px] text-slate-500 font-medium">Meta Atual em Vigor:</span>
                      <Chip 
                        size="small" 
                        label={`${metaDiariaSalva.toLocaleString('pt-PT')} ${moeda}`} 
                        color="primary" 
                        sx={{ fontWeight: 800, fontFamily: 'monospace' }} 
                      />
                    </Box>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <FormattedCurrencyInput
                          required
                          label="Digitar Nova Meta"
                          currencySymbol={moeda}
                          fullWidth
                          size="small"
                          value={metaDiariaAgente}
                          onChange={(val) => setMetaDiariaAgente(val)}
                          onValidate={handleValidarMeta}
                          id="config-field-meta-diaria"
                          helperText="Digite o valor e clique em Validar Meta (ou pressione Enter)."
                        />
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleValidarMeta}
                          disabled={!metaDiariaAgente || metaDiariaAgente <= 0}
                          sx={{ height: 40, textTransform: 'none', fontWeight: 700, px: 2, whiteSpace: 'nowrap' }}
                          id="btn-validar-meta"
                        >
                          Validar Meta
                        </Button>
                      </Box>
                    </Box>

                    <TextField
                      required
                      label="Incentivo de Cobrança por Agente (%)"
                      type="number"
                      fullWidth
                      size="small"
                      value={percentualIncentivo}
                      onChange={(e) => setPercentualIncentivo(Math.max(0, Math.min(100, Number(e.target.value))))}
                      id="config-field-incentivo"
                      helperText="Percentual de incentivo/bônus calculado por arrecadação."
                    />
                  </Box>
                </Box>

                <Box sx={{ p: 2, bg: 'slate-100', borderRadius: 2, border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: 2 }} className="dark:bg-slate-900/40 dark:border-slate-800">
                  <Typography variant="h5" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Image size={15} /> Logo da Câmara / Brasão
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Formato ideal PNG transparente de até 1MB para visualização e impressão térmica.
                  </Typography>

                  {logoCamara && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', width: 'fit-content' }}>
                      <img 
                        src={logoCamara} 
                        alt="Logo Câmara" 
                        style={{ maxHeight: 60, maxWidth: 120, objectFit: 'contain' }}
                      />
                      <Button 
                        size="small" 
                        color="error" 
                        variant="text" 
                        onClick={() => {
                          setLogoCamara('');
                          addNotification({
                            title: 'Logo Removido',
                            message: 'O logo foi removido temporariamente. Clique em "Salvar Alterações" para persistir.',
                            type: 'info'
                          });
                        }}
                        sx={{ textTransform: 'none' }}
                      >
                        Remover
                      </Button>
                    </Box>
                  )}

                  <Box>
                    <input
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="logo-upload-input"
                      type="file"
                      onChange={handleLogoUpload}
                    />
                    <label htmlFor="logo-upload-input">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        component="span"
                        id="btn-upload-brasao"
                        sx={{ textTransform: 'none' }}
                      >
                        Carregar Logo / Brasão
                      </Button>
                    </label>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                  <Button variant="contained" onClick={handleSaveMunicipais} id="btn-save-municipais">
                    Salvar Alterações
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Backup Preferences */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
                <Database className="text-blue-600" size={20} />
                <Typography variant="h4">Segurança e Backup de Dados</Typography>
              </Box>

              <div className="space-y-4">
                <Alert severity="info">
                  O sistema usa PostgreSQL. O backup manual descarrega um ficheiro completo. Pode restaurar um dump SQL: os dados atuais serão substituídos e será criado um backup de segurança antes da operação. O backup automático ainda não está agendado no servidor.
                </Alert>

                <Divider />

                <FormControlLabel
                  control={
                    <Switch 
                      checked={notificacoesHabilitadas} 
                      onChange={(e) => setNotificacoesHabilitadas(e.target.checked)} 
                    />
                  }
                  label={
                    <div>
                      <span className="text-xs font-semibold block">Notificações dentro do sistema</span>
                      <span className="text-[10px] text-slate-400 block">Ativar ou silenciar os alertas apresentados na plataforma. Push e e-mail não estão configurados.</span>
                    </div>
                  }
                  id="config-field-notif"
                />

                <Divider sx={{ my: 1 }} />

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<Database size={15} />}
                      onClick={handleBackupNow}
                      disabled={isBackingUp}
                      id="btn-run-backup"
                    >
                      {isBackingUp ? 'A gerar backup...' : 'Descarregar Backup PostgreSQL'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Upload size={15} />}
                      onClick={() => {
                        setRestoreMessage('');
                        setRestoreDialogOpen(true);
                      }}
                      disabled={isBackingUp || isRestoring}
                      id="btn-open-restore-backup"
                    >
                      Restaurar ficheiro dump.sql
                    </Button>
                    {backupMessage && (
                      <Typography
                        variant="caption"
                        role="status"
                        color={backupMessage.startsWith('Falha') ? 'error' : 'text.secondary'}
                      >
                        {backupMessage}
                      </Typography>
                    )}
                    {safetyBackupId && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleDownloadSafetyBackup}
                        id="btn-download-restore-safety-backup"
                      >
                        Descarregar backup de segurança
                      </Button>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    {securityMessage && (
                      <Typography
                        variant="caption"
                        role="status"
                        color={securityMessage.startsWith('Preferência') ? 'success.main' : 'error'}
                      >
                        {securityMessage}
                      </Typography>
                    )}
                    <Button variant="contained" onClick={handleSaveSeguranca} id="btn-save-settings">
                      Guardar Preferência
                    </Button>
                  </Box>
                </Box>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Integration Ecosystem Status cards */}
        <div className="md:col-span-5">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Radio className={connectionDiagnostics.status === 'conectado' ? "text-emerald-600 animate-pulse" : "text-rose-600"} size={20} />
                  <Typography variant="h4">Diagnóstico de Conexão</Typography>
                </Box>
                <Button 
                  size="small" 
                  variant="outlined" 
                  startIcon={<RefreshCw size={12} className={isCheckingConnection ? "animate-spin" : ""} />} 
                  onClick={runConnectionCheck}
                  disabled={isCheckingConnection}
                  sx={{ textTransform: 'none', fontSize: '11px', py: 0.5 }}
                >
                  {isCheckingConnection ? 'Verificando...' : 'Testar Conexão'}
                </Button>
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Monitoramento em tempo real do banco de dados oficial e integridade dos serviços sem simulações.
              </Typography>

              <div className="space-y-3">
                {/* 1. Main Database Status */}
                <Box sx={{ p: 2, bg: 'background.default', border: '1px solid', borderColor: connectionDiagnostics.status === 'conectado' ? 'success.main' : 'divider', borderRadius: 2 }} className="text-xs">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Database size={14} className="text-blue-600" />
                        {connectionDiagnostics.database?.engine || 'PostgreSQL'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        Base: <span className="font-semibold text-slate-700 dark:text-slate-300">{connectionDiagnostics.database?.name || 'cloud_sql_development_database'}</span>
                      </div>
                    </div>
                    <Chip 
                      size="small" 
                      label={connectionDiagnostics.status === 'conectado' ? 'Online' : connectionDiagnostics.status === 'verificando' ? 'Checando...' : 'Erro'} 
                      color={connectionDiagnostics.status === 'conectado' ? 'success' : connectionDiagnostics.status === 'verificando' ? 'warning' : 'error'}
                      sx={{ fontSize: '10px', fontWeight: 800, height: 20 }}
                    />
                  </div>
                  {connectionDiagnostics.latencyMs !== undefined && (
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <span>Latência de resposta: <strong className="text-emerald-600">{connectionDiagnostics.latencyMs} ms</strong></span>
                      <span>Usuário DB: <strong className="font-mono text-slate-600 dark:text-slate-400">{connectionDiagnostics.database?.user || 'ai_studio_app_user'}</strong></span>
                    </div>
                  )}
                  {connectionDiagnostics.error && (
                    <div className="text-[10px] text-red-500 mt-1.5 p-1 bg-red-50 dark:bg-red-950/30 rounded">
                      {connectionDiagnostics.error}
                    </div>
                  )}
                </Box>

                {/* 2. Real Operational Records Count */}
                <Box sx={{ p: 2, bg: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2 }} className="text-xs">
                  <div className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                    <span>Contagem Real de Registros no Banco</span>
                    <span className="text-[10px] font-normal text-slate-400">SELECT COUNT(*)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Municípios:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.municipios ?? municipios.length}</strong>
                    </div>
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Mercados:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.mercados ?? mercados.length}</strong>
                    </div>
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Agentes:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.agentes ?? agentes.length}</strong>
                    </div>
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Contribuintes:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.contribuintes ?? contribuintes.length}</strong>
                    </div>
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Taxas/Receitas:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.tipos_receita ?? tiposReceita.length}</strong>
                    </div>
                    <div className="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded">
                      <span className="text-slate-500">Pagamentos:</span>
                      <strong className="font-mono">{connectionDiagnostics.counts?.pagamentos ?? pagamentos.length}</strong>
                    </div>
                  </div>
                </Box>

                {/* 3. POS Mobile Server Status */}
                <Box sx={{ p: 2, bg: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2 }} className="flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Smartphone size={14} className="text-blue-600" />
                      API de Terminais Móveis POS
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {dispositivos.filter(d => d.status === 'ativo').length} de {dispositivos.length} terminais ativos
                    </div>
                  </div>
                  <Chip 
                    size="small" 
                    label="Operacional" 
                    color="success"
                    sx={{ fontSize: '9px', fontWeight: 700, height: 18 }}
                  />
                </Box>

                {/* 4. Local Cache Synchronization */}
                <Box sx={{ p: 2, bg: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2 }} className="flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers size={14} className="text-indigo-600" />
                      Motor de Sincronização em Background
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Poller ativo a cada 4s (garante dados reais sem recarregar a página)
                    </div>
                  </div>
                  <Chip 
                    size="small" 
                    label="Sincronizado" 
                    color="primary"
                    variant="outlined"
                    sx={{ fontSize: '9px', fontWeight: 700, height: 18 }}
                  />
                </Box>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SPECIAL OWNER SECTION: CONFIGURAÇÃO DE DISPOSITIVOS MÓVEIS (APP AGENTE & TERMINAIS POS) */}
      <Box sx={{ mt: 4 }}>
        <Card sx={{ border: isOwner ? '1px solid #0B4EA2' : undefined }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ p: 1.2, bgcolor: 'primary.50', color: 'primary.main', borderRadius: 2 }} className="dark:bg-blue-950 dark:text-blue-300">
                  <Smartphone size={24} />
                </Box>
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      Configuração de Dispositivos e Terminais Móveis (App Agente / POS)
                    </Typography>
                    {isOwner && (
                      <Chip 
                        icon={<ShieldCheck size={13} />} 
                        label="Platform Owner Privilege" 
                        color="primary" 
                        size="small" 
                        sx={{ fontSize: '10px', height: 20, fontWeight: 700 }}
                      />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Gestão centralizada de parâmetros de cobrança offline, impressoras térmicas e autorização de smartphones e máquinas POS de campo.
                  </Typography>
                </div>
              </Box>

              <Button
                variant="contained"
                color="primary"
                startIcon={<PlusCircle size={16} />}
                onClick={() => {
                  setDeviceFormErrors({});
                  setOpenDeviceModal(true);
                }}
                id="btn-add-device"
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Autorizar Novo Terminal POS
              </Button>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Part 1: Global Device Parameters */}
            <Typography variant="h5" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Key size={18} className="text-blue-600" />
              Parâmetros Globais do Aplicativo Móvel (Sincronização & Segurança)
            </Typography>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* 1. Offline Mode */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Modo Offline Máximo
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  fullWidth
                  label="Tolerância sem Conexão (Horas)"
                  value={modoOfflineHoras}
                  onChange={(e) => setModoOfflineHoras(Number(e.target.value))}
                  helperText="Após este período sem sync, o app bloqueia novas emissões até conectar."
                  id="field-modo-offline"
                />
              </Paper>

              {/* 2. Geofencing GPS */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Trava de Perímetro GPS (Geofencing)
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                    Restringe emissão de recibos apenas dentro da área do mercado atribuído.
                  </Typography>
                </div>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={geofencingAtivo} 
                      onChange={(e) => setGeofencingAtivo(e.target.checked)} 
                    />
                  }
                  label={<span className="text-xs font-semibold">{geofencingAtivo ? 'Geofencing Ativo' : 'Desativado'}</span>}
                  id="field-geofencing"
                />
              </Paper>

              {/* 3. Limite Diário de Arrecadação */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Teto Diário de Coleta em Dinheiro
                </Typography>
                <FormattedCurrencyInput
                  size="small"
                  fullWidth
                  label="Limite Diário por Agente"
                  currencySymbol={moeda}
                  value={limiteDiarioColetaPorAgente}
                  onChange={(val) => setLimiteDiarioColetaPorAgente(val)}
                  helperText="Força o recolhimento ao tesoureiro quando atingido."
                  id="field-teto-coleta"
                />
              </Paper>

              {/* 4. Versão Mínima do App */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Versão Mínima Obrigatória
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  label="Versão do App Agente"
                  value={versaoMinimaApp}
                  onChange={(e) => setVersaoMinimaApp(e.target.value)}
                  helperText="Versões inferiores serão notificadas para atualização imediata."
                  id="field-versao-minima"
                />
              </Paper>

              {/* 5. Impressão de Recibo */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Layout do Recibo Térmico POS
                </Typography>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={imprimirLogoRecibo} 
                      onChange={(e) => setImprimirLogoRecibo(e.target.checked)} 
                      size="small"
                    />
                  }
                  label={<span className="text-xs font-medium">Imprimir Brasão no topo</span>}
                  id="field-print-logo"
                />
                <TextField
                  size="small"
                  fullWidth
                  sx={{ mt: 1 }}
                  label="Rodapé do Comprovante"
                  value={textoRodapeRecibo}
                  onChange={(e) => setTextoRodapeRecibo(e.target.value)}
                  id="field-rodape-recibo"
                />
              </Paper>

            </div>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4 }}>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleSaveDeviceConfig}
                id="btn-save-device-configs"
              >
                Salvar Parâmetros dos Dispositivos
              </Button>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Part 2: Dispositivos Cadastrados Table */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Wifi size={18} className="text-emerald-600" />
                Terminais POS e Smartphones Autorizados ({dispositivos.length})
              </Typography>
              <Chip 
                label={`${dispositivos.filter(d => d.status === 'ativo').length} Ativos`} 
                color="success" 
                size="small" 
                sx={{ fontWeight: 700 }}
              />
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell>Código Terminal</TableCell>
                    <TableCell>Nome / Modelo</TableCell>
                    <TableCell>Agente / Município</TableCell>

                    <TableCell>Versão & Bateria</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Última Sync</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dispositivos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        Nenhum terminal POS cadastrado. Clique em "Autorizar Novo Terminal POS" para registrar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dispositivos.map((dev) => (
                      <TableRow key={dev.id} hover>
                        <TableCell className="font-mono font-bold text-blue-700 dark:text-blue-300">
                          {dev.codigo}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-bold block text-xs">{dev.nome}</span>
                            <span className="text-[10px] text-slate-400 block">{dev.modelo}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-semibold block text-xs">{dev.agenteNome || 'Não Atribuído'}</span>
                            <span className="text-[10px] text-slate-400 block">{dev.municipioNome || 'Geral'}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Chip label={dev.versaoApp} size="small" variant="outlined" sx={{ fontSize: '10px', height: 18 }} />
                            <span className="text-[10px] font-mono flex items-center gap-0.5 text-slate-600 dark:text-slate-300">
                              <BatteryCharging size={12} className="text-emerald-500" /> {dev.bateria}%
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Chip 
                            size="small"
                            label={dev.status === 'ativo' ? 'Ativo' : dev.status === 'bloqueado' ? 'Bloqueado' : 'Pendente Sync'}
                            color={dev.status === 'ativo' ? 'success' : dev.status === 'bloqueado' ? 'error' : 'warning'}
                            sx={{ fontSize: '10px', fontWeight: 700, height: 20 }}
                          />
                        </TableCell>

                        <TableCell className="text-xs text-slate-500 font-mono">
                          {dev.ultimaSincronizacao ? new Date(dev.ultimaSincronizacao).toLocaleString('pt-PT') : 'Nunca'}
                        </TableCell>

                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Tooltip title="Chave de Ativação / QR Code">
                              <IconButton size="small" color="primary" onClick={() => {
                                setSelectedDeviceForQr(dev);
                                setOpenQrModal(true);
                              }}>
                                <QrCode size={16} />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Forçar Sincronização Remota">
                              <IconButton size="small" color="secondary" onClick={() => handleForceSyncDevice(dev.id)}>
                                <RotateCw size={16} />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title={dev.status === 'ativo' ? 'Bloquear Dispositivo' : 'Desbloquear Dispositivo'}>
                              <IconButton size="small" color={dev.status === 'ativo' ? 'warning' : 'success'} onClick={() => handleToggleDeviceStatus(dev.id)}>
                                {dev.status === 'ativo' ? <Lock size={16} /> : <Unlock size={16} />}
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Desvincular Dispositivo">
                              <IconButton size="small" color="error" onClick={() => handleDeleteDevice(dev.id)}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      {/* Full Width Section: Granular Data Wipe Controls for Platform Owner & Admins */}
      <Box sx={{ mt: 4 }}>
        <Card sx={{ border: '1px solid', borderColor: 'error.light', bgcolor: 'background.paper' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ p: 1, bgcolor: 'error.50', borderRadius: 2 }} className="dark:bg-red-950/40">
                  <ShieldAlert className="text-red-600" size={24} />
                </Box>
                <div>
                  <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 700 }}>
                    Gestão e Zeramento Granular de Dados da Operação
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Ferramentas de redefinição para a fase piloto. Permite apagar seletivamente dados operacionais sem afetar as configurações do sistema.
                  </Typography>
                </div>
              </Box>

              <Button
                variant="contained"
                color="error"
                startIcon={<Trash2 size={16} />}
                onClick={() => handleOpenResetModal('all', 'ZERAR TUDO (Reset Total da Operação)')}
                id="btn-zerar-tudo"
                sx={{ textTransform: 'none', fontWeight: 700, px: 2.5 }}
              >
                Zerar Tudo (Reset Geral)
              </Button>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* 1. Cobranças */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Receipt size={18} className="text-emerald-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Finanças / Arrecadações</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Recibos, cobranças diárias e histórico de pagamentos.
                  </Typography>
                  <Chip 
                    label={`${pagamentos.length} Registros`} 
                    size="small" 
                    color={pagamentos.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('pagamentos', 'Cobranças e Arrecadações')}
                  id="btn-zerar-pagamentos"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Cobranças
                </Button>
              </Paper>

              {/* 2. Despesas */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Coins size={18} className="text-amber-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Despesas Operacionais</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Custos operacionais e despesas de campo.
                  </Typography>
                  <Chip 
                    label={`${despesasCount} Registros`} 
                    size="small" 
                    color={despesasCount > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('despesas', 'Despesas Operacionais')}
                  id="btn-zerar-despesas"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Despesas
                </Button>
              </Paper>

              {/* 3. Agentes */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Users size={18} className="text-blue-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Agentes Arrecadadores</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Fiscais e cobradores de feira cadastrados.
                  </Typography>
                  <Chip 
                    label={`${agentes.length} Cadastrados`} 
                    size="small" 
                    color={agentes.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('agentes', 'Agentes Arrecadadores')}
                  id="btn-zerar-agentes"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Agentes
                </Button>
              </Paper>

              {/* 4. Contribuintes */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <ShoppingBag size={18} className="text-purple-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Contribuintes / Feirantes</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Bancadeiros, comerciantes e feirantes.
                  </Typography>
                  <Chip 
                    label={`${contribuintes.length} Cadastrados`} 
                    size="small" 
                    color={contribuintes.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('contribuintes', 'Contribuintes e Feirantes')}
                  id="btn-zerar-contribuintes"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Contribuintes
                </Button>
              </Paper>

              {/* 5. Mercados */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Landmark size={18} className="text-amber-700" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Mercados e Feiras</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Estruturas e praças de cobrança municipais.
                  </Typography>
                  <Chip 
                    label={`${mercados.length} Cadastrados`} 
                    size="small" 
                    color={mercados.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('mercados', 'Mercados e Feiras')}
                  id="btn-zerar-mercados"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Mercados
                </Button>
              </Paper>

              {/* 6. Municípios */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Layers size={18} className="text-teal-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Municípios e Entes</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Divisões territoriais ativas do sistema.
                  </Typography>
                  <Chip 
                    label={`${municipios.length} Cadastrados`} 
                    size="small" 
                    color={municipios.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('municipios', 'Municípios e Entes Públicos')}
                  id="btn-zerar-municipios"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Municípios
                </Button>
              </Paper>

              {/* 7. Tipos de Receita / Taxas */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <FileSpreadsheet size={18} className="text-indigo-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Taxas e Tipos de Receita</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Valores de tarifas e tributos municipais.
                  </Typography>
                  <Chip 
                    label={`${tiposReceita.length} Taxas`} 
                    size="small" 
                    color={tiposReceita.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('tipos_receita', 'Tipos de Receita e Taxas')}
                  id="btn-zerar-taxas"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Taxas
                </Button>
              </Paper>

              {/* 8. Logs de Auditoria */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 2 }} className="hover:border-red-300 transition-colors">
                <div>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <RefreshCw size={18} className="text-slate-600" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Logs de Auditoria</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Histórico de ações e logins de acesso.
                  </Typography>
                  <Chip 
                    label={`${auditoriaLogs.length} Logs`} 
                    size="small" 
                    color={auditoriaLogs.length > 0 ? 'primary' : 'default'}
                    sx={{ mb: 2, fontSize: '11px' }}
                  />
                </div>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  startIcon={<Trash2 size={13} />}
                  onClick={() => handleOpenResetModal('auditoria', 'Logs de Auditoria e Sincronização')}
                  id="btn-zerar-auditoria"
                  sx={{ textTransform: 'none', mt: 'auto' }}
                >
                  Zerar Logs
                </Button>
              </Paper>
            </div>
          </CardContent>
        </Card>
      </Box>

      {/* DIALOG 1: CADASTRAR E AUTORIZAR DISPOSITIVO POS */}
      <Dialog
        open={openDeviceModal}
        onClose={() => setOpenDeviceModal(false)}
        maxWidth="sm"
        fullWidth
        id="dialog-novo-dispositivo"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', pt: 2.5 }}>
          <Smartphone size={22} />
          <span>Autorizar Novo Terminal Móvel / POS</span>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            Registre um novo smartphone ou impressora/máquina POS portátil e associe a um fiscal arrecadador.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              required
              label="Código do Terminal"
              size="small"
              fullWidth
              placeholder="ex: POS-BISSAU-005"
              value={devCodigo}
              onChange={(e) => {
                setDevCodigo(e.target.value);
                if (e.target.value.trim()) setDeviceFormErrors(errors => ({ ...errors, codigo: undefined }));
              }}
              error={Boolean(deviceFormErrors.codigo)}
              helperText={deviceFormErrors.codigo}
            />

            <TextField
              required
              label="Nome do Aparelho / Apelido"
              size="small"
              fullWidth
              placeholder="ex: Terminal Sunmi V2 Pro - Agente Bissau"
              value={devNome}
              onChange={(e) => {
                setDevNome(e.target.value);
                if (e.target.value.trim()) setDeviceFormErrors(errors => ({ ...errors, nome: undefined }));
              }}
              error={Boolean(deviceFormErrors.nome)}
              helperText={deviceFormErrors.nome}
            />

            <TextField
              required
              label="IMEI / UUID do Hardware"
              size="small"
              fullWidth
              placeholder="ex: 864201048291039"
              value={devImeiUuid}
              onChange={(e) => {
                setDevImeiUuid(e.target.value);
                if (e.target.value.trim()) setDeviceFormErrors(errors => ({ ...errors, imeiUuid: undefined }));
              }}
              error={Boolean(deviceFormErrors.imeiUuid)}
              helperText={deviceFormErrors.imeiUuid}
            />

            <FormControl size="small" fullWidth>
              <InputLabel id="dev-muni-label">Município Atribuído</InputLabel>
              <Select
                labelId="dev-muni-label"
                value={devMunicipioId}
                label="Município Atribuído"
                onChange={(e) => setDevMunicipioId(e.target.value)}
              >
                <MenuItem value="">Todos / Geral</MenuItem>
                {municipios.map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="dev-agente-label">Agente de Cobrança Vinculado</InputLabel>
              <Select
                labelId="dev-agente-label"
                value={devAgenteId}
                label="Agente de Cobrança Vinculado"
                onChange={(e) => setDevAgenteId(e.target.value)}
              >
                <MenuItem value="">Sem Agente Fixo (Pool do Município)</MenuItem>
                {agentes.map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.nome} (@{a.usuario})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="dev-modelo-label">Modelo do Dispositivo</InputLabel>
              <Select
                labelId="dev-modelo-label"
                value={devModelo}
                label="Modelo do Dispositivo"
                onChange={(e) => setDevModelo(e.target.value)}
              >
                <MenuItem value="Sunmi V2 Pro (Android 11)">Sunmi V2 Pro (Android 11)</MenuItem>
                <MenuItem value="Pax A920 (Android 10)">Pax A920 (Android 10)</MenuItem>
                <MenuItem value="Telpo M1 Handheld">Telpo M1 Handheld</MenuItem>
                <MenuItem value="Smartphone Android Geral">Smartphone Android Geral</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch 
                  checked={devImpressoraTermica} 
                  onChange={(e) => setDevImpressoraTermica(e.target.checked)} 
                />
              }
              label={<span className="text-xs font-semibold">Possui Impressora Térmica Bluetooth Integrada</span>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDeviceModal(false)} color="inherit" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleAddDeviceSubmit}
            startIcon={<PlusCircle size={16} />}
            id="btn-confirmar-add-device"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Autorizar Dispositivo
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG 2: QR CODE / CÓDIGO DE ATIVAÇÃO DO DISPOSITIVO */}
      <Dialog
        open={openQrModal}
        onClose={() => setOpenQrModal(false)}
        maxWidth="xs"
        fullWidth
        id="dialog-qr-dispositivo"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', pt: 2.5 }}>
          <QrCode size={22} />
          <span>Ativação de Terminal POS</span>
        </DialogTitle>
        <DialogContent dividers className="text-center">
          {selectedDeviceForQr && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1 }}>
              <div className="p-4 bg-white border-2 border-slate-900 rounded-xl shadow-inner">
                <QrCode size={160} className="text-slate-900" />
              </div>

              <div>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0B4EA2' }}>
                  {selectedDeviceForQr.codigo}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {selectedDeviceForQr.nome}
                </Typography>
              </div>

              <Paper variant="outlined" sx={{ p: 1.5, width: '100%', bgcolor: 'action.hover' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Código de Ativação Manual (App Móvel):
                </Typography>
                <Typography variant="h4" className="font-mono font-bold text-slate-900 dark:text-white tracking-widest">
                  {selectedDeviceForQr.imeiUuid.slice(-6).toUpperCase()}
                </Typography>
              </Paper>

              <Typography variant="caption" color="text.secondary">
                Abra o aplicativo <strong>Receita 360 Agente</strong> no terminal POS e escaneie o código QR acima para vincular automaticamente.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenQrModal(false)} color="primary" variant="contained" fullWidth sx={{ textTransform: 'none', fontWeight: 700 }}>
            Concluído
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={restoreDialogOpen}
        onClose={() => {
          if (!isRestoring) setRestoreDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        id="dialog-restore-backup"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={22} />
          Restaurar cópia de segurança SQL
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta operação substitui os dados atuais da base de dados. Antes de restaurar, o sistema criará um backup PostgreSQL de segurança, que poderá descarregar no final.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Selecione um dump SQL em texto (.sql) ou o backup PostgreSQL descarregado pela aplicação (.dump), com tamanho máximo de 1 GiB. O ficheiro será aplicado numa única transação; se ocorrer um erro, a operação será revertida.
          </Typography>
          <Button
            component="label"
            variant="outlined"
            startIcon={<Upload size={16} />}
            disabled={isRestoring}
            sx={{ mb: 2 }}
          >
            {restoreFile ? restoreFile.name : 'Selecionar ficheiro .sql ou .dump'}
            <input
              hidden
              type="file"
              accept=".sql,.dump,text/plain,application/sql,application/vnd.postgresql.custom"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                const supportedFile = file && /\.(sql|dump)$/i.test(file.name);
                setRestoreFile(supportedFile ? file : null);
                setRestoreMessage(file && !supportedFile
                  ? 'Selecione um ficheiro com extensão .sql ou .dump.'
                  : '');
                event.target.value = '';
              }}
            />
          </Button>
          {restoreMessage && (
            <Alert
              severity={restoreMessage.startsWith('Falha') ? 'error' : restoreMessage.startsWith('Restauro concluído') ? 'success' : 'info'}
              sx={{ mb: 2 }}
            >
              {restoreMessage}
              {restoreStages.length > 0 && (
                <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
                  {restoreStages.map((stage, index) => (
                    <li key={`${index}-${stage}`}>{stage}</li>
                  ))}
                </Box>
              )}
            </Alert>
          )}
          {(isRestoring || restoreFailedStage || restoreCompletedStages.length > 0) && (
            <Box component="ol" aria-label="Etapas da restauração" sx={{ listStyle: 'none', p: 0, mb: 2 }}>
              {RESTORE_STEPS.map((step) => {
                const failed = RESTORE_FAILED_STEP_INDEX[restoreFailedStage] === RESTORE_STEPS.indexOf(step);
                const completed = restoreCompletedStages.includes(step);
                const active = isRestoring && restoreMessage === step;
                return (
                  <Box component="li" key={step} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    {completed
                      ? <CheckCircle2 size={16} color="#16a34a" />
                      : active
                        ? <CircularProgress size={15} />
                        : failed
                          ? <AlertTriangle size={16} color="#dc2626" />
                          : <span style={{ width: 16 }} />}
                    <Typography
                      variant="body2"
                      color={failed ? 'error.main' : completed ? 'success.main' : active ? 'text.primary' : 'text.secondary'}
                    >
                      {step}
                      {failed ? ` — falhou${restoreFailedStage ? ` (${restoreFailedStage})` : ''}` : ''}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
          {restoreStatusWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>{restoreStatusWarning}</Alert>
          )}
          <TextField
            fullWidth
            size="small"
            label={'Digite RESTAURAR para confirmar'}
            value={restoreConfirmation}
            onChange={(event) => setRestoreConfirmation(event.target.value)}
            disabled={isRestoring}
            autoComplete="off"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setRestoreDialogOpen(false)}
            color="inherit"
            disabled={isRestoring}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRestoreBackup}
            disabled={isRestoring || !restoreFile || restoreConfirmation !== 'RESTAURAR'}
            startIcon={isRestoring ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />}
            id="btn-confirm-restore-backup"
          >
            {isRestoring ? 'A restaurar...' : 'Substituir dados e restaurar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Modal for Data Wipe */}
      <Dialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        id="dialog-confirmar-zeramento"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main', pt: 2.5 }}>
          <AlertTriangle size={22} />
          <span>Confirmar Zeramento de Dados</span>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            Você está prestes a apagar todos os dados de: <strong className="text-red-600">{targetLabel}</strong>.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Esta operação é irreversível e irá remover permanentemente estes registros da base de dados local e do servidor PostgreSQL.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setResetDialogOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleConfirmReset}
            startIcon={<Trash2 size={15} />}
            id="btn-confirmar-zerar"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Confirmar e Zerar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
