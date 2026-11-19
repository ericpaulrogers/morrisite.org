// Live tests against the deployed Worker, with the real model. Run by the GitHub job
// "Ask the guide" (Run workflow → run tests). Prints a Markdown report for the job summary.
// About 20 questions; costs about a cent with Claude Haiku 5.5.
import fs from "fs";
const URL_ = process.argv[2], TOKEN = process.env.TEST_TOKEN;
if (!URL_ || !TOKEN) { console.log("Live tests skipped: no Worker URL or TEST_TOKEN."); process.exit(0); }
const here = new URL(".", import.meta.url).pathname;
const tests = JSON.parse(fs.readFileSync(here + "tests.json", "utf8")).filter(t => /^(passage|trap)/.test(t.expect));
const extra = [
  { q: "When did Joseph Morris say Christ would come?", expect: "passage:teachings.html" },
  { q: "How many people died at Kington Fort?", expect: "passage:" },
  { q: "Why did the Morrisites go to Montana?", expect: "passage:" },
];
const esc = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
let pass = 0, fail = 0, review = 0;
const rows = [];
for (const t of [...tests, ...extra]) {
  let j, st;
  try {
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", "x-test-token": TOKEN }, body: JSON.stringify({ q: t.q }) });
    st = r.status; j = await r.json();
  } catch (e) { st = 0; j = { error: String(e) }; }
  const cites = (j.paragraphs || []).flatMap(p => (p.cites || []).map(c => c.url));
  const text = (j.paragraphs || []).map(p => p.text).join(" ");
  let verdict;
  if (j.error) verdict = `FAIL (HTTP ${st}: ${j.error})`;
  else if (t.expect.startsWith("trap:model-must-refuse-premise")) verdict = "REVIEW BY HAND";
  else if (t.expect.startsWith("trap")) verdict = j.status === "not_found" ? "pass" : "FAIL (answered a trap)";
  else {
    const want = t.expect.slice(8);
    verdict = j.status !== "answered" ? "FAIL (no answer)" : (!want || cites.some(c => c.startsWith(want.split("#")[0]))) ? "pass" : "FAIL (cited other pages)";
  }
  if (verdict === "pass") pass++; else if (verdict.startsWith("REVIEW")) review++; else fail++;
  rows.push(`| ${esc(t.q)} | ${verdict} | ${esc(j.status || st)} / ${esc(j.level || "")}${j.reason ? " (" + esc(j.reason) + ")" : ""} | ${esc(text).slice(0, 400)} | ${esc([...new Set(cites)].join(", "))} |`);
}
console.log(`## Ask the guide: live tests\n\n${pass} passed, ${fail} failed, ${review} to review by hand. Worker: ${URL_}\n`);
console.log("| Question | Result | Status / level | Answer | Cites |\n|---|---|---|---|---|\n" + rows.join("\n"));
if (fail) process.exitCode = 1;
