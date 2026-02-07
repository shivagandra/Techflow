import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Body = {
  articleId: string;
  title: string;
  url: string;
  source: string;
  category: string;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collection = await prisma.collection.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  if (!body.articleId || !body.url) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await prisma.collectionItem.upsert({
    where: {
      collectionId_articleId: {
        collectionId: params.id,
        articleId: body.articleId,
      },
    },
    create: {
      collectionId: params.id,
      articleId: body.articleId,
      title: body.title,
      url: body.url,
      source: body.source,
      category: body.category,
    },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collection = await prisma.collection.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { articleId?: string };
  if (!body.articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }

  await prisma.collectionItem.deleteMany({
    where: {
      collectionId: params.id,
      articleId: body.articleId,
    },
  });

  return NextResponse.json({ ok: true });
}
