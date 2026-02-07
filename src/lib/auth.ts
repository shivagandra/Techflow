import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getPrisma } from "@/lib/prisma";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const prisma = getPrisma();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async jwt({ token, user }) {
      const prisma = getPrisma();
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
    async signIn({ user }) {
      const prisma = getPrisma();
      if (!user.email) return false;
      if (adminEmails.includes(user.email.toLowerCase())) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { role: "ADMIN" },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
            role: "ADMIN",
          },
        });
      }
      return true;
    },
    async session({ session, user, token }) {
      if (session.user) {
        if (user?.id) {
          session.user.id = user.id;
        }
        if (token?.role) {
          session.user.role = token.role;
        } else if (user?.id) {
          const prisma = getPrisma();
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          session.user.role = dbUser?.role ?? "USER";
        }
      }
      return session;
    },
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "USER" | "ADMIN";
  }
}
