import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type Payload = {
  type: "session_start" | "session_end" | "open";
  domain?: string;
  category?: string;
  duration?: number;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const body = (await request.json()) as Payload;
  const prisma = getPrisma();

  await prisma.analyticsEvent.create({
    data: {
      type: body.type,
      domain: body.domain,
      category: body.category,
      duration: body.duration,
      userId: session?.user?.id,
    },
  });

  if (session?.user?.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { updatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
