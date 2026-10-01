/**
 * Exporta os dados do banco apontado por DATABASE_URL para um arquivo JSON.
 * Uso: node scripts/export-data.mjs [arquivo]   (padrão: deploy/zapzap-data.local.json)
 * O arquivo contém dados pessoais (contatos, conversas): nunca versionar nem compartilhar.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pkg from '@prisma/client';
import { inspectDatabaseUrl } from './db-guard.mjs';

const { PrismaClient } = pkg;
const out = process.argv[2] || 'deploy/zapzap-data.local.json';
const db = inspectDatabaseUrl();
const prisma = new PrismaClient();

try {
  const data = {
    exportedFrom: `${db.host}:${db.port}/${db.database}`,
    exportedAt: new Date().toISOString(),
    profile: await prisma.profile.findMany(),
    contact: await prisma.contact.findMany(),
    template: await prisma.template.findMany(),
    chat: await prisma.chat.findMany(),
    chatMessage: await prisma.chatMessage.findMany(),
    campaign: await prisma.campaign.findMany(),
    appSetting: await prisma.appSetting.findMany(),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  const counts = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}=${v.length}`)
    .join('  ');
  console.log(`✅ Exportado para ${out}\n   ${counts}`);
} finally {
  await prisma.$disconnect();
}
