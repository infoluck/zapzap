import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { getDb } from '../db/index';
import { requireAdmin } from './admin';

/**
 * Servidor Evolution compartilhado por todos os usuários.
 *  - EVOLUTION_BASE_URL        endereço do servidor
 *  - EVOLUTION_GLOBAL_API_KEY  chave admin (cria instâncias). NUNCA vai ao navegador.
 * Cada usuário tem a sua própria instância/sessão de WhatsApp, acessada com um token próprio.
 */
import { encryptSecret, decryptSecret } from './secretBox';

type ServerConfig = { baseUrl: string; globalKey: string; source: 'database' | 'env' | 'none' };

// Server-wide settings live in app_settings under a reserved owner no user can ever have
const GLOBAL_OWNER = '__global__';
const SETTING_KEY = 'evolution_server';
const cleanUrl = (v: string) => v.trim().replace(/\/+$/, '');

let configCache: { value: ServerConfig; at: number } | null = null;
const invalidateConfig = () => {
  configCache = null;
};

/** Config saved by the admin in the database wins; the .env variables are the default. */
export async function getServerConfig(): Promise<ServerConfig> {
  if (configCache && Date.now() - configCache.at < 30_000) return configCache.value;

  const row = await getDb().appSetting.findUnique({
    where: { userId_key: { userId: GLOBAL_OWNER, key: SETTING_KEY } },
  });
  const saved = row?.value as any;
  let value: ServerConfig;
  if (saved?.baseUrl) {
    let key = '';
    try {
      key = saved.globalKeyEnc ? decryptSecret(saved.globalKeyEnc) : '';
    } catch {
      console.error('⚠️ Não foi possível decifrar a chave global salva (JWT_SECRET mudou?). Salve-a de novo na Administração.');
    }
    value = { baseUrl: cleanUrl(saved.baseUrl), globalKey: key, source: 'database' };
  } else {
    const baseUrl = cleanUrl(process.env.EVOLUTION_BASE_URL || '');
    const key = (process.env.EVOLUTION_GLOBAL_API_KEY || '').trim();
    value = { baseUrl, globalKey: key, source: baseUrl || key ? 'env' : 'none' };
  }
  configCache = { value, at: Date.now() };
  return value;
}

/** Accepts only http(s) URLs without embedded credentials. Returns the cleaned URL or null. */
function parseBaseUrl(input: unknown): string | null {
  try {
    const u = new URL(String(input ?? '').trim());
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    return cleanUrl(u.origin + (u.pathname === '/' ? '' : u.pathname));
  } catch {
    return null;
  }
}

class EvolutionError extends Error {}

type Instance = { name: string; token: string };
const inflight = new Map<string, Promise<Instance>>();

/** Returns the user's instance, creating it on the Evolution server the first time. */
export async function ensureInstance(userId: string): Promise<Instance> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new EvolutionError('Usuário não encontrado.');
  if (user.evoInstanceName && user.evoInstanceToken) {
    return { name: user.evoInstanceName, token: user.evoInstanceToken };
  }

  const pending = inflight.get(userId);
  if (pending) return pending;

  const { baseUrl: base, globalKey: key } = await getServerConfig();
  if (!base || !key) {
    throw new EvolutionError('O servidor de WhatsApp ainda não foi configurado pelo administrador.');
  }

  const creation = (async () => {
    const name = `u${userId.replace(/-/g, '').slice(0, 12)}`;
    const token = crypto.randomUUID();
    let res: globalThis.Response;
    try {
      res = await fetch(`${base}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({
          name,
          instanceName: name,
          token,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });
    } catch (err: any) {
      throw new EvolutionError(`Não foi possível falar com o servidor Evolution: ${err?.message || err}`);
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      throw new EvolutionError(`Falha ao criar a instância (HTTP ${res.status}): ${body}`);
    }
    await db.user.update({ where: { id: userId }, data: { evoInstanceName: name, evoInstanceToken: token } });
    console.log(`📱 Instância Evolution criada: ${name}`);
    return { name, token };
  })().finally(() => inflight.delete(userId));

  inflight.set(userId, creation);
  return creation;
}

/**
 * Dados anteriores ao multiusuário (user_id = '') passam para o administrador.
 * A instância/token que estava salva na antiga configuração global também é herdada.
 */
let claimed = false;
export async function claimLegacyData(adminId: string): Promise<void> {
  if (claimed) return;
  const db = getDb();
  try {
    const legacyCount = await db.contact.count({ where: { userId: '' } });
    const legacySettings = await db.appSetting.findMany({ where: { userId: '' } });
    if (legacyCount === 0 && legacySettings.length === 0 && (await db.profile.count({ where: { userId: '' } })) === 0) {
      claimed = true;
      return;
    }

    const user = await db.user.findUnique({ where: { id: adminId } });
    const legacyGateway = legacySettings.find((s) => s.key === 'gateway_config')?.value as any;
    if (user && !user.evoInstanceToken && legacyGateway?.apiKey && legacyGateway?.instanceName) {
      await db.user.update({
        where: { id: adminId },
        data: { evoInstanceName: String(legacyGateway.instanceName), evoInstanceToken: String(legacyGateway.apiKey) },
      });
    }

    const where = { userId: '' };
    const data = { userId: adminId };
    await db.$transaction([
      db.profile.updateMany({ where, data }),
      db.contact.updateMany({ where, data }),
      db.template.updateMany({ where, data }),
      db.chat.updateMany({ where, data }),
      db.chatMessage.updateMany({ where, data }),
      db.campaign.updateMany({ where, data }),
      // Configuração global do gateway e flag de seed não existem mais por usuário
      db.appSetting.deleteMany({ where: { userId: '', key: { in: ['gateway_config', 'seeded'] } } }),
      db.appSetting.updateMany({ where, data }),
    ]);
    claimed = true;
    console.log(`🔑 Dados legados atribuídos ao administrador (${legacyCount} contatos).`);
  } catch (err) {
    console.error('Falha ao atribuir dados legados ao administrador:', err);
  }
}

const envelope = (res: Response, status: number, error: string) =>
  res.json({ status, contentType: 'application/json', text: JSON.stringify({ error }) });

export function registerEvolutionRoutes(app: Express) {
  const db = getDb();
  const userId = (req: Request) => (req as any).userId as string;

  // What the browser may know: no keys, no server address.
  app.get('/api/whatsapp/config', async (req, res) => {
    const user = await db.user.findUnique({ where: { id: userId(req) } });
    res.json({
      provider: 'evolution',
      instanceName: user?.evoInstanceName || '',
      serverConfigured: await (async () => {
        const cfg = await getServerConfig();
        return Boolean(cfg.baseUrl && (cfg.globalKey || user?.evoInstanceToken));
      })(),
    });
  });

  // Proxy: the browser only says WHICH Evolution path to call. Host and credentials are
  // always the server's / the logged user's, so it can't be used to reach arbitrary URLs.
  app.post('/api/whatsapp-proxy', async (req, res) => {
    try {
      const { url, method = 'GET', payload } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

      const base = (await getServerConfig()).baseUrl;
      if (!base) return envelope(res, 503, 'O servidor de WhatsApp ainda não foi configurado pelo administrador.');

      let path: string;
      try {
        const parsed = new URL(url, 'http://placeholder.invalid');
        parsed.searchParams.delete('apikey');
        path = parsed.pathname + parsed.search;
      } catch {
        return res.status(400).json({ error: 'URL inválida.' });
      }
      if (path.includes('..') || /^\/instance\/(create|all|delete)/i.test(path)) {
        return res.status(403).json({ error: 'Rota não permitida.' });
      }
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase())) {
        return res.status(400).json({ error: 'Método inválido.' });
      }

      let instance: Instance;
      try {
        instance = await ensureInstance(userId(req));
      } catch (err: any) {
        return envelope(res, 503, err?.message || 'Falha ao preparar sua instância de WhatsApp.');
      }

      const upperMethod = String(method).toUpperCase();
      const hasBody = payload && ['POST', 'PUT', 'PATCH'].includes(upperMethod);
      const headers = new Headers();
      headers.set('Accept', '*/*');
      headers.set('apikey', instance.token);
      if (hasBody) headers.set('Content-Type', 'application/json');
      const init: RequestInit = {
        method: upperMethod,
        headers,
        body: hasBody ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : undefined,
      };

      let apiRes = await fetch(`${base}${path}`, init);

      // Some Evolution builds only accept the token as a query param
      if ([401, 403, 404].includes(apiRes.status)) {
        const sep = path.includes('?') ? '&' : '?';
        try {
          const fallback = await fetch(`${base}${path}${sep}apikey=${encodeURIComponent(instance.token)}`, init);
          if (fallback.ok || (apiRes.status === 404 && fallback.status !== 404)) apiRes = fallback;
        } catch {
          // keep first response
        }
      }

      const contentType = apiRes.headers.get('content-type') || '';
      if (contentType.includes('image')) {
        const buf = await apiRes.arrayBuffer();
        return res.json({
          status: apiRes.status,
          contentType,
          base64: `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`,
        });
      }
      return res.json({ status: apiRes.status, contentType, text: await apiRes.text() });
    } catch (err: any) {
      console.error('WhatsApp proxy error:', err);
      return res.status(502).json({ error: err.message || 'Failed to communicate with WhatsApp gateway' });
    }
  });

  // ---------- Admin area ----------
  const keyHint = (key: string) => (key ? `••••${key.slice(-4)}` : '');

  app.get('/api/admin/evolution', requireAdmin, async (req, res) => {
    const cfg = await getServerConfig();
    const me = await db.user.findUnique({ where: { id: userId(req) } });
    res.json({
      baseUrl: cfg.baseUrl,
      hasGlobalKey: Boolean(cfg.globalKey),
      globalKeyHint: keyHint(cfg.globalKey),
      source: cfg.source,
      myInstanceName: me?.evoInstanceName || '',
    });
  });

  // Save server address and global key. A blank key keeps the one already saved.
  app.put('/api/admin/evolution', requireAdmin, async (req, res) => {
    const baseUrl = parseBaseUrl(req.body?.baseUrl);
    if (!baseUrl) return res.status(400).json({ error: 'Informe um endereço válido (http:// ou https://).' });

    const newKey = String(req.body?.globalApiKey ?? '').trim();
    let encrypted: string | undefined;
    if (newKey) {
      if (/^https?:\/\//i.test(newKey)) {
        return res.status(400).json({ error: 'A chave informada parece ser uma URL. Cole a chave de API.' });
      }
      encrypted = encryptSecret(newKey);
    } else {
      const current = await db.appSetting.findUnique({
        where: { userId_key: { userId: GLOBAL_OWNER, key: SETTING_KEY } },
      });
      encrypted = (current?.value as any)?.globalKeyEnc;
    }
    if (!encrypted) return res.status(400).json({ error: 'Informe a chave global (API Key) do servidor.' });

    const value = { baseUrl, globalKeyEnc: encrypted };
    await db.appSetting.upsert({
      where: { userId_key: { userId: GLOBAL_OWNER, key: SETTING_KEY } },
      create: { userId: GLOBAL_OWNER, key: SETTING_KEY, value },
      update: { value, updatedAt: new Date() },
    });
    invalidateConfig();
    res.json({ success: true });
  });

  // Drop the saved config and go back to the .env defaults
  app.delete('/api/admin/evolution', requireAdmin, async (req, res) => {
    await db.appSetting.deleteMany({ where: { userId: GLOBAL_OWNER, key: SETTING_KEY } });
    invalidateConfig();
    res.json({ success: true });
  });

  // Tests the values typed in the form (or, if blank, the ones currently in use) without saving
  app.post('/api/admin/evolution/test', requireAdmin, async (req, res) => {
    const current = await getServerConfig();
    const typedUrl = String(req.body?.baseUrl ?? '').trim();
    const base = typedUrl ? parseBaseUrl(typedUrl) : current.baseUrl;
    const key = String(req.body?.globalApiKey ?? '').trim() || current.globalKey;
    const result = { reachable: false, keyValid: false, message: '' };

    if (!base) {
      result.message = typedUrl ? 'Endereço inválido (use http:// ou https://).' : 'Endereço do servidor não definido.';
      return res.json(result);
    }
    try {
      const ok = await fetch(`${base}/server/ok`, { signal: AbortSignal.timeout(15000) });
      result.reachable = ok.ok;
      if (!ok.ok) result.message = `Servidor respondeu HTTP ${ok.status}.`;
    } catch (err: any) {
      result.message = `Servidor inacessível: ${err?.message || err}`;
      return res.json(result);
    }
    if (!key) {
      result.message = result.message || 'Chave global não informada.';
      return res.json(result);
    }
    try {
      const all = await fetch(`${base}/instance/all`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
      result.keyValid = all.ok;
      result.message =
        result.message ||
        (all.ok ? 'Servidor acessível e chave global válida.' : `Chave global recusada (HTTP ${all.status}).`);
    } catch (err: any) {
      result.message = `Falha ao validar a chave: ${err?.message || err}`;
    }
    res.json(result);
  });

  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        emailVerified: u.emailVerified,
        instanceName: u.evoInstanceName || '',
        createdAt: u.createdAt.toISOString(),
      }))
    );
  });
}
