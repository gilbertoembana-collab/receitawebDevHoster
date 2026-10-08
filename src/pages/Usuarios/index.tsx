import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Usuario, UserProfile } from '../../types';
import { 
  Plus, Edit2, Trash2, Search, Shield, Check, X, RefreshCw, 
  Lock, UserCheck, AlertTriangle, Landmark, Mail, Activity
} from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, 
  InputLabel, TablePagination, Card, CardContent, Divider, Alert, Tooltip
} from '@mui/material';

export default function Usuarios() {
  const { 
    usuarios, municipios, addUsuario, updateUsuario, deleteUsuario,
    activeProfile, currentUser, addNotification 
  } = useAppStore();

  // Access validation: Check if current active profile is authorized
  const isAuthorized = [
    'Platform Owner',
    'Super Administrador', 
    'Super Admin', 
    'Administrador Municipal', 
    'Administrator'
  ].includes(activeProfile);

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [muniFilter, setMuniFilter] = useState<string>('all');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Usuario | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Form Fields
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<UserProfile>('Supervisor');
  const [municipioId, setMunicipioId] = useState<string>('');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setRoleFilter('all');
    setMuniFilter('all');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Lista de utilizadores e perfis atualizada com o servidor de banco de dados.',
        type: 'success'
      });
    }, 600);
  };

  // Profile Options
  const PROFILE_OPTIONS: { value: UserProfile; label: string; desc: string }[] = [
    { value: 'Platform Owner', label: 'Platform Owner', desc: 'Dono da Plataforma com controlo total sobre todas as câmaras e utilizadores' },
    { value: 'Super Admin', label: 'Super Admin', desc: 'Acesso total irrestrito a configurações, auditoria e finanças' },
    { value: 'Administrator', label: 'Administrator', desc: 'Administração geral da câmara e dados cadastrais' },
    { value: 'Supervisor', label: 'Supervisor', desc: 'Fiscal Supervisor - Validação e aprovação de cancelamentos' },
    { value: 'Diretor Financeiro', label: 'Diretor Financeiro', desc: 'Análise de arrecadações e fechamentos de caixa' },
    { value: 'Departamento de Mercados', label: 'Departamento de Mercados', desc: 'Gestão de mercados, bancas e feirantes' },
    { value: 'Collection Agent', label: 'Collection Agent', desc: 'Agente arrecadador de taxas em mobilidade' },
    { value: 'Cashier', label: 'Cashier', desc: 'Operador de Caixa - Recebimentos e conciliação bancária' },
    { value: 'Auditor', label: 'Auditor', desc: 'Consulta de relatórios analíticos e auditoria completa' }
  ];

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const isSuper = ['Platform Owner', 'Super Administrador', 'Super Admin'].includes(activeProfile);

  // Filtering Logic
  const filtered = usuarios.filter(u => {
    // Administrators cannot see Super Admin or Platform Owner accounts
    if (isAdmin && ['Super Admin', 'Super Administrador', 'Platform Owner'].includes(u.perfil)) {
      return false;
    }
    // Each administrator can only see the accounts of their own municipality
    if (isAdmin && u.municipioId !== currentUser?.municipioId) {
      return false;
    }

    const matchesSearch = 
      u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || u.perfil === roleFilter;
    const matchesMuni = muniFilter === 'all' || 
      (muniFilter === 'central' ? !u.municipioId : u.municipioId === muniFilter);

    return matchesSearch && matchesRole && matchesMuni;
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setNome('');
    setEmail('');
    setUsuario('');
    setSenha('');
    setPerfil('Supervisor');
    setMunicipioId(isAdmin ? (currentUser?.municipioId || '') : '');
    setStatus('ativo');
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: Usuario) => {
    setEditingItem(item);
    setNome(item.nome);
    setEmail(item.email);
    setUsuario(item.usuario || '');
    setSenha(item.senha || '');
    setPerfil(item.perfil);
    setMunicipioId(item.municipioId || '');
    setStatus(item.status);
    setOpenDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const userData = {
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      perfil,
      municipioId: isAdmin ? (currentUser?.municipioId || null) : (municipioId || null),
      status,
      usuario: usuario.trim() || null,
      senha: senha.trim() || null
    };

    try {
      if (editingItem) {
        // Update
        await updateUsuario(editingItem.id, userData as any);
        addNotification({
          title: 'Utilizador Atualizado',
          message: `O utilizador "${nome}" foi atualizado com sucesso.`,
          type: 'success'
        });
      } else {
        // Create
        const newId = `user-${Math.random().toString(36).substring(2, 11)}`;
        await addUsuario({ id: newId, ...userData } as any);
        addNotification({
          title: 'Utilizador Criado',
          message: `Novo utilizador "${nome}" criado com perfil ${perfil}.`,
          type: 'success'
        });
      }
      setOpenDialog(false);
    } catch (err: any) {
      alert('Erro ao guardar utilizador: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteUsuario(deleteId);
      setDeleteId(null);
    } catch (err: any) {
      alert('Erro ao remover utilizador: ' + err.message);
    }
  };

  // Helper for color chips
  const getRoleBadgeStyle = (profile: string) => {
    switch (profile) {
      case 'Platform Owner':
        return { bg: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400', label: 'Platform Owner' };
      case 'Super Admin':
      case 'Super Administrador':
        return { bg: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400', label: 'Super Admin' };
      case 'Administrator':
      case 'Administrador Municipal':
        return { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400', label: 'Admin' };
      case 'Diretor Financeiro':
        return { bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400', label: 'Financeiro' };
      case 'Supervisor':
      case 'Fiscal Supervisor':
        return { bg: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400', label: 'Supervisor' };
      case 'Departamento de Mercados':
        return { bg: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400', label: 'Mercados' };
      case 'Collection Agent':
        return { bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-400', label: 'Agente Móvel' };
      case 'Cashier':
        return { bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-400', label: 'Caixa' };
      case 'Auditor':
        return { bg: 'bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-400', label: 'Auditor' };
      default:
        return { bg: 'bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400', label: profile };
    }
  };

  // Access Denied Screen
  if (!isAuthorized) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }} className="animate-fade-in">
        <Card sx={{ maxWidth: 500, width: '100%', borderTop: '4px solid', borderColor: 'error.main', boxShadow: 3 }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 flex items-center justify-center border-2 border-red-500">
                <Lock size={32} />
              </div>
            </Box>
            <Typography variant="h3" sx={{ mb: 1, fontWeight: 'bold' }}>Acesso Restrito</Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
              Apenas utilizadores com os perfis de <strong>Super Administrador</strong> ou <strong>Administrador Municipal</strong> têm permissão para aceder à Gestão de Usuários e Perfis.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2, textAlign: 'left', display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
              <div className="text-xs text-slate-600 dark:text-slate-400">
                O seu perfil ativo é <strong>{activeProfile}</strong>. Se acredita que isto é um erro, contacte o suporte do Ministério das Finanças.
              </div>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in" id="usuarios-management-container">
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
        <div>
          <Typography variant="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Shield size={28} className="text-blue-600" />
            Gestão de Usuários e Perfis
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Controlo de acessos, criação de utilizadores institucionais e atribuição de perfis de segurança
          </Typography>
        </div>
        
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={handleRefresh}
            startIcon={<RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={16} />}
            disabled={isRefreshing}
          >
            Sincronizar
          </Button>

          <Button
            variant="contained"
            onClick={handleOpenAdd}
            startIcon={<Plus size={16} />}
            id="btn-new-user"
          >
            Novo Usuário
          </Button>
        </Box>
      </Box>

      {/* Alert informing about centralized sync */}
      <Alert severity="info" sx={{ mb: 3 }} icon={<Activity size={18} />}>
        As contas aqui criadas são sincronizadas instantaneamente com o banco de dados principal e refletem-se no Playground de Acesso.
      </Alert>

      {/* Filters Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Search Box */}
            <div className="md:col-span-6 flex items-center">
              <div className="relative w-full bg-white dark:bg-slate-900 rounded-lg">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar por nome ou e-mail..."
                  className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
                  id="search-user-input"
                />
              </div>
            </div>

            {/* Profile filter */}
            <div className="md:col-span-3">
              <FormControl fullWidth size="small">
                <InputLabel id="role-filter-label">Perfil de Acesso</InputLabel>
                <Select
                  labelId="role-filter-label"
                  value={roleFilter}
                  label="Perfil de Acesso"
                  onChange={(e) => setRoleFilter(e.target.value)}
                  id="filter-user-role"
                >
                  <MenuItem value="all">Todos os Perfis</MenuItem>
                  {PROFILE_OPTIONS.filter(opt => !isAdmin || !['Super Admin', 'Super Administrador', 'Platform Owner'].includes(opt.value)).map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                  {!isAdmin && <MenuItem value="Super Administrador">Super Administrador (Legado)</MenuItem>}
                  <MenuItem value="Administrador Municipal">Administrador Municipal (Legado)</MenuItem>
                  <MenuItem value="Fiscal Supervisor">Fiscal Supervisor (Legado)</MenuItem>
                </Select>
              </FormControl>
            </div>

            {/* Municipality filter */}
            <div className="md:col-span-3">
              <FormControl fullWidth size="small" disabled={isAdmin}>
                <InputLabel id="muni-filter-label">Município</InputLabel>
                <Select
                  labelId="muni-filter-label"
                  value={isAdmin ? (currentUser?.municipioId || 'all') : muniFilter}
                  label="Município"
                  onChange={(e) => setMuniFilter(e.target.value)}
                  id="filter-user-muni"
                >
                  {(() => {
                    const list: React.ReactElement[] = [];
                    if (isAdmin) {
                      const userMuniId = currentUser?.municipioId || 'all';
                      const name = municipios.find(m => m.id === userMuniId)?.nome || 'Meu Município';
                      list.push(
                        <MenuItem key="admin-muni" value={userMuniId}>
                          {name}
                        </MenuItem>
                      );
                    } else {
                      list.push(<MenuItem key="all" value="all">Todos os Municípios</MenuItem>);
                      list.push(<MenuItem key="central" value="central">Nível Central (Sem Município)</MenuItem>);
                      municipios.forEach(muni => {
                        list.push(
                          <MenuItem key={muni.id} value={muni.id}>
                            {muni.nome}
                          </MenuItem>
                        );
                      });
                    }
                    return list;
                  })()}
                </Select>
              </FormControl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Section */}
      <TableContainer component={Paper} className="shadow-md">
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Nome / Email</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Perfil de Acesso</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Jurisdição / Município</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Nenhum utilizador encontrado com os filtros selecionados.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((user) => {
                const badge = getRoleBadgeStyle(user.perfil);
                const muniName = user.municipioId 
                  ? municipios.find(m => m.id === user.municipioId)?.nome || 'Município Desconhecido'
                  : 'Nível Central';

                return (
                  <TableRow key={user.id} hover className="transition-colors">
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold border border-slate-200 dark:border-slate-700 uppercase">
                          {user.nome.charAt(0)}
                        </div>
                        <div>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{user.nome}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Mail size={12} className="text-slate-400" />
                            {user.email}
                          </Typography>
                          {user.usuario && (
                            <Typography variant="caption" sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                              <Lock size={12} />
                              Login: <strong className="font-mono">{user.usuario}</strong>
                            </Typography>
                          )}
                        </div>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Landmark size={14} className="text-slate-400" />
                        <Typography variant="body2">{muniName}</Typography>
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Chip 
                        size="small"
                        icon={user.status === 'ativo' ? <Check size={12} /> : <X size={12} />}
                        label={user.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        color={user.status === 'ativo' ? 'success' : 'default'}
                        variant={user.status === 'ativo' ? 'filled' : 'outlined'}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title="Editar Utilizador">
                          <Button 
                            variant="outlined" 
                            size="small" 
                            onClick={() => handleOpenEdit(user)}
                            sx={{ minWidth: 36, p: 0.75 }}
                            className="edit-user-btn"
                          >
                            <Edit2 size={14} />
                          </Button>
                        </Tooltip>

                        {/* Prevent self deletion */}
                        {currentUser?.id !== user.id ? (
                          <Tooltip title="Excluir Utilizador">
                            <Button 
                              variant="outlined" 
                              color="error"
                              size="small" 
                              onClick={() => setDeleteId(user.id)}
                              sx={{ minWidth: 36, p: 0.75 }}
                              className="delete-user-btn"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Utilizador conectado atualmente (Não pode ser excluído)">
                            <span>
                              <Button 
                                variant="outlined" 
                                size="small" 
                                disabled
                                sx={{ minWidth: 36, p: 0.75 }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
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
          labelRowsPerPage="Linhas por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count !== -1 ? count : `mais de ${to}`}`}
        />
      </TableContainer>

      {/* ADD/EDIT USER DIALOG */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {editingItem ? 'Editar Utilizador' : 'Adicionar Novo Utilizador'}
        </DialogTitle>
        <form onSubmit={handleSave}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {/* Name */}
            <TextField
              required
              label="Nome Completo"
              fullWidth
              size="small"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João Baptista da Silva"
              id="user-form-name"
            />

            {/* Email */}
            <TextField
              required
              type="email"
              label="Email Corporativo"
              fullWidth
              size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: joao.silva@receita360.gw"
              disabled={!!editingItem} // Prevent email update for identity safety
              helperText={editingItem ? "O e-mail é utilizado como identificador exclusivo e não pode ser alterado." : "Será utilizado para autenticação no painel administrativo."}
              id="user-form-email"
            />

            {/* Login / Username */}
            <TextField
              required
              label="Nome de Utilizador / Login"
              fullWidth
              size="small"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s+/g, ''))}
              placeholder="Ex: joao.silva"
              helperText="Identificador único para login no sistema."
              id="user-form-login"
            />

            {/* Password */}
            <TextField
              required={!editingItem}
              type="password"
              label="Senha de Acesso"
              fullWidth
              size="small"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={editingItem ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"}
              helperText={editingItem ? "Preencha apenas se deseja alterar a senha atual do utilizador." : "Senha padrão para o primeiro acesso do utilizador."}
              id="user-form-password"
            />

            {/* Profile Dropdown */}
            <FormControl fullWidth size="small" required>
              <InputLabel id="user-form-perfil-label">Perfil de Acesso / Papel</InputLabel>
              <Select
                labelId="user-form-perfil-label"
                value={perfil}
                label="Perfil de Acesso / Papel"
                onChange={(e) => setPerfil(e.target.value as UserProfile)}
                id="user-form-perfil"
              >
                {PROFILE_OPTIONS.filter(opt => !isAdmin || !['Super Admin', 'Super Administrador', 'Platform Owner'].includes(opt.value)).map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <div>
                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-100">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal leading-tight">{opt.desc}</div>
                    </div>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Municipality Dropdown */}
            <FormControl fullWidth size="small" disabled={isAdmin}>
              <InputLabel id="user-form-muni-label">Município (Jurisdição)</InputLabel>
              <Select
                labelId="user-form-muni-label"
                value={isAdmin ? (currentUser?.municipioId || '') : municipioId}
                label="Município (Jurisdição)"
                onChange={(e) => setMunicipioId(e.target.value)}
                id="user-form-muni"
              >
                {(() => {
                  const list: React.ReactElement[] = [];
                  if (isAdmin) {
                    const userMuniId = currentUser?.municipioId || '';
                    const name = municipios.find(m => m.id === userMuniId)?.nome || 'Meu Município';
                    list.push(
                      <MenuItem key="admin-form-muni" value={userMuniId}>
                        {name}
                      </MenuItem>
                    );
                  } else {
                    list.push(<MenuItem key="central-form" value="">Nível Central / Ministério (Sem Município)</MenuItem>);
                    municipios.forEach(muni => {
                      list.push(
                        <MenuItem key={muni.id} value={muni.id}>{muni.nome}</MenuItem>
                      );
                    });
                  }
                  return list;
                })()}
              </Select>
              <span className="text-[10px] text-slate-400 mt-1 pl-1">
                {isAdmin 
                  ? "A sua jurisdição está restrita ao seu município administrativo."
                  : "A vinculação ao município limita a visualização dos dados cadastrais e arrecadações a este território específico."
                }
              </span>
            </FormControl>

            {/* Status Option */}
            <FormControl fullWidth size="small">
              <InputLabel id="user-form-status-label">Status da Conta</InputLabel>
              <Select
                labelId="user-form-status-label"
                value={status}
                label="Status da Conta"
                onChange={(e) => setStatus(e.target.value as 'ativo' | 'inativo')}
                id="user-form-status"
              >
                <MenuItem value="ativo">Ativo (Acesso Liberado)</MenuItem>
                <MenuItem value="inativo">Inativo (Bloquear Acesso)</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Guardar</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle size={20} className="text-red-500" />
          Confirmar Exclusão
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Tem certeza de que deseja remover permanentemente este utilizador do sistema?
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            Esta ação não pode ser desfeita. Todos os logs de ações históricas deste utilizador serão preservados para fins de auditoria no banco de dados.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
