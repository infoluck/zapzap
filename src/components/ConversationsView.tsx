import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Search,
  RefreshCw,
  UserPlus,
  UserCheck,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  FileText,
  Phone,
  Plus,
  X,
  Tag,
  Smile,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  Wifi,
  Filter,
  Pin,
  PinOff,
  Users,
  BellOff,
  BookOpen,
  RotateCcw,
  Camera,
  Mic,
  Video,
  Info,
  Copy,
  Lock,
  Ban,
  ZoomIn,
  Download,
  Smartphone
} from 'lucide-react';
import {
  WhatsAppChat,
  ChatMessage,
  Contact,
  ContactProfile,
  MessageTemplate,
  WhatsAppSession,
  GatewayConfig
} from '../types';
import { whatsappGatewayService } from '../lib/whatsappGateway';
import { downloadVCard } from '../lib/vcard';

interface ConversationsViewProps {
  session: WhatsAppSession;
  gatewayConfig: GatewayConfig;
  chats: WhatsAppChat[];
  messages: Record<string, ChatMessage[]>;
  contacts: Contact[];
  profiles: ContactProfile[];
  templates: MessageTemplate[];
  onSaveChats: (updatedChats: WhatsAppChat[]) => void;
  onSaveMessages: (updatedMessages: Record<string, ChatMessage[]>) => void;
  onSaveContacts: (updatedContacts: Contact[]) => void;
  onNavigateToConnection: () => void;
  onSyncContactsAndChats: () => Promise<{ count: number; message: string }>;
  onSyncChats?: () => Promise<{ count: number; message: string }>;
  onResetToRealChats?: () => void;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  session,
  gatewayConfig,
  chats,
  messages,
  contacts,
  profiles,
  templates,
  onSaveChats,
  onSaveMessages,
  onSaveContacts,
  onNavigateToConnection,
  onSyncContactsAndChats,
  onSyncChats,
  onResetToRealChats,
}) => {
  // Active chat selection
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() => {
    return chats.length > 0 ? chats[0].id : null;
  });

  // Message input state
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendFeedback, setSendFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'unread' | 'groups' | 'agenda' | 'unsaved'>('all');
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>('all');

  // Toggle pin/unpin for a chat (ancorar no topo)
  const handleTogglePinChat = (chatId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const targetChat = chats.find((c) => c.id === chatId);
    if (!targetChat) return;

    const newPinned = !targetChat.isPinned;
    const updatedChats = chats.map((c) =>
      c.id === chatId ? { ...c, isPinned: newPinned } : c
    );
    onSaveChats(updatedChats);

    setSendFeedback({
      type: 'success',
      text: newPinned
        ? `Contato "${targetChat.name}" ancorado no início da lista! 📌`
        : `Contato "${targetChat.name}" desancorado.`,
    });
    setTimeout(() => setSendFeedback(null), 3500);

    // Call WhatsApp Evolution API in background if possible
    whatsappGatewayService.setChatPin(gatewayConfig, targetChat.jid || targetChat.id, newPinned);
  };

  // Format timestamp showing exact and relative times
  const formatChatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const timeMatch = timestamp.match(/T(\d{2}:\d{2})/);
      const isTodayDate = timestamp.startsWith(new Date().toISOString().slice(0, 10)) || timestamp.startsWith('2026-09-15');
      if (timeMatch && isTodayDate) {
        return timeMatch[1];
      }

      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timeMatch ? timeMatch[1] : '';
      }
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

      if (isYesterday) return 'Ontem';

      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return date.toLocaleDateString('pt-BR', { weekday: 'short' });
      }

      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Quick Template picker modal/dropdown
  const [showTemplateMenu, setShowTemplateMenu] = useState<boolean>(false);

  // Modal to Add/Edit Contact
  const [contactModalOpen, setContactModalOpen] = useState<boolean>(false);
  const [contactFormName, setContactFormName] = useState<string>('');
  const [contactFormPhone, setContactFormPhone] = useState<string>('');
  const [contactFormNotes, setContactFormNotes] = useState<string>('');
  const [contactFormProfiles, setContactFormProfiles] = useState<string[]>([]);
  const [autoExportVCard, setAutoExportVCard] = useState<boolean>(true);

  // Modal for New Conversation with arbitrary phone number
  const [newChatModalOpen, setNewChatModalOpen] = useState<boolean>(false);
  const [newChatPhone, setNewChatPhone] = useState<string>('');
  const [newChatName, setNewChatName] = useState<string>('');
  const [newChatInitialMsg, setNewChatInitialMsg] = useState<string>('');

  // WhatsApp Web "Dados do contato" drawer & interactive features
  const [contactInfoOpen, setContactInfoOpen] = useState<boolean>(false);
  const [searchInChat, setSearchInChat] = useState<string>('');
  const [isSearchInChatOpen, setIsSearchInChatOpen] = useState<boolean>(false);
  const [photoZoomUrl, setPhotoZoomUrl] = useState<string | null>(null);
  const [callModal, setCallModal] = useState<{ open: boolean; type: 'audio' | 'video'; name: string; phone: string }>({
    open: false,
    type: 'audio',
    name: '',
    phone: '',
  });
  const [copiedPhone, setCopiedPhone] = useState<boolean>(false);

  const handleCopyPhone = (phoneText: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(phoneText);
    }
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // Scroll to bottom anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedChatId, messages]);

  // Selected chat object
  const activeChat = chats.find((c) => c.id === selectedChatId) || null;

  // Auto-fetch real messages for the selected chat when connected to a real WhatsApp gateway
  useEffect(() => {
    if (!activeChat || gatewayConfig.provider === 'simulator' || !gatewayConfig.baseUrl || !gatewayConfig.apiKey) {
      return;
    }
    const currentId = activeChat.id;
    const jid = activeChat.jid || `${activeChat.id.replace(/\D/g, '')}@s.whatsapp.net`;
    whatsappGatewayService
      .fetchChatMessages(gatewayConfig, jid)
      .then((res) => {
        if (res.success && res.messages.length > 0) {
          onSaveMessages({
            ...messages,
            [currentId]: res.messages,
          });
        }
      })
      .catch(() => {});
  }, [selectedChatId]);

  // Check if active chat contact is already saved in contacts list
  const activeContact = activeChat
    ? contacts.find((c) => {
        const cPhoneDigits = c.phone.replace(/\D/g, '');
        const chatDigits = (activeChat.phone || activeChat.id).replace(/\D/g, '');
        return cPhoneDigits && chatDigits && (cPhoneDigits === chatDigits || cPhoneDigits.endsWith(chatDigits) || chatDigits.endsWith(cPhoneDigits));
      })
    : null;

  // Auto-fill contact modal form when opening from active chat header
  const handleOpenContactModal = () => {
    if (!activeChat) return;
    if (activeContact) {
      setContactFormName(activeContact.name);
      setContactFormPhone(activeContact.phone);
      setContactFormNotes(activeContact.notes || '');
      setContactFormProfiles(activeContact.profileIds || []);
    } else {
      const isPhoneName = /^[+\d\s()-]+$/.test(activeChat.name);
      setContactFormName(activeChat.pushName || (isPhoneName ? '' : activeChat.name));
      setContactFormPhone(activeChat.phone || activeChat.id);
      setContactFormNotes('Contato salvo a partir das conversas do WhatsApp');
      setContactFormProfiles([]);
    }
    setContactModalOpen(true);
  };

  // Open save contact modal directly for any chat from the list or prompt banner
  const handleOpenSaveContactModalForChat = (targetChat: WhatsAppChat, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedChatId(targetChat.id);

    const targetDigits = (targetChat.phone || targetChat.id).replace(/\D/g, '');
    const matchedContact = contacts.find((c) => {
      const cDigits = c.phone.replace(/\D/g, '');
      return cDigits && targetDigits && (cDigits === targetDigits || cDigits.endsWith(targetDigits) || targetDigits.endsWith(cDigits));
    });

    if (matchedContact) {
      setContactFormName(matchedContact.name);
      setContactFormPhone(matchedContact.phone);
      setContactFormNotes(matchedContact.notes || '');
      setContactFormProfiles(matchedContact.profileIds || []);
    } else {
      const isPhoneName = /^[+\d\s()-]+$/.test(targetChat.name);
      setContactFormName(targetChat.pushName || (isPhoneName ? '' : targetChat.name));
      setContactFormPhone(targetChat.phone || targetChat.id);
      setContactFormNotes('Contato salvo a partir das conversas do WhatsApp');
      setContactFormProfiles([]);
    }
    setContactModalOpen(true);
  };

  // Save / Link contact to profiles and update chats
  const handleSaveContactForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactFormPhone.trim()) return;

    const contactName = contactFormName.trim() || contactFormPhone.trim();
    const phoneDigits = contactFormPhone.replace(/\D/g, '');
    let updatedContacts: Contact[];
    let targetContactId: string;

    const existingMatch = activeContact || contacts.find((c) => {
      const cDigits = c.phone.replace(/\D/g, '');
      return cDigits && phoneDigits && (cDigits === phoneDigits || cDigits.endsWith(phoneDigits) || phoneDigits.endsWith(cDigits));
    });

    if (existingMatch) {
      targetContactId = existingMatch.id;
      // Update existing contact
      updatedContacts = contacts.map((c) =>
        c.id === existingMatch.id
          ? {
              ...c,
              name: contactName,
              phone: contactFormPhone.trim(),
              notes: contactFormNotes.trim(),
              profileIds: contactFormProfiles,
            }
          : c
      );
    } else {
      // Create new contact
      targetContactId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newContact: Contact = {
        id: targetContactId,
        name: contactName,
        phone: contactFormPhone.trim(),
        profileIds: contactFormProfiles,
        notes: contactFormNotes.trim(),
        addedAt: new Date().toISOString(),
      };
      updatedContacts = [newContact, ...contacts];
    }

    onSaveContacts(updatedContacts);

    // If auto-export to phone is enabled, trigger single-contact .vcf download
    if (autoExportVCard) {
      const savedContactObj: Contact = {
        id: targetContactId,
        name: contactName,
        phone: contactFormPhone.trim(),
        profileIds: contactFormProfiles,
        notes: contactFormNotes.trim(),
        addedAt: new Date().toISOString(),
      };
      downloadVCard([savedContactObj], `contato_${contactName.toLowerCase().replace(/\s+/g, '_')}.vcf`);
    }

    // Also update any matching chat (by id or phone)
    const activeChatId = activeChat?.id;
    const updatedChats = chats.map((ch) => {
      const chDigits = (ch.phone || ch.id).replace(/\D/g, '');
      const isMatch =
        ch.id === activeChatId ||
        ch.id === selectedChatId ||
        (chDigits && phoneDigits && (chDigits === phoneDigits || chDigits.endsWith(phoneDigits) || phoneDigits.endsWith(chDigits)));

      if (isMatch) {
        return {
          ...ch,
          name: contactName,
          phone: contactFormPhone.trim(),
          contactId: targetContactId,
          profileIds: contactFormProfiles,
        };
      }
      return ch;
    });
    onSaveChats(updatedChats);

    setContactModalOpen(false);
    setSendFeedback({
      type: 'success',
      text: existingMatch ? `Contato "${contactName}" atualizado com sucesso!` : `Contato "${contactName}" salvo na sua agenda com sucesso!`,
    });
    setTimeout(() => setSendFeedback(null), 4000);
  };

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!messageContent || !activeChat) return;

    setIsSending(true);
    setSendFeedback(null);

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const currentChatId = activeChat.id;
    const nowIso = new Date().toISOString();

    const newChatMessage: ChatMessage = {
      id: messageId,
      chatId: currentChatId,
      sender: 'me',
      text: messageContent,
      timestamp: nowIso,
      status: 'pending',
    };

    // Optimistically append message
    const currentChatMessages = messages[currentChatId] || [];
    const updatedMessages = {
      ...messages,
      [currentChatId]: [...currentChatMessages, newChatMessage],
    };
    onSaveMessages(updatedMessages);
    setInputText('');

    try {
      // Send real message via Gateway Service
      const sendRes = await whatsappGatewayService.sendMessage(
        gatewayConfig,
        activeChat.phone,
        messageContent
      );

      if (sendRes.success) {
        // Update message status to 'sent'
        const confirmedMessages = {
          ...updatedMessages,
          [currentChatId]: (updatedMessages[currentChatId] || []).map((m) =>
            m.id === messageId ? { ...m, status: 'sent' as const } : m
          ),
        };
        onSaveMessages(confirmedMessages);

        // Update chat snippet & timestamp in chat list
        const updatedChats = chats.map((ch) =>
          ch.id === currentChatId
            ? {
                ...ch,
                lastMessage: messageContent,
                lastMessageTimestamp: nowIso,
              }
            : ch
        );
        onSaveChats(updatedChats);

        setSendFeedback({
          type: 'success',
          text: 'Mensagem enviada com sucesso!',
        });
      } else {
        // Mark message as failed
        const failedMessages = {
          ...updatedMessages,
          [currentChatId]: (updatedMessages[currentChatId] || []).map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  status: 'failed' as const,
                  error: sendRes.error || 'Falha no envio',
                }
              : m
          ),
        };
        onSaveMessages(failedMessages);

        setSendFeedback({
          type: 'error',
          text: sendRes.error || 'Erro ao enviar mensagem pelo WhatsApp.',
        });
      }
    } catch (err: any) {
      setSendFeedback({
        type: 'error',
        text: err?.message || 'Falha de rede ao disparar mensagem.',
      });
    } finally {
      setIsSending(false);
      setTimeout(() => setSendFeedback(null), 5000);
    }
  };

  // Keyboard shortcut to send message: Enter (without Shift)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Sync WhatsApp Conversations directly from API (only real active chats)
  const handleSyncClick = async () => {
    setIsSyncing(true);
    setSyncStatusMsg('Buscando conversas reais ativas na API do WhatsApp...');
    try {
      if (onSyncChats) {
        const res = await onSyncChats();
        setSyncStatusMsg(res.message);
      } else {
        const res = await whatsappGatewayService.fetchChats(gatewayConfig);
        if (res.success && res.chats.length > 0) {
          onSaveChats(res.chats);
          setSyncStatusMsg(`${res.chats.length} conversas ativas sincronizadas com sucesso!`);
        } else {
          setSyncStatusMsg(res.error || 'Nenhuma conversa ativa encontrada na API do WhatsApp.');
        }
      }
    } catch (err: any) {
      setSyncStatusMsg(err?.message || 'Falha na sincronização de conversas.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 6000);
    }
  };

  // Open or start a chat directly from a contact in the address book
  const handleStartChatWithContact = (contact: Contact) => {
    const digits = contact.phone.replace(/\D/g, '');
    const existing = chats.find((ch) => ch.id.replace(/\D/g, '') === digits);
    if (existing) {
      setSelectedChatId(existing.id);
      setActiveFilter('all');
      setSearchQuery('');
      return;
    }

    const cleanFormatted = digits.startsWith('55')
      ? `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
      : `+${digits}`;

    const newChat: WhatsAppChat = {
      id: digits || contact.id,
      name: contact.name || cleanFormatted,
      phone: contact.phone || cleanFormatted,
      jid: `${digits}@s.whatsapp.net`,
      lastMessage: 'Nova conversa iniciada',
      lastMessageTimestamp: new Date().toISOString(),
      unreadCount: 0,
      contactId: contact.id,
      profileIds: contact.profileIds,
    };

    onSaveChats([newChat, ...chats]);
    setSelectedChatId(newChat.id);
    setActiveFilter('all');
    setSearchQuery('');
  };

  // Start new conversation modal submission
  const handleStartNewChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) return;

    const rawDigits = newChatPhone.replace(/\D/g, '');
    if (rawDigits.length < 8) {
      alert('Por favor, informe um número de telefone válido com DDD (ex: 11999998888).');
      return;
    }

    // Check if chat already exists
    const existing = chats.find((c) => c.id.replace(/\D/g, '') === rawDigits);
    if (existing) {
      setSelectedChatId(existing.id);
      setNewChatModalOpen(false);
      return;
    }

    const cleanFormatted = rawDigits.startsWith('55')
      ? `+55 ${rawDigits.slice(2, 4)} ${rawDigits.slice(4, 9)}-${rawDigits.slice(9)}`
      : `+${rawDigits}`;

    const newChat: WhatsAppChat = {
      id: rawDigits,
      name: newChatName.trim() || cleanFormatted,
      phone: cleanFormatted,
      jid: `${rawDigits}@s.whatsapp.net`,
      lastMessage: newChatInitialMsg.trim() || 'Nova conversa iniciada',
      lastMessageTimestamp: new Date().toISOString(),
      unreadCount: 0,
    };

    const updatedChats = [newChat, ...chats];
    onSaveChats(updatedChats);
    setSelectedChatId(newChat.id);

    if (newChatInitialMsg.trim()) {
      const initMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        chatId: newChat.id,
        sender: 'me',
        text: newChatInitialMsg.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent',
      };
      onSaveMessages({
        ...messages,
        [newChat.id]: [initMessage],
      });
      // Also send it in background if connected
      whatsappGatewayService.sendMessage(gatewayConfig, cleanFormatted, newChatInitialMsg.trim());
    }

    setNewChatModalOpen(false);
    setNewChatPhone('');
    setNewChatName('');
    setNewChatInitialMsg('');
  };

  // Filtered chats logic
  const filteredChats = chats.filter((chat) => {
    // Search query
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      chat.name.toLowerCase().includes(q) ||
      chat.phone.includes(q) ||
      (chat.lastMessage && chat.lastMessage.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    // Filter tabs
    if (activeFilter === 'pinned' && !chat.isPinned) return false;
    if (activeFilter === 'unread' && chat.unreadCount === 0) return false;
    if (activeFilter === 'groups' && !chat.isGroup) return false;
    if (activeFilter === 'unsaved') {
      if (chat.isGroup) return false;
      const chPhone = (chat.phone || chat.id).replace(/\D/g, '');
      const isSaved = contacts.some((c) => {
        const cPhone = c.phone.replace(/\D/g, '');
        return cPhone && chPhone && (cPhone === chPhone || cPhone.endsWith(chPhone) || chPhone.endsWith(cPhone));
      });
      if (isSaved) return false;
    }

    // Profile filter
    if (selectedProfileFilter !== 'all') {
      const chatProfiles = chat.profileIds || [];
      // Also check contact if matched
      const matchedContact = contacts.find(
        (c) => c.phone.replace(/\D/g, '') === chat.id.replace(/\D/g, '')
      );
      const allProfiles = Array.from(new Set([...chatProfiles, ...(matchedContact?.profileIds || [])]));
      if (!allProfiles.includes(selectedProfileFilter)) return false;
    }

    return true;
  });

  // STRICT ORDERING:
  // 1. Contatos ancorados (isPinned: true) no topo absoluto da lista (respeitando pinIndex 1, 2...)
  // 2. Mensagens mais recentes primeiro (lastMessageTimestamp descrescente)
  const sortedChats = [...filteredChats].sort((a, b) => {
    const aPinned = Boolean(a.isPinned);
    const bPinned = Boolean(b.isPinned);

    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    if (aPinned && bPinned) {
      if (a.pinIndex !== undefined && b.pinIndex !== undefined) {
        return a.pinIndex - b.pinIndex;
      }
    }

    const timeA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
    const timeB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
    return timeB - timeA;
  });

  const pinnedChatsCount = chats.filter((c) => c.isPinned).length;
  const groupsCount = chats.filter((c) => c.isGroup).length;
  const unreadCount = chats.filter((c) => c.unreadCount > 0).length;
  const unsavedChatsCount = chats.filter((chat) => {
    if (chat.isGroup) return false;
    const chPhone = (chat.phone || chat.id).replace(/\D/g, '');
    const isSaved = contacts.some((c) => {
      const cPhone = c.phone.replace(/\D/g, '');
      return cPhone && chPhone && (cPhone === chPhone || cPhone.endsWith(chPhone) || chPhone.endsWith(cPhone));
    });
    return !isSaved;
  }).length;

  // Search query matches from saved contacts (agenda)
  const matchingAgendaContacts = searchQuery.trim().length >= 2
    ? contacts.filter((c) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phone.includes(q);
        const inActiveChats = chats.some((ch) => ch.id.replace(/\D/g, '') === c.phone.replace(/\D/g, ''));
        return (matchesName || matchesPhone) && !inActiveChats;
      }).slice(0, 6)
    : [];

  // Filtered contacts when in 'agenda' tab
  const filteredAgendaContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) {
      return false;
    }
    if (selectedProfileFilter !== 'all') {
      if (!c.profileIds?.includes(selectedProfileFilter)) return false;
    }
    return true;
  });

  // Detect if previous session dumped address book contacts into the chat list
  const isAddressBookDumpInChats =
    chats.length > 40 &&
    chats.filter((c) => c.lastMessage?.includes('sincronizado')).length > 15;

  const activeChatMessages = activeChat ? messages[activeChat.id] || [] : [];
  const displayedMessages = searchInChat.trim()
    ? activeChatMessages.filter((m) =>
        m.text.toLowerCase().includes(searchInChat.toLowerCase())
      )
    : activeChatMessages;

  return (
    <div className="space-y-4">
      {/* Top Banner / Sync Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              Minhas Conversas do WhatsApp
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                {chats.length} conversas
              </span>
            </h2>
            <p className="text-xs text-gray-500">
              Sincronize mensagens do WhatsApp em tempo real, responda diretamente e adicione contatos aos seus perfis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.status !== 'connected' && (
            <button
              onClick={onNavigateToConnection}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-semibold transition cursor-pointer"
            >
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Conectar WhatsApp</span>
            </button>
          )}

          <button
            id="btn-sync-conversations"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Conversas'}</span>
          </button>

          {onResetToRealChats && (
            <button
              id="btn-reset-real-chats"
              onClick={onResetToRealChats}
              title="Restaurar lista exata com as 17 conversas reais do seu WhatsApp"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <span>Restaurar Conversas Reais (17)</span>
            </button>
          )}

          <button
            id="btn-export-contacts-vcard-conv"
            onClick={() => {
              if (contacts.length === 0) {
                setSendFeedback({
                  type: 'error',
                  text: 'Nenhum contato na agenda para exportar.',
                });
                setTimeout(() => setSendFeedback(null), 3000);
                return;
              }
              downloadVCard(contacts, `contatos_agenda_${contacts.length}.vcf`);
              setSendFeedback({
                type: 'success',
                text: `✅ Arquivo com ${contacts.length} contatos baixado! Abra-o no celular para sincronizar com sua agenda.`,
              });
              setTimeout(() => setSendFeedback(null), 4500);
            }}
            title="Exportar todos os contatos salvos para a agenda do seu celular (.vcf)"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            <span>Exportar p/ Celular (.vcf)</span>
          </button>

          <button
            id="btn-new-chat"
            onClick={() => setNewChatModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Nova Conversa</span>
          </button>
        </div>
      </div>

      {/* Alert if address book contacts were previously dumped into the chat list */}
      {isAddressBookDumpInChats && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl shadow-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-bold text-amber-950">
                Alinhamento com o seu WhatsApp Real:
              </p>
              <p className="text-amber-800 text-[11px]">
                Detectamos que a tela está listando {chats.length} contatos da sua agenda. Seus {contacts.length} contatos continuam salvos na aba Perfis e na aba Agenda. Clique em Restaurar para exibir apenas as conversas ativas do seu WhatsApp.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onResetToRealChats && (
              <button
                onClick={onResetToRealChats}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Conversas Reais</span>
              </button>
            )}
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Buscar na API</span>
            </button>
          </div>
        </div>
      )}

      {syncStatusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-600" />
            <span>{syncStatusMsg}</span>
          </div>
          <button onClick={() => setSyncStatusMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Chat Interface: Two Columns */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[640px]">
        {/* Left Column: Conversations List (5 cols on md) */}
        <div className="md:col-span-4 lg:col-span-4 border-r border-gray-200 flex flex-col bg-gray-50/50">
          {/* Search Box & Filters */}
          <div className="p-3 border-b border-gray-200 space-y-2.5 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por nome ou número..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tudo ({chats.length})
              </button>
              <button
                onClick={() => setActiveFilter('pinned')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'pinned'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Mostrar apenas contatos ancorados no topo"
              >
                <Pin className="w-3 h-3 fill-current" />
                <span>Ancoradas ({pinnedChatsCount})</span>
              </button>
              <button
                onClick={() => setActiveFilter('unread')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'unread'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Não Lidas {unreadCount > 0 && `(${unreadCount})`}
              </button>
              <button
                onClick={() => setActiveFilter('groups')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'groups'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Grupos {groupsCount > 0 && `(${groupsCount})`}</span>
              </button>
              <button
                onClick={() => setActiveFilter('agenda')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'agenda'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Ver contatos salvos da sua agenda"
              >
                <BookOpen className="w-3 h-3" />
                <span>Agenda ({contacts.length})</span>
              </button>
              <button
                onClick={() => setActiveFilter('unsaved')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeFilter === 'unsaved'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Não Salvos {unsavedChatsCount > 0 && `(${unsavedChatsCount})`}
              </button>

              {profiles.length > 0 && (
                <div className="relative inline-block text-left ml-auto">
                  <select
                    value={selectedProfileFilter}
                    onChange={(e) => setSelectedProfileFilter(e.target.value)}
                    aria-label="Filtrar conversas por perfil"
                    className="text-[11px] bg-gray-100 border border-gray-200 text-gray-700 rounded-md px-2 py-1 outline-none font-medium cursor-pointer"
                  >
                    <option value="all">Todos os Perfis</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* List of Chats or Agenda Contacts */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-[580px]">
            {activeFilter === 'agenda' ? (
              filteredAgendaContacts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold">Nenhum contato encontrado na agenda</p>
                </div>
              ) : (
                filteredAgendaContacts.map((contact) => {
                  const digits = contact.phone.replace(/\D/g, '');
                  const isChatting = chats.some((ch) => ch.id.replace(/\D/g, '') === digits);
                  return (
                    <div
                      key={contact.id}
                      onClick={() => handleStartChatWithContact(contact)}
                      className="group p-3 flex items-center justify-between gap-3 cursor-pointer transition hover:bg-gray-100/80 bg-white"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                          {contact.name ? contact.name.charAt(0).toUpperCase() : '#'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {contact.name}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {contact.phone}
                          </p>
                          {contact.profileIds && contact.profileIds.length > 0 && (
                            <div className="flex items-center flex-wrap gap-1 mt-0.5">
                              {contact.profileIds.map((pId) => {
                                const p = profiles.find((prof) => prof.id === pId);
                                if (!p) return null;
                                return (
                                  <span
                                    key={p.id}
                                    className="px-1.5 py-0.2 rounded text-[9px] font-medium text-white"
                                    style={{ backgroundColor: p.color }}
                                  >
                                    {p.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartChatWithContact(contact);
                        }}
                        className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-xs font-semibold transition shrink-0 cursor-pointer"
                      >
                        {isChatting ? 'Abrir Chat' : 'Conversar'}
                      </button>
                    </div>
                  );
                })
              )
            ) : (
              <>
                {/* Active WhatsApp Chats */}
                {sortedChats.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold">Nenhuma conversa encontrada</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Tente alterar os filtros ou clique em "Sincronizar Conversas".
                    </p>
                  </div>
                ) : (
                  sortedChats.map((chat) => {
                    const isSelected = selectedChatId === chat.id;
                    const chatDigits = (chat.phone || chat.id).replace(/\D/g, '');
                    const matchedContact = contacts.find((c) => {
                      const cDigits = c.phone.replace(/\D/g, '');
                      return cDigits && chatDigits && (cDigits === chatDigits || cDigits.endsWith(chatDigits) || chatDigits.endsWith(cDigits));
                    });
                    const isSavedInContacts = chat.isGroup || Boolean(matchedContact);
                    const chatProfileIds = Array.from(
                      new Set([...(chat.profileIds || []), ...(matchedContact?.profileIds || [])])
                    );

                    return (
                      <div
                        key={chat.id}
                        onClick={() => {
                          setSelectedChatId(chat.id);
                          // Clear unread count when clicking
                          if (chat.unreadCount > 0) {
                            const updated = chats.map((c) =>
                              c.id === chat.id ? { ...c, unreadCount: 0 } : c
                            );
                            onSaveChats(updated);
                          }
                        }}
                        className={`group p-3.5 flex items-start gap-3 cursor-pointer transition hover:bg-gray-100/80 ${
                          isSelected
                            ? 'bg-emerald-50/70 border-l-4 border-emerald-600'
                            : chat.isPinned
                            ? 'bg-amber-50/20'
                            : 'bg-white'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          {chat.avatarUrl ? (
                            <img
                              src={chat.avatarUrl}
                              alt={chat.name}
                              className="w-10 h-10 rounded-full object-cover shadow-xs border border-gray-100 shrink-0"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full text-white font-bold text-xs flex items-center justify-center shadow-xs ${
                              chat.isGroup
                                ? 'bg-gradient-to-tr from-indigo-600 to-blue-500'
                                : 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                            }`}>
                              {chat.isGroup ? (
                                <Users className="w-4 h-4 text-white" />
                              ) : chat.name ? (
                                chat.name.charAt(0).toUpperCase()
                              ) : (
                                chat.phone.slice(-2)
                              )}
                            </div>
                          )}
                          {chat.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                              {chat.unreadCount}
                            </span>
                          )}
                          {chat.isPinned && (
                            <div
                              className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-2xs"
                              title="Contato ancorado no início"
                            >
                              <Pin className="w-2.5 h-2.5 fill-white" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-xs font-bold text-gray-900 truncate">
                                {chat.name}
                              </span>
                              {chat.pushName && !chat.isGroup && (
                                <span
                                  className="text-[11px] font-semibold text-slate-500 truncate"
                                  title={`Perfil WhatsApp: ~${chat.pushName}`}
                                >
                                  ~{chat.pushName}
                                </span>
                              )}
                              {chat.isPinned && (
                                <Pin className="w-3 h-3 text-amber-600 fill-amber-500 shrink-0" title="Contato ancorado" />
                              )}
                              {chat.isDisappearing && (
                                <Clock className="w-3 h-3 text-gray-400 shrink-0" title="Mensagens temporárias ativadas" />
                              )}
                              {chat.isMuted && (
                                <BellOff className="w-3 h-3 text-gray-400 shrink-0" title="Silenciado" />
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className={`text-[10px] ${chat.unreadCount > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
                                {formatChatTime(chat.lastMessageTimestamp)}
                              </span>
                              {/* Quick Pin / Unpin Action */}
                              <button
                                type="button"
                                onClick={(e) => handleTogglePinChat(chat.id, e)}
                                title={chat.isPinned ? 'Desancorar contato da lista' : 'Ancorar contato no início da lista'}
                                className={`p-1 rounded transition cursor-pointer ${
                                  chat.isPinned
                                    ? 'text-amber-600 hover:bg-amber-100 hover:text-amber-800'
                                    : 'text-gray-300 hover:text-gray-700 hover:bg-gray-200 opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                {chat.isPinned ? (
                                  <PinOff className="w-3 h-3" />
                                ) : (
                                  <Pin className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const chatMsgs = messages[chat.id];
                            const latestMsg = chatMsgs && chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1].text : null;
                            const rawLast = (chat.lastMessage && chat.lastMessage.toLowerCase() !== 'carregando...') ? chat.lastMessage : null;
                            const displayLastMsg = rawLast || latestMsg || (chat.isGroup ? 'Conversa em grupo' : 'Toque para conversar...');
                            const isCheckCheck = displayLastMsg?.startsWith('✓✓');
                            let cleanText = displayLastMsg?.replace(/^✓✓\s*/, '') || '';
                            const isAudio = cleanText.startsWith('🎤');
                            const isPhoto = cleanText.startsWith('📷');
                            if (isAudio) {
                              cleanText = cleanText.replace(/^🎤\s*/, '');
                            }
                            if (isPhoto) {
                              cleanText = cleanText.replace(/^📷\s*/, '');
                            }

                            return (
                              <div className="flex items-center gap-1 mb-1">
                                {isCheckCheck && (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                )}
                                {isAudio && (
                                  <Mic className="w-3 h-3 text-emerald-600 shrink-0" />
                                )}
                                {isPhoto && (
                                  <Camera className="w-3 h-3 text-gray-500 shrink-0" />
                                )}
                                <p className="text-[11px] text-gray-500 truncate">
                                  {cleanText}
                                </p>
                              </div>
                            );
                          })()}

                          {/* Badges / Profiles / Labels */}
                          <div className="flex items-center flex-wrap gap-1">
                            {chat.isPinned && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                Ancorado
                              </span>
                            )}

                            {chat.isGroup && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Users className="w-2.5 h-2.5 text-indigo-600" />
                                Grupo
                              </span>
                            )}

                            {chat.labels && chat.labels.map((lbl) => (
                              <span
                                key={lbl}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200"
                              >
                                <Tag className="w-2 h-2 text-sky-600" />
                                {lbl}
                              </span>
                            ))}

                            {isSavedInContacts ? (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
                                  <UserCheck className="w-2.5 h-2.5 text-emerald-600" />
                                  Salvo
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedChatId(chat.id);
                                    setContactInfoOpen(true);
                                  }}
                                  title="Ver dados do contato (foto, nome público e detalhes)"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition cursor-pointer"
                                >
                                  <Info className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>Dados</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenSaveContactModalForChat(chat, e)}
                                  title="Número não salvo na agenda. Clique para salvar como novo contato."
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition cursor-pointer shadow-2xs group/btn"
                                >
                                  <UserPlus className="w-2.5 h-2.5 text-amber-700 group-hover/btn:text-white" />
                                  <span>Salvar Contato</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedChatId(chat.id);
                                    setContactInfoOpen(true);
                                  }}
                                  title="Ver dados do contato (foto, nome de perfil no WhatsApp e detalhes)"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition cursor-pointer"
                                >
                                  <Info className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>Dados</span>
                                </button>
                              </div>
                            )}

                            {chatProfileIds.map((pId) => {
                              const p = profiles.find((prof) => prof.id === pId);
                              if (!p) return null;
                              return (
                                <span
                                  key={p.id}
                                  className="px-1.5 py-0.2 rounded text-[9px] font-medium text-white"
                                  style={{ backgroundColor: p.color }}
                                >
                                  {p.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Matching contacts from Agenda when user is searching */}
                {matchingAgendaContacts.length > 0 && (
                  <div className="p-3 bg-blue-50/70 border-t border-blue-100">
                    <p className="text-[11px] font-bold text-blue-900 mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      Contatos da sua agenda ({matchingAgendaContacts.length})
                    </p>
                    <div className="space-y-1.5">
                      {matchingAgendaContacts.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => handleStartChatWithContact(c)}
                          className="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-200 hover:bg-blue-50 transition cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-semibold text-gray-900 truncate">
                              {c.name}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {c.phone}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                            Iniciar Chat
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation (8 cols on md) */}
        <div className="md:col-span-8 lg:col-span-8 flex bg-[#efeae2]/40 relative overflow-hidden">
          {activeChat ? (
            <>
              {/* Chat Main Conversation Area */}
              <div className="flex-1 flex flex-col min-w-0 h-full relative">
                {/* Active Chat Header */}
                <div className="p-3.5 bg-white border-b border-gray-200 flex items-center justify-between gap-3 shadow-2xs z-10">
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer group select-none"
                    onClick={() => setContactInfoOpen(!contactInfoOpen)}
                    title="Clique no número ou foto para ver os Dados do Contato"
                  >
                    {/* Avatar with photo or initials */}
                    <div className="relative shrink-0">
                      {activeChat.avatarUrl ? (
                        <img
                          src={activeChat.avatarUrl}
                          alt={activeChat.name}
                          className="w-10 h-10 rounded-full object-cover shadow-xs border border-gray-100 shrink-0 group-hover:ring-2 ring-emerald-500 transition"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0 relative group-hover:ring-2 ring-emerald-500 transition">
                          {activeChat.name
                            ? activeChat.name.charAt(0).toUpperCase()
                            : activeChat.phone.slice(-2)}
                        </div>
                      )}
                      {activeChat.isPinned && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center shadow-2xs">
                          <Pin className="w-2 h-2 fill-white text-white" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-gray-900 truncate group-hover:text-emerald-700 transition">
                          {activeChat.name}
                        </h3>
                        {/* WhatsApp Public Push Name (~Willia Oliveira) */}
                        {activeChat.pushName && !activeChat.isGroup && (
                          <span
                            className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-800 transition truncate"
                            title={`Nome no perfil público do WhatsApp: ~${activeChat.pushName}`}
                          >
                            ~{activeChat.pushName}
                          </span>
                        )}
                        {activeChat.isPinned && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shrink-0">
                            <Pin className="w-2.5 h-2.5 fill-amber-600 text-amber-700" />
                            Ancorado
                          </span>
                        )}
                        {activeContact ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shrink-0">
                            <Check className="w-3 h-3" />
                            Contato Salvo
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                            Não Salvo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span className="group-hover:underline">{activeChat.phone}</span>
                        <span className="text-[10px] text-gray-400 ml-1">· Toque para ver perfil</span>
                      </p>
                    </div>
                  </div>

                  {/* Header Action: Add to Contacts & Link Profiles + Toggle Pin + Info Drawer */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id="btn-toggle-contact-info-header"
                      onClick={() => setContactInfoOpen(!contactInfoOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer ${
                        contactInfoOpen
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Abrir Dados do Contato (foto, nome público do WhatsApp e detalhes)"
                    >
                      <Info className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">Dados do Contato</span>
                    </button>

                    <button
                      id="btn-toggle-pin-header"
                      onClick={() => handleTogglePinChat(activeChat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer ${
                        activeChat.isPinned
                          ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                      title={activeChat.isPinned ? 'Desancorar contato da lista' : 'Ancorar contato no topo da lista'}
                    >
                      {activeChat.isPinned ? (
                        <>
                          <PinOff className="w-3.5 h-3.5 text-amber-700" />
                          <span>Desancorar</span>
                        </>
                      ) : (
                        <>
                          <Pin className="w-3.5 h-3.5 text-gray-500" />
                          <span>Ancorar no Topo</span>
                        </>
                      )}
                    </button>

                    {activeContact && (
                      <button
                        id="btn-download-active-contact-vcf"
                        onClick={() => {
                          downloadVCard([activeContact], `contato_${activeContact.name.toLowerCase().replace(/\s+/g, '_')}.vcf`);
                          setSendFeedback({
                            type: 'success',
                            text: `Cartão de contato de "${activeContact.name}" baixado para o seu celular!`,
                          });
                          setTimeout(() => setSendFeedback(null), 3500);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold shadow-2xs transition cursor-pointer"
                        title="Baixar este contato em formato .vcf para importar na agenda do seu smartphone"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                        <span className="hidden sm:inline">Salvar no Celular</span>
                      </button>
                    )}

                    <button
                      id="btn-add-to-contacts-header"
                      onClick={handleOpenContactModal}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer ${
                        activeContact
                          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {activeContact ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Editar Vínculo &amp; Perfis</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Adicionar aos Contatos</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Unsaved contact alert banner */}
                {!activeContact && !activeChat.isGroup && (
                  <div className="bg-amber-50/95 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 border border-amber-300">
                        <UserPlus className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="text-xs min-w-0">
                        <p className="font-bold text-amber-900 flex items-center gap-1.5 flex-wrap">
                          <span>Contato não salvo na sua agenda</span>
                          {activeChat.pushName && (
                            <span className="text-slate-600 font-normal">
                              (Nome no WhatsApp: <strong>~{activeChat.pushName}</strong>)
                            </span>
                          )}
                        </p>
                        <p className="text-amber-700 text-[11px] truncate">
                          {activeChat.phone || activeChat.name} não está cadastrado. Deseja adicionar à sua agenda agora?
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        id="btn-banner-ver-dados"
                        onClick={() => setContactInfoOpen(true)}
                        className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                        title="Ver foto e detalhes do perfil no WhatsApp"
                      >
                        <Info className="w-3.5 h-3.5 text-amber-700" />
                        <span className="hidden sm:inline">Ver Dados</span>
                      </button>
                      <button
                        type="button"
                        id="btn-banner-salvar-contato"
                        onClick={handleOpenContactModal}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Salvar Contato</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Search In Chat Bar (when activated from Dados do Contato) */}
                {isSearchInChatOpen && (
                  <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-2xs">
                    <Search className="w-4 h-4 text-emerald-600 shrink-0" />
                    <input
                      type="text"
                      value={searchInChat}
                      onChange={(e) => setSearchInChat(e.target.value)}
                      placeholder="Pesquisar mensagens nesta conversa..."
                      className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                    />
                    {searchInChat && (
                      <span className="text-[11px] text-gray-400 font-medium shrink-0">
                        {searchInChat.trim() ? activeChatMessages.filter((m) => m.text.toLowerCase().includes(searchInChat.toLowerCase())).length : activeChatMessages.length} encontrada(s)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearchInChatOpen(false);
                        setSearchInChat('');
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                      title="Fechar pesquisa"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

              {/* Feedback toast */}
              {sendFeedback && (
                <div
                  className={`p-2.5 mx-4 mt-2 rounded-lg text-xs flex items-center justify-between shadow-2xs ${
                    sendFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {sendFeedback.type === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span>{sendFeedback.text}</span>
                  </div>
                  <button onClick={() => setSendFeedback(null)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Messages Scroll Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[400px] max-h-[460px]">
                {displayedMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-white/80 shadow-xs flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-xs font-semibold text-gray-700">
                      {searchInChat ? 'Nenhuma mensagem encontrada' : 'Inicie uma conversa com este contato'}
                    </p>
                    <p className="text-[11px] text-gray-500 max-w-xs mt-1">
                      {searchInChat
                        ? `Nenhuma mensagem contendo "${searchInChat}".`
                        : 'Envie uma mensagem personalizada ou selecione um template pré-definido abaixo.'}
                    </p>
                  </div>
                ) : (
                  displayedMessages.map((msg) => {
                    const isMe = msg.sender === 'me';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] sm:max-w-[65%] rounded-2xl p-3 shadow-2xs text-xs space-y-1 ${
                            isMe
                              ? 'bg-emerald-600 text-white rounded-br-xs'
                              : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words leading-relaxed">
                            {msg.text}
                          </p>

                          <div
                            className={`flex items-center justify-end gap-1 text-[10px] ${
                              isMe ? 'text-emerald-100' : 'text-gray-400'
                            }`}
                          >
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>

                            {isMe && (
                              <span>
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3 h-3 text-cyan-200" />
                                ) : msg.status === 'sent' ? (
                                  <Check className="w-3 h-3 text-emerald-200" />
                                ) : msg.status === 'failed' ? (
                                  <AlertCircle className="w-3 h-3 text-red-300" title={msg.error} />
                                ) : (
                                  <Clock className="w-3 h-3 text-emerald-200 animate-spin" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input & Quick Template bar */}
              <div className="p-3 bg-white border-t border-gray-200 space-y-2">
                {/* Fast Action Buttons: Templates & Spintax */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Pre-defined template selector */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Inserir Template</span>
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                      </button>

                      {showTemplateMenu && (
                        <div className="absolute bottom-8 left-0 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 z-30 divide-y divide-gray-100">
                          <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Templates Pré-definidos
                          </div>
                          <div className="max-h-48 overflow-y-auto py-1">
                            {templates.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => {
                                  // Replace {nome} with contact name
                                  let replaced = tpl.content.replace(/\{nome\}/gi, activeChat.name.split(' ')[0] || 'amigo');
                                  setInputText(replaced);
                                  setShowTemplateMenu(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-emerald-50 text-gray-700 hover:text-emerald-900 transition flex flex-col"
                              >
                                <span className="font-semibold">{tpl.title}</span>
                                <span className="text-[10px] text-gray-400 truncate">{tpl.content}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                      Enter para enviar • Shift+Enter para quebra de linha
                    </span>
                  </div>

                  <div className="text-[10px] text-gray-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Evolution API WhatsApp</span>
                  </div>
                </div>

                {/* Input Textarea & Send Button */}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Escreva uma mensagem para ${activeChat.name}...`}
                    className="flex-1 p-2.5 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                  />

                  <button
                    id="btn-send-message"
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={isSending || !inputText.trim()}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isSending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Enviar</span>
                        <Send className="w-3.5 h-3.5 -rotate-12" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* WHATSAPP WEB STYLE "DADOS DO CONTATO" DRAWER */}
            {contactInfoOpen && activeChat && (
                <div
                  id="drawer-dados-do-contato"
                  className="absolute sm:relative inset-0 sm:inset-auto w-full sm:w-80 md:w-96 border-l border-gray-200 bg-[#f0f2f5] flex flex-col h-full overflow-y-auto shrink-0 z-30 shadow-lg animate-in slide-in-from-right duration-200 text-gray-800 select-none"
                >
                  {/* Drawer Header */}
                  <div className="h-[60px] bg-[#f0f2f5] px-4 flex items-center gap-4 border-b border-gray-200 shrink-0 sticky top-0 z-10">
                    <button
                      type="button"
                      id="btn-close-drawer-dados"
                      onClick={() => setContactInfoOpen(false)}
                      className="p-1.5 hover:bg-gray-200/80 rounded-full transition text-gray-600 cursor-pointer"
                      title="Fechar dados do contato"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <h3 className="font-semibold text-sm text-gray-800">
                      {activeChat.isGroup ? 'Dados do grupo' : 'Dados do contato'}
                    </h3>
                  </div>

                  <div className="p-4 space-y-3 pb-8">
                    {/* Section 1: Hero Avatar & Identity Card (WhatsApp Web Exact Replica) */}
                    <div className="bg-white rounded-xl p-5 shadow-2xs border border-gray-200/70 flex flex-col items-center text-center">
                      {/* Large Avatar Photo */}
                      <div
                        className="relative group/avatar cursor-pointer"
                        onClick={() => {
                          if (activeChat.avatarUrl) {
                            setPhotoZoomUrl(activeChat.avatarUrl);
                          }
                        }}
                        title={activeChat.avatarUrl ? 'Clique para ampliar a foto' : 'Foto do perfil do WhatsApp'}
                      >
                        {activeChat.avatarUrl ? (
                          <img
                            src={activeChat.avatarUrl}
                            alt={activeChat.name}
                            className="w-28 h-28 rounded-full object-cover shadow-sm border-2 border-white ring-2 ring-emerald-500/20 group-hover/avatar:opacity-90 transition"
                          />
                        ) : (
                          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-3xl flex items-center justify-center shadow-sm">
                            {activeChat.name ? activeChat.name.charAt(0).toUpperCase() : activeChat.phone.slice(-2)}
                          </div>
                        )}

                        {activeChat.avatarUrl && (
                          <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition text-white">
                            <ZoomIn className="w-6 h-6 drop-shadow" />
                          </div>
                        )}
                      </div>

                      {/* Push Name / Title */}
                      <div className="mt-3.5 space-y-1 w-full">
                        {/* Contact display name or phone */}
                        <h4 className="text-base font-bold text-gray-900 break-words">
                          {activeChat.name}
                        </h4>

                        {/* WhatsApp Public Push Name */}
                        {activeChat.pushName && !activeChat.isGroup && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                            <span>~{activeChat.pushName}</span>
                            <span className="text-[10px] text-emerald-600 font-normal">
                              (Nome público no WhatsApp)
                            </span>
                          </div>
                        )}

                        {/* Phone number */}
                        <p className="text-xs text-gray-500 font-mono flex items-center justify-center gap-1.5 pt-0.5">
                          <span>{activeChat.phone}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(activeChat.phone)}
                            className="p-1 text-gray-400 hover:text-emerald-600 rounded transition cursor-pointer"
                            title="Copiar telefone"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {copiedPhone && (
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              Copiado!
                            </span>
                          )}
                        </p>

                        {/* Unsaved vs Saved Status Badge */}
                        <div className="pt-2 flex items-center justify-center gap-1.5">
                          {activeContact ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              <UserCheck className="w-3 h-3" />
                              Contato Salvo na Agenda
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300">
                              <UserPlus className="w-3 h-3 text-amber-700" />
                              Contato não salvo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Action Buttons (Audio, Video, Search, Save) */}
                      <div className="grid grid-cols-4 gap-2 w-full mt-4 pt-3 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => setCallModal({ open: true, type: 'audio', name: activeChat.pushName || activeChat.name, phone: activeChat.phone })}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-emerald-700 transition cursor-pointer group/btn"
                          title="Fazer chamada de voz"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover/btn:bg-emerald-100 flex items-center justify-center transition">
                            <Phone className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-[10px] font-medium text-gray-600">Áudio</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCallModal({ open: true, type: 'video', name: activeChat.pushName || activeChat.name, phone: activeChat.phone })}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-emerald-700 transition cursor-pointer group/btn"
                          title="Fazer chamada de vídeo"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover/btn:bg-emerald-100 flex items-center justify-center transition">
                            <Video className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-[10px] font-medium text-gray-600">Vídeo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsSearchInChatOpen(true);
                          }}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-emerald-700 transition cursor-pointer group/btn"
                          title="Pesquisar mensagens nesta conversa"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover/btn:bg-emerald-100 flex items-center justify-center transition">
                            <Search className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-[10px] font-medium text-gray-600">Pesquisar</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenContactModal}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-emerald-700 transition cursor-pointer group/btn"
                          title={activeContact ? 'Editar contato' : 'Adicionar aos contatos'}
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover/btn:bg-emerald-100 flex items-center justify-center transition">
                            {activeContact ? (
                              <UserCheck className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <UserPlus className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-gray-600">
                            {activeContact ? 'Editar' : 'Salvar'}
                          </span>
                        </button>

                        {activeContact && (
                          <button
                            type="button"
                            onClick={() => {
                              downloadVCard([activeContact], `contato_${activeContact.name.toLowerCase().replace(/\s+/g, '_')}.vcf`);
                              setSendFeedback({
                                type: 'success',
                                text: `Cartão de contato de "${activeContact.name}" baixado para o seu celular!`,
                              });
                              setTimeout(() => setSendFeedback(null), 3500);
                            }}
                            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-blue-50 text-blue-700 transition cursor-pointer group/btn"
                            title="Baixar contato em arquivo .vcf para salvar na agenda do celular"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-50 group-hover/btn:bg-blue-100 flex items-center justify-center transition">
                              <Smartphone className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-[10px] font-medium text-blue-700">P/ Celular</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Section 2: "Recado" (About / Bio) */}
                    <div className="bg-white rounded-xl p-4 shadow-2xs border border-gray-200/70 space-y-1.5">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Recado
                      </p>
                      <p className="text-xs text-gray-800 font-medium leading-relaxed">
                        {activeChat.about || 'Disponível no WhatsApp'}
                      </p>
                    </div>

                    {/* Section 3: Telefone & Identificadores */}
                    <div className="bg-white rounded-xl p-4 shadow-2xs border border-gray-200/70 space-y-3">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Número de telefone
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-gray-900 font-mono">
                            {activeChat.phone}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {activeChat.jid || `${activeChat.phone.replace(/\D/g, '')}@s.whatsapp.net`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(activeChat.phone)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 flex items-center gap-1 transition cursor-pointer shrink-0"
                        >
                          <Copy className="w-3 h-3 text-gray-500" />
                          <span>Copiar</span>
                        </button>
                      </div>
                    </div>

                    {/* Section 4: Perfis Vinculados */}
                    <div className="bg-white rounded-xl p-4 shadow-2xs border border-gray-200/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                          Perfis Vinculados
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenContactModal}
                          className="text-[11px] text-emerald-600 hover:underline font-semibold cursor-pointer"
                        >
                          Gerenciar
                        </button>
                      </div>

                      {activeContact && activeContact.profileIds && activeContact.profileIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {activeContact.profileIds.map((pid) => {
                            const p = profiles.find((prof) => prof.id === pid);
                            if (!p) return null;
                            return (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                              >
                                <Users className="w-3 h-3 text-emerald-600" />
                                {p.name}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="pt-1">
                          <p className="text-xs text-gray-400 italic">
                            Nenhum perfil vinculado a este contato.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenContactModal}
                            className="mt-2 w-full py-1.5 px-3 rounded-lg border border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Salvar &amp; Vincular a um Perfil</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Section 5: Configurações e Ações Adicionais (WhatsApp Web Style) */}
                    <div className="bg-white rounded-xl p-2 shadow-2xs border border-gray-200/70 divide-y divide-gray-100 text-xs">
                      <button
                        type="button"
                        onClick={() => handleTogglePinChat(activeChat.id)}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 rounded-lg transition cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          {activeChat.isPinned ? (
                            <PinOff className="w-4 h-4 text-amber-600" />
                          ) : (
                            <Pin className="w-4 h-4 text-gray-500" />
                          )}
                          <span className="font-medium text-gray-700">
                            {activeChat.isPinned ? 'Desafixar conversa' : 'Fixar conversa'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-semibold">
                          {activeChat.isPinned ? 'Fixada' : 'Não'}
                        </span>
                      </button>

                      <div className="px-3 py-2.5 flex items-center justify-between text-gray-500">
                        <div className="flex items-center gap-2.5">
                          <Lock className="w-4 h-4 text-emerald-600" />
                          <div>
                            <p className="font-medium text-gray-700">Criptografia de ponta a ponta</p>
                            <p className="text-[10px] text-gray-400">Mensagens e chamadas são protegidas</p>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deseja bloquear as mensagens de ${activeChat.name}?`)) {
                            setSendFeedback({ type: 'success', text: `Contato ${activeChat.name} bloqueado no simulador.` });
                          }
                        }}
                        className="w-full px-3 py-2.5 flex items-center gap-2.5 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer text-left font-medium"
                      >
                        <Ban className="w-4 h-4 text-red-500" />
                        <span>Bloquear {activeChat.pushName || activeChat.name}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">Selecione uma Conversa</h3>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                Escolha uma conversa na lista à esquerda para visualizar as mensagens trocadas, responder em tempo real ou vincular a um perfil.
              </p>
              <button
                onClick={() => setNewChatModalOpen(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Iniciar Nova Conversa</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Adicionar / Editar Contato e Vincular Perfis */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <UserPlus className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">
                  {activeContact ? 'Editar Contato & Perfis' : 'Adicionar aos Meus Contatos'}
                </h3>
              </div>
              <button
                onClick={() => setContactModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContactForm} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Nome do Contato</label>
                <input
                  type="text"
                  required
                  value={contactFormName}
                  onChange={(e) => setContactFormName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Telefone WhatsApp</label>
                <input
                  type="text"
                  required
                  value={contactFormPhone}
                  onChange={(e) => setContactFormPhone(e.target.value)}
                  placeholder="+55 11 99999-8888"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Notas / Observações</label>
                <textarea
                  rows={2}
                  value={contactFormNotes}
                  onChange={(e) => setContactFormNotes(e.target.value)}
                  placeholder="Ex: Interessado em disparos e automações..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* Profiles Selection */}
              <div>
                <label className="block text-gray-700 font-semibold mb-2 flex items-center justify-between">
                  <span>Vincular a Perfis de Disparo</span>
                  <span className="text-[10px] text-emerald-600 font-normal">
                    {contactFormProfiles.length} selecionados
                  </span>
                </label>

                {profiles.length === 0 ? (
                  <p className="text-gray-400 text-xs italic">Nenhum perfil cadastrado.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                    {profiles.map((p) => {
                      const isChecked = contactFormProfiles.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white cursor-pointer transition text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setContactFormProfiles([...contactFormProfiles, p.id]);
                              } else {
                                setContactFormProfiles(contactFormProfiles.filter((id) => id !== p.id));
                              }
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="font-semibold text-gray-800">{p.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto truncate max-w-[140px]">
                            {p.description}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Synchronize to Phone (vCard) option */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 space-y-1.5">
                <label className="flex items-start gap-2 text-xs font-semibold text-blue-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoExportVCard}
                    onChange={(e) => setAutoExportVCard(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Baixar cartão (.vcf) para salvar no celular
                  </span>
                </label>
                <p className="text-[11px] text-blue-800/90 pl-5 leading-relaxed">
                  Ao marcar esta opção, um arquivo de contato será baixado automaticamente para você abrir ou enviar para o seu smartphone.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Contato</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Iniciar Nova Conversa */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <MessageSquare className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">Iniciar Nova Conversa</h3>
              </div>
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartNewChat} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Número do WhatsApp (com DDD)
                </label>
                <input
                  type="text"
                  required
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  placeholder="Ex: 5511999998888 ou 11988887777"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Informe o número completo para envio direto pelo WhatsApp conectado.
                </p>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Nome do Contato (Opcional)
                </label>
                <input
                  type="text"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="Ex: Ana Paula Consultora"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Primeira Mensagem (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newChatInitialMsg}
                  onChange={(e) => setNewChatInitialMsg(e.target.value)}
                  placeholder="Ex: Olá! Tudo bem? Estou entrando em contato sobre..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setNewChatModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Abrir Conversa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Foto Ampliada do Perfil (WhatsApp Web Fullscreen Preview) */}
      {photoZoomUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setPhotoZoomUrl(null)}
        >
          <div
            className="relative max-w-md w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white mb-3 px-2">
              <span className="text-xs font-semibold text-gray-300">
                Foto do Perfil · {activeChat?.pushName || activeChat?.name}
              </span>
              <button
                type="button"
                onClick={() => setPhotoZoomUrl(null)}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={photoZoomUrl}
              alt="Foto do perfil ampliada"
              className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            <p className="text-gray-400 text-xs mt-3">
              Toque fora ou clique no X para fechar
            </p>
          </div>
        </div>
      )}

      {/* MODAL: Chamada de Áudio / Vídeo simulada */}
      {callModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setCallModal({ open: false, type: 'audio', name: '', phone: '' })}
        >
          <div
            className="bg-slate-900 text-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-800 flex flex-col items-center text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center animate-pulse">
              {callModal.type === 'video' ? (
                <Video className="w-9 h-9 text-emerald-400" />
              ) : (
                <Phone className="w-9 h-9 text-emerald-400" />
              )}
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">
                {callModal.name}
              </h4>
              <p className="text-xs text-slate-400 font-mono">
                {callModal.phone}
              </p>
              <p className="text-xs text-emerald-400 font-medium">
                Chamando via WhatsApp...
              </p>
            </div>

            <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              O WhatsApp Web conectado está iniciando a chamada de {callModal.type === 'video' ? 'vídeo' : 'voz'}.
            </p>

            <button
              type="button"
              onClick={() => setCallModal({ open: false, type: 'audio', name: '', phone: '' })}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer"
            >
              Encerrar Chamada
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
