import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Search, Shield, Cpu, RefreshCw, LogIn, FileText, Ban, FileSpreadsheet, Printer } from 'lucide-react';
import { 
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Chip, FormControl, Select, MenuItem, InputLabel, Button,
  TablePagination
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function Auditoria() {
  const { auditoriaLogs, usuarios, agentes, activeProfile, currentUser, addNotification } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('todos');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  // Filter audit logs to only show actions by municipal users/agents if the current user is an admin
  const allowedLogs = React.useMemo(() => {
    if (!isAdmin) return auditoriaLogs;
    const allowedUserNames = new Set([
      currentUser?.nome?.toLowerCase(),
      currentUser?.email?.toLowerCase(),
      ...usuarios.filter(u => u.municipioId === userMuniId).map(u => u.nome.toLowerCase()),
      ...usuarios.filter(u => u.municipioId === userMuniId).map(u => u.email.toLowerCase()),
      ...agentes.filter(a => a.municipioId === userMuniId).map(a => a.nome.toLowerCase()),
      ...agentes.filter(a => a.municipioId === userMuniId).map(a => a.usuario.toLowerCase())
    ].filter(Boolean));
    return auditoriaLogs.filter(log => {
      const logUser = log.usuario.toLowerCase();
      return allowedUserNames.has(logUser);
    });
  }, [auditoriaLogs, usuarios, agentes, currentUser, isAdmin, userMuniId]);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setFilterAction('todos');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Logs de auditoria e monitorização de segurança actualizados.',
        type: 'success'
      });
    }, 600);
  };

  const filteredLogs = allowedLogs.filter(log => {
    const matchSearch = searchTerm === '' || 
      log.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.descricao.toLowerCase().includes(searchTerm.toLowerCase());

    const matchAction = filterAction === 'todos' || log.acao === filterAction;

    return matchSearch && matchAction;
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filteredLogs.length / rowsPerPage) - 1));
  const paginatedLogs = filteredLogs.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleExportExcel = () => {
    const headers = ['Ação', 'Usuário', 'Perfil', 'Descrição', 'Data / Hora', 'IP Conexão', 'Dispositivo'];
    const data = filteredLogs.map(log => [
      log.acao.toUpperCase(),
      log.usuario,
      log.perfil,
      log.descricao,
      `${log.data} ${log.hora}`,
      log.ip,
      log.dispositivo
    ]);
    exportToExcel(data, headers, 'auditoria_logs');
  };

  const handlePrintPDF = () => {
    const headers = ['Ação', 'Usuário', 'Perfil', 'Descrição', 'Data / Hora', 'IP Conexão', 'Dispositivo'];
    const data = filteredLogs.map(log => [
      log.acao.toUpperCase(),
      log.usuario,
      log.perfil,
      log.descricao,
      `${log.data} ${log.hora}`,
      log.ip,
      log.dispositivo
    ]);
    printToPDF('Logs de Auditoria de Segurança', headers, data);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h1">Logs de Auditoria de Segurança</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Rastreabilidade completa de ações administrativas, sincronizações offline, autenticações e cancelamentos
        </Typography>
      </Box>

      {/* Filter and Search Bar using Tailwind grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4 mb-8">
        <div className="md:col-span-4">
          <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xs w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por usuário ou descrição de evento..."
              className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
              id="auditoria-search"
            />
          </div>
        </div>

        <div className="md:col-span-3">
          <FormControl fullWidth size="small" sx={{ bg: 'background.paper' }}>
            <InputLabel id="action-filter-label">Filtrar por Ação</InputLabel>
            <Select
              labelId="action-filter-label"
              id="action-filter"
              value={filterAction}
              label="Filtrar por Ação"
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <MenuItem value="todos">Todas Ações</MenuItem>
              <MenuItem value="login">Autenticações (Login)</MenuItem>
              <MenuItem value="criacao">Criação (Insert)</MenuItem>
              <MenuItem value="alteracao">Alteração (Update)</MenuItem>
              <MenuItem value="exclusao">Exclusão (Delete)</MenuItem>
              <MenuItem value="cancelamento">Cancelamentos de Recibo</MenuItem>
              <MenuItem value="reimpressao">Reimpressões Térmicas</MenuItem>
              <MenuItem value="sincronizacao">Sincronizações Offline</MenuItem>
              <MenuItem value="backup">Backups da Base de Dados</MenuItem>
              <MenuItem value="restore">Restauros da Base de Dados</MenuItem>
            </Select>
          </FormControl>
        </div>

        <div className="md:col-span-5 flex items-center gap-2">
          <Button
            variant="outlined"
            color="primary"
            fullWidth
            startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
            sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
            id="btn-refresh-auditoria"
          >
            {isRefreshing ? 'A actualizar...' : 'Actualizar'}
          </Button>
          <Button
            variant="outlined"
            color="success"
            fullWidth
            startIcon={<FileSpreadsheet size={14} />}
            onClick={handleExportExcel}
            sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
            id="btn-excel-auditoria"
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            fullWidth
            startIcon={<Printer size={14} />}
            onClick={handlePrintPDF}
            sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
            id="btn-pdf-auditoria"
          >
            PDF
          </Button>
        </div>
      </div>

      {/* Logs Table */}
      <TableContainer component={Paper}>
        <Table size="small" className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Ação</TableCell>
              <TableCell>Usuário / Operador</TableCell>
              <TableCell>Descrição do Evento</TableCell>
              <TableCell>Data / Hora</TableCell>
              <TableCell>IP Conexão</TableCell>
              <TableCell>Terminal / Dispositivo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" className="text-slate-400 py-6">
                  Nenhum registro de auditoria encontrado para os critérios de busca.
                </TableCell>
              </TableRow>
            ) : (
              paginatedLogs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>
                    <Chip 
                      size="small" 
                      label={log.acao.toUpperCase()} 
                      color={
                        log.acao === 'login' ? 'primary' :
                        log.acao === 'criacao' ? 'success' :
                        log.acao === 'sincronizacao' ? 'secondary' :
                        log.acao === 'exclusao' ? 'error' : 'default'
                      }
                      sx={{ fontSize: '9px', fontWeight: 700, height: 18 }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">{log.usuario}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.perfil}</div>
                  </TableCell>
                  <TableCell className="text-xs max-w-md">{log.descricao}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500 whitespace-nowrap">
                    {log.data} {log.hora}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{log.ip}</TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap truncate max-w-[150px]" title={log.dispositivo}>
                    {log.dispositivo}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredLogs.length}
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
    </Box>
  );
}
