import { PrismaClient } from '@prisma/client';

declare global {
  var _prisma: PrismaClient | undefined;
}

export function getDb(): PrismaClient {
  if (!global._prisma) {
    global._prisma = new PrismaClient();
  }
  return global._prisma;
}
