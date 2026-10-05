import { PrismaClient } from '@prisma/client';

declare global {
  var _prisma: PrismaClient | undefined;
}

// O Postgres de produção é compartilhado com outros sistemas e tem um limite total de conexões.
// Sem limite explícito o Prisma abre CPUs × 2 + 1 conexões, o que esgota o servidor.
const DEFAULT_POOL = 3;
const MAX_POOL = Number(process.env.DB_POOL_MAX) || 5;

/** Garante um pool pequeno: aplica um padrão se faltar e nunca deixa passar do teto (DB_POOL_MAX, padrão 5). */
export function withPoolLimits(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const requested = Number(url.searchParams.get('connection_limit'));
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_POOL) : DEFAULT_POOL;
    url.searchParams.set('connection_limit', String(limit));
    if (!url.searchParams.get('pool_timeout')) url.searchParams.set('pool_timeout', '20');
    return url.toString();
  } catch {
    return raw;
  }
}

export function getDb(): PrismaClient {
  if (!global._prisma) {
    global._prisma = new PrismaClient({ datasourceUrl: withPoolLimits(process.env.DATABASE_URL) });
  }
  return global._prisma;
}

/** Fecha as conexões ao encerrar, para não deixar slots presos no Postgres durante um redeploy. */
export async function closeDb(): Promise<void> {
  if (global._prisma) {
    await global._prisma.$disconnect();
    global._prisma = undefined;
  }
}
