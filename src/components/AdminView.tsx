import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users, Loader2 } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  emailVerified: boolean;
  instanceName: string;
  serverHost: string;
  createdAt: string;
}

export const AdminView: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(async (res) => {
        if (!res.ok) throw new Error('Acesso negado ou erro ao carregar.');
        setUsers(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          Administração
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Área restrita ao administrador. Cada usuário configura a própria conexão com a Evolution API (URL, instância e
          chave) na tela de Conexão e conecta o seu WhatsApp. As chaves ficam criptografadas e nem o administrador as
          visualiza.
        </p>
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
                <th className="py-2 pr-4">Servidor Evolution</th>
                <th className="py-2 pr-4">Instância</th>
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
                  <td className="py-2 pr-4 font-mono text-xs text-gray-600">{u.serverHost || 'não configurado'}</td>
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
