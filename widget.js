// Player Statistics Widget – stable init, working sorting

let table = null;
let activeTeamId = null;

let playersByTeam = {};
let teams = [];
let domReady = false;
let pendingPayload = null;
let initReceived = false;

const SAMPLE_PAYLOAD = {
  teams: [{ id: "Terrain1Eq1", name: "CHAKS" }],
  playersByTeam: {
    Terrain1Eq1: [
      { nom: "Alex Johnson", numero: "9",  but: 12, passes: 3,  jaune: 0, rouge: 1, photo: "", playerUrl: "#" },
      { nom: "John Doe",     numero: "10", but: 8,  passes: 5,  jaune: 1, rouge: 0, photo: "", playerUrl: "#" },
      { nom: "Mike Smith",   numero: "7",  but: 6,  passes: 8,  jaune: 2, rouge: 0, photo: "", playerUrl: "#" },
      { nom: "Chris Wilson", numero: "4",  but: 2,  passes: 12, jaune: 3, rouge: 0, photo: "", playerUrl: "#" },
      { nom: "David Brown",  numero: "1",  but: 0,  passes: 1,  jaune: 1, rouge: 0, photo: "", playerUrl: "#" }
    ]
  }
};

window.addEventListener("message", onMessageFromHost);

document.addEventListener("DOMContentLoaded", () => {
  domReady = true;

  if (pendingPayload) {
    processInitPayload(pendingPayload);
    pendingPayload = null;
  }

  setTimeout(() => {
    if (!initReceived && Object.keys(playersByTeam).length === 0) {
      processInitPayload(SAMPLE_PAYLOAD);
    }
  }, 250);
});

function onMessageFromHost(event) {
  const { type, payload } = event.data || {};
  if (!type) return;

  if (type === "INIT_WIDGET") {
    initReceived = true;
    if (!domReady) { pendingPayload = payload; return; }
    processInitPayload(payload);
  }

  if (type === "UPDATE_TABLE") {
    if (payload?.teamId && Array.isArray(payload.players)) {
      playersByTeam[payload.teamId] = payload.players;
      if (activeTeamId === payload.teamId && table) {
        table.replaceData(getSortedRows(activeTeamId)); // safe after build
      }
    }
  }
}

function processInitPayload(payload) {
  teams = payload.teams || [];
  playersByTeam = payload.playersByTeam || fallbackShape(payload);

  const items = teams.length ? teams : keysToTeams(playersByTeam);
  if (!items.length) return;

  activeTeamId = items[0].id;

  // ✅ Build ONCE with initial data in constructor (no setData before tableBuilt)
  initTable(getSortedRows(activeTeamId));
}

function fallbackShape(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(k => { if (Array.isArray(obj[k])) out[k] = obj[k]; });
  return out;
}
function keysToTeams(obj) { return Object.keys(obj).map(id => ({ id, name: id })); }

function getSortedRows(teamId){
  const rows = (playersByTeam[teamId] || []).map(x => ({ ...x }));
  rows.sort((a, b) => {
    const aGoals = toNum(a.but), bGoals = toNum(b.but);
    const aAss = toNum(a.passes), bAss = toNum(b.passes);
    if (bGoals !== aGoals) return bGoals - aGoals;
    if (bAss   !== aAss)   return bAss   - aAss;
    return String(a.nom || "").localeCompare(String(b.nom || ""));
  });
  return rows;
}

function getLayout(){
  // Mirror your stable widget: desktop fills, small screens keep natural width
  return window.matchMedia("(min-width: 900px)").matches ? "fitColumns" : "fitData";
}

function initTable(initialData){
  table = new Tabulator("#playersTable", {
    data: initialData,
    layout: getLayout(),
    index: "nom",
    reactiveData: false,
    height: "auto",
    selectable: 0,
    responsiveLayout: false,
    headerSort: true,
    columnDefaults: {
      headerSort: true,
      resizable: false,
      headerHozAlign: "center",
      hozAlign: "center",
      widthGrow: 0,                // match stable widget defaults
    },
    columns: setColumns(),
  });

  table.on("tableBuilt", () => {
    // Attach observers only AFTER build to avoid early redraws
    const onResize = () => {
      try {
        const next = getLayout();
        if (table) {
          table.setOptions({ layout: next });
          table.redraw(true);
        }
      } catch {}
    };
    window.addEventListener("resize", debounce(onResize, 120), { passive: true });

    try {
      new ResizeObserver(() => { try { table.redraw(true); } catch {} })
        .observe(document.querySelector("#playersTable"));
    } catch {}
  });
}

function setColumns(){
  return [
    {
      title: "Joueur", field: "nom", minWidth: 145, widthGrow: 1,
      hozAlign: "left", headerHozAlign: "left", frozen: false,
      sorter: "string",
      formatter: (cell) => {
        const playerName = cell.getValue() || "";
        const data   = cell.getRow().getData();
        const url    = data?.playerUrl || data?.dPLink;
        const photo  = data?.photo || "";
        const numero = data?.numero || "";

        const safePlayerName = escapeHtml(playerName);
        const safePhoto = escapeAttr(photo);
        const safeUrl = escapeAttr(url);

        // Wrapper + image (or initials fallback)
        const initials = safePlayerName.substring(0,2).toUpperCase();

        const photoHtml = photo
            ? `<div class="player-photo-wrap" title="Cliquez pour agrandir">
                <img src="${safePhoto}" alt="${safePlayerName}" class="player-photo"
                    onerror="this.style.display='none'">
            </div>`
            : `<div class="player-photo-wrap initials" title="${safePlayerName}">${initials}</div>`;

        const numeroHtml = numero ? `<span class="jersey-number">#${escapeHtml(numero)}</span>` : '';

        const content = `${photoHtml}
            <div>
            <div>${safePlayerName}</div>
            ${numeroHtml}
            </div>`;

        return url
            ? `<div class="player-link" data-href="${safeUrl}">${content}</div>`
            : `<div class="player-text">${content}</div>`;
    },
      cellClick: (e, cell) => {
        const data = cell.getRow().getData();
        const url = data?.playerUrl || data?.dPLink;
        if (url) {
          window.parent?.postMessage({
            type: "PLAYER_CLICK",
            payload: { teamId: activeTeamId, playerName: data.nom || data.title, url }
          }, "*");
        }
      }
    },
    { title: "Buts",   field: "but",   sorter: "number", width: 88, headerSortStartingDir: "desc",
      formatter: (c) => `<div class="stats-cell">${toNum(c.getValue())}</div>` },
    { title: "Passes", field: "passes",sorter: "number", width: 96,
      formatter: (c) => `<div class="stats-cell">${toNum(c.getValue())}</div>` },
    { title: "Jaunes", field: "jaune", sorter: "number", width: 96,
      formatter: (c) => { const v = toNum(c.getValue()); return `<div class="stats-cell" style="color:${v>0?'#f59e0b':'inherit'}">${v}</div>`; } },
    { title: "Rouges", field: "rouge", sorter: "number", width: 96,
      formatter: (c) => { const v = toNum(c.getValue()); return `<div class="stats-cell" style="color:${v>0?'#ef4444':'inherit'}">${v}</div>`; } },
    { title: "Commentaires", field: "commentaires", sorter: "string",
      minWidth: 200, widthGrow: 1, hozAlign: "left", headerHozAlign: "left",
      formatter: (c) => { const t = c.getValue() ?? ""; return `<div class="comments-cell" title="${escapeAttr(t)}">${escapeHtml(String(t))}</div>`; } },
  ];
}

function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
