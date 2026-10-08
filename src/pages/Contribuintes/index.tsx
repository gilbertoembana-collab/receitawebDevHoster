import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Contribuinte } from '../../types';
import CameraPhotoDialog from '../../components/CameraPhotoDialog';
import QrScannerDialog from '../../components/QrScannerDialog';
import { 
  Plus, Edit2, Trash2, Search, Store, RefreshCw, 
  FileSpreadsheet, Printer, Camera, QrCode, Sparkles, 
  UserCheck, Maximize2, Image as ImageIcon, CheckCircle2 
} from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, InputLabel,
  TablePagination, InputAdornment, IconButton, Tooltip, Avatar
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

export default function Contribuintes() {
  const { 
    contribuintes, mercados, addContribuinte, updateContribuinte, 
    deleteContribuinte, activeProfile, addNotification, currentUser 
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Contribuinte | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialogs for Camera Capture & QR Code Scanning
  const [openPhotoDialog, setOpenPhotoDialog] = useState(false);
  const [openQrDialog, setOpenQrDialog] = useState(false);

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
        message: 'Lista de contribuintes e feirantes cadastrados actualizada.',
        type: 'success'
      });
    }, 600);
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [documento, setDocumento] = useState('');
  const [mercadoId, setMercadoId] = useState('');
  const [numBanca, setNumBanca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [atividade, setAtividade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [qrCode, setQrCode] = useState('');
  const [areaM2, setAreaM2] = useState<string | number>('');
  const [foto, setFoto] = useState('');
  const [fotoSizeKB, setFotoSizeKB] = useState<number>(0);

  const filtered = contribuintes.filter(c => {
    if (isAdmin) {
      const merc = mercados.find(m => m.id === c.mercadoId);
      if (!merc || merc.municipioId !== userMuniId) {
        return false;
      }
    }
    return (
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.numBanca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.categoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.qrCode && c.qrCode.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const currentPage = Math.max(0, Math.min(page, Math.ceil(filtered.length / rowsPerPage) - 1));
  const paginated = filtered.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setNome('');
    setTelefone('');
    const newDoc = `NIF-${Math.floor(Math.random() * 900000) + 100000}`;
    setDocumento(newDoc);
    setMercadoId(allowedMercados[0]?.id || '');
    setNumBanca('B-01');
    setCategoria('Alimentos');
    setAtividade('');
    setObservacoes('');
    setStatus('ativo');
    setQrCode(`QR-${newDoc.replace(/[^a-zA-Z0-9]/g, '')}`);
    setAreaM2(4.5);
    setFoto('');
    setFotoSizeKB(0);
    setOpenDialog(true);
  };

  const handleOpenEdit = (item: Contribuinte) => {
    setEditingItem(item);
    setNome(item.nome);
    setTelefone(item.telefone);
    setDocumento(item.documento);
    setMercadoId(item.mercadoId);
    setNumBanca(item.numBanca);
    setCategoria(item.categoria);
    setAtividade(item.atividade);
    setObservacoes(item.observacoes);
    setStatus(item.status);
    setQrCode(item.qrCode || `QR-${item.documento.replace(/[^a-zA-Z0-9]/g, '')}`);
    setAreaM2(item.areaM2 !== undefined ? item.areaM2 : '');
    setFoto(item.foto || '');
    setFotoSizeKB(item.foto ? Math.round((item.foto.length * 0.75 / 1024) * 10) / 10 : 0);
    setOpenDialog(true);
  };

  const handleSave = () => {
    if (!nome.trim() || !documento.trim() || !mercadoId || !numBanca.trim()) {
      addNotification({
        title: 'Erro de Validação',
        message: 'Por favor, preencha os campos obrigatórios (Nome, Documento, Mercado e Banca).',
        type: 'warning'
      });
      return;
    }

    const payload: any = { 
      nome: nome.trim(), 
      telefone: telefone.trim(), 
      documento: documento.trim().toUpperCase(), 
      mercadoId, 
      numBanca: numBanca.trim().toUpperCase(), 
      categoria: categoria.trim(), 
      atividade: atividade.trim(), 
      observacoes: observacoes.trim(), 
      status,
      qrCode: qrCode.trim() || undefined,
      areaM2: areaM2 !== '' && !isNaN(Number(areaM2)) ? Number(areaM2) : undefined,
      foto: foto || undefined
    };

    if (editingItem) {
      updateContribuinte(editingItem.id, payload);
      addNotification({
        title: 'Contribuinte Atualizado',
        message: `O contribuinte "${nome.trim()}" foi atualizado com sucesso no banco de dados.`,
        type: 'success'
      });
    } else {
      addContribuinte(payload);
      addNotification({
        title: 'Contribuinte Cadastrado',
        message: `O contribuinte "${nome.trim()}" foi cadastrado com sucesso no banco de dados.`,
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
      const contrNome = contribuintes.find(c => c.id === deleteId)?.nome || '';
      deleteContribuinte(deleteId);
      addNotification({
        title: 'Contribuinte Removido',
        message: `O contribuinte "${contrNome}" foi excluído com sucesso.`,
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
    const headers = ['Nome', 'Documento / NIF', 'QR Code', 'Mercado', 'Banca / Loja', 'Área (m²)', 'Categoria', 'Status'];
    const data = filtered.map(c => {
      const merc = mercados.find(m => m.id === c.mercadoId)?.nome || 'Não definido';
      return [
        c.nome,
        c.documento,
        c.qrCode || '-',
        merc,
        c.numBanca,
        c.areaM2 ? `${c.areaM2} m²` : '-',
        c.categoria,
        c.status === 'ativo' ? 'Ativo' : 'Inativo'
      ];
    });
    exportToExcel(data, headers, 'contribuintes');
  };

  const handlePrintPDF = () => {
    const headers = ['Nome', 'Documento / NIF', 'QR Code', 'Mercado', 'Banca / Loja', 'Área (m²)', 'Categoria', 'Status'];
    const data = filtered.map(c => {
      const merc = mercados.find(m => m.id === c.mercadoId)?.nome || 'Não definido';
      return [
        c.nome,
        c.documento,
        c.qrCode || '-',
        merc,
        c.numBanca,
        c.areaM2 ? `${c.areaM2} m²` : '-',
        c.categoria,
        c.status === 'ativo' ? 'Ativo' : 'Inativo'
      ];
    });
    printToPDF('Contribuintes (Feirantes)', headers, data);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h1">Gestão de Contribuintes (Feirantes)</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Cadastro completo de feirantes com fotos compactadas (&le;70 KB), QR Codes para leitura no POS e dimensões da banca (m²)
          </Typography>
        </div>
        {canEdit && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenAdd}
            id="btn-add-contribuinte"
          >
            Adicionar Contribuinte
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
            placeholder="Pesquisar feirante por nome, NIF, QR Code ou banca..."
            className="w-full pl-9 pr-4 py-2 text-xs border dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg outline-none focus:border-blue-500"
            id="contribuintes-search"
          />
        </div>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-refresh-contribuintes"
        >
          {isRefreshing ? 'A actualizar...' : 'Actualizar'}
        </Button>
        <Button
          variant="outlined"
          color="success"
          startIcon={<FileSpreadsheet size={14} />}
          onClick={handleExportExcel}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px', borderColor: 'success.main', color: 'success.main' }}
          id="btn-excel-contribuintes"
        >
          Exportar Excel
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<Printer size={14} />}
          onClick={handlePrintPDF}
          sx={{ height: 36, textTransform: 'none', fontSize: '12px' }}
          id="btn-pdf-contribuintes"
        >
          Imprimir PDF
        </Button>
      </div>

      <TableContainer component={Paper}>
        <Table className={isRefreshing ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Foto / Contribuinte</TableCell>
              <TableCell>Documento (NIF)</TableCell>
              <TableCell>QR Code (POS)</TableCell>
              <TableCell>Mercado Alocado</TableCell>
              <TableCell>Banca Nº</TableCell>
              <TableCell>Área (m²)</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Status</TableCell>
              {canEdit && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 9 : 8} align="center" className="text-slate-400 py-6">
                  Nenhum contribuinte cadastrado ou correspondente à busca.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => {
                const merc = mercados.find(m => m.id === c.mercadoId);
                return (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar 
                          src={c.foto} 
                          alt={c.nome}
                          sx={{ 
                            width: 38, 
                            height: 38, 
                            bgcolor: '#0B4EA2', 
                            fontSize: '14px', 
                            fontWeight: 700, 
                            border: '1.5px solid #e2e8f0' 
                          }}
                        >
                          {c.nome.charAt(0)}
                        </Avatar>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-xs">{c.nome}</div>
                          <div className="text-[10px] text-slate-400">{c.telefone || 'Sem contato'}</div>
                        </div>
                      </Box>
                    </TableCell>

                    <TableCell className="font-mono text-xs font-semibold">{c.documento}</TableCell>
                    
                    <TableCell>
                      {c.qrCode ? (
                        <Tooltip title={`Código QR: ${c.qrCode}`} arrow>
                          <Chip 
                            icon={<QrCode size={13} />} 
                            label={c.qrCode} 
                            size="small" 
                            variant="outlined"
                            sx={{ fontSize: '10px', height: 22, fontFamily: 'monospace', maxWidth: 140 }} 
                          />
                        </Tooltip>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Sem QR</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200">
                        <Store size={13} className="text-blue-500" />
                        {merc?.nome || 'Não alocado'}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-300">{c.numBanca}</TableCell>
                    
                    <TableCell>
                      {c.areaM2 ? (
                        <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border dark:border-slate-700">
                          {c.areaM2} m²
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip size="small" label={c.categoria} sx={{ fontSize: '10px', height: 18, bg: 'slate-100' }} />
                    </TableCell>

                    <TableCell>
                      <Chip 
                        size="small" 
                        label={c.status === 'ativo' ? 'Ativo' : 'Inativo'} 
                        color={c.status === 'ativo' ? 'success' : 'default'} 
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
                            onClick={() => handleOpenEdit(c)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`edit-cont-${c.id}`}
                          >
                            Editar
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="error" 
                            startIcon={<Trash2 size={13} />}
                            onClick={() => handleDelete(c.id)}
                            sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                            id={`delete-cont-${c.id}`}
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
          <span>{editingItem ? 'Editar Ficha do Contribuinte' : 'Cadastrar Novo Contribuinte'}</span>
          {editingItem && (
            <Chip 
              label={editingItem.documento} 
              color="primary" 
              variant="outlined" 
              size="small" 
              sx={{ fontWeight: 'bold', fontFamily: 'monospace' }} 
            />
          )}
        </DialogTitle>
        
        <DialogContent dividers>
          {/* SEÇÃO 1: FOTO DO CONTRIBUINTE (CAMERA & COMPRESSAO MAX 70 KB) */}
          <Box sx={{ 
            p: 2, 
            mb: 2.5, 
            bgcolor: 'background.default', 
            borderRadius: 2.5, 
            border: '1px solid', 
            borderColor: 'divider',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: 'center',
            gap: 2.5
          }}>
            <Box sx={{ position: 'relative' }}>
              <Avatar 
                src={foto} 
                alt="Foto Feirante" 
                sx={{ 
                  width: 76, 
                  height: 76, 
                  bgcolor: '#0B4EA2', 
                  fontSize: '26px', 
                  fontWeight: 700, 
                  border: '3px solid #cbd5e1',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                }}
              >
                {nome ? nome.charAt(0) : <Camera size={32} />}
              </Avatar>
              {foto && (
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm">
                  <CheckCircle2 size={16} />
                </div>
              )}
            </Box>

            <Box sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                <Camera size={16} className="text-blue-600" /> Foto do Comerciante
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                Tire uma foto ao vivo ou carregue da galeria. O sistema comprime automaticamente para &le; 70 KB para persistência direta no banco.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' }, alignItems: 'center' }}>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<Camera size={15} />}
                  onClick={() => setOpenPhotoDialog(true)}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '12px' }}
                  id="btn-tirar-foto-contribuinte"
                >
                  {foto ? 'Alterar Foto (Câmera)' : 'Tirar Foto (Câmera)'}
                </Button>

                {foto && (
                  <>
                    <Chip 
                      size="small" 
                      label={`${fotoSizeKB} KB (Otimizado)`} 
                      color="success" 
                      variant="outlined" 
                      sx={{ fontSize: '10px', height: 22, fontWeight: 700 }} 
                    />
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      onClick={() => { setFoto(''); setFotoSizeKB(0); }}
                      sx={{ textTransform: 'none', fontSize: '11px' }}
                    >
                      Remover
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          </Box>

          {/* SEÇÃO 2: FORMULÁRIO DE DADOS */}
          <div className="grid grid-cols-2 gap-4">
            <TextField
              required
              label="Nome do Comerciante"
              fullWidth
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              size="small"
              className="col-span-2"
              id="cont-field-nome"
            />
            
            <TextField
              required
              label="Documento de Identificação (NIF)"
              fullWidth
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              size="small"
              id="cont-field-documento"
            />

            <TextField
              label="Telefone de Contato"
              fullWidth
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              size="small"
              id="cont-field-telefone"
            />

            {/* Campo QR CODE com suporte a digitação ou scanner por câmera */}
            <TextField
              label="Código QR Code / Tag"
              fullWidth
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value.toUpperCase())}
              size="small"
              id="cont-field-qrcode"
              helperText="Identificador para leitura rápida no aplicativo do fiscal"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <QrCode size={16} className="text-blue-600" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Scanear com a câmera ou gerar QR Code" arrow>
                        <IconButton 
                          size="small" 
                          edge="end" 
                          onClick={() => setOpenQrDialog(true)}
                          color="primary"
                          id="btn-open-qr-scanner"
                        >
                          <Camera size={16} />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                  style: { fontFamily: 'monospace', fontWeight: 600 }
                }
              }}
            />

            {/* Campo ÁREA (m²) */}
            <TextField
              label="Área da Banca / Box"
              type="number"
              fullWidth
              value={areaM2}
              onChange={(e) => setAreaM2(e.target.value)}
              size="small"
              id="cont-field-area"
              helperText="Dimensão física utilizada para cálculo tributário"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Maximize2 size={16} className="text-slate-400" />
                    </InputAdornment>
                  ),
                  endAdornment: <InputAdornment position="end">m²</InputAdornment>,
                  style: { fontFamily: 'monospace', fontWeight: 600 }
                }
              }}
            />

            <FormControl fullWidth size="small" required>
              <InputLabel id="cont-merc-label">Mercado Alocado</InputLabel>
              <Select
                labelId="cont-merc-label"
                value={mercadoId}
                label="Mercado Alocado"
                onChange={(e) => setMercadoId(e.target.value)}
                id="cont-field-merc"
              >
                {allowedMercados.map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              required
              label="Número da Banca / Box"
              fullWidth
              value={numBanca}
              onChange={(e) => setNumBanca(e.target.value)}
              size="small"
              id="cont-field-banca"
            />

            <FormControl fullWidth size="small" required className="col-span-2">
              <InputLabel id="cont-cat-label">Categoria de Produto</InputLabel>
              <Select
                labelId="cont-cat-label"
                value={categoria}
                label="Categoria de Produto"
                onChange={(e) => setCategoria(e.target.value)}
                id="cont-field-cat"
              >
                {['Alimentos', 'Confecções', 'Eletrônicos', 'Carnes/Peixes', 'Cereais', 'Variedades', 'Artesanato', 'Outros'].map(cat => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Atividade Comercial Detalhada"
              placeholder="Ex: Venda de mandioca, batata-doce e legumes frescos"
              fullWidth
              value={atividade}
              onChange={(e) => setAtividade(e.target.value)}
              size="small"
              className="col-span-2"
              id="cont-field-atividade"
            />

            <TextField
              label="Observações Adicionais"
              multiline
              rows={2}
              fullWidth
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              size="small"
              className="col-span-2"
              id="cont-field-obs"
            />

            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-cont-label">Status</InputLabel>
              <Select
                labelId="status-cont-label"
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as any)}
                id="cont-field-status"
              >
                <MenuItem value="ativo">Ativo (Permitido operar)</MenuItem>
                <MenuItem value="inativo">Inativo (Bloqueado/Pendente)</MenuItem>
              </Select>
            </FormControl>
          </div>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-contribuinte">Salvar Ficha</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Câmera e Otimização de Foto em até 70 KB */}
      <CameraPhotoDialog
        open={openPhotoDialog}
        onClose={() => setOpenPhotoDialog(false)}
        onPhotoCaptured={(photoBase64, sizeKB) => {
          setFoto(photoBase64);
          setFotoSizeKB(sizeKB);
        }}
        currentPhoto={foto}
        maxKB={70}
      />

      {/* Modal de Scanner e Leitura de QR Code */}
      <QrScannerDialog
        open={openQrDialog}
        onClose={() => setOpenQrDialog(false)}
        onQrCodeSelected={(code) => setQrCode(code)}
        initialCode={qrCode}
        contribuinteDoc={documento}
      />

      {/* Diálogo de Confirmação de Exclusão de Segurança */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Confirmar Exclusão de Contribuinte
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1">
            Deseja realmente excluir este contribuinte/feirante? Esta ação é irreversível e removerá todos os registros cadastrais deste contribuinte.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
            Nota: Para fins de rastreabilidade de segurança e conformidade, esta ação será registrada nos logs de auditoria contendo sua identificação.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)} color="inherit" variant="outlined" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" sx={{ textTransform: 'none' }} id="confirm-delete-cont-btn">
            Excluir de Forma Permanente
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
