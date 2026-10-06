import { env } from "../config/env";

export interface VideoSuggestion {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string | null;
  url: string;
  publishedAt: string | null;
}

export interface SearchSuggestion {
  label: string;
  url: string;
}

export interface SkillVideos {
  skill: string;
  mode: "learn" | "improve";
  source: "youtube" | "search";
  videos: VideoSuggestion[];
  searches: SearchSuggestion[];
}

// Each search costs 100 of the 10,000 daily API units, so results are cached
// per skill and the API is only used when a key is configured.
const CACHE_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;
const cache = new Map<string, { at: number; value: SkillVideos }>();

const QUERIES = {
  learn: (skill: string) => [
    { label: `${skill} full course`, q: `${skill} full course for beginners` },
    { label: `${skill} crash course`, q: `${skill} crash course` },
    { label: `${skill} projects`, q: `${skill} project tutorial` },
  ],
  improve: (skill: string) => [
    { label: `${skill} advanced concepts`, q: `${skill} advanced concepts` },
    { label: `${skill} interview questions`, q: `${skill} interview questions and answers` },
    { label: `${skill} real-world project`, q: `${skill} real world project tutorial` },
  ],
};

function searchUrl(q: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
}

async function searchYouTube(q: string): Promise<VideoSuggestion[] | null> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "4",
    q,
    relevanceLanguage: "en",
    safeSearch: "strict",
    videoEmbeddable: "true",
    key: env.YOUTUBE_API_KEY,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[youtube] search failed with ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { items?: YouTubeSearchItem[] };
    return (body.items ?? [])
      .filter((item) => item.id?.videoId && item.snippet?.title)
      .map((item) => ({
        videoId: item.id!.videoId!,
        title: decodeEntities(item.snippet!.title!),
        channel: decodeEntities(item.snippet!.channelTitle ?? ""),
        thumbnail: item.snippet!.thumbnails?.medium?.url ?? item.snippet!.thumbnails?.default?.url ?? null,
        url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
        publishedAt: item.snippet!.publishedAt ?? null,
      }));
  } catch (err) {
    console.warn("[youtube] search error", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// "learn" for skills the student doesn't have yet; "improve" for skills they
// have below the level a role needs.
export async function videosForSkill(skill: string, mode: "learn" | "improve"): Promise<SkillVideos> {
  const name = skill.trim();
  const key = `${mode}:${name.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const queries = QUERIES[mode](name);
  const searches = queries.map((q) => ({ label: q.label, url: searchUrl(q.q) }));

  let value: SkillVideos = { skill: name, mode, source: "search", videos: [], searches };
  if (env.YOUTUBE_API_KEY) {
    const videos = await searchYouTube(queries[0].q);
    if (videos && videos.length) value = { ...value, source: "youtube", videos };
  }
  // Only cache real results; a failed call should be retried next time.
  if (value.source === "youtube" || !env.YOUTUBE_API_KEY) cache.set(key, { at: Date.now(), value });
  return value;
}
