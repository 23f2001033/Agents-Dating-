import type { InstagramNormalized, LinkedInNormalized } from "./normalize";

// Identity pairing between the two submitted accounts, from their own content only.
//  cross_linked : one account links to / names the other account explicitly
//  corroborated : names match AND at least two independent, consistent self-described details
//  ambiguous    : anything weaker (seed cohort excludes these; visitors may self-attest, labeled as such)
// These labels describe evidence strength, not platform verification.

export type IdentitySignal = {
  kind: "cross_link" | "shared_website" | "shared_organization" | "shared_phrase" | "shared_title" | "shared_location";
  detail: string;
  linkedin: string;
  instagram: string;
};

export type IdentityResult = {
  status: "cross_linked" | "corroborated" | "ambiguous";
  nameMatch: "exact" | "strong" | "handle" | "partial" | "none";
  signals: IdentitySignal[];
  checkedAt: string;
};

const STOP = new Set(
  "a an and the of for to in on at by with from my our your i me we you is are be as or it its this that just about into over under new more most all".split(" "),
);
const GENERIC_ORGS = new Set(
  "self employed selfemployed self-employed freelance freelancer independent stealth stealth startup confidential various consultant youtube instagram linkedin tiktok facebook twitter x google amazon apple microsoft meta startup company business entrepreneur founder university college school home".split(" "),
);
const MULTI_TENANT = /(^|\.)(linktr\.ee|linktree\.com|bio\.link|beacons\.ai|lnk\.bio|stan\.store|campsite\.bio|carrd\.co|substack\.com|medium\.com|github\.com|gumroad\.com|notion\.site|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|threads\.net|spotify\.com|apple\.com|amazon\.com|amzn\.to|bit\.ly|tinyurl\.com|calendly\.com|wa\.me|t\.me|l\.instagram\.com)$/;

export function normName(v: string): string {
  return v
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const compact = (v: string) => normName(v).replace(/\s+/g, "");
const tokens = (v: string) => normName(v).split(" ").filter(Boolean);

export function nameMatch(li: LinkedInNormalized, ig: InstagramNormalized): IdentityResult["nameMatch"] {
  const honor = new Set(["dr", "mr", "mrs", "ms", "prof", "sir"]);
  const liT = tokens(`${li.firstName} ${li.lastName}`).filter((t) => !honor.has(t));
  const igT = tokens(ig.fullName).filter((t) => !honor.has(t));
  if (!liT.length) return "none";
  const liC = liT.join("");
  const igC = igT.join("");
  if (igC && liC === igC) return "exact";
  const first = liT[0];
  const last = liT[liT.length - 1];
  if (igC && igC.includes(first) && last.length >= 2 && igC.includes(last)) return "strong";
  const handle = ig.username.replace(/[^a-z0-9]/g, "");
  if (last.length >= 3 && handle.includes(last) && (handle.includes(first) || handle.startsWith(first[0]))) return "handle";
  if (last.length >= 3 && (igC.includes(last) || handle.includes(last))) return "partial";
  return "none";
}

function hostOf(url: string): { host: string; key: string } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (MULTI_TENANT.test(host)) {
      const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return { host, key: `${host}/${seg.toLowerCase()}` };
    }
    const parts = host.split(".");
    const sld = parts.length >= 3 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]) ? 3 : 2;
    return { host, key: parts.slice(-sld).join(".") };
  } catch {
    return null;
  }
}

const URL_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/gi;
const findUrls = (text: string) => (text.match(URL_RE) ?? []).filter((u) => /\./.test(u));

function ngrams(text: string, n: number): Map<string, string> {
  const t = tokens(text);
  const out = new Map<string, string>();
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n);
    const stops = g.filter((w) => STOP.has(w)).length;
    const joined = g.join(" ");
    if (stops <= 1 && joined.length >= 14 && !/^\d+( \d+)*$/.test(joined)) out.set(joined, joined);
  }
  return out;
}

export function checkIdentity(li: LinkedInNormalized, ig: InstagramNormalized): IdentityResult {
  const signals: IdentitySignal[] = [];
  const igCaptions = ig.posts.filter((p) => p.authored).map((p) => p.caption);
  const igText = [ig.fullName, ig.biography, ...igCaptions].join("\n");
  const igNorm = ` ${normName(igText)} `;
  const igCompact = compact(igText);
  const igMentions = new Set((igText.match(/@([a-z0-9._]{3,30})/gi) ?? []).map((m) => m.slice(1).toLowerCase().replace(/[^a-z0-9]/g, "")));
  const liText = [li.headline, li.about, ...li.experience.map((e) => `${e.position} ${e.company} ${e.description}`)].join("\n");

  // 1) Cross links: IG → LinkedIn slug, LinkedIn → IG handle.
  const liSlug = li.publicIdentifier || li.profileUrl.split("/in/")[1]?.replace(/\/.*/, "") || "";
  const igLinks = [...ig.externalUrls, ...findUrls(ig.biography)];
  const igToLi = igLinks.find((u) => liSlug && u.toLowerCase().includes(`linkedin.com/in/${liSlug}`));
  if (igToLi) signals.push({ kind: "cross_link", detail: "Instagram links to this LinkedIn profile", linkedin: li.profileUrl, instagram: igToLi });
  const liLinks = [...li.websites, ...findUrls(li.about)];
  const liToIg = liLinks.find((u) => u.toLowerCase().includes(`instagram.com/${ig.username}`));
  if (liToIg) signals.push({ kind: "cross_link", detail: "LinkedIn links to this Instagram account", linkedin: liToIg, instagram: ig.profileUrl });
  const handleRe = new RegExp(`(^|[^a-z0-9._])@${ig.username.replace(/\./g, "\\.")}(?![a-z0-9._])`, "i");
  if (ig.username.length >= 4 && handleRe.test(`${li.headline}\n${li.about}`)) {
    signals.push({ kind: "cross_link", detail: `LinkedIn names the Instagram handle @${ig.username}`, linkedin: li.headline.includes(ig.username) ? li.headline : "About section", instagram: ig.profileUrl });
  }

  // 2) Shared personal website (registrable domain; per-user key on multi-tenant hosts).
  const igKeys = new Map(igLinks.map((u) => [hostOf(u)?.key, u] as const).filter(([k]) => k));
  for (const u of liLinks) {
    const k = hostOf(u)?.key;
    if (k && igKeys.has(k) && !/^(linkedin\.com|instagram\.com)/.test(k)) {
      signals.push({ kind: "shared_website", detail: `Both link to ${k}`, linkedin: u, instagram: igKeys.get(k)! });
      break;
    }
  }

  // 3) Organizations named in LinkedIn experience/volunteering/education that the Instagram account also names.
  const nameToks = new Set(tokens(`${li.firstName} ${li.lastName}`));
  const orgs = new Map<string, { label: string; slug: string }>();
  for (const e of li.experience.slice(0, 15)) orgs.set(normName(e.company), { label: e.company, slug: e.companySlug.replace(/[^a-z0-9]/g, "") });
  for (const v of li.volunteering.slice(0, 5)) orgs.set(normName(v.organization), { label: v.organization, slug: "" });
  for (const ed of li.education.slice(0, 5)) orgs.set(normName(ed.school), { label: ed.school, slug: "" });
  const seenOrg = new Set<string>();
  for (const [norm, { label, slug }] of orgs) {
    if (!norm || norm.length < 4 || GENERIC_ORGS.has(norm)) continue;
    const orgToks = norm.split(" ");
    if (orgToks.some((t) => nameToks.has(t) && t.length > 2)) continue; // "Jane Doe Ltd" is not independent evidence
    const c = norm.replace(/\s+/g, "");
    const hit =
      igNorm.includes(` ${norm} `) ||
      (c.length >= 6 && igCompact.includes(c)) ||
      (slug.length >= 5 && igMentions.has(slug)) ||
      igMentions.has(c);
    if (hit && !seenOrg.has(c)) {
      seenOrg.add(c);
      const where = ig.biography && normName(ig.biography).replace(/\s+/g, "").includes(c) ? ig.biography : "a recent authored caption";
      signals.push({ kind: "shared_organization", detail: `Both name ${label}`, linkedin: `Experience/education: ${label}`, instagram: where.slice(0, 200) });
    }
    if (seenOrg.size >= 3) break;
  }

  // 4) Distinctive titles (books, publications, projects, featured) named on both.
  const titles = [...li.publications.map((p) => p.title), ...li.projects.map((p) => p.title), ...li.featured, ...(li.headline.match(/[“"]([^”"]{6,60})[”"]/g) ?? []).map((q) => q.slice(1, -1))];
  for (const t of titles) {
    const n = normName(t);
    if (n.split(" ").length >= 2 && n.length >= 8 && igNorm.includes(` ${n} `)) {
      signals.push({ kind: "shared_title", detail: `Both mention “${t}”`, linkedin: t, instagram: "Instagram bio/captions" });
      break;
    }
  }

  // 5) Shared self-description phrase between LinkedIn headline/about and Instagram bio (3-grams).
  const liGrams = ngrams(`${li.headline}\n${li.about.slice(0, 800)}`, 3);
  const bioGrams = ngrams(ig.biography, 3);
  for (const g of bioGrams.keys()) {
    if (liGrams.has(g)) {
      signals.push({ kind: "shared_phrase", detail: `Both describe themselves with “${g}”`, linkedin: li.headline.slice(0, 200), instagram: ig.biography.slice(0, 200) });
      break;
    }
  }

  // 6) Location city named in the Instagram bio (weak, counted once).
  const city = normName(li.location.split(",")[0] ?? "");
  if (city.length >= 4 && ` ${normName(ig.biography)} `.includes(` ${city} `)) {
    signals.push({ kind: "shared_location", detail: `Both mention ${li.location.split(",")[0]}`, linkedin: li.location, instagram: ig.biography.slice(0, 200) });
  }

  const nm = nameMatch(li, ig);
  const corroborating = signals.filter((x) => x.kind !== "cross_link");
  let status: IdentityResult["status"] = "ambiguous";
  if (signals.some((x) => x.kind === "cross_link")) status = "cross_linked";
  else if ((nm === "exact" || nm === "strong" || nm === "handle") && corroborating.length >= 2) status = "corroborated";
  void liText;
  return { status, nameMatch: nm, signals, checkedAt: new Date().toISOString() };
}
