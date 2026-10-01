import React, { useState } from 'react';
import { 
  History, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Users, 
  FileText, 
  Trash2, 
  ChevronRight, 
  ArrowLeft,
  ShieldCheck,
  Send,
  MessageSquare
} from 'lucide-react';
import { Campaign, ContactProfile } from '../types';

interface HistoryViewProps {
  campaigns: Campaign[];
  profiles: ContactProfile[];
  onDeleteCampaign: (id: string) => void;
  onNewCampaign: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  campaigns,
  profiles,
  onDeleteCampaign,
  onNewCampaign,
}) => {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const getProfileName = (profileId: string) => {
    return profiles.find((p) => p.id === profileId)?.name || 'Perfil não encontrado';
  };

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Calendar className="w-3.5 h-3.5" /> Agendado
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 animate-spin" /> Em Execução
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  if (selectedCampaign) {
    return (
      <div className="space-y-6">
        {/* Back Button & Details Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCampaign(null)}
              className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">
                  {selectedCampaign.name}
                </h2>
                {getStatusBadge(selectedCampaign.status)}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Destinatários: Perfil{' '}
                <strong>{getProfileName(selectedCampaign.targetProfileId)}</strong> • Criado em{' '}
                {new Date(selectedCampaign.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (confirm('Deseja excluir o registro desta campanha?')) {
                onDeleteCampaign(selectedCampaign.id);
                setSelectedCampaign(null);
              }
            }}
            className="text-gray-400 hover:text-red-600 p-2 rounded-lg cursor-pointer"
            title="Excluir campanha"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Campaign Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <span className="text-xs text-gray-500 font-semibold uppercase">Total de Contatos</span>
            <div className="text-xl font-bold text-gray-900 mt-1">
              {selectedCampaign.totalContacts}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <span className="text-xs text-gray-500 font-semibold uppercase">Entregas com Sucesso</span>
            <div className="text-xl font-bold text-emerald-600 mt-1">
              {selectedCampaign.sentCount}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <span className="text-xs text-gray-500 font-semibold uppercase">Proteção Anti-Bloqueio</span>
            <div className="text-xs font-bold text-gray-900 mt-1 flex items-center gap-1.5 text-purple-700">
              <ShieldCheck className="w-4 h-4" />
              {selectedCampaign.antiBanSettings.enableMessageSpinning
                ? 'Mesclagem & Rotação Ativa'
                : 'Padrão'}
            </div>
          </div>
        </div>

        {/* Log table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              Mensagens Enviadas por Destinatário ({selectedCampaign.logs.length})
            </h3>
            <span className="text-xs text-gray-500">
              Visualização de cada variação gerada pela mesclagem
            </span>
          </div>

          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {selectedCampaign.logs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                Nenhum log registrado para este disparo ainda.
              </div>
            ) : (
              selectedCampaign.logs.map((log) => (
                <div key={log.id} className="p-4 space-y-1.5 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{log.contactName}</span>
                      <span className="text-gray-400 font-mono text-[11px]">
                        {log.contactPhone}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px]">
                        {log.templateUsedTitle}
                      </span>
                      <span>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                      <span className="text-emerald-600 font-bold">✓ Entregue</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 font-mono bg-gray-50 p-2.5 rounded border border-gray-100 leading-relaxed whitespace-pre-wrap">
                    {log.messageSent}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            Histórico de Disparos &amp; Agendamentos
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Visualize campanhas enviadas, mensagens mescladas geradas e agendamentos futuros.
          </p>
        </div>

        <button
          onClick={onNewCampaign}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          Novo Disparo em Massa
        </button>
      </div>

      {/* Campaigns List */}
      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 space-y-3">
            <History className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Nenhum disparo realizado ainda</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Seus disparos em massa e agendamentos aparecerão aqui com relatórios detalhados de entrega.
            </p>
          </div>
        ) : (
          campaigns.map((camp) => (
            <div
              key={camp.id}
              onClick={() => setSelectedCampaign(camp)}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs hover:border-gray-300 hover:shadow-sm transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{camp.name}</h3>
                  {getStatusBadge(camp.status)}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    Perfil: <strong>{getProfileName(camp.targetProfileId)}</strong>
                  </span>
                  <span>•</span>
                  <span>{camp.totalContacts} destinatários</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-semibold">
                    {camp.sentCount} entregues
                  </span>
                  <span>•</span>
                  <span>{new Date(camp.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Deseja excluir esta campanha?')) {
                      onDeleteCampaign(camp.id);
                    }
                  }}
                  className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg cursor-pointer"
                  title="Excluir campanha"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs flex items-center gap-1">
                  Ver Detalhes <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
