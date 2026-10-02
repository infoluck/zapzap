# 📱 WhatsApp Connect & Disparos — Documentação Técnica do Projeto & Guia de Transição (AI Handoff)

> **Documentação de Arquitetura, Design System, Cores, Telas, CRUDs, Menus e Regras de Negócio.**  
> Este documento foi elaborado especificamente para permitir que **qualquer inteligência artificial ou engenheiro de software assuma imediatamente a manutenção, evolução e suporte integral deste projeto sem perda de contexto.**

---

## 1. 🧭 Visão Geral e Propósito do Projeto

O **WhatsApp Connect & Disparos** é uma plataforma profissional full-stack voltada à **gestão de relacionamentos, atendimento em tempo real, segmentação de perfis de contatos e disparos em massa automatizados via WhatsApp** com tecnologia proprietária **Anti-Ban (Anti-Bloqueio)**.

### Principais Capacidades:
1. **Conexão WhatsApp Multi-Provedor:** Suporte nativo à **Evolution API** (Go/Node), **Z-API**, REST customizado e modo **Simulador**, permitindo autenticação via **QR Code** dinâmico e via **Código de Pareamento por Telefone** (Pairing Code).
2. **Minhas Conversas (Chat em Tempo Real):** Interface inspirada no WhatsApp Web com exibição de conversas ativas, contatos salvos e não salvos, mensagens fixadas (*Pin/Unpin*), recados/About, avatares, fotos em alta resolução, envio de mensagens diretas e exportação de contatos para cartão vCard (`.vcf`).
3. **Gestão de Perfis & Segmentação:** Agrupamento de contatos em múltiplos perfis personalizados (ex: *VIP, DATARODEO, Leads Quentes, Alunos, Financeiro*), com filtros avançados, vinculação e desvinculação em massa e cadastro manual ou via sincronização com a agenda do WhatsApp.
4. **Mensagens Pré-definidas (Templates com Spintax):** Criação e edição de modelos de mensagens com suporte a tags dinâmicas (`{nome}`, `{primeiro_nome}`, `{saudacao}`, `{perfil}`, `{protocolo}`, `{data}`) e variação léxica Spintax (`{Opção A|Opção B|Opção C}`).
5. **Disparo em Massa & Motor Anti-Ban:** Pipeline de envio em lote com rotação de mensagens (spinning), ofuscação algorítmica por injeção de micro-caracteres invisíveis (*Zero-Width Unicode*), atrasos humanizados aleatórios (*random delay*) e pausas preventivas configuráveis.
6. **Histórico e Relatórios:** Registro detalhado de cada disparo executado com logs individuais por contato, status de entrega, mensagens exatas enviadas e motivos de eventuais falhas.
7. **Persistência Híbrida (PostgreSQL Cloud SQL + LocalStorage Fallback):** Arquitetura resiliente com banco relacional PostgreSQL (via **Prisma ORM**) e sincronização com LocalStorage para disponibilidade contínua mesmo em caso de latência ou desconexão do banco de dados.

---

## 2. 🤖 Guia de Transição para Outra IA (Handoff Protocol)

Ao assumir este projeto, observe rigorosamente as seguintes diretrizes para manter a estabilidade do sistema:

### 2.1. Como Rodar e Compilar o Projeto
- **Iniciar em Desenvolvimento:**
  ```bash
  npm run dev
  ```
  *Executa `tsx server.ts` que sobe o servidor Express (porta do `.env`, padrão 3000; neste ambiente 3001) e acopla o Vite em modo middleware.*
- **Verificar Tipos e Erros de Código (Lint):**
  ```bash
  npm run lint
  ```
  *Executa `tsc --noEmit`.*
- **Build para Produção:**
  ```bash
  npm run build
  ```
  *Executa `prisma generate`, `vite build` e empacota o backend Node com `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`.*
- **Executar em Produção:**
  ```bash
  npm start
  ```
  *(Roda `node dist/server.cjs`).*

### 2.1.1. Banco de Dados (Prisma)
- Configure `DATABASE_URL` no `.env` (veja `.env.example`).
- Aplicar migrations em dev: `npm run db:migrate`; em produção: `npm run db:deploy`.
- Inspecionar dados: `npm run db:studio`.
- O schema fica em `prisma/schema.prisma` (mesmos nomes de tabelas/colunas do antigo Drizzle). O cliente é acessado por `getDb()` em `src/db/index.ts`.

### 2.1.2. Autenticação (login, cadastro e confirmação de e-mail)
- Backend em `src/server/auth.ts`; front em `src/components/AuthView.tsx` e `src/lib/auth.ts`; modelo `User` (tabela `users`) no Prisma.
- Fluxo: cadastro (e-mail + senha ≥ 8) → e-mail com link `GET /api/auth/verify?token=...` (válido 24 h, token guardado como SHA-256) → só depois da confirmação o login é aceito.
- Sessão: JWT em cookie `httpOnly` + `SameSite=Lax` (7 dias). Senhas com bcrypt (custo 12).
- **Toda rota `/api/*` exige sessão**, exceto `/api/auth/*` e `/api/health` (inclui o `/api/whatsapp-proxy`). O `App.tsx` só monta o app depois do login; qualquer 401 devolve o usuário ao login.
- Variáveis no `.env`: `APP_URL`, `JWT_SECRET` e `SMTP_*`. Sem `SMTP_HOST`, em desenvolvimento o link de confirmação aparece no console do servidor; em produção o envio falha de propósito.
### 2.1.3. Multiusuário e servidor Evolution compartilhado
- **Dados por usuário:** todas as tabelas de dados têm `user_id` e chave primária composta `(user_id, id)`. Toda rota em `server.ts` filtra pelo usuário logado (`uid(req)`); um usuário nunca lê nem apaga dado de outro. Usuários novos começam vazios (não há mais seed de exemplo).
- **Conexão com a Evolution:** o **endereço do servidor** vem do `.env` (`EVOLUTION_BASE_URL`) e vale para todos; pode ser um endereço **interno** do Easypanel, que resolve o caso de o endereço público não ser alcançável de dentro do container. Cada usuário informa, na tela de Conexão, apenas o **nome da instância e a chave/token** da própria instância e conecta o seu WhatsApp pelo QR Code (se `EVOLUTION_BASE_URL` estiver vazia, o usuário digita também a URL). Contas novas começam com tudo vazio. Salvo em `app_settings` (chave `whatsapp_connection`, escopo do usuário); a chave fica **criptografada** (AES-256-GCM, `src/server/secretBox.ts`, derivada de `SETTINGS_ENCRYPTION_KEY`/`JWT_SECRET`; trocar esse segredo exige salvar a chave de novo) e nunca volta inteira para o navegador (só `••••` + 4 últimos caracteres).
- **Proxy `/api/whatsapp-proxy`:** o navegador informa só o *caminho* da Evolution. Host e chave são sempre os da conexão salva do usuário logado; qualquer `apikey`/host/header enviado pelo cliente é ignorado. Não segue redirecionamentos, bloqueia `/instance/create|all|delete` e **recusa endereços de rede interna** (localhost, 10.x, 172.16–31.x, 192.168.x, 169.254.x, etc.) para que digitar uma URL não vire acesso a serviços internos. Exceções explícitas: `EVOLUTION_TRUSTED_HOSTS="host:porta,..."` libera só aqueles hosts internos (use quando app e Evolution estão no mesmo servidor e o endereço público não é alcançável de dentro do container); `ALLOW_PRIVATE_EVOLUTION_HOSTS=true` libera tudo (só para ambiente de usuário único e confiável).
- **Administrador:** definido por `ADMIN_EMAILS`. Só ele vê a aba **Administração** (`AdminView.tsx`): lista de usuários, confirmação de e-mail e a instância/servidor de cada um (sem as chaves).
- **Dados legados:** linhas com `user_id = ''` (anteriores ao multiusuário) são atribuídas ao administrador no primeiro login dele; a antiga configuração global do gateway vira a conexão do administrador.
- **Cache do navegador:** o LocalStorage é limpo ao trocar de usuário e ao sair, para não vazar dados entre contas no mesmo computador.
- **Atenção:** nunca coloque chaves, telefones ou contatos reais no código do front-end (`src/`): esse JavaScript é público.

### 2.1.4. Banco em produção (Easypanel) e proteção das migrations
O servidor PostgreSQL de produção **hospeda outros bancos**. Por isso:
- O ZapZap usa um **banco dedicado `zapzap`** e um **usuário dedicado `zapzap_app`** (sem superusuário, sem criar bancos/usuários, `CONNECTION LIMIT 10`). O app e as migrations **nunca** usam o `postgres`.
- `scripts/db-guard.mjs` roda antes de `db:deploy`, `db:studio`, `db:import` e `start:prod`: recusa qualquer banco que não se chame `zapzap`, qualquer usuário `postgres` em servidor remoto e URLs sem `connection_limit`.
- Em servidor remoto só existe `prisma migrate deploy` (via `npm run db:deploy`). `migrate dev` (`npm run db:migrate`) só roda em localhost. **Nunca** rode `migrate reset` ou `db push` contra o servidor.
- `DATABASE_URL` de produção: `postgresql://zapzap_app:<senha>@<host interno>:5432/zapzap?schema=public&connection_limit=5&pool_timeout=20`.
- Deploy: `Dockerfile` (Node 22). O container executa `npm run start:prod` = guard → `prisma migrate deploy` → servidor. Em produção o Express usa `trust proxy`.
- Dados: `npm run db:export` gera `deploy/zapzap-data.local.json`; `npm run db:import -- <arquivo>` importa só inserindo (nunca apaga nem sobrescreve) e pode rodar mais de uma vez.
- Arquivos com segredos (`deploy/`, `.env*`) estão no `.gitignore` e no `.dockerignore`.

### 2.2. Regras de Ouro de Arquitetura & Armadilhas Conhecidas

1. **Proxy Reverso para WhatsApp (`/api/whatsapp-proxy`):**
   - **Por que existe?** Para evitar erros de CORS no navegador e padronizar o envio de cabeçalhos de autenticação (`Apikey: <chave>`) exigidos pela Evolution API e Z-API.
   - **RFC Compliant Headers:** No `server.ts`, headers são manipulados com `Headers.set()` para evitar a duplicação de cabeçalhos com vírgula (ex: `apikey: key, key`), o que causava rejeição 401 no Go Fiber/Gin.
   - **Fallback automático:** Caso a URL limpa falhe com 401/403/404, o proxy automaticamente tenta a requisição passando `?apikey=<chave>` na query string.
   - **Imagens Binárias:** Caso a resposta tenha `Content-Type: image/*`, o proxy converte para Data URI Base64 (`data:image/...;base64,...`) para renderização instantânea no `<img>`.

2. **Evitar Sobrecarga no Backend Go (Whatsmeow / Evolution API):**
   - **Problema histórico resolvido:** Disparar loops ou temporizadores com múltiplos `POST /instance/connect` consome todas as conexões do pool do PostgreSQL no servidor Go (`SQLSTATE 53300: too many clients`).
   - **Regra:** Nunca coloque `POST /instance/connect` dentro de um `setInterval` ou `useEffect` automático contínuo. Use `GET /instance/status` para checagens passivas e só chame `connect` sob demanda expressa do usuário ao clicar em "Gerar QR Code" ou "Conectar com Código".

3. **Persistência (PostgreSQL = fonte da verdade, LocalStorage = cache):**
   - Toda gravação passa por `src/App.tsx`, que compara a versão anterior com a nova (`diffById`) e envia ao backend **apenas o que mudou** (upsert) e **os ids removidos** (`POST /api/<entidade>/delete`). Nunca reenvie listas inteiras.
   - Na inicialização, o app lê tudo do PostgreSQL (inclusive mensagens, via `GET /api/messages`) e **substitui** o cache local, mesmo que o banco esteja vazio. Se o banco não responder, mantém o cache e o badge "PostgreSQL" fica cinza.
   - `src/lib/storage.ts` **não** recria dados de exemplo ao ler (isso fazia itens excluídos voltarem). Os dados de exemplo são inseridos no banco uma única vez, na primeira execução (flag `seeded` em `app_settings`).

4. **Componentização e Responsividade:**
   - Todo o design segue Tailwind CSS v4 (`@import "tailwindcss";` em `src/index.css`).
   - Não crie arquivos CSS separados ou use estilos inline (`style={{...}}`) a menos que estritamente necessário para propriedades dinâmicas de cor calculada (ex: cores hexadecimais dos perfis como `#10b981`).

---

## 3. 🎨 Design System & Tabela de Cores do Projeto

O layout adota uma estética limpa, moderna e inspirada na identidade visual oficial do WhatsApp e ferramentas SaaS de alta produtividade (Slate/Zinc neutro + Emerald vibrante).

### 3.1. Paleta de Cores Globais da Aplicação

| Elemento / Função | Classe Tailwind | Valor Hexadecimal | Descrição de Uso |
| :--- | :--- | :--- | :--- |
| **Fundo da Aplicação** | `bg-gray-100` | `#f3f4f6` | Background geral de todas as páginas |
| **Superfície de Cards/Paineis** | `bg-white` | `#ffffff` | Fundo de containers, tabelas, modais e barra superior |
| **Bordas Estruturais** | `border-gray-200` | `#e5e7eb` | Divisores de blocos, linhas de tabelas e contornos de inputs |
| **Bordas Suaves** | `border-gray-100` | `#f3f4f6` | Divisores internos secundários |
| **Texto Primário** | `text-gray-900` | `#111827` | Títulos, nomes de contatos e corpo principal |
| **Texto Secundário** | `text-gray-600` | `#4b5563` | Subtítulos, rótulos de formulários e descrições |
| **Texto Mudo / Auxiliar** | `text-gray-500` / `text-gray-400` | `#6b7280` / `#9ca3af` | Horários, metadados e ícones desativados |
| **Primária da Marca (WhatsApp)** | `emerald-600` | `#059669` | Botões principais, abas ativas, switches ativos |
| **Primária Hover** | `emerald-700` | `#047857` | Estado hover de botões primários e badges de contagem |
| **Primária Clara (Fundos)** | `bg-emerald-50` | `#ecfdf5` | Badges de status online, seleções ativas |
| **Gradiente do Logo** | `from-emerald-600 to-teal-500` | `#059669` ➔ `#14b8a6` | Ícone de avião/disparo no cabeçalho |

---

### 3.2. Cores das Opções dos Menus (Navegação Principal)

Localizado em `src/components/Header.tsx`, o menu superior provê alternância instantânea entre as visões do sistema.

#### Estados das Abas de Navegação:
- **Aba Ativa:**
  - Fundo & Texto: `bg-emerald-600 text-white shadow-2xs`
  - Badge numérico embutido: `bg-emerald-700 text-white font-bold`
- **Aba Inativa:**
  - Fundo & Texto: `text-gray-600 hover:text-gray-900 hover:bg-gray-100`
  - Badge numérico embutido: `bg-gray-200 text-gray-700`

#### Detalhamento das Opções de Menu:

| ID da Aba | Título da Opção de Menu | Ícone Lucide | Badge / Contador |
| :--- | :--- | :--- | :--- |
| `conversas` | **Minhas Conversas** (Aba Principal) | `MessageSquare` | Total de conversas ativas no WhatsApp (`totalConversations`) |
| `perfis` | **Perfis & Vínculo de Contatos** | `Users` | Total de contatos cadastrados (`totalContacts`) |
| `templates` | **Mensagens Pré-definidas** | `FileText` | Total de modelos salvos (`totalTemplates`) |
| `disparos` | **Disparo em Massa & Agendamento** | `Send` | Sem contador (botão de ação) |
| `conexao` | **Conexão WhatsApp Web** | `QrCode` | Indicador dinâmico de status na barra |
| `historico` | **Histórico & Relatórios** | `History` | Sem contador |

#### Badges do Cabeçalho Superior:
- **Status do WhatsApp Conectado:** `bg-emerald-50 border-emerald-300 text-emerald-900` com ponto pulsante `bg-emerald-500 animate-pulse`.
- **Status do WhatsApp Desconectado:** `bg-amber-50 border-amber-300 text-amber-900` com ponto estático `bg-amber-500`.
- **PostgreSQL Cloud Conectado:** `bg-blue-100 text-blue-800` com ponto azul `bg-blue-600`.
- **Badge do Motor Anti-Ban:** `bg-emerald-100 text-emerald-800 font-bold`.

---

### 3.3. Cores dos CRUDs (Tabelas, Ações, Botões e Modais)

#### Padrão de Botões de Ação nos CRUDs:
- **Criar / Novo / Salvar / Importar (Primário):**
  - Classes: `bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition`
  - Hex: Fundo `#059669` (hover `#047857`), Texto `#ffffff`
- **Editar / Alterar (Secundário):**
  - Classes: `text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition`
  - Hex: Ícone `#2563eb`, Fundo hover `#eff6ff`
- **Excluir / Deletar / Desvincular (Destrutivo):**
  - Classes: `text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition`
  - Hex: Ícone `#dc2626`, Fundo hover `#fef2f2`
- **Vincular / Associar em Massa:**
  - Classes: `bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100`
- **Desvincular Todos (Ação Crítica):**
  - Classes: `bg-red-50 text-red-700 border border-red-200 hover:bg-red-100`
- **Cancelar / Fechar Modal:**
  - Classes: `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg`

---

### 3.4. Paleta de Cores dos Perfis / Grupos de Contatos

Os perfis de segmentação utilizam códigos hexadecimais configuráveis (`PRESET_COLORS` em `ProfilesAndLinkView.tsx`):

| Nome do Perfil Padrão | Cor HEX | Nome da Cor | Exemplo de Aplicação |
| :--- | :--- | :--- | :--- |
| **Clientes VIP** | `#10b981` | Emerald | Clientes de maior ticket e alta fidelidade |
| **DATARODEO** | `#0284c7` | Sky Blue | Parceiros de eventos e arena de rodeio |
| **Alunos & Mentorados** | `#3b82f6` | Blue | Comunidades de treinamentos |
| **Leads Quentes** | `#f59e0b` | Amber | Contatos com orçamentos abertos |
| **Cobrança / Financeiro** | `#ef4444` | Red | Lembretes de vencimento de faturas |
| **Geral / Novos Contatos**| `#8b5cf6` | Purple | Contatos importados sem tag |
| **Parceiros Comerciais** | `#06b6d4` | Cyan | Integrações e fornecedores |
| **Promocional** | `#ec4899` | Pink | Ações especiais sazonais |
| **Arquivo / Inativos** | `#64748b` | Slate | Histórico ou contatos pausados |

---

### 3.5. Cores dos Status de Campanhas e Disparos

| Status | Badge Tailwind | Ícone Lucide | Significado |
| :--- | :--- | :--- | :--- |
| **Concluído (`completed`)** | `bg-emerald-100 text-emerald-800` | `CheckCircle2` | Todos os envios do lote foram concluídos com sucesso |
| **Agendado (`scheduled`)** | `bg-blue-100 text-blue-800` | `Calendar` | Disparo programado para data e hora futura |
| **Em Execução (`running`)** | `bg-amber-100 text-amber-800` | `Clock animate-spin` | Disparo ocorrendo ativamente com contagem regressiva |
| **Pausado (`paused`)** | `bg-amber-100 text-amber-800` | `Pause` | Interrupção preventiva ou pausa configurada de lote |
| **Cancelado (`cancelled`)**| `bg-gray-100 text-gray-700` | `XSquare` | Disparo interrompido manualmente pelo operador |
| **Rascunho (`draft`)** | `bg-gray-100 text-gray-600` | `FileText` | Parâmetros salvos sem início de envio |

---

### 3.6. Cores das Mensagens do Chat (WhatsApp Conversations View)

No componente `ConversationsView.tsx`:
- **Mensagem Enviada pelo Operador (`me`):**
  - Fundo & Borda: `bg-emerald-100 text-emerald-950 border border-emerald-200/60 rounded-2xl rounded-tr-none`
  - Horário e Ticks: `text-emerald-700`, ícone `CheckCheck` em `text-emerald-600`
- **Mensagem Recebida do Contato (`contact`):**
  - Fundo & Borda: `bg-white text-gray-900 border border-gray-200 shadow-2xs rounded-2xl rounded-tl-none`
  - Horário: `text-gray-400`
- **Contato Ancorado / Fixado no Topo:**
  - Badge e Ícone: `bg-emerald-50 text-emerald-700 border-emerald-200`, ícone `Pin` em `text-emerald-600`
- **Filtros Rápidos do Chat (Pills):**
  - Ativo: `bg-emerald-600 text-white font-medium`
  - Inativo: `bg-gray-100 text-gray-600 hover:bg-gray-200`

---

## 4. 📂 Estrutura de Diretórios e Arquivos

```
├── .env.example              # Exemplo de variáveis de ambiente
├── index.html                # Ponto de entrada HTML do SPA
├── metadata.json             # Metadados do applet AI Studio
├── prisma/
│   ├── schema.prisma         # Modelos Prisma (PostgreSQL)
│   └── migrations/           # Migrations versionadas
├── package.json              # Dependências e scripts de execução
├── server.ts                 # Backend Express: CRUDs PostgreSQL + Proxy de API WhatsApp
├── tsconfig.json             # Configurações TypeScript
├── vite.config.ts            # Configuração do Vite com plugins React e Tailwind
├── src/
│   ├── App.tsx               # Orquestrador de estado global e roteamento por abas
│   ├── index.css             # Importação do Tailwind CSS v4
│   ├── main.tsx              # Ponto de entrada React 19
│   ├── types.ts              # Definições completas de interfaces e tipos TypeScript
│   ├── components/
│   │   ├── Header.tsx             # Barra superior, navegação e status badges
│   │   ├── ConversationsView.tsx  # Tela de Chat estilo WhatsApp Web, busca e pinning
│   │   ├── ProfilesAndLinkView.tsx# Gestão de perfis, contatos e vinculação em massa
│   │   ├── TemplatesView.tsx      # Cadastro e edição de modelos de mensagem Spintax
│   │   ├── MassSenderView.tsx     # Painel de disparo em massa e motor anti-ban
│   │   ├── ConnectionView.tsx     # Tela de pareamento WhatsApp (QR Code / Pairing Code)
│   │   └── HistoryView.tsx        # Relatórios e histórico detalhado das campanhas
│   ├── db/
│   │   └── index.ts          # Singleton do PrismaClient (getDb)
│   └── lib/
│       ├── antiBanEngine.ts   # Motor anti-bloqueio: Spintax, Zero-Width e Delays
│       ├── apiClient.ts       # Cliente HTTP frontend para consumo das rotas do backend
│       ├── storage.ts         # Camada LocalStorage com dados iniciais e seed de contatos
│       ├── vcard.ts           # Gerador e exportador de cartões de contato (.vcf)
│       └── whatsappGateway.ts # Gateway integrador para Evolution API, Z-API e Simulador
```

---

## 5. 🗄️ Esquema do Banco de Dados PostgreSQL (Prisma ORM)

Definido em `prisma/schema.prisma`, o banco conta com 7 tabelas normalizadas:

1. **`contact_profiles` (Segmentos de Contatos):**
   - `id` (text, PK): ex: `'prof_vip'`
   - `name` (text, Not Null): Nome da categoria
   - `description` (text): Descrição do propósito
   - `color` (text): Cor hexadecimal (`#10b981`)
   - `created_at` (timestamp with timezone)

2. **`contacts` (Agenda de Contatos):**
   - `id` (text, PK)
   - `name` (text, Not Null)
   - `phone` (text, Not Null): Telefone com DDI/DDD
   - `profile_ids` (jsonb): Array de IDs de perfis (`string[]`)
   - `notes` (text): Observações livres
   - `custom_data` (jsonb): Campos personalizados chave-valor
   - `added_at`, `updated_at` (timestamp with timezone)

3. **`message_templates` (Modelos de Mensagem):**
   - `id` (text, PK)
   - `title` (text, Not Null)
   - `content` (text, Not Null): Conteúdo com Spintax e tags
   - `category` (text): Categoria (`Vendas`, `Suporte`, etc.)
   - `tags` (jsonb): Tags adicionais
   - `created_at` (timestamp with timezone)

4. **`chats` (Conversas do WhatsApp):**
   - `id` (text, PK): Número de dígitos ou JID
   - `name` (text): Nome salvo ou número
   - `phone` (text)
   - `push_name` (text): Nome público do WhatsApp (`~Willia Oliveira`)
   - `about` (text): Recado/Status do perfil
   - `jid` (text): JID do WhatsApp (`...s.whatsapp.net`)
   - `avatar_url` (text): URL da foto de perfil
   - `last_message` (text): Prévia da última mensagem
   - `last_message_timestamp` (text)
   - `unread_count` (integer)
   - `contact_id` (text): Vínculo com tabela `contacts`
   - `profile_ids` (jsonb): Perfis vinculados
   - `is_group` (boolean)
   - `is_pinned` (boolean): Se está fixado no topo
   - `pin_index` (integer)
   - `labels` (jsonb)

5. **`chat_messages` (Mensagens Trocadas no Chat):**
   - `id` (text, PK)
   - `chat_id` (text, Not Null)
   - `sender` (text): `'me'` ou `'contact'`
   - `text` (text)
   - `status` (text): `'pending'`, `'sent'`, `'delivered'`, `'read'`, `'failed'`
   - `timestamp` (timestamp with timezone)

6. **`campaigns` (Campanhas de Disparo):**
   - `id` (text, PK)
   - `name` (text)
   - `target_profile_id` (text): ID do perfil de destino
   - `selected_template_ids` (jsonb): Templates participantes da rotação
   - `scheduled_for` (timestamp with timezone): Data de agendamento ou null
   - `status` (text): `'draft'`, `'scheduled'`, `'running'`, `'paused'`, `'completed'`, `'cancelled'`
   - `total_contacts`, `sent_count`, `failed_count` (integer)
   - `anti_ban_settings` (jsonb): Parâmetros do motor anti-ban no momento da execução
   - `logs` (jsonb): Array de `CampaignLogItem` com histórico de cada mensagem
   - `created_at` (timestamp with timezone)

7. **`app_settings` (Configurações Gerais):**
   - `key` (text, PK): `'gateway_config'`, `'session'`, `'anti_ban_settings'`
   - `value` (jsonb)
   - `updated_at` (timestamp with timezone)

---

## 6. 🛡️ Motor Anti-Ban: Como Funciona

Implementado em `src/lib/antiBanEngine.ts`:

1. **Spintax Dinâmico Recursivo (`resolveSpintax`):**
   - Sintaxe: `{Opção 1|Opção 2|Opção 3}`.
   - Suporta aninhamento. O algoritmo substitui cada bloco por uma opção sorteada aleatoriamente a cada contato.
2. **Injeção de Ruído Invisível Zero-Width (`injectZeroWidthNoise`):**
   - Injeta caracteres Unicode invisíveis (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`) entre palavras com probabilidade aleatória de 35%.
   - **Efeito:** Para o destinatário humano, o texto é 100% legível e idêntico; para os algoritmos de hash do WhatsApp (anti-spam), cada mensagem enviada possui uma assinatura SHA-256 completamente distinta.
3. **Delays Humanizados Aleatórios (`getRandomDelay`):**
   - Variação randômica entre o tempo mínimo (`minDelaySeconds`, padrão: 4s) e máximo (`maxDelaySeconds`, padrão: 10s).
4. **Pausa Preventiva em Lotes (`batchSize` / `batchPauseMinutes`):**
   - A cada $N$ envios (ex: 15 mensagens), o sistema pausa o envio por $M$ minutos antes de continuar.
5. **Rotação de Templates (Spinning):**
   - Se mais de um template for marcado para a campanha, o motor alterna entre eles a cada contato disparado.
6. **Variáveis Contextuais Dinâmicas (`resolveVariables`):**
   - `{nome}`: Nome completo
   - `{primeiro_nome}` / `{primeironome}`: Primeiro nome
   - `{saudacao}`: "Bom dia", "Boa tarde" ou "Boa noite" calculado com base no fuso/hora atual
   - `{telefone}`: Telefone formatado
   - `{perfil}`: Nome do segmento de contato
   - `{protocolo}`: Código numérico randômico de 6 dígitos gerado na hora
   - `{data}`: Data atual formatada (DD/MM/AAAA)

---

## 7. 🔌 Integração WhatsApp & Evolution API (Easypanel)

Configure a Base URL, o nome da instância e a API Key na tela **Conexão WhatsApp** (salvas em `app_settings`). Não registre chaves neste documento.

### Endpoints da Evolution API Utilizados:
1. `GET /instance/status` (ou `GET /instance/connectionState/:instance`): Verifica o estado da conexão.
2. `POST /instance/connect`: Solicita geração de QR Code quando desconectado.
3. `POST /instance/pair` (ou `POST /instance/connect/:instance` com `{ number: '...' }`): Retorna código de 8 dígitos para pareamento manual.
4. `POST /message/sendText/:instance`: Envio de mensagens de texto.
5. `GET /chat/findChats/:instance`: Listagem das conversas ativas.
6. `GET /chat/findContacts/:instance`: Listagem da lista de contatos.
7. `POST /chat/pinChat/:instance`: Fixação ou desfixação de conversa no topo.
8. `POST /instance/logout/:instance` / `DELETE /instance/delete/:instance`: Desconexão e limpeza de sessão.

---

## 8. 🚀 Checklist Rápido para a Próxima IA

Ao receber qualquer solicitação do usuário:
- [ ] Consulte este documento para manter as cores e padrões visuais fiéis.
- [ ] Rode `npm run lint` ao final das alterações para validar o build.
- [ ] Preserve os fallbacks de `storage.ts` junto às rotas de `server.ts`.
- [ ] Garanta que nenhum loop agressivo faça chamadas contínuas de `POST /instance/connect`.
- [ ] Mantenha o menu ativo e os componentes modulares intactos.
