import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sortByClicks = (items: { label: string; clicks: number }[]) =>
  items.sort((a, b) => b.clicks - a.clicks).slice(0, 6);

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return (
      <div className="min-h-screen px-5 pb-20 pt-10 md:px-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Admin Only
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
              You do not have access to this dashboard.
            </h1>
          </div>
        </div>
      </div>
    );
  }

  const [users, sessions, timeSpent, domainEvents, categoryEvents] = await Promise.all([
    prisma.user.count(),
    prisma.analyticsEvent.count({ where: { type: "session_start" } }),
    prisma.analyticsEvent.aggregate({
      where: { type: "session_end" },
      _sum: { duration: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["domain"],
      where: { type: "open", domain: { not: null } },
      _count: { domain: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["category"],
      where: { type: "open", category: { not: null } },
      _count: { category: true },
    }),
  ]);

  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(now.getDate() - 1);
  const activeUsers = await prisma.user.count({
    where: { updatedAt: { gte: dayAgo } },
  });

  type DomainEvent = (typeof domainEvents)[number];
  type CategoryEvent = (typeof categoryEvents)[number];

  const topDomains = sortByClicks(
    domainEvents
      .filter((entry: DomainEvent) => entry.domain)
      .map((entry: DomainEvent) => ({
        label: entry.domain as string,
        clicks: entry._count.domain,
      }))
  );

  const topCategories = sortByClicks(
    categoryEvents
      .filter((entry: CategoryEvent) => entry.category)
      .map((entry: CategoryEvent) => ({
        label: entry.category as string,
        clicks: entry._count.category,
      }))
  );

  return (
    <div className="min-h-screen px-5 pb-20 pt-10 md:px-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="glass rounded-[28px] p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Admin Analytics
              </div>
              <h1 className="text-3xl font-semibold text-[color:var(--ink)]">
                Usage pulse for TechFlow
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-[color:var(--mist)] px-4 py-2 text-xs font-semibold text-[color:var(--ink)]"
            >
              Back to feed
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Active Users
            </div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
              {activeUsers}
            </div>
            <div className="text-xs text-[color:var(--muted)]">Last 24 hours</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Total Users
            </div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
              {users}
            </div>
            <div className="text-xs text-[color:var(--muted)]">All accounts</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Sessions
            </div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
              {sessions}
            </div>
            <div className="text-xs text-[color:var(--muted)]">Since launch</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Time Spent
            </div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
              {Math.floor(((timeSpent._sum.duration ?? 0) / 1000 / 60 / 60))}h
            </div>
            <div className="text-xs text-[color:var(--muted)]">Aggregate</div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Top Domains
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {topDomains.length ? (
                topDomains.map((domain) => (
                  <div
                    key={domain.label}
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-[color:var(--ink)]">
                      {domain.label}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {domain.clicks} clicks
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[color:var(--muted)]">
                  Open a few articles to populate this chart.
                </div>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Top Categories
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {topCategories.length ? (
                topCategories.map((category) => (
                  <div
                    key={category.label}
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-[color:var(--ink)]">
                      {category.label}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">
                      {category.clicks} clicks
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[color:var(--muted)]">
                  Activity shows up once users open updates.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
