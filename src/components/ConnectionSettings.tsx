import React, { useEffect, useState } from 'react';
import { Server, Eye, EyeOff, Save, RefreshCw, CheckCircle2, XCircle, Trash2, Info } from 'lucide-react';

export interface ConnectionInfo {
  configured: boolean;
  baseUrl: string;
  instanceName: string;
  hasApiKey: boolean;
  apiKeyHint: string;
}

interface TestResult {
  reachable: boolean;
  keyValid: boolean;
  connected: boolean;
  message: string;
}

interface ConnectionSettingsProps {
  connection: ConnectionInfo;
  /** called after a successful save/clear so the parent reloads the connection */
  onChanged: (kind: 'saved' | 'cleared') => void | Promise<void>;
  onCancel?: () => void;
}

/** The user's own Evolution API connection: server URL, instance name and API key (token). */
export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({ connection, onChanged, onCancel }) => {
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [instanceName, setInstanceName] = useState(connection.instanceName);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

  // Keep the form in sync when the saved connection changes (e.g. after saving)
  useEffect(() => {
    setBaseUrl(connection.baseUrl);
    setInstanceName(connection.instanceName);
    setApiKey('');
  }, [connection.baseUrl, connection.instanceName, connection.configured]);

  const body = () => JSON.stringify({ baseUrl, instanceName, apiKey });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setTest(null);
    try {
      const res = await fetch('/api/whatsapp/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setFeedback({ ok: true, text: 'Conexão salva. Agora gere o QR Code para conectar o seu WhatsApp.' });
      await onChanged('saved');
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/whatsapp/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(),
      });
      setTest(await res.json());
    } catch {
      setTest({ reachable: false, keyValid: false, connected: false, message: 'Falha ao executar o teste.' });
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Remover a sua conexão com a Evolution API? Você precisará informar os dados de novo.')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/whatsapp/settings', { method: 'DELETE' });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setTest(null);
      await onChanged('cleared');
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'Falha ao remover.' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1';
  const testOk = test?.reachable && test?.keyValid;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-5">
      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Server className="w-5 h-5 text-emerald-600" />
          Configurações da Conexão (Evolution API)
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Estes dados são só da sua conta: cada usuário configura a própria conexão e conecta o seu WhatsApp.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-5 rounded-xl border border-gray-200">
          <div>
            <label htmlFor="conn-url" className={labelClass}>
              URL base da API (endpoint)
            </label>
            <input
              id="conn-url"
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://evolution.seudominio.com"
              className={inputClass}
            />
            <span className="text-[11px] text-gray-500 mt-1 block">Endereço público do seu servidor Evolution.</span>
          </div>

          <div>
            <label htmlFor="conn-instance" className={labelClass}>
              Nome da instância
            </label>
            <input
              id="conn-instance"
              type="text"
              required
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="Ex: atendimento-01"
              className={inputClass}
            />
            <span className="text-[11px] text-gray-500 mt-1 block">Nome cadastrado no painel da Evolution.</span>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="conn-key" className={labelClass}>
              Chave de API / token de acesso (API Key)
            </label>
            <div className="relative flex items-center">
              <input
                id="conn-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                required={!connection.hasApiKey}
                placeholder={
                  connection.hasApiKey
                    ? `Salva (${connection.apiKeyHint}). Deixe em branco para manter.`
                    : 'Cole o token da sua instância'
                }
                className={`${inputClass} pr-11 font-mono`}
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
            <span className="text-[11px] text-gray-500 mt-1 flex items-start gap-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              Fica guardada criptografada no servidor e nunca é exibida de novo por inteiro.
            </span>
          </div>
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

        {test && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${testOk ? 'text-emerald-700' : 'text-red-700'}`}>
            {testOk ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {test.message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Salvar conexão
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
            Testar conexão
          </button>
          {onCancel && connection.configured && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
            >
              Cancelar
            </button>
          )}
          {connection.configured && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-60 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Remover conexão
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
