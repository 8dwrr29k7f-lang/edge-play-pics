/**
 * Self-test — run with: node src/selftest.js
 * Verifies engine policy, feeds consistency, and NO-PLAY-when-thin rule.
 * Does not require Discord token.
 */
import { evaluateMatchup, parseOddsToImplied } from "./analyticsEngine.js";
import { FEEDS, liveFeedKeys, todayYYYYMMDD } from "./feeds.js";
import { CATEGORY_REGISTRY, liveCategoryKeys } from "./categoryRegistry.js";
import { validatePick, validateBoard } from "./validatePublish.js";
import { summaryStats, load as loadTracker } from "./trackerCore.js";

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("EDGE PLAY PICS self-test\n");

console.log("1. Odds / implied");
const imp = parseOddsToImplied("-110");
ok("parse -110", imp.implied != null && Math.abs(imp.implied - 0.5238) < 0.01, String(imp.implied));
ok("parse missing", parseOddsToImplied("—").implied === null);
ok("parse +150", parseOddsToImplied("+150").implied != null);

console.log("\n2. Engine policy (NO PLAY when thin)");
const weak = evaluateMatchup({
  sport: "NFL",
  selection: "TEST ML",
  game: "A @ B",
  price: "—",
  form: "thin sample 1-0",
  sampleNote: "thin sample",
  missing: "injury uncertainty",
  supporting: "close season records",
  opposing: "injury uncertainty"
});
ok("weak named pick is NO PLAY", weak.playLevel === "NO PLAY", weak.playLevel);
ok("weak is not STRONG PLAY", weak.playLevel !== "STRONG PLAY");

console.log("\n3. Strong case");
const strong = evaluateMatchup({
  sport: "NFL",
  selection: "PHI ML",
  game: "DAL @ PHI",
  price: "-120",
  form: "PHI 8-2 elite form dominant",
  supporting: "PHI holds stronger season record vs DAL clear edge",
  situational: "Home",
  sampleNote: "full season sample available",
  missing: "",
  recordGap: 0.25,
  sidePct: 0.8,
  isHome: true
});
ok("strong case not NO PLAY", strong.playLevel !== "NO PLAY", strong.playLevel);
ok("strong has modelProb", strong.modelProb >= 0.52, String(strong.modelProb));

console.log("\n4. Single source of truth (feeds)");
const liveKeys = liveCategoryKeys();
const feedKeys = liveFeedKeys();
ok("liveCategoryKeys non-empty", liveKeys.length >= 5, String(liveKeys.length));
ok("every live feed has URL", feedKeys.every((k) => FEEDS[k]?.url), feedKeys.join(","));
ok("registry has mlb", !!CATEGORY_REGISTRY.mlb?.espnUrl);
ok("FEEDS.mlb matches registry", FEEDS.mlb?.url === CATEGORY_REGISTRY.mlb.espnUrl);
ok("todayYYYYMMDD format", /^\d{8}$/.test(todayYYYYMMDD()));

console.log("\n5. validatePublish");
const drop = validatePick({
  selection: "NO PLAY",
  game: "—",
  sport: "NFL",
  playLevel: "NO PLAY"
});
ok("unnamed / NO PLAY dropped", !drop.ok && drop.pick === null);

const keepLean = validatePick({
  selection: "PHI ML",
  game: "DAL @ PHI",
  sport: "NFL",
  tier: "LEAN",
  modelProb: 0.56,
  dataQuality: "Medium",
  autopsySurvived: true,
  analyzedAt: new Date().toISOString()
});
ok("valid LEAN kept", keepLean.ok || keepLean.pick?.tier === "LEAN", JSON.stringify(keepLean.reasons));

const board = validateBoard({
  topPlays: [
    {
      selection: "BAD ML",
      game: "X @ Y",
      sport: "NFL",
      tier: "LOCK",
      modelProb: 0.48,
      redFlags: ["Injury uncertainty", "Extremely small sample"],
      autopsySurvived: false,
      analyzedAt: new Date().toISOString()
    }
  ],
  leans: [],
  text: "test"
});
ok("false LOCK removed or downgraded", board.board.topPlays.length === 0, `top=${board.board.topPlays.length}`);

console.log("\n6. Tracker");
const t = loadTracker();
ok("tracker loads", t && Array.isArray(t.picks));
const sum = summaryStats();
ok("summaryStats returns numbers", typeof sum.wins === "number" && typeof sum.pending === "number");

console.log("\n────────────────────");
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  console.error("SELF-TEST FAILED");
  process.exit(1);
}
console.log("SELF-TEST PASSED");
process.exit(0);
