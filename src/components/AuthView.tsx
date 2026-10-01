import React, { useState } from 'react';
import { Send, Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, MailCheck } from 'lucide-react';
import { authApi, AuthError, AuthUser } from '../lib/auth';

type Mode = 'login' | 'register' | 'check-email';

interface AuthViewProps {
  onAuthenticated: (user: AuthUser) => void;
  /** Result of the e-mail link, read from ?verified=1|0 */
  verifiedStatus?: 'ok' | 'invalid' | null;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  inputClass: string;
}

/** Password input with a button to reveal / hide what was typed. */
const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  inputClass,
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">
        {label}
      </label>
      <div className="relative">
        <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition cursor-pointer"
        >
          {visible ? <EyeOff className="w-4 h-4 text-emerald-700" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export const AuthView: React.FC<AuthViewProps> = ({ onAuthenticated, verifiedStatus = null }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setNeedsVerification(false);
    setPassword('');
    setConfirm('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setNeedsVerification(false);
    try {
      onAuthenticated(await authApi.login(email.trim(), password));
    } catch (err) {
      if (err instanceof AuthError && err.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setLoading(true);
    try {
      await authApi.register(email.trim(), password);
      setMode('check-email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await authApi.resend(email.trim());
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao reenviar.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs">
            <Send className="w-7 h-7 -rotate-12 translate-x-0.5" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900 tracking-tight">WhatsApp Connect &amp; Disparos</h1>
          <p className="text-sm text-gray-500">Acesse sua conta para continuar</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs p-6 sm:p-8">
          {verifiedStatus === 'ok' && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>E-mail confirmado com sucesso! Agora é só entrar.</span>
            </div>
          )}
          {verifiedStatus === 'invalid' && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Link inválido ou expirado. Se você já confirmou, faça login. Caso contrário, entre com seus dados para
                receber um novo link.
              </span>
            </div>
          )}

          {mode === 'check-email' ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Confirme seu e-mail</h2>
              <p className="text-sm text-gray-600">
                Se o endereço <b>{email}</b> puder ser cadastrado, enviamos um link de ativação. Abra o e-mail (veja
                também o spam) e clique no link para liberar o acesso. O link vale por 24 horas.
              </p>
              {info && <p className="text-sm text-emerald-700">{info}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                Não recebeu? Reenviar link
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="block w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition cursor-pointer"
              >
                Ir para o login
              </button>
            </div>
          ) : (
            <>
              <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
                {(['login', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition cursor-pointer ${
                      mode === m ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {m === 'login' ? 'Entrar' : 'Criar conta'}
                  </button>
                ))}
              </div>

              <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-semibold text-gray-600 mb-1">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@empresa.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <PasswordField
                  id="auth-password"
                  label="Senha"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'register' ? 'Mínimo de 8 caracteres' : '••••••••'}
                  inputClass={inputClass}
                />

                {mode === 'register' && (
                  <PasswordField
                    id="auth-confirm"
                    label="Confirmar senha"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    inputClass={inputClass}
                  />
                )}

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {info && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{info}</span>
                  </div>
                )}

                {needsVerification && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading}
                    className="w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 text-sm font-semibold transition disabled:opacity-60 cursor-pointer"
                  >
                    Reenviar link de confirmação
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
