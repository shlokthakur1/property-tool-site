// Multi-select checkbox filters (with an in-panel search box for high-cardinality fields).
const MULTI_FIELDS = [
  { field: "status", label: "Status" },
  { field: "state", label: "State" },
  { field: "property_type", label: "Type" },
  { field: "suburb", label: "Suburb" },
  { field: "postcode", label: "Postcode" },
  { field: "zone", label: "Zone" },
];

// Min/max range filters.
const RANGE_FIELDS = [
  { field: "price", label: "Price" },
  { field: "land_size_m2", label: "Land (m²)" },
];

const filterState = {
  search: "",
  multi: {},
  range: {},
};
MULTI_FIELDS.forEach((f) => (filterState.multi[f.field] = new Set()));
RANGE_FIELDS.forEach((f) => (filterState.range[f.field] = { min: null, max: null }));

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function buildColumns(columnsCfg) {
  return columnsCfg.map((col) => {
    const base = { field: col.field, title: col.title, headerFilter: false };
    if (col.field === "url") {
      return {
        ...base,
        formatter: (cell) => {
          const url = cell.getValue();
          return url ? `<a href="${url}" target="_blank" rel="noopener">View</a>` : "";
        },
      };
    }
    if (
      col.field === "land_size_m2" ||
      col.field === "suburb_comparable_count" ||
      col.field === "min_lot_size_m2" ||
      col.field === "min_frontage_m"
    ) {
      return { ...base, sorter: "number" };
    }
    if (col.field === "max_new_lots_estimate") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : Math.round(value).toString();
        },
      };
    }
    if (col.field === "price") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `$${Math.round(value).toLocaleString()}`;
        },
      };
    }
    if (col.field === "price_per_m2") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `$${Math.round(value).toLocaleString()}/m²`;
        },
      };
    }
    if (col.field === "price_vs_suburb_median_pct" || col.field === "price_per_m2_vs_suburb_median_pct") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          if (value == null) return "";
          const sign = value > 0 ? "+" : "";
          const cls = value > 0 ? "pct-above" : value < 0 ? "pct-below" : "";
          return `<span class="${cls}">${sign}${value.toFixed(1)}%</span>`;
        },
      };
    }
    return base;
  });
}

function distinctValues(rows, field) {
  const values = new Set();
  rows.forEach((r) => {
    if (r[field] !== null && r[field] !== undefined && r[field] !== "") {
      values.add(String(r[field]));
    }
  });
  return Array.from(values).sort();
}

function rowMatchesFilters(row) {
  const term = filterState.search;
  if (term && !String(row.address ?? "").toLowerCase().includes(term)) {
    return false;
  }

  for (const { field } of MULTI_FIELDS) {
    const selected = filterState.multi[field];
    if (selected.size > 0 && !selected.has(String(row[field] ?? ""))) {
      return false;
    }
  }

  for (const { field } of RANGE_FIELDS) {
    const { min, max } = filterState.range[field];
    const value = row[field];
    if (min != null && (value == null || value < min)) return false;
    if (max != null && (value == null || value > max)) return false;
  }

  return true;
}

function closeAllPanels(except) {
  document.querySelectorAll(".multiselect__panel.is-open").forEach((panel) => {
    if (panel !== except) panel.classList.remove("is-open");
  });
}

function createMultiSelect(field, label, options, selected, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "multiselect";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "multiselect__toggle";
  toggle.textContent = label;
  wrapper.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "multiselect__panel";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = `Search ${label.toLowerCase()}...`;
  searchInput.className = "multiselect__search";
  panel.appendChild(searchInput);

  const actions = document.createElement("div");
  actions.className = "multiselect__actions";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";
  actions.appendChild(clearBtn);
  panel.appendChild(actions);

  const list = document.createElement("div");
  list.className = "multiselect__list";
  panel.appendChild(list);

  function updateToggleLabel() {
    toggle.textContent = selected.size > 0 ? `${label} (${selected.size})` : label;
    toggle.classList.toggle("is-active", selected.size > 0);
  }

  function renderList(filterTerm) {
    list.innerHTML = "";
    const term = filterTerm.toLowerCase();
    options
      .filter((opt) => opt.toLowerCase().includes(term))
      .forEach((opt) => {
        const item = document.createElement("label");
        item.className = "multiselect__item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = opt;
        checkbox.checked = selected.has(opt);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(opt);
          else selected.delete(opt);
          updateToggleLabel();
          onChange();
        });

        const span = document.createElement("span");
        span.textContent = opt;

        item.appendChild(checkbox);
        item.appendChild(span);
        list.appendChild(item);
      });
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  clearBtn.addEventListener("click", () => {
    selected.clear();
    updateToggleLabel();
    renderList(searchInput.value);
    onChange();
  });

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains("is-open");
    closeAllPanels();
    if (!isOpen) panel.classList.add("is-open");
  });
  panel.addEventListener("click", (e) => e.stopPropagation());

  renderList("");
  updateToggleLabel();

  wrapper.appendChild(panel);
  return {
    wrapper,
    refresh: () => {
      searchInput.value = "";
      renderList("");
      updateToggleLabel();
    },
  };
}

function createRangeFilter(label, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "rangefilter";

  const labelEl = document.createElement("span");
  labelEl.className = "rangefilter__label";
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const minInput = document.createElement("input");
  minInput.type = "number";
  minInput.placeholder = "Min";
  minInput.className = "rangefilter__input";

  const maxInput = document.createElement("input");
  maxInput.type = "number";
  maxInput.placeholder = "Max";
  maxInput.className = "rangefilter__input";

  const emit = debounce(() => {
    const min = minInput.value === "" ? null : Number(minInput.value);
    const max = maxInput.value === "" ? null : Number(maxInput.value);
    onChange(min, max);
  }, 200);

  minInput.addEventListener("input", emit);
  maxInput.addEventListener("input", emit);

  wrapper.appendChild(minInput);
  wrapper.appendChild(maxInput);

  return {
    wrapper,
    reset: () => {
      minInput.value = "";
      maxInput.value = "";
    },
  };
}

function buildFilterControls(rows, table) {
  const container = document.getElementById("filters");
  const applyFilters = () => table.setFilter(rowMatchesFilters);

  const multiSelectRefreshers = [];
  const rangeResetters = [];

  MULTI_FIELDS.forEach(({ field, label }) => {
    const options = distinctValues(rows, field);
    const { wrapper, refresh } = createMultiSelect(field, label, options, filterState.multi[field], applyFilters);
    multiSelectRefreshers.push(refresh);
    container.appendChild(wrapper);
  });

  RANGE_FIELDS.forEach(({ field, label }) => {
    const { wrapper, reset } = createRangeFilter(label, (min, max) => {
      filterState.range[field] = { min, max };
      applyFilters();
    });
    rangeResetters.push(reset);
    container.appendChild(wrapper);
  });

  document.addEventListener("click", () => closeAllPanels());

  document.getElementById("clear-filters").addEventListener("click", () => {
    filterState.search = "";
    document.getElementById("search-box").value = "";
    MULTI_FIELDS.forEach(({ field }) => filterState.multi[field].clear());
    RANGE_FIELDS.forEach(({ field }) => (filterState.range[field] = { min: null, max: null }));
    multiSelectRefreshers.forEach((refresh) => refresh());
    rangeResetters.forEach((reset) => reset());
    applyFilters();
  });
}

function updateRowCount(table, countEl, noun) {
  const el = document.getElementById(countEl);
  const shown = table.getDataCount("active");
  const total = table.getDataCount("all");
  el.textContent = `${shown.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subdivision tab — a suburb-level opportunity finder. Each listing in
// payload.subdivision.listings is a currently-For-Sale block big enough to
// subdivide, with a comp-backed resale estimate already computed at build
// time (see build_site.py build_subdivision_listings). Cost-per-lot and
// stamp duty are live-adjustable here, so profit — and therefore which
// suburbs even qualify — is computed entirely client-side and recomputed on
// every parameter/filter change.
// ─────────────────────────────────────────────────────────────────────────────
const SUBDIVISION_MULTI_FIELDS = [{ field: "state", label: "State" }];
const SUBDIVISION_RANGE_FIELDS = [
  { field: "land_size_m2", label: "Land (m²)" },
  { field: "price", label: "Price" },
];

const subdivisionFilterState = { multi: {}, range: {} };
SUBDIVISION_MULTI_FIELDS.forEach((f) => (subdivisionFilterState.multi[f.field] = new Set()));
SUBDIVISION_RANGE_FIELDS.forEach((f) => (subdivisionFilterState.range[f.field] = { min: null, max: null }));

const subdivisionParams = { costPerLot: 0, stampDutyBufferPct: 0 };

function computeProfit(listing, params) {
  const cost = listing.price + params.costPerLot * listing.lots_possible
    + listing.price * (params.stampDutyBufferPct / 100);
  return listing.est_total_revenue - cost;
}

function confidenceLabel(confidence) {
  if (confidence >= 0.9) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

function listingMatchesFilters(listing) {
  const selectedStates = subdivisionFilterState.multi.state;
  if (selectedStates.size > 0 && !selectedStates.has(String(listing.state ?? ""))) return false;
  for (const { field } of SUBDIVISION_RANGE_FIELDS) {
    const { min, max } = subdivisionFilterState.range[field];
    const value = listing[field];
    if (min != null && (value == null || value < min)) return false;
    if (max != null && (value == null || value > max)) return false;
  }
  return true;
}

// Groups profitable (after live params), filter-matching listings by
// suburb+state. A suburb's displayed profit/confidence are its single best
// opportunity's own numbers — that's the one an investor would actually
// pursue — with the rest of the suburb's opportunities available on drill-in.
function buildSuburbGroups(listings, params) {
  const bySuburb = new Map();
  for (const listing of listings) {
    if (!listingMatchesFilters(listing)) continue;
    const profit = computeProfit(listing, params);
    if (profit <= 0) continue;
    const key = `${listing.suburb}||${listing.state}`;
    const scored = { ...listing, profit, index: profit * listing.confidence };
    if (!bySuburb.has(key)) bySuburb.set(key, []);
    bySuburb.get(key).push(scored);
  }

  const groups = [];
  for (const items of bySuburb.values()) {
    items.sort((a, b) => b.index - a.index);
    const best = items[0];
    groups.push({
      suburb: best.suburb,
      state: best.state,
      bestProfit: best.profit,
      bestConfidence: best.confidence,
      index: best.index,
      opportunityCount: items.length,
      listings: items,
    });
  }
  groups.sort((a, b) => b.index - a.index);
  return groups;
}

function formatMoney(value) {
  return value == null ? "—" : `$${Math.round(value).toLocaleString()}`;
}

function buildSuburbColumns() {
  return [
    { field: "suburb", title: "Suburb", headerFilter: false },
    { field: "state", title: "State", headerFilter: false, width: 80 },
    {
      field: "opportunityCount", title: "Opportunities", sorter: "number", width: 130,
      formatter: (cell) => cell.getValue().toLocaleString(),
    },
    {
      field: "bestProfit", title: "Best Est. Profit", sorter: "number",
      formatter: (cell) => {
        const value = cell.getValue();
        return `<span class="profit-positive">+${formatMoney(value)}</span>`;
      },
    },
    {
      field: "bestConfidence", title: "Confidence", sorter: "number", width: 110,
      formatter: (cell) => {
        const value = cell.getValue();
        const label = confidenceLabel(value);
        return `<span class="confidence-badge confidence-${label.toLowerCase()}">${label}</span>`;
      },
    },
    // Not shown directly (profit + confidence already tell the story), just
    // the default sort target: best profit weighted by how much evidence
    // backs its resale estimate, so a shakier huge number doesn't outrank a
    // smaller, well-supported one.
    { field: "index", title: "Index", visible: false, sorter: "number" },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down modal: a suburb's listings, each expandable in place to show the
// full profit calculation and the actual comparable sales used.
// ─────────────────────────────────────────────────────────────────────────────
function renderCompsTable(comps) {
  if (!comps || comps.length === 0) return "<p class=\"modal-empty\">No comp details available.</p>";
  const rows = comps.map((c) => `
    <tr>
      <td>${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${c.address ?? "—"}</a>` : (c.address ?? "—")}</td>
      <td>${c.land_size_m2 != null ? `${Math.round(c.land_size_m2).toLocaleString()} m²` : "—"}</td>
      <td>${formatMoney(c.price)}</td>
      <td>${c.sold_date ?? "—"}</td>
    </tr>
  `).join("");
  return `
    <table class="comps-table">
      <thead><tr><th>Address</th><th>Land</th><th>Sold price</th><th>Sold date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderListingDetail(listing, params) {
  const subdivisionCost = params.costPerLot * listing.lots_possible;
  const stampDuty = listing.price * (params.stampDutyBufferPct / 100);
  const totalCost = listing.price + subdivisionCost + stampDuty;
  return `
    <div class="listing-detail">
      <div class="listing-detail__calc">
        <div><span>Purchase price</span><span>${formatMoney(listing.price)}</span></div>
        <div><span>Subdivision cost (${listing.lots_possible} × ${formatMoney(params.costPerLot)})</span><span>${formatMoney(subdivisionCost)}</span></div>
        <div><span>Stamp duty buffer (${params.stampDutyBufferPct}%)</span><span>${formatMoney(stampDuty)}</span></div>
        <div class="listing-detail__total"><span>Total cost</span><span>${formatMoney(totalCost)}</span></div>
        <div><span>Comp median price × ${listing.lots_possible} lots</span><span>${formatMoney(listing.est_total_revenue)}</span></div>
        <div class="listing-detail__total"><span>Estimated profit</span><span class="profit-positive">+${formatMoney(listing.profit)}</span></div>
      </div>
      <h4>Comparables used (${listing.comp_count}, ${confidenceLabel(listing.confidence)} confidence)</h4>
      <p class="modal-note">Sold vacant land in ${listing.suburb}, sized within 30% of the ${Math.round(listing.resulting_lot_m2)}m² resulting lot
        — median ${formatMoney(listing.comp_median_price)}, range ${formatMoney(listing.comp_min_price)}–${formatMoney(listing.comp_max_price)}.</p>
      ${renderCompsTable(listing.comps)}
    </div>
  `;
}

function openSuburbModal(group, params) {
  const overlay = document.getElementById("subdivision-modal");
  const title = document.getElementById("subdivision-modal-title");
  const body = document.getElementById("subdivision-modal-body");

  title.textContent = `${group.suburb}, ${group.state} — ${group.opportunityCount} opportunit${group.opportunityCount === 1 ? "y" : "ies"}`;
  body.innerHTML = "";

  group.listings.forEach((listing, i) => {
    const card = document.createElement("div");
    card.className = "listing-card";
    card.innerHTML = `
      <div class="listing-card__summary">
        <div class="listing-card__main">
          <a href="${listing.url}" target="_blank" rel="noopener">${listing.address}</a>
          <span class="listing-card__meta">${formatMoney(listing.price)} · ${Math.round(listing.land_size_m2).toLocaleString()} m²
            · ${listing.lots_possible} lots of ~${Math.round(listing.resulting_lot_m2)} m²${listing.zone ? ` · ${listing.zone}` : ""}</span>
        </div>
        <div class="listing-card__profit">
          <span class="profit-positive">+${formatMoney(listing.profit)}</span>
          <span class="confidence-badge confidence-${confidenceLabel(listing.confidence).toLowerCase()}">${confidenceLabel(listing.confidence)}</span>
        </div>
      </div>
      <div class="listing-card__detail" hidden></div>
    `;
    const detail = card.querySelector(".listing-card__detail");
    const summary = card.querySelector(".listing-card__summary");
    summary.addEventListener("click", () => {
      const isOpen = !detail.hidden;
      if (isOpen) {
        detail.hidden = true;
      } else {
        detail.innerHTML = renderListingDetail(listing, params);
        detail.hidden = false;
      }
    });
    body.appendChild(card);
  });

  overlay.hidden = false;
}

function closeSubdivisionModal() {
  document.getElementById("subdivision-modal").hidden = true;
}

function buildSubdivisionFilterControls(listings, refresh) {
  const container = document.getElementById("subdivision-filters");

  const multiSelectRefreshers = [];
  const rangeResetters = [];

  SUBDIVISION_MULTI_FIELDS.forEach(({ field, label }) => {
    const options = distinctValues(listings, field);
    const { wrapper, refresh: refreshSelect } = createMultiSelect(
      field, label, options, subdivisionFilterState.multi[field], refresh
    );
    multiSelectRefreshers.push(refreshSelect);
    container.appendChild(wrapper);
  });

  SUBDIVISION_RANGE_FIELDS.forEach(({ field, label }) => {
    const { wrapper, reset } = createRangeFilter(label, (min, max) => {
      subdivisionFilterState.range[field] = { min, max };
      refresh();
    });
    rangeResetters.push(reset);
    container.appendChild(wrapper);
  });

  document.getElementById("subdivision-clear-filters").addEventListener("click", () => {
    SUBDIVISION_MULTI_FIELDS.forEach(({ field }) => subdivisionFilterState.multi[field].clear());
    SUBDIVISION_RANGE_FIELDS.forEach(({ field }) => (subdivisionFilterState.range[field] = { min: null, max: null }));
    multiSelectRefreshers.forEach((r) => r());
    rangeResetters.forEach((r) => r());
    refresh();
  });
}

function buildSubdivisionParamControls(defaults, refresh) {
  const container = document.getElementById("subdivision-params");

  const costInput = document.createElement("input");
  costInput.type = "number";
  costInput.className = "paramfilter__input";
  costInput.value = defaults.default_cost_per_lot ?? 40000;
  subdivisionParams.costPerLot = Number(costInput.value) || 0;

  const stampInput = document.createElement("input");
  stampInput.type = "number";
  stampInput.step = "0.1";
  stampInput.className = "paramfilter__input";
  stampInput.value = defaults.default_stamp_duty_buffer_pct ?? 5.5;
  subdivisionParams.stampDutyBufferPct = Number(stampInput.value) || 0;

  const recompute = debounce(() => {
    subdivisionParams.costPerLot = Number(costInput.value) || 0;
    subdivisionParams.stampDutyBufferPct = Number(stampInput.value) || 0;
    refresh();
  }, 200);
  costInput.addEventListener("input", recompute);
  stampInput.addEventListener("input", recompute);

  const costLabel = document.createElement("label");
  costLabel.className = "paramfilter";
  costLabel.textContent = "Cost per lot ($)";
  costLabel.appendChild(costInput);

  const stampLabel = document.createElement("label");
  stampLabel.className = "paramfilter";
  stampLabel.textContent = "Stamp duty buffer (%)";
  stampLabel.appendChild(stampInput);

  container.appendChild(costLabel);
  container.appendChild(stampLabel);
}

function buildSubdivisionTab(payload) {
  const sub = payload.subdivision;
  const listings = sub.listings;

  const table = new Tabulator("#subdivision-table", {
    data: buildSuburbGroups(listings, subdivisionParams),
    columns: buildSuburbColumns(),
    layout: "fitDataFill",
    height: "calc(100vh - 280px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    initialSort: [{ column: "index", dir: "desc" }],
    placeholder: "No profitable subdivision opportunities match these filters",
  });

  const refresh = () => {
    table.setData(buildSuburbGroups(listings, subdivisionParams));
  };

  table.on("tableBuilt", () => {
    buildSubdivisionFilterControls(listings, refresh);
    buildSubdivisionParamControls(sub, refresh);
  });
  table.on("rowClick", (e, row) => openSuburbModal(row.getData(), subdivisionParams));
  table.on("dataFiltered", () => updateRowCount(table, "subdivision-row-count", "suburbs"));
  table.on("renderComplete", () => updateRowCount(table, "subdivision-row-count", "suburbs"));

  document.getElementById("subdivision-modal-close").addEventListener("click", closeSubdivisionModal);
  document.getElementById("subdivision-modal").addEventListener("click", (e) => {
    if (e.target.id === "subdivision-modal") closeSubdivisionModal();
  });

  return table;
}

function setupTabs(subdivisionTable) {
  // The Subdivision table is built while its panel is still display:none (only
  // the Data Table tab starts visible), so Tabulator measures a zero-width
  // container at build time — redraw once the panel is actually shown so it
  // sizes itself correctly.
  let subdivisionRedrawn = false;

  document.querySelectorAll(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("is-active");

      if (btn.dataset.tab === "subdivision" && !subdivisionRedrawn) {
        subdivisionRedrawn = true;
        subdivisionTable.redraw(true);
      }
    });
  });
}

async function fetchJsonGz(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser doesn't support DecompressionStream (needed to read the gzipped data file) — try a recent Chrome, Edge, Firefox, or Safari.");
  }
  const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(decompressed).text();
  return JSON.parse(text);
}

async function main() {
  const payload = await fetchJsonGz("data/properties.json.gz");

  document.getElementById("site-title").textContent = payload.title;
  const generatedText = payload.data_generated_at
    ? `Data last generated: ${payload.data_generated_at}`
    : "Data last generated: unknown";
  document.getElementById("site-meta").textContent =
    `${payload.rows.length.toLocaleString()} properties · ${generatedText}`;

  const table = new Tabulator("#property-table", {
    data: payload.rows,
    columns: buildColumns(payload.columns),
    layout: "fitDataFill",
    height: "calc(100vh - 220px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    placeholder: "No matching properties",
  });

  table.on("tableBuilt", () => {
    buildFilterControls(payload.rows, table);
  });
  table.on("dataFiltered", () => updateRowCount(table, "row-count", "properties"));
  table.on("renderComplete", () => updateRowCount(table, "row-count", "properties"));

  const searchBox = document.getElementById("search-box");
  searchBox.addEventListener(
    "input",
    debounce(() => {
      filterState.search = searchBox.value.trim().toLowerCase();
      table.setFilter(rowMatchesFilters);
    }, 200)
  );

  document.getElementById("download-csv").addEventListener("click", () => {
    table.download("csv", "properties.csv");
  });

  document.getElementById("download-xlsx").addEventListener("click", () => {
    table.download("xlsx", "properties.xlsx", { sheetName: "Properties" });
  });

  const subdivisionTable = buildSubdivisionTab(payload);
  setupTabs(subdivisionTable);
}

main().catch((err) => {
  console.error(err);
  document.getElementById("site-meta").textContent =
    "Failed to load property data — see console for details.";
});
