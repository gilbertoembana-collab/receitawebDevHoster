import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store';
import { Contribuinte } from '../../types';
import CameraPhotoDialog from '../../components/CameraPhotoDialog';
import QrScannerDialog from '../../components/QrScannerDialog';
import { 
  Plus, Edit2, Eye, Search, Store, RefreshCw,
  FileSpreadsheet, Printer, Camera, QrCode,
  UserCheck, Maximize2, Image as ImageIcon, CheckCircle2 
} from 'lucide-react';
import { 
  Box, Typography, Button, TextField, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, 
  DialogContent, DialogActions, Chip, FormControl, Select, MenuItem, InputLabel,
  Pagination, InputAdornment, IconButton, Tooltip, Avatar
} from '@mui/material';
import { exportToExcel, printToPDF } from '../../utils/export';

type ContributorFormStatus = 'ativo' | 'inativo-temporario' | 'inativo';

function escapeCardHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function getMunicipalityNameSuffix(name: string): string {
  return name.trim().replace(/^(?:c[âa]mara\s+municipal\s*)+/i, '').trim();
}

export default function Contribuintes() {
  const { 
    mercados, municipios, agentes, configuracoes, addContribuinte, updateContribuinte,
    loadContributorsPage, categoriasContribuintes, activeProfile, addNotification, currentUser
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [viewingItem, setViewingItem] = useState<Contribuinte | null>(null);
  const [editingItem, setEditingItem] = useState<Contribuinte | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Dialogs for Camera Capture & QR Code Scanning
  const [openPhotoDialog, setOpenPhotoDialog] = useState(false);
  const [openQrDialog, setOpenQrDialog] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [totalContributors, setTotalContributors] = useState(0);
  const [pageRows, setPageRows] = useState<Contribuinte[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);
  const rowsPerPage = 100;

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const allowedMercados = React.useMemo(() => {
    if (isAdmin) {
      return mercados.filter(m => m.municipioId === userMuniId);
    }
    return mercados;
  }, [mercados, isAdmin, userMuniId]);
  const loadPage = useCallback(async (targetPage: number, search: string) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await loadContributorsPage(targetPage, search);
      if (currentRequest === requestId.current) {
        const lastPage = Math.max(0, Math.ceil(result.total / rowsPerPage) - 1);
        if (targetPage > lastPage) {
          setTotalContributors(result.total);
          setPage(lastPage);
          return false;
        }
        setPageRows(result.items);
        setTotalContributors(result.total);
        return true;
      }
      return false;
    } catch (error) {
      if (currentRequest === requestId.current) {
        addNotification({
          title: 'Falha na sincronização',
          message: error instanceof Error ? error.message : 'Verifique a ligação e tente novamente.',
          type: 'warning',
        });
      }
      return false;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [loadContributorsPage, addNotification, rowsPerPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadPage(page, searchTerm), searchTerm ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadPage, page, searchTerm]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSearchTerm('');
    setPage(0);
    try {
      if (await loadPage(0, '')) {
        addNotification({
          title: 'Sincronização',
          message: 'Lista de contribuintes e feirantes cadastrados actualizada.',
          type: 'success'
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Form Fields
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [documento, setDocumento] = useState('');
  const [mercadoId, setMercadoId] = useState('');
  const [numBanca, setNumBanca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [dimensao, setDimensao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState<ContributorFormStatus>('ativo');
  const [reativarEm, setReativarEm] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [areaM2, setAreaM2] = useState<string | number>(0);
  const [foto, setFoto] = useState('');
  const [fotoSizeKB, setFotoSizeKB] = useState<number>(0);
  const visibleCategories = categoriasContribuintes.filter(
    item => item.status === 'ativo' || item.id === categoria || item.nome === categoria,
  );
  const getCategoryName = (categoryId: string) => (
    categoriasContribuintes.find(item => item.id === categoryId || item.nome === categoryId)?.nome || categoryId
  );
  const getAgentName = (agentId: string) => (
    agentes.find(agent => agent.id === agentId)?.nome || (agentId ? agentId : 'A sincronizar')
  );

  const filtered = pageRows;
  const totalPages = Math.max(1, Math.ceil(totalContributors / rowsPerPage));
  const currentPage = Math.min(page, totalPages - 1);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setNome('');
    setTelefone('');
    setDocumento('');
    setMercadoId(allowedMercados[0]?.id || '');
    setNumBanca('');
    setCategoria('');
    setDimensao('');
    setObservacoes('');
    setStatus('ativo');
    setReativarEm('');
    setQrCode('');
    setAreaM2(0);
    setFoto('');
    setFotoSizeKB(0);
    setOpenDialog(true);
  };

  const handleOpenView = (item: Contribuinte) => setViewingItem(item);

  const handlePrintFicha = (item: Contribuinte) => {
    const market = mercados.find(entry => entry.id === item.mercadoId);
    const marketName = market?.nome || 'Não alocado';
    const municipalityName = municipios.find(municipio => municipio.id === market?.municipioId)?.nome
      || configuracoes.nomeMunicipio
      || 'CÂMARA MUNICIPAL';
    const municipalityNameSuffix = getMunicipalityNameSuffix(municipalityName);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addNotification({
        title: 'Impressão bloqueada',
        message: 'Permita pop-ups no navegador para imprimir o cartão.',
        type: 'warning',
      });
      return;
    }

    const statusLabel = item.status === 'ativo' ? 'ATIVO' : item.reativarEm ? 'TEMPORARIAMENTE DESATIVADO' : 'DESATIVADO';
    const safePhoto = item.foto && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(item.foto)
      ? item.foto
      : '';
    const safeMunicipalLogo = configuracoes.logoCamara && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(configuracoes.logoCamara)
      ? configuracoes.logoCamara
      : '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt">
        <head>
          <meta charset="utf-8">
          <title>Cartão de Comerciante - ${escapeCardHtml(item.nome)}</title>
          <style>
            @page { size: 54mm 85.6mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 54mm; height: 85.6mm; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; color: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .card { width: 54mm; height: 85.6mm; overflow: hidden; background: #fff; position: relative; display: flex; flex-direction: column; }
            .header { flex: 0 0 20mm; padding: 1mm 1.5mm; display: grid; grid-template-columns: 8mm 1fr 8mm; align-items: center; gap: .7mm; text-align: center; }
            .municipal-logo, .system-logo { width: 8.5mm; height: 8.5mm; object-fit: contain; border-radius: 50%; }
            .system-logo { border: .4mm solid #d7effb; background: #fff; }
            .heading { font-size: 5.1pt; font-weight: 900; line-height: 1.2; }
            .ministry { display: inline-block; white-space: nowrap; font-size: 3.4pt; letter-spacing: -.08pt; }
            .market { flex: 0 0 7mm; padding: 1mm; color: #066338; text-align: center; text-transform: uppercase; font-size: 8pt; font-weight: 900; letter-spacing: .25pt; overflow: hidden; white-space: nowrap; }
            .card-title { flex: 0 0 6.5mm; margin: 0 3.5mm; border-radius: 2mm; background: #08713b; color: white; text-align: center; padding: 1mm; font-size: 8pt; font-weight: 900; letter-spacing: .5pt; }
            .content { position: relative; flex: 1; min-height: 0; padding: 4mm 2mm 2mm; display: grid; grid-template-columns: 22mm 1fr; gap: 2.5mm; }
            .watermark { position: absolute; width: 47mm; height: 47mm; object-fit: contain; opacity: .12; top: 50%; left: 50%; transform: translate(-50%, -50%); }
            .photo-column, .details { position: relative; z-index: 1; min-width: 0; }
            .photo { width: 22mm; height: 39mm; border: .45mm solid #50695c; border-radius: 2mm; object-fit: cover; background: #f4f4f4; }
            .placeholder { width: 22mm; height: 39mm; border: .45mm solid #50695c; border-radius: 2mm; background: #e5efe9; color: #08713b; font-size: 24pt; font-weight: bold; display: grid; place-items: center; }
            .tag { margin-top: 1mm; text-align: center; font-size: 7pt; font-weight: 900; white-space: nowrap; overflow: hidden; }
            .field { padding: 1mm 0 1.2mm; border-bottom: .2mm solid #aaa; }
            .label { display: block; color: #08713b; text-transform: uppercase; letter-spacing: .1pt; font-size: 5.7pt; font-weight: 900; }
            .value { display: block; color: #111; font-size: 7.2pt; font-weight: 700; margin-top: .4mm; line-height: 1.05; overflow: hidden; overflow-wrap: anywhere; max-height: 5mm; }
            .footer { flex: 0 0 13mm; padding: 1mm; position: relative; background: linear-gradient(17deg, #df101b 0 31%, #f2d419 32% 38%, #07833a 39% 100%); display: flex; justify-content: flex-end; align-items: center; }
            .star { position: absolute; left: 5mm; bottom: 2mm; color: #111; font-size: 17pt; line-height: 1; }
            .status { min-width: 22mm; padding: 1.2mm 2mm; border: .4mm solid #b4d4bd; border-radius: 6mm; background: #08713b; color: white; text-align: center; font-size: 8pt; font-weight: 900; letter-spacing: .4pt; }
            .check { display: inline-grid; place-items: center; width: 5mm; height: 5mm; margin-left: 1mm; border-radius: 50%; background: white; color: #08713b; font-size: 9pt; vertical-align: middle; }
          </style>
        </head>
        <body>
          <article class="card">
            <header class="header">
              ${safeMunicipalLogo ? `<img class="municipal-logo" src="${safeMunicipalLogo}" alt="Brasão municipal">` : '<div></div>'}
              <div class="heading">
                REPÚBLICA DA GUINÉ-BISSAU<br>
                <span class="ministry">MINISTÉRIO DA ADMINISTRAÇÃO TERRITORIAL E PODER LOCAL</span><br>
                CÂMARA MUNICIPAL${municipalityNameSuffix ? `<br>${escapeCardHtml(municipalityNameSuffix.toUpperCase())}` : ''}
              </div>
              <img class="system-logo" src="/logo-receita360.png" alt="Logótipo Receita 360">
            </header>
            <div class="market">${escapeCardHtml(marketName)}</div>
            <div class="card-title">CARTÃO DE UTENTE</div>
            <section class="content">
              ${safeMunicipalLogo ? `<img class="watermark" src="${safeMunicipalLogo}" alt="">` : ''}
              <div class="photo-column">
                ${safePhoto
                  ? `<img class="photo" src="${safePhoto}" alt="Foto do comerciante">`
                  : `<div class="placeholder">${escapeCardHtml(item.nome.trim().charAt(0).toUpperCase() || '?')}</div>`}
                ${item.qrCode ? `<div class="tag">${escapeCardHtml(item.qrCode)}</div>` : ''}
              </div>
              <div class="details">
                <div class="field"><span class="label">Nome</span><span class="value">${escapeCardHtml(item.nome)}</span></div>
                <div class="field"><span class="label">NIF</span><span class="value">${escapeCardHtml(item.documento)}</span></div>
                <div class="field"><span class="label">Número de banca</span><span class="value">${escapeCardHtml(item.numBanca || '-')}</span></div>
                <div class="field"><span class="label">Mercado</span><span class="value">${escapeCardHtml(marketName)}</span></div>
                <div class="field"><span class="label">Atividade</span><span class="value">${escapeCardHtml(item.atividade || getCategoryName(item.categoria) || '-')}</span></div>
                <div class="field"><span class="label">Data de validade</span><span class="value">Não definida</span></div>
              </div>
            </section>
            <footer class="footer"><span class="star">★</span><span class="status">${item.status === 'ativo' ? 'ATIVO <span class="check">✓</span>' : escapeCardHtml(statusLabel)}</span></footer>
          </article>
          <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleOpenEdit = (item: Contribuinte) => {
    setEditingItem(item);
    setNome(item.nome);
    setTelefone(item.telefone);
    setDocumento(item.documento);
    setMercadoId(item.mercadoId);
    setNumBanca(item.numBanca);
    setCategoria(item.categoria);
    setDimensao(item.dimensao || '');
    setObservacoes(item.observacoes);
    setStatus(item.status === 'ativo' ? 'ativo' : item.reativarEm ? 'inativo-temporario' : 'inativo');
    setReativarEm(item.reativarEm || '');
    setQrCode(item.qrCode || '');
    setAreaM2(item.areaM2 ?? 0);
    setFoto(item.foto || '');
    setFotoSizeKB(item.foto ? Math.round((item.foto.length * 0.75 / 1024) * 10) / 10 : 0);
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const statusOnlyEdit = Boolean(editingItem && !canEdit);
    if (!statusOnlyEdit && (!nome.trim() || !documento.trim() || !mercadoId || !numBanca.trim() || !categoria || !dimensao)) {
      addNotification({
        title: 'Erro de Validação',
        message: 'Preencha Nome, NIF, Mercado, Número da Banca, Categoria e Dimensão.',
        type: 'warning'
      });
      return;
    }

    const parsedArea = areaM2 === '' ? 0 : Number(areaM2);
    if (!statusOnlyEdit && (!Number.isFinite(parsedArea) || parsedArea < 0)) {
      addNotification({
        title: 'Erro de Validação',
        message: 'A área deve ser um número igual ou superior a zero.',
        type: 'warning'
      });
      return;
    }

    if (status === 'inativo-temporario' && !reativarEm) {
      addNotification({
        title: 'Erro de Validação',
        message: 'Escolha a data de reativação para a desativação temporária.',
        type: 'warning'
      });
      return;
    }

    const dbStatus: Contribuinte['status'] = status === 'ativo' ? 'ativo' : 'inativo';
    const statusPayload: Pick<Contribuinte, 'status' | 'reativarEm'> = {
      status: dbStatus,
      reativarEm: status === 'inativo-temporario' ? reativarEm : null,
    };

    if (editingItem) {
      setIsSaving(true);
      try {
        const payload = statusOnlyEdit ? statusPayload : {
          nome: nome.trim(),
          telefone: telefone.trim(),
          documento: documento.trim().toUpperCase(),
          mercadoId,
          numBanca: numBanca.trim().toUpperCase(),
          categoria,
          atividade: editingItem.atividade || '',
          dimensao: dimensao as Contribuinte['dimensao'],
          observacoes: observacoes.trim(),
          ...statusPayload,
          qrCode: qrCode.trim() || null,
          areaM2: parsedArea,
          foto: foto || undefined,
        };
        const updated = await updateContribuinte(editingItem.id, payload);
        setPageRows(rows => rows.map(row => row.id === editingItem.id ? { ...row, ...updated } : row));
        addNotification({
          title: 'Contribuinte Atualizado',
          message: statusOnlyEdit
            ? `O estado de "${updated.nome}" foi atualizado.`
            : `O contribuinte "${nome.trim()}" foi atualizado com sucesso no banco de dados.`,
          type: 'success'
        });
      } catch (error) {
        addNotification({
          title: 'Falha ao atualizar contribuinte',
          message: error instanceof Error ? error.message : 'Verifique a ligação e tente novamente.',
          type: 'warning',
        });
        return;
      } finally {
        setIsSaving(false);
      }
    } else {
      setIsSaving(true);
      try {
        const created = await addContribuinte({
          nome: nome.trim(),
          telefone: telefone.trim(),
          documento: documento.trim().toUpperCase(),
          mercadoId,
          numBanca: numBanca.trim().toUpperCase(),
          categoria,
          atividade: '',
          dimensao: dimensao as Contribuinte['dimensao'],
          observacoes: observacoes.trim(),
          status: 'ativo',
          reativarEm: null,
          qrCode: qrCode.trim() || null,
          areaM2: parsedArea,
          foto: foto || undefined,
        });
        await loadPage(page, searchTerm);
        addNotification({
          title: 'Contribuinte Cadastrado',
          message: `O contribuinte "${created.nome}" foi cadastrado com sucesso no banco de dados.`,
          type: 'success'
        });
      } catch (error) {
        addNotification({
          title: 'Falha ao cadastrar contribuinte',
          message: error instanceof Error ? error.message : 'Verifique a ligação e tente novamente.',
          type: 'warning',
        });
        return;
      } finally {
        setIsSaving(false);
      }
    }
    setOpenDialog(false);
  };

  const canEdit = [
    'Platform Owner',
    'Super Administrador', 
    'Super Admin', 
    'Administrador Municipal', 
    'Administrator', 
    'Departamento de Mercados'
  ].includes(activeProfile);
  const canManageStatus = canEdit || ['AGENTE', 'Agente de Cobrança', 'Collection Agent'].includes(activeProfile);
  const isStatusOnlyEditor = Boolean(editingItem && !canEdit);

  const handleExportExcel = () => {
    const headers = ['Nome', 'Documento / NIF', 'QR Code', 'Mercado', 'Banca / Loja', 'Área (m²)', 'Categoria de Contribuinte', 'Dimensão', 'Status', 'Data de Registro', 'Agente Responsável'];
    const data = filtered.map(c => {
      const merc = mercados.find(m => m.id === c.mercadoId)?.nome || 'Não definido';
      return [
        c.nome,
        c.documento,
        c.qrCode || '-',
        merc,
        c.numBanca,
        c.areaM2 ? `${c.areaM2} m²` : '-',
        getCategoryName(c.categoria),
        c.dimensao,
        c.status === 'ativo' ? 'Ativo' : c.reativarEm ? 'Desativado temporariamente' : 'Desativado',
        c.dataRegistro ? new Date(c.dataRegistro).toLocaleString('pt') : '-',
        getAgentName(c.agenteId),
      ];
    });
    exportToExcel(data, headers, 'contribuintes');
  };

  const handlePrintPDF = () => {
    const headers = ['Nome', 'Documento / NIF', 'QR Code', 'Mercado', 'Banca / Loja', 'Área (m²)', 'Categoria de Contribuinte', 'Dimensão', 'Status', 'Data de Registro', 'Agente Responsável'];
    const data = filtered.map(c => {
      const merc = mercados.find(m => m.id === c.mercadoId)?.nome || 'Não definido';
      return [
        c.nome,
        c.documento,
        c.qrCode || '-',
        merc,
        c.numBanca,
        c.areaM2 ? `${c.areaM2} m²` : '-',
        getCategoryName(c.categoria),
        c.dimensao,
        c.status === 'ativo' ? 'Ativo' : c.reativarEm ? 'Desativado temporariamente' : 'Desativado',
        c.dataRegistro ? new Date(c.dataRegistro).toLocaleString('pt') : '-',
        getAgentName(c.agenteId),
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
            Cadastro de contribuintes com validação obrigatória de NIF, categoria e dimensão comercial.
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
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
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
        <Table className={isRefreshing || isLoading ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
          <TableHead>
            <TableRow>
              <TableCell>Foto / Contribuinte</TableCell>
              <TableCell>Número de Identificação Fiscal</TableCell>
              <TableCell>QR Code (POS)</TableCell>
              <TableCell>Mercado Alocado</TableCell>
              <TableCell>Banca Nº</TableCell>
              <TableCell>Área (m²)</TableCell>
              <TableCell>Categoria de Contribuinte</TableCell>
              <TableCell>Dimensão</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Data e Hora de Registro</TableCell>
              <TableCell>Agente Responsável</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} align="center" className="text-slate-400 py-6">
                  {isLoading ? 'A carregar contribuintes...' : 'Nenhum contribuinte cadastrado ou correspondente à busca.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => {
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

                    <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-300">{c.numBanca || '-'}</TableCell>
                    
                    <TableCell>
                      {c.areaM2 !== undefined && c.areaM2 !== null ? (
                        <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border dark:border-slate-700">
                          {c.areaM2} m²
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip size="small" label={getCategoryName(c.categoria)} sx={{ fontSize: '10px', height: 18, bg: 'slate-100' }} />
                    </TableCell>

                    <TableCell>
                      <Chip size="small" label={c.dimensao || 'Por classificar'} sx={{ fontSize: '10px', height: 18 }} />
                    </TableCell>

                    <TableCell>
                      <Tooltip
                        title={c.status === 'inativo' && c.reativarEm
                          ? `Reativação automática em ${c.reativarEm}`
                          : c.status === 'inativo' ? 'Sem data de reativação automática' : ''}
                        arrow
                      >
                        <Chip
                          size="small"
                          label={c.status === 'ativo' ? 'Ativo' : c.reativarEm ? 'Desativado temporariamente' : 'Desativado'}
                          color={c.status === 'ativo' ? 'success' : c.reativarEm ? 'warning' : 'default'}
                          sx={{ fontSize: 10, height: 20 }}
                        />
                      </Tooltip>
                    </TableCell>

                    <TableCell className="text-xs">
                      {c.dataRegistro ? new Date(c.dataRegistro).toLocaleString('pt') : '-'}
                    </TableCell>

                    <TableCell className="text-xs">{c.agenteNome || getAgentName(c.agenteId)}</TableCell>

                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Eye size={13} />}
                          onClick={() => handleOpenView(c)}
                          sx={{ py: 0.5, fontSize: '11px', minWidth: 'auto' }}
                          id={`view-cont-${c.id}`}
                        >
                          Ver
                        </Button>
                        {canManageStatus && (
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
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {totalContributors === 0
              ? '0 registos'
              : `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, totalContributors)} de ${totalContributors} registos`}
            {' · '}Página {totalContributors === 0 ? 0 : currentPage + 1} de {totalPages}
            {' · '}100 por página
          </Typography>
          {totalContributors > 0 && (
            <Pagination
              count={totalPages}
              page={currentPage + 1}
              onChange={(_, selectedPage) => setPage(selectedPage - 1)}
              showFirstButton
              showLastButton
              siblingCount={1}
              boundaryCount={1}
              disabled={isLoading}
              color="primary"
              size="small"
              aria-label="Paginação dos contribuintes"
            />
          )}
        </Box>
      </TableContainer>

      {/* Creation/Edition Dialog Modal */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{isStatusOnlyEditor ? 'Alterar Estado do Contribuinte' : editingItem ? 'Editar Ficha do Contribuinte' : 'Cadastrar Novo Contribuinte'}</span>
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
          <Box
            component="fieldset"
            disabled={isStatusOnlyEditor}
            sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
          >
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
              label="Número de Identificação Fiscal (NIF)"
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
              helperText="Opcional. Leia ou informe um código existente; nenhum código é gerado automaticamente."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <QrCode size={16} className="text-blue-600" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Ler ou informar um código QR existente" arrow>
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
              <InputLabel id="cont-cat-label">Categoria de Contribuinte</InputLabel>
              <Select
                labelId="cont-cat-label"
                value={categoria}
                label="Categoria de Contribuinte"
                onChange={(e) => setCategoria(e.target.value)}
                id="cont-field-cat"
              >
                {visibleCategories.map(item => (
                  <MenuItem key={item.id} value={item.nome}>{item.nome}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" required className="col-span-2">
              <InputLabel id="cont-dimensao-label">Dimensão Comercial</InputLabel>
              <Select
                labelId="cont-dimensao-label"
                value={dimensao}
                label="Dimensão Comercial"
                onChange={(e) => setDimensao(e.target.value)}
                id="cont-field-dimensao"
              >
                {['Micro', 'Pequeno', 'Médio', 'Grande'].map(size => (
                  <MenuItem key={size} value={size}>{size}</MenuItem>
                ))}
              </Select>
            </FormControl>

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
          </div>
          </Box>
          {editingItem && (
          <div className="grid grid-cols-2 gap-4">
            <FormControl fullWidth size="small" className="col-span-2">
              <InputLabel id="status-cont-label">Status</InputLabel>
              <Select
                labelId="status-cont-label"
                value={status}
                label="Status"
                onChange={(e) => {
                  const nextStatus = e.target.value as ContributorFormStatus;
                  setStatus(nextStatus);
                  if (nextStatus !== 'inativo-temporario') setReativarEm('');
                }}
                id="cont-field-status"
              >
                <MenuItem value="ativo">Ativo (Pode operar)</MenuItem>
                <MenuItem value="inativo-temporario">Desativado temporariamente</MenuItem>
                <MenuItem value="inativo">Desativado</MenuItem>
              </Select>
            </FormControl>
            {status === 'inativo-temporario' && (
              <TextField
                label="Reativar automaticamente em"
                type="date"
                fullWidth
                value={reativarEm}
                onChange={event => setReativarEm(event.target.value)}
                size="small"
                className="col-span-2"
                required
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Escolha a data em que o contribuinte será reativado automaticamente."
                id="cont-field-reativar-em"
              />
            )}
          </div>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit" disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" id="btn-save-contribuinte" disabled={isSaving}>
            {isSaving ? 'A guardar...' : isStatusOnlyEditor ? 'Salvar Estado' : 'Salvar Ficha'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={viewingItem !== null} onClose={() => setViewingItem(null)} maxWidth="sm" fullWidth>
        {viewingItem && (
          <>
            {(() => {
              const cardMarket = mercados.find(market => market.id === viewingItem.mercadoId);
              const cardMarketName = cardMarket?.nome || 'Não alocado';
              const cardMunicipality = municipios.find(municipio => municipio.id === cardMarket?.municipioId)?.nome
                || configuracoes.nomeMunicipio
                || 'CÂMARA MUNICIPAL';
              const cardMunicipalitySuffix = getMunicipalityNameSuffix(cardMunicipality);
              return (
                <>
            <DialogTitle sx={{ pb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Cartão de Utente</Typography>
              <Typography variant="body2" color="text.secondary">
                Modelo vertical PVC com identidade municipal e logo do Sistema Receita 360.
              </Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ bgcolor: 'grey.100', display: 'flex', justifyContent: 'center', py: 4 }}>
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 340,
                  aspectRatio: '54 / 85.6',
                  overflow: 'hidden',
                  borderRadius: 1,
                  border: '1px solid #ddd',
                  bgcolor: '#fff',
                  boxShadow: '0 14px 34px rgba(15, 45, 75, 0.2)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  sx={{
                    flex: '0 0 23%',
                    px: 1,
                    display: 'grid',
                    gridTemplateColumns: '20% 1fr 20%',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  {configuracoes.logoCamara
                    ? <Box component="img" src={configuracoes.logoCamara} alt="Brasão municipal" sx={{ width: '100%', maxHeight: '78%', objectFit: 'contain' }} />
                    : <Box sx={{ width: '78%', aspectRatio: '1', mx: 'auto', border: '2px solid #08713b', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#08713b', fontSize: { xs: 7, sm: 10 }, fontWeight: 900 }}>MUNICÍPIO</Box>}
                  <Box sx={{ minWidth: 0, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: { xs: 6, sm: 8 }, lineHeight: 1.2, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>
                      REPÚBLICA DA GUINÉ-BISSAU
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: 5, sm: 6 }, lineHeight: 1.2, fontWeight: 900, color: '#111', textTransform: 'uppercase', mt: 0.35 }}>
                      MINISTÉRIO DA ADMINISTRAÇÃO TERRITORIAL E PODER LOCAL
                    </Typography>
                    <Typography sx={{ fontSize: { xs: 6, sm: 8 }, lineHeight: 1.2, fontWeight: 900, color: '#111', textTransform: 'uppercase', mt: 0.35 }}>
                      CÂMARA MUNICIPAL
                    </Typography>
                    {cardMunicipalitySuffix && (
                      <Typography sx={{ fontSize: { xs: 5, sm: 7 }, lineHeight: 1.1, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>
                        {cardMunicipalitySuffix}
                      </Typography>
                    )}
                  </Box>
                  <Box
                    component="img"
                    src="/logo-receita360.png"
                    alt="Logótipo Receita 360"
                    sx={{
                      width: '95%',
                      aspectRatio: '1',
                      mx: 'auto',
                      borderRadius: '50%',
                      bgcolor: '#fff',
                      objectFit: 'contain',
                      border: '2px solid #d7effb',
                      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.65)',
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    flex: '0 0 8%',
                    color: '#08713b',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    fontSize: { xs: 12, sm: 18 },
                    fontWeight: 900,
                    letterSpacing: 0.4,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {cardMarketName}
                </Box>

                <Box
                  sx={{
                    flex: '0 0 7.5%',
                    mx: '6%',
                    borderRadius: 2,
                    bgcolor: '#08713b',
                    color: 'white',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    fontSize: { xs: 13, sm: 20 },
                    fontWeight: 900,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  CARTÃO DE UTENTE
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    px: '4%',
                    pt: '5%',
                    pb: '2%',
                    display: 'grid',
                    gridTemplateColumns: '45% 1fr',
                    gridTemplateRows: '1fr',
                    gap: '5%',
                    position: 'relative',
                    background: '#fff',
                  }}
                >
                  {configuracoes.logoCamara && (
                    <Box
                      component="img"
                      src={configuracoes.logoCamara}
                      alt=""
                      sx={{
                        position: 'absolute',
                        width: '82%',
                        height: '85%',
                        objectFit: 'contain',
                        opacity: 0.12,
                        left: '12%',
                        top: '8%',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  <Box sx={{ zIndex: 1, minWidth: 0 }}>
                    <Avatar
                      src={viewingItem.foto}
                      alt={viewingItem.nome}
                      variant="rounded"
                      sx={{
                        width: '100%',
                        height: '76%',
                        minHeight: 100,
                        bgcolor: '#e5efe9',
                        color: '#08713b',
                        border: '2px solid #50695c',
                        borderRadius: 1.5,
                        boxShadow: '0 2px 5px rgba(22, 57, 40, 0.15)',
                        fontSize: { xs: 34, sm: 50 },
                        fontWeight: 700,
                      }}
                    >
                      {viewingItem.nome.charAt(0)}
                    </Avatar>
                    {viewingItem.qrCode && (
                      <Typography noWrap sx={{ mt: 0.75, textAlign: 'center', fontSize: { xs: 9, sm: 13 }, fontWeight: 900 }}>
                        {viewingItem.qrCode}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ zIndex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {[
                      ['NOME', viewingItem.nome],
                      ['NIF', viewingItem.documento],
                      ['NÚMERO DE BANCA', viewingItem.numBanca || '-'],
                      ['MERCADO', cardMarketName],
                      ['ATIVIDADE', viewingItem.atividade || getCategoryName(viewingItem.categoria) || '-'],
                      ['DATA DE VALIDADE', 'Não definida'],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ minWidth: 0, py: { xs: 0.4, sm: 0.7 }, borderBottom: '1px solid #aaa' }}>
                        <Typography sx={{ fontSize: { xs: 7, sm: 10 }, color: '#08713b', fontWeight: 900, lineHeight: 1.1 }}>
                          {label}
                        </Typography>
                        <Typography sx={{ fontSize: { xs: 9, sm: 13 }, color: '#111', fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere', maxHeight: 38, overflow: 'hidden' }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box
                  sx={{
                    flex: '0 0 13%',
                    px: 1,
                    position: 'relative',
                    background: 'linear-gradient(17deg, #df101b 0 31%, #f2d419 32% 38%, #07833a 39% 100%)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  <Typography sx={{ position: 'absolute', left: '7%', bottom: '5%', color: '#111', fontSize: { xs: 26, sm: 38 }, lineHeight: 1 }}>★</Typography>
                  <Box
                    sx={{
                      minWidth: '48%',
                      py: 0.75,
                      px: 1.5,
                      border: '2px solid #b4d4bd',
                      borderRadius: 6,
                      bgcolor: '#08713b',
                      color: 'white',
                      textAlign: 'center',
                      fontSize: { xs: 14, sm: 21 },
                      fontWeight: 900,
                    }}
                  >
                    {viewingItem.status === 'ativo' ? 'ATIVO  ✓' : viewingItem.reativarEm ? 'TEMPORÁRIO' : 'DESATIVADO'}
                  </Box>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => handlePrintFicha(viewingItem)} startIcon={<Printer size={16} />} variant="outlined">
                Imprimir cartão PVC
              </Button>
              {canEdit && (
                <Button
                  onClick={() => {
                    handleOpenEdit(viewingItem);
                    setViewingItem(null);
                  }}
                  startIcon={<Edit2 size={16} />}
                  variant="contained"
                >
                  Modificar
                </Button>
              )}
              <Button onClick={() => setViewingItem(null)} color="inherit">Fechar</Button>
            </DialogActions>
                </>
              );
            })()}
          </>
        )}
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
      />

    </Box>
  );
}
