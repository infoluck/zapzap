/**
 * Importa um arquivo gerado por export-data.mjs para o banco de DATABASE_URL.
 * Uso: node scripts/import-data.mjs <arquivo.json>
 *
 * - Passa pela trava db-guard (só roda no banco esperado).
 * - Só insere: linhas que já existem são ignoradas (skipDuplicates), nada é apagado ou sobrescrito.
 * - Pode ser executado de novo sem duplicar dados.
 */
import 'dotenv/config';
import fs from 'node:fs';
import pkg from '@prisma/client';
import { assertSafe } from './db-guard.mjs';

const { PrismaClient } = pkg;
const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Uso: node scripts/import-data.mjs <arquivo.json>');
  process.exit(1);
}

assertSafe('deploy');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const prisma = new PrismaClient();

// Ordem não importa (não há chaves estrangeiras), mas mantemos uma sequência estável
const TABLES = [
  ['profile', 'contact_profiles'],
  ['contact', 'contacts'],
  ['template', 'message_templates'],
  ['chat', 'chats'],
  ['chatMessage', 'chat_messages'],
  ['campaign', 'campaigns'],
  ['appSetting', 'app_settings'],
];

try {
  for (const [model, label] of TABLES) {
    const rows = data[model] ?? [];
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await prisma[model].createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`  ${label.padEnd(18)} arquivo=${String(rows.length).padStart(5)}  inseridos=${String(inserted).padStart(5)}`);
  }
  console.log('✅ Importação concluída.');
} finally {
  await prisma.$disconnect();
}
