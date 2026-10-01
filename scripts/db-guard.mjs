/**
 * Trava de segurança para comandos de banco.
 *
 * O servidor de produção hospeda outros bancos. Este script impede que migrations
 * ou importações rodem contra qualquer banco que não seja o do ZapZap.
 *
 * Uso: node scripts/db-guard.mjs <modo>
 *   deploy -> migrations/importação: exige o banco esperado e, em servidor remoto,
 *             um usuário dedicado (nunca "postgres")
 *   local  -> comandos destrutivos de desenvolvimento (migrate dev/reset): só em localhost
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';

const EXPECTED_DB = process.env.DB_EXPECTED_NAME || 'zapzap';
const SUPERUSERS = new Set(['postgres', 'root', 'admin', 'administrator']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function inspectDatabaseUrl(raw = process.env.DATABASE_URL) {
  if (!raw) throw new Error('DATABASE_URL não está definida.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL inválida (não foi possível interpretar).');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    schema: url.searchParams.get('schema') || 'public',
    connectionLimit: url.searchParams.get('connection_limit'),
    isLocal: LOCAL_HOSTS.has(url.hostname),
  };
}

export function assertSafe(mode = 'deploy') {
  const db = inspectDatabaseUrl();
  const where = `${db.user}@${db.host}:${db.port}/${db.database} (schema ${db.schema})`;
  const fail = (msg) => {
    console.error(`\n⛔ db-guard: ${msg}\n   Alvo: ${where}\n`);
    process.exit(1);
  };

  if (mode === 'local') {
    if (!db.isLocal) {
      fail('este comando é só para o banco local de desenvolvimento. No servidor use "npm run db:deploy".');
    }
    return db;
  }

  if (db.database !== EXPECTED_DB) {
    fail(`o banco deve se chamar "${EXPECTED_DB}", mas a URL aponta para "${db.database}".`);
  }
  if (!db.isLocal) {
    if (SUPERUSERS.has(db.user.toLowerCase())) {
      fail(`em servidor remoto use o usuário dedicado do app (ex.: zapzap_app), nunca "${db.user}".`);
    }
    if (!db.connectionLimit) {
      fail('inclua "connection_limit" (ex.: ?connection_limit=5) na DATABASE_URL para não esgotar as conexões do servidor compartilhado.');
    }
  }
  console.log(`✅ db-guard: alvo permitido -> ${where}`);
  return db;
}

// Executado direto pela linha de comando
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    assertSafe(process.argv[2] || 'deploy');
  } catch (err) {
    console.error(`\n⛔ db-guard: ${err.message}\n`);
    process.exit(1);
  }
}
