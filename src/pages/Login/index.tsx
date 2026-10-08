import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { dbService } from '../../services/db';

export default function Login() {
  const { availableUsers, setCurrentUser, addNotification } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Login ou senha incorreto.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: email, password })
      });

      if (res.ok) {
        const data = await res.json();
        const loggedUser = data.user;
        setCurrentUser(loggedUser);
        dbService.addAuditLog(
          'login',
          `Acesso efetuado com sucesso via interface de login`,
          loggedUser.email
        );
        addNotification({
          title: 'Bem-vindo de volta',
          message: `Sessão iniciada como ${loggedUser.nome} (${loggedUser.perfil}).`,
          type: 'success',
        });
      } else {
        setError('Login ou senha incorreto.');
      }
    } catch (err) {
      // Fallback local verification
      const input = email.toLowerCase().trim();
      const user = availableUsers.find(
        (u) =>
          u.email.toLowerCase() === input ||
          (u.usuario && u.usuario.toLowerCase() === input) ||
          u.id.toLowerCase() === input
      );

      if (!user || user.status === 'inativo') {
        setError('Login ou senha incorreto.');
      } else {
        setCurrentUser(user);
        addNotification({
          title: 'Bem-vindo de volta',
          message: `Sessão iniciada como ${user.nome} (${user.perfil}).`,
          type: 'success',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 font-sans py-12">
      <div className="w-full max-w-md">
        {/* Brand Logo and Title */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0B4EA2] text-white font-extrabold text-2xl shadow-lg border border-blue-400/20 mb-3">
            R3
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Receita 360 web
          </h1>
          <p className="text-xs text-[#0B4EA2] dark:text-blue-400 uppercase tracking-widest font-semibold mt-1">
            Gestão Municipal Integrada
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 transition-colors duration-150 animate-fade-in">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            Acesso ao Painel
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Insira suas credenciais corporativas homologadas
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Username Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Usuário ou E-mail
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@receita360.gw"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#0B4EA2] focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Senha de Acesso
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#0B4EA2] focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#0B4EA2] hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-6 uppercase tracking-wider cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={14} />
                  <span>Entrar no Sistema</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
