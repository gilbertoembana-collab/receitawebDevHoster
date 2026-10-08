import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store';
import { 
  LayoutDashboard, Building2, Store, Users, UserCheck, 
  Receipt, Landmark, ShieldAlert, Settings, User, BarChart3, HelpCircle
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { activeProfile, configuracoes } = useAppStore();
  const [dbConnected, setDbConnected] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setDbConnected(true);
        } else {
          setDbConnected(false);
        }
      } catch (err) {
        setDbConnected(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  // Define navigation configuration with authorized profiles
  const navItems = [
    { 
      name: 'Dashboard', 
      path: '/dashboard', 
      icon: LayoutDashboard, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Supervisor', 'Collection Agent', 'Cashier', 'Auditor', 'Diretor Financeiro', 'Departamento de Mercados', 'Fiscal Supervisor'
      ] 
    },
    { 
      name: 'Municípios', 
      path: '/municipios', 
      icon: Building2, 
      roles: ['Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional', 'Super Administrador', 'Super Admin'] 
    },
    { 
      name: 'Mercados', 
      path: '/mercados', 
      icon: Store, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Departamento de Mercados', 'Fiscal Supervisor', 'Supervisor'
      ] 
    },
    { 
      name: 'Agentes de Cobrança', 
      path: '/agentes', 
      icon: Users, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro',
        'Super Administrador', 'Super Admin', 'Administrator', 'Departamento de Mercados', 'Fiscal Supervisor', 'Supervisor'
      ] 
    },
    { 
      name: 'Contribuintes', 
      path: '/contribuintes', 
      icon: UserCheck, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Departamento de Mercados', 'Fiscal Supervisor', 'Supervisor', 'Collection Agent'
      ] 
    },
    { 
      name: 'Tipos de Receita', 
      path: '/tipos-receita', 
      icon: Receipt, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro',
        'Super Administrador', 'Super Admin', 'Departamento de Mercados'
      ] 
    },
    { 
      name: 'Gestão de Pagamentos', 
      path: '/pagamentos', 
      icon: Receipt, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Diretor Financeiro', 'Departamento de Mercados', 'Fiscal Supervisor', 'Supervisor', 'Cashier'
      ] 
    },
    { 
      name: 'Financeiro', 
      path: '/financeiro', 
      icon: Landmark, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro',
        'Super Administrador', 'Super Admin', 'Administrator', 'Diretor Financeiro', 'Cashier'
      ] 
    },
    { 
      name: 'Relatórios Analíticos', 
      path: '/relatorios', 
      icon: BarChart3, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Diretor Financeiro', 'Auditor'
      ] 
    },
    { 
      name: 'Auditoria de Sistema', 
      path: '/auditoria', 
      icon: ShieldAlert, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal',
        'Super Administrador', 'Super Admin', 'Administrator', 'Auditor'
      ] 
    },
    { 
      name: 'Configurações', 
      path: '/configuracoes', 
      icon: Settings, 
      roles: [
        'Platform Owner',
        'Administrador Municipal',
        'Super Administrador', 'Super Admin', 'Administrator'
      ] 
    },
    { 
      name: 'Gestão de Usuários', 
      path: '/usuarios', 
      icon: Users, 
      roles: [
        'Platform Owner',
        'Administrador Municipal',
        'Super Administrador', 'Super Admin', 'Administrator'
      ] 
    },
    { 
      name: 'Perfil / Simulador', 
      path: '/perfil', 
      icon: User, 
      roles: [
        'Platform Owner', 'Administrador Nacional', 'Supervisor Nacional', 'Auditor Nacional',
        'Administrador Municipal', 'Supervisor Municipal', 'Financeiro', 'Tesoureiro', 'Fiscal', 'Agente de Cobrança', 'Consulta / Relatórios',
        'Super Administrador', 'Super Admin', 'Administrator', 'Diretor Financeiro', 'Departamento de Mercados', 'Fiscal Supervisor', 'Supervisor', 'Collection Agent', 'Cashier', 'Auditor'
      ] 
    }
  ];

  // Filter items by profile role
  const allowedItems = navItems.filter(item => item.roles.includes(activeProfile));

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B4EA2] text-white font-sans border-r border-blue-800/50 w-60">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-800/50">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-700/80 text-white font-bold text-xl shadow-md border border-blue-600/50">
          R3
        </div>
        <div>
          <h1 className="text-xl font-bold leading-none text-white tracking-tight">Receita 360 web</h1>
          <p className="text-[10px] text-blue-200 uppercase tracking-widest mt-1">Gestão Municipal</p>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="px-6 py-4 border-b border-blue-800/50 bg-blue-900/30">
        <div className="text-xs text-blue-200 font-semibold mb-1">Perfil Ativo:</div>
        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-800 text-white border border-blue-700/50 shadow-xs">
          {activeProfile}
        </div>
        <div className="text-[11px] text-blue-200 mt-1.5 leading-tight truncate">
          {configuracoes.nomeMunicipio}
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {allowedItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={index}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                ${isActive 
                  ? 'bg-blue-700/50 text-white font-semibold shadow-sm' 
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                }
              `}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Branding Info */}
      <div className="p-4 border-t border-blue-800/50 text-center bg-blue-950/20 text-blue-200">
        <div className="flex items-center justify-center gap-1.5 mb-1.5 text-[10px] font-semibold">
          {dbConnected === null ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-300">Testando Supabase...</span>
            </>
          ) : dbConnected ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-500 shadow-xs" />
              <span className="text-emerald-300">Supabase: CONECTADO</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-rose-400">Supabase: ERRO CONEXÃO</span>
            </>
          )}
        </div>
        <div className="text-[10px] text-blue-300">© 2026 Receita 360</div>
        <div className="text-[9px] text-blue-300/80 mt-0.5 font-mono">Sincronizado com Mobile • v2.4.0</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed) */}
      <div className="hidden lg:flex lg:flex-shrink-0 lg:w-60 h-screen sticky top-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300" 
            onClick={onClose}
          />
          {/* Drawer content */}
          <div className="relative flex flex-col max-w-xs w-full h-full bg-[#0B4EA2] animate-slide-right shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
