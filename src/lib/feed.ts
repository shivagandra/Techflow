import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { FeedCategory, FeedItem } from "@/lib/types";

type SourceConfig = {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  weight: number;
};

const sources: SourceConfig[] = [
  {
    id: "techcrunch",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "Industry News",
    weight: 0.9,
  },
  {
    id: "hn",
    name: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    category: "Industry News",
    weight: 0.75,
  },
  {
    id: "devto",
    name: "Dev.to",
    url: "https://dev.to/feed",
    category: "Open Source",
    weight: 0.8,
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com/feed",
    category: "Product Launches",
    weight: 0.85,
  },
  {
    id: "lwn",
    name: "LWN.net",
    url: "https://lwn.net/headlines/rss",
    category: "Open Source",
    weight: 0.9,
  },
  {
    id: "infoq",
    name: "InfoQ",
    url: "https://www.infoq.com/feed/",
    category: "Research Papers",
    weight: 0.8,
  },
  {
    id: "arstechnica",
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "Industry News",
    weight: 0.85,
  },
  {
    id: "githubblog",
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    category: "Open Source",
    weight: 0.8,
  },
  {
    id: "awsblog",
    name: "AWS Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/",
    category: "Industry News",
    weight: 0.8,
  },
  {
    id: "gcpblog",
    name: "Google Cloud Blog",
    url: "https://cloud.google.com/blog/rss/",
    category: "Industry News",
    weight: 0.8,
  },
  {
    id: "netflixtech",
    name: "Netflix TechBlog",
    url: "https://netflixtechblog.com/feed",
    category: "Open Source",
    weight: 0.75,
  },
  {
    id: "stackoverflow",
    name: "Stack Overflow Blog",
    url: "https://stackoverflow.blog/feed/",
    category: "Industry News",
    weight: 0.7,
  },
  {
    id: "openai",
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss/",
    category: "Research Papers",
    weight: 0.85,
  },
  {
    id: "arxiv-ai",
    name: "arXiv AI",
    url: "https://export.arxiv.org/rss/cs.AI",
    category: "Research Papers",
    weight: 0.95,
  },
  {
    id: "arxiv-cl",
    name: "arXiv CL",
    url: "https://export.arxiv.org/rss/cs.CL",
    category: "Research Papers",
    weight: 0.95,
  },
  {
    id: "arxiv-lg",
    name: "arXiv ML",
    url: "https://export.arxiv.org/rss/cs.LG",
    category: "Research Papers",
    weight: 0.95,
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    url: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    category: "Tech Jobs",
    weight: 0.6,
  },
];

const tagKeywords: Record<string, string[]> = {
  "AI/ML": ["ai", "ml", "machine learning", "llm", "neural", "model", "prompt"],
  DevOps: ["kubernetes", "docker", "devops", "ci/cd", "terraform", "k8s"],
  "Web3": ["web3", "blockchain", "crypto", "solana", "ethereum"],
  "Cloud": ["aws", "azure", "gcp", "cloud", "serverless"],
  "Security": ["security", "vulnerability", "zero-day", "cve", "breach"],
  "Data": ["database", "postgres", "mysql", "mongodb", "data"],
  "Frontend": ["react", "vue", "svelte", "css", "frontend"],
  "Backend": ["api", "node", "fastapi", "go", "rust", "backend"],
  "Mobile": ["ios", "android", "react native", "flutter"],
  "Startups": ["startup", "funding", "seed", "series", "venture"],
};

const conferenceSignals = ["conference", "summit", "keynote", "meetup", "expo"];
const researchSignals = ["paper", "arxiv", "research", "study"];
const jobSignals = ["hiring", "job", "career", "role", "recruiting"];
const productSignals = ["launch", "release", "announces", "introduces", "beta"];

const parser = new Parser({
  timeout: 10000,
});

const stripHtml = (value: string) =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const clampSummary = (value: string, max = 220) =>
  value.length <= max ? value : `${value.slice(0, max).trim()}...`;

const extractDomain = (value: string) => {
  try {
    const url = new URL(value);
    return url.hostname.replace("www.", "");
  } catch {
    return "source";
  }
};

const inferCategory = (text: string, sourceCategory: FeedCategory) => {
  const lowered = text.toLowerCase();
  if (conferenceSignals.some((signal) => lowered.includes(signal))) {
    return "Tech Conferences";
  }
  if (researchSignals.some((signal) => lowered.includes(signal))) {
    return "Research Papers";
  }
  if (jobSignals.some((signal) => lowered.includes(signal))) {
    return "Tech Jobs";
  }
  if (productSignals.some((signal) => lowered.includes(signal))) {
    return "Product Launches";
  }
  return sourceCategory;
};

const inferTags = (text: string) => {
  const lowered = text.toLowerCase();
  const tags = Object.entries(tagKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => lowered.includes(keyword)))
    .map(([tag]) => tag);
  return tags.length > 0 ? tags : ["General"];
};

const scoreItem = (publishedAt: string, weight: number) => {
  const published = new Date(publishedAt).getTime();
  const now = Date.now();
  const hoursAgo = Math.max((now - published) / (1000 * 60 * 60), 1);
  const recencyScore = Math.max(0.1, 1.2 - hoursAgo / 48);
  return Math.min(1, recencyScore * weight);
};

const fetchGitHubTrending = async () => {
  try {
    const response = await fetch("https://github.com/trending?since=daily", {
      headers: {
        "User-Agent": "TechFlow/1.0",
      },
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) return [] as FeedItem[];
    const html = await response.text();
    const $ = cheerio.load(html);
    const items: FeedItem[] = [];
    const now = new Date().toISOString();

    $("article.Box-row").each((index, element) => {
      if (index > 10) return;
      const repo = $(element).find("h2 a").text().replace(/\s+/g, "");
      const description = $(element).find("p").text().trim();
      const link = `https://github.com/${repo}`;
      const textForSignals = `${repo} ${description}`;
      const category = inferCategory(textForSignals, "Open Source");
      const tags = inferTags(textForSignals);
      items.push({
        id: `github-trending-${repo}`,
        title: repo.replace("/", " / "),
        url: link,
        source: "GitHub Trending",
        sourceDomain: "github.com",
        publishedAt: now,
        summary: clampSummary(description || "Trending repository."),
        category,
        tags,
        score: scoreItem(now, 0.9),
      });
    });

    return items;
  } catch {
    return [] as FeedItem[];
  }
};

export const fetchFeedItems = async () => {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const feed = await parser.parseURL(source.url);
        return feed.items.map((item) => {
          const title = item.title?.trim() ?? "Untitled";
          const link = item.link ?? item.guid ?? "";
          const content = stripHtml(
            item.contentSnippet || item.content || item.summary || title
          );
          const publishedAt =
            item.isoDate ||
            item.pubDate ||
            new Date().toISOString();
          const textForSignals = `${title} ${content}`;
          const category = inferCategory(textForSignals, source.category);
          const tags = inferTags(textForSignals);
          return {
            id: `${source.id}-${item.guid || link || title}`.replace(/\s+/g, "-"),
            title,
            url: link,
            source: source.name,
            sourceDomain: extractDomain(link || source.url),
            publishedAt,
            summary: clampSummary(content),
            category,
            tags,
            score: scoreItem(publishedAt, source.weight),
          } satisfies FeedItem;
        });
      } catch {
        return [];
      }
    })
  );

  const githubTrending = await fetchGitHubTrending();
  const flat = results.flat().concat(githubTrending).filter((item) => item.url);
  const deduped = new Map<string, FeedItem>();
  for (const item of flat) {
    const key = item.url || item.title;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }
  return Array.from(deduped.values()).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
};

export const getSourceList = () => [
  ...sources.map((source) => source.name),
  "GitHub Trending",
];
