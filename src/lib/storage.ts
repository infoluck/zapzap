import { ContactProfile, Contact, MessageTemplate, WhatsAppSession, Campaign, AntiBanSettings, GatewayConfig, WhatsAppChat, ChatMessage } from '../types';

const STORAGE_KEYS = {
  SESSION: 'wpp_session_v1',
  PROFILES: 'wpp_profiles_v1',
  CONTACTS: 'wpp_contacts_v1',
  TEMPLATES: 'wpp_templates_v1',
  CAMPAIGNS: 'wpp_campaigns_v1',
  ANTIBAN: 'wpp_antiban_settings_v1',
  GATEWAY: 'wpp_gateway_config_v1',
  CHATS: 'wpp_chats_v1',
  MESSAGES: 'wpp_messages_v1',
};

export const INITIAL_PROFILES: ContactProfile[] = [];

export const INITIAL_CONTACTS: Contact[] = [];

export const INITIAL_TEMPLATES: MessageTemplate[] = [];

export const DEFAULT_ANTIBAN: AntiBanSettings = {
  enableMessageSpinning: true,
  enableSpintax: true,
  enableZeroWidthNoise: true,
  minDelaySeconds: 4,
  maxDelaySeconds: 10,
  batchSize: 15,
  batchPauseMinutes: 2,
  simulateTyping: true,
};

export const INITIAL_SESSION: WhatsAppSession = {
  status: 'connected',
  qrCodeData: null,
  pairingCode: null,
  phoneNumber: '+55 (11) 97654-3210',
  pushName: 'Atendimento Comercial WhatsApp',
  platform: 'WhatsApp Web (Chrome / Linux)',
  batteryLevel: 92,
  connectedAt: '2026-09-15T05:30:00Z',
  instanceId: 'inst_prod_wpp_9942',
};

export const INITIAL_CAMPAIGNS: Campaign[] = [];

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  provider: 'simulator',
  baseUrl: 'https://api.evolution-api.com',
  instanceName: 'instancia_principal',
  apiKey: '',
  autoSyncStatus: true,
};

export const INITIAL_CHATS: WhatsAppChat[] = [];

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {};

function readList<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * LocalStorage atua apenas como cache para abrir a tela rápido.
 * A fonte da verdade é o PostgreSQL: nada aqui recria dados de exemplo ao ler,
 * senão itens excluídos "voltariam" a cada recarregamento.
 */
export const storage = {
  getChats(): WhatsAppChat[] {
    return readList<WhatsAppChat>(STORAGE_KEYS.CHATS);
  },
  saveChats(chats: WhatsAppChat[]): void {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
  },

  getMessages(): Record<string, ChatMessage[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      const parsed = data ? JSON.parse(data) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  },
  saveMessages(messages: Record<string, ChatMessage[]>): void {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  },

  getGatewayConfig(): GatewayConfig {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GATEWAY);
      return data ? { ...DEFAULT_GATEWAY_CONFIG, ...JSON.parse(data) } : DEFAULT_GATEWAY_CONFIG;
    } catch {
      return DEFAULT_GATEWAY_CONFIG;
    }
  },
  saveGatewayConfig(config: GatewayConfig): void {
    localStorage.setItem(STORAGE_KEYS.GATEWAY, JSON.stringify(config));
  },

  getSession(): WhatsAppSession {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SESSION);
      return data ? JSON.parse(data) : INITIAL_SESSION;
    } catch {
      return INITIAL_SESSION;
    }
  },
  saveSession(session: WhatsAppSession): void {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  },

  getProfiles(): ContactProfile[] {
    return readList<ContactProfile>(STORAGE_KEYS.PROFILES);
  },
  saveProfiles(profiles: ContactProfile[]): void {
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  },

  getContacts(): Contact[] {
    return readList<Contact>(STORAGE_KEYS.CONTACTS);
  },
  saveContacts(contacts: Contact[]): void {
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
  },

  getTemplates(): MessageTemplate[] {
    return readList<MessageTemplate>(STORAGE_KEYS.TEMPLATES);
  },
  saveTemplates(templates: MessageTemplate[]): void {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
  },

  getCampaigns(): Campaign[] {
    return readList<Campaign>(STORAGE_KEYS.CAMPAIGNS);
  },
  saveCampaigns(campaigns: Campaign[]): void {
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
  },

  getAntiBanSettings(): AntiBanSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ANTIBAN);
      return data ? JSON.parse(data) : DEFAULT_ANTIBAN;
    } catch {
      return DEFAULT_ANTIBAN;
    }
  },
  saveAntiBanSettings(settings: AntiBanSettings): void {
    localStorage.setItem(STORAGE_KEYS.ANTIBAN, JSON.stringify(settings));
  },

  resetToInitial(): void {
    localStorage.clear();
  },
};
