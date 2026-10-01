import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getDb } from '../db/index';
import { isAdminEmail } from './admin';
import { claimLegacyData } from './evolution';

const COOKIE_NAME = 'zz_session';
const SESSION_DAYS = 7;
const VERIFY_HOURS = 24;
const MIN_PASSWORD = 8;
const isProd = process.env.NODE_ENV === 'production';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (isProd) throw new Error('JWT_SECRET é obrigatório em produção.');
    console.warn('⚠️ JWT_SECRET ausente: usando segredo temporário (sessões caem ao reiniciar o servidor).');
    return crypto.randomBytes(32).toString('hex');
  })();

// Hash used to keep login timing equal when the e-mail does not exist
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

// ---------- helpers ----------
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const normalizeEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();
const isValidEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function appUrl(): string {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function setSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd && appUrl().startsWith('https'),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

/** Tiny in-memory rate limiter (per IP + route). Enough to slow brute force on a single instance. */
function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    next();
  };
}

// ---------- e-mail ----------
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

class EmailDeliveryError extends Error {}

const EMAIL_FAILED_MSG =
  'Sua conta foi criada, mas não conseguimos enviar o e-mail de confirmação agora. Tente "Reenviar link" em alguns minutos ou avise o administrador.';

/** Logs the real reason (SMTP code, server answer) so it shows up in the container logs. */
function logMailError(context: string, err: any) {
  console.error(
    `📧 Falha de e-mail (${context}): code=${err?.code ?? '-'} command=${err?.command ?? '-'} responseCode=${err?.responseCode ?? '-'} msg=${err?.message}`
  );
}

/** Called once at startup: checks the SMTP login and writes the result to the log. */
export async function verifyMailerOnStartup() {
  const tx = getTransporter();
  if (!tx) {
    const msg = 'SMTP_HOST não definido: e-mails de confirmação NÃO serão enviados.';
    isProd ? console.error(`⛔ ${msg}`) : console.warn(`⚠️ ${msg} (em dev o link aparece no console)`);
    return;
  }
  try {
    await Promise.race([
      tx.verify(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout de 15s ao conectar no SMTP')), 15000)),
    ]);
    console.log(`✅ SMTP ok: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} (usuário ${process.env.SMTP_USER || 'sem login'})`);
  } catch (err: any) {
    logMailError(`verificação no início, host ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`, err);
  }
}

async function sendVerificationEmail(to: string, rawToken: string) {
  const link = `${appUrl()}/api/auth/verify?token=${rawToken}`;
  const tx = getTransporter();

  if (!tx) {
    if (isProd) {
      console.error('⛔ SMTP_HOST não definido: impossível enviar o e-mail de confirmação.');
      throw new EmailDeliveryError('SMTP não configurado');
    }
    console.log(`\n📧 [DEV] SMTP não configurado. Link de confirmação para ${to}:\n   ${link}\n`);
    return;
  }

  try {
    await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Confirme seu e-mail — WhatsApp Connect & Disparos',
    text: `Olá!\n\nPara ativar sua conta, abra o link abaixo (válido por ${VERIFY_HOURS} horas):\n${link}\n\nSe você não criou esta conta, ignore este e-mail.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111827">
        <h2 style="color:#059669">Confirme seu e-mail</h2>
        <p>Para ativar sua conta no <b>WhatsApp Connect &amp; Disparos</b>, clique no botão abaixo.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar e-mail</a>
        </p>
        <p style="font-size:13px;color:#6b7280">O link vale por ${VERIFY_HOURS} horas. Se o botão não funcionar, copie e cole este endereço no navegador:<br>${link}</p>
        <p style="font-size:13px;color:#6b7280">Se você não criou esta conta, ignore este e-mail.</p>
      </div>`,
    });
  } catch (err: any) {
    logMailError(`envio para ${to}`, err);
    throw new EmailDeliveryError(err?.message);
  }
}

async function issueVerification(userId: string, email: string) {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.user.update({
    where: { id: userId },
    data: {
      verifyTokenHash: sha256(rawToken),
      verifyTokenExpires: new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000),
    },
  });
  await sendVerificationEmail(email, rawToken);
}

// ---------- middleware ----------
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Health check stays public
  if (req.path === '/health') return next();
  try {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await getDb().user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user || !user.emailVerified) return res.status(401).json({ error: 'Não autenticado.' });
    (req as any).userId = user.id;
    (req as any).userEmail = user.email;
    (req as any).isAdmin = isAdminEmail(user.email);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// ---------- routes ----------
export function registerAuthRoutes(app: Express) {
  const db = getDb();
  const GENERIC_REGISTER_MSG =
    'Se o e-mail puder ser cadastrado, enviamos um link de confirmação. Verifique sua caixa de entrada (e o spam).';

  app.post('/api/auth/register', rateLimit(10, 60 * 60 * 1000), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? '');
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
      if (password.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.` });
      }
      if (Buffer.byteLength(password) > 72) {
        return res.status(400).json({ error: 'A senha deve ter no máximo 72 caracteres.' });
      }

      const existing = await db.user.findUnique({ where: { email } });
      if (existing?.emailVerified) {
        // Do not reveal that the account exists
        return res.json({ success: true, message: GENERIC_REGISTER_MSG });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = existing
        ? await db.user.update({ where: { id: existing.id }, data: { passwordHash } })
        : await db.user.create({ data: { id: crypto.randomUUID(), email, passwordHash } });

      await issueVerification(user.id, email);
      res.json({ success: true, message: GENERIC_REGISTER_MSG });
    } catch (err: any) {
      if (err instanceof EmailDeliveryError) {
        return res.status(502).json({ code: 'EMAIL_SEND_FAILED', error: EMAIL_FAILED_MSG });
      }
      console.error(`Error registering user: code=${err?.code ?? '-'} name=${err?.name} msg=${err?.message}`);
      res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
    }
  });

  app.post('/api/auth/resend', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (isValidEmail(email)) {
        const user = await db.user.findUnique({ where: { email } });
        if (user && !user.emailVerified) await issueVerification(user.id, email);
      }
      res.json({ success: true, message: 'Se existir uma conta pendente para este e-mail, reenviamos o link.' });
    } catch (err: any) {
      if (err instanceof EmailDeliveryError) {
        return res.status(502).json({ code: 'EMAIL_SEND_FAILED', error: EMAIL_FAILED_MSG });
      }
      console.error(`Error resending verification: code=${err?.code ?? '-'} msg=${err?.message}`);
      res.status(500).json({ error: 'Não foi possível reenviar o e-mail. Tente novamente.' });
    }
  });

  app.get('/api/auth/verify', async (req, res) => {
    try {
      const token = String(req.query.token ?? '');
      const user = token
        ? await db.user.findUnique({ where: { verifyTokenHash: sha256(token) } })
        : null;
      if (!user || !user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
        return res.redirect('/?verified=0');
      }
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true, verifyTokenHash: null, verifyTokenExpires: null },
      });
      res.redirect('/?verified=1');
    } catch (err) {
      console.error('Error verifying e-mail:', err);
      res.redirect('/?verified=0');
    }
  });

  app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? '');
      const user = email ? await db.user.findUnique({ where: { email } }) : null;
      const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      if (!user.emailVerified) {
        return res.status(403).json({
          code: 'EMAIL_NOT_VERIFIED',
          error: 'Confirme seu e-mail antes de entrar. Enviamos um link de ativação para a sua caixa de entrada.',
        });
      }
      const isAdmin = isAdminEmail(user.email);
      if (isAdmin) await claimLegacyData(user.id);
      setSessionCookie(res, user.id);
      res.json({ user: { id: user.id, email: user.email, isAdmin } });
    } catch (err) {
      console.error('Error logging in:', err);
      res.status(500).json({ error: 'Não foi possível entrar. Tente novamente.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const token = readCookie(req, COOKIE_NAME);
      if (!token) return res.status(401).json({ error: 'Não autenticado.' });
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      const user = await db.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.emailVerified) return res.status(401).json({ error: 'Não autenticado.' });
      res.json({ user: { id: user.id, email: user.email, isAdmin: isAdminEmail(user.email) } });
    } catch {
      res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
  });
}
