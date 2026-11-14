/* Opportunity Radar: read-only timeline over dashboard.json, grouped by deadline window. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const FUNDING = { fully_funded: "Fully funded", bursary_available: "Bursary", fee_waiver_only: "Fee waiver" };
  const GROUPS = [
    { key: "week", title: "Due within 7 days", cls: "red", test: (d) => d != null && d <= 7 },
    { key: "fortnight", title: "Next 2 weeks", cls: "amber", test: (d) => d != null && d <= 14 },
    { key: "month", title: "This month", cls: "blue", test: (d) => d != null && d <= 30 },
    { key: "later", title: "Later", cls: "", test: (d) => d != null },
    { key: "none", title: "No fixed date, recurring", cls: "", test: () => true },
  ];
  const PAGE = 25;
  const state = { data: null, q: "", type: "", funding: "", source: "", tag: "", field: true, expanded: {} };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const daysLeft = (o) => o.deadline ? Math.round((new Date(o.deadline) - new Date(state.data.today)) / DAY) : null;
  const win = (d) => d == null ? "" : d <= 3 ? "w3" : d <= 14 ? "w14" : d <= 30 ? "w30" : d <= 60 ? "w60" : "";
  const countdown = (d) => d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
  const tags = (o) => (o.niche_tags || "").split(",").filter(Boolean);
  const label = (s) => String(s || "").replace(/_/g, " ");
  const trackCmd = (o) => `uv run engine track ${o.id} --status shortlisted`;
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return state.data.opportunities.filter((o) =>
      (!state.field || tags(o).length || o.funding_status === "fully_funded") &&
      (!state.type || o.type === state.type) && (!state.funding || o.funding_status === state.funding) &&
      (!state.source || o.source === state.source) && (!state.tag || tags(o).includes(state.tag)) &&
      (!q || `${o.name} ${o.host} ${o.niche_tags} ${o.source}`.toLowerCase().includes(q)));
  }

  function item(o) {
    const d = daysLeft(o);
    const chips = [`<span class="chip ${esc(o.funding_status)}">${FUNDING[o.funding_status] || esc(label(o.funding_status))}</span>`]
      .concat(o.status !== "new" ? [`<span class="chip status ${esc(o.status)}">${esc(o.status)}</span>`] : [])
      .concat(tags(o).slice(0, 3).map((t) => `<span class="chip">${esc(t)}</span>`));
    const right = o.deadline
      ? `<div class="due">${countdown(d)}</div><div class="on">${fmtDate(o.deadline)}</div>`
      : `<div class="due none">${/Usually due in/.test(o.eligibility_notes || "") ? "" : ""}${o.start_date ? "Starts " + fmtDate(o.start_date) : "No date"}</div><div class="on">${esc(label(o.type))}</div>`;
    return `<button class="item ${win(d)}" type="button" data-id="${esc(o.id)}">
      <span class="bar" aria-hidden="true"></span>
      <div class="main"><p class="name">${esc(o.name)}</p><div class="meta"><span class="host">${esc(o.host)}</span>${chips.join("")}</div></div>
      <div class="right">${right}</div>
    </button>`;
  }

  function render() {
    const rows = filtered().sort((a, b) => (a.deadline || "9999") < (b.deadline || "9999") ? -1 : (a.deadline || "9999") > (b.deadline || "9999") ? 1 : b.score - a.score);
    const buckets = GROUPS.map(() => []);
    for (const o of rows) { const d = daysLeft(o); buckets[GROUPS.findIndex((g) => g.test(d))].push(o); }
    if (buckets[4].length) buckets[4].sort((a, b) => b.score - a.score);
    $("groups").innerHTML = rows.length ? GROUPS.map((g, i) => {
      const list = buckets[i]; if (!list.length) return "";
      const shown = state.expanded[g.key] ? list : list.slice(0, PAGE);
      const more = list.length > shown.length ? `<button class="more" type="button" data-more="${g.key}">Show all ${list.length}</button>` : "";
      return `<section class="group"><div class="group-head ${g.cls}"><h2>${g.title}</h2><span class="n">${list.length}</span></div><div class="group-list">${shown.map(item).join("")}${more}</div></section>`;
    }).join("") : `<p class="empty">No opportunities match these filters.</p>`;
    $("count").textContent = `${rows.length} of ${state.data.opportunities.length}`;
    $("clear").hidden = !(state.type || state.funding || state.source || state.tag || state.q);
    for (const [id, key] of [["f-type", "type"], ["f-funding", "funding"], ["f-source", "source"], ["f-tag", "tag"]]) $(id).classList.toggle("active", !!state[key]);
  }

  function fillSelect(id, values, text) {
    const sel = $(id); const cur = sel.value;
    sel.innerHTML = `<option value="">${text}</option>` + [...values].sort().map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join("");
    sel.value = cur;
  }

  function openSheet(id) {
    const o = state.data.opportunities.find((x) => x.id === id); if (!o) return;
    const d = daysLeft(o);
    $("sheet-title").textContent = o.name;
    $("sheet-chips").innerHTML = (o.deadline ? `<span class="chip ${win(d)}">${countdown(d)}</span>` : "") +
      `<span class="chip ${esc(o.funding_status)}">${FUNDING[o.funding_status] || esc(label(o.funding_status))}</span>` + tags(o).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
    const meta = [["Funding evidence", o.funding_evidence ? `\u201c${o.funding_evidence}\u201d` : "not recorded"], ["Deadline", o.deadline && fmtDate(o.deadline)], ["Dates", [o.start_date, o.end_date].filter(Boolean).map(fmtDate).join(" to ")], ["Type", label(o.type)], ["Host", o.host],
      ["Location", o.location], ["Covers", [o.covers_travel && "travel", o.covers_accommodation && "accommodation"].filter(Boolean).join(", ")],
      ["Eligibility", o.eligibility_notes], ["Source", o.source], ["First seen", fmtDate(o.first_seen)], ["Status", o.status], ["Score", Number(o.score).toFixed(2)], ["ID", o.id]];
    $("sheet-dl").innerHTML = meta.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd${k === "ID" ? ' class="mono"' : ""}>${esc(v)}</dd>`).join("");
    $("sheet-open").href = o.url;
    $("sheet-copy").onclick = () => navigator.clipboard?.writeText(trackCmd(o)).then(() => snack("Command copied"));
    $("sheet").hidden = false; $("scrim").hidden = false; $("sheet-close").focus();
    history.replaceState(null, "", `#${o.id}`);
  }
  function closeSheet() { $("sheet").hidden = true; $("scrim").hidden = true; history.replaceState(null, "", location.pathname); }

  let snackTimer;
  function snack(msg) { const s = $("snackbar"); s.textContent = msg; s.hidden = false; clearTimeout(snackTimer); snackTimer = setTimeout(() => (s.hidden = true), 2500); }

  function renderStatic(data) {
    const all = data.opportunities;
    $("today").textContent = new Date(data.today).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    $("s-open").textContent = all.length;
    $("s-week").textContent = all.filter((o) => { const d = daysLeft(o); return d != null && d <= 7; }).length;
    $("s-full").textContent = all.filter((o) => o.funding_status === "fully_funded").length;
    $("s-quota").textContent = `${data.quota.applied}/${data.quota.target}`;
    $("briefing-text").textContent = data.briefing.replace(/^Opportunity briefing.*\n+/, "");
    const q = data.quota; $("quota-bar").setAttribute("aria-valuemax", q.target); $("quota-bar").setAttribute("aria-valuenow", q.applied);
    $("quota-bar").firstElementChild.style.width = `${Math.min(100, (q.applied / q.target) * 100)}%`;
    $("quota-text").textContent = `${q.applied} of ${q.target} applied`;
    const ok = data.sources.filter((s) => s.ok && s.n_items > 0).length;
    $("sources-title").textContent = `Sources (${ok} of ${data.sources.length} returned today)`;
    $("sources").innerHTML = data.sources.map((s) => { const bad = !s.ok || !s.n_items; return `<li class="${bad ? "bad" : ""}" title="${esc(s.error || "")}"><i></i><span>${esc(s.source)}</span></li>`; }).join("");
    $("generated").textContent = `Data generated ${data.generated_at.replace("T", " ").slice(0, 16)} UTC`;
    fillSelect("f-type", new Set(all.map((o) => o.type)), "Type"); fillSelect("f-funding", new Set(all.map((o) => o.funding_status)), "Funding");
    fillSelect("f-source", new Set(all.map((o) => o.source)), "Source"); fillSelect("f-tag", new Set(all.flatMap(tags)), "Tag");
  }

  function bind() {
    $("q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
    for (const [id, key] of [["f-type", "type"], ["f-funding", "funding"], ["f-source", "source"], ["f-tag", "tag"]])
      $(id).addEventListener("change", (e) => { state[key] = e.target.value; render(); });
    $("f-field").addEventListener("change", (e) => { state.field = e.target.checked; render(); });
    $("clear").onclick = () => { Object.assign(state, { q: "", type: "", funding: "", source: "", tag: "" }); $("q").value = ""; for (const id of ["f-type", "f-funding", "f-source", "f-tag"]) $(id).value = ""; render(); };
    $("groups").addEventListener("click", (e) => { const m = e.target.closest("[data-more]"); if (m) { state.expanded[m.dataset.more] = true; render(); return; } const b = e.target.closest(".item"); if (b) openSheet(b.dataset.id); });
    $("sheet-close").onclick = closeSheet; $("scrim").onclick = closeSheet;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("sheet").hidden) closeSheet(); $("menu").hidden = true; $("menu-btn").setAttribute("aria-expanded", "false"); } });
    $("menu-btn").onclick = () => { const open = $("menu").hidden; $("menu").hidden = !open; $("menu-btn").setAttribute("aria-expanded", String(open)); };
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu-wrap")) { $("menu").hidden = true; $("menu-btn").setAttribute("aria-expanded", "false"); } });
    $("menu-status").onclick = () => { $("menu").hidden = true; $("status-dialog").showModal(); };
    $("menu-brief").onclick = () => { $("menu").hidden = true; $("brief-dialog").showModal(); };
  }

  async function init() {
    bind();
    try {
      const res = await fetch("dashboard.json", { cache: "no-store" }); if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (e) { $("groups").innerHTML = `<p class="empty">Could not load dashboard.json (${esc(e.message)}).</p>`; return; }
    renderStatic(state.data); render();
    if (location.hash.length > 1) openSheet(location.hash.slice(1));
  }
  init();
})();
