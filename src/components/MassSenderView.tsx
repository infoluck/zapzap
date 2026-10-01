import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Send, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  Shuffle, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  Pause, 
  XSquare, 
  RefreshCw, 
  Sparkles, 
  Layers, 
  Smartphone, 
  FileText, 
  Sliders, 
  Users, 
  Zap,
  Info,
  Check
} from 'lucide-react';
import { 
  Contact, 
  ContactProfile, 
  MessageTemplate, 
  AntiBanSettings, 
  Campaign, 
  CampaignLogItem, 
  WhatsAppSession,
  GatewayConfig
} from '../types';
import { generateMergedMessage, getRandomDelay } from '../lib/antiBanEngine';
import { whatsappGatewayService } from '../lib/whatsappGateway';

interface MassSenderViewProps {
  session: WhatsAppSession;
  gatewayConfig: GatewayConfig;
  profiles: ContactProfile[];
  contacts: Contact[];
  templates: MessageTemplate[];
  antiBanSettings: AntiBanSettings;
  onSaveAntiBanSettings: (settings: AntiBanSettings) => void;
  onSaveCampaign: (campaign: Campaign) => void;
  onNavigateToConnection: () => void;
  initialProfileId?: string;
  initialTemplateId?: string;
}

export const MassSenderView: React.FC<MassSenderViewProps> = ({
  session,
  gatewayConfig,
  profiles,
  contacts,
  templates,
  antiBanSettings,
  onSaveAntiBanSettings,
  onSaveCampaign,
  onNavigateToConnection,
  initialProfileId,
  initialTemplateId,
}) => {
  // Campaign setup state
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialProfileId || profiles[0]?.id || ''
  );
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    initialTemplateId ? [initialTemplateId] : templates.slice(0, 2).map((t) => t.id)
  );

  const [campaignName, setCampaignName] = useState<string>(
    `Disparo em Massa - ${new Date().toLocaleDateString('pt-BR')}`
  );

  const [dispatchMode, setDispatchMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');

  // Anti-ban settings local state
  const [enableSpinning, setEnableSpinning] = useState<boolean>(
    antiBanSettings.enableMessageSpinning
  );
  const [enableSpintax, setEnableSpintax] = useState<boolean>(antiBanSettings.enableSpintax);
  const [enableZeroWidth, setEnableZeroWidth] = useState<boolean>(
    antiBanSettings.enableZeroWidthNoise
  );
  const [minDelay, setMinDelay] = useState<number>(antiBanSettings.minDelaySeconds);
  const [maxDelay, setMaxDelay] = useState<number>(antiBanSettings.maxDelaySeconds);
  const [batchSize, setBatchSize] = useState<number>(antiBanSettings.batchSize);

  // Active execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentContactIndex, setCurrentContactIndex] = useState<number>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [activeLogs, setActiveLogs] = useState<CampaignLogItem[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  const executionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const currentLogsRef = useRef<CampaignLogItem[]>([]);

  // Update refs
  useEffect(() => {
    isExecutingRef.current = isExecuting;
    isPausedRef.current = isPaused;
    currentLogsRef.current = activeLogs;
  }, [isExecuting, isPaused, activeLogs]);

  // Target contacts from profile
  const targetProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || profiles[0],
    [profiles, selectedProfileId]
  );

  const targetContacts = useMemo(() => {
    if (!targetProfile) return [];
    return contacts.filter((c) => c.profileIds.includes(targetProfile.id));
  }, [contacts, targetProfile]);

  const selectedTemplates = useMemo(() => {
    return templates.filter((t) => selectedTemplateIds.includes(t.id));
  }, [templates, selectedTemplateIds]);

  // Toggle template selection
  const handleToggleTemplate = (templateId: string) => {
    setSelectedTemplateIds((prev) => {
      if (prev.includes(templateId)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((id) => id !== templateId);
      } else {
        return [...prev, templateId];
      }
    });
  };

  // Preview simulations for anti-ban verification
  const previewSimulations = useMemo(() => {
    if (targetContacts.length === 0 || selectedTemplates.length === 0) return [];

    const sampleSlice = targetContacts.slice(0, 3);
    return sampleSlice.map((contact, idx) => {
      return {
        contact,
        ...generateMergedMessage(
          selectedTemplates,
          contact,
          targetProfile?.name,
          {
            enableMessageSpinning: enableSpinning,
            enableSpintax,
            enableZeroWidthNoise: enableZeroWidth,
          },
          idx
        ),
      };
    });
  }, [targetContacts, selectedTemplates, targetProfile, enableSpinning, enableSpintax, enableZeroWidth]);

  // Save anti-ban settings when changed
  const handleSaveSettings = () => {
    const updated: AntiBanSettings = {
      ...antiBanSettings,
      enableMessageSpinning: enableSpinning,
      enableSpintax,
      enableZeroWidthNoise: enableZeroWidth,
      minDelaySeconds: minDelay,
      maxDelaySeconds: maxDelay,
      batchSize,
    };
    onSaveAntiBanSettings(updated);
  };

  // Start Mass Sending Execution
  const handleStartDispatch = () => {
    if (session.status !== 'connected') {
      alert('É necessário conectar o WhatsApp antes de iniciar os disparos.');
      onNavigateToConnection();
      return;
    }

    if (targetContacts.length === 0) {
      alert('O perfil selecionado não possui contatos vinculados.');
      return;
    }

    if (selectedTemplates.length === 0) {
      alert('Selecione ao menos um modelo de mensagem.');
      return;
    }

    if (dispatchMode === 'scheduled') {
      if (!scheduledDateTime) {
        alert('Por favor, informe a data e horário para agendamento.');
        return;
      }

      const scheduledCampaign: Campaign = {
        id: `camp_${Date.now()}`,
        name: campaignName.trim(),
        targetProfileId: targetProfile.id,
        selectedTemplateIds,
        scheduledFor: new Date(scheduledDateTime).toISOString(),
        status: 'scheduled',
        totalContacts: targetContacts.length,
        sentCount: 0,
        failedCount: 0,
        antiBanSettings: {
          enableMessageSpinning: enableSpinning,
          enableSpintax,
          enableZeroWidthNoise: enableZeroWidth,
          minDelaySeconds: minDelay,
          maxDelaySeconds: maxDelay,
          batchSize,
          batchPauseMinutes: 2,
          simulateTyping: true,
        },
        logs: [],
        createdAt: new Date().toISOString(),
      };

      onSaveCampaign(scheduledCampaign);
      alert(`Campanha "${campaignName}" agendada com sucesso para ${new Date(scheduledDateTime).toLocaleString('pt-BR')}!`);
      return;
    }

    // Immediate Execution
    handleSaveSettings();
    setIsExecuting(true);
    setIsPaused(false);
    setCurrentContactIndex(0);
    setActiveLogs([]);
    const campaignId = `camp_${Date.now()}`;
    setActiveCampaignId(campaignId);

    // Trigger sequential sender engine
    processNextContact(0, campaignId, []);
  };

  const processNextContact = (
    index: number,
    campaignId: string,
    currentLogs: CampaignLogItem[]
  ) => {
    if (index >= targetContacts.length) {
      // Completed!
      finishCampaign(campaignId, currentLogs, 'completed');
      return;
    }

    setCurrentContactIndex(index);
    const contact = targetContacts[index];

    // Generate merged obfuscated message
    const { message, templateTitle } = generateMergedMessage(
      selectedTemplates,
      contact,
      targetProfile.name,
      {
        enableMessageSpinning: enableSpinning,
        enableSpintax,
        enableZeroWidthNoise: enableZeroWidth,
      },
      index
    );

    // Calculate dynamic safe delay
    const delay = getRandomDelay(minDelay, maxDelay);
    setCountdownSeconds(delay);

    // Deliver message after countdown
    let remaining = delay;
    const interval = setInterval(async () => {
      if (isPausedRef.current) return;

      remaining -= 1;
      setCountdownSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);

        // Perform real or simulated dispatch via Gateway API
        let sendResult = { success: true, messageId: undefined as string | undefined, error: undefined as string | undefined };
        try {
          const apiRes = await whatsappGatewayService.sendMessage(gatewayConfig, contact.phone, message);
          sendResult = {
            success: apiRes.success,
            messageId: apiRes.messageId,
            error: apiRes.error,
          };
        } catch (err: any) {
          sendResult = {
            success: false,
            messageId: undefined,
            error: err?.message || 'Falha de comunicação no envio.',
          };
        }

        // Record dispatch log item
        const logItem: CampaignLogItem = {
          id: `log_${Date.now()}_${index}`,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
          messageSent: message,
          templateUsedTitle: templateTitle,
          status: sendResult.success ? 'success' : 'failed',
          error: sendResult.error,
          timestamp: new Date().toISOString(),
          delayUsedSeconds: delay,
        };

        const updatedLogs = [...currentLogs, logItem];
        setActiveLogs(updatedLogs);

        // Process next if not cancelled
        if (isExecutingRef.current) {
          processNextContact(index + 1, campaignId, updatedLogs);
        }
      }
    }, 1000);

    executionIntervalRef.current = interval;
  };

  const finishCampaign = (
    campaignId: string,
    logs: CampaignLogItem[],
    status: Campaign['status']
  ) => {
    setIsExecuting(false);
    setIsPaused(false);
    if (executionIntervalRef.current) {
      clearInterval(executionIntervalRef.current);
    }

    const campaign: Campaign = {
      id: campaignId,
      name: campaignName.trim(),
      targetProfileId: targetProfile.id,
      selectedTemplateIds,
      scheduledFor: null,
      status,
      totalContacts: targetContacts.length,
      sentCount: logs.filter((l) => l.status === 'success').length,
      failedCount: logs.filter((l) => l.status === 'failed').length,
      antiBanSettings: {
        enableMessageSpinning: enableSpinning,
        enableSpintax,
        enableZeroWidthNoise: enableZeroWidth,
        minDelaySeconds: minDelay,
        maxDelaySeconds: maxDelay,
        batchSize,
        batchPauseMinutes: 2,
        simulateTyping: true,
      },
      logs,
      createdAt: new Date().toISOString(),
    };

    onSaveCampaign(campaign);
  };

  const handlePauseResume = () => {
    setIsPaused((prev) => !prev);
  };

  const handleCancelExecution = () => {
    if (confirm('Deseja realmente cancelar o disparo em andamento?')) {
      if (executionIntervalRef.current) {
        clearInterval(executionIntervalRef.current);
      }
      setIsExecuting(false);
      if (activeCampaignId) {
        finishCampaign(activeCampaignId, activeLogs, 'cancelled');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Gateway Channel Info */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-500">Canal de Envio:</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold ${
              gatewayConfig.provider === 'evolution'
                ? 'bg-emerald-100 text-emerald-800'
                : gatewayConfig.provider === 'zapi'
                ? 'bg-blue-100 text-blue-800'
                : gatewayConfig.provider === 'custom_rest'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                gatewayConfig.provider !== 'simulator' && session.status === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-gray-400'
              }`}
            />
            {gatewayConfig.provider === 'evolution'
              ? 'Evolution API (Envios Reais)'
              : gatewayConfig.provider === 'zapi'
              ? 'Z-API (Envios Reais)'
              : gatewayConfig.provider === 'custom_rest'
              ? 'Custom REST Gateway'
              : 'Modo Simulado / Demonstração'}
          </span>
          {session.phoneNumber && (
            <span className="text-gray-500 hidden sm:inline">
              via <strong className="text-gray-700">{session.phoneNumber}</strong>
            </span>
          )}
        </div>

        <button
          onClick={onNavigateToConnection}
          className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer underline text-[11px]"
        >
          {gatewayConfig.provider === 'simulator'
            ? 'Ativar Envio Real (Evolution / Z-API)'
            : 'Gerenciar Configurações da API'}
        </button>
      </div>

      {/* Session Connection Warning if Disconnected */}
      {session.status !== 'connected' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                WhatsApp Não Conectado
              </h4>
              <p className="text-xs text-amber-800">
                Conecte sua sessão via QR Code para poder enviar as mensagens aos contatos.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToConnection}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer self-start sm:self-center shrink-0"
          >
            Conectar WhatsApp Agora
          </button>
        </div>
      )}

      {/* Main Campaign Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Target & Template Selection */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Target Profile */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                  1
                </span>
                Perfil de Destinatários
              </h3>

              <span className="text-xs text-gray-500 font-medium">
                Total:{' '}
                <strong className="text-emerald-700">{targetContacts.length} contatos</strong>
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                Selecione o Perfil para Envio:
              </label>
              <select
                id="select-campaign-profile"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {profiles.map((p) => {
                  const count = contacts.filter((c) => c.profileIds.includes(p.id)).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({count} contatos vinculados)
                    </option>
                  );
                })}
              </select>
            </div>

            {targetContacts.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg">
                ⚠️ Este perfil ainda não possui contatos. Vá para a aba &ldquo;Perfis &amp; Vínculo&rdquo; para vincular contatos a este perfil.
              </p>
            ) : (
              <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg flex items-center justify-between">
                <span>
                  Disparo direcionado para:{' '}
                  <strong className="text-gray-900">{targetProfile?.name}</strong>
                </span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Lista pronta ({targetContacts.length})
                </span>
              </div>
            )}
          </div>

          {/* Step 2: Templates & Message Merging Options */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                  2
                </span>
                Mensagens Pré-definidas &amp; Mesclagem
              </h3>

              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                {selectedTemplateIds.length} selecionado(s)
              </span>
            </div>

            {/* Anti-Ban Message Spinning Toggle Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Shuffle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Mesclagem Anti-Bloqueio do WhatsApp
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Mescla e alterna os modelos selecionados para que cada contato receba uma versão diferente, evitando detecção de spam.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={enableSpinning}
                    onChange={(e) => setEnableSpinning(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {enableSpinning && (
                <div className="pt-2 border-t border-emerald-200/60 flex flex-wrap gap-4 text-[11px] text-emerald-900 font-medium">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSpintax}
                      onChange={(e) => setEnableSpintax(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Resolver Spintax dinâmico
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableZeroWidth}
                      onChange={(e) => setEnableZeroWidth(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Ofuscação de hash invisível
                  </label>
                </div>
              )}
            </div>

            {/* Template selector list */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                Selecione os Modelos para Rotação / Disparo:
              </label>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                {templates.map((tpl) => {
                  const isChecked = selectedTemplateIds.includes(tpl.id);
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleToggleTemplate(tpl.id)}
                      className={`p-3 flex items-start gap-3 hover:bg-gray-50 transition cursor-pointer ${
                        isChecked ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-1 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {tpl.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 shrink-0">
                            {tpl.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {tpl.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step 3: Anti-Ban Delay & Protection Parameters */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                3
              </span>
              Configurações do Algoritmo Anti-Bloqueio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Intervalo Mínimo (segundos)
                </label>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Intervalo Máximo (segundos)
                </label>
                <input
                  type="number"
                  min={3}
                  max={120}
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">
                  🛡️ <strong>Variação Humana:</strong> Entre cada envio, o sistema aguarda um tempo randômico entre {minDelay}s e {maxDelay}s para reproduzir o comportamento de digitação natural de um usuário.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Scheduling, Simulator & Dispatch Trigger */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 4: Campaign Name & Scheduling */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                4
              </span>
              Agendamento &amp; Identificação
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Nome da Campanha
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Immediate vs Scheduled Radio */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Tipo de Execução:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDispatchMode('immediate')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      dispatchMode === 'immediate'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    🚀 Envio Imediato
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchMode('scheduled')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      dispatchMode === 'scheduled'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    📅 Agendar Disparo
                  </button>
                </div>
              </div>

              {/* Date time picker if scheduled */}
              {dispatchMode === 'scheduled' && (
                <div className="space-y-1 pt-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Data e Horário do Disparo:
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    required
                  />
                </div>
              )}
            </div>
          </div>

          {/* Anti-Ban Live Preview Simulator */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Simulador de Mesclagem Prévia (Amostra)
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Anti-Bloqueio Ativo
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              Veja como cada destinatário do perfil receberá uma variação personalizada e exclusiva:
            </p>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {previewSimulations.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Selecione um perfil com contatos para ver a prévia das mensagens.
                </p>
              ) : (
                previewSimulations.map((sim, i) => (
                  <div
                    key={sim.contact.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-gray-900">
                        Destinatário {i + 1}: {sim.contact.name}
                      </span>
                      <span className="text-gray-400 font-mono">{sim.contact.phone}</span>
                    </div>

                    <p className="text-gray-700 font-mono text-[11px] bg-white p-2 rounded border border-gray-100 whitespace-pre-wrap leading-relaxed">
                      {sim.message}
                    </p>

                    <div className="flex flex-wrap gap-1 text-[10px] text-emerald-700">
                      {sim.appliedTechniques.map((t, idx) => (
                        <span key={idx} className="bg-emerald-50 px-1.5 py-0.2 rounded">
                          ✓ {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Destinatários:</span>
              <strong className="text-gray-900">{targetContacts.length} contatos</strong>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Modo Anti-Bloqueio:</span>
              <strong className="text-emerald-700">
                {enableSpinning ? 'Ativo (Rotação & Spintax)' : 'Padrão'}
              </strong>
            </div>

            <button
              id="btn-trigger-mass-sender"
              onClick={handleStartDispatch}
              disabled={isExecuting || targetContacts.length === 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {dispatchMode === 'immediate' ? (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Iniciar Disparo em Massa Agora
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Confirmar Agendamento da Campanha
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Live Execution Modal / Progress Monitor */}
      {isExecuting && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            {/* Header of Modal */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Disparo em Execução
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-1">
                  {campaignName}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePauseResume}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" /> Retomar
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Pausar
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancelExecution}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <XSquare className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                <span>
                  Progresso: {activeLogs.length} de {targetContacts.length} contatos enviados
                </span>
                <span>
                  {Math.round((activeLogs.length / (targetContacts.length || 1)) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
                  style={{
                    width: `${(activeLogs.length / (targetContacts.length || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Current contact & Anti-ban delay countdown */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-emerald-800 font-semibold block uppercase">
                    Destinatário Atual ({currentContactIndex + 1}/{targetContacts.length}):
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {targetContacts[currentContactIndex]?.name} (
                    {targetContacts[currentContactIndex]?.phone})
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-gray-500 block uppercase font-semibold">
                  Delay Seguro:
                </span>
                <span className="text-sm font-bold text-emerald-800 font-mono flex items-center gap-1 justify-end">
                  <Clock className="w-3.5 h-3.5 animate-spin" /> {countdownSeconds}s
                </span>
              </div>
            </div>

            {/* Live Feed Logs */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                Log de Envios em Tempo Real:
              </span>
              <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                {activeLogs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Iniciando conexão e preparando primeiro disparo seguro...
                  </p>
                ) : (
                  activeLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs flex items-start justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{log.contactName}</span>
                          <span className="text-gray-400 font-mono text-[10px]">
                            {log.contactPhone}
                          </span>
                        </div>
                        <p className="text-gray-600 truncate text-[11px]">{log.messageSent}</p>
                      </div>

                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">
                        <Check className="w-3 h-3" /> Entregue ({log.delayUsedSeconds}s)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
