// shared.js — app.js ও admin.js দুটোতেই ব্যবহৃত কনস্ট্যান্ট ও হেল্পার ফাংশন

export const KIND_ORDER = ["activity", "poem", "story", "manner", "dua"];

export const KIND_LABELS = {
  activity: "এক্টিভিটি",
  poem: "কবিতা",
  story: "গল্প",
  manner: "আদব শিষ্টাচার",
  dua: "সূরা ও দুআ",
};

export const KIND_COLLECTIONS = {
  activity: "activities",
  poem: "poems",
  story: "stories",
  manner: "manners",
  dua: "duas",
};

// প্রতিটি কনটেন্টের ধরন অনুযায়ী রিপোর্টের অবস্থা (score = আয়ত্তের শতাংশ)
export const REPORT_STATUSES = {
  activity: [
    { key: "done_help", label: "সাহায্য নিয়ে করেছে", score: 40 },
    { key: "done_alone", label: "নিজে নিজে করেছে", score: 70 },
    { key: "mastered", label: "বারবার করছে, আয়ত্ত হয়েছে", score: 100 },
  ],
  poem: [
    { key: "heard", label: "শুনেছে, কিন্তু বলতে পারে না", score: 25 },
    { key: "partial", label: "শুনেছে ও আংশিক বলতে পারে", score: 55 },
    { key: "full", label: "শুনেছে ও পুরোটা বলতে পারে", score: 80 },
    { key: "actions", label: "অঙ্গভঙ্গিসহ সুন্দরভাবে বলতে পারে", score: 100 },
  ],
  story: [
    { key: "heard", label: "শুনেছে", score: 30 },
    { key: "gist", label: "শুনেছে ও মূল ঘটনা বলতে পারে", score: 65 },
    { key: "lesson", label: "ঘটনা ও শিক্ষা — দুটোই বলতে পারে", score: 100 },
  ],
  manner: [
    { key: "learned", label: "জেনেছে/শুনেছে", score: 30 },
    { key: "practicing", label: "চর্চা করছে", score: 65 },
    { key: "habit", label: "অভ্যাসে পরিণত হয়েছে", score: 100 },
  ],
  dua: [
    { key: "heard", label: "শুনেছে", score: 25 },
    { key: "repeats", label: "সাথে সাথে পড়তে পারে", score: 50 },
    { key: "partial", label: "আংশিক মুখস্থ", score: 75 },
    { key: "memorized", label: "পুরোটা মুখস্থ", score: 100 },
  ],
};

export function statusInfo(kind, key) {
  return (REPORT_STATUSES[kind] || []).find(s => s.key === key) || null;
}

export function toMillis(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return 0;
}

export function fmtDateTime(v) {
  const ms = toMillis(v) || Date.now();
  return new Date(ms).toLocaleString("bn-BD", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ফ্রি কনটেন্ট সবসময় উপরে, তারপর প্রিমিয়াম; দুই দলের ভেতরেই আগে যোগ করা কনটেন্ট আগে
export function sortContent(list) {
  return [...list].sort((a, b) => {
    const fa = a.isFree ? 0 : 1;
    const fb = b.isFree ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const ta = toMillis(a.createdAt) || Number.MAX_SAFE_INTEGER;
    const tb = toMillis(b.createdAt) || Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

// একটি ক্যাটাগরির সারাংশ: কয়টি কনটেন্টের রিপোর্ট হয়েছে, গড় অগ্রগতি %, কোন অবস্থায় কয়টি
export function categorySummary(kind, items, getReport, isPremium) {
  const accessible = items.filter(i => i.isFree || isPremium);
  let sum = 0, reported = 0, last = 0;
  const counts = {};
  accessible.forEach(i => {
    const r = getReport(i.id);
    if (!r) return;
    reported++;
    const info = statusInfo(kind, r.status);
    sum += info ? info.score : (r.score || 0);
    counts[r.status] = (counts[r.status] || 0) + 1;
    const t = toMillis(r.updatedAt);
    if (t > last) last = t;
  });
  return {
    total: accessible.length,
    lockedCount: items.length - accessible.length,
    reported,
    sum,
    pct: accessible.length ? Math.round(sum / accessible.length) : 0,
    counts,
    last,
  };
}
