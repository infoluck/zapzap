import React from 'react';
import { 
  Smartphone, 
  Users, 
  FileText, 
  Send, 
  History, 
  QrCode, 
  CheckCircle2, 
  AlertCircle,
  Wifi,
  MessageSquare,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { WhatsAppSession } from '../types';

export type ActiveTab = 'conversas' | 'perfis' | 'templates' | 'disparos' | 'conexao' | 'historico' | 'admin';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  session: WhatsAppSession;
  totalConversations?: number;
  totalContacts: number;
  totalProfiles: number;
  totalTemplates: number;
  isDbConnected?: boolean;
  userEmail?: string;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  session,
  totalConversations = 0,
  totalContacts,
  totalProfiles,
  totalTemplates,
  isDbConnected = false,
  userEmail,
  isAdmin = false,
  onLogout,
}) => {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar with Branding & Connection status */}
        <div className="flex items-center justify-between h-16 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs shrink-0">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900 tracking-tight">
                  WhatsApp Connect &amp; Disparos
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Anti-Ban Engine
                </span>
                <span className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                  isDbConnected ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isDbConnected ? 'bg-blue-600' : 'bg-gray-400'}`} />
                  PostgreSQL
                </span>
              </div>
              <p className="text-xs text-gray-500 hidden sm:block">
                Gestão de Perfis, Vínculo de Contatos e Disparos em Massa com Mesclagem
              </p>
            </div>
          </div>

          {/* WhatsApp Connection status badge */}
          <div className="flex items-center gap-3">
            <button
              id="header-session-status-btn"
              onClick={() => setActiveTab('conexao')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                session.status === 'connected'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  session.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="hidden md:inline">
                {session.status === 'connected'
                  ? `WhatsApp: ${session.phoneNumber || 'Conectado'}`
                  : 'WhatsApp Desconectado'}
              </span>
              <span className="md:hidden">
                {session.status === 'connected' ? 'Online' : 'Conectar'}
              </span>
            </button>

            {onLogout && (
              <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                {userEmail && (
                  <span className="hidden lg:inline text-xs text-gray-500 max-w-[180px] truncate" title={userEmail}>
                    {userEmail}
                  </span>
                )}
                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  title="Sair"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 no-scrollbar border-t border-gray-100">
          {/* TAB 1: Minhas Conversas (Aba Principal) */}
          <button
            id="nav-tab-conversas"
            onClick={() => setActiveTab('conversas')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'conversas'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Minhas Conversas</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'conversas' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {totalConversations}
            </span>
          </button>

          {/* TAB 2: Perfis & Vínculo de Contatos */}
          <button
            id="nav-tab-perfis"
            onClick={() => setActiveTab('perfis')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'perfis'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Perfis &amp; Vínculo de Contatos</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'perfis' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {totalContacts}
            </span>
          </button>

          <button
            id="nav-tab-templates"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Mensagens Pré-definidas</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'templates' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {totalTemplates}
            </span>
          </button>

          <button
            id="nav-tab-disparos"
            onClick={() => setActiveTab('disparos')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'disparos'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Disparo em Massa &amp; Agendamento</span>
          </button>

          <button
            id="nav-tab-conexao"
            onClick={() => setActiveTab('conexao')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'conexao'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Conexão WhatsApp Web</span>
          </button>

          <button
            id="nav-tab-historico"
            onClick={() => setActiveTab('historico')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeTab === 'historico'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Histórico &amp; Relatórios</span>
          </button>

          {/* Admin-only: shared Evolution server settings */}
          {isAdmin && (
            <button
              id="nav-tab-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ml-auto ${
                activeTab === 'admin'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Administração</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
