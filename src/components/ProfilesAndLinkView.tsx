import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  FolderPlus, 
  Edit3, 
  Send, 
  CheckCircle2, 
  UserCheck, 
  UserMinus, 
  Filter, 
  Sparkles,
  Phone,
  Tag,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Download,
  Smartphone
} from 'lucide-react';
import { Contact, ContactProfile, WhatsAppSession, GatewayConfig } from '../types';
import { downloadVCard } from '../lib/vcard';

interface ProfilesAndLinkViewProps {
  profiles: ContactProfile[];
  contacts: Contact[];
  session?: WhatsAppSession;
  gatewayConfig?: GatewayConfig;
  isSyncingContacts?: boolean;
  onSyncWhatsAppContacts?: () => Promise<{ count: number; message: string }>;
  onSaveProfiles: (profiles: ContactProfile[]) => void;
  onSaveContacts: (contacts: Contact[]) => void;
  onNavigateToCampaign: (profileId: string) => void;
  onNavigateToConnection?: () => void;
}

const PRESET_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b', // slate
];

export const ProfilesAndLinkView: React.FC<ProfilesAndLinkViewProps> = ({
  profiles,
  contacts,
  session,
  gatewayConfig,
  isSyncingContacts = false,
  onSyncWhatsAppContacts,
  onSaveProfiles,
  onSaveContacts,
  onNavigateToCampaign,
  onNavigateToConnection,
}) => {
  // Selected active profile for management & linking
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    profiles[0]?.id || ''
  );

  // Filter query for contacts to link
  const [nameFilter, setNameFilter] = useState<string>('');

  // Selected contact IDs for linking (from filtered list)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Selected contact IDs already in profile for unlinking
  const [selectedLinkedContactIds, setSelectedLinkedContactIds] = useState<Set<string>>(new Set());

  // Modals state
  const [showNewProfileModal, setShowNewProfileModal] = useState<boolean>(false);
  const [showNewContactModal, setShowNewContactModal] = useState<boolean>(false);
  const [showUnlinkAllModal, setShowUnlinkAllModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<ContactProfile | null>(null);

  // Form states for new profile
  const [profileName, setProfileName] = useState<string>('');
  const [profileDesc, setProfileDesc] = useState<string>('');
  const [profileColor, setProfileColor] = useState<string>(PRESET_COLORS[0]);

  // Form states for new contact
  const [newContactName, setNewContactName] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [newContactNotes, setNewContactNotes] = useState<string>('');

  // Feedback banner
  const [notification, setNotification] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || profiles[0],
    [profiles, selectedProfileId]
  );

  // Contacts currently linked to this profile
  const linkedContacts = useMemo(() => {
    if (!currentProfile) return [];
    return contacts.filter((c) => c.profileIds.includes(currentProfile.id));
  }, [contacts, currentProfile]);

  // Filtered contacts by name for the linking screen
  const filteredContacts = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(query) || c.phone.includes(query)
    );
  }, [contacts, nameFilter]);

  // Check if all filtered contacts are checked
  const allFilteredSelected = useMemo(() => {
    if (filteredContacts.length === 0) return false;
    return filteredContacts.every((c) => selectedContactIds.has(c.id));
  }, [filteredContacts, selectedContactIds]);

  // Toggle selection for all filtered contacts
  const handleToggleSelectAllFiltered = () => {
    const nextSet = new Set(selectedContactIds);
    if (allFilteredSelected) {
      // Uncheck all currently visible
      filteredContacts.forEach((c) => nextSet.delete(c.id));
    } else {
      // Check all currently visible
      filteredContacts.forEach((c) => nextSet.add(c.id));
    }
    setSelectedContactIds(nextSet);
  };

  // Toggle single contact selection
  const handleToggleContact = (id: string) => {
    const nextSet = new Set(selectedContactIds);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    setSelectedContactIds(nextSet);
  };

  // Perform Link: Add selected contacts to the active profile
  const handleLinkSelectedToProfile = () => {
    if (!currentProfile) return;
    if (selectedContactIds.size === 0) {
      showFeedback('Selecione ao menos um contato para vincular.');
      return;
    }

    let addedCount = 0;
    const updatedContacts = contacts.map((contact) => {
      if (selectedContactIds.has(contact.id)) {
        if (!contact.profileIds.includes(currentProfile.id)) {
          addedCount++;
          return {
            ...contact,
            profileIds: [...contact.profileIds, currentProfile.id],
          };
        }
      }
      return contact;
    });

    onSaveContacts(updatedContacts);
    setSelectedContactIds(new Set());
    showFeedback(
      `Sucesso! ${addedCount} novo(s) contato(s) vinculado(s) ao perfil "${currentProfile.name}".`
    );
  };

  // Unlink selected contacts from current profile
  const handleUnlinkSelected = () => {
    if (!currentProfile || selectedLinkedContactIds.size === 0) return;

    const count = selectedLinkedContactIds.size;
    const updatedContacts = contacts.map((contact) => {
      if (selectedLinkedContactIds.has(contact.id)) {
        return {
          ...contact,
          profileIds: contact.profileIds.filter((pid) => pid !== currentProfile.id),
        };
      }
      return contact;
    });

    onSaveContacts(updatedContacts);
    setSelectedLinkedContactIds(new Set());
    showFeedback(`${count} contato(s) desvinculado(s) do perfil "${currentProfile.name}".`);
  };

  // Check if all linked contacts are selected
  const allLinkedSelected = useMemo(() => {
    if (linkedContacts.length === 0) return false;
    return linkedContacts.every((c) => selectedLinkedContactIds.has(c.id));
  }, [linkedContacts, selectedLinkedContactIds]);

  // Toggle selection of all linked contacts
  const handleToggleSelectAllLinked = () => {
    if (allLinkedSelected) {
      setSelectedLinkedContactIds(new Set());
    } else {
      const allIds = new Set<string>();
      linkedContacts.forEach((c) => allIds.add(c.id));
      setSelectedLinkedContactIds(allIds);
    }
  };

  // Unlink ALL contacts from current profile
  const handleUnlinkAllFromProfile = () => {
    if (!currentProfile) return;
    const count = linkedContacts.length;
    if (count === 0) return;

    const updatedContacts = contacts.map((c) => {
      if (c.profileIds.includes(currentProfile.id)) {
        return {
          ...c,
          profileIds: c.profileIds.filter((pid) => pid !== currentProfile.id),
        };
      }
      return c;
    });

    onSaveContacts(updatedContacts);
    setSelectedLinkedContactIds(new Set());
    setShowUnlinkAllModal(false);
    showFeedback(
      `Todos os ${count} contatos foram desvinculados do perfil "${currentProfile.name}" com sucesso.`
    );
  };

  // Save new profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    if (editingProfile) {
      const updated = profiles.map((p) =>
        p.id === editingProfile.id
          ? { ...p, name: profileName.trim(), description: profileDesc.trim(), color: profileColor }
          : p
      );
      onSaveProfiles(updated);
      showFeedback(`Perfil "${profileName}" atualizado com sucesso!`);
    } else {
      const newProf: ContactProfile = {
        id: `prof_${Date.now()}`,
        name: profileName.trim(),
        description: profileDesc.trim(),
        color: profileColor,
        createdAt: new Date().toISOString(),
      };
      onSaveProfiles([...profiles, newProf]);
      setSelectedProfileId(newProf.id);
      showFeedback(`Perfil "${newProf.name}" cadastrado com sucesso!`);
    }

    setShowNewProfileModal(false);
    setEditingProfile(null);
    setProfileName('');
    setProfileDesc('');
  };

  // Delete profile
  const handleDeleteProfile = (profileId: string) => {
    if (profiles.length <= 1) {
      alert('É necessário manter pelo menos um perfil cadastrado.');
      return;
    }
    const profToDelete = profiles.find((p) => p.id === profileId);
    if (!confirm(`Deseja realmente remover o perfil "${profToDelete?.name}"?`)) return;

    const updatedProfiles = profiles.filter((p) => p.id !== profileId);
    // Remove profileId from all contacts
    const updatedContacts = contacts.map((c) => ({
      ...c,
      profileIds: c.profileIds.filter((pid) => pid !== profileId),
    }));

    onSaveProfiles(updatedProfiles);
    onSaveContacts(updatedContacts);
    setSelectedProfileId(updatedProfiles[0].id);
    showFeedback(`Perfil removido com sucesso.`);
  };

  // Add new contact
  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;

    const newContact: Contact = {
      id: `c_${Date.now()}`,
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      notes: newContactNotes.trim(),
      profileIds: currentProfile ? [currentProfile.id] : [],
      addedAt: new Date().toISOString(),
    };

    onSaveContacts([...contacts, newContact]);
    setShowNewContactModal(false);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactNotes('');
    showFeedback(`Contato "${newContact.name}" adicionado e vinculado!`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-md text-sm flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-emerald-100 hover:text-white text-xs font-bold px-2 py-0.5"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Profiles Bar & Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Perfis de Contatos
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Organize seus contatos por perfil para segmentação e disparos assertivos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSyncWhatsAppContacts && (
              <button
                id="btn-sync-wpp-contacts-top"
                onClick={async () => {
                  const res = await onSyncWhatsAppContacts();
                  if (res.count > 0) {
                    showFeedback(`✅ ${res.message}`);
                  } else {
                    showFeedback(res.message);
                  }
                }}
                disabled={isSyncingContacts}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                title="Puxar todos os contatos da sua conta conectada no WhatsApp"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin text-emerald-600' : 'text-emerald-700'}`} />
                {isSyncingContacts ? 'Sincronizando...' : 'Sincronizar WhatsApp'}
              </button>
            )}
            <button
              id="btn-export-contacts-vcard"
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
              title="Exportar contatos para o seu celular (arquivo .vcf para WhatsApp / Agenda)"
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>Exportar p/ Celular (.vcf)</span>
            </button>
            <button
              id="btn-create-new-contact"
              onClick={() => setShowNewContactModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-gray-600" />
              Novo Contato
            </button>
            <button
              id="btn-create-new-profile"
              onClick={() => {
                setEditingProfile(null);
                setProfileName('');
                setProfileDesc('');
                setProfileColor(PRESET_COLORS[0]);
                setShowNewProfileModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Cadastrar Perfil
            </button>
          </div>
        </div>

        {/* Profile pills selector */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
          {profiles.map((prof) => {
            const isSelected = prof.id === selectedProfileId;
            const count = contacts.filter((c) => c.profileIds.includes(prof.id)).length;
            return (
              <button
                key={prof.id}
                onClick={() => {
                  setSelectedProfileId(prof.id);
                  setSelectedContactIds(new Set());
                  setSelectedLinkedContactIds(new Set());
                }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: prof.color }}
                />
                <span className="truncate max-w-[140px]">{prof.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isSelected
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Profile Banner with Actions */}
      {currentProfile && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
              style={{ backgroundColor: currentProfile.color }}
            >
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  Perfil Atual: {currentProfile.name}
                </h3>
                <button
                  onClick={() => {
                    setEditingProfile(currentProfile);
                    setProfileName(currentProfile.name);
                    setProfileDesc(currentProfile.description);
                    setProfileColor(currentProfile.color);
                    setShowNewProfileModal(true);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Editar dados deste perfil"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {profiles.length > 1 && (
                  <button
                    onClick={() => handleDeleteProfile(currentProfile.id)}
                    className="text-gray-400 hover:text-red-600 p-1"
                    title="Excluir perfil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {currentProfile.description || 'Sem descrição cadastrada.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-center">
            <div className="text-right">
              <span className="text-xs text-gray-500 block">Contatos Vinculados</span>
              <span className="text-sm font-bold text-gray-900">
                {linkedContacts.length} contato(s)
              </span>
            </div>

            {linkedContacts.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  id="btn-unlink-all-profile-banner"
                  onClick={() => setShowUnlinkAllModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                  title="Desvincular todos os contatos associados a este perfil"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  Desvincular Todos
                </button>
                <button
                  id="btn-fast-dispatch-profile"
                  onClick={() => onNavigateToCampaign(currentProfile.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Disparar para este Perfil
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart WhatsApp Contact Sync Banner */}
      {session?.status === 'connected' && onSyncWhatsAppContacts && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <span>WhatsApp Conectado ({session.pushName || 'Sua Conta'})</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                  Online
                </span>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                Clique no botão ao lado para importar todos os contatos salvos no seu WhatsApp diretamente para a sua lista.
              </p>
            </div>
          </div>
          <button
            id="btn-sync-wpp-contacts-banner"
            onClick={async () => {
              const res = await onSyncWhatsAppContacts();
              if (res.count > 0) {
                showFeedback(`✅ ${res.message}`);
              } else {
                showFeedback(res.message);
              }
            }}
            disabled={isSyncingContacts}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`} />
            {isSyncingContacts ? 'Sincronizando...' : 'Sincronizar Contatos do WhatsApp'}
          </button>
        </div>
      )}

      {/* Main Linking Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filter and Select Contacts to Link */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col">
          {/* Header of Column 1 */}
          <div className="p-5 border-b border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  Vincular Contatos ao Perfil &ldquo;{currentProfile?.name}&rdquo;
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Filtre por nome, marque um, vários ou todos os filtrados e envie para a lista do perfil.
                </p>
              </div>

              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[11px] font-semibold">
                {filteredContacts.length} de {contacts.length}
              </span>
            </div>

            {/* Filter Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="filter-contacts-input"
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filtrar por nome do contato ou telefone..."
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50/50 focus:bg-white transition"
              />
              {nameFilter && (
                <button
                  onClick={() => setNameFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1 py-0.5"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Selection controls & Master Checkbox */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                id="select-all-filtered-checkbox"
                onClick={handleToggleSelectAllFiltered}
                disabled={filteredContacts.length === 0}
                className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900 font-semibold cursor-pointer disabled:opacity-50"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
                <span>
                  {allFilteredSelected
                    ? 'Desmarcar todos os filtrados'
                    : `Marcar todos os (${filteredContacts.length}) contatos filtrados`}
                </span>
              </button>

              <span className="text-gray-500 font-medium">
                {selectedContactIds.size} selecionado(s)
              </span>
            </div>
          </div>

          {/* Filtered Contacts List */}
          <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto flex-1">
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 space-y-2">
                <Filter className="w-8 h-8 mx-auto text-gray-300" />
                <p className="text-sm font-medium">Nenhum contato encontrado com o filtro &ldquo;{nameFilter}&rdquo;</p>
                <button
                  onClick={() => setNameFilter('')}
                  className="text-xs text-emerald-600 font-semibold hover:underline"
                >
                  Limpar filtro de busca
                </button>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContactIds.has(contact.id);
                const isAlreadyLinked = currentProfile
                  ? contact.profileIds.includes(currentProfile.id)
                  : false;

                return (
                  <div
                    key={contact.id}
                    onClick={() => handleToggleContact(contact.id)}
                    className={`p-3.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition cursor-pointer ${
                      isSelected ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-300" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {contact.name}
                          </span>
                          {isAlreadyLinked && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> Já vinculado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {contact.phone}
                          </span>
                          {contact.notes && (
                            <span className="truncate max-w-[180px] text-gray-400 hidden sm:inline">
                              • {contact.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Associated profile badges */}
                    <div className="flex items-center gap-1 shrink-0">
                      {contact.profileIds.map((pid) => {
                        const prof = profiles.find((p) => p.id === pid);
                        if (!prof) return null;
                        return (
                          <span
                            key={pid}
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: prof.color }}
                            title={prof.name}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Column 1 Action Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600">
              {selectedContactIds.size === 0 ? (
                'Nenhum contato marcado'
              ) : (
                <strong>{selectedContactIds.size} contato(s) selecionado(s)</strong>
              )}
            </span>

            <button
              id="btn-link-contacts-to-profile"
              onClick={handleLinkSelectedToProfile}
              disabled={selectedContactIds.size === 0 || !currentProfile}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4" />
              Vincular ao Perfil &ldquo;{currentProfile?.name}&rdquo;
            </button>
          </div>
        </div>

        {/* Right Column: Contacts Already Linked to This Profile */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-600" />
                Contatos Vinculados a este Perfil
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Lista atual de contatos no perfil &ldquo;{currentProfile?.name}&rdquo;.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold">
                {linkedContacts.length}
              </span>
              {linkedContacts.length > 0 && (
                <button
                  id="btn-unlink-all-header"
                  onClick={() => setShowUnlinkAllModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-semibold transition cursor-pointer border border-red-200 shrink-0"
                  title="Desvincular todos os contatos deste perfil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Desvincular Todos
                </button>
              )}
            </div>
          </div>

          {/* Linked Contacts Toolbar (Select all / count) */}
          {linkedContacts.length > 0 && (
            <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between text-xs">
              <button
                id="btn-toggle-select-all-linked"
                onClick={handleToggleSelectAllLinked}
                className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900 font-semibold cursor-pointer"
              >
                {allLinkedSelected ? (
                  <CheckSquare className="w-4 h-4 text-red-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
                <span>
                  {allLinkedSelected
                    ? 'Desmarcar todos'
                    : `Marcar todos (${linkedContacts.length})`}
                </span>
              </button>

              {selectedLinkedContactIds.size > 0 && (
                <span className="text-red-700 font-semibold text-[11px] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  {selectedLinkedContactIds.size} selecionado(s)
                </span>
              )}
            </div>
          )}

          {/* List of linked contacts */}
          <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto flex-1">
            {linkedContacts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 space-y-2">
                <Users className="w-8 h-8 mx-auto text-gray-300" />
                <p className="text-sm font-medium">Nenhum contato vinculado ainda</p>
                <p className="text-xs text-gray-400">
                  Filtre os contatos na coluna ao lado, marque-os e clique em Vincular.
                </p>
              </div>
            ) : (
              linkedContacts.map((contact) => {
                const isSelected = selectedLinkedContactIds.has(contact.id);
                return (
                  <div
                    key={contact.id}
                    onClick={() => {
                      const next = new Set(selectedLinkedContactIds);
                      if (next.has(contact.id)) next.delete(contact.id);
                      else next.add(contact.id);
                      setSelectedLinkedContactIds(next);
                    }}
                    className={`p-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition cursor-pointer ${
                      isSelected ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-red-600" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">
                          {contact.name}
                        </div>
                        <div className="text-[11px] text-gray-500">{contact.phone}</div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const updatedContacts = contacts.map((c) =>
                          c.id === contact.id
                            ? {
                                ...c,
                                profileIds: c.profileIds.filter(
                                  (pid) => pid !== currentProfile?.id
                                ),
                              }
                            : c
                        );
                        onSaveContacts(updatedContacts);
                        showFeedback(`"${contact.name}" desvinculado do perfil.`);
                      }}
                      className="text-gray-400 hover:text-red-600 p-1 rounded-md"
                      title="Desvincular deste perfil"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Column 2 Actions */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {selectedLinkedContactIds.size > 0
                ? `${selectedLinkedContactIds.size} selecionado(s) de ${linkedContacts.length}`
                : `Total: ${linkedContacts.length} contato(s)`}
            </span>

            <div className="flex items-center gap-2">
              {selectedLinkedContactIds.size > 0 && (
                <button
                  id="btn-unlink-selected-footer"
                  onClick={handleUnlinkSelected}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  Desvincular Marcados ({selectedLinkedContactIds.size})
                </button>
              )}

              {linkedContacts.length > 0 && (
                <button
                  id="btn-unlink-all-footer"
                  onClick={() => setShowUnlinkAllModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                  title="Desvincular todos os contatos deste perfil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Desvincular Todos
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: New / Edit Profile */}
      {showNewProfileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {editingProfile ? 'Editar Perfil de Contato' : 'Cadastrar Novo Perfil'}
              </h3>
              <button
                onClick={() => {
                  setShowNewProfileModal(false);
                  setEditingProfile(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Nome do Perfil *
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Ex: Clientes Premium, Leads Evento SP..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={profileDesc}
                  onChange={(e) => setProfileDesc(e.target.value)}
                  placeholder="Finalidade ou critérios deste perfil..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Cor de Identificação
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setProfileColor(color)}
                      className={`w-6 h-6 rounded-full transition cursor-pointer ${
                        profileColor === color ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProfileModal(false);
                    setEditingProfile(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  {editingProfile ? 'Salvar Alterações' : 'Criar Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Fast New Contact */}
      {showNewContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Adicionar Novo Contato</h3>
              <button
                onClick={() => setShowNewContactModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo Silveira"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Telefone / WhatsApp (com DDI e DDD) *
                </label>
                <input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="+55 11 98888-7777"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Observações / Empresa (Opcional)
                </label>
                <input
                  type="text"
                  value={newContactNotes}
                  onChange={(e) => setNewContactNotes(e.target.value)}
                  placeholder="Ex: Diretor de Operações"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {currentProfile && (
                <p className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg">
                  💡 Este contato será automaticamente vinculado ao perfil{' '}
                  <strong>&ldquo;{currentProfile.name}&rdquo;</strong>.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowNewContactModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  Salvar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Confirm Unlink All Contacts From Profile */}
      {showUnlinkAllModal && currentProfile && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Desvincular todos os contatos?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Perfil atual: <strong className="text-gray-800">&ldquo;{currentProfile.name}&rdquo;</strong>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1.5">
              <p>
                Você está prestes a desvincular todos os{' '}
                <strong>{linkedContacts.length} contato(s)</strong> vinculados a este perfil.
              </p>
              <p className="text-amber-800">
                ℹ️ <strong>Seus contatos não serão excluídos</strong> do sistema. Eles continuarão disponíveis na sua agenda geral e em outros perfis que já estejam associados.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                id="btn-cancel-unlink-all-modal"
                type="button"
                onClick={() => setShowUnlinkAllModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-unlink-all-modal"
                type="button"
                onClick={handleUnlinkAllFromProfile}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Sim, Desvincular Todos ({linkedContacts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Export Contacts to Phone (.vcf) */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Exportar Contatos para o Celular
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Gere um arquivo de cartão de contatos (.vcf) compatível com WhatsApp, Android e iPhone.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <span>📱 Por que exportar em arquivo .VCF?</span>
              </p>
              <p className="text-blue-800 leading-relaxed">
                As APIs do WhatsApp funcionam lendo os dados da sua conta e do aparelho. Para que novos contatos criados aqui fiquem salvos diretamente na agenda física do seu smartphone, basta baixar o arquivo <strong>.vcf</strong> e abri-lo no celular (ou enviar para o seu próprio WhatsApp e tocar nele). Seu celular importará todos com 1 clique!
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <p className="text-xs font-bold text-gray-700">Escolha o que deseja exportar:</p>

              {/* Option 1: All Contacts */}
              <button
                id="btn-export-all-contacts"
                onClick={() => {
                  downloadVCard(contacts, `todos_contatos_${contacts.length}.vcf`);
                  showFeedback(`✅ Arquivo com ${contacts.length} contatos baixado com sucesso!`);
                  setShowExportModal(false);
                }}
                disabled={contacts.length === 0}
                className="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 flex items-center justify-between transition cursor-pointer disabled:opacity-50"
              >
                <div>
                  <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
                    <span>Todos os Contatos da Agenda</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                      {contacts.length} contatos
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Exporta a lista completa de contatos cadastrados no sistema.
                  </p>
                </div>
                <Download className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
              </button>

              {/* Option 2: Current Profile Contacts */}
              {currentProfile && (
                <button
                  id="btn-export-profile-contacts"
                  onClick={() => {
                    downloadVCard(linkedContacts, `contatos_perfil_${currentProfile.name.toLowerCase().replace(/\s+/g, '_')}.vcf`);
                    showFeedback(`✅ ${linkedContacts.length} contatos do perfil "${currentProfile.name}" exportados!`);
                    setShowExportModal(false);
                  }}
                  disabled={linkedContacts.length === 0}
                  className="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 flex items-center justify-between transition cursor-pointer disabled:opacity-50"
                >
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: currentProfile.color }}
                      />
                      <span>Apenas do Perfil &ldquo;{currentProfile.name}&rdquo;</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                        {linkedContacts.length} contatos
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Exporta apenas os contatos vinculados a este perfil selecionado.
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
                </button>
              )}

              {/* Option 3: Selected Contacts */}
              {selectedContactIds.size > 0 && (
                <button
                  id="btn-export-selected-contacts"
                  onClick={() => {
                    const selContacts = contacts.filter((c) => selectedContactIds.has(c.id));
                    downloadVCard(selContacts, `contatos_selecionados_${selContacts.length}.vcf`);
                    showFeedback(`✅ ${selContacts.length} contatos selecionados exportados!`);
                    setShowExportModal(false);
                  }}
                  className="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 flex items-center justify-between transition cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
                      <span>Apenas Contatos Marcados</span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded-full">
                        {selectedContactIds.size} marcados
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Exporta apenas os contatos que você selecionou com as caixas de seleção.
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-purple-600 shrink-0 ml-2" />
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
