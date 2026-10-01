/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  WhatsAppSession, 
  ContactProfile, 
  Contact, 
  MessageTemplate, 
  Campaign, 
  AntiBanSettings, 
  GatewayConfig,
  WhatsAppChat,
  ChatMessage
} from './types';
import { storage } from './lib/storage';
import { apiClient } from './lib/apiClient';
import { whatsappGatewayService } from './lib/whatsappGateway';
import { Header, ActiveTab } from './components/Header';
import { ConversationsView } from './components/ConversationsView';
import { ConnectionView } from './components/ConnectionView';
import { ProfilesAndLinkView } from './components/ProfilesAndLinkView';
import { TemplatesView } from './components/TemplatesView';
import { MassSenderView } from './components/MassSenderView';
import { HistoryView } from './components/HistoryView';
import { AuthView } from './components/AuthView';
import { AdminView } from './components/AdminView';
import { authApi, installAuthInterceptor, AUTH_EXPIRED_EVENT, AuthUser } from './lib/auth';
import { Loader2 } from 'lucide-react';

installAuthInterceptor();

/**
 * Compares the previous and next version of a collection and returns only what
 * must be sent to the database: items that are new/changed, and ids that were removed.
 */
function diffById<T extends { id: string }>(prev: T[], next: T[]) {
  const prevById = new Map(prev.map((p) => [p.id, JSON.stringify(p)]));
  const nextIds = new Set(next.map((n) => n.id));
  const changed = next.filter((n) => prevById.get(n.id) !== JSON.stringify(n));
  const removedIds = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
  return { changed, removedIds };
}

const flattenMessages = (map: Record<string, ChatMessage[]>) =>
  Object.entries(map).flatMap(([chatId, list]) => list.map((m) => ({ ...m, chatId: m.chatId || chatId })));

const MANAGED_GATEWAY: GatewayConfig = {
  provider: 'evolution',
  baseUrl: 'https://evolution.managed.invalid',
  apiKey: 'managed-by-server',
  instanceName: '',
  autoSyncStatus: true,
};

function MainApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  // Persistent states with initial fallback from storage while fetching PostgreSQL
  const [session, setSession] = useState<WhatsAppSession>(() => storage.getSession());
  // The Evolution server, its keys and this user's instance are managed by the backend.
  // The browser only holds placeholders: the proxy replaces host and credentials server-side.
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>(MANAGED_GATEWAY);
  const [serverConfigured, setServerConfigured] = useState<boolean>(true);
  const [chats, setChats] = useState<WhatsAppChat[]>(() => storage.getChats());
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => storage.getMessages());
  const [profiles, setProfiles] = useState<ContactProfile[]>(() => storage.getProfiles());
  const [contacts, setContacts] = useState<Contact[]>(() => storage.getContacts());
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => storage.getTemplates());
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => storage.getCampaigns());
  const [antiBanSettings, setAntiBanSettings] = useState<AntiBanSettings>(() =>
    storage.getAntiBanSettings()
  );
  const [isSyncingContacts, setIsSyncingContacts] = useState<boolean>(false);
  const [isSyncingChats, setIsSyncingChats] = useState<boolean>(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);

  // Active view tab - default to 'conversas' as requested by the user
  const [activeTab, setActiveTab] = useState<ActiveTab>('conversas');

  // Pre-selected parameters for fast navigation
  const [preselectedProfileId, setPreselectedProfileId] = useState<string | undefined>(undefined);
  const [preselectedTemplateId, setPreselectedTemplateId] = useState<string | undefined>(undefined);

  // Refs hold the last known version of each collection so saves can send only the diff
  const profilesRef = useRef(profiles);
  const contactsRef = useRef(contacts);
  const templatesRef = useRef(templates);
  const chatsRef = useRef(chats);
  const messagesRef = useRef(messages);

  // Per-user WhatsApp info (instance name / whether the admin configured the server)
  useEffect(() => {
    fetch('/api/whatsapp/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (!info) return;
        setGatewayConfig((g) => ({ ...g, instanceName: info.instanceName || g.instanceName }));
        setServerConfigured(Boolean(info.serverConfigured));
      })
      .catch(() => {});
  }, []);

  // Load state from PostgreSQL on mount. The database is the source of truth:
  // if it answers, its content replaces the local cache (even when it is empty).
  useEffect(() => {
    async function loadDataFromDb() {
      try {
        const [
          dbProfiles,
          dbContacts,
          dbTemplates,
          dbChats,
          dbMessages,
          dbCampaigns,
          dbAntiBan,
        ] = await Promise.all([
          apiClient.getProfiles(),
          apiClient.getContacts(),
          apiClient.getTemplates(),
          apiClient.getChats(),
          apiClient.getAllMessages(),
          apiClient.getCampaigns(),
          apiClient.getSetting<AntiBanSettings | null>('anti_ban_settings', null),
        ]);

        profilesRef.current = dbProfiles;
        contactsRef.current = dbContacts;
        templatesRef.current = dbTemplates;
        chatsRef.current = dbChats;
        messagesRef.current = dbMessages;

        setProfiles(dbProfiles);
        storage.saveProfiles(dbProfiles);
        setContacts(dbContacts);
        storage.saveContacts(dbContacts);
        setTemplates(dbTemplates);
        storage.saveTemplates(dbTemplates);
        setChats(dbChats);
        storage.saveChats(dbChats);
        setMessages(dbMessages);
        storage.saveMessages(dbMessages);
        setCampaigns(dbCampaigns);
        storage.saveCampaigns(dbCampaigns);
        if (dbAntiBan) {
          setAntiBanSettings(dbAntiBan);
          storage.saveAntiBanSettings(dbAntiBan);
        }

        setIsDbConnected(true);
      } catch (err) {
        // Banco indisponível: mantém o cache local e deixa o indicador desligado
        console.warn('Could not load data from database:', err);
        setIsDbConnected(false);
      }
    }

    loadDataFromDb();
  }, []);

  // Handlers with Cloud SQL backend persistence (and local fallback)
  const handleUpdateSession = (updatedSession: WhatsAppSession) => {
    setSession(updatedSession);
    storage.saveSession(updatedSession);
    apiClient.saveSetting('session', updatedSession);
  };

  const handleSaveChats = (updatedChats: WhatsAppChat[]) => {
    const { changed, removedIds } = diffById(chatsRef.current, updatedChats);
    chatsRef.current = updatedChats;
    setChats(updatedChats);
    storage.saveChats(updatedChats);
    if (changed.length > 0) apiClient.saveChats(changed);
    apiClient.deleteMany('chats', removedIds);
  };

  const handleSaveMessages = (updatedMessages: Record<string, ChatMessage[]>) => {
    const { changed, removedIds } = diffById(
      flattenMessages(messagesRef.current),
      flattenMessages(updatedMessages)
    );
    messagesRef.current = updatedMessages;
    setMessages(updatedMessages);
    storage.saveMessages(updatedMessages);
    if (changed.length > 0) {
      const grouped: Record<string, ChatMessage[]> = {};
      for (const m of changed) (grouped[m.chatId] ||= []).push(m);
      apiClient.saveMessagesBatch(grouped);
    }
    apiClient.deleteMany('messages', removedIds);
  };

  const handleSaveProfiles = (updatedProfiles: ContactProfile[]) => {
    const { changed, removedIds } = diffById(profilesRef.current, updatedProfiles);
    profilesRef.current = updatedProfiles;
    setProfiles(updatedProfiles);
    storage.saveProfiles(updatedProfiles);
    if (changed.length > 0) apiClient.saveProfilesBatch(changed);
    apiClient.deleteMany('profiles', removedIds);
  };

  const handleSaveContacts = (updatedContacts: Contact[]) => {
    const { changed, removedIds } = diffById(contactsRef.current, updatedContacts);
    contactsRef.current = updatedContacts;
    setContacts(updatedContacts);
    storage.saveContacts(updatedContacts);
    if (changed.length > 0) apiClient.saveContactsBatch(changed);
    apiClient.deleteMany('contacts', removedIds);
  };

  const handleSaveTemplates = (updatedTemplates: MessageTemplate[]) => {
    const { changed, removedIds } = diffById(templatesRef.current, updatedTemplates);
    templatesRef.current = updatedTemplates;
    setTemplates(updatedTemplates);
    storage.saveTemplates(updatedTemplates);
    if (changed.length > 0) apiClient.saveTemplatesBatch(changed);
    apiClient.deleteMany('templates', removedIds);
  };

  const handleSaveCampaign = (newCampaign: Campaign) => {
    const updated = [newCampaign, ...campaigns.filter((c) => c.id !== newCampaign.id)];
    setCampaigns(updated);
    storage.saveCampaigns(updated);
    apiClient.saveCampaign(newCampaign);
  };

  const handleDeleteCampaign = (campaignId: string) => {
    const updated = campaigns.filter((c) => c.id !== campaignId);
    setCampaigns(updated);
    storage.saveCampaigns(updated);
    apiClient.deleteCampaign(campaignId);
  };

  const handleSaveAntiBanSettings = (updated: AntiBanSettings) => {
    setAntiBanSettings(updated);
    storage.saveAntiBanSettings(updated);
    apiClient.saveSetting('anti_ban_settings', updated);
  };

  // Cross-navigation shortcuts
  const handleNavigateToCampaignFromProfile = (profileId: string) => {
    setPreselectedProfileId(profileId);
    setActiveTab('disparos');
  };

  const handleNavigateToCampaignFromTemplate = (templateId: string) => {
    setPreselectedTemplateId(templateId);
    setActiveTab('disparos');
  };

  // Contact sync with connected WhatsApp instance
  const handleSyncWhatsAppContacts = async (): Promise<{ count: number; message: string }> => {
    setIsSyncingContacts(true);
    try {
      const res = await whatsappGatewayService.fetchContacts(gatewayConfig);

      if (!res.success || !res.contacts || res.contacts.length === 0) {
        const errorMsg = res.error || 'Nenhum contato retornado pela API do WhatsApp.';
        return { count: 0, message: errorMsg };
      }

      // Merge contacts preserving profile tags and existing notes
      const existingByPhone = new Map<string, Contact>();
      contacts.forEach((c) => {
        const digits = c.phone.replace(/\D/g, '');
        if (digits) existingByPhone.set(digits, c);
      });

      let addedCount = 0;
      let updatedCount = 0;
      const mergedContacts: Contact[] = [];

      res.contacts.forEach((incoming) => {
        const digits = incoming.phone.replace(/\D/g, '');
        const existing = existingByPhone.get(digits);

        if (existing) {
          // Keep assigned profiles and customized names
          mergedContacts.push({
            ...existing,
            name: (existing.name && !existing.name.startsWith('+')) ? existing.name : incoming.name,
            phone: incoming.phone,
            customData: {
              ...incoming.customData,
              ...existing.customData,
            },
          });
          existingByPhone.delete(digits);
          updatedCount++;
        } else {
          mergedContacts.push(incoming);
          addedCount++;
        }
      });

      // Keep contacts that were added manually
      existingByPhone.forEach((remaining) => {
        mergedContacts.push(remaining);
      });

      handleSaveContacts(mergedContacts);

      // Update session timestamp
      handleUpdateSession({
        ...session,
        status: 'connected',
        lastSyncAt: new Date().toISOString(),
      });

      return {
        count: res.contacts.length,
        message: `${res.contacts.length} contatos encontrados (${addedCount} novos importados, ${updatedCount} atualizados)!`,
      };
    } catch (err: any) {
      return {
        count: 0,
        message: err?.message || 'Falha ao sincronizar contatos do WhatsApp.',
      };
    } finally {
      setIsSyncingContacts(false);
    }
  };

  // Sync real WhatsApp active conversations from Gateway API
  const handleSyncWhatsAppChats = async (): Promise<{ count: number; message: string }> => {
    setIsSyncingChats(true);
    try {
      const res = await whatsappGatewayService.fetchChats(gatewayConfig);
      if (res.success && res.chats.length > 0) {
        handleSaveChats(res.chats);
        handleUpdateSession({
          ...session,
          status: 'connected',
          lastSyncAt: new Date().toISOString(),
        });
        return {
          count: res.chats.length,
          message: `${res.chats.length} conversas reais sincronizadas diretamente do seu WhatsApp!`,
        };
      } else {
        return {
          count: 0,
          message: res.error || 'Nenhuma conversa ativa encontrada na API do WhatsApp.',
        };
      }
    } catch (err: any) {
      return {
        count: 0,
        message: err?.message || 'Erro ao sincronizar conversas reais do WhatsApp.',
      };
    } finally {
      setIsSyncingChats(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900">
      {/* Header with connection badge, PostgreSQL Cloud status badge & tabs */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        session={session}
        totalConversations={chats.length}
        totalContacts={contacts.length}
        totalProfiles={profiles.length}
        totalTemplates={templates.length}
        isDbConnected={isDbConnected}
        userEmail={user.email}
        isAdmin={user.isAdmin}
        onLogout={onLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'conversas' && (
          <ConversationsView
            session={session}
            gatewayConfig={gatewayConfig}
            chats={chats}
            messages={messages}
            contacts={contacts}
            profiles={profiles}
            templates={templates}
            onSaveChats={handleSaveChats}
            onSaveMessages={handleSaveMessages}
            onSaveContacts={handleSaveContacts}
            onNavigateToConnection={() => setActiveTab('conexao')}
            onSyncContactsAndChats={handleSyncWhatsAppContacts}
            onSyncChats={handleSyncWhatsAppChats}
          />
        )}

        {activeTab === 'perfis' && (
          <ProfilesAndLinkView
            profiles={profiles}
            contacts={contacts}
            session={session}
            gatewayConfig={gatewayConfig}
            isSyncingContacts={isSyncingContacts}
            onSyncWhatsAppContacts={handleSyncWhatsAppContacts}
            onSaveProfiles={handleSaveProfiles}
            onSaveContacts={handleSaveContacts}
            onNavigateToCampaign={handleNavigateToCampaignFromProfile}
            onNavigateToConnection={() => setActiveTab('conexao')}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesView
            templates={templates}
            onSaveTemplates={handleSaveTemplates}
            onSelectForCampaign={handleNavigateToCampaignFromTemplate}
          />
        )}

        {activeTab === 'disparos' && (
          <MassSenderView
            session={session}
            gatewayConfig={gatewayConfig}
            profiles={profiles}
            contacts={contacts}
            templates={templates}
            antiBanSettings={antiBanSettings}
            onSaveAntiBanSettings={handleSaveAntiBanSettings}
            onSaveCampaign={handleSaveCampaign}
            onNavigateToConnection={() => setActiveTab('conexao')}
            initialProfileId={preselectedProfileId}
            initialTemplateId={preselectedTemplateId}
          />
        )}

        {activeTab === 'conexao' && (
          <ConnectionView
            session={session}
            gatewayConfig={gatewayConfig}
            contactsCount={contacts.length}
            isSyncingContacts={isSyncingContacts}
            onSyncWhatsAppContacts={handleSyncWhatsAppContacts}
            onNavigateToProfiles={() => setActiveTab('perfis')}
            onUpdateSession={handleUpdateSession}
            serverConfigured={serverConfigured}
          />
        )}

        {activeTab === 'admin' && user.isAdmin && <AdminView />}

        {activeTab === 'historico' && (
          <HistoryView
            campaigns={campaigns}
            profiles={profiles}
            onDeleteCampaign={handleDeleteCampaign}
            onNewCampaign={() => setActiveTab('disparos')}
          />
        )}
      </main>
    </div>
  );
}

const CACHE_OWNER_KEY = 'wpp_cache_owner';

/** The local cache belongs to one user: wipe it whenever the account changes or the user leaves. */
function prepareCacheFor(user: AuthUser | null) {
  try {
    if (!user) {
      storage.resetToInitial();
      return;
    }
    if (localStorage.getItem(CACHE_OWNER_KEY) !== user.id) storage.resetToInitial();
    localStorage.setItem(CACHE_OWNER_KEY, user.id);
  } catch {
    // storage unavailable: nothing to protect
  }
}

/**
 * Gate: nothing from MainApp (data loading, WhatsApp, etc.) runs until the user
 * has a valid session for a verified e-mail.
 */
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [verifiedStatus, setVerifiedStatus] = useState<'ok' | 'invalid' | null>(null);

  useEffect(() => {
    // Result of the confirmation link (?verified=1|0): show it once and clean the URL
    const params = new URLSearchParams(window.location.search);
    const v = params.get('verified');
    if (v === '1' || v === '0') {
      setVerifiedStatus(v === '1' ? 'ok' : 'invalid');
      window.history.replaceState({}, '', window.location.pathname);
    }

    authApi
      .me()
      .then((u) => {
        prepareCacheFor(u);
        setUser(u);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));

    const onExpired = () => {
      prepareCacheFor(null);
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const handleLogout = async () => {
    await authApi.logout();
    prepareCacheFor(null);
    setUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onAuthenticated={(u) => {
          prepareCacheFor(u);
          setUser(u);
        }}
        verifiedStatus={verifiedStatus}
      />
    );
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}
