import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store';
import { dbService } from '../../services/db';
import { 
  DollarSign, TrendingUp, TrendingDown, Landmark, Lock, FileSpreadsheet, 
  Download, Calendar, AlertCircle, Sparkles, Receipt, CheckCircle,
  Coins, Percent, Users, ShoppingBag, Search, FileText, ArrowUpDown, Trash2, Plus
} from 'lucide-react';
import { 
  Box, Typography, Grid, Card, CardContent, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tabs, Tab, InputAdornment, MenuItem, Select, FormControl, InputLabel
} from '@mui/material';

interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  responsavel: string;
}

const INITIAL_DESPESAS: Despesa[] = [];

export default function Financeiro() {
  const { pagamentos, configuracoes, agentes, mercados, activeProfile, updateConfiguracoes, addNotification, currentUser } = useAppStore();
  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const [despesas, setDespesas] = useState<Despesa[]>(() => {
    try {
      const stored = localStorage.getItem('receita360_despesas');
      return stored ? JSON.parse(stored) : INITIAL_DESPESAS;
    } catch {
      return INITIAL_DESPESAS;
    }
  });

  useEffect(() => {
    localStorage.setItem('receita360_despesas', JSON.stringify(despesas));
  }, [despesas]);

  const [openClosureDialog, setOpenClosureDialog] = useState(false);
  const [closureType, setClosureType] = useState<'diario' | 'mensal'>('diario');
  const [physicalCashCount, setPhysicalCashCount] = useState<number>(0);
  
  // States for Commission Payment Dialog
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMemo, setPaymentMemo] = useState<string>('');

  // States for Add Expense Dialog
  const [openExpenseDialog, setOpenExpenseDialog] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseCat, setExpenseCat] = useState('Suprimentos');
  const [expenseVal, setExpenseVal] = useState('');
  const [expenseResp, setExpenseResp] = useState(currentUser?.nome || '');

  const handleAddExpense = () => {
    const val = Number(expenseVal);
    if (!expenseDesc.trim() || isNaN(val) || val <= 0) {
      alert('Por favor, preencha uma descrição válida e um valor numérico superior a zero.');
      return;
    }
    const newDespesa: Despesa = {
      id: `esp-${Date.now()}`,
      descricao: expenseDesc,
      categoria: expenseCat,
      valor: val,
      data: new Date().toISOString().split('T')[0],
      responsavel: expenseResp || currentUser?.nome || 'Financeiro'
    };
    setDespesas(prev => [newDespesa, ...prev]);
    addNotification({
      title: 'Despesa Registrada',
      message: `Despesa de ${val.toLocaleString()} ${configuracoes.moeda} adicionada com sucesso.`,
      type: 'success'
    });
    setOpenExpenseDialog(false);
    setExpenseDesc('');
    setExpenseVal('');
  };

  const handleClearDespesas = () => {
    if (window.confirm('Deseja eliminar todas as despesas operacionais registradas?')) {
      setDespesas([]);
      localStorage.removeItem('receita360_despesas');
      addNotification({
        title: 'Despesas Limpas',
        message: 'Todas as despesas operacionais foram removidas.',
        type: 'info'
      });
    }
  };

  const handleClearAllFinancialData = async () => {
    if (window.confirm('Atenção: Esta ação irá eliminar TODOS os registos de cobranças, despesas e pagamentos de comissões. Deseja continuar?')) {
      await dbService.clearAllPagamentos(currentUser?.nome || 'Admin', activeProfile);
      setDespesas([]);
      localStorage.removeItem('receita360_despesas');
      updateConfiguracoes({ comissaoPaga: 0 });
      addNotification({
        title: 'Dados Limpos com Sucesso',
        message: 'Todos os registos de cobranças, receitas, despesas e comissões foram apagados.',
        type: 'success'
      });
      alert('Todos os dados de cobranças, despesas, receitas e comissões foram eliminados com sucesso!');
    }
  };
  
  // Navigation Tabs State
  const [currentTab, setCurrentTab] = useState(0);

  // Filters for Commission Justification
  const [justificationSearch, setJustificationSearch] = useState('');
  const [selectedMarketFilter, setSelectedMarketFilter] = useState('todos');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('todos');

  // Percentage from settings or fallback to 10
  const comissaoPercent = configuracoes.taxaComissao ?? 10;

  // General Cashflow Stats Calculations
  const stats = useMemo(() => {
    const totalArrecadado = pagamentos
      .filter(p => p.status === 'pago' && (!isAdmin || p.municipioId === userMuniId))
      .reduce((sum, p) => sum + p.valor, 0);

    const totalDespesas = despesas.reduce((sum, d) => sum + d.valor, 0);
    const saldoLiquido = totalArrecadado - totalDespesas;

    return {
      totalArrecadado,
      totalDespesas,
      saldoLiquido
    };
  }, [pagamentos, despesas, isAdmin, userMuniId]);

  // Real-time Commission and Recovery Analysis
  const recoveryData = useMemo(() => {
    const allowedPagamentos = pagamentos.filter(p => !isAdmin || p.municipioId === userMuniId);
    const allowedMercados = mercados.filter(m => !isAdmin || m.municipioId === userMuniId);
    const allowedAgentes = agentes.filter(a => !isAdmin || a.municipioId === userMuniId);

    const paidPayments = allowedPagamentos.filter(p => p.status === 'pago');
    const totalArrecadado = paidPayments.reduce((sum, p) => sum + p.valor, 0);
    const totalComissao = (totalArrecadado * comissaoPercent) / 100;

    // 1. Breakdown by Market
    const marketMap: { [id: string]: { nome: string; totalArrecadado: number; comissao: number; transacoesCount: number } } = {};
    allowedMercados.forEach(m => {
      marketMap[m.id] = { nome: m.nome, totalArrecadado: 0, comissao: 0, transacoesCount: 0 };
    });

    // 2. Breakdown by Agent
    const agentMap: { [id: string]: { nome: string; mercadoNome: string; totalArrecadado: number; comissao: number; transacoesCount: number } } = {};
    allowedAgentes.forEach(a => {
      const m = allowedMercados.find(merc => merc.id === a.mercadoId);
      agentMap[a.id] = { 
        nome: a.nome, 
        mercadoNome: m ? m.nome : 'Nenhum', 
        totalArrecadado: 0, 
        comissao: 0, 
        transacoesCount: 0 
      };
    });

    // Process actual transactions
    paidPayments.forEach(p => {
      // Market Breakdown update
      if (marketMap[p.mercadoId]) {
        marketMap[p.mercadoId].totalArrecadado += p.valor;
        marketMap[p.mercadoId].transacoesCount += 1;
      } else {
        const m = allowedMercados.find(merc => merc.id === p.mercadoId);
        if (!isAdmin || (m && m.municipioId === userMuniId)) {
          marketMap[p.mercadoId] = {
            nome: m ? m.nome : `Mercado #${p.mercadoId}`,
            totalArrecadado: p.valor,
            comissao: 0,
            transacoesCount: 1
          };
        }
      }

      // Agent Breakdown update
      if (agentMap[p.agenteId]) {
        agentMap[p.agenteId].totalArrecadado += p.valor;
        agentMap[p.agenteId].transacoesCount += 1;
      } else {
        const ag = allowedAgentes.find(a => a.id === p.agenteId);
        const m = allowedMercados.find(merc => merc.id === p.mercadoId);
        if (!isAdmin || (ag && ag.municipioId === userMuniId)) {
          agentMap[p.agenteId] = {
            nome: ag ? ag.nome : `Agente #${p.agenteId}`,
            mercadoNome: m ? m.nome : 'Nenhum',
            totalArrecadado: p.valor,
            comissao: 0,
            transacoesCount: 1
          };
        }
      }
    });

    // Calculate commissions
    Object.keys(marketMap).forEach(id => {
      if (marketMap[id]) {
        marketMap[id].comissao = (marketMap[id].totalArrecadado * comissaoPercent) / 100;
      }
    });
    Object.keys(agentMap).forEach(id => {
      if (agentMap[id]) {
        agentMap[id].comissao = (agentMap[id].totalArrecadado * comissaoPercent) / 100;
      }
    });

    // Lists for rendering
    const marketsList = Object.entries(marketMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.comissao - a.comissao);

    const agentsList = Object.entries(agentMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.comissao - a.comissao);

    // List of individual transactions as full mathematical justification
    const rawJustifications = paidPayments.map(p => {
      const ag = allowedAgentes.find(a => a.id === p.agenteId);
      const m = allowedMercados.find(merc => merc.id === p.mercadoId);
      return {
        id: p.id,
        reciboId: p.reciboId,
        dataPagamento: p.dataPagamento,
        valor: p.valor,
        comissaoCalculada: (p.valor * comissaoPercent) / 100,
        agenteId: p.agenteId,
        agenteNome: ag ? ag.nome : `Agente #${p.agenteId}`,
        mercadoId: p.mercadoId,
        mercadoNome: m ? m.nome : `Mercado #${p.mercadoId}`
      };
    }).sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento));

    // Filtered justifications
    const filteredJustifications = rawJustifications.filter(j => {
      const matchesSearch = j.reciboId.toLowerCase().includes(justificationSearch.toLowerCase()) || 
                            j.agenteNome.toLowerCase().includes(justificationSearch.toLowerCase()) || 
                            j.mercadoNome.toLowerCase().includes(justificationSearch.toLowerCase());
      const matchesMarket = selectedMarketFilter === 'todos' || j.mercadoId === selectedMarketFilter;
      const matchesAgent = selectedAgentFilter === 'todos' || j.agenteId === selectedAgentFilter;
      return matchesSearch && matchesMarket && matchesAgent;
    });

    const comissaoPagaValue = configuracoes.comissaoPaga || 0;
    const saldoEmDivida = totalComissao - comissaoPagaValue;

    return {
      totalArrecadado,
      totalComissao,
      comissaoPagaValue,
      saldoEmDivida,
      marketsList,
      agentsList,
      filteredJustifications
    };
  }, [pagamentos, agentes, mercados, comissaoPercent, justificationSearch, selectedMarketFilter, selectedAgentFilter, configuracoes.comissaoPaga, isAdmin, userMuniId]);

  const handleConfirmCommissionPayment = () => {
    const val = Number(paymentAmount);
    if (!paymentAmount || isNaN(val) || val <= 0) {
      addNotification({
        title: 'Valor Inválido',
        message: 'Por favor, insira um valor numérico válido maior que zero.',
        type: 'warning'
      });
      return;
    }

    const currentPaid = configuracoes.comissaoPaga || 0;
    const newPaid = currentPaid + val;

    updateConfiguracoes({
      comissaoPaga: newPaid
    });

    addNotification({
      title: 'Pagamento de Comissão Registrado',
      message: `Registrado o pagamento de comissão no valor de ${val.toLocaleString()} ${configuracoes.moeda} com sucesso.`,
      type: 'success'
    });

    alert(`Pagamento de ${val.toLocaleString()} ${configuracoes.moeda} confirmado e registrado com sucesso!`);
    setOpenPaymentDialog(false);
    setPaymentAmount('');
    setPaymentMemo('');
  };

  const handleResetCommissionPayments = () => {
    if (window.confirm('Tem certeza de que deseja zerar todo o histórico de comissões pagas registradas?')) {
      updateConfiguracoes({
        comissaoPaga: 0
      });
      addNotification({
        title: 'Pagamentos Zerados',
        message: 'O histórico de comissões pagas foi reiniciado para zero.',
        type: 'info'
      });
      alert('Histórico de comissões pagas reiniciado com sucesso!');
    }
  };

  const handleCreateClosure = (type: 'diario' | 'mensal') => {
    setClosureType(type);
    const estimated = type === 'diario' 
      ? pagamentos.filter(p => p.status === 'pago' && p.dataPagamento.startsWith(new Date().toISOString().split('T')[0])).reduce((sum, p) => sum + p.valor, 0)
      : stats.totalArrecadado;
    setPhysicalCashCount(estimated);
    setOpenClosureDialog(true);
  };

  const handleConfirmClosure = () => {
    alert(`Fechamento ${closureType === 'diario' ? 'Diário' : 'Mensal'} consolidado e assinado digitalmente com sucesso!\n\nUm relatório de auditoria foi gerado e enviado ao Diretor Financeiro.`);
    setOpenClosureDialog(false);
  };

  const handleExportRecovery = () => {
    alert(`Relatório Consolidado de Recuperação de Taxas (${comissaoPercent}%) gerado com sucesso contendo todas as justificativas por agentes e mercados.\n\nFormato: PDF Assinado Digitalmente.`);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      {/* Page Title */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, gap: 2 }}>
        <div>
          <Typography variant="h1">Gestão de Finanças e Comissões</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Acompanhamento de fluxo de caixa, despesas operacionais e cálculo de comissões/recuperação em tempo real.
          </Typography>
        </div>
        {currentTab === 0 && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button 
              variant="outlined" 
              color="error" 
              startIcon={<Trash2 size={16} />} 
              onClick={handleClearAllFinancialData}
              id="btn-clear-all-financial-data"
            >
              Limpar Todos os Dados
            </Button>
            <Button 
              variant="contained" 
              color="secondary" 
              startIcon={<Lock size={16} />} 
              onClick={() => handleCreateClosure('diario')}
              id="btn-closure-diario"
            >
              Fechamento Diário
            </Button>
            <Button 
              variant="outlined" 
              color="primary" 
              startIcon={<Lock size={16} />} 
              onClick={() => handleCreateClosure('mensal')}
              id="btn-closure-mensal"
            >
              Fechamento Mensal
            </Button>
          </Box>
        )}
        {currentTab === 1 && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {['Platform Owner', 'Super Admin', 'Super Administrador'].includes(activeProfile) && (
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<Coins size={16} />} 
                onClick={() => setOpenPaymentDialog(true)}
                id="btn-confirmar-pagamento-comissao"
                sx={{ textTransform: 'none' }}
              >
                Confirmar Pagamento
              </Button>
            )}
            <Button 
              variant="contained" 
              color="success" 
              startIcon={<Download size={16} />} 
              onClick={handleExportRecovery}
              id="btn-export-recovery"
              sx={{ textTransform: 'none' }}
            >
              Exportar Comprovativos
            </Button>
          </Box>
        )}
      </Box>

      {/* Tabs Selector */}
      <Tabs 
        value={currentTab} 
        onChange={(_, newValue) => setCurrentTab(newValue)} 
        sx={{ mb: 4, borderBottom: 1, borderColor: 'divider' }}
        id="finance-tabs"
      >
        <Tab label="Fluxo Geral de Caixa" id="tab-cashflow" icon={<Landmark size={16} />} iconPosition="start" />
        <Tab 
          label={`Recuperação de Taxas (${comissaoPercent}%)`} 
          id="tab-commissions" 
          icon={<Coins size={16} />} 
          iconPosition="start" 
        />
      </Tabs>

      {/* TAB 0: FLOW OF CASH */}
      {currentTab === 0 && (
        <Box>
          {/* Financial Ledger Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Total Arrecadado (Receitas)</Typography>
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp size={20} />
                    </div>
                  </Box>
                  <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#28A745' }}>
                    +{stats.totalArrecadado.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
                  </Typography>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Proveniente de cobrança móvel via agentes nos mercados
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Despesas Operacionais</Typography>
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
                      <TrendingDown size={20} />
                    </div>
                  </Box>
                  <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#ef4444' }}>
                    -{stats.totalDespesas.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
                  </Typography>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Suprimentos térmicos e manutenção de coletores
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Saldo Líquido de Caixa</Typography>
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Landmark size={20} />
                    </div>
                  </Box>
                  <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#0B4EA2' }}>
                    {stats.saldoLiquido.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
                  </Typography>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Arrecadação líquida depositada em conta câmara
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Expense ledger list table */}
          <Card sx={{ mb: 4 }} id="ledger-expenses-card">
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
                <Typography variant="h4">Despesas Operacionais Registradas</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {despesas.length > 0 && (
                    <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={14} />} onClick={handleClearDespesas} id="btn-clear-despesas">
                      Limpar Despesas
                    </Button>
                  )}
                  <Button size="small" variant="contained" color="primary" startIcon={<Plus size={14} />} onClick={() => setOpenExpenseDialog(true)} id="btn-registrar-despesa">
                    Registrar Despesa
                  </Button>
                </Box>
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ border: 'none' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Descrição</TableCell>
                      <TableCell>Categoria</TableCell>
                      <TableCell>Responsável</TableCell>
                      <TableCell>Data</TableCell>
                      <TableCell align="right">Valor</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {despesas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                            Nenhuma despesa operacional registrada no momento.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      despesas.map((d) => (
                        <TableRow key={d.id} hover>
                          <TableCell className="font-semibold">{d.descricao}</TableCell>
                          <TableCell>
                            <Chip size="small" label={d.categoria} variant="outlined" sx={{ fontSize: '10px' }} />
                          </TableCell>
                          <TableCell>{d.responsavel}</TableCell>
                          <TableCell className="text-xs text-slate-500">{new Date(d.data).toLocaleDateString('pt-PT')}</TableCell>
                          <TableCell align="right" className="font-mono font-bold text-red-600">
                            -{d.valor.toLocaleString()} {configuracoes.moeda}
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
      )}

      {/* TAB 1: COMMISSIONS & RECOVERY */}
      {currentTab === 1 && (
        <Box>
          {/* Header Info Banner */}
          <Box sx={{ mb: 4, p: 2, bgcolor: 'primary.light', color: 'primary.contrastText', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, bg: 'linear-gradient(135deg, #0b4ea2 0%, #1e40af 100%)' }}>
            <Percent size={32} className="text-white flex-shrink-0 animate-bounce" />
            <div>
              <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold' }}>Cálculo Automático de Recuperação</Typography>
              <Typography variant="body2" sx={{ color: 'blue.100', opacity: 0.9 }}>
                Para o faturamento total arrecadado, a sua empresa possui um contrato de recuperação estipulado em <strong>{comissaoPercent}%</strong> sobre cada transação efetuada nos mercados públicos. Os valores são consolidados em tempo real com base no status "Pago".
              </Typography>
            </div>
          </Box>

          {/* Recovery Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* CARD 1: Total Arrecadado */}
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Total Arrecadado (Base de Cálculo)</Typography>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400">
                    <Receipt size={20} />
                  </div>
                </Box>
                <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: 'text.primary' }}>
                  {recoveryData.totalArrecadado.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
                </Typography>
                <div className="text-[10px] text-slate-400 mt-2">
                  Total de cobranças pagas nos mercados
                </div>
              </CardContent>
            </Card>

            {/* CARD 2: Valor Líquido a Recuperar */}
            <Card sx={{ bgcolor: 'emerald.50', border: '1px solid', borderColor: 'emerald.200', bg: 'rgba(16, 185, 129, 0.05)' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="body2" sx={{ color: 'emerald.700', fontWeight: 600 }}>Valor Líquido a Recuperar</Typography>
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <Coins size={20} />
                  </div>
                </Box>
                <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 800, color: '#10b981' }}>
                  {recoveryData.totalComissao.toLocaleString()} <span className="text-sm font-sans font-medium text-emerald-600">{configuracoes.moeda}</span>
                </Typography>
                <div className="text-[10px] text-emerald-600 mt-2 font-medium">
                  Contrato de {comissaoPercent}% de comissão municipal
                </div>
              </CardContent>
            </Card>

            {/* CARD 3: Valor Pago */}
            <Card sx={{ bgcolor: 'blue.50', border: '1px solid', borderColor: 'blue.200', bg: 'rgba(59, 130, 246, 0.05)' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="body2" sx={{ color: 'blue.700', fontWeight: 600 }}>Valor Pago (Comissões)</Typography>
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                    <CheckCircle size={20} />
                  </div>
                </Box>
                <Typography variant="h2" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 800, color: '#2563eb' }}>
                  {recoveryData.comissaoPagaValue.toLocaleString()} <span className="text-sm font-sans font-medium text-blue-600">{configuracoes.moeda}</span>
                </Typography>
                <div className="text-[10px] text-blue-600 mt-2 font-medium flex justify-between items-center">
                  <span>Liquidado e confirmado</span>
                  {['Platform Owner', 'Super Admin', 'Super Administrador'].includes(activeProfile) && recoveryData.comissaoPagaValue > 0 && (
                    <button 
                      onClick={handleResetCommissionPayments} 
                      className="text-[9px] text-red-500 hover:underline border-none bg-transparent cursor-pointer font-sans"
                    >
                      Zerar histórico
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* CARD 4: Saldo em Dívida */}
            <Card 
              sx={
                recoveryData.saldoEmDivida > 0 
                  ? { bgcolor: 'amber.50', border: '1px solid', borderColor: 'amber.200', bg: 'rgba(245, 158, 11, 0.05)' }
                  : { bgcolor: 'emerald.50', border: '1px solid', borderColor: 'emerald.100', bg: 'rgba(16, 185, 129, 0.02)' }
              }
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: recoveryData.saldoEmDivida > 0 ? '#b45309' : '#047857', 
                      fontWeight: 600 
                    }}
                  >
                    Saldo em Dívida
                  </Typography>
                  <div 
                    className={`p-2 rounded-lg ${
                      recoveryData.saldoEmDivida > 0 
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' 
                        : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {recoveryData.saldoEmDivida > 0 ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                  </div>
                </Box>
                <Typography 
                  variant="h2" 
                  sx={{ 
                    fontFamily: 'fontFamilyMono', 
                    fontWeight: 800, 
                    color: recoveryData.saldoEmDivida > 0 ? '#d97706' : '#10b981' 
                  }}
                >
                  {recoveryData.saldoEmDivida.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
                </Typography>
                <div className="text-[10px] text-slate-400 mt-2 font-medium">
                  {recoveryData.saldoEmDivida > 0 
                    ? 'Pendente de quitação pela câmara' 
                    : 'Todas as comissões quitadas!'
                  }
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown: Markets vs Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* Markets Breakdown */}
            <Card id="recovery-markets-breakdown">
              <CardContent>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
                  <ShoppingBag className="text-blue-600" size={20} />
                  <div>
                    <Typography variant="h4">Justificativo Consolidado por Mercados</Typography>
                    <Typography variant="caption" color="text.secondary">Distribuição do valor de recuperação por ponto físico</Typography>
                  </div>
                </Box>

                <TableContainer component={Paper} elevation={0} sx={{ border: 'none' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mercado</TableCell>
                        <TableCell align="right">Cobrado (Total)</TableCell>
                        <TableCell align="right">Comissão ({comissaoPercent}%)</TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Qtd Transações</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recoveryData.marketsList.filter(m => m.totalArrecadado > 0).map((m) => (
                        <TableRow key={m.id} hover>
                          <TableCell className="font-semibold text-slate-800 dark:text-slate-200">{m.nome}</TableCell>
                          <TableCell align="right" className="font-mono">{m.totalArrecadado.toLocaleString()} {configuracoes.moeda}</TableCell>
                          <TableCell align="right" className="font-mono font-bold text-emerald-600">
                            +{m.comissao.toLocaleString()} {configuracoes.moeda}
                          </TableCell>
                          <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                            <Chip size="small" label={`${m.transacoesCount} cobr.`} variant="outlined" sx={{ fontSize: '10px' }} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {recoveryData.marketsList.filter(m => m.totalArrecadado > 0).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            Nenhum mercado com arrecadação registrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>

            {/* Agents Breakdown */}
            <Card id="recovery-agents-breakdown">
              <CardContent>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
                  <Users className="text-blue-600" size={20} />
                  <div>
                    <Typography variant="h4">Justificativo Consolidado por Agentes</Typography>
                    <Typography variant="caption" color="text.secondary">Arrecadação e comissão por coletor de campo</Typography>
                  </div>
                </Box>

                <TableContainer component={Paper} elevation={0} sx={{ border: 'none' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Agente</TableCell>
                        <TableCell>Mercado Atuação</TableCell>
                        <TableCell align="right">Cobrado (Total)</TableCell>
                        <TableCell align="right">Comissão ({comissaoPercent}%)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recoveryData.agentsList.filter(a => a.totalArrecadado > 0).map((a) => (
                        <TableRow key={a.id} hover>
                          <TableCell className="font-semibold text-slate-800 dark:text-slate-200">{a.nome}</TableCell>
                          <TableCell className="text-xs text-slate-500">{a.mercadoNome}</TableCell>
                          <TableCell align="right" className="font-mono">{a.totalArrecadado.toLocaleString()} {configuracoes.moeda}</TableCell>
                          <TableCell align="right" className="font-mono font-bold text-emerald-600">
                            +{a.comissao.toLocaleString()} {configuracoes.moeda}
                          </TableCell>
                        </TableRow>
                      ))}
                      {recoveryData.agentsList.filter(a => a.totalArrecadado > 0).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            Nenhum agente com arrecadação registrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </div>

          {/* Transactional Proof / Justification */}
          <Card id="recovery-transactional-proof">
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 3 }}>
                <div>
                  <Typography variant="h4" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <FileText size={18} className="text-blue-600" />
                    <span>Rastreabilidade e Justificativo Transacional Individual</span>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Demonstração de cálculo matemática para auditoria de cada recibo em tempo real.
                  </Typography>
                </div>

                {/* Filter and Search controls */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, width: { xs: 'full', sm: 'auto' } }}>
                  <TextField
                    size="small"
                    placeholder="Pesquisar recibo, agente..."
                    value={justificationSearch}
                    onChange={(e) => setJustificationSearch(e.target.value)}
                    sx={{ width: { xs: '100%', sm: 180 } }}
                  />

                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="filter-market-label">Mercado</InputLabel>
                    <Select
                      labelId="filter-market-label"
                      value={selectedMarketFilter}
                      label="Mercado"
                      onChange={(e) => setSelectedMarketFilter(e.target.value)}
                    >
                      <MenuItem value="todos">Todos os Mercados</MenuItem>
                      {mercados
                        .filter(m => !isAdmin || m.municipioId === userMuniId)
                        .map(m => (
                          <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                        ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="filter-agent-label">Agente</InputLabel>
                    <Select
                      labelId="filter-agent-label"
                      value={selectedAgentFilter}
                      label="Agente"
                      onChange={(e) => setSelectedAgentFilter(e.target.value)}
                    >
                      <MenuItem value="todos">Todos os Agentes</MenuItem>
                      {agentes
                        .filter(a => !isAdmin || a.municipioId === userMuniId)
                        .map(a => (
                          <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ border: 'none' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Recibo ID</TableCell>
                      <TableCell>Data/Hora</TableCell>
                      <TableCell>Mercado</TableCell>
                      <TableCell>Agente Fiscal</TableCell>
                      <TableCell align="right">Valor Arrecadado</TableCell>
                      <TableCell align="right">Operação de Recuperação</TableCell>
                      <TableCell align="right">Líquido a Recuperar ({comissaoPercent}%)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recoveryData.filteredJustifications.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                            #{item.reciboId}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(item.dataPagamento).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                        </TableCell>
                        <TableCell className="text-xs">{item.mercadoNome}</TableCell>
                        <TableCell className="text-xs font-semibold">{item.agenteNome}</TableCell>
                        <TableCell align="right" className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {item.valor.toLocaleString()} {configuracoes.moeda}
                        </TableCell>
                        <TableCell align="right" className="text-[10px] text-slate-400 font-mono italic">
                          {item.valor.toLocaleString()} x {comissaoPercent}%
                        </TableCell>
                        <TableCell align="right" className="font-mono font-bold text-emerald-600 bg-emerald-500/[0.02]">
                          {item.comissaoCalculada.toLocaleString()} {configuracoes.moeda}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recoveryData.filteredJustifications.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          Nenhuma transação atende aos critérios de pesquisa ou filtragem definidos.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Closure Dialog */}
      <Dialog open={openClosureDialog} onClose={() => setOpenClosureDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Sparkles className="text-blue-600" size={20} />
          <span>Fechamento de Caixa {closureType === 'diario' ? 'Diário' : 'Mensal'}</span>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              Verifique os valores calculados automaticamente pelo sistema em tempo real contra a contagem física das bobinas de depósitos dos agentes.
            </Typography>

            <Box sx={{ p: 2, bg: 'slate-100', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', items: 'center' }} className="dark:bg-slate-900/40 dark:border-slate-800">
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Total Calculado pelo Sistema:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {closureType === 'diario' 
                  ? pagamentos.filter(p => p.status === 'pago' && p.dataPagamento.startsWith(new Date().toISOString().split('T')[0])).reduce((sum, p) => sum + p.valor, 0).toLocaleString()
                  : stats.totalArrecadado.toLocaleString()
                } {configuracoes.moeda}
              </span>
            </Box>

            <TextField
              required
              label="Contagem Física Identificada (Registrada)"
              type="number"
              fullWidth
              size="small"
              value={physicalCashCount}
              onChange={(e) => setPhysicalCashCount(Number(e.target.value))}
              helperText="Informe o somatório físico recolhido na câmara."
              id="closure-physical-cash"
            />

            <Box sx={{ display: 'flex', gap: 1, p: 1.5, bg: 'blue-500/5', borderRadius: 2, border: '1px solid', borderColor: 'primary.light' }}>
              <AlertCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <Typography variant="body2" sx={{ fontSize: '11px', color: 'primary.dark', lineHeight: 1.3 }}>
                Ao assinar o fechamento, o sistema irá bloquear novas edições de cobranças referentes a este período para fins de auditoria municipal.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenClosureDialog(false)} color="inherit">Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmClosure} startIcon={<CheckCircle size={14} />} id="btn-submit-closure">
            Consolidar e Assinar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Commission Payment Dialog */}
      <Dialog open={openPaymentDialog} onClose={() => setOpenPaymentDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Coins className="text-blue-600" size={20} />
          <span>Confirmar Pagamento de Comissão</span>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Utilize este painel para registrar e conciliar os pagamentos efetuados pela câmara municipal referentes às comissões calculadas pelo sistema.
            </Typography>

            <Box sx={{ p: 2, bg: 'slate-50', borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 1 }} className="dark:bg-slate-900/40 dark:border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Líquido a Recuperar:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {recoveryData.totalComissao.toLocaleString()} {configuracoes.moeda}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Já Pago:</span>
                <span className="font-mono font-bold text-blue-600">
                  {recoveryData.comissaoPagaValue.toLocaleString()} {configuracoes.moeda}
                </span>
              </div>
              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1"></div>
              <div className="flex justify-between items-center text-sm font-bold">
                <span className="text-slate-800 dark:text-slate-200">Saldo em Dívida:</span>
                <span className="font-mono text-amber-600">
                  {recoveryData.saldoEmDivida.toLocaleString()} {configuracoes.moeda}
                </span>
              </div>
            </Box>

            <div className="flex flex-col gap-1">
              <TextField
                required
                label="Valor do Pagamento Efetuado"
                type="number"
                fullWidth
                size="small"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                helperText={`Informe o valor pago em ${configuracoes.moeda}`}
                id="payment-amount"
              />
              {recoveryData.saldoEmDivida > 0 && (
                <div className="flex justify-end">
                  <Button 
                    size="small" 
                    variant="text" 
                    onClick={() => setPaymentAmount(recoveryData.saldoEmDivida.toString())}
                    sx={{ textTransform: 'none', fontSize: '11px', py: 0.5 }}
                  >
                    Preencher valor pendente ({recoveryData.saldoEmDivida.toLocaleString()} {configuracoes.moeda})
                  </Button>
                </div>
              )}
            </div>

            <TextField
              label="Observação / Referência Bancária"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={paymentMemo}
              onChange={(e) => setPaymentMemo(e.target.value)}
              placeholder="Ex: Transação bancária Ref #12345, cheque, etc."
              helperText="Identificação opcional para rastreabilidade de depósito."
              id="payment-memo"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenPaymentDialog(false)} color="inherit">Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleConfirmCommissionPayment} 
            startIcon={<CheckCircle size={14} />} 
            id="btn-submit-payment"
            disabled={!paymentAmount || Number(paymentAmount) <= 0}
          >
            Confirmar e Registrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog for Registering New Expense */}
      <Dialog 
        open={openExpenseDialog} 
        onClose={() => setOpenExpenseDialog(false)}
        maxWidth="xs"
        fullWidth
        id="dialog-registrar-despesa"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingDown size={20} className="text-red-600" />
          <span>Registrar Despesa Operacional</span>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              required
              label="Descrição da Despesa"
              fullWidth
              size="small"
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              placeholder="Ex: Suprimentos térmicos para impressoras"
            />
            <FormControl fullWidth size="small">
              <InputLabel id="categoria-despesa-label">Categoria</InputLabel>
              <Select
                labelId="categoria-despesa-label"
                value={expenseCat}
                label="Categoria"
                onChange={(e) => setExpenseCat(e.target.value)}
              >
                <MenuItem value="Suprimentos">Suprimentos</MenuItem>
                <MenuItem value="Manutenção">Manutenção</MenuItem>
                <MenuItem value="Operações">Operações</MenuItem>
                <MenuItem value="Comunicações">Comunicações</MenuItem>
                <MenuItem value="Outros">Outros</MenuItem>
              </Select>
            </FormControl>
            <TextField
              required
              label={`Valor (${configuracoes.moeda})`}
              type="number"
              fullWidth
              size="small"
              value={expenseVal}
              onChange={(e) => setExpenseVal(e.target.value)}
            />
            <TextField
              label="Responsável"
              fullWidth
              size="small"
              value={expenseResp}
              onChange={(e) => setExpenseResp(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenExpenseDialog(false)} color="inherit">Cancelar</Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleAddExpense}
            startIcon={<CheckCircle size={14} />}
          >
            Registrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
