// Canonical URL validation for the only two sources we accept.
// We never fetch these URLs ourselves; a canonical slug/handle is handed to the provider API.
// That removes any general URL-fetch proxy surface (no SSRF), and lookalike hosts are rejected here.

export type UrlResult =
  | { ok: true; canonical: string; key: string }
  | { ok: false; error: string };

const LINKEDIN_HOST = /^(?:(?:www|m|[a-z]{2})\.)?linkedin\.com$/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

// Instagram first-path segments that are product pages, not accounts.
const IG_RESERVED = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer",
  "legal", "web", "privacy", "terms", "challenge", "emails", "session", "login", "signup", "ar",
  "topics", "directory", "static", "api", "graphql", "oauth", "s", "share", "_n", "_u",
]);

function parseLoose(input: string, allowBareHost: boolean): URL | null {
  let s = input.trim();
  if (!s) return null;
  if (/\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!allowBareHost) return null;
    s = "https://" + s.replace(/^\/+/, "");
  }
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function commonChecks(u: URL): string | null {
  if (u.protocol !== "https:") return "Only https:// links are accepted.";
  if (u.username || u.password) return "Links with embedded credentials are not accepted.";
  if (u.port) return "Links with custom ports are not accepted.";
  return null;
}

export function normalizeLinkedIn(input: string): UrlResult {
  const u = parseLoose(input, true);
  if (!u) return { ok: false, error: "That is not a valid LinkedIn profile link." };
  const common = commonChecks(u);
  if (common) return { ok: false, error: common };
  const host = u.hostname.toLowerCase();
  if (!LINKEDIN_HOST.test(host)) {
    return { ok: false, error: "The LinkedIn link must be on linkedin.com (for example https://www.linkedin.com/in/your-name)." };
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "in" || !parts[1]) {
    return { ok: false, error: "Use a personal LinkedIn profile link of the form linkedin.com/in/… (company pages and posts are not accepted)." };
  }
  if (parts.length > 2 && !["", "en", "details"].includes(parts[2] ?? "")) {
    // e.g. /in/name/recent-activity — still the same account, keep the slug.
  }
  let slug: string;
  try {
    slug = decodeURIComponent(parts[1]).trim().toLowerCase();
  } catch {
    return { ok: false, error: "The LinkedIn profile link is malformed." };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{1,99}$/u.test(slug)) {
    return { ok: false, error: "The LinkedIn profile name in that link looks invalid." };
  }
  return { ok: true, canonical: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`, key: slug };
}

export function normalizeInstagram(input: string): UrlResult {
  const raw = input.trim();
  // Convenience: accept "@handle".
  if (/^@[A-Za-z0-9._]{1,30}$/.test(raw)) return normalizeInstagram(`https://www.instagram.com/${raw.slice(1)}/`);
  const u = parseLoose(raw, true);
  if (!u) return { ok: false, error: "That is not a valid Instagram profile link." };
  const common = commonChecks(u);
  if (common) return { ok: false, error: common };
  const host = u.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(host)) {
    return { ok: false, error: "The Instagram link must be on instagram.com (for example https://www.instagram.com/yourhandle/)." };
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const handle = (parts[0] ?? "").toLowerCase();
  if (!handle) return { ok: false, error: "Use an Instagram profile link, e.g. instagram.com/yourhandle." };
  if (IG_RESERVED.has(handle)) {
    return { ok: false, error: "That is an Instagram post, reel or product page. Paste the account's profile link instead." };
  }
  if (parts.length > 1 && !["", "reels", "tagged", "saved"].includes(parts[1] ?? "")) {
    return { ok: false, error: "Paste the Instagram account link itself, not a post inside it." };
  }
  if (!/^[a-z0-9._]{1,30}$/.test(handle) || handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) {
    return { ok: false, error: "The Instagram handle in that link looks invalid." };
  }
  return { ok: true, canonical: `https://www.instagram.com/${handle}/`, key: handle };
}
