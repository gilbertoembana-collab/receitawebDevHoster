import React, { useState } from 'react';
import { useAppStore } from '../../store';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Landmark,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { dbService } from '../../services/db';
import { API_BASE_PATH, setAccessToken } from '../../services/api';
import './login.css';

export default function Login() {
  const { setCurrentUser, addNotification } = useAppStore();
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
      const res = await fetch(`${API_BASE_PATH}/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'web' },
        body: JSON.stringify({ login: email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.accessToken !== 'string') {
          setError('Não foi possível iniciar a sessão.');
          return;
        }
        setAccessToken(data.accessToken);
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
    } catch {
      setError('Não foi possível contactar o servidor. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-showcase" aria-label="Receita 360">
          <div className="showcase-glow showcase-glow-top" />
          <div className="showcase-glow showcase-glow-bottom" />
          <div className="showcase-content">
            <div className="showcase-brand">
              <div className="brand-mark">
                <img src="/logo-receita360.png" alt="Logótipo Receita 360" />
              </div>
              <div>
                <span className="brand-name">Receita 360</span>
                <span className="brand-caption">GESTÃO MUNICIPAL INTEGRADA</span>
              </div>
            </div>

            <div className="showcase-message">
              <span className="showcase-eyebrow">
                <span className="eyebrow-dot" />
                TECNOLOGIA AO SERVIÇO DO MUNICÍPIO
              </span>
              <h1>
                Uma gestão mais simples.
                <br />
                <span> Resultados melhores.</span>
              </h1>
              <p>
                Acompanhe receitas, contribuintes e operações municipais num só lugar.
                Mais clareza para decidir e mais eficiência para servir.
              </p>
            </div>

            <div className="showcase-art" aria-hidden="true">
              <div className="art-orbit art-orbit-outer" />
              <div className="art-orbit art-orbit-inner" />
              <div className="art-sun" />
              <svg className="city-illustration" viewBox="0 0 540 250" fill="none">
                <path d="M0 218H540" stroke="rgba(255,255,255,.28)" />
                <g stroke="rgba(216,234,255,.66)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M53 218C59 184 62 153 66 124" />
                  <path d="M66 125C48 112 35 108 24 109C38 119 48 126 63 129M67 124C57 104 48 94 38 89C44 103 51 115 65 128M68 123C68 101 72 88 79 78C79 96 77 111 70 128M69 124C82 106 94 98 106 95C96 108 85 118 72 130M68 127C88 120 102 121 114 126C97 131 83 132 68 132" />
                  <path d="M36 218V171L81 154L121 171V218M41 173L81 158L116 173M48 181V218M81 179V218M108 181V218" />
                  <path d="M132 218V169H177V218M128 169L154 153L181 169M140 179V193M164 179V193M140 202V218M164 202V218" />
                  <path d="M189 218V181H251V218M184 181H256M193 181L204 168H236L247 181M204 169V181M215 169V181M226 169V181M237 169V181M197 194H243M197 204H243" />
                  <path d="M266 218V126H405V218M258 127H413M268 126L278 116H393L403 126M281 116V107H390V116" />
                  <path d="M280 142H391M291 145V218M317 145V218M343 145V218M369 145V218M391 142V218" />
                  <path d="M296 218V186C296 174 304 166 314 166C324 166 332 174 332 186V218M337 218V186C337 174 345 166 355 166C365 166 373 174 373 186V218" />
                  <path d="M322 107V88H348V107M330 87V77H340V87" />
                  <path d="M347 78V61M347 62L364 68L347 73" stroke="rgba(245,205,131,.92)" />
                  <path d="M416 218V168H465V218M412 168H469M418 168L440 154L463 168M426 180V194M450 180V194M426 202V218M450 202V218" />
                  <path d="M486 218C490 190 493 166 496 142" />
                  <path d="M496 143C481 132 470 128 460 129C471 138 480 144 494 147M497 142C490 126 483 117 474 112C478 124 485 135 495 146M498 141C499 125 503 114 509 106C509 120 507 133 500 146M499 143C512 130 523 125 535 125C526 135 515 142 502 148" />
                  <path d="M18 219H522" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
                </g>
                <g stroke="rgba(245,205,131,.62)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M36 171H121M128 169H181M184 181H256M258 127H413M412 168H469" />
                  <path d="M56 187H72M87 187H103M140 189H164M211 195H234" />
                </g>
                <path d="M183 218H257V198H183Z" fill="rgba(245,205,131,.08)" />
                <path d="M264 218H407V214H264Z" fill="rgba(255,255,255,.08)" />
              </svg>
            </div>

            <div className="showcase-footer">
              <div className="flag-accent" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span>REPÚBLICA DA GUINÉ-BISSAU</span>
              <span className="footer-separator">•</span>
              <span>PLATAFORMA MUNICIPAL</span>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel-inner">
            <div className="mobile-brand">
              <img
                className="mobile-brand-mark"
                src="/logo-receita360.png"
                alt="Logótipo Receita 360"
              />
              <span>Receita 360</span>
            </div>

            <div className="form-heading">
              <span className="form-kicker">ÁREA DE ACESSO</span>
              <h2 id="login-title">Bem-vindo de volta</h2>
              <p>Introduza as suas credenciais para continuar.</p>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="login-username">Utilizador ou e-mail</label>
                <div className="input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="login-username"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="O seu utilizador ou e-mail"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Palavra-passe</label>
                <div className="input-wrap">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Introduza a sua palavra-passe"
                    autoComplete="current-password"
                    disabled={isLoading}
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button className="login-submit" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="login-spinner" aria-hidden="true" />
                    A autenticar...
                  </>
                ) : (
                  <>
                    Entrar no sistema
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <div className="secure-note">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>A sua sessão é protegida e encriptada.</span>
            </div>

            <div className="login-panel-footer">
              <span><Landmark size={15} aria-hidden="true" /> Receita 360</span>
              <span>GS-TIC SARL © {new Date().getFullYear()} · Todos os direitos reservados</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
