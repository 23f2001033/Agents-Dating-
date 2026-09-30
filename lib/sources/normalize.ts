import { createHash } from "node:crypto";

// Normalizes provider payloads into the two-source boundary:
// only the person's own public account content (LinkedIn profile; Instagram bio + authored captions).
// Excluded on purpose: other users' comments/recommendations, followed pages, collab posts owned by
// other accounts, follower counts (never used in matching), contact details.

export type Platform = "linkedin" | "instagram";

export type EvidenceDraft = {
  localId: string;
  platform: Platform;
  field: string;
  label: string;
  excerpt: string;
  url: string;
  publishedAt: string | null;
};

export type LinkedInNormalized = {
  profileUrl: string;
  publicIdentifier: string;
  fullName: string;
  firstName: string;
  lastName: string;
  headline: string;
  about: string;
  location: string;
  experience: {
    position: string;
    company: string;
    companySlug: string;
    period: string;
    duration: string;
    description: string;
    current: boolean;
  }[];
  education: { school: string; degree: string; field: string; period: string; activities: string; description: string }[];
  volunteering: { role: string; organization: string; cause: string; description: string }[];
  honors: { title: string; issuer: string; date: string; description: string }[];
  publications: { title: string; publisher: string; description: string }[];
  projects: { title: string; description: string }[];
  certifications: { name: string; issuer: string }[];
  languages: string[];
  skills: string[];
  causes: string[];
  websites: string[];
  featured: string[];
};

export type InstagramPost = {
  shortCode: string;
  url: string;
  timestamp: string | null;
  type: string;
  caption: string;
  authored: boolean;
  owner: string;
  pinned: boolean;
};

export type InstagramNormalized = {
  profileUrl: string;
  username: string;
  fullName: string;
  biography: string;
  externalUrls: string[];
  isPrivate: boolean;
  isVerified: boolean;
  postsCount: number | null;
  posts: InstagramPost[];
};

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
const arr = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ---------- sanitization ----------
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone-like sequences: 9+ digits with common separators.
const PHONE = /(?:\+?\d[\s().-]{0,2}){9,15}\d?/g;

export function sanitize(text: string): string {
  return text
    .replace(EMAIL, "[contact removed]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[contact removed]" : m))
    .replace(/\u0000/g, "")
    .trim();
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trim() + " …";
}

// Split long text into sentence-aligned chunks for citeable evidence.
export function chunkText(text: string, max = 320, limit = 8): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const sent of sentences) {
    if (sent.length > max) {
      if (cur) chunks.push(cur);
      cur = "";
      chunks.push(clip(sent, max));
      continue;
    }
    if ((cur + " " + sent).trim().length > max) {
      chunks.push(cur);
      cur = sent;
    } else cur = (cur + " " + sent).trim();
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, limit);
}

// ---------- LinkedIn (harvestapi/linkedin-profile-scraper) ----------
export function normalizeLinkedIn(item: Record<string, unknown>, canonicalUrl: string): LinkedInNormalized {
  const loc = (item.location ?? {}) as Record<string, unknown>;
  const parsed = (loc.parsed ?? {}) as Record<string, unknown>;
  const featured = (item.featured ?? {}) as Record<string, unknown>;
  return {
    profileUrl: canonicalUrl,
    publicIdentifier: s(item.publicIdentifier).toLowerCase(),
    firstName: s(item.firstName),
    lastName: s(item.lastName),
    fullName: `${s(item.firstName)} ${s(item.lastName)}`.trim(),
    headline: sanitize(s(item.headline)),
    about: sanitize(s(item.about)),
    location: s(parsed.text) || s(loc.linkedinText),
    experience: arr(item.experience).map((e) => {
      const start = s((e.startDate as Record<string, unknown> | undefined)?.text);
      const end = s((e.endDate as Record<string, unknown> | undefined)?.text);
      return {
        position: s(e.position),
        company: s(e.companyName),
        companySlug: s(e.companyUniversalName).toLowerCase(),
        period: [start, end].filter(Boolean).join(" – "),
        duration: s(e.duration),
        description: sanitize(s(e.description)),
        current: /present/i.test(end),
      };
    }),
    education: arr(item.education).map((e) => ({
      school: s(e.schoolName),
      degree: s(e.degree),
      field: s(e.fieldOfStudy),
      period: s(e.period),
      activities: sanitize(s(e.insights)),
      description: sanitize(s(e.description)),
    })),
    volunteering: arr(item.volunteering).map((v) => ({
      role: s(v.role),
      organization: s(v.organizationName),
      cause: s(v.cause),
      description: sanitize(s(v.description)),
    })),
    honors: arr(item.honorsAndAwards).map((h) => ({
      title: s(h.title),
      issuer: s(h.issuedBy),
      date: s(h.issuedAt),
      description: sanitize(s(h.description)),
    })),
    publications: arr(item.publications).map((p) => ({
      title: s(p.title ?? p.name),
      publisher: s(p.publisher ?? p.issuedBy),
      description: sanitize(s(p.description)),
    })),
    projects: arr(item.projects).map((p) => ({ title: s(p.title ?? p.name), description: sanitize(s(p.description)) })),
    certifications: arr(item.certifications).map((c) => ({ name: s(c.title ?? c.name), issuer: s(c.issuedBy ?? c.authority) })),
    languages: arr(item.languages).map((l) => [s(l.name), s(l.proficiency)].filter(Boolean).join(" — ")).filter(Boolean),
    skills: arr(item.skills).map((k) => s(k.name)).filter(Boolean),
    causes: arr<string>(item.causes).map((c) => s(c)).filter(Boolean),
    websites: arr<string>(item.websites).map((w) => s(w)).filter(Boolean),
    featured: arr(featured.slides).map((f) => s(f.title)).filter(Boolean),
  };
}

// ---------- Instagram (apify/instagram-profile-scraper) ----------
export function normalizeInstagram(item: Record<string, unknown>, handle: string): InstagramNormalized {
  const username = s(item.username).toLowerCase() || handle;
  const posts = arr(item.latestPosts).map((p) => {
    const owner = s(p.ownerUsername).toLowerCase();
    return {
      shortCode: s(p.shortCode),
      url: s(p.url) || (p.shortCode ? `https://www.instagram.com/p/${s(p.shortCode)}/` : ""),
      timestamp: s(p.timestamp) || null,
      type: s(p.type),
      caption: sanitize(s(p.caption)),
      authored: !owner || owner === username,
      owner: owner || username,
      pinned: Boolean(p.isPinned),
    };
  });
  const ext = arr(item.externalUrls).map((u) => s(u.url)).filter(Boolean);
  if (s(item.externalUrl) && !ext.includes(s(item.externalUrl))) ext.unshift(s(item.externalUrl));
  return {
    profileUrl: `https://www.instagram.com/${username}/`,
    username,
    fullName: s(item.fullName),
    biography: sanitize(s(item.biography)),
    externalUrls: ext,
    isPrivate: item.private === true,
    isVerified: item.verified === true,
    postsCount: typeof item.postsCount === "number" ? item.postsCount : null,
    posts,
  };
}

// ---------- evidence ----------
export function linkedinEvidence(li: LinkedInNormalized): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  const url = li.profileUrl;
  const push = (field: string, label: string, excerpt: string) => {
    const e = excerpt.trim();
    if (!e) return;
    out.push({ localId: `L${out.length + 1}`, platform: "linkedin", field, label, excerpt: e, url, publishedAt: null });
  };
  push("headline", "Headline", clip(li.headline, 300));
  if (li.location) push("location", "Location", li.location);
  const about = chunkText(li.about, 320, 8);
  about.forEach((c, i) => push("about", about.length > 1 ? `About (${i + 1}/${about.length})` : "About", c));
  for (const e of li.experience.slice(0, 10)) {
    const head = [e.position, e.company].filter(Boolean).join(" at ");
    const when = [e.period, e.duration].filter(Boolean).join(", ");
    const desc = e.description ? ` — ${clip(e.description, 280)}` : "";
    push("experience", `Experience · ${head}`, `${head}${when ? ` (${when})` : ""}${desc}`);
  }
  for (const e of li.education.slice(0, 5)) {
    const deg = [e.degree, e.field].filter(Boolean).join(", ");
    const extra = [e.activities, e.description].filter(Boolean).join(" ");
    push("education", `Education · ${e.school}`, `${e.school}${deg ? ` — ${deg}` : ""}${e.period ? ` (${e.period})` : ""}${extra ? `. ${clip(extra, 240)}` : ""}`);
  }
  for (const v of li.volunteering.slice(0, 5)) {
    push("volunteering", `Volunteering · ${v.organization}`, `${v.role} at ${v.organization}${v.cause ? ` (cause: ${v.cause})` : ""}${v.description ? ` — ${clip(v.description, 220)}` : ""}`);
  }
  for (const h of li.honors.slice(0, 4)) {
    push("honor", `Honor · ${h.title}`, `${h.title}${h.issuer ? ` — ${h.issuer}` : ""}${h.date ? ` (${h.date})` : ""}${h.description ? `: ${clip(h.description, 200)}` : ""}`);
  }
  for (const p of li.publications.slice(0, 4)) {
    push("publication", `Publication · ${p.title}`, `${p.title}${p.publisher ? ` — ${p.publisher}` : ""}${p.description ? `: ${clip(p.description, 200)}` : ""}`);
  }
  for (const p of li.projects.slice(0, 4)) {
    push("project", `Project · ${p.title}`, `${p.title}${p.description ? `: ${clip(p.description, 220)}` : ""}`);
  }
  for (const c of li.certifications.slice(0, 3)) push("certification", "Certification", [c.name, c.issuer].filter(Boolean).join(" — "));
  if (li.causes.length) push("causes", "Causes they list", li.causes.join(", "));
  if (li.languages.length) push("languages", "Languages", li.languages.join("; "));
  if (li.skills.length) push("skills", "Skills", li.skills.slice(0, 12).join(", "));
  if (li.featured.length) push("featured", "Featured", li.featured.slice(0, 4).join(" · "));
  return out;
}

export function instagramEvidence(ig: InstagramNormalized): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  if (ig.biography) {
    out.push({ localId: "I1", platform: "instagram", field: "bio", label: "Instagram bio", excerpt: clip(ig.biography, 400), url: ig.profileUrl, publishedAt: null });
  }
  const authored = ig.posts
    .filter((p) => p.authored && p.caption)
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 12);
  for (const p of authored) {
    const date = p.timestamp ? p.timestamp.slice(0, 10) : "undated";
    out.push({
      localId: `I${out.length + 1}`,
      platform: "instagram",
      field: "caption",
      label: `Post caption · ${date}`,
      excerpt: clip(p.caption, 450),
      url: p.url || ig.profileUrl,
      publishedAt: p.timestamp,
    });
  }
  return out;
}

export function linkedinCoverage(li: LinkedInNormalized) {
  const extras = [
    li.volunteering.length && "volunteering",
    li.honors.length && "honors",
    li.publications.length && "publications",
    li.projects.length && "projects",
    li.causes.length && "causes",
    li.languages.length && "languages",
    li.skills.length && "skills",
  ].filter(Boolean) as string[];
  const substantive =
    li.about.length >= 80 ||
    li.experience.some((e) => e.description.length >= 40) ||
    (Boolean(li.headline) && li.experience.length >= 2);
  return {
    headline: Boolean(li.headline),
    about: li.about.length > 0,
    aboutChars: li.about.length,
    experienceCount: li.experience.length,
    educationCount: li.education.length,
    extraSections: extras,
    substantive,
  };
}

export function instagramCoverage(ig: InstagramNormalized) {
  const authoredWithCaption = ig.posts.filter((p) => p.authored && p.caption).length;
  const notAuthored = ig.posts.filter((p) => !p.authored).length;
  const substantive = (ig.biography.length >= 20 && authoredWithCaption >= 1) || authoredWithCaption >= 3;
  return {
    bio: ig.biography.length > 0,
    postsReturned: ig.posts.length,
    captionsAuthored: Math.min(12, authoredWithCaption),
    excludedNotAuthored: notAuthored,
    isPrivate: ig.isPrivate,
    substantive,
  };
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
