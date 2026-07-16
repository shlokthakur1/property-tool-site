// Multi-select checkbox filters (with an in-panel search box for high-cardinality fields).
const MULTI_FIELDS = [
  { field: "status", label: "Status" },
  { field: "state", label: "State" },
  { field: "property_type", label: "Type" },
  { field: "suburb", label: "Suburb" },
  { field: "postcode", label: "Postcode" },
  { field: "zone", label: "Zone" },
];

// Plain contains-text filters for free-form fields (not a good fit for checkboxes).
const TEXT_FIELDS = [
  { field: "price", label: "Price" },
  { field: "land_size_m2", label: "Land (m²)" },
];

const filterState = {
  search: "",
  multi: {},
  text: {},
};
MULTI_FIELDS.forEach((f) => (filterState.multi[f.field] = new Set()));
TEXT_FIELDS.forEach((f) => (filterState.text[f.field] = ""));

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

  for (const { field } of TEXT_FIELDS) {
    const term2 = filterState.text[field];
    if (term2 && !String(row[field] ?? "").toLowerCase().includes(term2)) {
      return false;
    }
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

function createTextFilter(field, label, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "textfilter";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = label;
  input.className = "textfilter__input";
  input.addEventListener(
    "input",
    debounce(() => {
      filterState.text[field] = input.value.trim().toLowerCase();
      onChange();
    }, 200)
  );

  wrapper.appendChild(input);
  return { wrapper, input };
}

function buildFilterControls(rows, table) {
  const container = document.getElementById("filters");
  const applyFilters = () => table.setFilter(rowMatchesFilters);

  const textInputs = [];
  const multiSelectRefreshers = [];

  MULTI_FIELDS.forEach(({ field, label }) => {
    const options = distinctValues(rows, field);
    const { wrapper, refresh } = createMultiSelect(field, label, options, filterState.multi[field], applyFilters);
    multiSelectRefreshers.push(refresh);
    container.appendChild(wrapper);
  });

  TEXT_FIELDS.forEach(({ field, label }) => {
    const { wrapper, input } = createTextFilter(field, label, applyFilters);
    textInputs.push(input);
    container.appendChild(wrapper);
  });

  document.addEventListener("click", () => closeAllPanels());

  document.getElementById("clear-filters").addEventListener("click", () => {
    filterState.search = "";
    document.getElementById("search-box").value = "";
    MULTI_FIELDS.forEach(({ field }) => filterState.multi[field].clear());
    TEXT_FIELDS.forEach(({ field }) => (filterState.text[field] = ""));
    textInputs.forEach((input) => (input.value = ""));
    multiSelectRefreshers.forEach((refresh) => refresh());
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
// Subdivision tab — same data source, but filtered to blocks big enough to
// split (see build_site.py add_subdivision_fields), plus a live profit
// estimate: revenue comes from real vacant-land comps baked into the data at
// build time, cost/stamp-duty are whatever the user dials in here, so the
// estimate recomputes instantly without rebuilding the site.
// ─────────────────────────────────────────────────────────────────────────────
const SUBDIVISION_MULTI_FIELDS = [
  { field: "status", label: "Status" },
  { field: "state", label: "State" },
];

const SUBDIVISION_RANGE_FIELDS = [
  { field: "land_size_m2", label: "Land (m²)" },
  { field: "price", label: "Price" },
];

const subdivisionFilterState = { multi: {}, range: {} };
SUBDIVISION_MULTI_FIELDS.forEach((f) => (subdivisionFilterState.multi[f.field] = new Set()));
SUBDIVISION_RANGE_FIELDS.forEach((f) => (subdivisionFilterState.range[f.field] = { min: null, max: null }));

const subdivisionParams = { costPerLot: 0, stampDutyBufferPct: 0 };

function estimateProfit(row) {
  const lots = row.subdivision_lots_possible;
  const totalRevenue = row.subdivision_est_total_revenue;
  if (lots == null || totalRevenue == null || row.price == null) return null;
  const subdivisionCost = subdivisionParams.costPerLot * lots;
  const stampDuty = row.price * (subdivisionParams.stampDutyBufferPct / 100);
  const totalCost = row.price + subdivisionCost + stampDuty;
  return totalRevenue - totalCost;
}

function subdivisionRowMatchesFilters(row) {
  for (const { field } of SUBDIVISION_MULTI_FIELDS) {
    const selected = subdivisionFilterState.multi[field];
    if (selected.size > 0 && !selected.has(String(row[field] ?? ""))) return false;
  }
  for (const { field } of SUBDIVISION_RANGE_FIELDS) {
    const { min, max } = subdivisionFilterState.range[field];
    const value = row[field];
    if (min != null && (value == null || value < min)) return false;
    if (max != null && (value == null || value > max)) return false;
  }
  return true;
}

function extendSubdivisionColumn(col) {
  const numberFields = [
    "subdivision_min_lot_m2",
    "subdivision_lots_possible",
    "subdivision_lot_size_m2",
    "subdivision_comp_count",
  ];
  if (numberFields.includes(col.field)) {
    return { ...col, sorter: "number" };
  }
  if (col.field === "subdivision_comp_price_per_m2") {
    return {
      ...col,
      sorter: "number",
      formatter: (cell) => {
        const value = cell.getValue();
        return value == null ? "" : `$${Math.round(value).toLocaleString()}/m²`;
      },
    };
  }
  if (col.field === "subdivision_est_revenue_per_lot" || col.field === "subdivision_est_total_revenue") {
    return {
      ...col,
      sorter: "number",
      formatter: (cell) => {
        const value = cell.getValue();
        return value == null ? "" : `$${Math.round(value).toLocaleString()}`;
      },
    };
  }
  return col;
}

function buildSubdivisionColumns(columnsCfg) {
  const columns = buildColumns(columnsCfg).map(extendSubdivisionColumn);
  columns.push({
    field: "_estimated_profit",
    title: "Est. Profit",
    sorter: (a, b, aRow, bRow) => {
      const av = estimateProfit(aRow.getData());
      const bv = estimateProfit(bRow.getData());
      if (av == null && bv == null) return 0;
      if (av == null) return -1;
      if (bv == null) return 1;
      return av - bv;
    },
    formatter: (cell) => {
      const value = estimateProfit(cell.getRow().getData());
      if (value == null) return "—";
      const cls = value > 0 ? "profit-positive" : "profit-negative";
      const sign = value > 0 ? "+" : "";
      return `<span class="${cls}">${sign}$${Math.round(value).toLocaleString()}</span>`;
    },
  });
  return columns;
}

function buildSubdivisionFilterControls(rows, table) {
  const container = document.getElementById("subdivision-filters");
  const applyFilters = () => table.setFilter(subdivisionRowMatchesFilters);

  const multiSelectRefreshers = [];
  const rangeResetters = [];

  SUBDIVISION_MULTI_FIELDS.forEach(({ field, label }) => {
    const options = distinctValues(rows, field);
    const { wrapper, refresh } = createMultiSelect(
      field, label, options, subdivisionFilterState.multi[field], applyFilters
    );
    multiSelectRefreshers.push(refresh);
    container.appendChild(wrapper);
  });

  SUBDIVISION_RANGE_FIELDS.forEach(({ field, label }) => {
    const { wrapper, reset } = createRangeFilter(label, (min, max) => {
      subdivisionFilterState.range[field] = { min, max };
      applyFilters();
    });
    rangeResetters.push(reset);
    container.appendChild(wrapper);
  });

  document.getElementById("subdivision-clear-filters").addEventListener("click", () => {
    SUBDIVISION_MULTI_FIELDS.forEach(({ field }) => subdivisionFilterState.multi[field].clear());
    SUBDIVISION_RANGE_FIELDS.forEach(({ field }) => (subdivisionFilterState.range[field] = { min: null, max: null }));
    multiSelectRefreshers.forEach((refresh) => refresh());
    rangeResetters.forEach((reset) => reset());
    applyFilters();
  });
}

function buildSubdivisionParamControls(defaults, table) {
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
    table.redraw(true);
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

  const table = new Tabulator("#subdivision-table", {
    data: sub.rows,
    columns: buildSubdivisionColumns(sub.columns),
    layout: "fitDataFill",
    height: "calc(100vh - 280px)",
    pagination: true,
    paginationMode: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250, 500],
    initialSort: [{ column: "_estimated_profit", dir: "desc" }],
    placeholder: "No matching subdivision candidates",
  });

  table.on("tableBuilt", () => {
    buildSubdivisionFilterControls(sub.rows, table);
    buildSubdivisionParamControls(sub, table);
  });
  table.on("dataFiltered", () => updateRowCount(table, "subdivision-row-count", "candidates"));
  table.on("renderComplete", () => updateRowCount(table, "subdivision-row-count", "candidates"));

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

async function main() {
  const res = await fetch("data/properties.json", { cache: "no-store" });
  const payload = await res.json();

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
