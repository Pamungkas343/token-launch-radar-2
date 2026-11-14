// lib/model.ts — the token launch radar's value model.
//
// Every number on the board is derived from the sealed snapshot; no protocol
// is ever named in this code. The model answers one question: if a pre-token
// protocol issued a token today and the market priced it like the live-token
// protocols in its own category, what would that token be worth?
//
//   implied value = TVL x category multiple x growth x maturity
//
//   category multiple — the median market-cap / TVL of the live-token
//     protocols in the same category (at least 3 samples), else the global
//     median over all live-token protocols with a market cap, clamped to
//     [0.05, 1.0]. A category's own market is the best guess at what its
//     next token is worth.
//   growth — 1 + 0.5 x the protocol's 7-day TVL change (as a fraction),
//     clamped to [0.4, 2.2]. Momentum counts, but half-weighted and capped,
//     so one hot week cannot carry a protocol.
//   maturity — 0.5 + 0.5 x min(days listed, 1095) / 1095. A protocol that
//     has run for three years with no token is a steadier launch candidate
//     than one listed last week; unknown listing dates score a neutral 0.75.
//
// The board holds every pre-token protocol that is not a wrapped, staked or
// bridged product of a token that already trades. Live-token protocols and
// wrapped/staked/bridged products are listed separately, so the reader can
// see what the board excludes and why.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  multiple: number;
  growth: number;
  maturity: number;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  farm_steps: string[];
  farm_costs: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  ratio: number | null;
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

export interface CategoryMultiple {
  category: string;
  samples: number;
  median: number;
  fallback: boolean;
}

export interface BoardResult {
  meta: {
    as_of: string;
    floor_usd: number;
    board_rows: number;
    watchlist_total: number;
    watchlist_covered: number;
    live_total: number;
    set_aside_total: number;
    global_median: number;
  };
  multiples: CategoryMultiple[];
  rows: BoardRow[];
  live: LiveRow[];
  setAside: SetAsideRow[];
}

// --- classification -------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Why a protocol is a wrapped, staked or bridged product, or null. */
export function wrappedReason(p: SnapshotProtocol): string | null {
  if (p.category === "CEX") return "centralised exchange product";
  if (p.category === "Bridge" || p.category === "Canonical Bridge") {
    return "bridge product";
  }
  if (
    p.category === "Liquid Staking" ||
    p.category === "Liquid Restaking" ||
    p.category === "Restaked BTC"
  ) {
    return "liquid staking product";
  }
  if (VERSION_MARKER.test(p.name)) return "versioned release of another protocol";
  if (WRAPPED_WORD.test(p.name)) return "wrapped or staked product";
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return "exchange-branded product";
  }
  return null;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return !hasToken(p) && wrappedReason(p) === null;
}

// --- model ----------------------------------------------------------------

const MIN_SAMPLES = 3;
const MULTIPLE_MIN = 0.05;
const MULTIPLE_MAX = 1.0;
const GROWTH_WEIGHT = 0.5;
const GROWTH_MIN = 0.4;
const GROWTH_MAX = 2.2;
const MATURITY_DAYS_CAP = 1095;
const UNKNOWN_AGE_MATURITY = 0.75;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function growthFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  return clamp(1 + GROWTH_WEIGHT * (change7d / 100), GROWTH_MIN, GROWTH_MAX);
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(listedAt + "T00:00:00Z");
  const ref = Date.parse(asOf + "T00:00:00Z");
  if (!Number.isFinite(listed) || !Number.isFinite(ref)) return null;
  return Math.max(0, Math.floor((ref - listed) / 86400000));
}

export function maturityFactor(listedAt: string | null, asOf: string): number {
  const days = ageDays(listedAt, asOf);
  if (days === null) return UNKNOWN_AGE_MATURITY;
  return 0.5 + 0.5 * (Math.min(days, MATURITY_DAYS_CAP) / MATURITY_DAYS_CAP);
}

// --- farm plans -----------------------------------------------------------

const CATEGORY_ACTIONS: Record<string, string> = {
  Dexs: "swap and provide liquidity in its pools",
  Lending: "supply assets and borrow a small amount against them",
  Yield: "deposit into its vaults and let the yield auto-compound",
  "Yield Aggregator": "deposit into its aggregated vaults",
  Derivatives: "open a small hedged perpetual position",
  RWA: "hold its tokenized real-world assets",
  "Onchain Capital Allocator": "allocate capital through its onchain vaults",
  "Risk Curators": "deposit into its curated risk vaults",
  CDP: "mint its stable asset against collateral",
  "Basis Trading": "run its basis-trading strategy with a small position",
  Indexes: "buy into its index product",
  Privacy: "use its privacy-preserving transactions",
  "Prediction Market": "take small positions on its markets",
  "Algo-Stables": "hold its algorithmic stable asset",
  "Options Vault": "deposit into its options vaults",
};

const DEFAULT_ACTION = "use its main product";

function chainHints(chain: string): { native: string; gas: string } {
  switch (chain) {
    case "Ethereum":
      return { native: "ETH", gas: "$3–12" };
    case "Solana":
      return { native: "SOL", gas: "under $0.10" };
    case "Base":
    case "Arbitrum":
    case "Optimism":
      return { native: "ETH", gas: "$0.50–3" };
    case "BSC":
      return { native: "BNB", gas: "$0.20–1" };
    case "Polygon":
      return { native: "POL", gas: "$0.05–0.50" };
    case "Avalanche":
      return { native: "AVAX", gas: "$0.20–1" };
    default:
      return { native: "the chain's native token", gas: "$1–5" };
  }
}

function money(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function farmPlan(row: {
  name: string;
  category: string;
  chains: string[];
  implied_value_usd: number;
}): { steps: string[]; costs: string[] } {
  const chain = row.chains.length > 0 ? row.chains[0] : "Ethereum";
  const hints = chainHints(chain);
  const action = CATEGORY_ACTIONS[row.category] ?? DEFAULT_ACTION;
  const size =
    row.implied_value_usd >= 100_000_000
      ? 2000
      : row.implied_value_usd >= 10_000_000
        ? 1000
        : 500;
  const weeks =
    row.implied_value_usd >= 100_000_000 ? 8 : row.implied_value_usd >= 10_000_000 ? 6 : 4;
  const reps =
    row.implied_value_usd >= 100_000_000 ? 6 : row.implied_value_usd >= 10_000_000 ? 5 : 4;
  const bridgeFee = chain === "Ethereum" ? "$5–20" : "$1–8";

  const steps = [
    `Set up a fresh wallet for ${row.name} on ${chain} and fund it with ${money(size)} plus ${hints.gas} of ${hints.native} for gas. Keep this wallet separate from your main holdings so its activity stays clean and easy to prove.`,
    `Move the funds to ${chain}, where ${row.name} holds most of its TVL, using its native bridge or a canonical bridge. Expect ${bridgeFee} in fees and 5–20 minutes for finality before you start.`,
    `Use ${row.name}'s ${row.category} product: ${action} with ${money(size)} and leave the position open for at least ${weeks} weeks, so the activity reads as sustained usage rather than a one-off deposit.`,
    `Repeat the core action ${reps} times across ${weeks} weeks, about 15 minutes per session, to build a transaction history instead of a single deposit that looks farmed.`,
    `Check whether ${row.name} runs a points or quest program and complete its tasks if it does, then join its community channels so you catch snapshot announcements, which are usually unannounced.`,
    `Track the position weekly and keep at least ${money(size)} deployed until a token is announced. Never deposit more than you can lose, and withdraw in stages if TVL falls 20% in a week.`,
  ];
  const costs = [
    `${money(size)} + gas`,
    `${bridgeFee} bridge fee`,
    `${money(size)} deployed`,
    `${reps} sessions · 15 min each`,
    "free",
    "weekly check",
  ];
  return { steps, costs };
}

// --- board ----------------------------------------------------------------

export function buildBoard(snapshot: Snapshot): BoardResult {
  const watchlist = new Set(snapshot.watchlist);
  const live = snapshot.protocols.filter(hasToken);

  // Category multiples from the live-token protocols that carry a market cap.
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of live) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      allRatios.push(ratio);
      const cat = p.category ?? "Uncategorised";
      const list = ratiosByCategory.get(cat) ?? [];
      list.push(ratio);
      ratiosByCategory.set(cat, list);
    }
  }
  const globalMedian = median(allRatios);

  const multipleFor = (category: string | null): number => {
    const cat = category ?? "Uncategorised";
    const samples = ratiosByCategory.get(cat);
    if (samples !== undefined && samples.length >= MIN_SAMPLES) {
      return clamp(median(samples), MULTIPLE_MIN, MULTIPLE_MAX);
    }
    return clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX);
  };

  // The multiples table: every category on the board plus every category
  // with live samples, sorted by name, so the dashboard can show the model.
  const tableCategories = new Set<string>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) tableCategories.add(p.category ?? "Uncategorised");
  }
  for (const cat of ratiosByCategory.keys()) tableCategories.add(cat);
  const multiples: CategoryMultiple[] = [...tableCategories]
    .sort()
    .map((cat) => {
      const samples = ratiosByCategory.get(cat) ?? [];
      const fallback = samples.length < MIN_SAMPLES;
      return {
        category: cat,
        samples: samples.length,
        median: fallback
          ? clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX)
          : clamp(median(samples), MULTIPLE_MIN, MULTIPLE_MAX),
        fallback,
      };
    });

  // The board: every pre-token protocol, ranked by implied value.
  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const multiple = multipleFor(p.category);
    const growth = growthFactor(p.change_7d);
    const maturity = maturityFactor(p.listed_at, snapshot.as_of);
    const implied = Math.round(p.tvl_usd * multiple * growth * maturity);
    const plan = farmPlan({
      name: p.name,
      category: p.category ?? "Uncategorised",
      chains: p.chains,
      implied_value_usd: implied,
    });
    scored.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      category: p.category ?? "Uncategorised",
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      multiple,
      growth,
      maturity,
      listed_at: p.listed_at,
      age_days: ageDays(p.listed_at, snapshot.as_of),
      watchlist: watchlist.has(p.slug),
      farm_steps: plan.steps,
      farm_costs: plan.costs,
    });
  }
  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Live-token protocols, for the dashboard's comparison tab: top 60 by TVL.
  const liveRows: LiveRow[] = [...live]
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 60)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? "Uncategorised",
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      ratio:
        p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0
          ? p.mcap_usd / p.tvl_usd
          : null,
    }));

  // Wrapped, staked or bridged products, for the set-aside tab: top 60 by TVL.
  const setAside: SetAsideRow[] = snapshot.protocols
    .map((p) => ({ p, reason: wrappedReason(p) }))
    .filter((x): x is { p: SnapshotProtocol; reason: string } => x.reason !== null)
    .sort((a, b) => b.p.tvl_usd - a.p.tvl_usd)
    .slice(0, 60)
    .map((x) => ({
      slug: x.p.slug,
      name: x.p.name,
      category: x.p.category ?? "Uncategorised",
      chains: x.p.chains,
      tvl_usd: x.p.tvl_usd,
      reason: x.reason,
    }));

  return {
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      board_rows: scored.length,
      watchlist_total: snapshot.watchlist.length,
      watchlist_covered: scored.filter((r) => r.watchlist).length,
      live_total: live.length,
      set_aside_total: snapshot.protocols.filter((p) => wrappedReason(p) !== null).length,
      global_median: globalMedian,
    },
    multiples,
    rows: scored,
    live: liveRows,
    setAside,
  };
}
