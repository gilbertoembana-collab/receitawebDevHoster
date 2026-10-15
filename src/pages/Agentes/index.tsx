import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Agente } from '../../types';
import { Plus, Edit2, Trash2, Search, Key, Shield, Check, X, RefreshCw, FileSpreadsheet, Printer, Copy, CheckCircle2, Target } from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, FormHelperText, Select, MenuItem,
  InputLabel, Checkbox, ListItemText, OutlinedInput, Tooltip,
  TablePagination, InputAdornment
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

const AVAILABLE_PERMISSIONS = ['Cobrar', 'Imprimir Recibo', 'Offline', 'Aprovar Isenção', 'Reemitir'];

const getAgentCode = (a: Agente) => {
  if (a.usuario.toUpperCase().startsWith('AG00')) return a.usuario.toUpperCase();
  return `AG00${a.id.slice(-4).toUpperCase()}`;
};

export default function Agentes() {
  const { 
    agentes, mercados, municipios, pagamentos, configuracoes, addAgente, updateAgente, deleteAgente, 
    activeProfile, addNotification, currentUser 
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Agente | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ nome: string; senhaTemporaria: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const allowedMercados = React.useMemo(() => {
    if (isAdmin) {
      return mercados.filter(m => m.municipioId === userMuniId);
    }
    return mercados;
  }, [mercados, isAdmin, userMuniId]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Lista de agentes de cobrança actualizada com sucesso.',
        type: 'success'
      });
    }, 600);
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [usuario, setUsuario] = useState('');
  const [mercadoId, setMercadoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [cargo, setCargo] = useState('');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [senha, setSenha] = useState('');
  const [formErrors, setFormErrors] = useState<{
    nome?: string;
    usuario?: string;
    municipioId?: string;
    mercadoId?: string;
    senha?: string;
    email?: string;
    permissoes?: string;
  }>({});

  const filtered = agentes.filter(a => {
    if (isAdmin && a.municipioId !== userMuniId) {
      return false;
    }
    return (
      a.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cargo.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormErrors({});
    setNome('');
    setTelefone('');
    setEmail('');
    setUsuario('');
    setMercadoId('');
    setMunicipioId(isAdmin ? userMuniId : '');
    setCargo('');
    setStatus('ativo');
    setPermissoes([]);
    setSenha('');
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: Agente) => {
    setEditingItem(item);
    setFormErrors({});
    setNome(item.nome);
    setTelefone(item.telefone);
    setEmail(item.email);
    setUsuario(item.usuario);
    setMercadoId(item.mercadoId);
    setMunicipioId(item.municipioId);
    setCargo(item.cargo);
    setStatus(item.status);
    setPermissoes(item.permissoes || []);
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const targetMuniId = isAdmin ? userMuniId : municipioId;
    const normalizedAgentId = editingItem
      ? usuario.trim().toUpperCase()
      : `AG00${usuario.trim().toUpperCase()}`;
    const validationErrors: typeof formErrors = {};
    if (!nome.trim()) validationErrors.nome = 'Informe o nome completo do agente.';
    if (!usuario.trim() || (!editingItem && !/^[A-Z0-9]+$/.test(usuario.trim()))) {
      validationErrors.usuario = editingItem
        ? 'Informe o usuário do terminal.'
        : 'Informe o sufixo do ID. O identificador será AG00 seguido por esse valor.';
    }
    if (!targetMuniId) validationErrors.municipioId = 'Selecione o município.';
    if (!mercadoId) validationErrors.mercadoId = 'Selecione o mercado.';
    if (permissoes.length === 0) validationErrors.permissoes = 'Selecione pelo menos uma permissão.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      validationErrors.email = 'Informe um endereço de e-mail válido.';
    }
    if (!editingItem && (senha.trim().length < 8 || senha.trim().length > 20)) {
      validationErrors.senha = 'A senha deve ter entre 8 e 20 caracteres.';
    }
    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      addNotification({
        title: 'Erro de Validação',
        message: 'Preencha os campos obrigatórios assinalados a vermelho.',
        type: 'warning'
      });
      return;
    }

    const payload: any = { 
      nome: nome.trim(), 
      telefone: telefone.trim(), 
      email: email.trim().toLowerCase(), 
      usuario: normalizedAgentId,
      mercadoId, 
      municipioId: targetMuniId, 
      cargo: cargo.trim(), 
      status, 
      permissoes,
    };

    if (!editingItem) {
      payload.senha = senha.trim();
    }

    if (editingItem) {
      updateAgente(editingItem.id, payload);
      addNotification({
        title: 'Agente Atualizado',
        message: `O agente "${nome.trim()}" foi atualizado com sucesso.`,
        type: 'success'
      });
    } else {
      try {
        await addAgente(payload);
      } catch (error) {
        addNotification({
          title: 'Impossível registar agente',
          message: error instanceof Error ? error.message : 'Não foi possível comunicar com o servidor. Tente novamente.',
          type: 'warning',
        });
        return;
      }
      addNotification({
        title: 'Agente Cadastrado',
        message: `O agente "${nome.trim()}" foi cadastrado com sucesso.`,
        type: 'success'
      });
    }
    setOpenDialog(false);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      const agenteNome = agentes.find(a => a.id === deleteId)?.nome || '';
      deleteAgente(deleteId);
      addNotification({
        title: 'Agente Removido',
        message: `O agente de cobrança "${agenteNome}" foi excluído com sucesso.`,
        type: 'warning'
      });
      setDeleteId(null);
    }
  };

  const handleResetPassword = (item: Agente) => {
    const randomBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(randomBytes);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const tempPassword = Array.from(randomBytes, byte => alphabet[byte % alphabet.length]).join('');
    updateAgente(item.id, { 
      resetSenhaPending: true,
      senhaTemporaria: tempPassword 
    });
    setCopiedPassword(false);
    
    addNotification({
      title: 'Senha Resetada',
      message: `A senha temporária do agente ${item.nome} foi gerada: ${tempPassword}. Por favor repasse ao agente.`,
      type: 'warning'
    });

    setResetPasswordInfo({
      nome: item.nome,
      senhaTemporaria: tempPassword
    });
  };

  const handleToggleStatus = (item: Agente) => {
    const nextStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    updateAgente(item.id, { status: nextStatus });
    addNotification({
      title: 'Status de Agente Alterado',
      message: `O agente ${item.nome} foi ${nextStatus === 'ativo' ? 'ativado' : 'desativado'} no sistema.`,
      type: 'info'
    });
  };

  const canEdit = [
    'Platform Owner',
    'Super Administrador', 
    'Super Admin', 
    'Administrador Municipal', 
    'Administrator', 
    'Departamento de Mercados'
  ].includes(activeProfile);

  const handleExportExcel = () => {
    const headers = ['Código de Agente', 'Nome', 'Usuário', 'Mercado', 'Município', 'Cargo', 'Meta Diária', 'Status', 'Permissões'];
    const data = filtered.map(a => {
      const merc = mercados.find(m => m.id === a.mercadoId)?.nome || 'Não definido';
      const muni = municipios.find(mu => mu.id === a.municipioId)?.nome || 'Não definido';
      const meta = (configuracoes.metaDiariaAgente ?? 100000).toLocaleString() + ' ' + configuracoes.moeda;
      return [
        getAgentCode(a),
        a.nome,
        a.usuario,
        merc,
        muni,
        a.cargo,
        meta,
        a.status === 'ativo' ? 'Ativo' : 'Inativo',
        a.permissoes.join(', ')
      ];
    });
    exportToExcel(data, headers, 'agentes');
  };

  const handlePrintPDF = () => {
    const headers = ['Código de Agente', 'Nome', 'Usuário', 'Mercado', 'Município', 'Cargo', 'Meta Diária', 'Status', 'Permissões'];
    const data = filtered.map(a => {
      const merc = mercados.find(m => m.id === a.mercadoId)?.nome || 'Não definido';
      const muni = municipios.find(mu => mu.id === a.municipioId)?.nome || 'Não definido';
      const meta = (configuracoes.metaDiariaAgente ?? 100000).toLocaleString() + ' ' + configuracoes.moeda;
      return [
        getAgentCode(a),
        a.nome,
        a.usuario,
        merc,
        muni,
        a.cargo,
        meta,
        a.status === 'ativo' ? 'Ativo' : 'Inativo',
        a.permissoes.join(', ')
      ];
    });
    printToPDF('Agentes de Fiscalização', headers, data);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h1">Gestão de Agentes de Cobrança</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Gerenciamento de coletores móveis, permissões de terminal e reset de senhas do aplicativo móvel
          </Typography>
        </div>
        {canEdit && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenAdd}
            id="btn-add-agente"
          >
            Adicionar Agente
          </Button>
        )}
      </Box>

      {/* Directory Filter Input */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar agente por nome, usuário, email..."
            className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
            id="agentes-search"
          />
        </div>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-refresh-agentes"
        >
          {isRefreshing ? 'A actualizar...' : 'Actualizar'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          startIcon={<FileSpreadsheet size={14} />}
          onClick={handleExportExcel}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
          id="btn-excel-agentes"
        >
          Exportar Excel
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<Printer size={14} />}
          onClick={handlePrintPDF}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-pdf-agentes"
        >
          Imprimir PDF
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Cód. Agente</TableCell>
              <TableCell>Foto / Usuário</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Município / Mercado</TableCell>
              <TableCell>Cargo</TableCell>
              <TableCell>Meta Diária</TableCell>
              <TableCell>Contato</TableCell>
              <TableCell>Permissões</TableCell>
              <TableCell>Status</TableCell>
              {canEdit && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 10 : 9} align="center" className="text-slate-400 py-6">
                  Nenhum agente cadastrado ou correspondente à busca.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((a) => {
                const muni = municipios.find(m => m.id === a.municipioId);
                const merc = mercados.find(m => m.id === a.mercadoId);
                const agentGoal = configuracoes.metaDiariaAgente ?? 100000;
                return (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <span className="font-mono font-bold text-xs bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 px-2.5 py-1 rounded border border-blue-200/50 dark:border-blue-500/20 shadow-2xs">
                        {getAgentCode(a)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 border">
                          {a.nome.charAt(0)}
                        </div>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {a.usuario}
                        </span>
                      </Box>
                    </TableCell>
                    <TableCell className="font-semibold">{a.nome}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">{muni?.nome || 'Sem município'}</div>
                      <div className="text-[10px] text-slate-400">{merc?.nome || 'Sem mercado'}</div>
                    </TableCell>
                    <TableCell>{a.cargo}</TableCell>
                    <TableCell>
                      <Tooltip title="Meta diária definida nas configurações do sistema" arrow>
                        <Box 
                          sx={{ 
                            cursor: 'default',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            p: '3px 8px',
                            borderRadius: '6px',
                            bgcolor: 'action.hover',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Target size={13} className="text-blue-600" />
                          <span className="font-mono font-semibold text-xs text-slate-800 dark:text-slate-200">
                            {agentGoal.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans">{configuracoes.moeda}</span>
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{a.telefone}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{a.email}</div>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 200 }}>
                        {a.permissoes?.map(p => (
                          <Chip key={p} size="small" label={p} variant="outlined" sx={{ fontSize: '9px', height: 18 }} />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={a.status === 'ativo' ? 'Ativo' : 'Inativo'} 
                        color={a.status === 'ativo' ? 'success' : 'default'}
                        onClick={() => canEdit && handleToggleStatus(a)}
                        sx={{ fontSize: 10, height: 20, cursor: canEdit ? 'pointer' : 'default' }}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Tooltip title="Resetar Senha" arrow>
                            <Button 
                              size="small" 
                              variant="outlined" 
                              onClick={() => handleResetPassword(a)}
                              sx={{ py: 0.5, px: 1, minWidth: 'auto' }}
                              id={`reset-pwd-${a.id}`}
                            >
                              <Key size={13} />
                            </Button>
                          </Tooltip>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            startIcon={<Edit2 size={13} />}
                            onClick={() => handleOpenEdit(a)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`edit-agent-${a.id}`}
                          >
                            Editar
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="error" 
                            startIcon={<Trash2 size={13} />}
                            onClick={() => handleDelete(a.id)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`delete-agent-${a.id}`}
                          >
                            Excluir
                          </Button>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filtered.length}
          rowsPerPage={rowsPerPage}
          page={currentPage}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Itens por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count !== -1 ? count : `mais de ${to}`}`}
        />
      </TableContainer>

      {/* Creation/Edition Dialog Modal */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editingItem ? 'Editar Agente de Cobrança' : 'Cadastrar Novo Agente'}</span>
          {editingItem && (
            <Chip 
              label={getAgentCode(editingItem)} 
              color="primary" 
              variant="outlined" 
              size="small" 
              sx={{ fontWeight: 'bold', fontFamily: 'monospace' }} 
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <TextField
              required
              label="Nome Completo"
              fullWidth
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (e.target.value.trim()) setFormErrors(errors => ({ ...errors, nome: undefined }));
              }}
              size="small"
              className="col-span-2"
              id="agent-field-nome"
              error={Boolean(formErrors.nome)}
              helperText={formErrors.nome}
            />
            
            <TextField
              required
              label="Usuário (Terminal ID)"
              fullWidth
              value={usuario}
              onChange={(e) => {
                const value = editingItem
                  ? e.target.value.toUpperCase()
                  : e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^AG00/, '');
                setUsuario(value);
                if (value.trim()) setFormErrors(errors => ({ ...errors, usuario: undefined }));
              }}
              size="small"
              disabled={!!editingItem}
              id="agent-field-usuario"
              error={Boolean(formErrors.usuario)}
              helperText={formErrors.usuario || (editingItem ? 'O ID do terminal não pode ser alterado.' : 'O prefixo AG00 é fixo; introduza o sufixo único do agente.')}
              slotProps={{
                input: {
                  startAdornment: editingItem ? undefined : <InputAdornment position="start">AG00</InputAdornment>,
                },
                htmlInput: { maxLength: 32 },
              }}
            />

            <TextField
              label="Cargo / Função"
              fullWidth
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              size="small"
              id="agent-field-cargo"
            />

            <TextField
              label="Telefone"
              fullWidth
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              size="small"
              id="agent-field-telefone"
            />

            <TextField
              label="E-mail Institucional"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (!e.target.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim())) {
                  setFormErrors(errors => ({ ...errors, email: undefined }));
                }
              }}
              size="small"
              id="agent-field-email"
              error={Boolean(formErrors.email)}
              helperText={formErrors.email}
            />

            {!editingItem && (
              <TextField
                required
                label="Senha de Acesso Padrão"
                fullWidth
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  if (e.target.value.trim().length >= 8 && e.target.value.trim().length <= 20) {
                    setFormErrors(errors => ({ ...errors, senha: undefined }));
                  }
                }}
                size="small"
                className="col-span-2"
                id="agent-field-senha"
                type="password"
                error={Boolean(formErrors.senha)}
                helperText={formErrors.senha || 'Use entre 8 e 20 caracteres. Esta senha será fornecida para o primeiro acesso do agente no aplicativo móvel.'}
              />
            )}

            <FormControl fullWidth size="small" required disabled={isAdmin} error={Boolean(formErrors.municipioId)}>
              <InputLabel id="agent-muni-label">Município</InputLabel>
              <Select
                labelId="agent-muni-label"
                value={isAdmin ? (currentUser?.municipioId || '') : municipioId}
                label="Município"
                onChange={(e) => {
                  setMunicipioId(e.target.value);
                  if (e.target.value) setFormErrors(errors => ({ ...errors, municipioId: undefined }));
                  setMercadoId('');
                }}
                id="agent-field-muni"
              >
                {isAdmin ? (
                  [
                    <MenuItem key="admin-muni" value={currentUser?.municipioId || ''}>
                      {municipios.find(m => m.id === currentUser?.municipioId)?.nome || 'Meu Município'}
                    </MenuItem>
                  ]
                ) : (
                  municipios.map(mu => (
                    <MenuItem key={mu.id} value={mu.id}>{mu.nome}</MenuItem>
                  ))
                )}
              </Select>
              {formErrors.municipioId && <FormHelperText>{formErrors.municipioId}</FormHelperText>}
            </FormControl>

            <FormControl fullWidth size="small" required error={Boolean(formErrors.mercadoId)}>
              <InputLabel id="agent-merc-label">Mercado Afetado</InputLabel>
              <Select
                labelId="agent-merc-label"
                value={mercadoId}
                label="Mercado Afetado"
                onChange={(e) => {
                  setMercadoId(e.target.value);
                  if (e.target.value) setFormErrors(errors => ({ ...errors, mercadoId: undefined }));
                }}
                id="agent-field-merc"
              >
                {allowedMercados.map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                ))}
              </Select>
              {formErrors.mercadoId && <FormHelperText>{formErrors.mercadoId}</FormHelperText>}
            </FormControl>

            <TextField
              label={`Meta Diária de Cobrança (${configuracoes.moeda})`}
              type="number"
              fullWidth
              value={configuracoes.metaDiariaAgente ?? 100000}
              size="small"
              className="col-span-2"
              id="agent-field-meta-diaria"
              slotProps={{
                input: {
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <Target size={16} className="text-blue-600" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <span className="text-xs font-semibold text-slate-500">{configuracoes.moeda}</span>
                    </InputAdornment>
                  )
                }
              }}
              helperText="Meta geral definida em Configurações. Para alterá-la, atualize a configuração do sistema."
            />

            <FormControl fullWidth size="small" className="col-span-2" error={Boolean(formErrors.permissoes)} required>
              <InputLabel id="permissions-label">Permissões de Cobrança</InputLabel>
              <Select
                labelId="permissions-label"
                multiple
                value={permissoes}
                onChange={(e) => {
                  const selected = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                  setPermissoes(selected);
                  if (selected.length > 0) setFormErrors(errors => ({ ...errors, permissoes: undefined }));
                }}
                input={<OutlinedInput label="Permissões de Cobrança" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {selected.map((value) => (
                      <Chip key={value} size="small" label={value} />
                    ))}
                  </Box>
                )}
                id="agent-field-permissoes"
              >
                {AVAILABLE_PERMISSIONS.map((p) => (
                  <MenuItem key={p} value={p}>
                    <Checkbox checked={permissoes.indexOf(p) > -1} />
                    <ListItemText primary={p} />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {formErrors.permissoes || 'Nenhuma vem selecionada. Cobrar e Offline são aplicadas pela API; Impressão, Isenção e Reemissão ainda não têm operações correspondentes.'}
              </FormHelperText>
            </FormControl>

            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-agent-label">Status</InputLabel>
              <Select
                labelId="status-agent-label"
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as any)}
                id="agent-field-status"
              >
                <MenuItem value="ativo">Ativo (Permitir arrecadar)</MenuItem>
                <MenuItem value="inativo">Inativo (Bloquear terminal)</MenuItem>
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-agent">Salvar Cadastro</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão de Segurança */}
      {(() => {
        const hasLinkedPayments = deleteId ? pagamentos.some(p => p.agenteId === deleteId) : false;
        return (
          <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
            <DialogTitle sx={{ fontWeight: 'bold', color: hasLinkedPayments ? 'warning.main' : 'error.main' }}>
              {hasLinkedPayments ? 'Exclusão Bloqueada (Rastreabilidade)' : 'Confirmar Exclusão de Agente'}
            </DialogTitle>
            <DialogContent dividers>
              {hasLinkedPayments ? (
                <Box>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Não é possível excluir o agente <strong>{agentes.find(a => a.id === deleteId)?.nome}</strong> porque existem dados de cobranças vinculados a ele.
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Para manter a integridade fiscal, conformidade e total rastreabilidade dos logs de auditoria e arrecadação, a exclusão está temporariamente desativada para este registro.
                  </Typography>
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderLeft: '4px solid', borderColor: 'warning.main', borderRadius: '0 4px 4px 0' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      Recomendação de Segurança:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Altere o status do agente para <strong>"Inativo"</strong>. Isto revogará o acesso dele ao terminal e aplicativo móvel imediatamente, preservando o histórico de arrecadações intacto.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <>
                  <Typography variant="body1">
                    Deseja realmente excluir este agente de fiscalização? Esta ação é irreversível e bloqueará imediatamente o acesso do agente ao aplicativo móvel de arrecadação.
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
                    Nota: Para fins de rastreabilidade de segurança e conformidade, esta ação será registrada nos logs de auditoria contendo sua identificação.
                  </Typography>
                </>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setDeleteId(null)} color="inherit" variant="outlined" sx={{ textTransform: 'none' }}>
                {hasLinkedPayments ? 'Fechar' : 'Cancelar'}
              </Button>
              {!hasLinkedPayments && (
                <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }} id="confirm-delete-agent-btn">
                  Excluir de Forma Permanente
                </Button>
              )}
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* Diálogo de Exibição de Senha Temporária */}
      <Dialog 
        open={resetPasswordInfo !== null} 
        onClose={() => {
          setResetPasswordInfo(null);
          setCopiedPassword(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold', color: 'warning.main', pb: 1 }}>
          Senha Temporária Gerada
        </DialogTitle>
        <DialogContent dividers sx={{ minWidth: 280 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            A senha de acesso do agente <strong>{resetPasswordInfo?.nome}</strong> foi resetada com sucesso:
          </Typography>
          <Box sx={{ 
            p: 2, 
            bgcolor: 'action.hover', 
            border: '1.5px dashed', 
            borderColor: 'warning.main', 
            borderRadius: 1.5, 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            mb: 2 
          }}>
            <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 3, color: 'text.primary' }}>
              {resetPasswordInfo?.senhaTemporaria}
            </Typography>
            <Button
              size="small"
              variant={copiedPassword ? "contained" : "outlined"}
              color={copiedPassword ? "success" : "primary"}
              startIcon={copiedPassword ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              onClick={() => {
                if (resetPasswordInfo?.senhaTemporaria) {
                  navigator.clipboard.writeText(resetPasswordInfo.senhaTemporaria);
                  setCopiedPassword(true);
                  setTimeout(() => setCopiedPassword(false), 3000);
                }
              }}
              sx={{ textTransform: 'none', fontSize: '12px' }}
              id="btn-copy-temp-password"
            >
              {copiedPassword ? 'Copiada para a área de transferência!' : 'Copiar Senha'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
            Repasse esta senha ao agente. No próximo acesso ao aplicativo móvel ou terminal, o sistema exigirá que o agente defina uma nova senha pessoal definitiva.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={() => {
              setResetPasswordInfo(null);
              setCopiedPassword(false);
            }} 
            color="primary" 
            variant="contained" 
            sx={{ textTransform: 'none', px: 3 }}
            id="btn-close-temp-password-modal"
          >
            Concluir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
