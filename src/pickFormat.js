export function formatPick(p) { return p?.selection || "—"; }
export function formatOdds(o) { return o > 0 ? `+${o}` : String(o); }
