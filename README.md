# Token Launch Radar

Every pre-token DeFi protocol, ranked by what its token would be worth if
it launched today — and how to farm it first.

Built for the make.fun `token-radar-01` bounty. The entry is a program
plus the dashboard it writes: `main.ts` reads a sealed DefiLlama snapshot
of 758 protocols, ranks the pre-token ones by an implied launch value, and
writes a static dashboard (`dashboard/`) with the board, a detail view per
protocol, and filters.

## The model

```
implied value = TVL × category multiple × growth × maturity
```

- **Category multiple** — the median market-cap / TVL of the live-token
  protocols in the same category (at least 3 samples); otherwise the global
  median over all live-token protocols with a market cap. Clamped to
  [0.05, 1.0]. A category's own market is the best guess at what its next
  token is worth.
- **Growth** — 1 + 0.5 × the protocol's 7-day TVL change, clamped to
  [0.4, 2.2]. Momentum counts, half-weighted and capped.
- **Maturity** — 0.5 + 0.5 × min(days listed, 1095) / 1095. A protocol that
  has run for three years with no token is a steadier launch candidate than
  one listed last week; unknown listing dates score a neutral 0.75.

The board holds every pre-token protocol that is not a wrapped, staked or
bridged product of a token that already trades. The watchlist (40 protocols
at or above $50M TVL with no token recorded) is the floor, never the
ceiling: the board also ranks the pre-token protocols below it. Live-token
protocols and wrapped/staked/bridged products are listed on their own tabs,
so the reader can see what the board excludes and why.

"Records no token" means the snapshot records no token — not proof that
none exists. Nothing here predicts that a token will launch.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

`main.ts` writes `out/board.json`, `out/data.js` (the dashboard's data),
copies `dashboard/` and `screenshots/` into `out/`, and writes
`out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.
The run is deterministic: the same snapshot always writes the same bytes.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board and the
  dashboard's data, copies the dashboard and screenshots, writes the dossier.
- `lib/model.ts` — the value model, the classification rules, and the farm
  plans. Every number derives from the snapshot; no protocol is named.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`.
  No network references; the page reads `data.js` beside it.
- `screenshots/` — three renders of the dashboard (board, detail, filtered).
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `out/` — a local run's output (git-ignored).

## License

MIT — see `LICENSE`.
