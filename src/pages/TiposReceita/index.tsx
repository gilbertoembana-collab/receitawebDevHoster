import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { TipoReceita, PeriodicidadeTaxa } from '../../types';
import FormattedCurrencyInput from '../../components/FormattedCurrencyInput';
import { Plus, Edit2, Trash2, Search, Percent, RefreshCw, FileSpreadsheet, Printer } from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, InputLabel, InputAdornment,
  TablePagination
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function TiposReceita() {
  const { tiposReceita, addTipoReceita, updateTipoReceita, deleteTipoReceita, activeProfile, configuracoes, addNotification } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<TipoReceita | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
        message: 'Tabela de parametrização de taxas actualizada.',
        type: 'success'
      });
    }, 600);
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<number>(500);
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeTaxa>('Diária');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [formErrors, setFormErrors] = useState<{ nome?: string; valor?: string }>({});

  const filtered = tiposReceita.filter(t => 
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.periodicidade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = tiposReceita.filter(t => 
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.periodicidade.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setNome('');
    setDescricao('');
    setValor(500);
    setPeriodicidade('Diária');
    setStatus('ativo');
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: TipoReceita) => {
    setEditingItem(item);
    setNome(item.nome);
    setDescricao(item.descricao);
    setValor(item.valor);
    setPeriodicidade(item.periodicidade);
    setStatus(item.status);
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const validationErrors: typeof formErrors = {};
    if (!nome.trim()) validationErrors.nome = 'Informe o nome da taxa.';
    if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) validationErrors.valor = 'Informe um valor superior a zero.';
    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      addNotification({
        title: 'Verifique os campos obrigatórios',
        message: 'Corrija os campos assinalados a vermelho antes de guardar.',
        type: 'warning',
      });
      return;
    }

    const payload = { nome: nome.trim(), descricao: descricao.trim(), valor: Number(valor), periodicidade, status };

    if (editingItem) {
      updateTipoReceita(editingItem.id, payload);
    } else {
      try {
        await addTipoReceita(payload);
      } catch (error) {
        addNotification({
          title: 'Impossível registar tipo de receita',
          message: error instanceof Error ? error.message : 'Não foi possível comunicar com o servidor. Tente novamente.',
          type: 'warning',
        });
        return;
      }
    }
    setOpenDialog(false);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      deleteTipoReceita(deleteId);
      setDeleteId(null);
    }
  };

  const canEdit = ['Platform Owner', 'Super Admin', 'Super Administrador', 'Departamento de Mercados'].includes(activeProfile);

  const handleExportExcel = () => {
    const headers = ['Nome da Taxa', 'Descrição', 'Valor', 'Periodicidade', 'Status'];
    const data = filtered.map(t => [
      t.nome,
      t.descricao,
      `${t.valor.toLocaleString()} ${configuracoes.moeda}`,
      t.periodicidade,
      t.status === 'ativo' ? 'Ativo' : 'Inativo'
    ]);
    exportToExcel(data, headers, 'tipos_receita');
  };

  const handlePrintPDF = () => {
    const headers = ['Nome da Taxa', 'Descrição', 'Valor', 'Periodicidade', 'Status'];
    const data = filtered.map(t => [
      t.nome,
      t.descricao,
      `${t.valor.toLocaleString()} ${configuracoes.moeda}`,
      t.periodicidade,
      t.status === 'ativo' ? 'Ativo' : 'Inativo'
    ]);
    printToPDF('Tipos de Receita (Taxas Municipais)', headers, data);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h1">Tipos de Receita (Taxas Municipais)</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Parametrização de alíquotas, taxas, periodicidades de cobrança e licenças de funcionamento municipal
          </Typography>
        </div>
        {canEdit && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenAdd}
            id="btn-add-tipo-receita"
          >
            Adicionar Tipo de Receita
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
            placeholder="Pesquisar taxa municipal por nome, descrição, periodicidade..."
            className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
            id="tipos-receita-search"
          />
        </div>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-refresh-tipos-receita"
        >
          {isRefreshing ? 'A actualizar...' : 'Actualizar'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          startIcon={<FileSpreadsheet size={14} />}
          onClick={handleExportExcel}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
          id="btn-excel-tipos-receita"
        >
          Exportar Excel
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<Printer size={14} />}
          onClick={handlePrintPDF}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-pdf-tipos-receita"
        >
          Imprimir PDF
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Nome da Taxa</TableCell>
              <TableCell>Descrição do Fato Gerador</TableCell>
              <TableCell>Valor Estipulado</TableCell>
              <TableCell>Periodicidade</TableCell>
              <TableCell>Status</TableCell>
              {canEdit && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" className="text-slate-400 py-6">
                  Nenhum tipo de receita cadastrado ou correspondente à busca.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell className="font-semibold text-slate-900 dark:text-white">{t.nome}</TableCell>
                  <TableCell className="text-xs max-w-sm" title={t.descricao}>{t.descricao}</TableCell>
                  <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                    {t.valor.toLocaleString()} {configuracoes.moeda}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small" 
                      label={t.periodicidade} 
                      color={
                        t.periodicidade === 'Diária' ? 'primary' :
                        t.periodicidade === 'Semanal' ? 'secondary' :
                        t.periodicidade === 'Mensal' ? 'warning' : 'default'
                      }
                      sx={{ fontSize: '10px', height: 18 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small" 
                      label={t.status === 'ativo' ? 'Ativo' : 'Inativo'} 
                      color={t.status === 'ativo' ? 'success' : 'default'}
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
                          onClick={() => handleOpenEdit(t)}
                          sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                          id={`edit-tax-${t.id}`}
                        >
                          Editar
                        </Button>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="error" 
                          startIcon={<Trash2 size={13} />}
                          onClick={() => handleDelete(t.id)}
                          sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                          id={`delete-tax-${t.id}`}
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
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingItem ? 'Editar Tipo de Receita' : 'Cadastrar Nova Taxa / Licença'}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <TextField
              required
              label="Nome da Taxa / Tributo"
              fullWidth
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (e.target.value.trim()) setFormErrors(errors => ({ ...errors, nome: undefined }));
              }}
              size="small"
              className="col-span-2"
              id="tax-field-nome"
              error={Boolean(formErrors.nome)}
              helperText={formErrors.nome}
            />
            
            <TextField
              label="Fato Gerador / Descrição da Taxa"
              multiline
              rows={3}
              fullWidth
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              size="small"
              className="col-span-2"
              id="tax-field-desc"
            />

            <FormattedCurrencyInput
              required
              label="Valor Unitário"
              currencySymbol={configuracoes.moeda}
              fullWidth
              value={valor}
              onChange={(val) => {
                setValor(val);
                if (val > 0) setFormErrors(errors => ({ ...errors, valor: undefined }));
              }}
              size="small"
              id="tax-field-valor"
              error={Boolean(formErrors.valor)}
              helperText={formErrors.valor}
            />

            <FormControl fullWidth size="small" required>
              <InputLabel id="periodicidade-label">Periodicidade</InputLabel>
              <Select
                labelId="periodicidade-label"
                value={periodicidade}
                label="Periodicidade"
                onChange={(e) => setPeriodicidade(e.target.value as PeriodicidadeTaxa)}
                id="tax-field-period"
              >
                <MenuItem value="Diária">Diária</MenuItem>
                <MenuItem value="Semanal">Semanal</MenuItem>
                <MenuItem value="Mensal">Mensal</MenuItem>
                <MenuItem value="Anual">Anual (Licenciamento)</MenuItem>
                <MenuItem value="Outros">Outros / Avulso</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-tax-label">Status</InputLabel>
              <Select
                labelId="status-tax-label"
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as any)}
                id="tax-field-status"
              >
                <MenuItem value="ativo">Ativo (Permitir cobrança)</MenuItem>
                <MenuItem value="inativo">Inativo (Não mostrar no app)</MenuItem>
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-tax">Salvar Parametrização</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão de Segurança */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Confirmar Exclusão de Tipo de Receita/Taxa
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1">
            Deseja realmente excluir esta taxa de receita? Esta ação é irreversível e impedirá novas cobranças desta taxa no aplicativo móvel.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
            Nota: Para fins de rastreabilidade de segurança e conformidade, esta ação será registrada nos logs de auditoria contendo sua identificação.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)} color="inherit" variant="outlined" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }} id="confirm-delete-tax-btn">
            Excluir de Forma Permanente
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
