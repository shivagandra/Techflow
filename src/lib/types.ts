export type FeedCategory =
  | "Tech Conferences"
  | "Product Launches"
  | "Research Papers"
  | "Tech Jobs"
  | "Industry News"
  | "Open Source";

export type FeedItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceDomain: string;
  publishedAt: string;
  summary: string;
  category: FeedCategory;
  tags: string[];
  score: number;
};
