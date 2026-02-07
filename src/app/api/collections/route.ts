import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const ensureDefaults = async (userId: string) => {
  const existing = await prisma.collection.findMany({
    where: { userId },
    include: { items: true },
  });

  const defaults = ["Saved", "Learning", "To Watch"];
  type ExistingCollection = (typeof existing)[number];
  const existingNames = new Set(
    existing.map((collection: ExistingCollection) => collection.name)
  );
  const missing = defaults.filter((name) => !existingNames.has(name));

  if (missing.length === 0) return existing;

  const created = await prisma.$transaction(
    missing.map((name) =>
      prisma.collection.create({
        data: {
          name,
          userId,
        },
        include: { items: true },
      })
    )
  );

  return [...existing, ...created];
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json([], { status: 200 });
  }

  const collections = await ensureDefaults(session.user.id);

  type CollectionWithItems = (typeof collections)[number];
  type CollectionItem = CollectionWithItems["items"][number];
  return NextResponse.json(
    collections.map((collection: CollectionWithItems) => ({
      id: collection.id,
      name: collection.name,
      itemIds: collection.items.map((item: CollectionItem) => item.articleId),
    }))
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const collection = await prisma.collection.create({
    data: {
      name: body.name,
      userId: session.user.id,
    },
    include: { items: true },
  });

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    itemIds: [],
  });
}
