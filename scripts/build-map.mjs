// Build-time map generation: merges the 16 German states (from @svg-maps/germany, CC BY 4.0,
// original by MapSVG) into the four transmission system operator zones, simplifies the
// outlines and computes label positions and anchor points for cross-border arrows.
// Output: lib/map/germany-zones.json (committed). Run: npm run build:map
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import polygonClipping from "polygon-clipping";

const require = createRequire(import.meta.url);
const pkgDir = require.resolve("@svg-maps/germany/package.json").replace(/package\.json$/, "");
const src = JSON.parse(readFileSync(pkgDir + "index.js", "utf8").replace(/^export default /, "").trim().replace(/;$/, ""));

// Simplified assignment of federal states to control areas (see README / UI note).
const ZONES = {
  "50Hertz": ["be", "bb", "mv", "sn", "st", "th", "hh"],
  TenneT: ["sh", "ni", "hb", "he", "by"],
  Amprion: ["nw", "rp", "sl"],
  TransnetBW: ["bw"],
};

/** Parses a path consisting of relative "m" (with implicit linetos) and "z" into rings. */
function parsePath(d) {
  const tokens = d.match(/[mzMZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const rings = [];
  let ring = null;
  let x = 0, y = 0, startX = 0, startY = 0;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "m" || t === "M") {
      const abs = t === "M";
      i++;
      let first = true;
      while (i < tokens.length && !/[mzMZ]/.test(tokens[i])) {
        const dx = Number(tokens[i]), dy = Number(tokens[i + 1]);
        i += 2;
        x = abs ? dx : x + dx;
        y = abs ? dy : y + dy;
        if (first) {
          ring = [[x, y]];
          rings.push(ring);
          startX = x;
          startY = y;
          first = false;
        } else ring.push([x, y]);
      }
    } else if (t === "z" || t === "Z") {
      i++;
      if (ring && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push([...ring[0]]);
      x = startX; // after closepath the current point is the subpath start
      y = startY;
    } else throw new Error(`unexpected token ${t}`);
  }
  // Round to 0.01 px and drop consecutive duplicates (avoids float noise in the union).
  return rings
    .map((r) => r.map(([px, py]) => [Math.round(px * 100) / 100, Math.round(py * 100) / 100]))
    .map((r) => r.filter((p, k) => k === 0 || p[0] !== r[k - 1][0] || p[1] !== r[k - 1][1]))
    .filter((r) => r.length >= 4);
}

const area = (ring) => {
  let a = 0;
  for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
  return a / 2;
};

/** Douglas–Peucker simplification of a closed ring. */
function simplify(ring, tol) {
  const sq = tol * tol;
  const segDist = (p, a, b) => {
    let [x, y] = a;
    let dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)));
      x += dx * t;
      y += dy * t;
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let k = s + 1; k < e; k++) {
      const d = segDist(ring[k], ring[s], ring[e]);
      if (d > max) { max = d; idx = k; }
    }
    if (max > sq) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return ring.filter((_, k) => keep[k]);
}

const states = Object.fromEntries(src.locations.map((l) => [l.id, parsePath(l.path).map((r) => [r])]));

const MIN_ISLAND = 8; // px² – drop specks
const MIN_HOLE = 30; // px² – drop slivers between imperfectly matching state borders
const TOL = 0.6;

const fmt = (n) => Math.round(n * 10) / 10;
const toPath = (multi) =>
  multi
    .map((poly) => poly.map((ring) => "M" + ring.slice(0, -1).map(([x, y]) => `${fmt(x)},${fmt(y)}`).join("L") + "Z").join(""))
    .join("");

function centroidOfLargest(multi) {
  const outer = multi.map((p) => p[0]).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  let cx = 0, cy = 0, a = 0;
  for (let k = 0; k < outer.length - 1; k++) {
    const f = outer[k][0] * outer[k + 1][1] - outer[k + 1][0] * outer[k][1];
    cx += (outer[k][0] + outer[k + 1][0]) * f;
    cy += (outer[k][1] + outer[k + 1][1]) * f;
    a += f;
  }
  return [fmt(cx / (3 * a)), fmt(cy / (3 * a))];
}

const LABEL_STATES = { "50Hertz": ["bb"], TenneT: ["ni", "by"], Amprion: ["nw"], TransnetBW: ["bw"] };

const zones = {};
for (const [zone, ids] of Object.entries(ZONES)) {
  const merged = polygonClipping.union(...ids.map((id) => states[id]));
  const cleaned = merged
    .filter((poly) => Math.abs(area(poly[0])) >= MIN_ISLAND)
    .map((poly) => [poly[0], ...poly.slice(1).filter((h) => Math.abs(area(h)) >= MIN_HOLE)])
    .map((poly) => poly.map((ring) => simplify(ring, TOL)).filter((r) => r.length >= 4));
  const labels = LABEL_STATES[zone].map((id) => centroidOfLargest(states[id]));
  zones[zone] = { states: ids.map((s) => s.toUpperCase()), path: toPath(cleaned), labels };
}

// Anchors for cross-border arrows: extreme point of a border state in a given direction.
const NEIGHBOURS = {
  NO: { state: "sh", dir: [-1, -0.75] },
  DK: { state: "sh", dir: [0.15, -1] },
  SE: { state: "mv", dir: [0.55, -1] },
  PL: { state: "bb", dir: [1, 0] },
  CZ: { state: "by", dir: [1, -0.45] },
  AT: { state: "by", dir: [0.65, 1] },
  CH: { state: "bw", dir: [0, 1] },
  FR: { state: "bw", dir: [-1, 0.55] },
  LU: { state: "rp", dir: [-1, -0.1] },
  BE: { state: "nw", dir: [-1, 0.35] },
  NL: { state: "nw", dir: [-1, -0.45] },
};
const anchors = {};
for (const [cc, { state, dir }] of Object.entries(NEIGHBOURS)) {
  const len = Math.hypot(dir[0], dir[1]);
  const u = [dir[0] / len, dir[1] / len];
  let best = null, bestDot = -Infinity;
  for (const ring of states[state].flat()) {
    for (const p of ring) {
      const d = p[0] * u[0] + p[1] * u[1];
      if (d > bestDot) { bestDot = d; best = p; }
    }
  }
  anchors[cc] = { at: [fmt(best[0]), fmt(best[1])], dir: [Math.round(u[0] * 100) / 100, Math.round(u[1] * 100) / 100] };
}

const out = {
  viewBox: src.viewBox,
  attribution: "Karte: MapSVG via @svg-maps/germany (CC BY 4.0), zu Regelzonen zusammengefasst",
  zones,
  anchors,
};
writeFileSync("lib/map/germany-zones.json", JSON.stringify(out, null, 1) + "\n");
console.log("lib/map/germany-zones.json:", Object.entries(zones).map(([k, z]) => `${k} ${z.path.length} chars`).join(", "));
