import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & { prisma?: PrismaClient };
const globalForPrisma = globalThis as PrismaGlobal;

if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}

let prismaSingleton: PrismaClient | undefined = globalForPrisma.prisma;

export const getPrisma = () => {
  if (prismaSingleton) return prismaSingleton;

  const databaseUrl = process.env.DATABASE_URL;
  const useAccelerate = Boolean(
    databaseUrl && databaseUrl.startsWith("prisma+postgres://")
  );

  prismaSingleton =
    useAccelerate && databaseUrl
      ? new PrismaClient({ accelerateUrl: databaseUrl })
      : new PrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaSingleton;
  }

  return prismaSingleton;
};
