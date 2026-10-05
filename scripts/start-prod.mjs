/**
 * Início do container: trava de banco -> migrations -> servidor.
 *
 * Se o Postgres estiver sem conexões livres (ex.: "remaining connection slots are reserved..."),
 * as migrations são tentadas de novo com espera, em vez de derrubar o container. Um loop de
 * reinicializações só piora o problema, pois cada tentativa abre mais uma conexão.
 * Erros que não são de conexão (SQL inválido, migration quebrada) falham na hora.
 */
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { assertSafe } from './db-guard.mjs';

const RETRIES = Number(process.env.DB_MIGRATE_RETRIES ?? 8);
const BASE_DELAY_S = Number(process.env.DB_MIGRATE_DELAY_S ?? 10);

// Erros que justificam esperar e tentar de novo
const TRANSIENT =
  /remaining connection slots|too many clients|too many connections|53300|57P03|starting up|Can't reach database server|P1001|P1002|P1017|ECONNREFUSED|ETIMEDOUT|timed out|Connection refused|Connection reset/i;

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

assertSafe('deploy');

function runMigrations() {
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(bin, ['prisma', 'migrate', 'deploy'], { encoding: 'utf8', shell: process.platform === 'win32' });
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  return { ok: res.status === 0, output: `${res.stdout || ''}\n${res.stderr || ''}` };
}

for (let attempt = 1; ; attempt++) {
  const { ok, output } = runMigrations();
  if (ok) break;

  if (!TRANSIENT.test(output)) {
    console.error('\n⛔ As migrations falharam por um motivo que não é de conexão. Não vou tentar de novo.');
    process.exit(1);
  }
  if (attempt > RETRIES) {
    console.error(`\n⛔ O Postgres continuou sem conexões livres após ${attempt} tentativas.`);
    console.error('   Veja quem está usando as conexões e/ou aumente max_connections no servidor (consulta no README de deploy).');
    process.exit(1);
  }
  const wait = Math.min(BASE_DELAY_S * 2 ** (attempt - 1), 60);
  console.warn(`\n⏳ Postgres sem conexões livres (tentativa ${attempt}/${RETRIES + 1}). Nova tentativa em ${wait}s...\n`);
  await sleep(wait);
}

// Servidor: repassa sinais para ele encerrar com calma (e fechar as conexões do banco)
const server = spawn(process.execPath, ['dist/server.cjs'], { stdio: 'inherit' });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.kill(sig));
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
