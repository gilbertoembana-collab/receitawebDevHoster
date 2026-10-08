import React from 'react';
import { useAppStore } from '../../store';
import { Shield, Sparkles, Landmark, Mail, Key } from 'lucide-react';
import { 
  Box, Typography, Card, CardContent, Divider, List, 
  ListItem, ListItemText, ListItemIcon 
} from '@mui/material';

export default function Perfil() {
  const { activeProfile, currentUser, setProfile, configuracoes } = useAppStore();

  const handleSwitchProfile = (role: any) => {
    setProfile(role);
    alert(`Perfil alterado para: ${role}\n\nO menu de navegação e as permissões de acesso foram atualizadas de acordo.`);
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h1">Perfil de Usuário e Playground de Acesso</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Informações de credenciais, papel institucional e laboratório para testes rápidos de permissões do sistema
        </Typography>
      </Box>

      {/* Responsive layout with pure Tailwind CSS for 100% compilation safety */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Profile Card */}
        <div>
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2, mb: 3 }}>
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-2xl border-2 border-blue-500 shadow-sm mx-auto">
                  {activeProfile.charAt(0)}
                </div>
                <div>
                  <Typography variant="h2">{currentUser?.nome || 'Operador de Caixa'}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                    Credencial oficial do Ministério das Finanças / Ente Municipal
                  </Typography>
                </div>
                <div className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-sm gap-1.5 mx-auto">
                  <Shield size={14} />
                  <span>{activeProfile}</span>
                </div>
              </Box>

              <Divider sx={{ my: 3 }} />

              <List disablePadding className="space-y-1">
                <ListItem disableGutters>
                  <ListItemIcon sx={{ minWidth: 36 }}><Mail size={16} className="text-slate-400" /></ListItemIcon>
                  <ListItemText 
                    primary={<span className="text-[10px] text-slate-400 font-semibold uppercase">E-mail Corporativo</span>} 
                    secondary={<span className="text-xs font-bold text-slate-800 dark:text-slate-200">{currentUser?.email || 'gilgilberto31@gmail.com'}</span>} 
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemIcon sx={{ minWidth: 36 }}><Landmark size={16} className="text-slate-400" /></ListItemIcon>
                  <ListItemText 
                    primary={<span className="text-[10px] text-slate-400 font-semibold uppercase">Jurisdição / Atribuição</span>} 
                    secondary={<span className="text-xs font-bold text-slate-800 dark:text-slate-200">{configuracoes.nomeMunicipio}</span>} 
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemIcon sx={{ minWidth: 36 }}><Key size={16} className="text-slate-400" /></ListItemIcon>
                  <ListItemText 
                    primary={<span className="text-[10px] text-slate-400 font-semibold uppercase">Status da Chave Segura</span>} 
                    secondary={<span className="text-xs font-bold text-green-500 flex items-center gap-1">● Token Sincronizado</span>} 
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </div>

        {/* Playground of Role-switching */}
        <div>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
                <Sparkles className="text-blue-600" size={20} />
                <Typography variant="h3">Playground de Controle de Acesso</Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.5 }}>
                Como o <strong>Receita 360</strong> é um painel multi-perfil, clique abaixo para se transvestir em papéis institucionais alternativos. O sistema bloqueará ou exibirá módulos na barra de navegação com base nas permissões reais de cada um.
              </Typography>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" id="role-playground-buttons">
                {[
                  { name: 'Platform Owner', desc: 'Acesso total supremo e controle de licenciamento nacional.' },
                  { name: 'Administrador Nacional', desc: 'Ministério MAT. Visão geral e consolidadora de todos os municípios.' },
                  { name: 'Supervisor Nacional', desc: 'Ministério MAT. Fiscalização nacional e auditoria regional.' },
                  { name: 'Auditor Nacional', desc: 'Ministério MAT. Leitura analítica profunda de logs tributários.' },
                  { name: 'Administrador Municipal', desc: 'Gestor local da Câmara Municipal. Configuração e controle de usuários.' },
                  { name: 'Supervisor Municipal', desc: 'Supervisor operacional local de mercados e agentes de campo.' },
                  { name: 'Financeiro', desc: 'Analista financeiro local, emissões de taxas e repasses bancários.' },
                  { name: 'Tesoureiro', desc: 'Operador de tesouraria municipal, depósitos e conciliação bancária.' },
                  { name: 'Fiscal', desc: 'Controlador de terreno para fiscalização de banca e regularização.' },
                  { name: 'Agente de Cobrança', desc: 'Fiscal arrecadador que atua presencialmente emitindo recibos.' },
                  { name: 'Consulta / Relatórios', desc: 'Acesso restrito de leitura apenas para relatórios e auditorias.' }
                ].map((role) => (
                  <button
                    key={role.name}
                    onClick={() => handleSwitchProfile(role.name as any)}
                    className={`p-3 border rounded-xl text-left transition-all duration-150 relative ${
                      activeProfile === role.name 
                        ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 justify-between">
                      <span>{role.name}</span>
                      {activeProfile === role.name && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-snug">{role.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Box>
  );
}
