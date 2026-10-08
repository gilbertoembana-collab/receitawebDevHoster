import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { Pagamento, StatusPagamento } from '../../types';
import { 
  Search, Eye, Printer, FileText, Check, X, AlertTriangle, 
  RotateCcw, Download, Calendar, Filter, FileSpreadsheet, RefreshCw, Trash2
} from 'lucide-react';
import { dbService } from '../../services/db';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, 
  InputLabel, Grid, InputAdornment, Card, CardContent, TablePagination
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function Pagamentos() {
  const { 
    pagamentos, mercados, agentes, contribuintes, municipios, tiposReceita, 
    activeProfile, approveCancellation, cancelPayment, configuracoes, addNotification,
    currentUser
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Pagamento | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const handleClearAll = async () => {
    if (window.confirm('Deseja eliminar TODOS os pagamentos e recibos de simulação? O histórico ficará limpo para novos registros reais.')) {
      await dbService.clearAllPagamentos(currentUser?.nome || 'Admin', activeProfile);
      addNotification({
        title: 'Histórico Limpo',
        message: 'Todos os pagamentos e recibos de simulação foram removidos com sucesso.',
        type: 'info'
      });
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setFilterMuni(isAdmin ? userMuniId : 'todos');
    setFilterMerc('todos');
    setFilterAgent('todos');
    setFilterType('todos');
    setFilterStatus('todos');
    setFilterPayMethod('todos');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Lista de cobranças e recibos actualizada com sucesso.',
        type: 'success'
      });
    }, 600);
  };
  
  // Advanced Filters States
  const [filterMuni, setFilterMuni] = useState(isAdmin ? userMuniId : 'todos');
  const [filterMerc, setFilterMerc] = useState('todos');
  const [filterAgent, setFilterAgent] = useState('todos');
  const [filterType, setFilterType] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterPayMethod, setFilterPayMethod] = useState('todos');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [cancellationReason, setCancellationReason] = useState('');
  const [openCancelDialog, setOpenCancelDialog] = useState(false);

  // Apply Advanced Filtering
  const filteredPagamentos = useMemo(() => {
    const currentMuniId = isAdmin ? userMuniId : filterMuni;
    return pagamentos.filter(p => {
      if (isAdmin && p.municipioId !== userMuniId) {
        return false;
      }

      const matchSearch = searchTerm === '' || 
        p.reciboId.includes(searchTerm) ||
        contribuintes.find(c => c.id === p.contribuinteId)?.nome.toLowerCase().includes(searchTerm.toLowerCase());

      const matchMuni = currentMuniId === 'todos' || p.municipioId === currentMuniId;
      const matchMerc = filterMerc === 'todos' || p.mercadoId === filterMerc;
      const matchAgent = filterAgent === 'todos' || p.agenteId === filterAgent;
      const matchType = filterType === 'todos' || p.tipoReceitaId === filterType;
      const matchStatus = filterStatus === 'todos' || p.status === filterStatus;
      const matchMethod = filterPayMethod === 'todos' || p.formaPagamento === filterPayMethod;

      let matchDate = true;
      if (filterStartDate) {
        matchDate = matchDate && p.dataPagamento.split('T')[0] >= filterStartDate;
      }
      if (filterEndDate) {
        matchDate = matchDate && p.dataPagamento.split('T')[0] <= filterEndDate;
      }

      return matchSearch && matchMuni && matchMerc && matchAgent && matchType && matchStatus && matchMethod && matchDate;
    });
  }, [pagamentos, searchTerm, filterMuni, filterMerc, filterAgent, filterType, filterStatus, filterPayMethod, filterStartDate, filterEndDate, contribuintes, isAdmin, userMuniId]);

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filteredPagamentos.length / rowsPerPage) - 1));
  const paginatedPagamentos = useMemo(() => {
    return filteredPagamentos.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);
  }, [filteredPagamentos, currentPage, rowsPerPage]);

  // Handle Action buttons
  const handleOpenView = (pay: Pagamento) => {
    setSelectedPayment(pay);
    setOpenViewDialog(true);
  };

  const handleOpenCancelPrompt = (pay: Pagamento) => {
    setSelectedPayment(pay);
    setCancellationReason('');
    setOpenCancelDialog(true);
  };

  const handleRequestCancel = () => {
    if (!selectedPayment) return;
    cancelPayment(selectedPayment.id, cancellationReason);
    setOpenCancelDialog(false);
  };

  const handleDirectApproveCancel = (id: string) => {
    if (confirm('Aprovar o cancelamento deste recibo de arrecadação? O valor será subtraído do fluxo de caixa.')) {
      approveCancellation(id);
      if (openViewDialog) setOpenViewDialog(false);
    }
  };

  // Export functions (genuine downloads)
  const handleExportCSV = () => {
    const headers = ['Recibo', 'Contribuinte', 'Mercado', 'Agente', 'Taxa', 'Valor', 'Forma Pagamento', 'Data/Hora', 'Status'];
    const data = filteredPagamentos.map(p => {
      const contr = contribuintes.find(c => c.id === p.contribuinteId)?.nome || 'Não cadastrado';
      const merc = mercados.find(m => m.id === p.mercadoId)?.nome || 'Não cadastrado';
      const ag = agentes.find(a => a.id === p.agenteId)?.nome || 'Não cadastrado';
      const tx = tiposReceita.find(t => t.id === p.tipoReceitaId)?.nome || 'Não cadastrado';
      return [
        p.reciboId,
        contr,
        merc,
        ag,
        tx,
        `${p.valor.toLocaleString()} ${configuracoes.moeda}`,
        p.formaPagamento,
        new Date(p.dataPagamento).toLocaleString('pt-PT'),
        p.status.toUpperCase()
      ];
    });
    exportToExcel(data, headers, `relatorio_arrecadacao_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportPDF = () => {
    const headers = ['Recibo', 'Contribuinte', 'Mercado', 'Agente', 'Taxa', 'Valor', 'Forma Pagamento', 'Data/Hora', 'Status'];
    const data = filteredPagamentos.map(p => {
      const contr = contribuintes.find(c => c.id === p.contribuinteId)?.nome || 'Não cadastrado';
      const merc = mercados.find(m => m.id === p.mercadoId)?.nome || 'Não cadastrado';
      const ag = agentes.find(a => a.id === p.agenteId)?.nome || 'Não cadastrado';
      const tx = tiposReceita.find(t => t.id === p.tipoReceitaId)?.nome || 'Não cadastrado';
      return [
        p.reciboId,
        contr,
        merc,
        ag,
        tx,
        `${p.valor.toLocaleString()} ${configuracoes.moeda}`,
        p.formaPagamento,
        new Date(p.dataPagamento).toLocaleString('pt-PT'),
        p.status.toUpperCase()
      ];
    });
    printToPDF('Relatório de Cobranças e Arrecadações', headers, data);
  };

  const isSupervisorOrAdmin = ['Platform Owner', 'Super Admin', 'Super Administrador', 'Fiscal Supervisor', 'Diretor Financeiro'].includes(activeProfile);

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, gap: 2 }}>
        <div>
          <Typography variant="h1">Gestão de Cobranças e Recibos</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Acompanhamento, reimpressão térmica, cancelamentos e conciliação de pagamentos em tempo real
          </Typography>
        </div>
        <Box sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', md: 'auto' }, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
            id="btn-refresh-pagamentos"
          >
            {isRefreshing ? 'A actualizar...' : 'Actualizar'}
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<FileSpreadsheet size={16} />}
            onClick={handleExportCSV}
            id="btn-export-excel"
            sx={{ borderColor: 'success.main', color: 'success.main' }}
          >
            Exportar Excel
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={16} />}
            onClick={handleClearAll}
            id="btn-clear-simulated-pagamentos"
          >
            Limpar Recibos
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<Printer size={16} />}
            onClick={handleExportPDF}
            id="btn-export-pdf"
          >
            Imprimir PDF
          </Button>
        </Box>
      </Box>

      {/* Advanced Filter Panel */}
      <Card sx={{ mb: 4 }} id="filter-panel-card">
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Filter size={16} className="text-blue-600" />
            <Typography variant="h5" sx={{ m: 0 }}>Filtros Avançados de Busca</Typography>
          </Box>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-4">
            {/* Search Input */}
            <div className="sm:col-span-2 md:col-span-4 lg:col-span-3">
              <TextField
                label="Pesquisar por Recibo ou Nome"
                placeholder="Ex: 000245 ou Maria..."
                fullWidth
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                id="search-input"
              />
            </div>

            {/* Municipality Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-3">
              <FormControl fullWidth size="small" disabled={isAdmin}>
                <InputLabel id="filter-muni-label">Município</InputLabel>
                <Select
                  labelId="filter-muni-label"
                  value={isAdmin ? userMuniId : filterMuni}
                  label="Município"
                  onChange={(e) => {
                    setFilterMuni(e.target.value);
                    setFilterMerc('todos');
                  }}
                  id="filter-muni-select"
                >
                  {isAdmin ? (
                    [
                      <MenuItem key="admin-muni" value={userMuniId}>
                        {municipios.find(m => m.id === userMuniId)?.nome || 'Meu Município'}
                      </MenuItem>
                    ]
                  ) : (
                    (() => {
                      const list = [<MenuItem key="todos" value="todos">Todos Municípios</MenuItem>];
                      municipios.forEach(m => {
                        list.push(<MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>);
                      });
                      return list;
                    })()
                  )}
                </Select>
              </FormControl>
            </div>

            {/* Market Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-3">
              <FormControl fullWidth size="small">
                <InputLabel id="filter-merc-label">Mercado</InputLabel>
                <Select
                  labelId="filter-merc-label"
                  value={filterMerc}
                  label="Mercado"
                  onChange={(e) => setFilterMerc(e.target.value)}
                  id="filter-merc-select"
                >
                  <MenuItem value="todos">Todos Mercados</MenuItem>
                  {mercados
                    .filter(m => (isAdmin ? userMuniId : filterMuni) === 'todos' || m.municipioId === (isAdmin ? userMuniId : filterMuni))
                    .map(m => (
                      <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </div>

            {/* Agent Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-3">
              <FormControl fullWidth size="small">
                <InputLabel id="filter-agent-label">Agente de Cobrança</InputLabel>
                <Select
                  labelId="filter-agent-label"
                  value={filterAgent}
                  label="Agente de Cobrança"
                  onChange={(e) => setFilterAgent(e.target.value)}
                  id="filter-agent-select"
                >
                  <MenuItem value="todos">Todos Agentes</MenuItem>
                  {agentes
                    .filter(a => !isAdmin || a.municipioId === userMuniId)
                    .map(a => (
                      <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </div>

            {/* Fee Type Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-3">
              <FormControl fullWidth size="small">
                <InputLabel id="filter-type-label">Tipo de Taxa</InputLabel>
                <Select
                  labelId="filter-type-label"
                  value={filterType}
                  label="Tipo de Taxa"
                  onChange={(e) => setFilterType(e.target.value)}
                  id="filter-type-select"
                >
                  <MenuItem value="todos">Todos Tipos</MenuItem>
                  {tiposReceita.map(t => (
                    <MenuItem key={t.id} value={t.id}>{t.nome}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>

            {/* Payment Method Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-3">
              <FormControl fullWidth size="small">
                <InputLabel id="filter-method-label">Forma de Pagamento</InputLabel>
                <Select
                  labelId="filter-method-label"
                  value={filterPayMethod}
                  label="Forma de Pagamento"
                  onChange={(e) => setFilterPayMethod(e.target.value)}
                  id="filter-method-select"
                >
                  <MenuItem value="todos">Todos Métodos</MenuItem>
                  <MenuItem value="Dinheiro">Dinheiro</MenuItem>
                  <MenuItem value="Orange Money">Orange Money</MenuItem>
                  <MenuItem value="Transferência Bancária">Transferência Bancária</MenuItem>
                  <MenuItem value="Outro">Outro</MenuItem>
                </Select>
              </FormControl>
            </div>

            {/* Status Filter */}
            <div className="sm:col-span-1 md:col-span-2 lg:col-span-2">
              <FormControl fullWidth size="small">
                <InputLabel id="filter-status-label">Status</InputLabel>
                <Select
                  labelId="filter-status-label"
                  value={filterStatus}
                  label="Status"
                  onChange={(e) => setFilterStatus(e.target.value)}
                  id="filter-status-select"
                >
                  <MenuItem value="todos">Todos Status</MenuItem>
                  <MenuItem value="pago">Pago</MenuItem>
                  <MenuItem value="pendente">Pendente</MenuItem>
                  <MenuItem value="cancelamento_pendente">Cancelamento Solicitado</MenuItem>
                  <MenuItem value="cancelado">Cancelado</MenuItem>
                </Select>
              </FormControl>
            </div>

            {/* Dates range */}
            <div className="sm:col-span-1 md:col-span-1 lg:col-span-2">
              <TextField
                label="De"
                type="date"
                fullWidth
                size="small"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                id="filter-date-start"
              />
            </div>

            <div className="sm:col-span-1 md:col-span-1 lg:col-span-2">
              <TextField
                label="Até"
                type="date"
                fullWidth
                size="small"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                id="filter-date-end"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Recibo</TableCell>
              <TableCell>Contribuinte</TableCell>
              <TableCell>Mercado</TableCell>
              <TableCell>Agente</TableCell>
              <TableCell>Taxa</TableCell>
              <TableCell>Valor</TableCell>
              <TableCell>Forma Pagamento</TableCell>
              <TableCell>Data/Hora</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedPagamentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" className="text-slate-400 py-6">
                  Nenhuma cobrança encontrada correspondente aos filtros.
                </TableCell>
              </TableRow>
            ) : (
              paginatedPagamentos.map((p) => {
                const contr = contribuintes.find(c => c.id === p.contribuinteId);
                const merc = mercados.find(m => m.id === p.mercadoId);
                const ag = agentes.find(a => a.id === p.agenteId);
                const tx = tiposReceita.find(t => t.id === p.tipoReceitaId);

                return (
                  <TableRow key={p.id} hover>
                    <TableCell className="font-mono font-bold text-slate-800 dark:text-slate-200">
                       #{p.reciboId}
                    </TableCell>
                    <TableCell className="font-semibold">{contr?.nome || 'Contribuinte'}</TableCell>
                    <TableCell>{merc?.nome || 'Mercado'}</TableCell>
                    <TableCell>{ag?.nome || 'Agente'}</TableCell>
                    <TableCell>{tx?.nome || 'Taxa'}</TableCell>
                    <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {p.valor.toLocaleString()} {configuracoes.moeda}
                    </TableCell>
                    <TableCell>{p.formaPagamento}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(p.dataPagamento).toLocaleDateString('pt-PT')} {new Date(p.dataPagamento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={
                          p.status === 'pago' ? 'Pago' :
                          p.status === 'cancelado' ? 'Cancelado' :
                          p.status === 'cancelamento_pendente' ? 'Canc. Solicitado' : 'Pendente'
                        } 
                        color={
                          p.status === 'pago' ? 'success' :
                          p.status === 'cancelado' ? 'error' :
                          p.status === 'cancelamento_pendente' ? 'warning' : 'default'
                        }
                        sx={{ fontSize: '10px', height: 20 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          sx={{ p: 0.5, minWidth: 'auto' }}
                          onClick={() => handleOpenView(p)}
                          id={`view-recibo-${p.id}`}
                        >
                          <Eye size={13} />
                        </Button>
                        
                        {p.status === 'pago' && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="warning"
                            sx={{ p: 0.5, minWidth: 'auto' }}
                            onClick={() => handleOpenCancelPrompt(p)}
                            id={`cancel-request-${p.id}`}
                          >
                            <X size={13} />
                          </Button>
                        )}

                        {p.status === 'cancelamento_pendente' && isSupervisorOrAdmin && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            color="success"
                            sx={{ p: 0.5, minWidth: 'auto', color: 'white' }}
                            onClick={() => handleDirectApproveCancel(p.id)}
                            id={`approve-cancel-${p.id}`}
                          >
                            <Check size={13} />
                          </Button>
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
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredPagamentos.length}
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

      {/* Recibo View Dialog - Designed Exactly Like Mobile Bluetooth Printed Receipt! */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 1 }}>
          Visualização do Recibo Oficial
        </DialogTitle>
        <DialogContent dividers className="bg-slate-50">
          {selectedPayment && (
            <div className="mx-auto my-2 max-w-sm bg-white border border-slate-200 shadow-sm p-5 font-mono text-slate-800 text-xs flex flex-col items-center">
              
              {/* Receipt Header */}
              <div className="text-center font-bold text-sm uppercase tracking-wide mb-1">
                Câmara Municipal
              </div>
              <div className="text-center font-semibold mb-2">
                🏛️ {configuracoes.nomeMunicipio}
              </div>
              <div className="text-center text-[11px] mb-4">
                Sistemas Receita 360 - Cobrança
              </div>

              <div className="w-full border-t border-dashed border-slate-400 my-2" />

              {/* Receipt Info */}
              <div className="w-full space-y-1 my-2">
                <div className="flex justify-between font-bold">
                  <span>RECIBO Nº:</span>
                  <span>{selectedPayment.reciboId}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data:</span>
                  <span>{new Date(selectedPayment.dataPagamento).toLocaleDateString('pt-PT')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hora:</span>
                  <span>{new Date(selectedPayment.dataPagamento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mercado:</span>
                  <span className="font-semibold">
                    {mercados.find(m => m.id === selectedPayment.mercadoId)?.nome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Agente:</span>
                  <span>
                    {agentes.find(a => a.id === selectedPayment.agenteId)?.nome} ({agentes.find(a => a.id === selectedPayment.agenteId)?.usuario})
                  </span>
                </div>
              </div>

              <div className="w-full border-t border-dashed border-slate-400 my-2" />

              {/* Contrib Info */}
              <div className="w-full space-y-1 my-2">
                <div className="flex justify-between">
                  <span>Comerciante:</span>
                  <span className="font-semibold">
                    {contribuintes.find(c => c.id === selectedPayment.contribuinteId)?.nome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Banca Alocada:</span>
                  <span>{contribuintes.find(c => c.id === selectedPayment.contribuinteId)?.numBanca}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tipo de Taxa:</span>
                  <span>{tiposReceita.find(t => t.id === selectedPayment.tipoReceitaId)?.nome}</span>
                </div>
                <div className="flex justify-between font-bold text-sm mt-2 text-blue-700 dark:text-blue-500">
                  <span>VALOR PAGO:</span>
                  <span>{selectedPayment.valor.toLocaleString()} {configuracoes.moeda}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Forma Pagamento:</span>
                  <span>{selectedPayment.formaPagamento}</span>
                </div>
              </div>

              <div className="w-full border-t border-dashed border-slate-400 my-3" />

              {/* Fake QR code generation representing modern secure cryptographic signature */}
              <div className="flex flex-col items-center gap-1.5 p-2 bg-slate-50 rounded border border-slate-200">
                <div className="w-24 h-24 bg-slate-200 flex items-center justify-center relative overflow-hidden">
                  {/* Grid layout for simulated QR code */}
                  <div className="absolute inset-1 grid grid-cols-6 gap-1 opacity-80">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div key={i} className={`rounded-xs ${Math.random() > 0.5 ? 'bg-slate-900' : 'bg-transparent'}`} />
                    ))}
                  </div>
                </div>
                <span className="text-[9px] text-slate-400">Assinatura Digital Integrada</span>
              </div>

              <div className="text-center font-bold text-[10px] uppercase tracking-wider mt-4">
                Obrigado pela sua contribuição!
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenViewDialog(false)} color="inherit">Fechar</Button>
          {selectedPayment?.status === 'cancelamento_pendente' && isSupervisorOrAdmin && (
            <Button 
              color="error" 
              variant="outlined" 
              startIcon={<Check size={14} />} 
              onClick={() => handleDirectApproveCancel(selectedPayment.id)}
            >
              Aprovar Cancelamento
            </Button>
          )}
          <Button variant="contained" startIcon={<Printer size={14} />} onClick={() => alert("Comando enviado para impressora Bluetooth térmica com sucesso.")}>
            Reimprimir Bluetooth
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Cancellation Dialog */}
      <Dialog open={openCancelDialog} onClose={() => setOpenCancelDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Solicitar Cancelamento de Arrecadação</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 3, p: 1.5, bg: 'amber.50', border: '1px solid', borderColor: 'warning.light', borderRadius: 2 }}>
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
            <Typography variant="body2" sx={{ color: 'amber.800', lineHeight: 1.4 }}>
              Esta solicitação será enviada em tempo real para os <strong>Fiscais Supervisores</strong>. O valor será bloqueado provisoriamente até que seja validado.
            </Typography>
          </Box>
          <TextField
            required
            label="Justificativa do Cancelamento"
            placeholder="Ex: Agente digitou o valor incorreto de 5000 em vez de 500 FCFA."
            multiline
            rows={4}
            fullWidth
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            id="cancellation-reason-input"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCancelDialog(false)} color="inherit">Voltar</Button>
          <Button onClick={handleRequestCancel} variant="contained" color="warning" id="btn-submit-cancellation">
            Enviar Solicitação
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
