"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedCategory, FeedItem } from "@/lib/types";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

type FeedResponse = {
  items: FeedItem[];
  fetchedAt: number;
  sources: string[];
  cached: boolean;
};

type Collection = {
  id: string;
  name: string;
  itemIds: string[];
};

const CATEGORY_ORDER: FeedCategory[] = [
  "Industry News",
  "Product Launches",
  "Research Papers",
  "Open Source",
  "Tech Conferences",
  "Tech Jobs",
];

const sortOptions = ["Newest", "Trending"] as const;
type SortOption = (typeof sortOptions)[number];

const storage = {
  read: "techflow.read",
  hidden: "techflow.hidden",
};

const LIVE_POLL_MS = 60_000;

const safeJSON = <T,>(value: string | null, fallback: T) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const useLocalStorage = <T,>(key: string, fallback: T) => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    return safeJSON<T>(localStorage.getItem(key), fallback);
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
};

const formatTime = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const timeAgo = (value: string) => {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(delta / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const splitTags = (items: FeedItem[]) => {
  const tagSet = new Set<string>();
  items.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)));
  return Array.from(tagSet).sort();
};

const fetchFeed = async (): Promise<FeedResponse> => {
  const response = await fetch("/api/feed", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load feed.");
  }
  return response.json();
};

const fetchCollections = async (): Promise<Collection[]> => {
  const response = await fetch("/api/collections", { cache: "no-store" });
  if (!response.ok) return [];
  return response.json();
};

const sendAnalytics = async (payload: {
  type: "session_start" | "session_end" | "open";
  domain?: string;
  category?: string;
  duration?: number;
}) => {
  await fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export default function FeedApp() {
  const { data: session } = useSession();
  const user = session?.user;

  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(true);
  const [lastPulse, setLastPulse] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [useSse, setUseSse] = useState(true);

  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<FeedCategory[]>(
    CATEGORY_ORDER
  );
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("Newest");
  const [visibleCount, setVisibleCount] = useState(25);
  const [activeCollection, setActiveCollection] = useState<string>("all");
  const [collections, setCollections] = useState<Collection[]>([]);

  const [readItems, setReadItems] = useLocalStorage<string[]>(
    storage.read,
    []
  );
  const [hiddenItems, setHiddenItems] = useLocalStorage<string[]>(
    storage.hidden,
    []
  );

  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchFeed();
        setItems(response.items);
        setSources(response.sources);
        setFetchedAt(response.fetchedAt);
        setLastPulse(response.fetchedAt);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load feed.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) {
      setCollections([]);
      return;
    }
    const loadCollections = async () => {
      const data = await fetchCollections();
      setCollections(data);
    };
    loadCollections();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    sessionStartRef.current = Date.now();
    sendAnalytics({ type: "session_start" }).catch(() => undefined);

    return () => {
      const startedAt = sessionStartRef.current;
      if (!startedAt) return;
      const duration = Date.now() - startedAt;
      sendAnalytics({ type: "session_end", duration }).catch(() => undefined);
    };
  }, [user]);

  useEffect(() => {
    if (!live) return;
    if (!useSse) {
      const interval = setInterval(async () => {
        try {
          const response = await fetchFeed();
          setItems(response.items);
          setSources(response.sources);
          setFetchedAt(response.fetchedAt);
          setLastPulse(response.fetchedAt);
        } catch {
          // silent
        }
      }, LIVE_POLL_MS);
      return () => clearInterval(interval);
    }

    const source = new EventSource("/api/stream");
    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "refresh") {
          const response = await fetchFeed();
          setItems(response.items);
          setSources(response.sources);
          setFetchedAt(response.fetchedAt);
          setLastPulse(response.fetchedAt);
        }
      } catch {
        // ignore parsing errors
      }
    };
    source.onerror = () => {
      source.close();
      setUseSse(false);
    };
    return () => source.close();
  }, [live, useSse]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      const response = await fetch("/api/feed?refresh=1", {
        cache: "no-store",
      });
      const data = (await response.json()) as FeedResponse;
      setItems(data.items);
      setSources(data.sources);
      setFetchedAt(data.fetchedAt);
      setLastPulse(data.fetchedAt);
    } finally {
      setRefreshing(false);
    }
  };

  const tags = useMemo(() => splitTags(items), [items]);

  const renderTimeAgo = (value: string) => (mounted ? timeAgo(value) : "—");
  const renderTime = (value: string) => (mounted ? formatTime(value) : "—");
  const readCount = mounted ? readItems.length : 0;
  const itemCount = mounted ? items.length : 0;

  // lastPulse reflects the last successful refresh time only

  const savedCollection = useMemo(
    () => collections.find((collection) => collection.name === "Saved"),
    [collections]
  );
  const savedItemIds = useMemo(
    () => new Set(savedCollection?.itemIds ?? []),
    [savedCollection]
  );

  const filteredItems = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    let list = items.filter((item) => !hiddenItems.includes(item.id));

    if (activeCollection !== "all") {
      const collection = collections.find(
        (entry) => entry.id === activeCollection
      );
      if (collection) {
        list = list.filter((item) => collection.itemIds.includes(item.id));
      }
    }

    list = list.filter((item) => activeCategories.includes(item.category));

    if (activeTags.length > 0) {
      list = list.filter((item) =>
        activeTags.every((tag) => item.tags.includes(tag))
      );
    }

    if (lowered) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(lowered) ||
          item.summary.toLowerCase().includes(lowered) ||
          item.tags.some((tag) => tag.toLowerCase().includes(lowered))
      );
    }

    if (sort === "Trending") {
      list = [...list].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime()
        );
      });
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime()
      );
    }

    return list.slice(0, visibleCount);
  }, [
    items,
    hiddenItems,
    activeCollection,
    collections,
    activeCategories,
    activeTags,
    query,
    sort,
    visibleCount,
  ]);

  const toggleCategory = (category: FeedCategory) => {
    setActiveCategories((prev) =>
      prev.includes(category)
        ? prev.filter((entry) => entry !== category)
        : [...prev, category]
    );
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]
    );
  };

  const markRead = (itemId: string) => {
    if (!readItems.includes(itemId)) {
      setReadItems([...readItems, itemId]);
    }
  };

  const toggleSave = async (item: FeedItem) => {
    if (!user) {
      await signIn("google");
      return;
    }

    if (!savedCollection) return;
    const isSaved = savedItemIds.has(item.id);
    await fetch(`/api/collections/${savedCollection.id}/items`, {
      method: isSaved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleId: item.id,
        title: item.title,
        url: item.url,
        source: item.source,
        category: item.category,
      }),
    });

    const data = await fetchCollections();
    setCollections(data);
  };

  const addCollection = async () => {
    if (!user) {
      await signIn("google");
      return;
    }
    const name = window.prompt("Name your new collection");
    if (!name) return;
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await fetchCollections();
    setCollections(data);
  };

  const hideItem = (itemId: string) => {
    if (!hiddenItems.includes(itemId)) {
      setHiddenItems([...hiddenItems, itemId]);
    }
  };

  return (
    <div className="min-h-screen px-5 pb-24 pt-10 md:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <nav className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl px-4 py-3 text-sm text-[color:var(--muted)]">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-[color:var(--ink)]">
              TechFlow
            </span>
            <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] md:inline-flex">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="max-w-[220px] truncate text-xs text-[color:var(--muted)] md:max-w-[320px]">
                  Signed in as {user.name ?? user.email}
                </span>
                {user.role === "ADMIN" ? (
                  <Link
                    href="/admin"
                    className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                  >
                    Admin dashboard
                  </Link>
                ) : null}
                <button
                  onClick={() => signOut()}
                  className="rounded-full bg-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="rounded-full bg-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-white"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </nav>

        <header className="glass relative overflow-hidden rounded-[32px] px-6 py-8 md:px-10">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute right-[-120px] top-[-80px] h-56 w-56 rounded-full bg-[color:var(--glow)] blur-3xl" />
            <div className="absolute bottom-[-140px] left-[-80px] h-64 w-64 rounded-full bg-[color:var(--lilac)] blur-3xl" />
          </div>
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3">
              <div className="badge bg-white text-[color:var(--muted)]">
                TechFlow Daily Briefing
              </div>
              <h1 className="text-4xl font-semibold text-[color:var(--ink)] md:text-5xl">
                Build momentum with{" "}
                <span className="text-gradient">live technical updates</span>.
              </h1>
              <p className="max-w-xl text-base text-[color:var(--muted)]">
                Auto-refreshed feeds, sharp filters, and one-click sharing. TechFlow
                keeps conferences, launches, research, and open-source signals in
                one clean stream.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
                <span className="badge bg-[color:var(--lilac)] text-[color:var(--ink)]">
                  4h cache window
                </span>
                <span className="badge bg-[color:var(--mint)] text-[color:var(--ink)]">
                  Auto refresh
                </span>
                <span className="badge bg-[color:var(--rose)] text-[color:var(--ink)]">
                  Personal collections
                </span>
              </div>
            </div>
            <div className="glass-dark flex w-full flex-col gap-4 rounded-2xl p-5 md:w-[280px]">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/70">
                Live Sync
                <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
                  <input
                    type="checkbox"
                    checked={live}
                    onChange={(event) => setLive(event.target.checked)}
                    className="h-4 w-4 accent-[color:var(--ocean)]"
                  />
                  Live
                </label>
              </div>
              <div className="flex items-center gap-3">
                <span className="pulse">
                  <span className="pulse-dot" />
                </span>
                <div>
                  <div className="text-lg font-semibold text-white">
                    {fetchedAt && mounted
                      ? timeAgo(new Date(fetchedAt).toISOString())
                      : "-"}
                  </div>
                  <div className="text-xs text-white/70">
                    {mounted && (lastPulse ?? fetchedAt)
                      ? `Last sync ${timeAgo(
                          new Date(lastPulse ?? fetchedAt ?? 0).toISOString()
                        )}`
                      : "Waiting for sync"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-white/70">
                {sources.length > 0
                  ? `${sources.length} sources connected`
                  : "Loading sources"}
              </div>
              <button
                onClick={onRefresh}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:translate-y-[-1px]"
              >
                {refreshing ? "Refreshing..." : "Refresh now"}
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="flex flex-col gap-5">
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                    Search & filters
                  </div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search conferences, launches, research..."
                    className="w-full rounded-full border border-[color:var(--mist)] bg-white px-4 py-2 text-sm outline-none focus:border-[color:var(--ocean)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {sortOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => setSort(option)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                        sort === option
                          ? "bg-[color:var(--ink)] text-white"
                          : "border border-[color:var(--mist)] text-[color:var(--muted)]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {CATEGORY_ORDER.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      activeCategories.includes(category)
                        ? "bg-[color:var(--ocean)] text-white"
                        : "bg-white text-[color:var(--muted)]"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tags.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      activeTags.includes(tag)
                        ? "border-[color:var(--ink)] bg-[color:var(--lilac)] text-[color:var(--ink)]"
                        : "border-[color:var(--mist)] text-[color:var(--muted)]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
              <div>
                Showing {mounted ? filteredItems.length : 0} updates{" "}
                {activeCollection !== "all" ? `in ${activeCollection}` : ""}
              </div>
              <div>
                {fetchedAt
                  ? `Updated ${renderTime(new Date(fetchedAt).toISOString())}`
                  : "Syncing..."}
              </div>
            </div>

            {loading ? (
              <div className="glass rounded-2xl p-6 text-[color:var(--muted)]">
                Loading fresh updates...
              </div>
            ) : error ? (
              <div className="glass rounded-2xl p-6 text-[color:var(--muted)]">
                {error}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredItems.map((item, index) => {
                  const isRead = readItems.includes(item.id);
                  const isSaved = savedItemIds.has(item.id);
                  const isNewest = sort === "Newest" && index < 3;
                  const showTrending = sort === "Trending" && item.score > 0.75;

                  return (
                    <article
                      key={item.id}
                      className="glass group relative flex flex-col gap-4 rounded-2xl p-5 transition hover:translate-y-[-2px]"
                    >
                      <div className="absolute right-5 top-5 hidden h-10 w-10 rounded-full bg-[color:var(--mist)] opacity-0 transition group-hover:opacity-100 md:block" />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                            <span>{item.category}</span>
                            <span>•</span>
                            <span>{item.source}</span>
                            <span>•</span>
                            <span>{item.sourceDomain}</span>
                          </div>
                          <h3 className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
                            {item.title}
                          </h3>
                        </div>
                        <div
                          className={`h-2 w-2 rounded-full ${
                            isRead ? "bg-[color:var(--mist)]" : "bg-[color:var(--ocean)]"
                          }`}
                        />
                      </div>

                      <p className="text-sm text-[color:var(--muted)]">
                        {item.summary}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag}`}
                            className="rounded-full bg-[color:var(--mint)] px-2 py-1 text-xs font-medium text-[color:var(--ink)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
                        <div className="flex items-center gap-2">
                          <span>{renderTimeAgo(item.publishedAt)}</span>
                          {isNewest ? (
                            <>
                              <span>•</span>
                              <span className="rounded-full bg-[color:var(--glow)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)]">
                                Newest
                              </span>
                            </>
                          ) : null}
                          {showTrending ? (
                            <>
                              <span>•</span>
                              <span className="rounded-full bg-[color:var(--sun)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)]">
                                Trending
                              </span>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              markRead(item.id);
                              sendAnalytics({
                                type: "open",
                                domain: item.sourceDomain,
                                category: item.category,
                              }).catch(() => undefined);
                              window.open(item.url, "_blank");
                            }}
                            className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => toggleSave(item)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              isSaved
                                ? "bg-[color:var(--ink)] text-white"
                                : "border border-[color:var(--mist)] text-[color:var(--muted)]"
                            }`}
                          >
                            {isSaved ? "Saved" : "Save"}
                          </button>
                          <ShareButton item={item} />
                          <button
                            onClick={() => hideItem(item.id)}
                            className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]"
                          >
                            Hide
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {filteredItems.length < items.length && (
              <button
                onClick={() => setVisibleCount((prev) => prev + 20)}
                className="rounded-full border border-[color:var(--mist)] px-5 py-2 text-sm font-semibold text-[color:var(--muted)]"
              >
                Load more
              </button>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                    Collections
                  </div>
                  <div className="text-lg font-semibold text-[color:var(--ink)]">
                    Organize your queue
                  </div>
                </div>
                <button
                  onClick={addCollection}
                  className="rounded-full bg-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-white"
                >
                  New
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => setActiveCollection("all")}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                    activeCollection === "all"
                      ? "bg-[color:var(--lilac)] text-[color:var(--ink)]"
                      : "text-[color:var(--muted)]"
                  }`}
                >
                  <span>All Updates</span>
                  <span suppressHydrationWarning>{itemCount}</span>
                </button>
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => setActiveCollection(collection.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                      activeCollection === collection.id
                        ? "bg-[color:var(--lilac)] text-[color:var(--ink)]"
                        : "text-[color:var(--muted)]"
                    }`}
                  >
                    <span>{collection.name}</span>
                    <span suppressHydrationWarning>
                      {mounted ? collection.itemIds.length : 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Read History
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                <span suppressHydrationWarning>{readCount}</span> updates read this
                week.
              </div>
              <div className="mt-4 rounded-xl bg-[color:var(--mist)] p-4 text-sm text-[color:var(--muted)]">
                Tip: open an article to mark it as read. Use the Hide action for
                off-topic items to improve relevance.
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Sharing snapshot
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                Share the best updates with one click. Pre-filled copy keeps your
                feed sharp.
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--muted)]">
                <span className="rounded-full bg-[color:var(--sun)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)]">
                  One-click
                </span>
                <span>Twitter</span>
                <span>•</span>
                <span>LinkedIn</span>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function ShareButton({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
      >
        Share
      </button>
      {open ? <ShareModal item={item} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ShareModal({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const [message, setMessage] = useState(
    `Worth a look: ${item.title} via ${item.sourceDomain}`
  );

  const suggestions = [
    `New drop: ${item.title}`,
    `Bookmarking this: ${item.title}`,
    `Sharing this ${item.category} update`,
  ];

  const shareText = encodeURIComponent(`${message} ${item.url}`);
  const shareUrl = encodeURIComponent(item.url);
  const shareTime = timeAgo(item.publishedAt);

  const copyLink = async () => {
    await navigator.clipboard.writeText(item.url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="glass w-full max-w-4xl rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Share update
            </div>
            <h3 className="text-xl font-semibold text-[color:var(--ink)]">
              Craft a branded share
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-[color:var(--ink)] p-5 text-white">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/70">
                TechFlow Share Card
                <span className="badge bg-white text-[color:var(--ink)]">Live</span>
              </div>
              <h4 className="mt-4 text-2xl font-semibold">{item.title}</h4>
              <p className="mt-3 text-sm text-white/70">{item.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                <span>{item.source}</span>
                <span>•</span>
                <span>{item.sourceDomain}</span>
                <span>•</span>
                <span>{shareTime}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-[color:var(--mist)] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Post preview
              </div>
              <p className="mt-3 text-sm text-[color:var(--muted)]">{message}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-[color:var(--mist)] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Caption
              </div>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-3 min-h-[140px] w-full rounded-2xl border border-[color:var(--mist)] bg-white p-3 text-sm text-[color:var(--ink)]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((text) => (
                  <button
                    key={text}
                    onClick={() => setMessage(text)}
                    className="rounded-full border border-[color:var(--mist)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[color:var(--mist)] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Share actions
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`https://twitter.com/intent/tweet?text=${shareText}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-xs font-semibold text-white"
                >
                  Share to Twitter
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[color:var(--mist)] px-4 py-2 text-xs font-semibold text-[color:var(--ink)]"
                >
                  Share to LinkedIn
                </a>
                <button
                  onClick={copyLink}
                  className="rounded-full border border-[color:var(--mist)] px-4 py-2 text-xs font-semibold text-[color:var(--muted)]"
                >
                  Copy link
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-[color:var(--mist)] p-4 text-xs text-[color:var(--muted)]">
                Tip: keep it short and add a thought to increase engagement.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
