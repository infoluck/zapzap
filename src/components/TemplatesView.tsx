import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  Sparkles, 
  CheckCircle2, 
  Copy, 
  MessageSquare, 
  Variable, 
  Clock, 
  Tag, 
  Zap,
  Info
} from 'lucide-react';
import { MessageTemplate } from '../types';
import { resolveSpintax, resolveVariables } from '../lib/antiBanEngine';

interface TemplatesViewProps {
  templates: MessageTemplate[];
  onSaveTemplates: (templates: MessageTemplate[]) => void;
  onSelectForCampaign: (templateId: string) => void;
}

const SAMPLE_CONTACT = {
  id: 'preview_1',
  name: 'Mariana Silva',
  phone: '+55 11 98452-1102',
  profileIds: ['prof_vip'],
  addedAt: new Date().toISOString(),
};

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  templates,
  onSaveTemplates,
  onSelectForCampaign,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<string>('Vendas & Promoção');
  const [content, setContent] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showFeedback = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleOpenNew = () => {
    setEditingTemplate(null);
    setTitle('');
    setCategory('Vendas & Promoção');
    setContent(
      '{Olá|Oi|Oi tudo bem}, {primeiro_nome}! {Passando para te avisar que|Gostaria de informar que:} temos novidades exclusivas para seu perfil ({perfil}). Responda aqui para conferir! 🚀'
    );
    setShowModal(true);
  };

  const handleEdit = (tpl: MessageTemplate) => {
    setEditingTemplate(tpl);
    setTitle(tpl.title);
    setCategory(tpl.category);
    setContent(tpl.content);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (templates.length <= 1) {
      alert('Mantenha ao menos uma mensagem cadastrada para os disparos.');
      return;
    }
    if (!confirm('Deseja excluir esta mensagem pré-definida?')) return;
    const updated = templates.filter((t) => t.id !== id);
    onSaveTemplates(updated);
    showFeedback('Mensagem excluída com sucesso.');
  };

  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) {
      setContent((prev) => prev + ' ' + tag);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = content;
    const updated = current.substring(0, start) + tag + current.substring(end);
    setContent(updated);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (editingTemplate) {
      const updated = templates.map((t) =>
        t.id === editingTemplate.id
          ? { ...t, title: title.trim(), category, content: content.trim() }
          : t
      );
      onSaveTemplates(updated);
      showFeedback('Mensagem pré-definida atualizada!');
    } else {
      const newTpl: MessageTemplate = {
        id: `tpl_${Date.now()}`,
        title: title.trim(),
        category,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      onSaveTemplates([...templates, newTpl]);
      showFeedback('Nova mensagem cadastrada com sucesso!');
    }

    setShowModal(false);
  };

  // Real-time preview calculation
  const previewText = resolveVariables(
    resolveSpintax(content),
    SAMPLE_CONTACT,
    'Clientes VIP'
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {notification && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-md text-sm flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-5 h-5" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Mensagens Pré-definidas &amp; Templates
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cadastre modelos com variáveis dinâmicas e blocos Spintax para mesclagem anti-bloqueio.
          </p>
        </div>

        <button
          id="btn-new-template"
          onClick={handleOpenNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Nova Mensagem
        </button>
      </div>

      {/* Anti-Ban Explanation Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="text-xs text-emerald-950 space-y-1">
          <h4 className="font-bold text-sm text-emerald-900">
            Dica para Proteção Anti-Bloqueio do WhatsApp
          </h4>
          <p className="text-emerald-800 leading-relaxed">
            Utilize o recurso de <strong>Spintax</strong> inserindo variações entre chaves: <code className="bg-white/80 px-1.5 py-0.5 rounded text-emerald-900 font-mono">&#123;Olá|Oi|Oi tudo bem&#125;</code>.
            Ao realizar disparos em massa, o sistema mescla as mensagens para que <strong>cada contato receba um texto único</strong>, ofuscando o algoritmo anti-spam do WhatsApp.
          </p>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {templates.map((tpl) => {
          const hasSpintax = tpl.content.includes('{') && tpl.content.includes('|');
          return (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs hover:border-gray-300 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                      {tpl.category}
                    </span>
                    <h3 className="text-sm font-bold text-gray-900 leading-snug">
                      {tpl.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(tpl)}
                      className="text-gray-400 hover:text-gray-700 p-1 rounded-md"
                      title="Editar mensagem"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      className="text-gray-400 hover:text-red-600 p-1 rounded-md"
                      title="Excluir mensagem"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content preview */}
                <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap line-clamp-4 border border-gray-100">
                  {tpl.content}
                </div>

                {/* Feature tags */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {hasSpintax && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      <Sparkles className="w-3 h-3" /> Anti-Ban Spintax
                    </span>
                  )}
                  {tpl.content.includes('{nome}') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <Variable className="w-3 h-3" /> {`{nome}`}
                    </span>
                  )}
                  {tpl.content.includes('{saudacao}') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" /> Saudação por Horário
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  Criado em {new Date(tpl.createdAt).toLocaleDateString('pt-BR')}
                </span>

                <button
                  onClick={() => onSelectForCampaign(tpl.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-xs font-semibold transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Usar em Disparo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add or Edit Template */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                {editingTemplate ? 'Editar Mensagem Pré-definida' : 'Cadastrar Nova Mensagem Pré-definida'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                    Título / Identificação do Modelo *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Campanha de Black Friday, Lembrete Mensal..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Vendas & Promoção">Vendas &amp; Promoção</option>
                    <option value="Relacionamento">Relacionamento</option>
                    <option value="Suporte">Suporte</option>
                    <option value="Cobrança">Cobrança</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Boas-Vindas">Boas-Vindas</option>
                  </select>
                </div>
              </div>

              {/* Tag Insertion helpers */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center justify-between">
                  <span>Variáveis Dinâmicas &amp; Spintax (Clique para Inserir)</span>
                  <span className="text-gray-400 font-normal lowercase">inserção automática</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{primeiro_nome}')}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;primeiro_nome&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{nome}')}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;nome&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{saudacao}')}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;saudacao&#125; (Bom dia/tarde/noite)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{perfil}')}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;perfil&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{telefone}')}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;telefone&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{protocolo}')}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-mono font-medium transition cursor-pointer"
                  >
                    + &#123;protocolo&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{Olá|Oi|Oi tudo bem}')}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-xs font-mono font-semibold transition cursor-pointer"
                  >
                    + Spintax &#123;Opção A|Opção B&#125;
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Texto da Mensagem *
                </label>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder="Digite o conteúdo da mensagem..."
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono leading-relaxed"
                  required
                />
              </div>

              {/* WhatsApp Live Simulator Preview */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prévia em Tempo Real (Como o cliente receberá no WhatsApp):
                </label>
                <div className="bg-[#e5ddd5] p-4 rounded-xl border border-gray-200 shadow-inner">
                  <div className="max-w-md bg-white p-3.5 rounded-xl rounded-tl-none shadow-xs text-xs text-gray-900 leading-relaxed whitespace-pre-wrap relative">
                    {previewText || 'Digite o texto acima para visualizar...'}
                    <div className="text-[10px] text-gray-400 text-right mt-1.5 flex items-center justify-end gap-1">
                      <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-blue-500 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  {editingTemplate ? 'Salvar Alterações' : 'Cadastrar Mensagem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
