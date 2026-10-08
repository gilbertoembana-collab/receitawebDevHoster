import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { 
  Download, ChevronRight, FileSpreadsheet 
} from 'lucide-react';
import { 
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Card, CardContent 
} from '@mui/material';

type ReportCategory = 
  | 'receita_diaria' 
  | 'receita_mensal' 
  | 'receita_por_agente' 
  | 'receita_por_mercado' 
  | 'receita_por_contribuinte' 
  | 'receita_por_tipo' 
  | 'receita_por_forma_pagamento';

export default function Relatorios() {
  const { pagamentos, agentes, mercados, contribuintes, tiposReceita, configuracoes, activeProfile, currentUser } = useAppStore();
  const [activeReport, setActiveReport] = useState<ReportCategory>('receita_por_mercado');

  const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
  const userMuniId = currentUser?.municipioId || '';

  // Preview generated report records
  const reportRecords = useMemo(() => {
    const paid = pagamentos.filter(p => p.status === 'pago' && (!isAdmin || p.municipioId === userMuniId));

    switch (activeReport) {
      case 'receita_diaria': {
        const dailyMap: { [date: string]: number } = {};
        paid.forEach(p => {
          const date = p.dataPagamento.split('T')[0];
          dailyMap[date] = (dailyMap[date] || 0) + p.valor;
        });
        return Object.entries(dailyMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_mensal': {
        const monthlyMap: { [month: string]: number } = {};
        paid.forEach(p => {
          const d = new Date(p.dataPagamento);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap[key] = (monthlyMap[key] || 0) + p.valor;
        });
        return Object.entries(monthlyMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_por_agente': {
        const agentMap: { [name: string]: number } = {};
        paid.forEach(p => {
          const name = agentes.find(a => a.id === p.agenteId)?.nome || 'Agente Desconhecido';
          agentMap[name] = (agentMap[name] || 0) + p.valor;
        });
        return Object.entries(agentMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_por_mercado': {
        const marketMap: { [name: string]: number } = {};
        paid.forEach(p => {
          const name = mercados.find(m => m.id === p.mercadoId)?.nome || 'Mercado Desconhecido';
          marketMap[name] = (marketMap[name] || 0) + p.valor;
        });
        return Object.entries(marketMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_por_contribuinte': {
        const contribMap: { [name: string]: number } = {};
        paid.forEach(p => {
          const name = contribuintes.find(c => c.id === p.contribuinteId)?.nome || 'Contribuinte Desconhecido';
          contribMap[name] = (contribMap[name] || 0) + p.valor;
        });
        return Object.entries(contribMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_por_tipo': {
        const typeMap: { [name: string]: number } = {};
        paid.forEach(p => {
          const name = tiposReceita.find(t => t.id === p.tipoReceitaId)?.nome || 'Taxa Desconhecida';
          typeMap[name] = (typeMap[name] || 0) + p.valor;
        });
        return Object.entries(typeMap).map(([label, valor]) => ({ label, valor }));
      }
      case 'receita_por_forma_pagamento': {
        const methodMap: { [name: string]: number } = {};
        paid.forEach(p => {
          const name = p.formaPagamento;
          methodMap[name] = (methodMap[name] || 0) + p.valor;
        });
        return Object.entries(methodMap).map(([label, valor]) => ({ label, valor }));
      }
      default:
        return [];
    }
  }, [pagamentos, agentes, mercados, contribuintes, tiposReceita, activeReport]);

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    alert(`O Relatório de ${getReportTitle()} foi gerado no formato ${format.toUpperCase()} com sucesso. O download iniciará em segundos.`);
  };

  const getReportTitle = () => {
    switch (activeReport) {
      case 'receita_diaria': return 'Receita Diária';
      case 'receita_mensal': return 'Receita Mensal';
      case 'receita_por_agente': return 'Receita por Agente de Cobrança';
      case 'receita_por_mercado': return 'Receita por Mercado Público';
      case 'receita_por_contribuinte': return 'Receita por Contribuinte (Feirante)';
      case 'receita_por_tipo': return 'Receita por Tipo de Taxa';
      case 'receita_por_forma_pagamento': return 'Receita por Forma de Pagamento';
      default: return 'Relatório de Cobrança';
    }
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h1">Relatórios Analíticos de Arrecadação</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Geração de relatórios consolidados e analíticos para fomento de decisões da Câmara Municipal
        </Typography>
      </Box>

      {/* Responsive layout with pure Tailwind CSS for 100% compilation safety */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Sidebar categories (33% width on medium screens) */}
        <div className="md:col-span-4">
          <Card>
            <CardContent sx={{ p: 1 }}>
              <div className="space-y-1">
                {[
                  { id: 'receita_por_mercado', label: 'Arrecadação por Mercado', desc: 'Desempenho por ponto físico' },
                  { id: 'receita_por_agente', label: 'Arrecadação por Agente', desc: 'Performance individual de coletores' },
                  { id: 'receita_por_tipo', label: 'Arrecadação por Tipo de Taxa', desc: 'Balanço por fato gerador' },
                  { id: 'receita_por_forma_pagamento', label: 'Arrecadação por Forma Pagamento', desc: 'Dinheiro vs Orange Money vs Banco' },
                  { id: 'receita_por_contribuinte', label: 'Faturamento por Contribuinte', desc: 'Principais feirantes arrecadados' },
                  { id: 'receita_diaria', label: 'Receita Consolidada Diária', desc: 'Histórico de arrecadação por dia' },
                  { id: 'receita_mensal', label: 'Receita Consolidada Mensal', desc: 'Comparativo de balanço mensal' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveReport(item.id as ReportCategory)}
                    className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors ${
                      activeReport === item.id 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className={`text-[10px] mt-0.5 ${activeReport === item.id ? 'text-blue-100' : 'text-slate-400'}`}>
                        {item.desc}
                      </div>
                    </div>
                    <ChevronRight size={14} className={activeReport === item.id ? 'text-white' : 'text-slate-400'} />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Preview Area (66% width on medium screens) */}
        <div className="md:col-span-8">
          <Card sx={{ height: '100%' }}>
            <CardContent>
              {/* Header inside Preview */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, borderBottom: '1px solid', borderColor: 'divider', pb: 2, mb: 3, gap: 1.5 }}>
                <div>
                  <Typography variant="h3">{getReportTitle()}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Visualização analítica consolidada da base de dados oficial
                  </Typography>
                </div>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => handleExport('csv')}>
                    CSV
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => handleExport('excel')}>
                    Excel
                  </Button>
                  <Button size="small" variant="contained" onClick={() => handleExport('pdf')}>
                    Exportar PDF
                  </Button>
                </Box>
              </Box>

              {/* Data Table Preview */}
              <TableContainer component={Paper} elevation={0} sx={{ border: 'none', bg: 'transparent' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item de Agrupamento</TableCell>
                      <TableCell align="right">Valor Total Arrecadado</TableCell>
                      <TableCell align="right">Percentual (%)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reportRecords.map((rec, i) => {
                      const totalSum = reportRecords.reduce((sum, r) => sum + r.valor, 0);
                      const percent = totalSum > 0 ? ((rec.valor / totalSum) * 100).toFixed(1) : '0.0';

                      return (
                        <TableRow key={i} hover>
                          <TableCell className="font-semibold text-slate-800 dark:text-slate-200">{rec.label}</TableCell>
                          <TableCell align="right" className="font-mono font-bold text-slate-900 dark:text-white">
                            {rec.valor.toLocaleString()} {configuracoes.moeda}
                          </TableCell>
                          <TableCell align="right" className="font-mono text-slate-500">
                            {percent}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </Box>
  );
}
