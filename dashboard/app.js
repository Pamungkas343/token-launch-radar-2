// app.js — the token launch radar's dashboard.
//
// Reads window.RADAR (written by main.ts into data.js) and renders the
// board, the live-token and set-aside tabs, the model panel, and the detail
// drawer. The detail view re-derives each row's implied value from its
// stored factors at full precision, so the reader can check the board's
// own math instead of taking it on trust.

const D = window.RADAR;

const $ = (sel) => document.querySelector(sel);

const state = { tab: "board", q: "", cat: "", chain: "", watch: false, sort: "rank" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}

function fmtUsd(n) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Math.round(n);
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

function fmtMult(v) {
  return v.toFixed(3) + "×";
}

function pctClass(v) {
  if (v === null || v === undefined) return "";
  return v > 0 ? "pos" : v < 0 ? "neg" : "";
}

// The chains column would push the value columns off screen for protocols
// on many chains, so the table shows the first two and counts the rest;
// the detail drawer lists them all.
function fmtChains(chains) {
  if (chains.length <= 2) return esc(chains.join(", "));
  return esc(chains.slice(0, 2).join(", ")) + ` +${chains.length - 2} more`;
}

// --- spotlight and model panel -------------------------------------------

function renderSpotlight() {
  const top = D.rows.slice(0, 3);
  $("#spot").innerHTML = top
    .map(
      (r) => `
    <article class="spot-card" data-slug="${esc(r.slug)}" tabindex="0">
      <div class="rank">RANK ${r.rank}</div>
      <div class="name">${esc(r.name)}</div>
      <div class="val">${fmtUsd(r.implied_value_usd)}</div>
      <div class="sub2">${esc(r.category)} · TVL ${fmtUsd(r.tvl_usd)} · 7d ${fmtPct(r.change_7d)}</div>
    </article>`,
    )
    .join("");
}

function renderMultiples() {
  $("#multiples tbody").innerHTML = D.multiples
    .map(
      (m) => `<tr>
        <td>${esc(m.category)}</td>
        <td class="num">${m.samples}</td>
        <td class="num">${fmtMult(m.median)}</td>
        <td>${m.fallback ? "global fallback" : "category median"}</td>
      </tr>`,
    )
    .join("");
}

// --- table ----------------------------------------------------------------

const HEADS = {
  board: `<tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Implied value</th><th></th></tr>`,
  live: `<tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr>`,
  setaside: `<tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th>Why set aside</th></tr>`,
};

function filteredBoard() {
  let rows = D.rows;
  if (state.watch) rows = rows.filter((r) => r.watchlist);
  if (state.cat) rows = rows.filter((r) => r.category === state.cat);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.slug.includes(q),
    );
  }
  rows = [...rows];
  if (state.sort === "tvl") rows.sort((a, b) => b.tvl_usd - a.tvl_usd);
  else if (state.sort === "growth") {
    rows.sort((a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity));
  } else if (state.sort === "name") {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  return rows;
}

function renderTable() {
  const table = $("#board");
  table.querySelector("thead").innerHTML = HEADS[state.tab];
  const tbody = table.querySelector("tbody");
  if (state.tab === "board") {
    const rows = filteredBoard();
    $("#count").textContent =
      `Showing ${rows.length} of ${D.rows.length} pre-token protocols · ` +
      `watchlist ${D.meta.watchlist_covered}/${D.meta.watchlist_total} covered · ` +
      `${D.meta.live_total} live-token and ${D.meta.set_aside_total} set aside`;
    tbody.innerHTML = rows
      .map(
        (r) => `<tr data-slug="${esc(r.slug)}">
          <td class="num">${r.rank}</td>
          <td>${esc(r.name)}${r.watchlist ? '<span class="badge">Watchlist</span>' : ""}</td>
          <td>${esc(r.category)}</td>
          <td>${fmtChains(r.chains)}</td>
          <td class="num">${fmtUsd(r.tvl_usd)}</td>
          <td class="num ${pctClass(r.change_7d)}">${fmtPct(r.change_7d)}</td>
          <td class="num val">${fmtUsd(r.implied_value_usd)}</td>
          <td><button class="mini" data-slug="${esc(r.slug)}">Details</button></td>
        </tr>`,
      )
      .join("");
  } else if (state.tab === "live") {
    const q = state.q.toLowerCase();
    const rows = D.live.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q),
    );
    $("#count").textContent = `Top ${rows.length} of ${D.meta.live_total} live-token protocols, by TVL — the market the multiples are priced from`;
    tbody.innerHTML = rows
      .map(
        (r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.category)}</td>
          <td>${fmtChains(r.chains)}</td>
          <td class="num">${fmtUsd(r.tvl_usd)}</td>
          <td class="num">${r.mcap_usd === null ? "—" : fmtUsd(r.mcap_usd)}</td>
          <td class="num">${r.ratio === null ? "—" : fmtMult(r.ratio)}</td>
        </tr>`,
      )
      .join("");
  } else {
    const q = state.q.toLowerCase();
    const rows = D.setAside.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q),
    );
    $("#count").textContent = `Top ${rows.length} of ${D.meta.set_aside_total} wrapped, staked or bridged products, by TVL — excluded because their token already trades in another form`;
    tbody.innerHTML = rows
      .map(
        (r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.category)}</td>
          <td>${fmtChains(r.chains)}</td>
          <td class="num">${fmtUsd(r.tvl_usd)}</td>
          <td>${esc(r.reason)}</td>
        </tr>`,
      )
      .join("");
  }
}

// --- detail drawer ----------------------------------------------------------

function openDetail(slug) {
  const row = D.rows.find((r) => r.slug === slug);
  if (!row) return false;
  const dlg = $("#detail");
  dlg.querySelector("h2").textContent = row.name;
  $("#detail-sub").textContent =
    `#${row.rank} · ${row.category} · ${row.chains.join(", ")} · TVL ${fmtUsd(row.tvl_usd)}` +
    ` · 7d ${fmtPct(row.change_7d)} · listed ${row.listed_at ?? "unknown"}` +
    (row.watchlist ? " · Watchlist" : "");
  // Recompute at full precision from the stored factors: the same
  // multiplication main.ts ran, in the same order.
  const recomputed = Math.round(
    row.tvl_usd * row.multiple * row.growth * row.maturity,
  );
  const diff = recomputed - row.implied_value_usd;
  $("#recompute").textContent =
    `Recompute: ${fmtUsd(row.tvl_usd)} × ${row.multiple.toFixed(4)} × ${row.growth.toFixed(4)} × ${row.maturity.toFixed(4)} = ${fmtUsd(recomputed)} — ` +
    (diff === 0
      ? "matches the board exactly (0 mismatch)"
      : "differs by " + fmtUsd(Math.abs(diff)));
  $("#breakdown").innerHTML = `
    <dt>TVL</dt><dd>${fmtUsd(row.tvl_usd)}</dd>
    <dt>Category multiple (${esc(row.category)})</dt><dd>${fmtMult(row.multiple)}</dd>
    <dt>Growth factor (7d ${fmtPct(row.change_7d)})</dt><dd>${row.growth.toFixed(4)}×</dd>
    <dt>Maturity factor (${row.age_days === null ? "age unknown" : row.age_days + " days listed"})</dt><dd>${row.maturity.toFixed(4)}×</dd>
    <dt>Implied value</dt><dd>${fmtUsd(row.implied_value_usd)}</dd>`;
  $("#steps").innerHTML = row.farm_steps
    .map(
      (s, i) =>
        `<li><b>Step ${i + 1}</b>${esc(s)} <span class="cost">${esc(row.farm_costs[i] || "")}</span></li>`,
    )
    .join("");
  if (!dlg.open) dlg.showModal();
  return true;
}

// --- init -------------------------------------------------------------------

function populateSelects() {
  const cats = [...new Set(D.rows.map((r) => r.category))].sort();
  $("#cat").innerHTML =
    '<option value="">All categories</option>' +
    cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  $("#chain").innerHTML =
    '<option value="">All chains</option>' +
    chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}

function renderAll() {
  renderTable();
}

function applyHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const cat = params.get("category");
  if (cat) {
    state.cat = cat;
    $("#cat").value = cat;
  }
  if (params.get("watch") === "1") {
    state.watch = true;
    $("#watch").checked = true;
  }
  const slug = params.get("p");
  renderAll();
  if (slug) {
    if (!openDetail(slug) && D.rows.length > 0) openDetail(D.rows[0].slug);
  }
}

function init() {
  $("#meta").textContent =
    `Snapshot ${D.meta.as_of} · ${D.rows.length} pre-token protocols ranked · ` +
    `watchlist ${D.meta.watchlist_covered}/${D.meta.watchlist_total} · ` +
    `global median multiple ${D.meta.global_median.toFixed(3)}×`;
  populateSelects();
  renderSpotlight();
  renderMultiples();
  renderTable();

  $("#q").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    renderTable();
  });
  $("#cat").addEventListener("change", (e) => {
    state.cat = e.target.value;
    renderTable();
  });
  $("#chain").addEventListener("change", (e) => {
    state.chain = e.target.value;
    renderTable();
  });
  $("#watch").addEventListener("change", (e) => {
    state.watch = e.target.checked;
    renderTable();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderTable();
  });
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tabs button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      renderTable();
    });
  });
  $("#board tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-slug]");
    if (tr) openDetail(tr.dataset.slug);
  });
  $("#spot").addEventListener("click", (e) => {
    const card = e.target.closest(".spot-card");
    if (card) openDetail(card.dataset.slug);
  });

  applyHash();
}

init();
