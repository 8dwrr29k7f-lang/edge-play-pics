/**
 * Lightweight self-monitoring — never throws; always returns structured status.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { parseOddsToImplied, evaluateMatchup } from "./analyticsEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

async function probeEspn() {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "EDGE-PLAY-PICS/health" } }
    );
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = await res.json();
    return { ok: true, detail: `${(j.events || []).length} events` };
  } catch (e) {
    return { ok: false, detail: e.message || "timeout" };
  }
}

async function probeOddsApi() {
  if (!config.apiBase) return { ok: null, detail: "not configured" };
  try {
    const res = await fetch(`${config.apiBase}/api/best-bets`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: "reachable" };
  } catch (e) {
    return { ok: false, detail: e.message || "unreachable" };
  }
}

function probeEngine() {
  try {
    const imp = parseOddsToImplied("-110");
    if (imp.implied == null || Math.abs(imp.implied - 0.5238) > 0.01) {
      return { ok: false, detail: "odds math failed" };
    }
    // Weak case MUST be NO PLAY (never force confidence)
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
    if (weak.playLevel !== "NO PLAY") {
      return {
        ok: false,
        detail: `policy fail — weak named pick should be NO PLAY, got ${weak.playLevel}`
      };
    }
    if (weak.playLevel === "STRONG PLAY") {
      return { ok: false, detail: "gate fail — weak case must not be LOCK" };
    }
    // Strong case with clean data should not be NO PLAY
    const strong = evaluateMatchup({
      sport: "NFL",
      selection: "PHI ML",
      game: "DAL @ PHI",
      price: "-120",
      form: "PHI 8-2 elite form dominant",
      supporting: "PHI holds stronger season record vs DAL clear edge",
      situational: "Home",
      sampleNote: "full season sample available",
      missing: ""
    });
    if (!strong.playLevel || strong.playLevel === "NO PLAY") {
      return { ok: false, detail: "strong case should not be NO PLAY" };
    }
    return { ok: true, detail: "odds math + NO PLAY policy OK" };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

function probeDatabase() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, ".health_probe");
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    const tracker = path.join(DATA_DIR, "tracker.json");
    const state = path.join(DATA_DIR, "dailyState.json");
    return {
      ok: true,
      detail: `writable · tracker ${fs.existsSync(tracker) ? "present" : "empty"} · state ${fs.existsSync(state) ? "present" : "empty"}`
    };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

function icon(ok) {
  if (ok === true) return "🟢";
  if (ok === false) return "🔴";
  return "⚪";
}

export async function runHealthCheck(opts = {}) {
  const [espn, odds] = await Promise.all([probeEspn(), probeOddsApi()]);
  const engine = probeEngine();
  const db = probeDatabase();
  const discord = {
    ok: opts.discordReady !== false,
    detail: opts.discordReady === false ? "not ready" : "connected"
  };
  const scheduler = {
    ok: opts.schedulerArmed !== false,
    detail: opts.schedulerArmed === false ? "not armed" : "cron + interval armed"
  };

  const components = { discord, espn, odds, engine, database: db, scheduler };
  const criticalDown = [discord, espn, engine, db].some((c) => c.ok === false);

  return {
    ok: !criticalDown,
    components,
    lines: [
      `${icon(discord.ok)} Discord — ${discord.detail}`,
      `${icon(espn.ok)} Sports data (ESPN) — ${espn.detail}`,
      `${icon(odds.ok)} Odds API — ${odds.detail}`,
      `${icon(engine.ok)} Prediction engine — ${engine.detail}`,
      `${icon(db.ok)} Storage — ${db.detail}`,
      `${icon(scheduler.ok)} Scheduler — ${scheduler.detail}`
    ]
  };
}
