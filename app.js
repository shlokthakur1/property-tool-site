// Multi-select checkbox filters (with an in-panel search box for high-cardinality fields).
const MULTI_FIELDS = [
  { field: "status", label: "Status" },
  { field: "state", label: "State" },
  { field: "property_type", label: "Type" },
  { field: "suburb", label: "Suburb" },
  { field: "postcode", label: "Postcode" },
  { field: "zone", label: "Zone" },
  { field: "data_confidence", label: "Data Confidence" },
];

// Min/max range filters.
const RANGE_FIELDS = [
  { field: "price", label: "Price" },
  { field: "land_size_m2", label: "Land (m²)" },
  { field: "irsad_aus_decile", label: "IRSAD Decile" },
  { field: "population_change_pct_5yr", label: "Pop. Growth (5yr)" },
  { field: "building_approvals_per_1000_pop", label: "Approvals /1000 Pop." },
  { field: "months_of_supply", label: "Months of Supply" },
  { field: "distance_to_gpo_km", label: "Distance to GPO (km)" },
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

function buildColumnDef(col) {
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
      col.field === "min_frontage_m" ||
      col.field === "irsad_aus_decile" ||
      col.field === "new_dwelling_approvals_fy" ||
      col.field === "building_approvals_per_1000_pop" ||
      col.field === "stock_on_market" ||
      col.field === "months_of_supply" ||
      col.field === "distance_to_gpo_km"
    ) {
      return { ...base, sorter: "number" };
    }
    if (col.field === "non_res_building_approvals_value_fy" || col.field === "infrastructure_spend_per_capita") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `$${Math.round(value).toLocaleString()}`;
        },
      };
    }
    if (col.field === "census_2021_population" || col.field === "population_2025") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : Math.round(value).toLocaleString();
        },
      };
    }
    if (col.field === "population_change_pct_5yr" || col.field === "population_change_pct_1yr") {
      return {
        ...base,
        sorter: "number",
        formatter: (cell) => {
          const value = cell.getValue();
          if (value == null) return "";
          const sign = value > 0 ? "+" : "";
          return `${sign}${value.toFixed(1)}%`;
        },
      };
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
}

// Wraps each column in a Tabulator column GROUP (a spanning parent header)
// keyed by its `group` from config.yaml, in first-seen order — so the same
// grouping shown in the column visibility panel (createColumnPanel) is also
// visible as the table's own header structure. Hiding/showing individual
// fields (table.showColumn/hideColumn) still works normally on grouped
// columns; a group's header just spans however many of its children are
// currently visible.
function buildGroupedColumns(columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    const groupName = col.group || "Other";
    if (!byName.has(groupName)) {
      const groupDef = { title: groupName, columns: [] };
      byName.set(groupName, groupDef);
      groups.push(groupDef);
    }
    byName.get(groupName).columns.push(buildColumnDef(col));
  });
  return groups;
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
  document.querySelectorAll(".multiselect__panel.is-open, .strategies-dropdown__panel.is-open").forEach((panel) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// hTag-style nested filter builder — a recursive AND/OR condition tree, used
// by the Suburb Finder tab (see references/... image for the UI this is
// modeled on: field / condition / value per row, a group-level AND/OR toggle
// on the left, "›" nests a row into a sub-group with the row above it, "×"
// removes it). Deliberately generic (driven entirely by a `fieldCatalog` of
// {field, label, type, options?}), so it isn't tied to one tab's column set.
//
// Tree shape: { kind: "group", combinator: "AND"|"OR", children: [...] }
// where each child is either another group or { kind: "rule", field,
// operator, value, value2 }. An empty group matches everything (vacuous AND
// = true), which is what "no filter yet" should do.
// ─────────────────────────────────────────────────────────────────────────────
let qbIdCounter = 0;
function qbNextId() {
  qbIdCounter += 1;
  return `qb-${qbIdCounter}`;
}

const QB_OPERATORS = {
  number: [
    { op: "eq", label: "Equals" },
    { op: "neq", label: "Not equals" },
    { op: "gt", label: "Greater than" },
    { op: "gte", label: "Greater than or equal" },
    { op: "lt", label: "Less than" },
    { op: "lte", label: "Less than or equal" },
    { op: "between", label: "Between" },
    { op: "empty", label: "Is empty" },
    { op: "notempty", label: "Is not empty" },
  ],
  categorical: [
    { op: "eq", label: "Equals" },
    { op: "neq", label: "Not equals" },
    { op: "in", label: "Is any of" },
    { op: "contains", label: "Contains" },
    { op: "empty", label: "Is empty" },
    { op: "notempty", label: "Is not empty" },
  ],
  text: [
    { op: "contains", label: "Contains" },
    { op: "eq", label: "Equals" },
    { op: "neq", label: "Not equals" },
    { op: "empty", label: "Is empty" },
    { op: "notempty", label: "Is not empty" },
  ],
};

function qbDefaultOperator(type) {
  return QB_OPERATORS[type][0].op;
}

function qbNewGroup(combinator, children) {
  return { id: qbNextId(), kind: "group", combinator: combinator || "AND", children: children || [] };
}

function qbNewRule(fieldCatalog) {
  const field = fieldCatalog[0];
  return { id: qbNextId(), kind: "rule", field: field.field, operator: qbDefaultOperator(field.type), value: null, value2: null };
}

function qbCoerceNumber(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function qbRuleMatches(row, rule, fieldMap) {
  const meta = fieldMap.get(rule.field);
  if (!meta) return true; // unknown field (e.g. a stale loaded strategy) — ignore rather than exclude every row
  const raw = row[rule.field];
  const isEmpty = raw === null || raw === undefined || raw === "";

  if (rule.operator === "empty") return isEmpty;
  if (rule.operator === "notempty") return !isEmpty;
  if (isEmpty) return false; // every other operator needs a real value to compare against

  if (meta.type === "number") {
    const value = Number(raw);
    if (rule.operator === "between") {
      const a = qbCoerceNumber(rule.value);
      const b = qbCoerceNumber(rule.value2);
      if (a != null && value < a) return false;
      if (b != null && value > b) return false;
      return true;
    }
    const a = qbCoerceNumber(rule.value);
    if (a == null) return true; // no comparison value entered yet
    switch (rule.operator) {
      case "eq": return value === a;
      case "neq": return value !== a;
      case "gt": return value > a;
      case "gte": return value >= a;
      case "lt": return value < a;
      case "lte": return value <= a;
      default: return true;
    }
  }

  const strValue = String(raw);
  if (rule.operator === "in") {
    const set = Array.isArray(rule.value) ? rule.value : [];
    return set.length === 0 || set.includes(strValue);
  }
  const cmp = rule.value == null ? "" : String(rule.value);
  if (cmp === "") return true; // no comparison value entered yet
  switch (rule.operator) {
    case "eq": return strValue.toLowerCase() === cmp.toLowerCase();
    case "neq": return strValue.toLowerCase() !== cmp.toLowerCase();
    case "contains": return strValue.toLowerCase().includes(cmp.toLowerCase());
    default: return true;
  }
}

function qbGroupMatches(row, group, fieldMap) {
  if (!group.children.length) return true;
  const results = group.children.map((child) =>
    child.kind === "group" ? qbGroupMatches(row, child, fieldMap) : qbRuleMatches(row, child, fieldMap)
  );
  return group.combinator === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function qbFormatValue(rule, meta) {
  if (meta?.type === "number") {
    return rule.operator === "between" ? `${rule.value ?? "…"}–${rule.value2 ?? "…"}` : (rule.value ?? "…");
  }
  if (rule.operator === "in") {
    return Array.isArray(rule.value) && rule.value.length ? rule.value.join("/") : "…";
  }
  return rule.value || "…";
}

function qbDescribeRule(rule, fieldMap) {
  const meta = fieldMap.get(rule.field);
  const label = meta ? meta.label : rule.field;
  const opDef = (QB_OPERATORS[meta?.type ?? "text"].find((o) => o.op === rule.operator)) || { label: rule.operator };
  if (rule.operator === "empty" || rule.operator === "notempty") return `${label} ${opDef.label.toLowerCase()}`;
  return `${label} ${opDef.label.toLowerCase()} ${qbFormatValue(rule, meta)}`;
}

function qbDescribeGroup(group, fieldMap) {
  if (!group.children.length) return "";
  const parts = group.children.map((child) =>
    child.kind === "group" ? `(${qbDescribeGroup(child, fieldMap)})` : qbDescribeRule(child, fieldMap)
  );
  return parts.join(` ${group.combinator} `);
}

function qbGenerateStrategyName(group, fieldMap) {
  const desc = qbDescribeGroup(group, fieldMap);
  if (!desc) return "Untitled strategy";
  return desc.length > 80 ? `${desc.slice(0, 77)}...` : desc;
}

function qbRemoveChild(group, index) {
  group.children.splice(index, 1);
}

// Nests the row at `index` together with the row above it into a new AND
// sub-group (or, if the row above is already a group, just joins it) — the
// "move right" behaviour from the reference image.
function qbMoveRight(group, index) {
  if (index === 0) return;
  const [moved] = group.children.splice(index, 1);
  const prev = group.children[index - 1];
  if (prev.kind === "group") {
    prev.children.push(moved);
  } else {
    group.children[index - 1] = qbNewGroup("AND", [prev, moved]);
  }
}

// After a structural edit, collapse pointless nesting: a group left with no
// children disappears, a group left with exactly one child is replaced by
// that child directly. Never removes/replaces the passed-in `group` object
// itself (only mutates its `.children`), so this is safe to call on the root.
function qbFlatten(group) {
  group.children = group.children.filter((child) => {
    if (child.kind !== "group") return true;
    qbFlatten(child);
    return child.children.length > 0;
  });
  group.children = group.children.map((child) =>
    (child.kind === "group" && child.children.length === 1) ? child.children[0] : child
  );
}

// Drops rules referencing fields not in `fieldMap` (loading a strategy saved
// against a different column set), then relies on the caller running
// qbFlatten to collapse whatever that leaves empty. Returns how many rules
// were dropped.
function qbPruneToFields(group, fieldMap) {
  let dropped = 0;
  group.children = group.children.filter((child) => {
    if (child.kind === "group") {
      dropped += qbPruneToFields(child, fieldMap);
      return true;
    }
    const keep = fieldMap.has(child.field);
    if (!keep) dropped += 1;
    return keep;
  });
  return dropped;
}

function qbRenderValueControl(rule, meta, onChange) {
  const wrap = document.createElement("span");
  wrap.className = "qb-value";

  if (meta.type === "number") {
    const makeInput = (val, placeholder, onInput) => {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "qb-value-input";
      input.value = val ?? "";
      input.placeholder = placeholder;
      input.addEventListener("input", debounce(onInput, 250));
      return input;
    };
    wrap.appendChild(makeInput(rule.value, rule.operator === "between" ? "Min" : "Value", (e) => {
      rule.value = e.target.value;
      onChange(false);
    }));
    if (rule.operator === "between") {
      wrap.appendChild(makeInput(rule.value2, "Max", (e) => {
        rule.value2 = e.target.value;
        onChange(false);
      }));
    }
    return wrap;
  }

  if (meta.type === "categorical" && rule.operator === "in") {
    if (!Array.isArray(rule.value)) rule.value = [];
    const selectedSet = new Set(rule.value);
    const { wrapper } = createMultiSelect(rule.field, "Select values", meta.options || [], selectedSet, () => {
      rule.value = Array.from(selectedSet);
      onChange(false);
    });
    wrap.appendChild(wrapper);
    return wrap;
  }

  if (meta.type === "categorical" && meta.options && meta.options.length) {
    const select = document.createElement("select");
    select.className = "qb-select qb-select-value";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select…";
    select.appendChild(blank);
    meta.options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (rule.value === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", () => {
      rule.value = select.value;
      onChange(false);
    });
    wrap.appendChild(select);
    return wrap;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "qb-value-input qb-value-input--text";
  input.value = rule.value ?? "";
  input.placeholder = "Value";
  input.addEventListener("input", debounce(() => {
    rule.value = input.value;
    onChange(false);
  }, 250));
  wrap.appendChild(input);
  return wrap;
}

function qbRenderRule(rule, fieldCatalog, fieldMap, onChange) {
  const el = document.createElement("div");
  el.className = "qb-rule";

  const fieldSelect = document.createElement("select");
  fieldSelect.className = "qb-select";
  fieldCatalog.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.field;
    opt.textContent = f.label;
    if (f.field === rule.field) opt.selected = true;
    fieldSelect.appendChild(opt);
  });
  fieldSelect.addEventListener("change", () => {
    rule.field = fieldSelect.value;
    const meta = fieldMap.get(rule.field);
    rule.operator = qbDefaultOperator(meta.type);
    rule.value = null;
    rule.value2 = null;
    onChange();
  });
  el.appendChild(fieldSelect);

  const meta = fieldMap.get(rule.field) || { type: "text" };
  const opSelect = document.createElement("select");
  opSelect.className = "qb-select";
  QB_OPERATORS[meta.type].forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.op;
    opt.textContent = o.label;
    if (o.op === rule.operator) opt.selected = true;
    opSelect.appendChild(opt);
  });
  opSelect.addEventListener("change", () => {
    rule.operator = opSelect.value;
    rule.value = null;
    rule.value2 = null;
    onChange();
  });
  el.appendChild(opSelect);

  if (rule.operator !== "empty" && rule.operator !== "notempty") {
    el.appendChild(qbRenderValueControl(rule, meta, onChange));
  }

  return el;
}

function qbRenderGroup(group, fieldCatalog, fieldMap, onChange, depth) {
  const el = document.createElement("div");
  el.className = depth > 0 ? "qb-group qb-group--nested" : "qb-group";

  const body = document.createElement("div");
  body.className = "qb-group-body";

  if (group.children.length >= 2) {
    const combinatorBtn = document.createElement("button");
    combinatorBtn.type = "button";
    combinatorBtn.className = "qb-combinator";
    combinatorBtn.textContent = group.combinator;
    combinatorBtn.title = "Click to switch AND/OR for this group";
    combinatorBtn.addEventListener("click", () => {
      group.combinator = group.combinator === "AND" ? "OR" : "AND";
      onChange();
    });
    body.appendChild(combinatorBtn);
  }

  const rows = document.createElement("div");
  rows.className = "qb-rows";
  group.children.forEach((child, index) => {
    const rowWrap = document.createElement("div");
    rowWrap.className = "qb-row-wrap";
    rowWrap.appendChild(
      child.kind === "group"
        ? qbRenderGroup(child, fieldCatalog, fieldMap, onChange, depth + 1)
        : qbRenderRule(child, fieldCatalog, fieldMap, onChange)
    );

    const actions = document.createElement("div");
    actions.className = "qb-row-actions";

    const rightBtn = document.createElement("button");
    rightBtn.type = "button";
    rightBtn.className = "btn btn--ghost qb-btn-icon";
    rightBtn.textContent = "›";
    rightBtn.title = "Nest with the row above";
    rightBtn.disabled = index === 0;
    rightBtn.addEventListener("click", () => {
      qbMoveRight(group, index);
      qbFlatten(group);
      onChange();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost qb-btn-icon";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", () => {
      qbRemoveChild(group, index);
      qbFlatten(group);
      onChange();
    });

    actions.appendChild(rightBtn);
    actions.appendChild(removeBtn);
    rowWrap.appendChild(actions);
    rows.appendChild(rowWrap);
  });
  body.appendChild(rows);
  el.appendChild(body);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--ghost qb-add";
  addBtn.textContent = "+ Add Condition";
  addBtn.addEventListener("click", () => {
    group.children.push(qbNewRule(fieldCatalog));
    onChange();
  });
  el.appendChild(addBtn);

  return el;
}

function createQueryBuilder(container, fieldCatalog, options) {
  const fieldMap = new Map(fieldCatalog.map((f) => [f.field, f]));
  let root = qbNewGroup("AND", []);

  function render() {
    container.innerHTML = "";
    container.appendChild(qbRenderGroup(root, fieldCatalog, fieldMap, handleChange, 0));
  }

  function handleChange(rerender) {
    if (rerender !== false) render();
    options.onFilterChange();
  }

  render();

  return {
    getGroup: () => root,
    setGroup: (newGroup) => {
      root = newGroup;
      render();
      options.onFilterChange();
    },
    clear: () => {
      root = qbNewGroup("AND", []);
      render();
      options.onFilterChange();
    },
    matches: (row) => qbGroupMatches(row, root, fieldMap),
    fieldMap,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved Strategies — named filter trees persisted in localStorage (this is a
// static site with no backend), shared across any tab that wires up a query
// builder. Loading one into a tab whose field catalog doesn't have all of a
// strategy's fields drops just those conditions (see qbPruneToFields) rather
// than failing to load at all.
// ─────────────────────────────────────────────────────────────────────────────
const QB_STRATEGY_STORAGE_KEY = "propertyTool.savedStrategies.v1";

function qbLoadStrategies() {
  try {
    const raw = localStorage.getItem(QB_STRATEGY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read saved strategies", err);
    return [];
  }
}

function qbSaveStrategies(list) {
  try {
    localStorage.setItem(QB_STRATEGY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Failed to save strategies", err);
  }
}

function wireSaveStrategyButton(button, qb) {
  button.addEventListener("click", () => {
    const group = qb.getGroup();
    if (!group.children.length) {
      alert("Add at least one condition before saving a Strategy.");
      return;
    }
    const suggested = qbGenerateStrategyName(group, qb.fieldMap);
    const name = prompt("Save this filter as a Strategy — name:", suggested);
    if (!name) return;
    const strategies = qbLoadStrategies();
    strategies.push({
      id: `strategy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name,
      createdAt: new Date().toISOString(),
      filterGroup: JSON.parse(JSON.stringify(group)),
    });
    qbSaveStrategies(strategies);
  });
}

function createStrategiesPanel(container, qb) {
  const wrapper = document.createElement("div");
  wrapper.className = "strategies-dropdown";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn--secondary strategies-dropdown__toggle";
  toggle.textContent = "Load Strategy";
  wrapper.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "strategies-dropdown__panel";

  function renderList() {
    const strategies = qbLoadStrategies();
    panel.innerHTML = "";
    if (!strategies.length) {
      const empty = document.createElement("p");
      empty.className = "strategies-dropdown__empty";
      empty.textContent = "No saved strategies yet.";
      panel.appendChild(empty);
      return;
    }
    strategies.forEach((s) => {
      const item = document.createElement("div");
      item.className = "strategy-item";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "strategy-item__name";
      nameBtn.textContent = s.name;
      nameBtn.title = `Saved ${new Date(s.createdAt).toLocaleString()}`;
      nameBtn.addEventListener("click", () => {
        const clone = JSON.parse(JSON.stringify(s.filterGroup));
        const dropped = qbPruneToFields(clone, qb.fieldMap);
        qbFlatten(clone);
        qb.setGroup(clone);
        panel.classList.remove("is-open");
        if (dropped > 0) {
          alert(`Loaded "${s.name}" — ${dropped} condition(s) skipped (field not available in this tab).`);
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "strategy-item__delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete this strategy";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        qbSaveStrategies(qbLoadStrategies().filter((x) => x.id !== s.id));
        renderList();
      });

      item.appendChild(nameBtn);
      item.appendChild(deleteBtn);
      panel.appendChild(item);
    });
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains("is-open");
    closeAllPanels();
    if (!isOpen) {
      renderList();
      panel.classList.add("is-open");
    }
  });
  panel.addEventListener("click", (e) => e.stopPropagation());

  wrapper.appendChild(panel);
  container.appendChild(wrapper);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suburb Finder tab — one row per (suburb, state), from payload.suburbs (see
// build_suburb_stats in build_site.py). Filtering runs the hTag-style query
// builder above directly against these already-aggregated rows — unlike
// Subdivision, there's no live-adjustable re-aggregation, so a plain
// table.setFilter is enough.
// ─────────────────────────────────────────────────────────────────────────────
const SUBURB_CATEGORICAL_FIELDS = new Set([
  "suburb", "state", "postcode", "zone", "data_confidence", "growth_rate_cycle_house", "growth_rate_cycle_unit",
]);
const SUBURB_MONEY_FIELDS = new Set([
  "non_res_building_approvals_value_fy", "infrastructure_spend_per_capita",
  "median_price_house", "median_price_unit",
]);
const SUBURB_MONEY_PER_M2_FIELDS = new Set(["median_price_per_m2_house", "median_price_per_m2_unit"]);
const SUBURB_MONEY_PER_WEEK_FIELDS = new Set(["median_rent_weekly_house", "median_rent_weekly_unit"]);
const SUBURB_KM_FIELDS = new Set(["distance_to_gpo_km"]);
const SUBURB_PERCENT_SIGNED_FIELDS = new Set([
  "sale_through_rate_pct", "population_change_pct_1yr", "population_change_pct_5yr",
  "price_spread_pct_house", "price_spread_pct_unit",
  "price_growth_1mo_pct_house", "price_growth_1mo_pct_unit",
  "price_growth_6mo_pct_house", "price_growth_6mo_pct_unit",
  "price_growth_1yr_pct_house", "price_growth_1yr_pct_unit",
  "price_growth_2yr_pct_house", "price_growth_2yr_pct_unit",
  "gross_rental_yield_pct_house", "gross_rental_yield_pct_unit",
]);
const SUBURB_INT_FIELDS = new Set([
  "listing_count", "for_sale_count", "sold_recent_count", "subdivision_candidate_count",
  "population_2025", "new_dwelling_approvals_fy", "median_min_lot_size_m2",
  "median_land_size_m2_house", "median_land_size_m2_unit",
  "rentals_count_house", "rentals_count_unit", "sold_recent_count_house", "sold_recent_count_unit",
  "volatility_index_house", "volatility_index_unit",
]);

function buildSuburbFieldCatalog(columnsCfg, rows) {
  return columnsCfg.map((col) => {
    const type = SUBURB_CATEGORICAL_FIELDS.has(col.field) ? "categorical" : "number";
    const entry = { field: col.field, label: col.title, type };
    if (type === "categorical") entry.options = distinctValues(rows, col.field);
    return entry;
  });
}

function formatPercentSigned(value) {
  if (value == null) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function buildSuburbColumnDef(col) {
    const base = { field: col.field, title: col.title, headerFilter: false };
    if (SUBURB_MONEY_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}`;
      } };
    }
    if (SUBURB_MONEY_PER_M2_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}/m²`;
      } };
    }
    if (SUBURB_MONEY_PER_WEEK_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}/wk`;
      } };
    }
    if (SUBURB_KM_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(1)} km`;
      } };
    }
    if (SUBURB_PERCENT_SIGNED_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => formatPercentSigned(cell.getValue()) };
    }
    if (SUBURB_INT_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : Math.round(v).toLocaleString();
      } };
    }
    if (col.field === "state") return { ...base, width: 80 };
    return { ...base, sorter: "number" };
}

// Same grouped-header wrapping as buildGroupedColumns (Data Table) — one
// spanning parent header per `group` in config.yaml, in first-seen order.
function buildGroupedSuburbColumns(columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    const groupName = col.group || "Other";
    if (!byName.has(groupName)) {
      const groupDef = { title: groupName, columns: [] };
      byName.set(groupName, groupDef);
      groups.push(groupDef);
    }
    byName.get(groupName).columns.push(buildSuburbColumnDef(col));
  });
  return groups;
}

function buildSuburbFinderTab(payload) {
  const suburbs = payload.suburbs;
  if (!suburbs) return null;

  const table = new Tabulator("#suburb-table", {
    data: suburbs.rows,
    columns: buildGroupedSuburbColumns(suburbs.columns),
    layout: "fitDataFill",
    height: "calc(100vh - 320px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    initialSort: [{ column: "median_price", dir: "desc" }],
    placeholder: "No suburbs match these filters",
  });

  const fieldCatalog = buildSuburbFieldCatalog(suburbs.columns, suburbs.rows);
  const qb = createQueryBuilder(document.getElementById("suburbfinder-querybuilder"), fieldCatalog, {
    onFilterChange: () => table.setFilter((row) => qb.matches(row)),
  });

  createStrategiesPanel(document.getElementById("suburbfinder-strategies"), qb);
  wireSaveStrategyButton(document.getElementById("suburbfinder-save-strategy"), qb);
  document.getElementById("suburbfinder-clear-filters").addEventListener("click", () => qb.clear());

  table.on("tableBuilt", () => {
    createColumnPanel(table, suburbs.columns, {
      panel: "suburbfinder-column-panel", groups: "suburbfinder-column-panel-groups",
      toggle: "suburbfinder-column-panel-toggle", close: "suburbfinder-column-panel-close",
      selectAll: "suburbfinder-column-panel-all", selectNone: "suburbfinder-column-panel-none",
      storageKey: "suburbfinder-hidden-columns",
    });
  });
  table.on("dataFiltered", () => updateRowCount(table, "suburbfinder-row-count", "suburbs"));
  table.on("renderComplete", () => updateRowCount(table, "suburbfinder-row-count", "suburbs"));

  return table;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Definitions tab — one row per Data Table column (payload.columns) plus
// one per Suburb Finder column (payload.suburbs.columns), both sourced
// directly from config.yaml (site.columns / site.suburb_columns — see
// build_site.py select_rows / build_suburb_stats) so this never drifts out of
// sync with what those tabs actually show.
// ─────────────────────────────────────────────────────────────────────────────
function renderDefinitionsTable(columns) {
  const rows = columns.map((col) => `
    <tr>
      <td>${col.title}</td>
      <td>${col.description ?? "—"}</td>
      <td>${col.formula ? `<code>${col.formula}</code>` : "—"}</td>
    </tr>
  `).join("");
  return `
    <table class="comps-table">
      <thead><tr><th>Column</th><th>Description</th><th>Formula</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildDefinitionsTab(payload) {
  const container = document.getElementById("definitions-list");
  let html = `<h3 class="definitions-heading">Data Table</h3>${renderDefinitionsTable(payload.columns)}`;
  if (payload.suburbs) {
    html += `<h3 class="definitions-heading">Suburb Finder</h3>${renderDefinitionsTable(payload.suburbs.columns)}`;
  }
  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column visibility panel (Data Table tab) — a right-hand slide-out panel,
// grouped the same way as the table's own header groups (buildGroupedColumns
// above), both driven by each column's `group` in config.yaml. Reused for
// both Data Table and Suburb Finder (each with its own DOM ids and
// localStorage key, passed in via `ids`) — same panel/grouping mechanics,
// just pointed at a different table and column set. Visibility choices
// persist in localStorage so they survive a reload.
// ─────────────────────────────────────────────────────────────────────────────
function loadHiddenColumns(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenColumns(hidden, storageKey) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...hidden]));
  } catch {
    // localStorage unavailable (private browsing, full quota) — visibility choices just won't persist
  }
}

function createColumnPanel(table, columnsCfg, ids) {
  const panel = document.getElementById(ids.panel);
  const groupsContainer = document.getElementById(ids.groups);
  const toggleBtn = document.getElementById(ids.toggle);
  const closeBtn = document.getElementById(ids.close);
  const selectAllBtn = document.getElementById(ids.selectAll);
  const selectNoneBtn = document.getElementById(ids.selectNone);
  if (!panel || !groupsContainer || !toggleBtn) return;

  const hidden = loadHiddenColumns(ids.storageKey);

  const groups = new Map();
  columnsCfg.forEach((col) => {
    const groupName = col.group || "Other";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(col);
  });

  groupsContainer.innerHTML = "";
  const checkboxes = [];
  groups.forEach((cols, groupName) => {
    const details = document.createElement("details");
    details.className = "column-panel__group";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = groupName;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "column-panel__list";
    cols.forEach((col) => {
      const label = document.createElement("label");
      label.className = "column-panel__item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !hidden.has(col.field);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          table.showColumn(col.field);
          hidden.delete(col.field);
        } else {
          table.hideColumn(col.field);
          hidden.add(col.field);
        }
        saveHiddenColumns(hidden, ids.storageKey);
      });
      checkboxes.push(checkbox);

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(col.title));
      list.appendChild(label);
    });

    details.appendChild(list);
    groupsContainer.appendChild(details);
  });

  // Apply whatever was hidden on a previous visit before the user opens the panel.
  hidden.forEach((field) => {
    if (table.getColumn(field)) table.hideColumn(field);
  });

  const openPanel = () => { panel.hidden = false; };
  const closePanel = () => { panel.hidden = true; };
  toggleBtn.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  closeBtn?.addEventListener("click", closePanel);

  const setAll = (checked) => {
    checkboxes.forEach((cb) => {
      if (cb.checked !== checked) {
        cb.checked = checked;
        cb.dispatchEvent(new Event("change"));
      }
    });
  };
  selectAllBtn?.addEventListener("click", () => setAll(true));
  selectNoneBtn?.addEventListener("click", () => setAll(false));
}

function setupTabs(tableByTab) {
  // Tables built while their panel is still display:none get measured
  // against a zero-width container by Tabulator — redraw once a panel is
  // actually shown so it sizes correctly. Whichever tab starts active (see
  // the `is-active` class in index.html) already rendered against a real
  // width, so it's seeded into `redrawn` up front; every other tab needs a
  // redraw the first time it's actually shown. Determined from the DOM
  // rather than hardcoded, so this doesn't silently break again if the
  // default tab changes.
  const redrawn = new Set(
    Object.keys(tableByTab).filter(
      (name) => document.getElementById(`tab-${name}`)?.classList.contains("is-active")
    )
  );

  document.querySelectorAll(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("is-active");

      const table = tableByTab[btn.dataset.tab];
      if (table && !redrawn.has(btn.dataset.tab)) {
        redrawn.add(btn.dataset.tab);
        table.redraw(true);
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
    columns: buildGroupedColumns(payload.columns),
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
    createColumnPanel(table, payload.columns, {
      panel: "column-panel", groups: "column-panel-groups", toggle: "column-panel-toggle",
      close: "column-panel-close", selectAll: "column-panel-all", selectNone: "column-panel-none",
      storageKey: "datatable-hidden-columns",
    });
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
  const suburbFinderTable = buildSuburbFinderTab(payload);
  buildDefinitionsTab(payload);
  setupTabs({ datatable: table, subdivision: subdivisionTable, suburbfinder: suburbFinderTable });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("site-meta").textContent =
    "Failed to load property data — see console for details.";
});
