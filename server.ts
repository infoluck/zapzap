import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './src/db/index';
import { registerAuthRoutes, requireAuth } from './src/server/auth';
import { registerEvolutionRoutes, claimLegacyData } from './src/server/evolution';
import { isAdminEmail } from './src/server/admin';

// Settings a user may store (the Evolution server config lives in .env, not here)
const ALLOWED_SETTINGS = new Set(['session', 'anti_ban_settings']);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Behind the Easypanel proxy: trust X-Forwarded-* so req.ip is the real client (rate limits per user, not per proxy)
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(express.json({ limit: '20mb' }));

  // Public auth routes first; everything else under /api requires a verified, logged-in user
  registerAuthRoutes(app);
  app.use('/api', requireAuth);

  const db = getDb();

  // If the admin already exists, hand over pre-multiuser data right away
  try {
    const admins = (await db.user.findMany({ where: { emailVerified: true } })).filter((u) => isAdminEmail(u.email));
    for (const admin of admins) await claimLegacyData(admin.id);
  } catch (err) {
    console.warn('⚠️ Legacy data check notice:', err);
  }

  const toDate = (v: any) => (v ? new Date(v) : new Date());
  /** Id of the logged-in user: every query below is scoped by it. */
  const uid = (req: express.Request) => (req as any).userId as string;

  // Runs upserts in transactions of limited size (large syncs have thousands of rows)
  const runChunked = async (ops: any[], size = 500) => {
    for (let i = 0; i < ops.length; i += size) {
      await db.$transaction(ops.slice(i, i + size));
    }
  };

  const idsFrom = (body: any): string[] =>
    Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];

  // ---------- Mappers (DB row -> API payload) ----------
  const fmtProfile = (p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    color: p.color || '#0284c7',
    createdAt: p.createdAt.toISOString(),
  });

  const fmtContact = (c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    profileIds: c.profileIds || [],
    notes: c.notes || '',
    customData: c.customData || {},
    addedAt: c.addedAt.toISOString(),
  });

  const fmtTemplate = (t: any) => ({
    id: t.id,
    title: t.title,
    content: t.content,
    category: t.category || 'Geral',
    tags: t.tags || [],
    createdAt: t.createdAt.toISOString(),
  });

  const fmtChat = (c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    pushName: c.pushName || undefined,
    about: c.about || undefined,
    jid: c.jid || undefined,
    avatarUrl: c.avatarUrl || undefined,
    lastMessage: c.lastMessage || undefined,
    lastMessageTimestamp: c.lastMessageTimestamp || undefined,
    unreadCount: c.unreadCount || 0,
    contactId: c.contactId || undefined,
    profileIds: c.profileIds || [],
    isGroup: c.isGroup || false,
    isPinned: c.isPinned || false,
    pinIndex: c.pinIndex || 0,
    isDisappearing: c.isDisappearing || false,
    isMuted: c.isMuted || false,
    labels: c.labels || [],
  });

  const fmtMessage = (m: any) => ({
    id: m.id,
    chatId: m.chatId,
    sender: m.sender as 'me' | 'contact',
    text: m.text,
    timestamp: m.timestamp.toISOString(),
    status: (m.status || 'sent') as any,
    error: m.error || undefined,
  });

  const fmtCampaign = (c: any) => ({
    id: c.id,
    name: c.name,
    targetProfileId: c.targetProfileId,
    selectedTemplateIds: c.selectedTemplateIds as string[],
    scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : null,
    status: c.status as any,
    totalContacts: c.totalContacts || 0,
    sentCount: c.sentCount || 0,
    failedCount: c.failedCount || 0,
    antiBanSettings: c.antiBanSettings as any,
    logs: c.logs as any[],
    createdAt: c.createdAt.toISOString(),
  });

  // ---------- Input builders (API payload -> Prisma data) ----------
  const profileData = (p: any) => ({
    name: p.name || 'Novo Perfil',
    description: p.description || '',
    color: p.color || '#0284c7',
  });

  const contactData = (c: any) => ({
    name: c.name || 'Contato',
    phone: c.phone || '',
    profileIds: c.profileIds || [],
    notes: c.notes || '',
    customData: c.customData || {},
    updatedAt: new Date(),
  });

  const templateData = (t: any) => ({
    title: t.title || 'Sem Título',
    content: t.content || '',
    category: t.category || 'Geral',
    tags: t.tags || [],
  });

  const chatData = (ch: any) => ({
    name: ch.name || ch.phone,
    phone: ch.phone,
    pushName: ch.pushName,
    about: ch.about,
    jid: ch.jid,
    avatarUrl: ch.avatarUrl,
    lastMessage: ch.lastMessage,
    lastMessageTimestamp: ch.lastMessageTimestamp,
    unreadCount: ch.unreadCount || 0,
    contactId: ch.contactId,
    profileIds: ch.profileIds || [],
    isGroup: ch.isGroup || false,
    isPinned: ch.isPinned || false,
    pinIndex: ch.pinIndex || 0,
    isDisappearing: ch.isDisappearing || false,
    isMuted: ch.isMuted || false,
    labels: ch.labels || [],
    updatedAt: new Date(),
  });

  const messageData = (m: any, chatId?: string) => ({
    chatId: (m.chatId || chatId) as string,
    sender: m.sender,
    text: m.text,
    status: m.status || 'sent',
    error: m.error,
  });

  const campaignData = (c: any) => ({
    name: c.name,
    targetProfileId: c.targetProfileId,
    selectedTemplateIds: c.selectedTemplateIds || [],
    scheduledFor: c.scheduledFor ? new Date(c.scheduledFor) : null,
    status: c.status,
    totalContacts: c.totalContacts || 0,
    sentCount: c.sentCount || 0,
    failedCount: c.failedCount || 0,
    antiBanSettings: c.antiBanSettings,
    logs: c.logs || [],
  });

  // Wraps an async handler with uniform error handling
  const handle = (label: string, fn: (req: express.Request, res: express.Response) => Promise<any>) =>
    async (req: express.Request, res: express.Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        console.error(`Error ${label}:`, err);
        res.status(500).json({ error: err.message });
      }
    };

  // ==========================================
  // API ROUTES (CRUD) — all scoped to the logged-in user
  // ==========================================

  app.get('/api/health', handle('checking health', async (req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'postgres_prisma' });
  }));

  // ------------------------------------------
  // PROFILES
  // ------------------------------------------
  app.get('/api/profiles', handle('fetching profiles', async (req, res) => {
    const rows = await db.profile.findMany({ where: { userId: uid(req) }, orderBy: { name: 'asc' } });
    res.json(rows.map(fmtProfile));
  }));

  app.post('/api/profiles', handle('saving profile', async (req, res) => {
    const userId = uid(req);
    const id = req.body.id || `prof_${Date.now()}`;
    const data = profileData(req.body);
    await db.profile.upsert({
      where: { userId_id: { userId, id } },
      create: { userId, id, ...data, createdAt: toDate(req.body.createdAt) },
      update: data,
    });
    res.json({ success: true, id });
  }));

  app.put('/api/profiles/batch', handle('batch updating profiles', async (req, res) => {
    const userId = uid(req);
    const profiles = req.body;
    if (!Array.isArray(profiles)) return res.status(400).json({ error: 'Expected array of profiles' });
    await runChunked(profiles.map(p => db.profile.upsert({
      where: { userId_id: { userId, id: p.id } },
      create: { userId, id: p.id, ...profileData(p), createdAt: toDate(p.createdAt) },
      update: profileData(p),
    })));
    res.json({ success: true, count: profiles.length });
  }));

  app.delete('/api/profiles/:id', handle('deleting profile', async (req, res) => {
    await db.profile.deleteMany({ where: { userId: uid(req), id: req.params.id } });
    res.json({ success: true });
  }));

  app.post('/api/profiles/delete', handle('batch deleting profiles', async (req, res) => {
    const r = await db.profile.deleteMany({ where: { userId: uid(req), id: { in: idsFrom(req.body) } } });
    res.json({ success: true, count: r.count });
  }));

  // ------------------------------------------
  // CONTACTS
  // ------------------------------------------
  app.get('/api/contacts', handle('fetching contacts', async (req, res) => {
    const rows = await db.contact.findMany({ where: { userId: uid(req) }, orderBy: { updatedAt: 'desc' } });
    res.json(rows.map(fmtContact));
  }));

  app.post('/api/contacts', handle('saving contact', async (req, res) => {
    const userId = uid(req);
    const id = req.body.id || `c_${Date.now()}`;
    const data = contactData(req.body);
    await db.contact.upsert({
      where: { userId_id: { userId, id } },
      create: { userId, id, ...data, addedAt: toDate(req.body.addedAt) },
      update: data,
    });
    res.json({ success: true, id });
  }));

  app.put('/api/contacts/batch', handle('batch updating contacts', async (req, res) => {
    const userId = uid(req);
    const contacts = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({ error: 'Expected array of contacts' });
    await runChunked(contacts.map(c => db.contact.upsert({
      where: { userId_id: { userId, id: c.id } },
      create: { userId, id: c.id, ...contactData(c), addedAt: toDate(c.addedAt) },
      update: contactData(c),
    })));
    res.json({ success: true, count: contacts.length });
  }));

  app.delete('/api/contacts/:id', handle('deleting contact', async (req, res) => {
    await db.contact.deleteMany({ where: { userId: uid(req), id: req.params.id } });
    res.json({ success: true });
  }));

  app.post('/api/contacts/delete', handle('batch deleting contacts', async (req, res) => {
    const r = await db.contact.deleteMany({ where: { userId: uid(req), id: { in: idsFrom(req.body) } } });
    res.json({ success: true, count: r.count });
  }));

  // ------------------------------------------
  // TEMPLATES
  // ------------------------------------------
  app.get('/api/templates', handle('fetching templates', async (req, res) => {
    const rows = await db.template.findMany({ where: { userId: uid(req) }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(fmtTemplate));
  }));

  app.post('/api/templates', handle('saving template', async (req, res) => {
    const userId = uid(req);
    const id = req.body.id || `tpl_${Date.now()}`;
    const data = templateData(req.body);
    await db.template.upsert({
      where: { userId_id: { userId, id } },
      create: { userId, id, ...data, createdAt: toDate(req.body.createdAt) },
      update: data,
    });
    res.json({ success: true, id });
  }));

  app.put('/api/templates/batch', handle('batch updating templates', async (req, res) => {
    const userId = uid(req);
    const templates = req.body;
    if (!Array.isArray(templates)) return res.status(400).json({ error: 'Expected array of templates' });
    await runChunked(templates.map(t => db.template.upsert({
      where: { userId_id: { userId, id: t.id } },
      create: { userId, id: t.id, ...templateData(t), createdAt: toDate(t.createdAt) },
      update: templateData(t),
    })));
    res.json({ success: true, count: templates.length });
  }));

  app.delete('/api/templates/:id', handle('deleting template', async (req, res) => {
    await db.template.deleteMany({ where: { userId: uid(req), id: req.params.id } });
    res.json({ success: true });
  }));

  app.post('/api/templates/delete', handle('batch deleting templates', async (req, res) => {
    const r = await db.template.deleteMany({ where: { userId: uid(req), id: { in: idsFrom(req.body) } } });
    res.json({ success: true, count: r.count });
  }));

  // ------------------------------------------
  // CHATS
  // ------------------------------------------
  app.get('/api/chats', handle('fetching chats', async (req, res) => {
    const rows = await db.chat.findMany({ where: { userId: uid(req) }, orderBy: { updatedAt: 'desc' } });
    res.json(rows.map(fmtChat));
  }));

  app.put('/api/chats/batch', handle('saving chats', async (req, res) => {
    const userId = uid(req);
    const chats = req.body;
    if (!Array.isArray(chats)) return res.status(400).json({ error: 'Expected array of chats' });
    await runChunked(chats.map(ch => db.chat.upsert({
      where: { userId_id: { userId, id: ch.id } },
      create: { userId, id: ch.id, ...chatData(ch) },
      update: chatData(ch),
    })));
    res.json({ success: true, count: chats.length });
  }));

  app.post('/api/chats/delete', handle('batch deleting chats', async (req, res) => {
    const r = await db.chat.deleteMany({ where: { userId: uid(req), id: { in: idsFrom(req.body) } } });
    res.json({ success: true, count: r.count });
  }));

  // ------------------------------------------
  // MESSAGES
  // ------------------------------------------
  app.get('/api/messages/:chatId', handle('fetching messages', async (req, res) => {
    const rows = await db.chatMessage.findMany({
      where: { userId: uid(req), chatId: req.params.chatId },
      orderBy: { timestamp: 'asc' },
    });
    res.json(rows.map(fmtMessage));
  }));

  app.post('/api/messages', handle('saving message', async (req, res) => {
    const userId = uid(req);
    const id = req.body.id || `msg_${Date.now()}`;
    const data = messageData(req.body);
    await db.chatMessage.upsert({
      where: { userId_id: { userId, id } },
      create: { userId, id, ...data, timestamp: toDate(req.body.timestamp) },
      update: { sender: data.sender, text: data.text, status: data.status, error: data.error },
    });
    res.json({ success: true, id });
  }));

  app.put('/api/messages/batch', handle('batch updating messages', async (req, res) => {
    const userId = uid(req);
    const messagesMap = req.body as Record<string, any[]>; // chatId -> messages
    const ops = Object.entries(messagesMap).flatMap(([chatId, msgs]) =>
      msgs.map(m => {
        const data = messageData(m, chatId);
        return db.chatMessage.upsert({
          where: { userId_id: { userId, id: m.id } },
          create: { userId, id: m.id, ...data, timestamp: toDate(m.timestamp) },
          update: { sender: data.sender, text: data.text, status: data.status, error: data.error },
        });
      })
    );
    await runChunked(ops);
    res.json({ success: true });
  }));

  app.post('/api/messages/delete', handle('batch deleting messages', async (req, res) => {
    const r = await db.chatMessage.deleteMany({ where: { userId: uid(req), id: { in: idsFrom(req.body) } } });
    res.json({ success: true, count: r.count });
  }));

  // All messages grouped by chat (chatId -> messages)
  app.get('/api/messages', handle('fetching all messages', async (req, res) => {
    const rows = await db.chatMessage.findMany({ where: { userId: uid(req) }, orderBy: { timestamp: 'asc' } });
    const grouped: Record<string, ReturnType<typeof fmtMessage>[]> = {};
    for (const m of rows) (grouped[m.chatId] ||= []).push(fmtMessage(m));
    res.json(grouped);
  }));

  // ------------------------------------------
  // CAMPAIGNS
  // ------------------------------------------
  app.get('/api/campaigns', handle('fetching campaigns', async (req, res) => {
    const rows = await db.campaign.findMany({ where: { userId: uid(req) }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(fmtCampaign));
  }));

  app.post('/api/campaigns', handle('saving campaign', async (req, res) => {
    const userId = uid(req);
    const c = req.body;
    const data = campaignData(c);
    await db.campaign.upsert({
      where: { userId_id: { userId, id: c.id } },
      create: { userId, id: c.id, ...data, createdAt: toDate(c.createdAt) },
      update: data,
    });
    res.json({ success: true, id: c.id });
  }));

  app.delete('/api/campaigns/:id', handle('deleting campaign', async (req, res) => {
    await db.campaign.deleteMany({ where: { userId: uid(req), id: req.params.id } });
    res.json({ success: true });
  }));

  // ------------------------------------------
  // APP SETTINGS (Session, AntiBan) — per user
  // ------------------------------------------
  app.get('/api/settings/:key', handle('fetching settings', async (req, res) => {
    const { key } = req.params;
    if (!ALLOWED_SETTINGS.has(key)) return res.status(404).json({ error: 'Not found' });
    const row = await db.appSetting.findUnique({ where: { userId_key: { userId: uid(req), key } } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row.value);
  }));

  app.post('/api/settings/:key', handle('saving setting', async (req, res) => {
    const userId = uid(req);
    const { key } = req.params;
    if (!ALLOWED_SETTINGS.has(key)) return res.status(400).json({ error: 'Configuração não permitida.' });
    const value = req.body;
    await db.appSetting.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value, updatedAt: new Date() },
    });
    res.json({ success: true });
  }));

  // ------------------------------------------
  // WHATSAPP (Evolution) — proxy, per-user instance and admin area
  // ------------------------------------------
  registerEvolutionRoutes(app);

  // ==========================================
  // VITE MIDDLEWARE / STATIC FILES
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
