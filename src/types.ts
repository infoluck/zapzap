export type GatewayProvider = 'evolution' | 'zapi' | 'custom_rest' | 'simulator';

export interface GatewayConfig {
  provider: GatewayProvider;
  baseUrl: string; // e.g., "http://localhost:8080" or "https://api.meuservidor.com"
  instanceName: string; // e.g., "minha-empresa"
  apiKey: string; // global apikey or instance token
  zapiClientToken?: string; // specific for Z-API client token if required
  autoSyncStatus: boolean;
}

export interface WhatsAppSession {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeData: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  pushName: string | null;
  platform: string;
  batteryLevel: number;
  connectedAt: string | null;
  instanceId: string;
  gatewayProvider?: GatewayProvider;
  lastSyncAt?: string;
  error?: string;
}

export interface ContactProfile {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  profileIds: string[];
  notes?: string;
  addedAt: string;
  customData?: Record<string, string>;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  createdAt: string;
}

export interface AntiBanSettings {
  enableMessageSpinning: boolean; // mesclar templates diferentes para cada contato
  enableSpintax: boolean; // resolver {Olá|Oi|E aí}
  enableZeroWidthNoise: boolean; // injetar micro-caractere invisível para ofuscar o hash da mensagem
  minDelaySeconds: number; // ex: 4
  maxDelaySeconds: number; // ex: 12
  batchSize: number; // pausar a cada X envios
  batchPauseMinutes: number; // tempo de pausa preventiva
  simulateTyping: boolean; // simular presença digitando
}

export interface ChatMessage {
  id: string;
  chatId: string; // phone digits or JID
  sender: 'me' | 'contact';
  text: string;
  timestamp: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

export interface WhatsAppChat {
  id: string; // phone digits or JID
  name: string;
  phone: string;
  pushName?: string; // Nome público de perfil no WhatsApp (ex: "Willia Oliveira", exibido como ~Willia Oliveira)
  about?: string; // Recado / Status do WhatsApp (ex: "Disponível")
  jid?: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageTimestamp?: string;
  unreadCount: number;
  contactId?: string; // id in Contact[] if linked
  profileIds?: string[];
  isGroup?: boolean;
  isPinned?: boolean; // Ancora conversa no topo da lista
  pinIndex?: number; // Ordem dos fixados
  isDisappearing?: boolean; // Mensagens temporárias ativas
  isMuted?: boolean;
  labels?: string[];
}

export interface CampaignLogItem {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  messageSent: string;
  templateUsedTitle: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  delayUsedSeconds?: number;
  error?: string;
}

export interface Campaign {
  id: string;
  name: string;
  targetProfileId: string;
  selectedTemplateIds: string[];
  scheduledFor: string | null; // null = imediato, string = ISO date
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  antiBanSettings: AntiBanSettings;
  logs: CampaignLogItem[];
  createdAt: string;
}
