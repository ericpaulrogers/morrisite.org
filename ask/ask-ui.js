// ask-ui.js: the "Ask Morrisite.org" page. Reviewed answers first, then the site's people lists,
// then (if a Worker is configured) an AI answer drawn only from the site's passages.
import * as A from "./askcore.js";

const CFG = window.ASK_CONFIG || {};
const BASE = CFG.base || "";            // "" on the site; "https://morrisite.org/" in the demo
const WORKER = CFG.worker || "";        // the Worker's URL; empty means demo mode (no AI answers)
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LEVEL = {
  documented: ["Documented", "The site's sources state this."],
  probable: ["Probable", "The site treats this as likely but not certain."],
  disputed: ["Disputed", "The sources or scholars disagree; the answer gives the readings."],
  not_in_guide: ["Not on the site", "The site does not answer this yet."],
};

let DATA = null;
async function load() {
  if (DATA) return DATA;
  const get = f => fetch(new URL(f, import.meta.url)).then(r => r.json());
  // The live page needs only the reviewed answers and the people lists; the passages (1.4 MB) stay
  // with the answer service. Only the demo, which has no answer service, loads them.
  const [reviewed, people, passages] = await Promise.all([get("reviewed.json"), get("people.json"), WORKER ? null : get("passages.json")]);
  const labels = new Map();
  for (const r of reviewed) for (const [u, l] of Object.entries(r.labels || {})) labels.set(u, l);
  if (passages) for (const p of passages) { const u = p.url.split("~")[0]; if (!labels.has(u)) labels.set(u, `${p.page} › ${p.head}`); }
  DATA = { reviewed, people: A.parsePeople(people), passages, index: passages ? A.buildIndex(passages) : null, labels };
  return DATA;
}

const link = (url, text) => `<a href="${esc(BASE + url)}">${esc(text)}</a>`;
const labelFor = url => DATA.labels.get(url) || url;
const badge = lv => lv && LEVEL[lv] ? `<span class="ask-level ask-${lv}" title="${esc(LEVEL[lv][1])}">${LEVEL[lv][0]}</span>` : "";

function sourcesList(urls) {
  return `<ol class="ask-sources">${urls.map(u => `<li>${link(u, labelFor(u))}</li>`).join("")}</ol>`;
}

function contribute(q, shown) {
  return `<p class="ask-contribute">Know more, or see something wrong? <a href="${esc(A.mailto(q, shown))}">Write to contact@morrisite.org</a>. Letters, family records, photographs and corrections are welcome, and nothing is published without permission.</p>`;
}

function renderReviewed(r, q) {
  const order = [];
  const num = u => { let i = order.indexOf(u); if (i < 0) { order.push(u); i = order.length - 1; } return i + 1; };
  const paras = r.paragraphs.map(p => `<p>${esc(p.text)} ${[...new Set(p.cites)].map(u => `<sup><a href="${esc(BASE + u)}">[${num(u)}]</a></sup>`).join("")}</p>`).join("");
  const quotes = (r.quotes || []).map(x => `<blockquote>&ldquo;${esc(x.text)}&rdquo; <cite>${link(x.url, labelFor(x.url))}</cite></blockquote>`).join("");
  const see = (r.see_also || []).filter(u => !order.includes(u));
  return `<article class="ask-answer"><p class="ask-tags"><span class="ask-kind ask-reviewed">Reviewed by the editor</span> ${badge(r.level)}</p>
    ${paras}${quotes}<h3>Sources</h3>${sourcesList(order)}${see.length ? `<h3>See also</h3>${sourcesList(see)}` : ""}${contribute(q, r.paragraphs.map(p => p.text).join(" ").slice(0, 300))}</article>`;
}

function renderPeople(res, q) {
  if (res.groups.length) {
    const many = res.groups.length > 1;
    const cards = res.groups.slice(0, 8).map(g => `<div class="ask-person"><h4>${esc(g.label)}</h4><ul>${g.records.map(r =>
      `<li><span class="ask-src">${esc(r.src)}${r.level && /prob/i.test(r.level) ? " (probable)" : ""}</span> ${esc((r.text || "").slice(0, 420))}${(r.text || "").length > 420 ? "&hellip;" : ""} ${link(r.url, "Open")}</li>`).join("")}</ul></div>`).join("");
    return `<article class="ask-answer"><p class="ask-tags"><span class="ask-kind ask-lists">From the site's lists of people</span></p>
      ${many ? `<p><b>The site has ${res.groups.length} people who may match.</b> They may be different people with similar names, or one person written two ways; the site does not merge them without evidence. Which do you mean?</p>` : ""}
      ${cards}<p class="ask-note">These are the entries as the site gives them. A shared name is not proof of a family link: check the sources each entry cites, and see <a href="${esc(BASE)}index.html#ancestor">Looking for a Morrisite ancestor?</a></p>${contribute(q, res.groups.map(g => g.label).join("; "))}</article>`;
  }
  if (res.near.length) {
    return `<article class="ask-answer"><p class="ask-tags"><span class="ask-kind ask-lists">From the site's lists of people</span> ${badge("not_in_guide")}</p>
      <p>The site has no one by that exact name. People with a similar surname: ${res.near.map(g => link(g.records[0].url, g.label)).join("; ")}. The roll and the registers spell names as clerks heard them, so try other spellings in the <a href="${esc(BASE)}names.html">name index</a>.</p>${contribute(q, "")}</article>`;
  }
  return "";
}

function renderGenerated(a, q) {
  if (a.error) return `<article class="ask-answer"><p>${esc(a.error)}</p>${a.see_also ? sourcesList(a.see_also.map(s => s.url)) : ""}</article>`;
  if (a.status === "not_found") {
    return `<article class="ask-answer"><p class="ask-tags"><span class="ask-kind ask-ai">Searched the site</span> ${badge("not_in_guide")}</p>
      <p>The site does not answer this yet. ${a.see_also?.length ? "The closest pages are:" : ""}</p>${a.see_also?.length ? `<ol class="ask-sources">${a.see_also.map(s => `<li>${link(s.url, s.label)}</li>`).join("")}</ol>` : ""}
      <p>For archives that may hold the answer, see <a href="${esc(BASE)}repositories.html">Repositories</a> and <a href="${esc(BASE)}questions.html">Questions</a>.</p>
      <p class="ask-contribute">If you know the answer, or have a record that bears on it, please <a href="${esc(a.mailto || A.mailto(q, ""))}">write to contact@morrisite.org</a>.</p></article>`;
  }
  const order = [];
  const num = c => { let i = order.findIndex(o => o.url === c.url); if (i < 0) { order.push(c); i = order.length - 1; } return i + 1; };
  const paras = a.paragraphs.map(p => `<p>${esc(p.text)} ${p.cites.map(c => `<sup><a href="${esc(BASE + c.url)}">[${num(c)}]</a></sup>`).join("")}</p>`).join("");
  const quotes = (a.quotes || []).map(x => `<blockquote>&ldquo;${esc(x.text)}&rdquo; <cite>${link(x.url, x.label)}</cite></blockquote>`).join("");
  // A partial answer gets one label, not "Not on the site" beside an answer that says what the site does have.
  const tags = a.status === "partial"
    ? `<span class="ask-level ask-partial" title="The site answers part of this question; the answer says which part it does not.">Partly answered</span>${a.level && a.level !== "not_in_guide" ? " " + badge(a.level) : ""}`
    : badge(a.level);
  return `<article class="ask-answer ask-generated"><p class="ask-tags"><span class="ask-kind ask-ai">Unreviewed: written by AI from the site</span> ${tags}</p>
    ${paras}${quotes ? `<h3>Evidence</h3>${quotes}` : ""}<h3>Sources</h3><ol class="ask-sources">${order.map(c => `<li>${link(c.url, c.label)}</li>`).join("")}</ol>
    ${a.see_also?.length ? `<h3>See also</h3><ol class="ask-sources">${a.see_also.map(s => `<li>${link(s.url, s.label)}</li>`).join("")}</ol>` : ""}
    <p class="ask-note">This answer was written by AI from the passages cited and checked against them before it was shown, but it can still be wrong. Check the cited pages. Guide version ${esc(a.version?.commit || "")}.</p>
    <p class="ask-contribute"><a href="${esc("mailto:contact@morrisite.org?subject=" + encodeURIComponent("Was this right? " + q.slice(0, 70)) + "&body=" + encodeURIComponent("Question: " + q + "\n\nAnswer shown:\n" + a.paragraphs.map(p => p.text).join("\n") + "\n\nWhat is wrong or missing:\n"))}">Was this right? Tell the editor</a> &middot; <a href="${esc(a.mailto || A.mailto(q, ""))}">Share what you know</a></p></article>`;
}

function renderDemo(q) {
  const hits = A.search(DATA.index, q, 6);
  if (!hits.length) return renderGenerated({ status: "not_found", see_also: [] }, q);
  return `<article class="ask-answer ask-demo"><p class="ask-tags"><span class="ask-kind ask-ai">Demo: no AI answer here</span></p>
    <p>On the site, the AI answer is written at this point, from these passages only, cited to them and checked against them before it is shown. (This demo page is not allowed to call the answer service.)</p>
    <ol class="ask-sources">${hits.map(h => `<li>${link(h.p.url, h.p.page + " › " + h.p.head)}<br><span class="ask-snip">${esc(h.p.text.slice(0, 260))}&hellip;</span></li>`).join("")}</ol>
    ${contribute(q, hits.slice(0, 3).map(h => h.p.head).join("; "))}</article>`;
}

// The AI answer is written only when the visitor asks for it; the human check appears then.
function offer() {
  return `<article class="ask-answer ask-offer" id="ask-offer"><p><b>Want an answer written from the site&rsquo;s pages?</b> It takes a few seconds. The answer is written by AI from the site&rsquo;s own pages only, cited to them and checked against them before it is shown.</p>
    <p><button type="button" id="ask-gen">Write an answer from the site</button></p><div id="ask-ts"></div></article>`;
}

let TS_ID = null;
function humanCheck() {
  return new Promise((resolve, reject) => {
    if (!CFG.sitekey) return resolve("");
    const go = () => {
      const box = $("#ask-ts");
      box.innerHTML = '<p class="ask-note">A quick check that you are a person, by Cloudflare Turnstile. <b>If a box appears below, tick it to continue.</b></p><div id="ask-ts-w"></div>';
      TS_ID = window.turnstile.render("#ask-ts-w", { sitekey: CFG.sitekey, size: "flexible", callback: resolve, "error-callback": () => reject(new Error("check")), "expired-callback": () => reject(new Error("check")) });
    };
    if (window.turnstile) go();
    else { let n = 0; const t = setInterval(() => { if (window.turnstile) { clearInterval(t); go(); } else if (++n > 50) { clearInterval(t); reject(new Error("load")); } }, 100); }
  });
}

async function generate(q) {
  const box = $("#ask-offer");
  if (!WORKER) { box.outerHTML = renderDemo(q); return; }
  $("#ask-gen").disabled = true;
  let a;
  try {
    const token = await humanCheck();
    $("#ask-ts").innerHTML = "";
    box.querySelector("p:last-of-type").outerHTML = '<p class="ask-wait">Writing an answer from the site&hellip;</p>';
    const r = await fetch(WORKER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, turnstile: token }) });
    a = await r.json();
  } catch (e) {
    a = { error: e.message === "check" || e.message === "load" ? "The person check did not complete. Please reload the page and try again." : "The answer service could not be reached just now." };
  }
  if (window.turnstile && TS_ID !== null) { try { window.turnstile.remove(TS_ID); } catch (e) {} TS_ID = null; }
  $("#ask-offer").outerHTML = renderGenerated(a, q);
}

async function ask(q) {
  const out = $("#ask-out");
  q = q.trim();
  if (q.length < 3) return;
  out.innerHTML = "<p class=\"ask-wait\">Searching the site&hellip;</p>";
  await load();
  const parts = [];
  const rev = A.matchReviewed(DATA.reviewed, q);
  if (rev) parts.push(renderReviewed(rev, q));
  const ppl = rev ? { groups: [], near: [] } : A.findPeople(DATA.people, q);
  // "No one by that name" lists only help a question that is just a name; a fuller question goes to the passages.
  if (!ppl.groups.length && A.tokens(q).length >= 3) ppl.near = [];
  const pp = renderPeople(ppl, q);
  if (pp) parts.push(pp);
  // A question that names a person but asks something more ("Was Lot Smith at the siege?") is also offered a written answer.
  const nameToks = new Set(ppl.groups.flatMap(g => A.tokens(g.label)));
  const extra = A.tokens(q).filter(t => !nameToks.has(t)).length;
  if (!rev && (!ppl.groups.length || extra >= 2)) parts.push(offer());
  out.innerHTML = parts.join("");
  $("#ask-gen")?.addEventListener("click", () => generate(q));
}

$("#ask-form").addEventListener("submit", e => { e.preventDefault(); ask($("#ask-q").value); history.replaceState(null, "", "?q=" + encodeURIComponent($("#ask-q").value)); });
document.querySelectorAll("[data-ask]").forEach(b => b.addEventListener("click", () => { $("#ask-q").value = b.dataset.ask; ask(b.dataset.ask); }));
const pre = new URLSearchParams(location.search).get("q");
if (pre) { $("#ask-q").value = pre; ask(pre); }
