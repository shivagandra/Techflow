import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Update .env with your Postgres URL.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const useAccelerate = databaseUrl.startsWith("prisma+postgres://");
const prisma =
  globalThis.prisma ??
  (useAccelerate
    ? new PrismaClient({ accelerateUrl: databaseUrl })
    : new PrismaClient());

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
