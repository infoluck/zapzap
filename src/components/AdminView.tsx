import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Server,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Users,
  Loader2,
  Eye,
  EyeOff,
  Save,
  Undo2,
} from 'lucide-react';

interface EvolutionStatus {
  baseUrl: string;
  hasGlobalKey: boolean;
  globalKeyHint: string;
  /** where the active config comes from: saved here (database), the server .env, or nothing yet */
  source: 'database' | 'env' | 'none';
  myInstanceName: string;
}

interface TestResult {
  reachable: boolean;
  keyValid: boolean;
  message: string;
}

interface AdminUser {
  id: string;
  email: string;
  emailVerified: boolean;
  instanceName: string;
  createdAt: string;
}

export const AdminView: React.FC = () => {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable form
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStatus = async () => {
    const res = await fetch('/api/admin/evolution');
    if (!res.ok) throw new Error('Acesso negado ou erro ao carregar.');
    const data: EvolutionStatus = await res.json();
    setStatus(data);
    setBaseUrl(data.baseUrl);
    setApiKey('');
  };

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Acesso negado ou erro ao carregar.');
    setUsers(await res.json());
  };

  useEffect(() => {
    Promise.all([loadStatus(), loadUsers()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/evolution', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, globalApiKey: apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadStatus();
      setTest(null);
      setFeedback({ ok: true, text: 'Configuração salva. Ela já vale para todos os usuários.' });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToEnv = async () => {
    if (!window.confirm('Remover a configuração salva aqui e voltar a usar as variáveis do servidor (.env)?')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/evolution', { method: 'DELETE' });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      await loadStatus();
      setTest(null);
      setFeedback({ ok: true, text: 'Configuração removida. Voltou a valer o que está no .env do servidor.' });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Falha ao remover.' });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/admin/evolution/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, globalApiKey: apiKey }),
      });
      setTest(await res.json());
    } catch {
      setTest({ reachable: false, keyValid: false, message: 'Falha ao executar o teste.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !status) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>;
  }

  const testOk = test?.reachable && test?.keyValid;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          Administração
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Área restrita. O servidor Evolution é compartilhado: cada usuário recebe uma instância própria e conecta o
          seu WhatsApp pelo QR Code. A chave global fica somente no servidor e nunca chega ao navegador dos usuários.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-5">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Server className="w-5 h-5 text-emerald-600" />
          Servidor Evolution
        </h3>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`px-2 py-0.5 rounded-full font-semibold ${
              status.source === 'database'
                ? 'bg-emerald-100 text-emerald-800'
                : status.source === 'env'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {status.source === 'database'
              ? 'Configuração salva aqui'
              : status.source === 'env'
              ? 'Usando variáveis do servidor (.env)'
              : 'Ainda não configurado'}
          </span>
          {status.myInstanceName && (
            <span className="text-gray-500">
              Sua instância: <span className="font-mono text-gray-700">{status.myInstanceName}</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4 bg-gray-50 p-5 rounded-xl border border-gray-200">
          <div>
            <label htmlFor="evo-url" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
              URL base do servidor Evolution
            </label>
            <input
              id="evo-url"
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://evolution.seudominio.com"
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="evo-key"
              className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1"
            >
              <KeyRound className="w-3.5 h-3.5" /> Chave global (API Key do administrador)
            </label>
            <div className="relative flex items-center">
              <input
                id="evo-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={
                  status.hasGlobalKey
                    ? `Salva (${status.globalKeyHint}). Deixe em branco para manter.`
                    : 'Cole a chave global do servidor'
                }
                className="w-full pl-3.5 pr-11 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                className="absolute right-2.5 p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition cursor-pointer"
              >
                {showKey ? <EyeOff className="w-4 h-4 text-emerald-700" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[11px] text-gray-500 mt-1 block">
              No Easypanel, é a variável <code>AUTHENTICATION_API_KEY</code> (ou <code>GLOBAL_API_KEY</code>) do
              container da Evolution. Fica guardada criptografada e nunca é enviada ao navegador dos usuários.
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                feedback.ok
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {feedback.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {feedback.text}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Salvar configuração
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing || saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              Testar servidor e chave
            </button>
            {status.source === 'database' && (
              <button
                type="button"
                onClick={handleResetToEnv}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-60 cursor-pointer"
              >
                <Undo2 className="w-4 h-4" />
                Voltar a usar o .env
              </button>
            )}
          </div>

          {test && (
            <div
              className={`flex items-center gap-1.5 text-sm font-medium ${
                testOk ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {testOk ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {test.message}
            </div>
          )}
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-emerald-600" />
          Usuários ({users.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4">E-mail</th>
                <th className="py-2 pr-4">Confirmado</th>
                <th className="py-2 pr-4">Instância WhatsApp</th>
                <th className="py-2">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-4 text-gray-900">{u.email}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {u.emailVerified ? 'Sim' : 'Pendente'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-600">{u.instanceName || '—'}</td>
                  <td className="py-2 text-gray-600">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
