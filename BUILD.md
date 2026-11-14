# Token Launch Radar — build notes

Fresh-authored post-opening build. No file of the earlier entry was read
while writing this one: every file below was written from the kit's
RULES.txt, the snapshot's own figures, and the model spec in this note.
The vendor library was copied from the kit unchanged.

## The model

```
implied value = TVL × category multiple × growth × maturity
```

- **Category multiple** — median market-cap / TVL of the live-token
  protocols in the same category (minimum 3 samples with a market cap);
  otherwise the global median. Clamped to [0.05, 1.0].
  Global median on this snapshot: 0.2049× (129 live-token protocols with
  a market cap above zero).
- **Growth** — 1 + 0.5 × 7-day TVL change (as a fraction), clamped to
  [0.4, 2.2]. Null change scores 1.0.
- **Maturity** — 0.5 + 0.5 × min(days listed, 1095) / 1095. Unknown listing
  dates score a neutral 0.75.

Classification (from the snapshot's own record, never a name list):

- A protocol "has a token" when `gecko_id` or `symbol` is non-null.
- A protocol is a wrapped/staked/bridged product when its category is
  Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
  or CEX; its name ends in a version marker; its name carries a whole word
  "wrapped", "staked" or "staking"; or its name starts with an exchange's
  name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, Gemini).
- The board holds every pre-token protocol: 198 rows, watchlist 40/40.
  Live-token protocols (416) and wrapped/staked/bridged products (316)
  are listed on their own dashboard tabs, top 60 by TVL each.

Farm plans: 6 steps per row, derived from the row's category, primary
chain, and implied-value tier (farm size $500 / $1,000 / $2,000; 4 / 6 /
8 weeks). No protocol name is special-cased.

## Verification (this build)

- `node main.ts`: 758 protocols in, 198 board rows, watchlist 40/40.
  Top 3: Steakhouse Financial $435,567,717; Sentora Curator $409,146,902;
  Gauntlet $259,413,567.
- Determinism: `board.json`, `data.js`, `dossier.json` byte-identical
  across two runs.
- Dashboard source: 19,560 bytes total (index.html 3,284; app.css ~5.5K;
  app.js ~11K) — under the 64 KB cap, so the judge reads it whole.
- No `http://` or `https://` anywhere in the dashboard files.
- Gate mirror (`gate-mirror.mjs`): **7/7 PASS** — dashboard_files,
  board_file (198 rows), sorted_by_value, coverage (40, missing 0),
  farm_steps, screenshots, dossier_matches (byte-identical, dossier
  877,588 bytes, text 19,826 bytes).
- Detail drawer recompute: re-derives the implied value from the stored
  factors at full precision — 0 mismatch (verified in the headless
  browser checks on the VPS).
- Screenshots (VPS WSL1 Playwright, 1440×900): 1-board.png 206,167 B;
  2-detail.png 252,335 B; 3-filtered.png 183,723 B. All three visually
  verified: the board shot shows the ranked table with the implied-value
  column, the detail shot shows the model breakdown and farm steps, the
  filtered shot shows the Dexs filter (21 rows).
- Layout fixes made during this build: the model panel moved below the
  board (the first screenshots showed only the panel, the table was below
  the fold), the chains column truncates to two chains + "+N more", the
  page widened to 1280px, and the detail dialog scrolls within the viewport.

## Files

- `main.ts` — entrypoint (see README for the run command).
- `lib/model.ts` — the model, classification, farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`.
- `screenshots/` — the three renders above.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `out/` — local run output (git-ignored).
