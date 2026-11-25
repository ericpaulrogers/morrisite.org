// Cloudflare Worker for "Ask Morrisite.org" on morrisite.org.
// Answers only from the guide's own passages (bundled at build time), checks every answer
// against those passages before returning it, and keeps no record of the questions.
//
// Secrets and settings (wrangler secret put / [vars]):
//   ANTHROPIC_API_KEY  the API key (secret)
//   TURNSTILE_SECRET   Cloudflare Turnstile secret key (secret)
//   MODEL              e.g. "claude-haiku-5-5" (default) or "claude-sonnet-5-5"
//   ALLOWED_ORIGIN     "https://morrisite.org"
//   HOURLY_PER_IP      questions per visitor per hour (default 15)
//   DAILY_TOTAL        questions per day for the whole site (default 500)
// Optional KV binding RATE for the limits; without it the limits are not enforced.

import * as A from "./askcore.js";
import PASSAGES from "./passages.json";
import PACKED from "./index.json"; // precomputed by pack_index.mjs, so no index is built at request time
import VERSION from "./version.json";

const INDEX = A.loadIndex(PACKED, PASSAGES);
// Warm-up searches at startup (startup has its own 1-second allowance), so the first visitor's
// question stays within the free plan's 10 ms of CPU per request.
for (const w of ["When did Joseph Morris say Christ would come", "Who died at Kington Fort in 1862", "Morrisites Deer Lodge Montana church"]) A.search(INDEX, w, 8);
const MIN_SCORE = 6; // below this, the guide very likely has nothing on the question

function cors(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "https://morrisite.org",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return env.ALLOW_NO_TURNSTILE === "1"; // local testing only; production must have the secret
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || "", remoteip: ip || "" }),
  });
  const j = await r.json();
  return !!j.success;
}

// Counts only, keyed by an hourly bucket; the question itself is never stored.
async function underLimits(env, ip) {
  if (!env.RATE) return true;
  try { return await countAndCheck(env, ip); } catch { return true; }
}

async function countAndCheck(env, ip) {
  const hour = new Date().toISOString().slice(0, 13), day = hour.slice(0, 10);
  const ipKey = `ip:${await sha(ip + hour)}`, dayKey = `day:${day}`;
  const [a, b] = await Promise.all([env.RATE.get(ipKey), env.RATE.get(dayKey)]);
  if (+a >= +(env.HOURLY_PER_IP || 15) || +b >= +(env.DAILY_TOTAL || 500)) return false;
  // Cloudflare allows one write per second to the same key, so two questions in the same second can
  // make a write fail. The limits are approximate by design: a failed count never stops an answer.
  await Promise.allSettled([
    env.RATE.put(ipKey, String(+a + 1), { expirationTtl: 3700 }),
    env.RATE.put(dayKey, String(+b + 1), { expirationTtl: 90000 }),
  ]);
  return true;
}

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
}

let LAST = ""; // why the last reply stopped (shown to the test job only)
async function callClaude(env, messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-haiku-5-5", max_tokens: 2000, system: A.SYSTEM_PROMPT, messages }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  LAST = `stop=${j.stop_reason}; blocks=${(j.content || []).map(c => c.type).join(",")}; out=${j.usage?.output_tokens}`;
  return text;
}

function notFound(q, hits, reason) {
  return {
    kind: "generated", status: "not_found", level: "not_in_guide", reason,
    see_also: hits.slice(0, 4).map(h => ({ url: h.p.url, label: `${h.p.page} › ${h.p.head}` })),
    mailto: A.mailto(q, hits.length ? hits.slice(0, 3).map(h => h.p.head).join("; ") : ""),
    version: VERSION,
  };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return cors(env, {});
    if (req.method === "GET") return cors(env, { ok: true, passages: PASSAGES.length, model: env.MODEL || "claude-haiku-5-5", version: VERSION });
    if (req.method !== "POST") return cors(env, { error: "POST only" }, 405);
    const ip = req.headers.get("cf-connecting-ip") || "";
    let body;
    try { body = await req.json(); } catch { return cors(env, { error: "Bad request" }, 400); }
    const q = String(body.q || "").replace(/\s+/g, " ").trim();
    if (q.length < 3 || q.length > 300) return cors(env, { error: "Ask a question of 3 to 300 characters." }, 400);
    const testing = !!env.TEST_TOKEN && req.headers.get("x-test-token") === env.TEST_TOKEN; // automated tests only
    if (!testing && !(await turnstileOk(env, body.turnstile, ip))) return cors(env, { error: "Please confirm you are human and try again." }, 403);
    if (!testing && !(await underLimits(env, ip))) return cors(env, { error: "The site has had many questions just now. Please try again later." }, 429);

    const hits = A.search(INDEX, q, 8);
    if (!hits.length || hits[0].score < MIN_SCORE) return cors(env, notFound(q, hits, "no-passages"));

    const msgs = [{ role: "user", content: A.userMessage(q, hits) }];
    try {
      let raw = await callClaude(env, msgs);
      let v = A.verify(raw, hits);
      if (!v.ok) { // one retry, telling the model exactly what failed
        msgs.push({ role: "assistant", content: raw }, { role: "user", content: "Your reply failed these checks: " + v.problems.join(" ") + " Reply again with JSON only, using only the passages." });
        raw = await callClaude(env, msgs);
        v = A.verify(raw, hits);
      }
      if (!v.ok) return cors(env, { ...notFound(q, hits, "failed-checks"), ...(testing ? { detail: v.problems.join(" ") + " [" + LAST + "] RAW: " + String(raw).slice(0, 700) } : {}) });
      if (v.answer.status === "not_found") return cors(env, notFound(q, hits, "model-not-found"));
      return cors(env, { kind: "generated", ...v.answer, mailto: A.mailto(q, v.answer.paragraphs.map(p => p.text).join(" ").slice(0, 400)), version: VERSION });
    } catch (e) {
      return cors(env, { error: "The answer service is not available just now. The pages below may help.", ...(testing ? { detail: String(e.message || e) } : {}), see_also: hits.slice(0, 4).map(h => ({ url: h.p.url, label: `${h.p.page} › ${h.p.head}` })) }, 503);
    }
  },
};
