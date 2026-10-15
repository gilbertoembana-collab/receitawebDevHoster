import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Mercado } from '../../types';
import { Plus, Edit2, Trash2, Search, MapPin, RefreshCw, FileSpreadsheet, Printer } from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, FormHelperText, Select, MenuItem, InputLabel,
  TablePagination
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function Mercados() {
  const { mercados, municipios, pagamentos, addMercado, updateMercado, deleteMercado, activeProfile, addNotification, currentUser } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Mercado | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const handleRefresh = () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setPage(0);
    setTimeout(() => {
      setIsRefreshing(false);
      addNotification({
        title: 'Sincronização',
        message: 'Lista de mercados públicos cadastrados actualizada.',
        type: 'success'
      });
    }, 600);
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [lat, setLat] = useState<number>(11.85);
  const [lng, setLng] = useState<number>(-15.58);
  const [gpsLabel, setGpsLabel] = useState('');
  const [qtdBancas, setQtdBancas] = useState<number>(50);
  const [responsavel, setResponsavel] = useState('');
  const [telefone, setTelefone] = useState('');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [formErrors, setFormErrors] = useState<{
    nome?: string;
    municipioId?: string;
    responsavel?: string;
    qtdBancas?: string;
  }>({});

  const filtered = mercados.filter(m => {
    if (isAdmin && m.municipioId !== userMuniId) {
      return false;
    }
    return (
      m.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.responsavel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      municipios.find(mu => mu.id === m.municipioId)?.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormErrors({});
    setNome('');
    setMunicipioId(isAdmin ? userMuniId : (municipios[0]?.id || ''));
    setLat(11.8598);
    setLng(-15.5822);
    setGpsLabel('Bissau Centro');
    setQtdBancas(100);
    setResponsavel('');
    setTelefone('');
    setStatus('ativo');
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: Mercado) => {
    setEditingItem(item);
    setFormErrors({});
    setNome(item.nome);
    setMunicipioId(item.municipioId);
    setLat(item.localizacaoGps.lat);
    setLng(item.localizacaoGps.lng);
    setGpsLabel(item.localizacaoGps.label);
    setQtdBancas(item.qtdBancas);
    setResponsavel(item.responsavel);
    setTelefone(item.telefone);
    setStatus(item.status);
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const targetMuniId = isAdmin ? userMuniId : municipioId;
    const validationErrors: typeof formErrors = {};
    if (!nome.trim()) validationErrors.nome = 'Informe o nome do mercado.';
    if (!targetMuniId) validationErrors.municipioId = 'Selecione o município.';
    if (!responsavel.trim()) validationErrors.responsavel = 'Informe o responsável.';
    if (!Number.isSafeInteger(Number(qtdBancas)) || Number(qtdBancas) <= 0) {
      validationErrors.qtdBancas = 'Informe uma quantidade de bancas superior a zero.';
    }
    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      addNotification({
        title: 'Campos Obrigatórios',
        message: 'Preencha os campos obrigatórios assinalados a vermelho.',
        type: 'warning'
      });
      return;
    }

    const payload = { 
      nome: nome.trim(), 
      municipioId: targetMuniId, 
      localizacaoGps: { lat: Number(lat), lng: Number(lng), label: gpsLabel.trim() || nome.trim() }, 
      qtdBancas: Number(qtdBancas), 
      responsavel: responsavel.trim(), 
      telefone: telefone.trim(), 
      status 
    };

    if (editingItem) {
      updateMercado(editingItem.id, payload);
      addNotification({
        title: 'Mercado Atualizado',
        message: `O mercado "${nome}" foi atualizado com sucesso.`,
        type: 'success'
      });
    } else {
      try {
        await addMercado(payload);
      } catch (error) {
        addNotification({
          title: 'Impossível registar mercado',
          message: error instanceof Error ? error.message : 'Não foi possível comunicar com o servidor. Tente novamente.',
          type: 'warning',
        });
        return;
      }
      addNotification({
        title: 'Mercado Cadastrado',
        message: `O mercado "${nome}" foi cadastrado com sucesso.`,
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
      const mercadoNome = mercados.find(m => m.id === deleteId)?.nome || '';
      deleteMercado(deleteId);
      addNotification({
        title: 'Mercado Removido',
        message: `O mercado "${mercadoNome}" foi excluído com sucesso.`,
        type: 'warning'
      });
      setDeleteId(null);
    }
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
    const headers = ['Nome do Mercado', 'Município', 'Quantidade de Bancas', 'Supervisor Responsável', 'Telefone de Contato', 'Status'];
    const data = filtered.map(m => {
      const muni = municipios.find(mu => mu.id === m.municipioId)?.nome || 'Não definido';
      return [
        m.nome,
        muni,
        m.qtdBancas.toString(),
        m.responsavel,
        m.telefone,
        m.status === 'ativo' ? 'Ativo' : 'Inativo'
      ];
    });
    exportToExcel(data, headers, 'mercados');
  };

  const handlePrintPDF = () => {
    const headers = ['Nome do Mercado', 'Município', 'Quantidade de Bancas', 'Supervisor Responsável', 'Telefone de Contato', 'Status'];
    const data = filtered.map(m => {
      const muni = municipios.find(mu => mu.id === m.municipioId)?.nome || 'Não definido';
      return [
        m.nome,
        muni,
        m.qtdBancas.toString(),
        m.responsavel,
        m.telefone,
        m.status === 'ativo' ? 'Ativo' : 'Inativo'
      ];
    });
    printToPDF('Mercados Municipais', headers, data);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h1">Gestão de Mercados</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Lista de mercados públicos municipais cadastrados com suas respectivas bancas comerciais
          </Typography>
        </div>
        {canEdit && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenAdd}
            id="btn-add-mercado"
          >
            Adicionar Mercado
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
            placeholder="Pesquisar mercado por nome, município ou responsável..."
            className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
            id="mercados-search"
          />
        </div>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-refresh-mercados"
        >
          {isRefreshing ? 'A actualizar...' : 'Actualizar'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          startIcon={<FileSpreadsheet size={14} />}
          onClick={handleExportExcel}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
          id="btn-excel-mercados"
        >
          Exportar Excel
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<Printer size={14} />}
          onClick={handlePrintPDF}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-pdf-mercados"
        >
          Imprimir PDF
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Mercado</TableCell>
              <TableCell>Município</TableCell>
              <TableCell>GPS Localização</TableCell>
              <TableCell>Qtd Bancas</TableCell>
              <TableCell>Responsável</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Status</TableCell>
              {canEdit && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" className="text-slate-400 py-6">
                  Nenhum mercado cadastrado ou correspondente à busca.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((m) => {
                const muni = municipios.find(mu => mu.id === m.municipioId);
                return (
                  <TableRow key={m.id} hover>
                    <TableCell className="font-semibold text-slate-900 dark:text-white">{m.nome}</TableCell>
                    <TableCell>{muni?.nome || 'Não definido'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        <MapPin size={11} className="text-red-500" />
                        {m.localizacaoGps.lat.toFixed(4)}, {m.localizacaoGps.lng.toFixed(4)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-300">{m.qtdBancas}</TableCell>
                    <TableCell>{m.responsavel}</TableCell>
                    <TableCell>{m.telefone}</TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={m.status === 'ativo' ? 'Ativo' : 'Inativo'} 
                        color={m.status === 'ativo' ? 'success' : 'default'}
                        sx={{ fontSize: 10, height: 20 }}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            startIcon={<Edit2 size={13} />}
                            onClick={() => handleOpenEdit(m)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`edit-merc-${m.id}`}
                          >
                            Editar
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="error" 
                            startIcon={<Trash2 size={13} />}
                            onClick={() => handleDelete(m.id)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`delete-merc-${m.id}`}
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
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingItem ? 'Editar Mercado' : 'Cadastrar Novo Mercado'}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <TextField
              required
              label="Nome do Mercado"
              fullWidth
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (e.target.value.trim()) setFormErrors(errors => ({ ...errors, nome: undefined }));
              }}
              size="small"
              className="col-span-2"
              id="merc-field-nome"
              error={Boolean(formErrors.nome)}
              helperText={formErrors.nome}
            />
            
            <FormControl fullWidth size="small" required disabled={isAdmin} error={Boolean(formErrors.municipioId)}>
              <InputLabel id="muni-label">Município Atribuído</InputLabel>
              <Select
                labelId="muni-label"
                value={isAdmin ? (currentUser?.municipioId || '') : municipioId}
                label="Município Atribuído"
                onChange={(e) => {
                  setMunicipioId(e.target.value);
                  if (e.target.value) setFormErrors(errors => ({ ...errors, municipioId: undefined }));
                }}
                id="merc-field-muni"
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

            <TextField
              required
              label="Quantidade de Bancas"
              type="number"
              fullWidth
              value={qtdBancas}
              onChange={(e) => {
                const value = Number(e.target.value);
                setQtdBancas(value);
                if (Number.isSafeInteger(value) && value > 0) {
                  setFormErrors(errors => ({ ...errors, qtdBancas: undefined }));
                }
              }}
              size="small"
              id="merc-field-bancas"
              error={Boolean(formErrors.qtdBancas)}
              helperText={formErrors.qtdBancas}
            />

            <TextField
              required
              label="Nome do Responsável / Administrador"
              fullWidth
              value={responsavel}
              onChange={(e) => {
                setResponsavel(e.target.value);
                if (e.target.value.trim()) setFormErrors(errors => ({ ...errors, responsavel: undefined }));
              }}
              size="small"
              className="col-span-2"
              id="merc-field-responsavel"
              error={Boolean(formErrors.responsavel)}
              helperText={formErrors.responsavel}
            />

            <TextField
              label="Telefone do Responsável"
              fullWidth
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              size="small"
              id="merc-field-telefone"
            />

            <TextField
              label="Etiqueta GPS (Ex: Bissau Centro)"
              fullWidth
              value={gpsLabel}
              onChange={(e) => setGpsLabel(e.target.value)}
              size="small"
              id="merc-field-gpslabel"
            />

            <TextField
              label="Latitude GPS"
              type="number"
              fullWidth
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              size="small"
              id="merc-field-lat"
            />

            <TextField
              label="Longitude GPS"
              type="number"
              fullWidth
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              size="small"
              id="merc-field-lng"
            />

            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-merc-label">Status</InputLabel>
              <Select
                labelId="status-merc-label"
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as any)}
                id="merc-field-status"
              >
                <MenuItem value="ativo">Ativo</MenuItem>
                <MenuItem value="inativo">Inativo</MenuItem>
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-mercado">Salvar Mercado</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão de Segurança */}
      {(() => {
        const hasLinkedPayments = deleteId ? pagamentos.some(p => p.mercadoId === deleteId) : false;
        return (
          <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
            <DialogTitle sx={{ fontWeight: 'bold', color: hasLinkedPayments ? 'warning.main' : 'error.main' }}>
              {hasLinkedPayments ? 'Exclusão Bloqueada (Rastreabilidade)' : 'Confirmar Exclusão do Mercado'}
            </DialogTitle>
            <DialogContent dividers>
              {hasLinkedPayments ? (
                <Box>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Não é possível excluir o mercado <strong>{mercados.find(m => m.id === deleteId)?.nome}</strong> porque existem dados de cobranças/arrecadações vinculados a ele.
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Para manter a integridade fiscal, conformidade e total rastreabilidade dos logs de auditoria e relatórios históricos de arrecadação, a exclusão de mercados com movimentação financeira ativa está desativada.
                  </Typography>
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderLeft: '4px solid', borderColor: 'warning.main', borderRadius: '0 4px 4px 0' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      Recomendação de Segurança:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Altere o status do mercado para <strong>"Inativo"</strong>. Isto desativará novas operações sem corromper ou deletar as arrecadações passadas correspondentes.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <>
                  <Typography variant="body1">
                    Deseja realmente excluir este mercado público? Esta ação é irreversível e removerá todas as associações de contribuintes e bancas correspondentes.
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
                <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }} id="confirm-delete-merc-btn">
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
