import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import FormattedCurrencyInput from '../../components/FormattedCurrencyInput';
import { 
  TrendingUp, Landmark, Store, Users, UserCheck, 
  Receipt, FileText, AlertTriangle, ArrowRight, MapPin, DollarSign, Calendar,
  Smartphone, PlusCircle, User, Award, CheckCircle2, RefreshCw
} from 'lucide-react';
import { 
  Card, CardContent, Typography, Box, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, 
  LinearProgress, MenuItem, Select, FormControl, InputLabel, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider
} from '@mui/material';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, BarElement, ArcElement, Title, Tooltip as ChartTooltip, Legend 
} from 'chart.js';

// Register ChartJS elements
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, ArcElement, Title, ChartTooltip, Legend
);

export default function Dashboard() {
  const { 
    pagamentos, mercados, agentes, contribuintes, 
    municipios, tiposReceita, activeProfile, configuracoes, auditoriaLogs, currentUser,
    addPagamento, addNotification
  } = useAppStore();

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  const [selectedMunicipio, setSelectedMunicipio] = useState<string>(isAdmin ? userMuniId : 'todos');
  const [selectedMercado, setSelectedMercado] = useState<string>('todos');
  const [selectedAgente, setSelectedAgente] = useState<string>('todos');

  // Filter payments based on municipality, market, and agent selection
  const filteredPagamentos = useMemo(() => {
    const currentMuniId = isAdmin ? userMuniId : selectedMunicipio;
    return pagamentos.filter(p => {
      // Resolve municipality ID flexibly
      const pMuni = p.municipioId || agentes.find(a => a.id === p.agenteId)?.municipioId || mercados.find(m => m.id === p.mercadoId)?.municipioId || '';

      if (isAdmin && pMuni && userMuniId && pMuni !== userMuniId) {
        return false;
      }
      const matchMuni = currentMuniId === 'todos' || !currentMuniId || pMuni === currentMuniId || (!pMuni && currentMuniId === userMuniId);
      const matchMerc = selectedMercado === 'todos' || p.mercadoId === selectedMercado;
      const matchAgente = selectedAgente === 'todos' || p.agenteId === selectedAgente;
      return matchMuni && matchMerc && matchAgente;
    });
  }, [pagamentos, selectedMunicipio, selectedMercado, selectedAgente, isAdmin, userMuniId, agentes, mercados]);

  // Ranking & Performance of Mobile Agents
  const agentesRanking = useMemo(() => {
    const currentMuniId = isAdmin ? userMuniId : selectedMunicipio;
    const allowedAgentes = agentes.filter(a => currentMuniId === 'todos' || a.municipioId === currentMuniId);

    const rankingMap: { [agenteId: string]: { agente: any; total: number; count: number; mercadoNome: string } } = {};

    allowedAgentes.forEach(a => {
      const merc = mercados.find(m => m.id === a.mercadoId);
      rankingMap[a.id] = {
        agente: a,
        total: 0,
        count: 0,
        mercadoNome: merc ? merc.nome : 'Mercado Geral'
      };
    });

    filteredPagamentos
      .filter(p => p.status === 'pago')
      .forEach(p => {
        if (rankingMap[p.agenteId]) {
          rankingMap[p.agenteId].total += p.valor;
          rankingMap[p.agenteId].count += 1;
        } else {
          const ag = agentes.find(a => a.id === p.agenteId);
          if (ag) {
            const merc = mercados.find(m => m.id === ag.mercadoId);
            rankingMap[p.agenteId] = {
              agente: ag,
              total: p.valor,
              count: 1,
              mercadoNome: merc ? merc.nome : 'Mercado Geral'
            };
          }
        }
      });

    return Object.values(rankingMap).sort((a, b) => b.total - a.total);
  }, [filteredPagamentos, agentes, mercados, selectedMunicipio, isAdmin, userMuniId]);

  // Calculations for KPI cards
  const kpis = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const paidPayments = filteredPagamentos.filter(p => p.status === 'pago');

    const receitaHoje = paidPayments
      .filter(p => p.dataPagamento && p.dataPagamento.startsWith(todayStr))
      .reduce((sum, p) => sum + p.valor, 0);

    const receitaOntem = paidPayments
      .filter(p => p.dataPagamento && p.dataPagamento.startsWith(yesterdayStr))
      .reduce((sum, p) => sum + p.valor, 0);

    const receitaMes = paidPayments
      .filter(p => {
        if (!p.dataPagamento) return false;
        const d = new Date(p.dataPagamento);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, p) => sum + p.valor, 0);

    const receitaAno = paidPayments
      .filter(p => p.dataPagamento && new Date(p.dataPagamento).getFullYear() === currentYear)
      .reduce((sum, p) => sum + p.valor, 0);

    const currentMuniId = isAdmin ? userMuniId : selectedMunicipio;

    const totalMercados = currentMuniId === 'todos' 
      ? mercados.length 
      : mercados.filter(m => m.municipioId === currentMuniId).length;

    const totalAgentes = currentMuniId === 'todos'
      ? agentes.length
      : agentes.filter(a => a.municipioId === currentMuniId).length;

    const totalContribuintes = currentMuniId === 'todos'
      ? contribuintes.length
      : contribuintes.filter(c => mercados.find(m => m.id === c.mercadoId)?.municipioId === currentMuniId).length;

    const totalRecibos = filteredPagamentos.length;
    const pagamentosPendentes = filteredPagamentos.filter(p => p.status === 'pendente' || p.status === 'cancelamento_pendente').length;

    let variacaoHoje = 'Sem cobranças hoje';
    if (receitaOntem > 0) {
      const pct = ((receitaHoje - receitaOntem) / receitaOntem) * 100;
      variacaoHoje = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs ontem`;
    } else if (receitaHoje > 0) {
      variacaoHoje = 'Cobranças efetuadas hoje';
    }

    // Total collected directly by mobile agents in current filter
    const totalArrecadadoAgentes = paidPayments.reduce((sum, p) => sum + p.valor, 0);

    return {
      receitaHoje,
      receitaOntem,
      variacaoHoje,
      receitaMes,
      receitaAno,
      totalMercados,
      totalAgentes,
      totalContribuintes,
      totalRecibos,
      pagamentosPendentes,
      totalArrecadadoAgentes
    };
  }, [filteredPagamentos, mercados, agentes, contribuintes, selectedMunicipio, isAdmin, userMuniId]);

  // Chart Data: Revenue Over Time (Daily - Last 7 Days)
  const lineChartData = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const dataPoints = dates.map(date => {
      return filteredPagamentos
        .filter(p => p.status === 'pago' && p.dataPagamento && p.dataPagamento.startsWith(date))
        .reduce((sum, p) => sum + p.valor, 0);
    });

    const labels = dates.map(d => {
      const parts = d.split('-');
      return `${parts[2]}/${parts[1]}`;
    });

    return {
      labels,
      datasets: [
        {
          label: 'Receitas (FCFA)',
          data: dataPoints,
          borderColor: '#0B4EA2',
          backgroundColor: 'rgba(11, 78, 162, 0.1)',
          tension: 0.3,
          fill: true,
        },
      ],
    };
  }, [filteredPagamentos]);

  // Chart Data: Revenue by Market
  const barChartData = useMemo(() => {
    const marketMap: { [name: string]: number } = {};
    const currentMuniId = isAdmin ? userMuniId : selectedMunicipio;
    
    // Seed all relevant markets
    mercados.forEach(m => {
      if (currentMuniId === 'todos' || m.municipioId === currentMuniId) {
        marketMap[m.nome] = 0;
      }
    });

    filteredPagamentos
      .filter(p => p.status === 'pago')
      .forEach(p => {
        const merc = mercados.find(m => m.id === p.mercadoId);
        if (merc && marketMap[merc.nome] !== undefined) {
          marketMap[merc.nome] += p.valor;
        }
      });

    return {
      labels: Object.keys(marketMap),
      datasets: [
        {
          label: 'Receitas por Mercado (FCFA)',
          data: Object.values(marketMap),
          backgroundColor: '#28A745',
          borderRadius: 6,
        },
      ],
    };
  }, [filteredPagamentos, mercados, selectedMunicipio, isAdmin, userMuniId]);

  // Chart Data: Payment Method
  const donutChartData = useMemo(() => {
    const methods = {
      'Dinheiro': 0,
      'Orange Money': 0,
      'Transferência Bancária': 0,
      'Outro': 0
    };

    filteredPagamentos
      .filter(p => p.status === 'pago')
      .forEach(p => {
        if (methods[p.formaPagamento] !== undefined) {
          methods[p.formaPagamento] += p.valor;
        }
      });

    return {
      labels: Object.keys(methods),
      datasets: [
        {
          data: Object.values(methods),
          backgroundColor: ['#0B4EA2', '#FF6B00', '#28A745', '#94A3B8'],
          borderWidth: 0,
        },
      ],
    };
  }, [filteredPagamentos]);

  // Latest Collections directly from database sorted by date descending
  const ultimasCobrancas = useMemo(() => {
    return [...filteredPagamentos]
      .sort((a, b) => {
        const timeA = new Date(a.dataPagamento || a.dataCriacao || 0).getTime();
        const timeB = new Date(b.dataPagamento || b.dataCriacao || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 10);
  }, [filteredPagamentos]);

  // Filter audit logs
  const allowedLogs = useMemo(() => {
    if (!isAdmin) return auditoriaLogs;
    const allowedUserNames = new Set([
      currentUser?.nome?.toLowerCase(),
      currentUser?.email?.toLowerCase(),
      ...agentes.filter(a => a.municipioId === userMuniId).map(a => a.nome.toLowerCase()),
      ...agentes.filter(a => a.municipioId === userMuniId).map(a => a.usuario.toLowerCase())
    ].filter(Boolean));
    return auditoriaLogs.filter(log => {
      const logUser = log.usuario.toLowerCase();
      return allowedUserNames.has(logUser);
    });
  }, [auditoriaLogs, agentes, currentUser, isAdmin, userMuniId]);

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      
      {/* Title Header & Filters */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, gap: 2 }}>
        <div>
          <Typography variant="h1" sx={{ color: 'text.primary', mb: 0.5 }}>Receita 360 Dashboard</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Acompanhamento em tempo real das cobranças e arrecadações dos agentes móveis
          </Typography>
        </div>

        {/* Global Filter Controls */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150, bg: 'background.paper' }} disabled={isAdmin}>
            <InputLabel id="muni-filter-label">Município</InputLabel>
            <Select
              labelId="muni-filter-label"
              id="muni-filter"
              value={isAdmin ? userMuniId : selectedMunicipio}
              label="Município"
              onChange={(e) => {
                setSelectedMunicipio(e.target.value);
                setSelectedMercado('todos');
                setSelectedAgente('todos');
              }}
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

          <FormControl size="small" sx={{ minWidth: 150, bg: 'background.paper' }}>
            <InputLabel id="merc-filter-label">Mercado</InputLabel>
            <Select
              labelId="merc-filter-label"
              id="merc-filter"
              value={selectedMercado}
              label="Mercado"
              onChange={(e) => setSelectedMercado(e.target.value)}
              disabled={!isAdmin && selectedMunicipio === 'todos'}
            >
              <MenuItem value="todos">Todos Mercados</MenuItem>
              {mercados
                .filter(m => (isAdmin ? userMuniId : selectedMunicipio) === 'todos' || m.municipioId === (isAdmin ? userMuniId : selectedMunicipio))
                .map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                ))}
            </Select>
          </FormControl>

          {/* Agente Móvel Filter */}
          <FormControl size="small" sx={{ minWidth: 160, bg: 'background.paper' }}>
            <InputLabel id="agente-filter-label">Agente Móvel</InputLabel>
            <Select
              labelId="agente-filter-label"
              id="agente-filter"
              value={selectedAgente}
              label="Agente Móvel"
              onChange={(e) => setSelectedAgente(e.target.value)}
            >
              <MenuItem value="todos">Todos os Agentes</MenuItem>
              {agentes
                .filter(a => (isAdmin ? userMuniId : selectedMunicipio) === 'todos' || a.municipioId === (isAdmin ? userMuniId : selectedMunicipio))
                .map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.nome} (@{a.usuario})</MenuItem>
                ))}
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="kpi-cards-grid">
        <div>
          <Card>
            <CardContent className="relative">
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Receita Hoje</Typography>
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <TrendingUp size={16} />
                </div>
              </Box>
              <Typography variant="h3" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#0B4EA2' }}>
                {kpis.receitaHoje.toLocaleString()} <span className="text-xs font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
              </Typography>
              <div className="text-[10px] text-green-500 font-semibold mt-1.5 flex items-center gap-1">
                <span>{kpis.variacaoHoje}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Arrecadação do Mês</Typography>
                <div className="p-1.5 rounded-lg bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400">
                  <Landmark size={16} />
                </div>
              </Box>
              <Typography variant="h3" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#28A745' }}>
                {kpis.receitaMes.toLocaleString()} <span className="text-xs font-sans font-medium text-slate-500">{configuracoes.moeda}</span>
              </Typography>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1.5 flex items-center gap-1">
                <span>{kpis.totalRecibos} recibos no histórico da base de dados</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Mercados Ativos</Typography>
                <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Store size={16} />
                </div>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {kpis.totalMercados}
              </Typography>
              <div className="text-[10px] text-slate-400 mt-1.5">
                Pontos de fiscalização estruturados
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>Agentes em Atividade</Typography>
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Smartphone size={16} />
                </div>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {kpis.totalAgentes}
              </Typography>
              <div className="text-[10px] text-emerald-500 font-semibold mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Coletores móveis sincronizados</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MOBILE AGENTS DESEMPENHO E RANKING SECTION */}
      <Box sx={{ mb: 4 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Award size={22} />
                </div>
                <div>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    Desempenho e Cobrança dos Agentes Móveis
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Acompanhamento individual das arrecadações em campo enviadas pelos terminais móveis
                  </Typography>
                </div>
              </Box>
              <Chip 
                icon={<Smartphone size={14} />} 
                label={`${agentesRanking.length} Agentes Móveis Ativos`} 
                color="primary" 
                variant="outlined" 
                sx={{ fontWeight: 600 }}
              />
            </Box>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentesRanking.length === 0 ? (
                <div className="col-span-full py-8 text-center text-slate-400">
                  Nenhum agente cadastrado ou ativo para o filtro selecionado.
                </div>
              ) : (
                agentesRanking.map((rank, index) => {
                  const maxTotal = agentesRanking[0]?.total || 1;
                  const pct = Math.min(100, Math.round((rank.total / (maxTotal || 1)) * 100));

                  return (
                    <Paper 
                      key={rank.agente.id} 
                      variant="outlined" 
                      sx={{ p: 2, borderRadius: 2, borderLeft: index === 0 ? '4px solid #0B4EA2' : undefined }}
                      className="hover:shadow-sm transition-shadow"
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            index === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                            index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200' :
                            'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          }`}>
                            #{index + 1}
                          </div>
                          <div>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                              {rank.agente.nome}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <User size={12} /> @{rank.agente.usuario} • {rank.mercadoNome}
                            </Typography>
                          </div>
                        </Box>
                        <Chip 
                          size="small" 
                          icon={<CheckCircle2 size={12} />} 
                          label={rank.agente.status === 'ativo' ? 'Ativo' : 'Inativo'} 
                          color={rank.agente.status === 'ativo' ? 'success' : 'default'} 
                          sx={{ fontSize: '10px', height: 20 }}
                        />
                      </Box>

                      <Divider sx={{ my: 1 }} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', my: 1 }}>
                        <div>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Total Arrecadado</Typography>
                          <Typography variant="h4" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, color: '#0B4EA2' }}>
                            {rank.total.toLocaleString()} <span className="text-xs text-slate-500 font-sans">{configuracoes.moeda}</span>
                          </Typography>
                        </div>
                        <div className="text-right">
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Recibos</Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {rank.count}
                          </Typography>
                        </div>
                      </Box>

                      {/* Meta Diária de Cobrança Progress Bar */}
                      {(() => {
                        const targetMeta = configuracoes.metaDiariaAgente || 10000;
                        const pctMeta = Math.min(100, Math.round((rank.total / targetMeta) * 100));

                        return (
                          <Box sx={{ mt: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                                Meta Diária de Cobrança
                              </span>
                              <span className="text-[11px] text-slate-800 dark:text-slate-100 font-bold">
                                {pctMeta}% <span className="font-normal text-slate-500 dark:text-slate-400">({rank.total.toLocaleString('pt-PT')} / {targetMeta.toLocaleString('pt-PT')} {configuracoes.moeda})</span>
                              </span>
                            </Box>
                            <LinearProgress 
                              variant="determinate" 
                              value={pctMeta} 
                              sx={{ 
                                height: 7, 
                                borderRadius: 3.5, 
                                bgcolor: '#e2e8f0', 
                                '& .MuiLinearProgress-bar': { 
                                  bgcolor: pctMeta >= 100 ? '#10b981' : '#0B4EA2', 
                                  borderRadius: 3.5 
                                } 
                              }} 
                            />
                          </Box>
                        );
                      })()}
                    </Paper>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </Box>

      {/* Analytical Charts Block */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8" id="charts-grid-row-1">
        <div className="lg:col-span-8">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 3 }}>Arrecadação Diária (Últimos 7 dias)</Typography>
              <div className="h-64 flex items-center justify-center">
                <Line 
                  data={lineChartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false }
                    },
                    scales: {
                      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                      x: { grid: { display: false } }
                    }
                  }} 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 3 }}>Método de Pagamento</Typography>
              <div className="h-56 flex items-center justify-center">
                <Doughnut 
                  data={donutChartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    }
                  }} 
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8" id="charts-grid-row-2">
        <div className="md:col-span-6">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 3 }}>Arrecadação por Mercado</Typography>
              <div className="h-64 flex items-center justify-center">
                <Bar 
                  data={barChartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false }
                    },
                    scales: {
                      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                      x: { grid: { display: false } }
                    }
                  }} 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Mercado Map Simulation */}
        <div className="md:col-span-6">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>Mapa de Arrecadação de Mercados (GPS)</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                Posicionamento geográfico dos agentes ativos em tempo real
              </Typography>
              
              <div className="relative rounded-lg h-60 bg-slate-100 dark:bg-slate-950 border dark:border-slate-800 overflow-hidden flex flex-col justify-between p-4">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] dark:bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
                
                <div className="relative flex-1">
                  {mercados
                    .filter(m => (isAdmin ? userMuniId : selectedMunicipio) === 'todos' || m.municipioId === (isAdmin ? userMuniId : selectedMunicipio))
                    .map((m, i) => (
                      <div 
                        key={m.id}
                        className="absolute flex items-center gap-1 cursor-pointer group"
                        style={{
                          top: `${30 + (i * 25) % 60}%`,
                          left: `${15 + (i * 35) % 75}%`
                        }}
                      >
                        <div className="relative">
                          <div className="absolute -inset-1.5 rounded-full bg-blue-500 animate-ping opacity-75" />
                          <MapPin size={18} className="text-blue-600 dark:text-blue-400 relative z-10" />
                        </div>
                        <span className="text-[10px] font-bold bg-slate-900/95 text-white dark:bg-white dark:text-slate-900 px-1.5 py-0.5 rounded shadow-md pointer-events-none group-hover:scale-105 transition-transform">
                          {m.nome}
                        </span>
                      </div>
                    ))}
                </div>

                <div className="relative z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-3 rounded-lg border dark:border-slate-800 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Agentes Sincronizados</span>
                  </div>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    Total: {mercados.filter(m => (isAdmin ? userMuniId : selectedMunicipio) === 'todos' || m.municipioId === (isAdmin ? userMuniId : selectedMunicipio)).length} Mercados
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Grid for Table of Last Receipts and Recent Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Charges Table */}
        <div className="lg:col-span-8">
          <Card>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Últimas Cobranças Realizadas</Typography>
                <Chip size="small" icon={<RefreshCw size={12} className="animate-spin" />} label="Sincronização em tempo real" color="secondary" sx={{ fontSize: 10, fontWeight: 600 }} />
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ border: 'none', bg: 'transparent' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Recibo</TableCell>
                      <TableCell>Agente Móvel</TableCell>
                      <TableCell>Contribuinte</TableCell>
                      <TableCell>Mercado</TableCell>
                      <TableCell>Taxa</TableCell>
                      <TableCell>Valor</TableCell>
                      <TableCell>Pagamento</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ultimasCobrancas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <Receipt size={32} className="text-slate-400 opacity-60" />
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                              Nenhuma cobrança registrada na base de dados no momento
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 400 }}>
                              O histórico foi limpo ou ainda não possui novos recibos. Qualquer cobrança registrada pelos agentes aparecerá aqui em tempo real.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ultimasCobrancas.map((pay) => {
                        const agObj = agentes.find(a => a.id === pay.agenteId);
                        const agName = agObj ? agObj.nome : (pay.agenteId ? `Agente #${pay.agenteId}` : 'Agente Não Identificado');
                        const mercName = mercados.find(m => m.id === pay.mercadoId)?.nome || 'Mercado Geral';
                        const contrName = contribuintes.find(c => c.id === pay.contribuinteId)?.nome || 'Contribuinte';
                        const txName = tiposReceita.find(t => t.id === pay.tipoReceitaId)?.nome || 'Taxa';

                        return (
                          <TableRow key={pay.id} hover>
                            <TableCell className="font-mono font-semibold text-slate-900 dark:text-white">
                              #{pay.reciboId}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Smartphone size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                <div>
                                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px', lineHeight: 1.1 }}>
                                    {agName}
                                  </Typography>
                                  {agObj?.usuario && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '11px' }}>
                                      @{agObj.usuario}
                                    </Typography>
                                  )}
                                </div>
                              </Box>
                            </TableCell>
                            <TableCell>{contrName}</TableCell>
                            <TableCell>{mercName}</TableCell>
                            <TableCell>{txName}</TableCell>
                            <TableCell className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {pay.valor.toLocaleString()} {configuracoes.moeda}
                            </TableCell>
                            <TableCell>{pay.formaPagamento}</TableCell>
                            <TableCell align="right">
                              <Chip 
                                size="small" 
                                label={
                                  pay.status === 'pago' ? 'Pago' :
                                  pay.status === 'cancelamento_pendente' ? 'Cancelamento Solicitado' : 'Pendente'
                                }
                                color={
                                  pay.status === 'pago' ? 'success' :
                                  pay.status === 'cancelamento_pendente' ? 'warning' : 'default'
                                }
                                sx={{ fontSize: '10px', height: 20 }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Audit Activities list */}
        <div className="lg:col-span-4">
          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 3 }}>Atividade Recente (Logs)</Typography>
              <div className="space-y-4">
                {allowedLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex gap-3 text-xs leading-normal pb-3 border-b dark:border-slate-800 last:border-b-0">
                    <div className="mt-0.5">
                      <span className={`w-2 h-2 rounded-full block ${
                        log.acao === 'login' ? 'bg-blue-500' :
                        log.acao === 'criacao' ? 'bg-green-500' :
                        log.acao === 'sincronizacao' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{log.descricao}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1 flex justify-between">
                        <span>{log.usuario}</span>
                        <span>{log.data} {log.hora}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Box>
  );
}

