import {
  ContactProfile,
  Contact,
  MessageTemplate,
  WhatsAppSession,
  Campaign,
  AntiBanSettings,
  GatewayConfig,
  WhatsAppChat,
  ChatMessage
} from '../types';

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${method} ${url}`);
}

export const apiClient = {
  // ------------------------------------
  // DELETE EM LOTE (profiles | contacts | templates | chats | messages)
  // ------------------------------------
  async deleteMany(
    entity: 'profiles' | 'contacts' | 'templates' | 'chats' | 'messages',
    ids: string[]
  ): Promise<void> {
    if (ids.length === 0) return;
    try {
      await send(`/api/${entity}/delete`, 'POST', { ids });
    } catch (err) {
      console.error(`API deleteMany(${entity}) failed:`, err);
    }
  },

  async getAllMessages(): Promise<Record<string, ChatMessage[]>> {
    const res = await fetch('/api/messages');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // ------------------------------------
  // PROFILES
  // ------------------------------------
  async getProfiles(): Promise<ContactProfile[]> {
    try {
      const res = await fetch('/api/profiles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API read failed:', err);
      throw err;
    }
  },

  async saveProfile(profile: ContactProfile): Promise<void> {
    try {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
    } catch (err) {
      console.error('API saveProfile failed:', err);
    }
  },

  async saveProfilesBatch(profiles: ContactProfile[]): Promise<void> {
    try {
      await fetch('/api/profiles/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles),
      });
    } catch (err) {
      console.error('API saveProfilesBatch failed:', err);
    }
  },

  async deleteProfile(id: string): Promise<void> {
    try {
      await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('API deleteProfile failed:', err);
    }
  },

  // ------------------------------------
  // CONTACTS
  // ------------------------------------
  async getContacts(): Promise<Contact[]> {
    try {
      const res = await fetch('/api/contacts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API read failed:', err);
      throw err;
    }
  },

  async saveContact(contact: Contact): Promise<void> {
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
    } catch (err) {
      console.error('API saveContact failed:', err);
    }
  },

  async saveContactsBatch(contacts: Contact[]): Promise<void> {
    try {
      await fetch('/api/contacts/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contacts),
      });
    } catch (err) {
      console.error('API saveContactsBatch failed:', err);
    }
  },

  async deleteContact(id: string): Promise<void> {
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('API deleteContact failed:', err);
    }
  },

  // ------------------------------------
  // TEMPLATES
  // ------------------------------------
  async getTemplates(): Promise<MessageTemplate[]> {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API read failed:', err);
      throw err;
    }
  },

  async saveTemplate(template: MessageTemplate): Promise<void> {
    try {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
    } catch (err) {
      console.error('API saveTemplate failed:', err);
    }
  },

  async saveTemplatesBatch(templates: MessageTemplate[]): Promise<void> {
    try {
      await fetch('/api/templates/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates),
      });
    } catch (err) {
      console.error('API saveTemplatesBatch failed:', err);
    }
  },

  async deleteTemplate(id: string): Promise<void> {
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('API deleteTemplate failed:', err);
    }
  },

  // ------------------------------------
  // CHATS
  // ------------------------------------
  async getChats(): Promise<WhatsAppChat[]> {
    try {
      const res = await fetch('/api/chats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API read failed:', err);
      throw err;
    }
  },

  async saveChats(chats: WhatsAppChat[]): Promise<void> {
    try {
      await fetch('/api/chats/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chats),
      });
    } catch (err) {
      console.error('API saveChats failed:', err);
    }
  },

  // ------------------------------------
  // MESSAGES
  // ------------------------------------
  async getMessages(chatId: string): Promise<ChatMessage[]> {
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(chatId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getMessages failed:', err);
      throw err;
    }
  },

  async saveMessage(msg: ChatMessage): Promise<void> {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
    } catch (err) {
      console.error('API saveMessage failed:', err);
    }
  },

  async saveMessagesBatch(messagesMap: Record<string, ChatMessage[]>): Promise<void> {
    try {
      await fetch('/api/messages/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagesMap),
      });
    } catch (err) {
      console.error('API saveMessagesBatch failed:', err);
    }
  },

  // ------------------------------------
  // CAMPAIGNS
  // ------------------------------------
  async getCampaigns(): Promise<Campaign[]> {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API read failed:', err);
      throw err;
    }
  },

  async saveCampaign(campaign: Campaign): Promise<void> {
    try {
      await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign),
      });
    } catch (err) {
      console.error('API saveCampaign failed:', err);
    }
  },

  async deleteCampaign(id: string): Promise<void> {
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('API deleteCampaign failed:', err);
    }
  },

  // ------------------------------------
  // SETTINGS (Session, GatewayConfig, AntiBan)
  // ------------------------------------
  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
    if (res.status === 404) return defaultValue;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async saveSetting<T>(key: string, value: T): Promise<void> {
    try {
      await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    } catch (err) {
      console.error(`API saveSetting(${key}) failed:`, err);
    }
  },
};
