import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

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
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
    async signIn({ user }) {
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
      if (session.user && user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      if (session.user && token?.role) {
        session.user.role = token.role;
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
