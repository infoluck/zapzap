/**
 * Gera (uma vez) os arquivos de deploy com segredos novos. Tudo vai para deploy/ (ignorado pelo git).
 * Os segredos NÃO são impressos no terminal.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'deploy');
fs.mkdirSync(outDir, { recursive: true });

const sqlFile = path.join(outDir, 'setup-db.local.sql');
const envFile = path.join(outDir, 'easypanel.env.local');
if (fs.existsSync(sqlFile) || fs.existsSync(envFile)) {
  console.error('Arquivos de deploy já existem em deploy/. Apague-os antes de gerar de novo (a senha mudaria).');
  process.exit(1);
}

const dev = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const dbPassword = crypto.randomBytes(24).toString('base64url'); // só [A-Za-z0-9_-]: seguro em URL
const jwtSecret = crypto.randomBytes(48).toString('hex');

const sql = `-- Execute como usuário "postgres" no console do serviço Postgres (Easypanel), UMA vez.
-- Cria um usuário e um banco exclusivos do ZapZap. Não toca em nenhum outro banco.
-- Pode ser executado de novo sem efeitos colaterais.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zapzap_app') THEN
    CREATE ROLE zapzap_app LOGIN PASSWORD '${dbPassword}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
  END IF;
END
$$;

-- CREATE DATABASE não roda dentro de transação: o \\gexec executa só se o banco ainda não existir
SELECT 'CREATE DATABASE zapzap OWNER zapzap_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zapzap')
\\gexec

-- Só o usuário do app entra no banco zapzap
REVOKE ALL ON DATABASE zapzap FROM PUBLIC;
GRANT CONNECT ON DATABASE zapzap TO zapzap_app;

-- Conferência
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolconnlimit FROM pg_roles WHERE rolname = 'zapzap_app';
SELECT datname, pg_get_userbyid(datdba) AS dono FROM pg_database WHERE datname = 'zapzap';
`;

const pick = (k) => dev[k] ?? '';
const env = `# Variáveis de ambiente do app no Easypanel (aba Environment). NÃO versionar.

NODE_ENV=production
PORT=3000

# Banco dedicado do ZapZap. Troque HOST_INTERNO pelo "Internal Host" do serviço Postgres no Easypanel.
DATABASE_URL="postgresql://zapzap_app:${dbPassword}@HOST_INTERNO:5432/zapzap?schema=public&connection_limit=5&pool_timeout=20"

# Endereço público do app (https obrigatório: o cookie de sessão só é "secure" com https)
APP_URL="https://TROQUE-PELO-DOMINIO-DO-APP"

JWT_SECRET="${jwtSecret}"
ADMIN_EMAILS="${pick('ADMIN_EMAILS')}"

SMTP_HOST="${pick('SMTP_HOST')}"
SMTP_PORT="${pick('SMTP_PORT')}"
SMTP_USER="${pick('SMTP_USER')}"
SMTP_PASS="${pick('SMTP_PASS')}"
SMTP_FROM="${pick('SMTP_FROM')}"

EVOLUTION_BASE_URL="${pick('EVOLUTION_BASE_URL')}"
EVOLUTION_GLOBAL_API_KEY="${pick('EVOLUTION_GLOBAL_API_KEY')}"
`;

fs.writeFileSync(sqlFile, sql);
fs.writeFileSync(envFile, env);
console.log('✅ Gerados (segredos não exibidos):');
console.log('   deploy/setup-db.local.sql');
console.log('   deploy/easypanel.env.local');
console.log(`   senha do banco: ${dbPassword.length} caracteres | JWT_SECRET: ${jwtSecret.length} caracteres`);
console.log(`   EVOLUTION_GLOBAL_API_KEY ${pick('EVOLUTION_GLOBAL_API_KEY') ? 'copiada do .env' : 'VAZIA no .env (preencher)'}`);
