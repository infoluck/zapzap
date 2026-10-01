import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Smartphone, 
  ShieldCheck, 
  CheckCircle2, 
  RefreshCw, 
  Power, 
  Wifi, 
  BatteryCharging, 
  Laptop, 
  Clock, 
  AlertCircle,
  KeyRound,
  Server,
  Settings,
  HelpCircle,
  ExternalLink,
  Check,
  Radio,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import { WhatsAppSession, GatewayConfig, GatewayProvider } from '../types';
import { whatsappGatewayService } from '../lib/whatsappGateway';
import { ConnectionSettings, ConnectionInfo } from './ConnectionSettings';

export type { ConnectionInfo };

interface ConnectionViewProps {
  session: WhatsAppSession;
  gatewayConfig: GatewayConfig;
  contactsCount?: number;
  isSyncingContacts?: boolean;
  onSyncWhatsAppContacts?: () => Promise<{ count: number; message: string }>;
  onNavigateToProfiles?: () => void;
  onUpdateSession: (session: WhatsAppSession) => void;
  /** this user's own Evolution connection (null while loading) */
  connection: ConnectionInfo | null;
  /** reloads the connection after the user saved or removed it */
  onConnectionChanged: () => void | Promise<void>;
}

export const ConnectionView: React.FC<ConnectionViewProps> = ({
  session,
  gatewayConfig,
  contactsCount = 0,
  isSyncingContacts = false,
  onSyncWhatsAppContacts,
  onNavigateToProfiles,
  onUpdateSession,
  connection,
  onConnectionChanged,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const configured = Boolean(connection?.configured);
  const [connectMethod, setConnectMethod] = useState<'qr' | 'pairing_code'>('qr');
  
  // Gateway config is managed by the server (derived per user); keep a synced copy
  const [localConfig, setLocalConfig] = useState<GatewayConfig>(gatewayConfig);
  useEffect(() => setLocalConfig(gatewayConfig), [gatewayConfig]);

  // Connection flow states
  const [qrCodeDataUri, setQrCodeDataUri] = useState<string>('');
  const [qrCountdown, setQrCountdown] = useState<number>(35);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [receivedPairingCode, setReceivedPairingCode] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState<boolean>(true);

  // Sync state from real gateway (read-only query, does not spam /connect)
  const checkRealConnection = async (isManualCheck = false) => {
    if ((isLoading || isGeneratingQr) && !isManualCheck) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (localConfig.provider === 'simulator') {
        // Generate simulated QR
        const randomHash = Math.random().toString(36).substring(2, 15);
        const mockData = `2@${randomHash},${Date.now()}`;
        const dataUrl = await QRCode.toDataURL(mockData, {
          width: 256,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setQrCodeDataUri(dataUrl);
        setQrCountdown(35);
        setIsLoading(false);
        return;
      }

      // Query real Gateway (Evolution API, Z-API, etc.)
      const res = await whatsappGatewayService.checkConnectionState(localConfig);

      if (res.status === 'connected') {
        const updated: WhatsAppSession = {
          status: 'connected',
          qrCodeData: null,
          pairingCode: null,
          phoneNumber: res.phoneNumber || session.phoneNumber || 'Conectado',
          pushName: res.pushName || 'WhatsApp Real',
          platform: res.platform || 'WhatsApp Web Gateway',
          batteryLevel: res.battery || 95,
          connectedAt: session.connectedAt || new Date().toISOString(),
          instanceId: localConfig.instanceName,
          gatewayProvider: localConfig.provider,
          lastSyncAt: new Date().toISOString(),
          error: undefined,
        };
        onUpdateSession(updated);
        setErrorMessage(null);
      } else if (res.status === 'qr_ready' && res.qrCodeBase64) {
        let uri = res.qrCodeBase64.trim();
        if (!uri.startsWith('data:image')) {
          if (uri.startsWith('2@') || uri.startsWith('https://wa.me') || (!uri.startsWith('http') && uri.length < 500)) {
            try {
              uri = await QRCode.toDataURL(uri, { width: 256, margin: 1 });
            } catch {
              // fallback
            }
          } else if (!uri.startsWith('http')) {
            uri = `data:image/png;base64,${uri}`;
          }
        }
        setQrCodeDataUri(uri);
        setQrCountdown(35);
        if (res.pairingCode) {
          setReceivedPairingCode(res.pairingCode);
        }
        onUpdateSession({
          ...session,
          status: 'disconnected',
          qrCodeData: uri,
          pairingCode: res.pairingCode || null,
        });
      } else {
        if (res.message) {
          setErrorMessage(res.message);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao consultar status da conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  // Explicitly generate fresh QR Code by triggering connect + polling qr
  const handleGenerateFreshQr = async () => {
    setIsGeneratingQr(true);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (localConfig.provider === 'simulator') {
        const randomHash = Math.random().toString(36).substring(2, 15);
        const mockData = `2@${randomHash},${Date.now()}`;
        const dataUrl = await QRCode.toDataURL(mockData, {
          width: 256,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setQrCodeDataUri(dataUrl);
        setQrCountdown(35);
        return;
      }

      const res = await whatsappGatewayService.requestQrCode(localConfig);

      if (res.status === 'connected') {
        const updated: WhatsAppSession = {
          status: 'connected',
          qrCodeData: null,
          pairingCode: null,
          phoneNumber: res.phoneNumber || 'Conectado',
          pushName: res.pushName || 'WhatsApp Real',
          platform: res.platform || 'WhatsApp Web Gateway',
          batteryLevel: 100,
          connectedAt: new Date().toISOString(),
          instanceId: localConfig.instanceName,
          gatewayProvider: localConfig.provider,
          lastSyncAt: new Date().toISOString(),
        };
        onUpdateSession(updated);
        setErrorMessage(null);
      } else if (res.status === 'qr_ready' && res.qrCodeBase64) {
        let uri = res.qrCodeBase64.trim();
        if (!uri.startsWith('data:image')) {
          if (uri.startsWith('2@') || uri.startsWith('https://wa.me') || (!uri.startsWith('http') && uri.length < 500)) {
            try {
              uri = await QRCode.toDataURL(uri, { width: 256, margin: 1 });
            } catch {
              // ignore
            }
          } else if (!uri.startsWith('http')) {
            uri = `data:image/png;base64,${uri}`;
          }
        }
        setQrCodeDataUri(uri);
        setQrCountdown(35);
        if (res.pairingCode) {
          setReceivedPairingCode(res.pairingCode);
        }
        onUpdateSession({
          ...session,
          status: 'disconnected',
          qrCodeData: uri,
          pairingCode: res.pairingCode || null,
        });
      } else {
        if (res.message) {
          setErrorMessage(res.message);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar QR Code.');
    } finally {
      setIsGeneratingQr(false);
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (session.status !== 'connected') {
      checkRealConnection();
    }
  }, [localConfig.provider, localConfig.baseUrl, localConfig.instanceName]);

  // Polling loop when disconnected to detect QR scan automatically on real gateway (read-only query)
  useEffect(() => {
    if (session.status === 'connected' || !autoSync || localConfig.provider === 'simulator') return;

    const interval = setInterval(() => {
      checkRealConnection();
    }, 12000); // Check status every 12 seconds

    return () => clearInterval(interval);
  }, [session.status, autoSync, localConfig]);

  // QR countdown ticker
  useEffect(() => {
    if (session.status === 'connected' || !qrCodeDataUri) return;

    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          return 35;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session.status, qrCodeDataUri]);

  // Disconnect handler
  const handleDisconnect = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setQrCodeDataUri('');
    setReceivedPairingCode(null);

    const disconnectedSession: WhatsAppSession = {
      status: 'disconnected',
      qrCodeData: null,
      pairingCode: null,
      phoneNumber: null,
      pushName: null,
      platform: 'WhatsApp Web',
      batteryLevel: 0,
      connectedAt: null,
      instanceId: localConfig.instanceName,
      gatewayProvider: localConfig.provider,
    };
    onUpdateSession(disconnectedSession);

    try {
      await whatsappGatewayService.disconnectInstance(localConfig);
    } catch (err: any) {
      console.warn('Erro ao desconectar instância:', err);
    } finally {
      setIsLoading(false);
    }

    // Automatically trigger fresh QR code generation 1.5 seconds after disconnecting
    setTimeout(() => {
      handleGenerateFreshQr();
    }, 1500);
  };

  // Request phone pairing code
  const handleRequestPairingCode = async () => {
    if (!pairingCodeInput.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (localConfig.provider === 'simulator') {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
          if (i === 4) code += '-';
          code += chars[Math.floor(Math.random() * chars.length)];
        }
        setReceivedPairingCode(code);
        return;
      }

      const res = await whatsappGatewayService.requestPairingCode(localConfig, pairingCodeInput);
      if (res.success && res.pairingCode) {
        let code = res.pairingCode;
        if (code.length === 8 && !code.includes('-')) {
          code = `${code.slice(0, 4)}-${code.slice(4)}`;
        }
        setReceivedPairingCode(code);
      } else {
        setErrorMessage(res.error || 'Não foi possível gerar o código de pareamento. Verifique se o servidor está ativo.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar código de pareamento.');
    } finally {
      setIsLoading(false);
    }
  };

  // Simulated quick authorization for demonstration
  const handleSimulateQuickConnect = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      const newSession: WhatsAppSession = {
        status: 'connected',
        qrCodeData: null,
        pairingCode: null,
        phoneNumber: pairingCodeInput.startsWith('+') ? pairingCodeInput : `+${pairingCodeInput}`,
        pushName: 'Atendimento WhatsApp Conectado',
        platform: 'WhatsApp Web (Chrome / Linux)',
        batteryLevel: 94,
        connectedAt: new Date().toISOString(),
        instanceId: localConfig.instanceName,
        gatewayProvider: localConfig.provider,
        lastSyncAt: new Date().toISOString(),
      };
      onUpdateSession(newSession);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                session.status === 'connected'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-amber-50 text-amber-600 border border-amber-200'
              }`}
            >
              {session.status === 'connected' ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <Smartphone className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">
                  {session.status === 'connected'
                    ? 'WhatsApp Conectado e Ativo'
                    : 'Conexão e Emparelhamento do WhatsApp'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    session.status === 'connected'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      session.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {session.status === 'connected' ? 'Sessão Online' : 'Desconectado'}
                </span>

              </div>
              <p className="text-sm text-gray-600 mt-1">
                {session.status === 'connected'
                  ? 'Sua conta de WhatsApp está sincronizada para envio de mensagens, vinculação de perfis e disparos.'
                  : 'Escaneie o QR Code no seu celular oficial pelo menu WhatsApp > Aparelhos Conectados. A conexão é exclusiva da sua conta.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {session.status === 'connected' && (
              <button
                id="btn-disconnect-session"
                onClick={handleDisconnect}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium transition cursor-pointer"
              >
                <Power className="w-4 h-4" />
                Desconectar
              </button>
            )}

            {configured && (
              <button
                id="btn-toggle-settings-gateway"
                onClick={() => setShowSettings((v) => !v)}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition cursor-pointer ${
                  showSettings
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                {showSettings ? 'Voltar para Conexão' : 'Configurar conexão'}
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Main Connection Screen (QR Code / Pairing Code) */}
      {/* Settings form: shown automatically for accounts that have no connection yet */}
      {connection && (!configured || showSettings) && (
        <>
          {!configured && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Configure abaixo a sua conexão com a Evolution API (URL, nome da instância e chave). Depois você poderá
                gerar o QR Code e conectar o seu WhatsApp.
              </span>
            </div>
          )}
          <ConnectionSettings
            connection={connection}
            onCancel={() => setShowSettings(false)}
            onChanged={async (kind) => {
              await onConnectionChanged();
              setShowSettings(false);
              if (kind === 'cleared') {
                // No connection left: nothing can be "connected" anymore
                setQrCodeDataUri('');
                setReceivedPairingCode(null);
                onUpdateSession({
                  status: 'disconnected',
                  qrCodeData: null,
                  pairingCode: null,
                  phoneNumber: null,
                  pushName: null,
                  platform: 'WhatsApp Web',
                  batteryLevel: 0,
                  connectedAt: null,
                  instanceId: '',
                  gatewayProvider: 'evolution',
                });
              } else {
                // The saved connection may point to another server/instance: re-read the real status
                setTimeout(() => checkRealConnection(true), 0);
              }
            }}
          />
        </>
      )}

      {configured && !showSettings && (
        <>
          {session.status === 'connected' ? (
            /* Connected View Dashboard */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    <span>Número Conectado</span>
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.phoneNumber || 'Sessão Conectada'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Perfil / PushName: <span className="font-medium text-gray-700">{session.pushName}</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    <span>Instância & Gateway</span>
                    <Laptop className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-lg font-bold text-gray-900 truncate">
                    {session.instanceId || localConfig.instanceName}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Wifi className="w-3.5 h-3.5" /> Conexão Ativa
                    </span>
                    <span className="flex items-center gap-1 text-gray-600">
                      <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" /> {session.batteryLevel}%
                    </span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    <span>Segurança & Criptografia</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-lg font-bold text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5" /> Noise Protocol Ativo
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Sincronizado às:{' '}
                    {session.lastSyncAt ? new Date(session.lastSyncAt).toLocaleTimeString('pt-BR') : 'Hoje'}
                  </div>
                </div>
              </div>

              {/* Ready notice */}
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-950 text-sm">
                      Pronto para envio de mensagens com motor Anti-Bloqueio
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Sua instância está conectada. As mensagens disparadas serão enviadas pelo WhatsApp do seu aparelho.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onSyncWhatsAppContacts && (
                    <button
                      id="btn-sync-wpp-contacts-from-conn"
                      onClick={async () => {
                        const res = await onSyncWhatsAppContacts();
                        if (res.count > 0 && onNavigateToProfiles) {
                          onNavigateToProfiles();
                        }
                      }}
                      disabled={isSyncingContacts}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      title="Sincroniza todos os contatos salvos no WhatsApp conectado e vai para a tela de perfis"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`} />
                      {isSyncingContacts ? 'Sincronizando...' : 'Sincronizar Meus Contatos'}
                    </button>
                  )}
                  <button
                    id="btn-retest-session"
                    onClick={() => checkRealConnection(true)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? 'Verificando...' : 'Atualizar Status'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Disconnected - QR Scan Screen */
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              {errorMessage && (
                <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div>
                      <strong className="font-semibold">Status do Servidor:</strong> {errorMessage}
                    </div>
                    {errorMessage.includes('PostgreSQL') || errorMessage.includes('53300') || errorMessage.includes('liberou o QR Code') || errorMessage.includes('desconectad') ? (
                      <div className="text-[11px] text-amber-800 bg-amber-100/70 p-2 rounded border border-amber-200 mt-2 space-y-1">
                        <span className="font-bold block">💡 O QR Code não foi liberado:</span>
                        <p>1. Aguarde alguns instantes e clique novamente em <strong>Gerar QR Code</strong> (uma vez só).</p>
                        <p>2. Você também pode usar a aba <strong>Emparelhar por Código de Telefone</strong>, digitando o seu número.</p>
                        <p>3. Se continuar falhando, avise o administrador: o servidor de WhatsApp pode precisar ser reiniciado.</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Method switch tabs */}
              <div className="border-b border-gray-200 bg-gray-50/70 px-6 py-3 flex gap-4">
                <button
                  id="tab-method-qr"
                  onClick={() => setConnectMethod('qr')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                    connectMethod === 'qr'
                      ? 'bg-white text-emerald-700 shadow-2xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Escanear QR Code com o Celular
                </button>
                <button
                  id="tab-method-code"
                  onClick={() => setConnectMethod('pairing_code')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                    connectMethod === 'pairing_code'
                      ? 'bg-white text-emerald-700 shadow-2xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  Emparelhar por Código de Telefone
                </button>
              </div>

              <div className="p-6 md:p-8">
                {connectMethod === 'qr' ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                    {/* Instructions */}
                    <div className="md:col-span-7 space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Abra o WhatsApp oficial no seu celular:
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Conecte em menos de 10 segundos apontando a câmera do WhatsApp para o QR Code ao lado.
                        </p>
                      </div>

                      <ol className="space-y-4 text-sm text-gray-700">
                        <li className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <span>
                            Abra o <strong>WhatsApp</strong> no seu smartphone (Android ou iPhone).
                          </span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <span>
                            Toque no menu <strong>Mais opções</strong> (⋮) ou <strong>Configurações</strong>.
                          </span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <span>
                            Toque em <strong>Aparelhos Conectados</strong> e depois em{' '}
                            <strong>Conectar um aparelho</strong>.
                          </span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            4
                          </span>
                          <span>
                            Aponte a câmera para o QR Code ao lado. A tela atualizará instantaneamente ao autenticar.
                          </span>
                        </li>
                      </ol>

                      {localConfig.provider === 'simulator' && (
                        <div className="pt-2">
                          <button
                            id="btn-simulate-connect-fast"
                            onClick={handleSimulateQuickConnect}
                            disabled={isLoading}
                            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isLoading ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Validando Sessão...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Validar e Conectar Sessão Agora
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* QR Code Container */}
                    <div className="md:col-span-5 flex flex-col items-center justify-center">
                      <div className="relative p-4 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-sm flex flex-col items-center w-full max-w-[280px]">
                        {qrCodeDataUri ? (
                          <div className="relative group">
                            <img
                              id="whatsapp-qr-code-img"
                              src={qrCodeDataUri}
                              alt="WhatsApp Web QR Code"
                              referrerPolicy="no-referrer"
                              className="w-56 h-56 rounded-lg object-contain bg-white shadow-2xs"
                            />
                            {isGeneratingQr && (
                              <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center rounded-lg">
                                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                                <span className="text-xs font-semibold text-gray-700">Atualizando QR...</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-56 h-56 flex flex-col items-center justify-center bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                            {isGeneratingQr ? (
                              <>
                                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                                <span className="text-xs font-medium text-gray-700">
                                  Solicitando QR Code...
                                </span>
                                <span className="text-[11px] text-gray-500 mt-1">
                                  Aguardando handshake do WhatsApp
                                </span>
                              </>
                            ) : (
                              <>
                                <QrCode className="w-10 h-10 text-gray-400 mb-2" />
                                <span className="text-xs text-gray-600 mb-3 font-medium">
                                  QR Code pronto para emissão
                                </span>
                                <button
                                  id="btn-generate-fresh-qr"
                                  onClick={handleGenerateFreshQr}
                                  disabled={isLoading || isGeneratingQr}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  Gerar QR Code
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between w-full text-xs text-gray-500 px-1">
                          {qrCodeDataUri ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              Expira em: <strong className="text-gray-700">{qrCountdown}s</strong>
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-500">
                              Evolution API
                            </span>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              id="btn-refresh-qr-or-generate"
                              onClick={handleGenerateFreshQr}
                              disabled={isLoading || isGeneratingQr}
                              className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50 text-xs"
                              title="Solicitar novo QR Code"
                            >
                              <RefreshCw className={`w-3 h-3 ${isGeneratingQr ? 'animate-spin' : ''}`} />
                              {qrCodeDataUri ? 'Renovar QR' : 'Gerar QR'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Pairing Code Flow */
                  <div className="max-w-xl mx-auto py-4 space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Conectar com Número de Telefone
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Insira seu número com DDI e DDD (ex: 5511999999999) para vincular o WhatsApp sem precisar de câmera fotográfica.
                      </p>
                    </div>

                    {!receivedPairingCode ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                            Número de Telefone (Ex: 5511999999999)
                          </label>
                          <input
                            type="tel"
                            value={pairingCodeInput}
                            onChange={(e) => setPairingCodeInput(e.target.value)}
                            placeholder="5511999999999"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Formato: Código do País (55) + DDD (ex: 19) + 9 dígitos (apenas números).
                          </p>
                        </div>

                        <button
                          type="button"
                          id="btn-request-pairing-code"
                          onClick={handleRequestPairingCode}
                          disabled={isLoading}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                        >
                          <KeyRound className="w-4 h-4" />
                          {isLoading ? 'Solicitando Código...' : 'Gerar Código de Emparelhamento'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6 text-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <p className="text-sm text-gray-700">
                          Abra o WhatsApp no celular &gt; <strong>Aparelhos Conectados</strong> &gt;{' '}
                          <strong>Conectar com número de telefone</strong> e digite o código abaixo:
                        </p>

                        <div className="inline-block px-6 py-3 bg-white border-2 border-emerald-500 rounded-xl text-3xl font-mono font-bold tracking-widest text-emerald-800 shadow-xs">
                          {receivedPairingCode}
                        </div>

                        <div className="flex items-center justify-center gap-3 pt-2">
                          <button
                            onClick={() => checkRealConnection(true)}
                            disabled={isLoading}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition cursor-pointer flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {isLoading ? 'Verificando...' : 'Confirmar se Conectou'}
                          </button>
                          <button
                            onClick={() => setReceivedPairingCode(null)}
                            className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm cursor-pointer"
                          >
                            Digitar Outro Número
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
