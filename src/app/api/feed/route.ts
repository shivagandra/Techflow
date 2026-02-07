import { fetchFeedItems, getSourceList } from "@/lib/feed";
import { NextResponse } from "next/server";

type FeedCache = {
  items: Awaited<ReturnType<typeof fetchFeedItems>>;
  fetchedAt: number;
};

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

declare global {
  var techflowCache: FeedCache | undefined;
}

const getCache = () => globalThis.techflowCache;
const setCache = (cache: FeedCache) => {
  globalThis.techflowCache = cache;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  const now = Date.now();
  const cache = getCache();

  if (!force && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      items: cache.items,
      fetchedAt: cache.fetchedAt,
      sources: getSourceList(),
      cached: true,
    });
  }

  const items = await fetchFeedItems();
  const fetchedAt = Date.now();
  setCache({ items, fetchedAt });

  return NextResponse.json({
    items,
    fetchedAt,
    sources: getSourceList(),
    cached: false,
  });
}
