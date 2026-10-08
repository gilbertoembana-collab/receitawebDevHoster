import React, { useState } from 'react';
import { useAppStore } from '../store';
import { 
  Bell, Search, Sun, Moon, Check, LogOut, Shield, Wifi, ChevronDown
} from 'lucide-react';
import { Menu, MenuItem, IconButton, Badge, Tooltip, Typography, Divider } from '@mui/material';

interface TopbarProps {
  onToggleMobileMenu: () => void;
}

export default function Topbar({ onToggleMobileMenu }: TopbarProps) {
  const { 
    activeProfile, 
    availableUsers, 
    setProfile, 
    darkMode, 
    toggleDarkMode,
    searchQuery,
    setSearchQuery,
    notifications,
    markAllNotificationsRead,
    clearNotifications,
    configuracoes,
    currentUser,
    setCurrentUser
  } = useAppStore();

  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);

  const unreadNotifications = notifications.filter(n => !n.read).length;

  const handleProfileOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileAnchor(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchor(null);
  };

  const handleProfileSelect = (profile: any) => {
    setProfile(profile);
    handleProfileClose();
  };

  const handleNotificationOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchor(null);
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 flex items-center justify-between px-8 transition-colors duration-150">
      
      {/* Search & Mobile Toggle */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <IconButton 
          onClick={onToggleMobileMenu} 
          className="lg:hidden text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          id="btn-mobile-toggle"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </IconButton>

        <div className="relative w-full hidden md:block">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar contribuintes, recibos..."
            className="w-80 bg-slate-100 dark:bg-slate-950/80 border-none rounded-full py-2 pl-10 pr-4 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all duration-150 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-sans"
            id="global-search-input"
          />
        </div>
      </div>

      {/* Action Icons */}
      <div className="flex items-center gap-3">
        
        {/* Real-time Status */}
        <Tooltip title="Sincronizado em tempo real com a base de dados Supabase" arrow>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-help" id="sync-status-badge">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold tracking-wide uppercase hidden sm:inline">Supabase Ativo</span>
            <Wifi size={13} className="sm:hidden" />
          </div>
        </Tooltip>

        {/* Light/Dark Toggle */}
        <Tooltip title={darkMode ? 'Tema Claro' : 'Tema Escuro'}>
          <IconButton 
            onClick={toggleDarkMode}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            id="theme-toggle-button"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
        </Tooltip>

        {/* Notifications Icon with Badge */}
        <Tooltip title="Notificações">
          <IconButton 
            onClick={handleNotificationOpen}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            id="notifications-button"
          >
            <Badge badgeContent={unreadNotifications} color="error" overlap="rectangular">
              <Bell size={20} />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* User Account / Profile Swapper */}
        <div className="flex items-center gap-2 pl-6 border-l border-slate-200 dark:border-slate-800">
          <button 
            onClick={handleProfileOpen}
            className="flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 p-1.5 px-2.5 rounded-lg transition-colors duration-150"
            id="profile-dropdown-button"
          >
            <div className="hidden md:block text-right leading-tight">
              <p className="text-xs font-bold text-slate-850 dark:text-slate-100">{currentUser?.nome || 'Carlos Eduardo'}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider">{activeProfile}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-300 dark:border-slate-700 shadow-xs">
              {(currentUser?.nome || 'Carlos Eduardo').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
        </div>

        {/* Notifications Dropdown menu */}
        <Menu
          anchorEl={notificationAnchor}
          open={Boolean(notificationAnchor)}
          onClose={handleNotificationClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{
            paper: {
              className: 'w-80 max-h-96 mt-2 dark:bg-slate-900 border dark:border-slate-800 shadow-xl rounded-xl'
            }
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between border-b dark:border-slate-800">
            <Typography variant="subtitle2" className="font-bold dark:text-white">Notificações</Typography>
            {unreadNotifications > 0 && (
              <button 
                onClick={markAllNotificationsRead} 
                className="text-xs text-blue-500 hover:underline font-semibold"
              >
                Lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-72 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">Nenhuma notificação no momento.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`p-3 border-b dark:border-slate-800 flex flex-col gap-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${!n.read ? 'bg-blue-500/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${n.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}>{n.title}</span>
                    <span className="text-[9px] text-slate-400">{n.time}</span>
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{n.message}</span>
                </div>
              ))
            )}
          </div>
          <Divider />
          <div className="p-2 text-center">
            <button 
              onClick={clearNotifications} 
              className="text-xs text-red-500 hover:underline font-semibold"
            >
              Limpar todas
            </button>
          </div>
        </Menu>

        {/* Profiles Select Dropdown menu */}
        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={handleProfileClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{
            paper: {
              className: 'w-64 mt-2 dark:bg-slate-900 border dark:border-slate-800 shadow-xl rounded-xl'
            }
          }}
        >
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/40">
            <Typography variant="caption" className="text-slate-400 block font-semibold mb-1 uppercase tracking-wide">Alternar Perfil Administrativo</Typography>
            <Typography variant="body2" className="font-bold dark:text-white">Selecione para testar acessos:</Typography>
          </div>
          <Divider />
          {['Platform Owner', 'Super Administrador', 'Administrador Municipal', 'Diretor Financeiro', 'Departamento de Mercados', 'Fiscal Supervisor']
            .filter((prof) => {
              const isAdmin = ['Administrador Municipal', 'Administrator'].includes(activeProfile);
              if (isAdmin && ['Super Administrador', 'Super Admin', 'Platform Owner'].includes(prof)) {
                return false;
              }
              return true;
            })
            .map((prof) => (
            <MenuItem 
              key={prof} 
              onClick={() => handleProfileSelect(prof)}
              className="flex items-center justify-between py-2.5 px-4 text-xs dark:text-slate-200"
            >
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-blue-500" />
                <span className={activeProfile === prof ? 'font-bold text-blue-600 dark:text-blue-400' : ''}>{prof}</span>
              </div>
              {activeProfile === prof && <Check size={14} className="text-green-500" />}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem 
            onClick={() => {
              setCurrentUser(null);
              handleProfileClose();
            }} 
            className="text-red-500 text-xs py-2.5 px-4 flex items-center gap-2 cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sair do Painel</span>
          </MenuItem>
        </Menu>

      </div>
    </header>
  );
}
