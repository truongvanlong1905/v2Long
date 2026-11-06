import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function resolveIndependentSqliteUrl(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'packages', 'database', 'prisma', 'independent_v2.db'),
    path.resolve(cwd, '..', '..', 'packages', 'database', 'prisma', 'independent_v2.db'),
    path.resolve(cwd, 'prisma', 'independent_v2.db'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.dirname(candidate))) {
      return `file:${candidate.replace(/\\/g, '/')}`;
    }
  }
  return `file:${candidates[0].replace(/\\/g, '/')}`;
}

if (
  process.env.NODE_ENV !== 'production' &&
  (!process.env.DATABASE_URL ||
    process.env.DATABASE_URL === 'file:./independent_v2.db' ||
    process.env.DATABASE_URL === 'file:./dev.db')
) {
  process.env.DATABASE_URL = resolveIndependentSqliteUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
export * from './operations';
