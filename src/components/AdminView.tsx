import React, { useEffect, useState } from 'react';
import { ShieldCheck, Server, KeyRound, RefreshCw, CheckCircle2, XCircle, Users, Loader2 } from 'lucide-react';

interface EvolutionStatus {
  baseUrl: string;
  hasGlobalKey: boolean;
  globalKeyHint: string;
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

const ENV_VARS = [
  { name: 'EVOLUTION_BASE_URL', desc: 'Endereço do servidor Evolution (ex.: https://evolution.seudominio.com)' },
  { name: 'EVOLUTION_GLOBAL_API_KEY', desc: 'Chave global (admin) do servidor. Cria uma instância para cada usuário.' },
  { name: 'ADMIN_EMAILS', desc: 'E-mails que acessam esta área (separados por vírgula)' },
];

export const AdminView: React.FC = () => {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/admin/evolution'), fetch('/api/admin/users')])
      .then(async ([s, u]) => {
        if (!s.ok || !u.ok) throw new Error('Acesso negado ou erro ao carregar.');
        setStatus(await s.json());
        setUsers(await u.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/admin/evolution/test', { method: 'POST' });
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
          seu WhatsApp pelo QR Code. As chaves ficam somente no servidor e nunca chegam ao navegador dos usuários.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-5">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Server className="w-5 h-5 text-emerald-600" />
          Servidor Evolution
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Endereço</span>
            <span className="font-mono text-gray-900 break-all">{status.baseUrl || 'não definido'}</span>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              <KeyRound className="w-3.5 h-3.5" /> Chave global
            </span>
            <span className="font-mono text-gray-900">
              {status.hasGlobalKey ? status.globalKeyHint : 'não definida'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runTest}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
            Testar servidor e chave
          </button>
          {test && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                testOk ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {testOk ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {test.message}
            </span>
          )}
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
            Como configurar (arquivo .env do servidor)
          </h4>
          <ul className="space-y-1.5 text-xs text-gray-600">
            {ENV_VARS.map((v) => (
              <li key={v.name}>
                <code className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-bold">{v.name}</code>{' '}
                — {v.desc}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">Após alterar o .env, reinicie o servidor.</p>
        </div>
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
