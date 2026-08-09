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

function formatArea(suburb, state, postcode) {
  const label = [suburb, state].filter(Boolean).join(", ");
  return postcode ? `${label} ${postcode}` : label;
}

// Collapses suburb/state/postcode into a single "Area" column wherever a
// table's own columnsCfg has all three — same underlying data, just fewer
// columns to scan (per user request). Only affects the visible table +
// column panel + Compare; Data Definitions still documents suburb/state/
// postcode individually since they're genuinely separate fields, and
// query-builder filtering still targets them individually too (filtering
// "State = NSW" is more precise than a substring match on a combined
// "Area" string) — so callers pass the ORIGINAL columnsCfg to
// buildFieldCatalog-style functions and only the merged one to the table/
// panel/compare builders.
function mergeIdentityColumns(columnsCfg) {
  const identityFields = new Set(["suburb", "state", "postcode"]);
  const suburbIndex = columnsCfg.findIndex((c) => c.field === "suburb");
  if (suburbIndex === -1) return columnsCfg;
  const areaCol = {
    field: "area",
    title: "Area",
    group: columnsCfg[suburbIndex].group,
    description: "Suburb, state and postcode combined into one column.",
  };
  const merged = [];
  let inserted = false;
  columnsCfg.forEach((col) => {
    if (identityFields.has(col.field)) {
      if (!inserted) {
        merged.push(areaCol);
        inserted = true;
      }
      return;
    }
    merged.push(col);
  });
  return merged;
}

// Page-size control — Tabulator's own built-in one already sits bottom-left
// of the table's footer (paginationSizeSelector); this builds a second,
// independent one for the top of the table, kept in sync in both
// directions via Tabulator's pageSizeChanged event.
const PAGE_SIZES = [25, 50, 100, 250, 500];
function createPageSizeSelect(table, initial) {
  const select = document.createElement("select");
  select.className = "pagesize-select";
  PAGE_SIZES.forEach((size) => {
    const opt = document.createElement("option");
    opt.value = String(size);
    opt.textContent = `${size} / page`;
    if (size === initial) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => table.setPageSize(Number(select.value)));
  table.on("pageSizeChanged", (size) => {
    select.value = String(size);
  });
  return select;
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
    if (col.field === "address") {
      // Tabulator refuses `frozen` on a column nested in a column group
      // ("Parent column group must be frozen, not individual columns") — this
      // table's columns are grouped (buildGroupedColumns), so true pinning
      // isn't available here; cssClass alone gives it the identity-column
      // emphasis (bold, no-wrap) without pinning.
      return { ...base, cssClass: "pt-identity" };
    }
    if (col.field === "area") return { ...base, cssClass: "pt-identity", minWidth: 160 };
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
      return { ...base, sorter: "number", hozAlign: "right" };
    }
    if (col.field === "non_res_building_approvals_value_fy" || col.field === "infrastructure_spend_per_capita") {
      return {
        ...base,
        sorter: "number",
        hozAlign: "right",
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
        hozAlign: "right",
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
        hozAlign: "right",
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
        hozAlign: "right",
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
        hozAlign: "right",
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
        hozAlign: "right",
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
        hozAlign: "right",
        formatter: (cell) => {
          const value = cell.getValue();
          if (value == null) return "";
          const sign = value > 0 ? "+" : "";
          const cls = value > 0 ? "pct-above" : value < 0 ? "pct-below" : "";
          return `<span class="${cls}">${sign}${value.toFixed(1)}%</span>`;
        },
      };
    }
    if (col.field === "height_limit_m") {
      return {
        ...base,
        sorter: "number",
        hozAlign: "right",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `${value.toFixed(0)} m`;
        },
      };
    }
    if (col.field === "floor_space_ratio") {
      return {
        ...base,
        sorter: "number",
        hozAlign: "right",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `${value.toFixed(2)}:1`;
        },
      };
    }
    if (
      col.field === "mining_employment_pct" ||
      col.field === "top_industry_1_pct" ||
      col.field === "top_industry_2_pct" ||
      col.field === "top_industry_3_pct" ||
      col.field === "owner_occupied_pct" ||
      col.field === "renter_pct"
    ) {
      return {
        ...base,
        sorter: "number",
        hozAlign: "right",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `${value.toFixed(1)}%`;
        },
      };
    }
    if (col.field === "median_household_income_annual") {
      return {
        ...base,
        sorter: "number",
        hozAlign: "right",
        formatter: (cell) => {
          const value = cell.getValue();
          return value == null ? "" : `$${Math.round(value).toLocaleString()}`;
        },
      };
    }
    if (col.field === "ai_summary") {
      return {
        ...base,
        minWidth: 260,
        formatter: (cell) => {
          const points = cell.getValue();
          if (!points || !points.length) return "";
          const joined = points.join(" • ");
          // Full text via the native title tooltip — this table has no
          // per-row detail view (unlike the Subdivision tab's listing
          // cards), so a truncated cell + hover is the simplest way to
          // surface up to 3 points without a new UI component.
          return `<span class="ai-summary-cell" title="${escapeHtml(joined)}">${escapeHtml(joined)}</span>`;
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
    const isFirstInNewGroup = !byName.has(groupName);
    if (isFirstInNewGroup) {
      const groupDef = { title: groupName, columns: [] };
      byName.set(groupName, groupDef);
      groups.push(groupDef);
    }
    const colDef = buildColumnDef(col);
    // Mark the first column of every group after the first with a hairline
    // divider (see .pt-group-start in style.css) — the "quiet zebra" table
    // treatment uses these instead of a full vertical grid.
    if (isFirstInNewGroup && groups.length > 1) {
      colDef.cssClass = [colDef.cssClass, "pt-group-start"].filter(Boolean).join(" ");
    }
    byName.get(groupName).columns.push(colDef);
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
  document.querySelectorAll(
    ".multiselect__panel.is-open, .strategies-dropdown__panel.is-open"
  ).forEach((panel) => {
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
// time (see build_site.py build_subdivision_listings). Cost/selling/holding
// assumptions are live-adjustable in the Assumptions panel, so profit — and
// therefore which suburbs even qualify — is computed entirely client-side
// and recomputed on every assumption/filter change. Filtering reuses the
// same hTag-style AND/OR query builder + Saved Strategies as Suburb Finder
// (see createQueryBuilder below), just run against individual candidate
// listings rather than pre-aggregated rows, since grouping itself depends
// on the live assumptions.
// ─────────────────────────────────────────────────────────────────────────────
const subdivisionParams = { costPerLot: 0, stampDutyBufferPct: 0, sellingCostsPct: 0, holdingCostsPct: 0 };

function computeProfit(listing, params) {
  const subdivisionCost = params.costPerLot * listing.lots_possible;
  const stampDuty = listing.price * (params.stampDutyBufferPct / 100);
  const holdingCost = listing.price * (params.holdingCostsPct / 100);
  const totalCost = listing.price + subdivisionCost + stampDuty + holdingCost;
  const sellingCost = listing.est_total_revenue * (params.sellingCostsPct / 100);
  return listing.est_total_revenue - sellingCost - totalCost;
}

function confidenceLabel(confidence) {
  if (confidence >= 0.9) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

// Fraction of `sortedValues` at or below `value` — the same rank(pct=True)
// percentile-rank technique build_site.py uses for the suburb Investment
// Score, just computed client-side since this population (suburbs with at
// least one profitable opportunity under the CURRENT live assumptions)
// changes on every filter/assumption change.
function percentileRank(sortedValues, value) {
  if (!sortedValues.length || value == null) return 0;
  let lo = 0, hi = sortedValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedValues.length;
}

// Groups profitable (after live assumptions), filter-matching listings by
// suburb+state. A suburb's headline profit/confidence/best-opportunity
// detail columns are its single best opportunity's own numbers — that's
// the one an investor would actually pursue — with the rest of the
// suburb's opportunities available on drill-in.
//
// Opportunity Score is our own composite ranking (requested as "based on
// number of opportunities, best est. profit & data confidence", no fixed
// weights given) — 50% best profit, 30% opportunity count, 20% data
// confidence. Profit gets the largest weight since it's the actual dollar
// upside; opportunity count is a secondary signal (a suburb with many
// candidates is a richer hunting ground, not reliant on one lucky find);
// confidence tempers both so a huge-but-shaky estimate doesn't outrank a
// smaller, well-evidenced one. Profit and count are unbounded and skewed,
// so both are percentile-ranked against every other qualifying suburb (same
// technique as the suburb Investment Score); confidence is already a
// comparable 0-1 fraction, so it's used directly.
function buildSuburbGroups(listings, params, qb) {
  const bySuburb = new Map();
  for (const listing of listings) {
    if (qb && !qb.matches(listing)) continue;
    const profit = computeProfit(listing, params);
    if (profit <= 0) continue;
    const key = `${listing.suburb}||${listing.state}`;
    const scored = { ...listing, profit };
    if (!bySuburb.has(key)) bySuburb.set(key, []);
    bySuburb.get(key).push(scored);
  }

  const groups = [];
  for (const items of bySuburb.values()) {
    items.sort((a, b) => b.profit - a.profit);
    const best = items[0];
    groups.push({
      suburb: best.suburb,
      state: best.state,
      postcode: best.postcode,
      area: formatArea(best.suburb, best.state, best.postcode),
      opportunityCount: items.length,
      bestProfit: best.profit,
      bestConfidence: best.confidence,
      medianLandPriceForSale: median(items.map((i) => i.price).filter((v) => v != null)),
      typicalLandSizeM2: median(items.map((i) => i.land_size_m2).filter((v) => v != null)),
      // Min Lot Size / Typical Lot Size — the two inputs behind the best
      // opportunity's own lots_possible calc (see calc_min_lot_m2 in
      // build_site.py): min_lot_m2 is whichever of the two actually applied
      // (typical, else zoning, else the flat fallback), typical_lot_m2 is
      // this suburb's own ordinary House lot size WITHIN THE SAME ZONE as
      // the best opportunity (build_site.py's typical_house_lot_size_by_suburb
      // groups by zone specifically, not just suburb — a suburb spanning
      // several zones can have very different typical lot sizes zone to
      // zone). Deliberately the BEST opportunity's own figures, not a
      // median across every candidate in the suburb — this suburb's other
      // candidates can easily sit in a different zone with a genuinely
      // different typical/min lot size, and blending them together would
      // be exactly the kind of misleading average this pipeline avoids
      // elsewhere (2026-08, user-requested: this should read per zone).
      bestMinLotSizeM2: best.min_lot_m2,
      bestTypicalLotSizeM2: best.typical_lot_m2,
      bestLotsPossible: best.lots_possible,
      bestResultingLotM2: best.resulting_lot_m2,
      bestCompCount: best.comp_count,
      bestZone: best.zone,
      // Other council rules — NSW-only for now (see build_site.py), shown
      // for the single best opportunity's own block, same convention as
      // bestZone above.
      bestHeightLimit: best.height_limit_m,
      bestFloorSpaceRatio: best.floor_space_ratio,
      bestHeritageSignificance: best.heritage_significance,
      listings: items,
    });
  }

  const profitValues = groups.map((g) => g.bestProfit).sort((a, b) => a - b);
  const countValues = groups.map((g) => g.opportunityCount).sort((a, b) => a - b);
  groups.forEach((g) => {
    const profitRank = percentileRank(profitValues, g.bestProfit);
    const countRank = percentileRank(countValues, g.opportunityCount);
    g.opportunityScore = Math.round(100 * (0.5 * profitRank + 0.3 * countRank + 0.2 * (g.bestConfidence ?? 0)));
  });

  groups.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return groups;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMoney(value) {
  return value == null ? "—" : `$${Math.round(value).toLocaleString()}`;
}

// Used only for the AI subdivision summary points — free-form generated text
// (unlike the rest of this file's fields, which are short structured values
// from realtyapi/zoning APIs) that could plausibly contain a stray `<` or
// `&` from the source listing copy it was paraphrasing.
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Subdivision table columns — grouped and toggleable like Suburb Finder's
// (see buildGroupedSuburbColumns/createColumnPanel), driven by this same
// {field, title, group, description} shape so it can feed both the column
// panel and the Data Definitions tab. Only these are shown by default (the
// requested set, plus State since a suburb name alone is ambiguous across
// states, and Opportunity Score since it's what the table is actually
// sorted by) — everything else is available via the Columns panel.
// ─────────────────────────────────────────────────────────────────────────────
const SUBDIVISION_COLUMNS = [
  { field: "area", title: "Area", group: "Identity", description: "Suburb, state and postcode combined into one column." },
  { field: "opportunityScore", title: "Opportunity Score", group: "Opportunity",
    description: "Our own 0-100 composite ranking — 50% best est. profit, 30% number of opportunities, 20% data confidence. Profit and opportunity count are percentile-ranked against every other suburb with at least one profitable candidate under the current assumptions; confidence is already a 0-1 fraction so it's used directly. This is the table's default sort key.",
    formula: "round(100 * (0.5 * pctrank(bestProfit) + 0.3 * pctrank(opportunityCount) + 0.2 * bestConfidence))" },
  { field: "opportunityCount", title: "Subdivision Opportunities", group: "Opportunity",
    description: "Number of currently-For-Sale blocks in this suburb that are profitable to subdivide under the current assumptions (see the Assumptions panel) and pass the active filters." },
  { field: "bestProfit", title: "Best Est. Profit", group: "Opportunity",
    description: "Estimated profit of this suburb's single best opportunity — purchase price plus subdivision cost, stamp duty and holding costs, against comp-backed resale revenue less selling costs. See the Assumptions panel for the live cost inputs, and click a suburb row for the full breakdown." },
  { field: "bestConfidence", title: "Data Confidence", group: "Opportunity",
    description: "How many comparable sold vacant-land listings back the best opportunity's resale estimate, 0-1 (shown as a High/Medium/Low badge). Scales linearly between subdivision.min_comparables and subdivision.confidence_comp_target in config.yaml." },
  { field: "medianLandPriceForSale", title: "Median Price (Land For Sale)", group: "Land For Sale Now",
    description: "Median asking price across this suburb's currently-For-Sale subdivision-candidate blocks — not all land listings, only ones big enough to subdivide (see references/subdivision/context.md)." },
  { field: "typicalLandSizeM2", title: "Median Land Size (For Sale)", group: "Land For Sale Now",
    description: "Median land size (m²) across the same set of currently-For-Sale subdivision-candidate blocks." },
  { field: "bestLotsPossible", title: "Best Opportunity — Lots Possible", group: "Best Opportunity Detail",
    description: "Number of new lots the single best opportunity's block can be split into." },
  { field: "bestResultingLotM2", title: "Best Opportunity — Resulting Lot Size", group: "Best Opportunity Detail",
    description: "Size (m²) of each new lot the best opportunity would create." },
  { field: "bestCompCount", title: "Best Opportunity — Comps Used", group: "Best Opportunity Detail",
    description: "Number of comparable sold vacant-land listings behind the best opportunity's resale estimate." },
  { field: "bestZone", title: "Best Opportunity — Zone", group: "Best Opportunity Detail",
    description: "Planning zone of the best opportunity's block, where known." },
  { field: "bestMinLotSizeM2", title: "Best Opportunity — Min Lot Size (Zoning)", group: "Best Opportunity Detail",
    description: "The effective minimum lot size used to work out how many new lots the best opportunity's own block can be split into — whichever of Typical Lot Size (Zone) or that zone's own published minimum applied (see build_site.py's calc_min_lot_m2), falling back further to subdivision.min_lot_size_fallback_m2 in config.yaml where neither is available (never for VIC zone types with no lot-size concept in law at all — see VIC_NO_LOT_SIZE_ZONE_TYPES). Specific to the best opportunity's own zone, not a suburb-wide figure — a suburb spanning several zones can have a genuinely different minimum zone to zone." },
  { field: "bestTypicalLotSizeM2", title: "Best Opportunity — Typical Lot Size (Zone)", group: "Best Opportunity Detail",
    description: "The ordinary/typical House lot size (median, at least subdivision.min_comparables House listings required) for the SAME suburb-and-zone combination as the best opportunity's own block — the realistic \"what does a normal lot look like in this zone\" benchmark preferred over the zone's bare legal minimum when working out lots_possible, since dividing by the legal floor alone assumes every new lot gets created at that minimum. Grouped by zone, not just suburb, so a suburb spanning several zones doesn't get one blended figure (see typical_house_lot_size_by_suburb). Distinct from Median Land Size (For Sale), which is the size of the (unusually large, by definition) subdivision-candidate blocks themselves, not ordinary lots generally." },
  { field: "bestHeightLimit", title: "Best Opportunity — Height Limit (m)", group: "Best Opportunity Detail",
    description: "Maximum building height permitted on the best opportunity's block, in metres — NSW only for now (no equivalent published layer for other states, see config.yaml's zoning: block)." },
  { field: "bestFloorSpaceRatio", title: "Best Opportunity — Floor Space Ratio", group: "Best Opportunity Detail",
    description: "Maximum floor space ratio permitted on the best opportunity's block — NSW only for now." },
  { field: "bestHeritageSignificance", title: "Best Opportunity — Heritage Listing", group: "Best Opportunity Detail",
    description: "Heritage significance (Local/State/National/World), where the best opportunity's block is heritage-listed — NSW only for now. Blank means not listed, not \"unknown\"." },
];

const SUBDIVISION_DEFAULT_VISIBLE = new Set([
  "area", "opportunityScore", "opportunityCount", "bestConfidence",
  "medianLandPriceForSale", "typicalLandSizeM2",
]);

function buildSubdivisionColumnDef(col) {
  const base = { field: col.field, title: col.title, headerFilter: false };
  if (col.field === "area") return { ...base, cssClass: "pt-identity", minWidth: 160 };
  if (col.field === "opportunityScore") {
    return { ...base, sorter: "number", hozAlign: "right", width: 110, formatter: (cell) => {
      const v = cell.getValue();
      if (v == null) return "";
      return `<span class="pt-score ${scoreColorClass(v)}">${Math.round(v)}</span>`;
    } };
  }
  if (col.field === "opportunityCount" || col.field === "bestLotsPossible" || col.field === "bestCompCount") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
      const v = cell.getValue();
      return v == null ? "" : v.toLocaleString();
    } };
  }
  if (col.field === "bestProfit") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
      const v = cell.getValue();
      return v == null ? "" : `<span class="profit-positive">+${formatMoney(v)}</span>`;
    } };
  }
  if (col.field === "bestConfidence") {
    return { ...base, sorter: "number", width: 130, formatter: (cell) => {
      const v = cell.getValue();
      if (v == null) return "";
      const label = confidenceLabel(v);
      return `<span class="confidence-badge confidence-${label.toLowerCase()}">${label}</span>`;
    } };
  }
  if (col.field === "medianLandPriceForSale") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => formatMoney(cell.getValue()) };
  }
  if (col.field === "typicalLandSizeM2" || col.field === "bestResultingLotM2"
      || col.field === "bestMinLotSizeM2" || col.field === "bestTypicalLotSizeM2") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
      const v = cell.getValue();
      return v == null ? "" : `${Math.round(v).toLocaleString()} m²`;
    } };
  }
  if (col.field === "bestHeightLimit") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
      const v = cell.getValue();
      return v == null ? "" : `${v} m`;
    } };
  }
  if (col.field === "bestFloorSpaceRatio") {
    return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
      const v = cell.getValue();
      return v == null ? "" : `${v}:1`;
    } };
  }
  return { ...base, sorter: "string" };
}

// Same grouped-header wrapping as buildGroupedSuburbColumns (Suburb Finder)
// — one spanning parent header per `group`, in first-seen order.
function buildGroupedSubdivisionColumns(columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    const groupName = col.group || "Other";
    const isFirstInNewGroup = !byName.has(groupName);
    if (isFirstInNewGroup) {
      const groupDef = { title: groupName, columns: [] };
      byName.set(groupName, groupDef);
      groups.push(groupDef);
    }
    const colDef = buildSubdivisionColumnDef(col);
    if (isFirstInNewGroup && groups.length > 1) {
      colDef.cssClass = [colDef.cssClass, "pt-group-start"].filter(Boolean).join(" ");
    }
    byName.get(groupName).columns.push(colDef);
  });
  return groups;
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
  const holdingCost = listing.price * (params.holdingCostsPct / 100);
  const totalCost = listing.price + subdivisionCost + stampDuty + holdingCost;
  const sellingCost = listing.est_total_revenue * (params.sellingCostsPct / 100);
  const netRevenue = listing.est_total_revenue - sellingCost;
  const m2 = (v) => (v != null ? `${Math.round(v).toLocaleString()} m²` : "—");
  const aiSummaryHtml = listing.ai_summary && listing.ai_summary.length
    ? `
      <h4>AI subdivision notes</h4>
      <ul class="listing-detail__ai-summary">
        ${listing.ai_summary.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
      </ul>
      <p class="modal-note">Generated from this listing's own description — may contain errors, not a substitute for reading the full ad.</p>
    `
    : "";
  return `
    <div class="listing-detail">
      <h4>Land &amp; zoning</h4>
      <div class="listing-detail__zoning">
        <div><span>Zone</span><span>${listing.zone ?? "—"}</span></div>
        <div><span>Council</span><span>${listing.council ?? "—"}</span></div>
        <div><span>Typical lot size (this zone)</span><span>${m2(listing.typical_lot_m2)}</span></div>
        <div><span>Min lot size (used for this calc)</span><span>${m2(listing.min_lot_m2)}</span></div>
        <div><span>Height limit</span><span>${listing.height_limit_m != null ? `${listing.height_limit_m} m` : "—"}</span></div>
        <div><span>Floor space ratio</span><span>${listing.floor_space_ratio != null ? `${listing.floor_space_ratio}:1` : "—"}</span></div>
        <div><span>Heritage listing</span><span>${listing.heritage_significance ?? "Not listed"}</span></div>
      </div>
      ${aiSummaryHtml}
      <h4>Subdivision economics</h4>
      <div class="listing-detail__calc">
        <div><span>Purchase price</span><span>${formatMoney(listing.price)}</span></div>
        <div><span>Subdivision cost (${listing.lots_possible} × ${formatMoney(params.costPerLot)})</span><span>${formatMoney(subdivisionCost)}</span></div>
        <div><span>Stamp duty (${params.stampDutyBufferPct}%)</span><span>${formatMoney(stampDuty)}</span></div>
        <div><span>Holding costs (${params.holdingCostsPct}% of price)</span><span>${formatMoney(holdingCost)}</span></div>
        <div class="listing-detail__total"><span>Total cost</span><span>${formatMoney(totalCost)}</span></div>
        <div><span>Comp median price × ${listing.lots_possible} lots</span><span>${formatMoney(listing.est_total_revenue)}</span></div>
        <div><span>Selling costs (${params.sellingCostsPct}% of revenue)</span><span>-${formatMoney(sellingCost)}</span></div>
        <div><span>Net revenue</span><span>${formatMoney(netRevenue)}</span></div>
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
          <span class="listing-card__address">${listing.address}</span>
          <span class="listing-card__meta">${formatMoney(listing.price)} · ${Math.round(listing.land_size_m2).toLocaleString()} m²
            · ${listing.lots_possible} lots of ~${Math.round(listing.resulting_lot_m2)} m²${listing.zone ? ` · ${listing.zone}` : ""}</span>
          <a class="listing-card__view-link" href="${listing.url}" target="_blank" rel="noopener">View listing ↗</a>
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
    // Clicking the card expands/collapses the deep-dive detail — it should
    // NOT also whisk the user off to the REA listing. The "View listing"
    // link (its own explicit, separate action) opens REA instead;
    // stopPropagation keeps that click from also toggling the detail panel
    // underneath it.
    const viewLink = card.querySelector(".listing-card__view-link");
    viewLink.addEventListener("click", (e) => e.stopPropagation());
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

// ─────────────────────────────────────────────────────────────────────────────
// Filter field catalog for Subdivision's query builder — driven off
// individual candidate LISTINGS (not suburb groups), since filtering has to
// happen before grouping/scoring (which itself depends on the live
// assumptions). Deliberately a small, listing-level subset of what a
// candidate actually has, not every raw field.
// ─────────────────────────────────────────────────────────────────────────────
function buildSubdivisionFieldCatalog(listings) {
  const fields = [
    { field: "suburb", label: "Suburb", type: "text" },
    { field: "state", label: "State", type: "categorical" },
    { field: "zone", label: "Zone", type: "categorical" },
    { field: "price", label: "Price", type: "number" },
    { field: "land_size_m2", label: "Land (m²)", type: "number" },
    { field: "lots_possible", label: "Lots Possible", type: "number" },
    { field: "confidence", label: "Comp Confidence (0-1)", type: "number" },
  ];
  return fields.map((f) => (f.type === "categorical" ? { ...f, options: distinctValues(listings, f.field) } : f));
}

// ─────────────────────────────────────────────────────────────────────────────
// Assumptions panel — the cost/margin inputs no listing can capture (real-
// world subdivision economics, not derivable from data). Cost per lot and
// stamp duty are the user's own originally-specified figures; selling costs
// and holding costs are added on top (both affect profit directly, same as
// the other two) — defaults for all four come from config.yaml's
// subdivision: block, the two new ones seeded from the "Quick Feasibility
// Analysis" spreadsheet (see references/subdivision/context.md).
// ─────────────────────────────────────────────────────────────────────────────
const SUBDIVISION_ASSUMPTION_FIELDS = [
  { key: "costPerLot", defaultField: "default_cost_per_lot", fallback: 40000,
    label: "Subdivision cost per lot ($)", step: 1000,
    help: "Cost to service each new lot (water/power/gas/sewerage, surveying, compliance) — Charles's own worked example uses $40,000." },
  { key: "stampDutyBufferPct", defaultField: "default_stamp_duty_buffer_pct", fallback: 5.5,
    label: "Stamp duty (%)", step: 0.1,
    help: "Applied to the purchase price. Varies by state and land value — 5.5% is a reasonable buffer across most states." },
  { key: "sellingCostsPct", defaultField: "default_selling_costs_pct", fallback: 2.5,
    label: "Selling costs (%)", step: 0.1,
    help: "Agent commission and marketing when the new lots are resold — applied to total resale revenue." },
  { key: "holdingCostsPct", defaultField: "default_holding_costs_pct", fallback: 5.0,
    label: "Holding costs (%)", step: 0.1,
    help: "Interest/finance costs over the subdivision period — applied to the purchase price, same as the \"Quick Feasibility Analysis\" spreadsheet's ~5% over 12 months." },
];

function buildSubdivisionAssumptionsPanel(defaults, refresh) {
  const body = document.getElementById("subdivision-assumptions-body");
  body.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "assumptions-grid";

  const inputs = {};
  SUBDIVISION_ASSUMPTION_FIELDS.forEach((f) => {
    const field = document.createElement("div");
    field.className = "assumptions-field";

    const label = document.createElement("label");
    label.textContent = f.label;
    label.htmlFor = `subdivision-assumption-${f.key}`;

    const input = document.createElement("input");
    input.type = "number";
    input.step = String(f.step);
    input.id = `subdivision-assumption-${f.key}`;
    input.value = defaults[f.defaultField] ?? f.fallback;
    inputs[f.key] = input;

    const help = document.createElement("p");
    help.className = "assumptions-field__help";
    help.textContent = f.help;

    field.appendChild(label);
    field.appendChild(input);
    field.appendChild(help);
    grid.appendChild(field);
  });
  body.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "assumptions-actions";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn btn--ghost";
  resetBtn.textContent = "Reset to defaults";
  actions.appendChild(resetBtn);
  body.appendChild(actions);

  const apply = debounce(() => {
    SUBDIVISION_ASSUMPTION_FIELDS.forEach((f) => {
      subdivisionParams[f.key] = Number(inputs[f.key].value) || 0;
    });
    refresh();
  }, 200);

  SUBDIVISION_ASSUMPTION_FIELDS.forEach((f) => {
    subdivisionParams[f.key] = Number(inputs[f.key].value) || 0;
    inputs[f.key].addEventListener("input", apply);
  });

  resetBtn.addEventListener("click", () => {
    SUBDIVISION_ASSUMPTION_FIELDS.forEach((f) => {
      inputs[f.key].value = defaults[f.defaultField] ?? f.fallback;
      subdivisionParams[f.key] = Number(inputs[f.key].value) || 0;
    });
    refresh();
  });
}

function buildSubdivisionTab(payload) {
  const sub = payload.subdivision;
  const listings = sub.listings;

  // qb and the Assumptions panel both need to exist (and subdivisionParams
  // needs real defaults, not the {0,0,0,0} placeholder above) before the
  // FIRST data computation — Tabulator expects real data in its constructor
  // options, same as this tab's original implementation; calling
  // table.setData() synchronously right after construction (before
  // Tabulator's own async init finishes) silently drops it.
  let table;
  const refresh = () => {
    table.setData(buildSuburbGroups(listings, subdivisionParams, qb));
  };

  const fieldCatalog = buildSubdivisionFieldCatalog(listings);
  const qb = createQueryBuilder(document.getElementById("subdivision-querybuilder"), fieldCatalog, {
    persistKey: "subdivision",
    onFilterChange: refresh,
  });

  createStrategiesPanel(document.getElementById("subdivision-strategies"), qb);
  wireSaveStrategyButton(document.getElementById("subdivision-save-strategy"), qb);
  document.getElementById("subdivision-clear-filters").addEventListener("click", () => qb.clear());

  buildSubdivisionAssumptionsPanel(sub, refresh);
  const assumptionsModal = document.getElementById("subdivision-assumptions-modal");
  document.getElementById("subdivision-assumptions-toggle").addEventListener("click", () => { assumptionsModal.hidden = false; });
  document.getElementById("subdivision-assumptions-close").addEventListener("click", () => { assumptionsModal.hidden = true; });
  assumptionsModal.addEventListener("click", (e) => {
    if (e.target.id === "subdivision-assumptions-modal") assumptionsModal.hidden = true;
  });

  table = new Tabulator("#subdivision-table", {
    data: buildSuburbGroups(listings, subdivisionParams, qb),
    columns: buildGroupedSubdivisionColumns(SUBDIVISION_COLUMNS),
    layout: "fitDataFill",
    columnDefaults: { headerWordWrap: true, minWidth: 110 },
    height: "calc(100vh - 400px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    initialSort: [{ column: "opportunityScore", dir: "desc" }],
    placeholder: "No profitable subdivision opportunities match these filters",
  });

  document.getElementById("subdivision-pagesize-top").appendChild(createPageSizeSelect(table, 50));

  let suburbSearchTerm = "";
  table.setFilter((row) => !suburbSearchTerm || String(row.suburb ?? "").toLowerCase().includes(suburbSearchTerm));
  const suburbSearch = document.getElementById("subdivision-suburb-search");
  suburbSearch.addEventListener("input", debounce(() => {
    suburbSearchTerm = suburbSearch.value.trim().toLowerCase();
    table.setFilter((row) => !suburbSearchTerm || String(row.suburb ?? "").toLowerCase().includes(suburbSearchTerm));
  }, 200));

  document.getElementById("subdivision-download-xlsx").addEventListener("click", () => {
    table.download("xlsx", "subdivision-opportunities.xlsx", { sheetName: "Subdivision" });
  });

  table.on("tableBuilt", () => {
    createColumnPanel(table, SUBDIVISION_COLUMNS, {
      panel: "subdivision-column-panel", groups: "subdivision-column-panel-groups",
      toggle: "subdivision-column-panel-toggle", close: "subdivision-column-panel-close",
      selectAll: "subdivision-column-panel-all", selectNone: "subdivision-column-panel-none",
      storageKey: "subdivision-hidden-columns",
      defaultHidden: SUBDIVISION_COLUMNS.map((c) => c.field).filter((f) => !SUBDIVISION_DEFAULT_VISIBLE.has(f)),
    });
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
    { op: "notin", label: "Is none of" },
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
  if (rule.operator === "notin") {
    const set = Array.isArray(rule.value) ? rule.value : [];
    return set.length === 0 || !set.includes(strValue);
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
  if (rule.operator === "in" || rule.operator === "notin") {
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

  if (meta.type === "categorical" && (rule.operator === "in" || rule.operator === "notin")) {
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

// Persists the CURRENTLY ACTIVE filter tree (distinct from named Saved
// Strategies below) so it auto-restores on the next visit instead of
// starting blank every session — one localStorage slot per persistKey, so
// multiple tabs with their own query builder don't collide.
function qbLoadLastState(persistKey) {
  try {
    const raw = localStorage.getItem(`propertyTool.lastFilter.${persistKey}.v1`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to read last filter state", err);
    return null;
  }
}

function qbSaveLastState(persistKey, group) {
  try {
    localStorage.setItem(`propertyTool.lastFilter.${persistKey}.v1`, JSON.stringify(group));
  } catch (err) {
    console.error("Failed to save last filter state", err);
  }
}

function createQueryBuilder(container, fieldCatalog, options) {
  const fieldMap = new Map(fieldCatalog.map((f) => [f.field, f]));
  const persistKey = options.persistKey;
  let root = null;
  if (persistKey) {
    const restored = qbLoadLastState(persistKey);
    if (restored) {
      qbPruneToFields(restored, fieldMap);
      qbFlatten(restored);
      root = restored;
    }
  }
  if (!root) root = qbNewGroup("AND", []);

  function render() {
    container.innerHTML = "";
    container.appendChild(qbRenderGroup(root, fieldCatalog, fieldMap, handleChange, 0));
  }

  function handleChange(rerender) {
    if (rerender !== false) render();
    if (persistKey) qbSaveLastState(persistKey, root);
    options.onFilterChange();
  }

  render();

  return {
    getGroup: () => root,
    setGroup: (newGroup) => {
      root = newGroup;
      render();
      if (persistKey) qbSaveLastState(persistKey, root);
      options.onFilterChange();
    },
    clear: () => {
      root = qbNewGroup("AND", []);
      render();
      if (persistKey) qbSaveLastState(persistKey, root);
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
  "top_industry_1", "top_industry_2", "top_industry_3",
]);
const SUBURB_MONEY_FIELDS = new Set([
  "non_res_building_approvals_value_fy", "infrastructure_spend_per_capita",
  "median_price_house", "median_price_unit",
  "price_p25_house", "price_p75_house", "price_iqr_house",
  "price_p25_unit", "price_p75_unit", "price_iqr_unit",
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
  "for_sale_count", "sold_recent_count",
  "listings_current", "listings_1mo", "listings_6mo", "listings_1yr",
  "rentals_current", "rentals_1mo", "rentals_6mo",
  "population_2025", "new_dwelling_approvals_fy",
  "median_land_size_m2_house", "median_land_size_m2_unit",
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
    // Tabulator refuses `frozen` on a column nested in a column group
    // ("Parent column group must be frozen, not individual columns") — this
    // table's columns are grouped (buildGroupedSuburbColumns), so true pinning
    // isn't available here; cssClass alone gives it the identity-column
    // emphasis (bold, no-wrap) without pinning.
    if (col.field === "area") return { ...base, cssClass: "pt-identity", minWidth: 160 };
    if (SUBURB_MONEY_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}`;
      } };
    }
    if (SUBURB_MONEY_PER_M2_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}/m²`;
      } };
    }
    if (SUBURB_MONEY_PER_WEEK_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}/wk`;
      } };
    }
    if (SUBURB_KM_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(1)} km`;
      } };
    }
    if (SUBURB_PERCENT_SIGNED_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => formatPercentSigned(cell.getValue()) };
    }
    if (SUBURB_INT_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : Math.round(v).toLocaleString();
      } };
    }
    if (col.field === "height_limit_m") {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(0)} m`;
      } };
    }
    if (col.field === "floor_space_ratio") {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(2)}:1`;
      } };
    }
    if (
      col.field === "mining_employment_pct" ||
      col.field === "top_industry_1_pct" ||
      col.field === "top_industry_2_pct" ||
      col.field === "top_industry_3_pct" ||
      col.field === "owner_occupied_pct" ||
      col.field === "renter_pct"
    ) {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(1)}%`;
      } };
    }
    if (col.field === "median_household_income_annual") {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `$${Math.round(v).toLocaleString()}`;
      } };
    }
    if (col.field === "affordability_index_house" || col.field === "affordability_index_unit") {
      return { ...base, sorter: "number", hozAlign: "right", formatter: (cell) => {
        const v = cell.getValue();
        return v == null ? "" : `${v.toFixed(1)}x`;
      } };
    }
    if (SUBURB_SCORE_FIELDS.has(col.field)) {
      return { ...base, sorter: "number", hozAlign: "right", width: 110, formatter: (cell) => {
        const v = cell.getValue();
        if (v == null) return "";
        return `<span class="pt-score ${scoreColorClass(v)}">${Math.round(v)}</span>`;
      } };
    }
    return { ...base, sorter: "number" };
}

// Same grouped-header wrapping as buildGroupedColumns (Data Table) — one
// spanning parent header per `group` in config.yaml, in first-seen order.
function buildGroupedSuburbColumns(columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    const groupName = col.group || "Other";
    const isFirstInNewGroup = !byName.has(groupName);
    if (isFirstInNewGroup) {
      const groupDef = { title: groupName, columns: [] };
      byName.set(groupName, groupDef);
      groups.push(groupDef);
    }
    const colDef = buildSuburbColumnDef(col);
    if (isFirstInNewGroup && groups.length > 1) {
      colDef.cssClass = [colDef.cssClass, "pt-group-start"].filter(Boolean).join(" ");
    }
    byName.get(groupName).columns.push(colDef);
  });
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suburb comparison — pick up to MAX_COMPARE_SUBURBS rows in the Suburb
// Finder table (Tabulator's own row selection, not a bespoke checkbox
// column) and view every suburb_columns metric for them side by side,
// grouped the same way as the table's own header groups. Reuses
// buildSuburbColumnDef's formatters directly (passing a minimal fake
// CellComponent) rather than re-implementing money/percent/etc. formatting
// a second time.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_COMPARE_SUBURBS = 6;

function compareFormatValue(columnsCfg, field, value) {
  if (value == null || value === "") return "—";
  const col = columnsCfg.find((c) => c.field === field);
  const colDef = buildSuburbColumnDef(col || { field, title: field });
  if (typeof colDef.formatter === "function") {
    const rendered = colDef.formatter({ getValue: () => value });
    return rendered === "" ? "—" : rendered;
  }
  return String(value);
}

function buildCompareTable(rows, columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    if (!byName.has(col.group)) {
      const g = { name: col.group || "Other", cols: [] };
      byName.set(col.group, g);
      groups.push(g);
    }
    byName.get(col.group).cols.push(col);
  });

  const thead = `
    <tr>
      <th>Metric</th>
      ${rows.map((r) => `<th>${r.suburb}, ${r.state}</th>`).join("")}
    </tr>
  `;

  const body = groups.map((g) => `
    <tr class="compare-group-row"><th colspan="${rows.length + 1}">${g.name}</th></tr>
    ${g.cols.map((col) => `
      <tr>
        <th>${col.title}</th>
        ${rows.map((r) => `<td>${compareFormatValue(columnsCfg, col.field, r[col.field])}</td>`).join("")}
      </tr>
    `).join("")}
  `).join("");

  return `
    <div class="compare-table-scroll">
      <table class="compare-table">
        <thead>${thead}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// One shared modal, reused by every table that wires up compare (Explore
// suburbs, Shortlist) — only one can be open at a time anyway. compareModalState
// tracks whatever's currently rendered in it, so the Download Excel button
// (also shared) can export the exact rows/columns on screen regardless of
// which table's Compare button opened it.
let compareModalState = null; // { rows, columnsCfg }

function downloadCompareExcel(rows, columnsCfg) {
  const groups = [];
  const byName = new Map();
  columnsCfg.forEach((col) => {
    if (!byName.has(col.group)) {
      const g = { name: col.group || "Other", cols: [] };
      byName.set(col.group, g);
      groups.push(g);
    }
    byName.get(col.group).cols.push(col);
  });

  const aoa = [["Metric", ...rows.map((r) => `${r.suburb}, ${r.state}`)]];
  groups.forEach((g) => {
    aoa.push([g.name]);
    g.cols.forEach((col) => {
      aoa.push([col.title, ...rows.map((r) => compareFormatValue(columnsCfg, col.field, r[col.field]))]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparison");
  XLSX.writeFile(wb, "suburb-comparison.xlsx");
}

function wireCompareModalClose() {
  const modal = document.getElementById("compare-modal");
  const closeBtn = document.getElementById("compare-modal-close");
  const downloadBtn = document.getElementById("compare-download-xlsx");
  const close = () => { modal.hidden = true; };
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  downloadBtn.addEventListener("click", () => {
    if (compareModalState) downloadCompareExcel(compareModalState.rows, compareModalState.columnsCfg);
  });
}

function wireCompareFeature(table, columnsCfg, toggleBtnId) {
  const toggleBtn = document.getElementById(toggleBtnId);
  const modal = document.getElementById("compare-modal");
  const modalBody = document.getElementById("compare-modal-body");

  table.on("rowSelectionChanged", (data) => {
    toggleBtn.textContent = `Compare (${data.length})`;
    toggleBtn.disabled = data.length < 2;
  });

  toggleBtn.addEventListener("click", () => {
    const selected = table.getSelectedData();
    compareModalState = { rows: selected, columnsCfg };
    modalBody.innerHTML = buildCompareTable(selected, columnsCfg);
    modal.hidden = false;
  });
}

// Explicit checkbox column for row selection (Compare / Add to Shortlist /
// Remove from Shortlist) — not relying on "click anywhere on the row",
// which is easy to miss as a selection affordance and, before this, had no
// visible feedback at all (see the .tabulator-selected CSS fix).
function buildSelectionColumn() {
  return {
    formatter: "rowSelection", titleFormatter: "rowSelection",
    hozAlign: "center", headerSort: false, width: 40, minWidth: 40, headerWordWrap: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Investment Score — Capital Growth / Cashflow / Lower Risk / Overall, each
// 0-100, computed server-side (build_site.py: add_composite_scores) using a
// fixed weighting we chose ourselves, inspired by HtAG Analytics' published
// Relative Composite Score structure — deliberately NOT user-adjustable (see
// config.yaml's "Investment Score" suburb_columns group for the exact
// weights and the honest gaps vs HtAG's own metric list). They arrive as
// plain suburb_columns fields, same as any other metric — no client-side
// computation needed here at all.
// ─────────────────────────────────────────────────────────────────────────────
const SUBURB_SCORE_FIELDS = new Set([
  "capital_growth_score_house", "capital_growth_score_unit",
  "cashflow_score_house", "cashflow_score_unit",
  "lower_risk_score_house", "lower_risk_score_unit",
  "overall_score_house", "overall_score_unit",
]);

function scoreColorClass(value) {
  if (value == null) return "";
  if (value >= 70) return "pt-score-high";
  if (value >= 40) return "pt-score-mid";
  return "pt-score-low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Shortlist — suburbs explicitly added via "Add to Shortlist" in Explore
// suburbs, shown in their own sub-tab deliberately NOT subject to Explore's
// query-builder filter (a curated shortlist shouldn't silently shrink
// because of leftover filter state elsewhere). The "active" shortlist is one
// working Set persisted continuously; "Save as Shortlist" snapshots it under
// a name (mirrors Saved Strategies) so more than one can exist and be
// swapped back in via "Load Shortlist".
// ─────────────────────────────────────────────────────────────────────────────
const SHORTLIST_ACTIVE_STORAGE_KEY = "propertyTool.activeShortlist.v1";
const SHORTLIST_SAVED_STORAGE_KEY = "propertyTool.savedShortlists.v1";

function suburbKey(row) {
  return `${row.suburb}||${row.state}`;
}

function loadActiveShortlist() {
  try {
    const raw = localStorage.getItem(SHORTLIST_ACTIVE_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveActiveShortlist(keys) {
  try {
    localStorage.setItem(SHORTLIST_ACTIVE_STORAGE_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // localStorage unavailable — active shortlist just won't persist
  }
}

function loadSavedShortlists() {
  try {
    const raw = localStorage.getItem(SHORTLIST_SAVED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSavedShortlists(list) {
  try {
    localStorage.setItem(SHORTLIST_SAVED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable — saved shortlists just won't persist
  }
}

function createShortlistsPanel(container, onLoad) {
  const wrapper = document.createElement("div");
  wrapper.className = "strategies-dropdown";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn--secondary strategies-dropdown__toggle";
  toggle.textContent = "Load Shortlist";
  wrapper.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "strategies-dropdown__panel";

  function renderList() {
    const shortlists = loadSavedShortlists();
    panel.innerHTML = "";
    if (!shortlists.length) {
      const empty = document.createElement("p");
      empty.className = "strategies-dropdown__empty";
      empty.textContent = "No saved shortlists yet.";
      panel.appendChild(empty);
      return;
    }
    shortlists.forEach((s) => {
      const item = document.createElement("div");
      item.className = "strategy-item";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "strategy-item__name";
      nameBtn.textContent = `${s.name} (${s.suburbKeys.length})`;
      nameBtn.title = `Saved ${new Date(s.createdAt).toLocaleString()}`;
      nameBtn.addEventListener("click", () => {
        onLoad(new Set(s.suburbKeys));
        panel.classList.remove("is-open");
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "strategy-item__delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete this saved shortlist";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        saveSavedShortlists(loadSavedShortlists().filter((x) => x.id !== s.id));
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

function wireSaveShortlistButton(button, getActiveKeys) {
  button.addEventListener("click", () => {
    const keys = getActiveKeys();
    if (!keys.size) {
      alert("Add at least one suburb to the shortlist before saving it under a name.");
      return;
    }
    const name = prompt("Save this shortlist as:", `Shortlist ${loadSavedShortlists().length + 1}`);
    if (!name) return;
    const shortlists = loadSavedShortlists();
    shortlists.push({
      id: `shortlist-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name,
      createdAt: new Date().toISOString(),
      suburbKeys: Array.from(keys),
    });
    saveSavedShortlists(shortlists);
  });
}

// Mirrors setupTabs, scoped to one nested .subtabs group instead of the
// top-level .tabs bar (a Tabulator table built while its panel is still
// display:none needs a redraw once actually shown, same reasoning as the
// top-level tabs).
function setupSubTabs(rootEl, tableByName) {
  const redrawn = new Set(
    Object.keys(tableByName).filter(
      (name) => document.getElementById(`subtab-${name}`)?.classList.contains("is-active")
    )
  );
  rootEl.querySelectorAll(".subtabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      rootEl.querySelectorAll(".subtabs__btn").forEach((b) => b.classList.remove("is-active"));
      rootEl.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add("is-active");

      const table = tableByName[btn.dataset.subtab];
      if (table && !redrawn.has(btn.dataset.subtab)) {
        redrawn.add(btn.dataset.subtab);
        table.redraw(true);
      }
    });
  });
}

function buildSuburbFinderTab(payload) {
  const suburbs = payload.suburbs;
  if (!suburbs) return null;

  wireCompareModalClose();
  const activeShortlist = loadActiveShortlist();

  // Suburb/state/postcode collapse into one "Area" column for display —
  // the query builder's field catalog still targets the original,
  // unmerged suburbs.columns so filtering stays granular per-field.
  suburbs.rows.forEach((row) => {
    row.area = formatArea(row.suburb, row.state, row.postcode);
  });
  const suburbColumnsCfg = mergeIdentityColumns(suburbs.columns);

  // ── Explore suburbs ─────────────────────────────────────────────────────
  const exploreTable = new Tabulator("#suburb-table", {
    data: suburbs.rows,
    columns: [buildSelectionColumn(), ...buildGroupedSuburbColumns(suburbColumnsCfg)],
    layout: "fitDataFill",
    columnDefaults: { headerWordWrap: true, minWidth: 110 },
    height: "calc(100vh - 440px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    initialSort: [{ column: "median_price", dir: "desc" }],
    placeholder: "No suburbs match these filters",
    selectableRows: MAX_COMPARE_SUBURBS,
  });

  document.getElementById("suburbfinder-pagesize-top").appendChild(createPageSizeSelect(exploreTable, 50));

  const fieldCatalog = buildSuburbFieldCatalog(suburbs.columns, suburbs.rows);
  let exploreSearchTerm = "";
  const exploreFilter = (row) => qb.matches(row) &&
    (!exploreSearchTerm || String(row.suburb ?? "").toLowerCase().includes(exploreSearchTerm));
  const qb = createQueryBuilder(document.getElementById("suburbfinder-querybuilder"), fieldCatalog, {
    persistKey: "suburbfinder",
    onFilterChange: () => exploreTable.setFilter(exploreFilter),
  });
  // Apply whatever was restored from localStorage (or the still-empty
  // default) once up front — createQueryBuilder can't safely call
  // onFilterChange during its own construction (this closure captures `qb`,
  // which isn't assigned yet while `createQueryBuilder(...)` is still running).
  exploreTable.setFilter(exploreFilter);

  const exploreSearchBox = document.getElementById("suburbfinder-suburb-search");
  exploreSearchBox.addEventListener("input", debounce(() => {
    exploreSearchTerm = exploreSearchBox.value.trim().toLowerCase();
    exploreTable.setFilter(exploreFilter);
  }, 200));
  document.getElementById("suburbfinder-download-xlsx").addEventListener("click", () => {
    exploreTable.download("xlsx", "suburb-finder.xlsx", { sheetName: "Suburbs" });
  });

  createStrategiesPanel(document.getElementById("suburbfinder-strategies"), qb);
  wireSaveStrategyButton(document.getElementById("suburbfinder-save-strategy"), qb);
  document.getElementById("suburbfinder-clear-filters").addEventListener("click", () => qb.clear());
  wireCompareFeature(exploreTable, suburbColumnsCfg, "suburbfinder-compare-toggle");

  exploreTable.on("tableBuilt", () => {
    createColumnPanel(exploreTable, suburbColumnsCfg, {
      panel: "suburbfinder-column-panel", groups: "suburbfinder-column-panel-groups",
      toggle: "suburbfinder-column-panel-toggle", close: "suburbfinder-column-panel-close",
      selectAll: "suburbfinder-column-panel-all", selectNone: "suburbfinder-column-panel-none",
      storageKey: "suburbfinder-hidden-columns",
    });
  });
  exploreTable.on("dataFiltered", () => updateRowCount(exploreTable, "suburbfinder-row-count", "suburbs"));
  exploreTable.on("renderComplete", () => updateRowCount(exploreTable, "suburbfinder-row-count", "suburbs"));

  // ── Shortlist ────────────────────────────────────────────────────────────
  function shortlistRows() {
    return suburbs.rows.filter((row) => activeShortlist.has(suburbKey(row)));
  }

  const shortlistTable = new Tabulator("#shortlist-table", {
    data: shortlistRows(),
    columns: [buildSelectionColumn(), ...buildGroupedSuburbColumns(suburbColumnsCfg)],
    layout: "fitDataFill",
    columnDefaults: { headerWordWrap: true, minWidth: 110 },
    height: "calc(100vh - 440px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    placeholder: "Nothing in this shortlist yet — tick suburbs in Explore suburbs and click \"Add to Shortlist\".",
    selectableRows: MAX_COMPARE_SUBURBS,
  });

  document.getElementById("shortlist-pagesize-top").appendChild(createPageSizeSelect(shortlistTable, 50));

  let shortlistSearchTerm = "";
  const shortlistFilter = (row) =>
    !shortlistSearchTerm || String(row.suburb ?? "").toLowerCase().includes(shortlistSearchTerm);
  const shortlistSearchBox = document.getElementById("shortlist-suburb-search");
  shortlistSearchBox.addEventListener("input", debounce(() => {
    shortlistSearchTerm = shortlistSearchBox.value.trim().toLowerCase();
    shortlistTable.setFilter(shortlistFilter);
  }, 200));
  document.getElementById("shortlist-download-xlsx").addEventListener("click", () => {
    shortlistTable.download("xlsx", "shortlist.xlsx", { sheetName: "Shortlist" });
  });

  function refreshShortlistTable() {
    saveActiveShortlist(activeShortlist);
    shortlistTable.setData(shortlistRows());
  }

  const addToShortlistBtn = document.getElementById("suburbfinder-add-to-shortlist");
  exploreTable.on("rowSelectionChanged", (data) => {
    addToShortlistBtn.disabled = data.length === 0;
  });
  addToShortlistBtn.addEventListener("click", () => {
    exploreTable.getSelectedData().forEach((row) => activeShortlist.add(suburbKey(row)));
    exploreTable.deselectRow();
    refreshShortlistTable();
  });

  const removeFromShortlistBtn = document.getElementById("shortlist-remove");
  shortlistTable.on("rowSelectionChanged", (data) => {
    removeFromShortlistBtn.disabled = data.length === 0;
  });
  removeFromShortlistBtn.addEventListener("click", () => {
    shortlistTable.getSelectedData().forEach((row) => activeShortlist.delete(suburbKey(row)));
    refreshShortlistTable();
  });

  createShortlistsPanel(document.getElementById("shortlist-saved"), (keys) => {
    activeShortlist.clear();
    keys.forEach((k) => activeShortlist.add(k));
    refreshShortlistTable();
  });
  wireSaveShortlistButton(document.getElementById("shortlist-save"), () => activeShortlist);
  wireCompareFeature(shortlistTable, suburbColumnsCfg, "shortlist-compare-toggle");

  shortlistTable.on("tableBuilt", () => {
    createColumnPanel(shortlistTable, suburbColumnsCfg, {
      panel: "shortlist-column-panel", groups: "shortlist-column-panel-groups",
      toggle: "shortlist-column-panel-toggle", close: "shortlist-column-panel-close",
      selectAll: "shortlist-column-panel-all", selectNone: "shortlist-column-panel-none",
      storageKey: "shortlist-hidden-columns",
    });
  });
  shortlistTable.on("dataFiltered", () => updateRowCount(shortlistTable, "shortlist-row-count", "suburbs"));
  shortlistTable.on("renderComplete", () => updateRowCount(shortlistTable, "shortlist-row-count", "suburbs"));

  setupSubTabs(document.getElementById("tab-suburbfinder"), { explore: exploreTable, shortlist: shortlistTable });

  return exploreTable;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Definitions tab — one row per Data Table column (payload.columns) plus
// one per Suburb Finder column (payload.suburbs.columns), both sourced
// directly from config.yaml (site.columns / site.suburb_columns — see
// build_site.py select_rows / build_suburb_stats) so this never drifts out of
// sync with what those tabs actually show.
// ─────────────────────────────────────────────────────────────────────────────
// One combined, searchable table instead of a separate static list per tab
// — the same field name can mean different things in different tabs (e.g.
// "Zone" is a single property's own zone in Data Table, the suburb's
// predominant zone in Suburb Finder), so each row keeps its source tab as
// its own column rather than collapsing them together.
function buildDefinitionsRows(payload) {
  const rows = [];
  payload.columns.forEach((c) => rows.push({ source: "Data Table", title: c.title, description: c.description, formula: c.formula }));
  if (payload.suburbs) {
    payload.suburbs.columns.forEach((c) => rows.push({ source: "Suburb Finder", title: c.title, description: c.description, formula: c.formula }));
  }
  SUBDIVISION_COLUMNS.forEach((c) => rows.push({ source: "Subdivision", title: c.title, description: c.description, formula: c.formula }));
  return rows;
}

function buildDefinitionsTab(payload) {
  const rows = buildDefinitionsRows(payload);

  const table = new Tabulator("#definitions-table", {
    data: rows,
    layout: "fitDataFill",
    columnDefaults: { headerWordWrap: true },
    height: "calc(100vh - 320px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    placeholder: "No matching definitions",
    columns: [
      { field: "source", title: "Tab", width: 140, headerFilter: false },
      { field: "title", title: "Column", minWidth: 200, headerFilter: false, cssClass: "pt-identity" },
      { field: "description", title: "Description", minWidth: 380, headerFilter: false,
        formatter: (cell) => cell.getValue() ?? "—" },
      { field: "formula", title: "Formula", minWidth: 260, headerFilter: false,
        formatter: (cell) => {
          const v = cell.getValue();
          return v ? `<code>${v}</code>` : "—";
        } },
    ],
  });

  document.getElementById("definitions-pagesize-top").appendChild(createPageSizeSelect(table, 50));

  let searchTerm = "";
  function matchesSearch(row) {
    if (!searchTerm) return true;
    const haystack = `${row.source} ${row.title} ${row.description ?? ""} ${row.formula ?? ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  }
  table.setFilter(matchesSearch);
  const searchBox = document.getElementById("definitions-search");
  searchBox.addEventListener("input", debounce(() => {
    searchTerm = searchBox.value.trim().toLowerCase();
    table.setFilter(matchesSearch);
  }, 200));

  document.getElementById("definitions-download-xlsx").addEventListener("click", () => {
    table.download("xlsx", "data-definitions.xlsx", { sheetName: "Definitions" });
  });

  table.on("dataFiltered", () => updateRowCount(table, "definitions-row-count", "definitions"));
  table.on("renderComplete", () => updateRowCount(table, "definitions-row-count", "definitions"));
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
function loadHiddenColumns(storageKey, defaultHidden) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return new Set(JSON.parse(raw));
    return new Set(defaultHidden || []);
  } catch {
    return new Set(defaultHidden || []);
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

  const hidden = loadHiddenColumns(ids.storageKey, ids.defaultHidden);

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

// ─────────────────────────────────────────────────────────────────────────────
// Cashflow tab — a single-property loan/rental cashflow model with a 30-year
// projection, plus a small localStorage-backed "portfolio" of saved
// scenarios. Standard principal & interest amortisation; rent and expenses
// held flat in nominal terms (not grown with inflation) — a deliberately
// conservative simplification, not a full inflation model. Once the loan
// balance reaches zero (only reachable if loan term < 30yr) that year's
// repayment is dropped from cashflow for the remainder of the projection.
// ─────────────────────────────────────────────────────────────────────────────
function computeCashflow(inputs) {
  const price = Math.max(0, inputs.price || 0);
  const loanTermYears = Math.max(1, inputs.loanTermYears || 30);
  const depositPct = inputs.depositPct ?? 20;
  const interestRatePct = inputs.interestRatePct ?? 6;
  const stampDutyPct = inputs.stampDutyPct ?? 5;
  const weeklyRent = Math.max(0, inputs.weeklyRent || 0);
  const vacancyPct = inputs.vacancyPct ?? 3;
  const mgmtPct = inputs.mgmtPct ?? 7;
  const otherExpensesAnnual = Math.max(0, inputs.otherExpensesAnnual || 0);
  const growthPct = inputs.growthPct ?? 4;

  const deposit = price * (depositPct / 100);
  const stampDuty = price * (stampDutyPct / 100);
  const loanAmount = Math.max(0, price - deposit);
  const upfrontCosts = deposit + stampDuty;

  const monthlyRate = (interestRatePct / 100) / 12;
  const numPayments = loanTermYears * 12;
  const monthlyRepayment = monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : loanAmount / numPayments;
  const annualLoanRepayment = monthlyRepayment * 12;
  const weeklyRepayment = annualLoanRepayment / 52;

  const grossAnnualRent = weeklyRent * 52 * (1 - vacancyPct / 100);
  const managementCost = grossAnnualRent * (mgmtPct / 100);
  const netAnnualCashflow = grossAnnualRent - managementCost - otherExpensesAnnual - annualLoanRepayment;
  const netWeeklyCashflow = netAnnualCashflow / 52;
  const cashOnCashReturnPct = upfrontCosts > 0 ? (netAnnualCashflow / upfrontCosts) * 100 : null;

  const projection = [];
  let loanBalance = loanAmount;
  let propertyValue = price;
  let cumulativeCashflow = 0;
  for (let year = 1; year <= 30; year++) {
    for (let m = 0; m < 12 && loanBalance > 0; m++) {
      const interestPortion = loanBalance * monthlyRate;
      const principalPortion = Math.min(loanBalance, monthlyRepayment - interestPortion);
      loanBalance = Math.max(0, loanBalance - principalPortion);
    }
    propertyValue *= 1 + growthPct / 100;
    const loanStillActive = loanBalance > 0;
    const annualCashflowThisYear = grossAnnualRent - managementCost - otherExpensesAnnual - (loanStillActive ? annualLoanRepayment : 0);
    cumulativeCashflow += annualCashflowThisYear;
    projection.push({
      year, propertyValue, loanBalance, equity: propertyValue - loanBalance,
      annualCashflow: annualCashflowThisYear, cumulativeCashflow,
    });
  }

  return {
    deposit, stampDuty, loanAmount, upfrontCosts, monthlyRepayment, weeklyRepayment,
    grossAnnualRent, managementCost, netAnnualCashflow, netWeeklyCashflow, cashOnCashReturnPct,
    projection,
  };
}

function cfMoney(value, decimals = 0) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function cfReadInputs() {
  return {
    price: Number(document.getElementById("cf-price").value),
    depositPct: Number(document.getElementById("cf-deposit-pct").value),
    interestRatePct: Number(document.getElementById("cf-interest-rate").value),
    loanTermYears: Number(document.getElementById("cf-loan-term").value),
    stampDutyPct: Number(document.getElementById("cf-stamp-duty-pct").value),
    weeklyRent: Number(document.getElementById("cf-weekly-rent").value),
    vacancyPct: Number(document.getElementById("cf-vacancy-pct").value),
    mgmtPct: Number(document.getElementById("cf-mgmt-pct").value),
    otherExpensesAnnual: Number(document.getElementById("cf-other-expenses").value),
    growthPct: Number(document.getElementById("cf-growth-pct").value),
  };
}

function cfRenderSummary(result) {
  const container = document.getElementById("cf-summary");
  const stat = (label, value, cls) => `
    <div class="cashflow-stat">
      <span class="cashflow-stat__label">${label}</span>
      <span class="cashflow-stat__value${cls ? ` ${cls}` : ""}">${value}</span>
    </div>
  `;
  const cashflowCls = result.netWeeklyCashflow >= 0 ? "is-positive" : "is-negative";
  container.innerHTML = [
    stat("Loan amount", cfMoney(result.loanAmount)),
    stat("Upfront cost (deposit + stamp duty)", cfMoney(result.upfrontCosts)),
    stat("Loan repayment /week", cfMoney(result.weeklyRepayment)),
    stat("Gross rent /year (after vacancy)", cfMoney(result.grossAnnualRent)),
    stat("Net cashflow /week", cfMoney(result.netWeeklyCashflow), cashflowCls),
    stat("Net cashflow /year", cfMoney(result.netAnnualCashflow), cashflowCls),
    stat("Cash-on-cash return", result.cashOnCashReturnPct == null ? "—" : `${result.cashOnCashReturnPct.toFixed(1)}%`),
    stat("Equity after 10yr", cfMoney(result.projection[9].equity)),
    stat("Equity after 30yr", cfMoney(result.projection[29].equity)),
  ].join("");
}

function cfRenderProjection(result) {
  const tbody = document.getElementById("cf-projection-body");
  tbody.innerHTML = result.projection.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${cfMoney(row.propertyValue)}</td>
      <td>${cfMoney(row.loanBalance)}</td>
      <td>${cfMoney(row.equity)}</td>
      <td>${cfMoney(row.annualCashflow)}</td>
      <td>${cfMoney(row.cumulativeCashflow)}</td>
    </tr>
  `).join("");
}

const CF_SCENARIOS_STORAGE_KEY = "propertyTool.cashflowScenarios.v1";

function cfLoadScenarios() {
  try {
    const raw = localStorage.getItem(CF_SCENARIOS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function cfSaveScenarios(list) {
  try {
    localStorage.setItem(CF_SCENARIOS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable — scenarios just won't persist
  }
}

function cfRenderScenarios(onLoad) {
  const container = document.getElementById("cf-scenarios-list");
  const scenarios = cfLoadScenarios();
  if (!scenarios.length) {
    container.innerHTML = '<p class="cashflow-scenarios-empty">No saved scenarios yet — set up a property above and click "Save scenario".</p>';
    return;
  }
  container.innerHTML = "";
  scenarios.forEach((s) => {
    const result = computeCashflow(s.inputs);
    const card = document.createElement("div");
    card.className = "cashflow-scenario-card";
    card.innerHTML = `
      <div>
        <div class="cashflow-scenario-card__name">${s.name}</div>
        <div class="cashflow-scenario-card__meta">
          ${cfMoney(s.inputs.price)} · net ${cfMoney(result.netWeeklyCashflow)}/wk ·
          ${result.cashOnCashReturnPct == null ? "—" : `${result.cashOnCashReturnPct.toFixed(1)}% cash-on-cash`}
        </div>
      </div>
      <div class="cashflow-scenario-card__actions">
        <button type="button" class="btn btn--secondary" data-action="load">Load</button>
        <button type="button" class="btn btn--ghost" data-action="delete">Delete</button>
      </div>
    `;
    card.querySelector('[data-action="load"]').addEventListener("click", () => onLoad(s.inputs));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      cfSaveScenarios(cfLoadScenarios().filter((x) => x.id !== s.id));
      cfRenderScenarios(onLoad);
    });
    container.appendChild(card);
  });
}

function buildCashflowTab() {
  const fields = [
    "cf-price", "cf-deposit-pct", "cf-interest-rate", "cf-loan-term", "cf-stamp-duty-pct",
    "cf-weekly-rent", "cf-vacancy-pct", "cf-mgmt-pct", "cf-other-expenses", "cf-growth-pct",
  ];

  function recompute() {
    const result = computeCashflow(cfReadInputs());
    cfRenderSummary(result);
    cfRenderProjection(result);
  }

  fields.forEach((id) => {
    document.getElementById(id).addEventListener("input", debounce(recompute, 200));
  });

  function loadInputs(inputs) {
    document.getElementById("cf-price").value = inputs.price;
    document.getElementById("cf-deposit-pct").value = inputs.depositPct;
    document.getElementById("cf-interest-rate").value = inputs.interestRatePct;
    document.getElementById("cf-loan-term").value = inputs.loanTermYears;
    document.getElementById("cf-stamp-duty-pct").value = inputs.stampDutyPct;
    document.getElementById("cf-weekly-rent").value = inputs.weeklyRent;
    document.getElementById("cf-vacancy-pct").value = inputs.vacancyPct;
    document.getElementById("cf-mgmt-pct").value = inputs.mgmtPct;
    document.getElementById("cf-other-expenses").value = inputs.otherExpensesAnnual;
    document.getElementById("cf-growth-pct").value = inputs.growthPct;
    recompute();
  }

  document.getElementById("cf-save-scenario").addEventListener("click", () => {
    const nameInput = document.getElementById("cf-scenario-name");
    const name = nameInput.value.trim() || `Scenario ${cfLoadScenarios().length + 1}`;
    const scenarios = cfLoadScenarios();
    scenarios.push({ id: `cf-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, name, inputs: cfReadInputs() });
    cfSaveScenarios(scenarios);
    nameInput.value = "";
    cfRenderScenarios(loadInputs);
  });

  recompute();
  cfRenderScenarios(loadInputs);
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

  payload.rows.forEach((row) => {
    row.area = formatArea(row.suburb, row.state, row.postcode);
  });
  const dataTableColumnsCfg = mergeIdentityColumns(payload.columns);

  const table = new Tabulator("#property-table", {
    data: payload.rows,
    columns: buildGroupedColumns(dataTableColumnsCfg),
    layout: "fitDataFill",
    columnDefaults: { headerWordWrap: true, minWidth: 110 },
    height: "calc(100vh - 300px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    placeholder: "No matching properties",
  });

  document.getElementById("datatable-pagesize-top").appendChild(createPageSizeSelect(table, 50));

  table.on("tableBuilt", () => {
    buildFilterControls(payload.rows, table);
    createColumnPanel(table, dataTableColumnsCfg, {
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

  document.getElementById("datatable-download-xlsx").addEventListener("click", () => {
    table.download("xlsx", "properties.xlsx", { sheetName: "Properties" });
  });

  const subdivisionTable = buildSubdivisionTab(payload);
  const suburbFinderTable = buildSuburbFinderTab(payload);
  buildCashflowTab();
  buildDefinitionsTab(payload);
  setupTabs({ datatable: table, subdivision: subdivisionTable, suburbfinder: suburbFinderTable });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("site-meta").textContent =
    "Failed to load property data — see console for details.";
});
