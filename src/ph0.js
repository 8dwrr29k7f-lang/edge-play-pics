/** ph0-style helpers: no-vig, EV gates */
export function americanToImplied(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return null;
  if (o > 0) return 100 / (o + 100);
  return Math.abs(o) / (Math.abs(o) + 100);
}

export function noVigTwoWay(oddsA, oddsB) {
  const a = americanToImplied(oddsA);
  const b = americanToImplied(oddsB);
  if (a == null || b == null) return null;
  const s = a + b;
  if (s <= 0) return null;
  return { fairA: a / s, fairB: b / s, vig: s - 1 };
}

export function evFromFair(fairProb, priceAmerican) {
  const imp = americanToImplied(priceAmerican);
  if (fairProb == null || imp == null) return null;
  return fairProb - imp;
}
