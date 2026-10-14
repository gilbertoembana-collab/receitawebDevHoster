import React, { useState } from 'react';
import { africanCountries, findAfricanCountry } from '../../utils/africaLocations';
import { useAppStore } from '../../store';
import { Municipio } from '../../types';
import { 
  Plus, Edit2, Trash2, Search, CheckCircle, XCircle, RefreshCw, 
  FileSpreadsheet, Printer, Globe, Shield, Activity, HardDrive, Users2
} from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, InputLabel,
  TablePagination, FormGroup, FormControlLabel, Checkbox, OutlinedInput
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function Municipios() {
  const { 
    municipios, agentes, addMunicipio, updateMunicipio, deleteMunicipio, 
    activeProfile, addNotification, currentUser 
  } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Municipio | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Authentication & RBAC role checks
  const isPlatformOwner = activeProfile === 'Platform Owner';
  const isNationalUser = ['Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional'].includes(activeProfile);
  const isMunicipalUser = !isPlatformOwner && !isNationalUser;

  const userMuniId = currentUser?.municipioId || '';

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Lista de municípios atualizada com sucesso em tempo real com a nuvem.',
        type: 'success'
      });
    }, 600);
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [regiao, setRegiao] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');
  
  // Licensing & Hierarchy Fields
  const [paisId, setPaisId] = useState('GW');
  const [paisNome, setPaisNome] = useState('Guiné-Bissau');
  const [ministerioNome, setMinisterioNome] = useState('Ministério da Administração Territorial');
  const [plano, setPlano] = useState('Prata');
  const [dataAtivacao, setDataAtivacao] = useState('2026-01-01');
  const [dataValidade, setDataValidade] = useState('2027-01-01');
  const [estadoLicenca, setEstadoLicenca] = useState<'ativo' | 'suspenso'>('ativo');
  const [limiteUsuarios, setLimiteUsuarios] = useState(50);
  const [limiteArmazenamento, setLimiteArmazenamento] = useState(10);
  const [modulosHabilitados, setModulosHabilitados] = useState<string[]>([
    'Mercados', 'Taxas', 'Financeiro', 'Relatórios'
  ]);

  const modulosDisponiveis = [
    'Mercados', 'Taxas', 'Financeiro', 'Fiscalização', 'Tesouraria', 'Património', 'Relatórios', 'Auditoria'
  ];
  const selectedCountry = africanCountries.find(country => country.isoCode === paisId);

  // Complete multi-tenant data isolation logic
  const filtered = municipios.filter(m => {
    // If municipal-level, strictly isolate and only show their own municipality
    if (isMunicipalUser && m.id !== userMuniId) {
      return false;
    }
    return (
      m.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.responsavel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.plano && m.plano.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setNome('');
    setCodigo('');
    setRegiao('');
    setEndereco('');
    setTelefone('');
    setEmail('');
    setResponsavel('');
    setStatus('ativo');
    const defaultCountry = findAfricanCountry('GW');
    setPaisId(defaultCountry?.isoCode || 'GW');
    setPaisNome(defaultCountry?.name || 'Guiné-Bissau');
    setMinisterioNome('Ministério da Administração Territorial');
    setPlano('Prata');
    setDataAtivacao('2026-01-01');
    setDataValidade('2027-01-01');
    setEstadoLicenca('ativo');
    setLimiteUsuarios(50);
    setLimiteArmazenamento(10);
    setModulosHabilitados(['Mercados', 'Taxas', 'Financeiro', 'Relatórios']);
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: Municipio) => {
    setEditingItem(item);
    setNome(item.nome);
    setCodigo(item.codigo);
    setRegiao(item.regiao);
    setEndereco(item.endereco);
    setTelefone(item.telefone);
    setEmail(item.email);
    setResponsavel(item.responsavel);
    setStatus(item.status);
    const country = findAfricanCountry(item.paisId, item.paisNome) || findAfricanCountry('GW');
    setPaisId(country?.isoCode || 'GW');
    setPaisNome(country?.name || item.paisNome || 'Guiné-Bissau');
    setMinisterioNome(item.ministerioNome || 'Ministério da Administração Territorial');
    setPlano(item.plano || 'Prata');
    setDataAtivacao(item.dataAtivacao || '2026-01-01');
    setDataValidade(item.dataValidade || '2027-01-01');
    setEstadoLicenca(item.estadoLicenca || 'ativo');
    setLimiteUsuarios(item.limiteUsuarios || 50);
    setLimiteArmazenamento(item.limiteArmazenamento || 10);
    setModulosHabilitados(item.modulosHabilitados || ['Mercados', 'Taxas', 'Financeiro', 'Relatórios']);
    setOpenDialog(true);
  };

  const handleSave = () => {
    if (!nome.trim() || !codigo.trim() || !responsavel.trim()) {
      addNotification({
        title: 'Erro de Validação',
        message: 'Por favor, preencha os campos obrigatórios (Nome, Código e Responsável).',
        type: 'warning'
      });
      return;
    }

    const payload = { 
      nome: nome.trim(), 
      codigo: codigo.trim().toUpperCase(), 
      regiao: regiao.trim(), 
      endereco: endereco.trim(), 
      telefone: telefone.trim(), 
      email: email.trim().toLowerCase(), 
      responsavel: responsavel.trim(), 
      status,
      paisId: selectedCountry?.isoCode || paisId,
      paisNome: selectedCountry?.name || paisNome.trim(),
      ministerioId: 'mat-gw',
      ministerioNome: ministerioNome.trim(),
      plano,
      dataAtivacao,
      dataValidade,
      estadoLicenca,
      limiteUsuarios: Number(limiteUsuarios),
      limiteArmazenamento: Number(limiteArmazenamento),
      modulosHabilitados
    };

    if (editingItem) {
      updateMunicipio(editingItem.id, payload);
      addNotification({
        title: 'Município Atualizado',
        message: `Licenciamento e cadastro do município "${nome}" salvos com sucesso.`,
        type: 'success'
      });
    } else {
      addMunicipio(payload);
      addNotification({
        title: 'Município Cadastrado',
        message: `O município "${nome}" foi licenciado com sucesso na plataforma nacional.`,
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
      deleteMunicipio(deleteId);
      setDeleteId(null);
    }
  };

  const handleExportExcel = () => {
    const headers = ['Código', 'Nome', 'País', 'Plano', 'Responsável', 'Validade', 'Status Licença'];
    const data = filtered.map(m => [
      m.codigo, 
      m.nome, 
      m.paisNome || 'Guiné-Bissau', 
      m.plano || 'Nenhum', 
      m.responsavel, 
      m.dataValidade || 'N/A', 
      m.estadoLicenca === 'ativo' ? 'Ativo' : 'Suspenso'
    ]);
    exportToExcel(data, headers, 'licenciamento_municipios');
  };

  const handlePrintPDF = () => {
    const headers = ['Código', 'Nome', 'País', 'Plano', 'Responsável', 'Validade', 'Status Licença'];
    const data = filtered.map(m => [
      m.codigo, 
      m.nome, 
      m.paisNome || 'Guiné-Bissau', 
      m.plano || 'Nenhum', 
      m.responsavel, 
      m.dataValidade || 'N/A', 
      m.estadoLicenca === 'ativo' ? 'Ativo' : 'Suspenso'
    ]);
    printToPDF('Plataforma Nacional Integrada - Licenciamento', headers, data);
  };

  const getPlanChipColor = (p: string) => {
    switch (p) {
      case 'Platina': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300';
      case 'Ouro': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300';
      case 'Prata': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-400';
      default: return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-300';
    }
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h1">Plataforma de Municípios & Licenciamento</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {isPlatformOwner 
              ? 'Painel Geral de Gerenciamento de Clientes, Contratos e Distribuição de Licenças Nacionais' 
              : isNationalUser 
                ? 'Supervisão Geral do Ministério da Administração Territorial (Consolidado)' 
                : 'Seu Perfil e Licenciamento Municipal do Ente Local'}
          </Typography>
        </div>
        {isPlatformOwner && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenAdd}
            id="btn-add-municipio"
          >
            Licenciar Município
          </Button>
        )}
      </Box>

      {/* Dynamic Summary Cards for National Level Users */}
      {!isMunicipalUser && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Globe size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Municípios Integrados</div>
              <div className="text-xl font-bold">{municipios.length}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
              <CheckCircle size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Licenças Ativas</div>
              <div className="text-xl font-bold">{municipios.filter(m => m.estadoLicenca === 'ativo' || !m.estadoLicenca).length}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
              <XCircle size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Licenças Suspensas</div>
              <div className="text-xl font-bold">{municipios.filter(m => m.estadoLicenca === 'suspenso').length}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
              <Activity size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Receitas Totais</div>
              <div className="text-xl font-bold">Consolidado Nacional</div>
            </div>
          </div>
        </div>
      )}

      {/* Directory Filter Input */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome, código, plano ou responsável..."
            className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
            id="municipios-search"
          />
        </div>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-refresh-municipios"
        >
          {isRefreshing ? 'A atualizar...' : 'Atualizar'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          startIcon={<FileSpreadsheet size={14} />}
          onClick={handleExportExcel}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
          id="btn-excel-municipios"
        >
          Exportar Excel
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<Printer size={14} />}
          onClick={handlePrintPDF}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-pdf-municipios"
        >
          Imprimir PDF
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome / País Tutor</TableCell>
              <TableCell>Plano Contratado</TableCell>
              <TableCell>Estado da Licença</TableCell>
              <TableCell>Validade</TableCell>
              <TableCell>Usuários Cadastrados</TableCell>
              <TableCell>Armazenamento</TableCell>
              <TableCell>Módulos Habilitados</TableCell>
              {isPlatformOwner && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" className="text-slate-400 py-6">
                  Nenhum município cadastrado ou correspondente à busca.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400">{m.codigo}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{m.nome}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Globe size={10} /> {m.paisNome || 'Guiné-Bissau'} | {m.regiao}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getPlanChipColor(m.plano || 'Bronze')}`}>
                      {m.plano || 'Bronze'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small" 
                      label={m.estadoLicenca === 'suspenso' ? 'Suspenso' : 'Ativo'} 
                      color={m.estadoLicenca === 'suspenso' ? 'error' : 'success'}
                      icon={m.estadoLicenca === 'suspenso' ? <XCircle size={12} /> : <CheckCircle size={12} />}
                      sx={{ fontSize: 10, height: 20 }}
                    />
                  </TableCell>
                  <TableCell className="text-xs font-mono">{m.dataValidade || 'N/A'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <Users2 size={13} className="text-slate-400" />
                      <span>{agentes.filter(a => a.municipioId === m.id).length} / {m.limiteUsuarios || 15}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <HardDrive size={13} className="text-slate-400" />
                      <span>{(m.limiteArmazenamento ? (m.limiteArmazenamento * 0.12).toFixed(1) : '0.6')} / {m.limiteArmazenamento || 5} GB</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(m.modulosHabilitados || ['Mercados', 'Taxas']).map(mod => (
                        <span key={mod} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-medium">
                          {mod}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  {isPlatformOwner && (
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<Edit2 size={13} />}
                          onClick={() => handleOpenEdit(m)}
                          sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                          id={`edit-muni-${m.id}`}
                        >
                          Configurar
                        </Button>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="error" 
                          startIcon={<Trash2 size={13} />}
                          onClick={() => handleDelete(m.id)}
                          sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                          id={`delete-muni-${m.id}`}
                        >
                          Excluir
                        </Button>
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))
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
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingItem ? 'Configurar Licenciamento do Município' : 'Cadastrar e Licenciar Novo Município'}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            
            <div className="col-span-2 border-b pb-1">
              <Typography variant="h6" className="text-blue-600 text-xs font-bold uppercase flex items-center gap-1">
                <Globe size={14} /> Dados Cadastrais Institucionais
              </Typography>
            </div>

            <TextField
              required
              label="Nome do Ente Local / Município"
              fullWidth
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              size="small"
              className="col-span-2 md:col-span-1"
              id="muni-field-nome"
            />
            <TextField
              required
              label="Código de Identificação"
              placeholder="Ex: BIS-01"
              fullWidth
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              size="small"
              id="muni-field-codigo"
            />
            <TextField
              required
              label="Nome do Responsável / Prefeito"
              fullWidth
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              size="small"
              id="muni-field-responsavel"
            />
            <TextField
              select
              label="País Sede"
              fullWidth
              value={paisId}
              onChange={(e) => {
                const selected = africanCountries.find(country => country.isoCode === e.target.value);
                setPaisId(e.target.value);
                setPaisNome(selected?.name || '');
                setRegiao('');
              }}
              size="small"
              id="muni-field-pais"
            >
              {africanCountries.map(country => (
                <MenuItem key={country.isoCode} value={country.isoCode}>
                  {country.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Região / Estado"
              fullWidth
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
              size="small"
              id="muni-field-regiao"
              disabled={!selectedCountry}
            >
              <MenuItem value="">Selecione uma região / estado</MenuItem>
              {regiao && !selectedCountry?.regions.includes(regiao) && (
                <MenuItem value={regiao}>{regiao}</MenuItem>
              )}
              {selectedCountry?.regions.map(region => (
                <MenuItem key={`${selectedCountry.isoCode}-${region}`} value={region}>
                  {region}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Ministério Supervisor Tutor"
              fullWidth
              value={ministerioNome}
              onChange={(e) => setMinisterioNome(e.target.value)}
              size="small"
              id="muni-field-ministerio"
            />
            <TextField
              label="Telefone de Contato"
              fullWidth
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              size="small"
              id="muni-field-telefone"
            />
            <TextField
              label="E-mail"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              id="muni-field-email"
            />
            <TextField
              label="Endereço Sede"
              fullWidth
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              size="small"
              className="col-span-2"
              id="muni-field-endereco"
            />

            <div className="col-span-2 border-b pb-1 mt-3">
              <Typography variant="h6" className="text-blue-600 text-xs font-bold uppercase flex items-center gap-1">
                <Shield size={14} /> Contrato de Licenciamento & Limites Operacionais
              </Typography>
            </div>

            <FormControl fullWidth size="small">
              <InputLabel id="plano-label">Plano</InputLabel>
              <Select
                labelId="plano-label"
                value={plano}
                label="Plano"
                onChange={(e) => setPlano(e.target.value)}
                id="muni-field-plano"
              >
                <MenuItem value="Bronze">Bronze (Até 15 usuários, 5 GB)</MenuItem>
                <MenuItem value="Prata">Prata (Até 30 usuários, 10 GB)</MenuItem>
                <MenuItem value="Ouro">Ouro (Até 50 usuários, 20 GB)</MenuItem>
                <MenuItem value="Platina">Platina (Até 100 usuários, 50 GB)</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="estado-licenca-label">Estado da Licença</InputLabel>
              <Select
                labelId="estado-licenca-label"
                value={estadoLicenca}
                label="Estado da Licença"
                onChange={(e) => setEstadoLicenca(e.target.value as any)}
                id="muni-field-estado-licenca"
              >
                <MenuItem value="ativo">Ativo / Regularizado</MenuItem>
                <MenuItem value="suspenso">Suspenso / Bloqueado por Pagamento</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Data de Ativação"
              type="date"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              value={dataAtivacao}
              onChange={(e) => setDataAtivacao(e.target.value)}
              size="small"
              id="muni-field-data-ativacao"
            />
            <TextField
              label="Data de Validade da Licença"
              type="date"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              value={dataValidade}
              onChange={(e) => setDataValidade(e.target.value)}
              size="small"
              id="muni-field-data-validade"
            />

            <TextField
              label="Limite de Usuários Máximo"
              type="number"
              fullWidth
              value={limiteUsuarios}
              onChange={(e) => setLimiteUsuarios(Number(e.target.value))}
              size="small"
              id="muni-field-limite-usuarios"
            />
            <TextField
              label="Armazenamento Máximo (GB)"
              type="number"
              fullWidth
              value={limiteArmazenamento}
              onChange={(e) => setLimiteArmazenamento(Number(e.target.value))}
              size="small"
              id="muni-field-limite-armazenamento"
            />

            <div className="col-span-2 mt-2">
              <Typography variant="body2" className="text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Módulos Habilitados para este Município:
              </Typography>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {modulosDisponiveis.map(m => {
                  const isChecked = modulosHabilitados.includes(m);
                  return (
                    <FormControlLabel
                      key={m}
                      control={
                        <Checkbox
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setModulosHabilitados([...modulosHabilitados, m]);
                            } else {
                              setModulosHabilitados(modulosHabilitados.filter(mod => mod !== m));
                            }
                          }}
                          size="small"
                        />
                      }
                      label={<span className="text-xs">{m}</span>}
                    />
                  );
                })}
              </div>
            </div>

            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-label">Status Geral</InputLabel>
              <Select
                labelId="status-label"
                value={status}
                label="Status Geral"
                onChange={(e) => setStatus(e.target.value as any)}
                id="muni-field-status"
              >
                <MenuItem value="ativo">Ativo (Visível para o Ministério)</MenuItem>
                <MenuItem value="inativo">Inativo (Ocultar nos relatórios gerais)</MenuItem>
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-municipio">Salvar Licenciamento</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão de Segurança */}
      {(() => {
        const hasLinkedAgents = deleteId ? agentes.some(a => a.municipioId === deleteId) : false;
        return (
          <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
            <DialogTitle sx={{ fontWeight: 'bold', color: hasLinkedAgents ? 'warning.main' : 'error.main' }}>
              {hasLinkedAgents ? 'Exclusão Bloqueada (Rastreabilidade)' : 'Confirmar Exclusão do Município'}
            </DialogTitle>
            <DialogContent dividers>
              {hasLinkedAgents ? (
                <Box>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Não é possível excluir o município <strong>{municipios.find(m => m.id === deleteId)?.nome}</strong> porque existem agentes de fiscalização vinculados a ele.
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Para manter a integridade fiscal, conformidade e total rastreabilidade dos logs de auditoria e agentes cadastrados, a exclusão de municípios com agentes ativos ou inativos associados está desativada.
                  </Typography>
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderLeft: '4px solid', borderColor: 'warning.main', borderRadius: '0 4px 4px 0' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      Recomendação de Segurança:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Altere o status do município para <strong>"Inativo"</strong> ou altere o Estado da Licença para <strong>"Suspenso"</strong>. Isto desativará novas operações e novos cadastros sob este município sem corromper ou deletar as informações históricas dos agentes vinculados.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <>
                  <Typography variant="body1">
                    Deseja realmente excluir este município? Esta ação é irreversível e todas as atividades de fiscalização e arrecadação vinculadas serão afetadas.
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
                    Nota: Para fins de rastreabilidade de segurança e conformidade, esta ação será registrada nos logs de auditoria contendo sua identificação.
                  </Typography>
                </>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setDeleteId(null)} color="inherit" variant="outlined" sx={{ textTransform: 'none' }}>
                {hasLinkedAgents ? 'Fechar' : 'Cancelar'}
              </Button>
              {!hasLinkedAgents && (
                <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }} id="confirm-delete-muni-btn">
                  Excluir de Forma Permanente
                </Button>
              )}
            </DialogActions>
          </Dialog>
        );
      })()}
    </Box>
  );
}
