import dns from 'dns/promises';
import net from 'net';
import type { Express, Request, Response } from 'express';
import { getDb } from '../db/index';
import { requireAdmin } from './admin';
import { encryptSecret, decryptSecret } from './secretBox';

/**
 * Conexão com a Evolution API POR USUÁRIO.
 * Cada usuário informa a URL do servidor, o nome da instância e a chave/token da sua instância.
 * A chave é guardada criptografada e nunca volta inteira para o navegador. Contas novas começam vazias.
 */
const SETTING_KEY = 'whatsapp_connection';

class EvolutionError extends Error {}

type Connection = { baseUrl: string; instanceName: string; apiKey: string };

const cleanUrl = (v: string) => v.trim().replace(/\/+$/, '');
const keyHint = (key: string) => (key ? `••••${key.slice(-4)}` : '');

// ---------- URL validation (SSRF protection) ----------
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

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd');
}

/**
 * Users type the server address, so the backend must never be turned into a way to reach
 * internal services (localhost, private networks, cloud metadata). Set
 * ALLOW_PRIVATE_EVOLUTION_HOSTS=true only for a trusted single-tenant setup.
 */
async function assertPublicHost(baseUrl: string): Promise<void> {
  if (process.env.ALLOW_PRIVATE_EVOLUTION_HOSTS === 'true') return;
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
  let addrs: { address: string }[];
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new EvolutionError('Não foi possível resolver o endereço do servidor. Confira a URL.');
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new EvolutionError('Esse endereço aponta para uma rede interna e não é permitido. Use o endereço público do servidor.');
  }
}

// ---------- Per-user connection storage ----------
export async function loadConnection(userId: string): Promise<Connection | null> {
  const db = getDb();
  const row = await db.appSetting.findUnique({ where: { userId_key: { userId, key: SETTING_KEY } } });
  const v = row?.value as any;
  if (v?.baseUrl && v?.instanceName && v?.apiKeyEnc) {
    try {
      return { baseUrl: v.baseUrl, instanceName: v.instanceName, apiKey: decryptSecret(v.apiKeyEnc) };
    } catch {
      console.error(`⚠️ Não foi possível decifrar a chave da conexão do usuário ${userId} (JWT_SECRET mudou?).`);
      return null;
    }
  }
  return migrateLegacyInstance(userId);
}

/**
 * Versão anterior guardava nome/token da instância nas colunas de `users` (sem a URL).
 * Se EVOLUTION_BASE_URL ainda existir no servidor, a conexão é migrada sozinha para o novo formato.
 */
async function migrateLegacyInstance(userId: string): Promise<Connection | null> {
  const db = getDb();
  const u = await db.user.findUnique({ where: { id: userId } });
  const baseUrl = parseBaseUrl(process.env.EVOLUTION_BASE_URL);
  if (!u?.evoInstanceName || !u?.evoInstanceToken || !baseUrl) return null;
  const conn = { baseUrl, instanceName: u.evoInstanceName, apiKey: u.evoInstanceToken };
  await saveConnection(userId, conn);
  await db.user.update({ where: { id: userId }, data: { evoInstanceName: null, evoInstanceToken: null } });
  console.log(`🔁 Conexão da instância "${conn.instanceName}" migrada para o formato por usuário.`);
  return conn;
}

/** Instance name left by the previous version, used only to pre-fill the form (never the token). */
async function legacyInstanceName(userId: string): Promise<string> {
  const u = await getDb().user.findUnique({ where: { id: userId } });
  return u?.evoInstanceToken && u?.evoInstanceName ? u.evoInstanceName : '';
}

async function saveConnection(userId: string, c: Connection): Promise<void> {
  const value = { baseUrl: c.baseUrl, instanceName: c.instanceName, apiKeyEnc: encryptSecret(c.apiKey) };
  await getDb().appSetting.upsert({
    where: { userId_key: { userId, key: SETTING_KEY } },
    create: { userId, key: SETTING_KEY, value },
    update: { value, updatedAt: new Date() },
  });
}

/**
 * Dados anteriores ao multiusuário (user_id = '') passam para o administrador,
 * incluindo a antiga configuração global do gateway, que vira a conexão dele.
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

    const legacyGateway = legacySettings.find((s) => s.key === 'gateway_config')?.value as any;
    if (legacyGateway?.baseUrl && legacyGateway?.instanceName && legacyGateway?.apiKey && !(await loadConnection(adminId))) {
      const baseUrl = parseBaseUrl(legacyGateway.baseUrl);
      if (baseUrl) {
        await saveConnection(adminId, {
          baseUrl,
          instanceName: String(legacyGateway.instanceName),
          apiKey: String(legacyGateway.apiKey),
        });
      }
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
      // O gateway antigo já virou conexão do admin; a flag de seed não existe mais
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

  // ---------- The user's own connection settings ----------
  app.get('/api/whatsapp/config', async (req, res) => {
    const conn = await loadConnection(userId(req));
    res.json({
      provider: 'evolution',
      configured: Boolean(conn),
      baseUrl: conn?.baseUrl || '',
      instanceName: conn?.instanceName || (await legacyInstanceName(userId(req))),
      hasApiKey: Boolean(conn),
      apiKeyHint: keyHint(conn?.apiKey || ''),
    });
  });

  // A blank apiKey keeps the one already saved
  app.put('/api/whatsapp/settings', async (req, res) => {
    const uid = userId(req);
    const baseUrl = parseBaseUrl(req.body?.baseUrl);
    if (!baseUrl) return res.status(400).json({ error: 'Informe uma URL válida (http:// ou https://).' });

    const instanceName = String(req.body?.instanceName ?? '').trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(instanceName)) {
      return res.status(400).json({ error: 'Nome da instância inválido (use letras, números, _ . -).' });
    }

    let apiKey = String(req.body?.apiKey ?? '').trim();
    if (apiKey && /^https?:\/\//i.test(apiKey)) {
      return res.status(400).json({ error: 'O campo de chave parece conter uma URL. Cole a chave de API.' });
    }
    if (!apiKey) apiKey = (await loadConnection(uid))?.apiKey || '';
    if (!apiKey) return res.status(400).json({ error: 'Informe a chave de API (token) da sua instância.' });

    try {
      await assertPublicHost(baseUrl);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    await saveConnection(uid, { baseUrl, instanceName, apiKey });
    res.json({ success: true });
  });

  app.delete('/api/whatsapp/settings', async (req, res) => {
    await db.appSetting.deleteMany({ where: { userId: userId(req), key: SETTING_KEY } });
    res.json({ success: true });
  });

  // Tests the typed values (or, for blank fields, the saved ones) without saving
  app.post('/api/whatsapp/settings/test', async (req, res) => {
    const saved = await loadConnection(userId(req));
    const typedUrl = String(req.body?.baseUrl ?? '').trim();
    const baseUrl = typedUrl ? parseBaseUrl(typedUrl) : saved?.baseUrl || null;
    const instanceName = String(req.body?.instanceName ?? '').trim() || saved?.instanceName || '';
    const apiKey = String(req.body?.apiKey ?? '').trim() || saved?.apiKey || '';
    const result = { reachable: false, keyValid: false, connected: false, message: '' };

    if (!baseUrl) {
      result.message = typedUrl ? 'URL inválida (use http:// ou https://).' : 'Informe a URL do servidor.';
      return res.json(result);
    }
    try {
      await assertPublicHost(baseUrl);
    } catch (err: any) {
      result.message = err.message;
      return res.json(result);
    }
    if (!apiKey) {
      result.message = 'Informe a chave de API.';
      return res.json(result);
    }

    const call = async (path: string) => {
      const r = await fetch(`${baseUrl}${path}`, {
        headers: { apikey: apiKey },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      return { status: r.status, text: await r.text().catch(() => '') };
    };

    try {
      let r = await call('/instance/status');
      if (r.status === 404 && instanceName) r = await call(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
      result.reachable = true;
      if (r.status === 401 || r.status === 403) {
        result.message = 'Servidor acessível, mas a chave de API foi recusada. Confira o token da instância.';
      } else if (r.status >= 200 && r.status < 300) {
        result.keyValid = true;
        result.connected = /"LoggedIn"\s*:\s*true|"state"\s*:\s*"open"/.test(r.text);
        result.message = result.connected
          ? 'Conexão ok e WhatsApp já conectado nesta instância.'
          : 'Conexão ok. Agora gere o QR Code para conectar o seu WhatsApp.';
      } else if (r.status === 404) {
        result.message = 'Servidor acessível, mas a instância ou a rota não foi encontrada. Confira o nome da instância.';
      } else {
        result.message = `O servidor respondeu HTTP ${r.status}.`;
      }
    } catch (err: any) {
      result.reachable = false;
      result.message = `Servidor inacessível: ${err?.message || err}`;
    }
    res.json(result);
  });

  // ---------- Proxy ----------
  // The browser only says WHICH Evolution path to call. Host and credentials always come from the
  // logged user's saved connection, so a request can't reach other hosts or use other credentials.
  app.post('/api/whatsapp-proxy', async (req, res) => {
    try {
      const { url, method = 'GET', payload } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

      const conn = await loadConnection(userId(req));
      if (!conn) {
        return envelope(res, 503, 'Configure a conexão com a Evolution API na tela de Conexão (botão "Configurar conexão").');
      }

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
      const upperMethod = String(method).toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) {
        return res.status(400).json({ error: 'Método inválido.' });
      }

      try {
        await assertPublicHost(conn.baseUrl);
      } catch (err: any) {
        return envelope(res, 503, err.message);
      }

      const hasBody = payload && ['POST', 'PUT', 'PATCH'].includes(upperMethod);
      const headers = new Headers();
      headers.set('Accept', '*/*');
      headers.set('apikey', conn.apiKey);
      if (hasBody) headers.set('Content-Type', 'application/json');
      const init: RequestInit = {
        method: upperMethod,
        headers,
        body: hasBody ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : undefined,
        redirect: 'manual', // a redirect could send the request (and the key) to another host
        signal: AbortSignal.timeout(60000),
      };

      let apiRes = await fetch(`${conn.baseUrl}${path}`, init);

      // Some Evolution builds only accept the token as a query param
      if ([401, 403, 404].includes(apiRes.status)) {
        const sep = path.includes('?') ? '&' : '?';
        try {
          const fallback = await fetch(`${conn.baseUrl}${path}${sep}apikey=${encodeURIComponent(conn.apiKey)}`, init);
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

  // ---------- Admin: user list ----------
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
    const conns = await db.appSetting.findMany({ where: { key: SETTING_KEY } });
    const byUser = new Map(conns.map((c) => [c.userId, c.value as any]));
    res.json(
      users.map((u) => {
        const c = byUser.get(u.id);
        return {
          id: u.id,
          email: u.email,
          emailVerified: u.emailVerified,
          instanceName: c?.instanceName || '',
          serverHost: c?.baseUrl ? new URL(c.baseUrl).host : '',
          createdAt: u.createdAt.toISOString(),
        };
      })
    );
  });
}
