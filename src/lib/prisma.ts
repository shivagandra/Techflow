import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}

const databaseUrl = process.env.DATABASE_URL;
const useAccelerate = Boolean(
  databaseUrl && databaseUrl.startsWith("prisma+postgres://")
);
const prisma =
  globalThis.prisma ??
  (useAccelerate && databaseUrl
    ? new PrismaClient({ accelerateUrl: databaseUrl })
    : new PrismaClient());

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
