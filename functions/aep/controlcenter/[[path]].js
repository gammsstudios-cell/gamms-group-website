export function onRequestGet() {
  const html = `<!doctype html>
<html lang="es" data-theme="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>GAMMS AEP Control Center · By GAMMS GROUP</title>
  <style>
    :root {
      --bg-page: #F5F5F7;
      --bg-surface: #FFFFFF;
      --bg-sidebar: #1D1D1F;
      --text-main: #1D1D1F;
      --text-muted: #6E6E73;
      --text-sidebar: #F5F5F7;
      --accent: #007AFF;
      --accent-hover: #0062CC;
      --border-color: #E5E5EA;
      --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      --badge-green-bg: #E8F8EE;
      --badge-green-text: #0A7A2F;
      --badge-amber-bg: #FFF8E6;
      --badge-amber-text: #B46D00;
      --badge-red-bg: #FEE4E2;
      --badge-red-text: #B42318;
      --sidebar-width: 260px;
    }

    [data-theme="dark"] {
      --bg-page: #121214;
      --bg-surface: #1C1C1E;
      --bg-sidebar: #0A0A0C;
      --text-main: #F5F5F7;
      --text-muted: #8E8E93;
      --text-sidebar: #F5F5F7;
      --accent: #0A84FF;
      --accent-hover: #409CFF;
      --border-color: #2C2C2E;
      --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      --badge-green-bg: #0A3A19;
      --badge-green-text: #34C759;
      --badge-amber-bg: #3D2900;
      --badge-amber-text: #FFD60A;
      --badge-red-bg: #3D0A0A;
      --badge-red-text: #FF453A;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg-page); color: var(--text-main); min-height: 100vh; display: flex; overflow-x: hidden; }

    /* Layout */
    #app { display: flex; width: 100%; min-height: 100vh; }
    
    /* Sidebar */
    .sidebar { width: var(--sidebar-width); background: var(--bg-sidebar); color: var(--text-sidebar); display: flex; flex-direction: column; flex-shrink: 0; transition: transform 0.3s ease; position: fixed; top: 0; bottom: 0; left: 0; z-index: 100; }
    .sidebar-header { padding: 24px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .brand-title { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
    .brand-subtitle { font-size: 11px; text-transform: uppercase; color: #8E8E93; font-weight: 600; margin-top: 2px; letter-spacing: 1px; }
    .gamms-byline { font-size: 11px; color: #86868b; margin-top: 4px; }
    .gamms-byline strong { color: #f5f5f7; font-weight: 700; }

    .nav-menu { flex: 1; padding: 16px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: #A1A1A6; text-decoration: none; border-radius: 10px; font-size: 13.5px; font-weight: 600; transition: all 0.2s ease; cursor: pointer; }
    .nav-item:hover, .nav-item.active { color: #FFFFFF; background: rgba(255,255,255,0.1); }
    .nav-item.active { background: var(--accent); color: #FFFFFF; }
    .nav-item svg { width: 18px; height: 18px; stroke-width: 2.2; flex-shrink: 0; }

    .sidebar-footer { padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11.5px; color: #8E8E93; text-align: center; line-height: 1.4; }

    /* Main Container */
    .main-wrapper { flex: 1; margin-left: var(--sidebar-width); display: flex; flex-direction: column; min-width: 0; transition: margin 0.3s ease; }
    
    /* Top Header */
    .top-header { height: 68px; background: var(--bg-surface); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 28px; position: sticky; top: 0; z-index: 90; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .mobile-menu-btn { display: none; background: none; border: none; color: var(--text-main); cursor: pointer; padding: 8px; }
    .header-title { font-size: 18px; font-weight: 700; }

    .header-right { display: flex; align-items: center; gap: 16px; }
    .user-profile-tag { font-size: 13px; font-weight: 600; color: var(--text-muted); background: var(--bg-page); padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border-color); }
    .event-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; background: var(--badge-green-bg); color: var(--badge-green-text); }
    .event-badge .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.8s infinite; }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }

    .theme-toggle { background: var(--bg-page); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 10px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
    .btn-logout { background: transparent; border: 1px solid var(--border-color); color: var(--text-main); border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-logout:hover { background: var(--badge-red-bg); color: var(--badge-red-text); border-color: transparent; }

    /* Page Content Area */
    .content-area { padding: 28px; flex: 1; max-width: 1400px; margin: 0 auto; width: 100%; }

    /* Components & Cards */
    .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 28px; }
    .stat-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 22px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; justify-content: space-between; }
    .stat-header { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 12.5px; font-weight: 700; letter-spacing: 0.5px; }
    .stat-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(0, 122, 255, 0.1); color: var(--accent); display: flex; align-items: center; justify-content: center; }
    .stat-value { font-size: 28px; font-weight: 800; margin-top: 14px; letter-spacing: -0.5px; }
    .stat-sub { font-size: 12px; color: var(--text-muted); margin-top: 6px; font-weight: 500; }

    .card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: var(--card-shadow); margin-bottom: 24px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .card-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }

    .alert-banner { padding: 16px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; }
    .alert-banner.warning { background: var(--badge-amber-bg); color: var(--badge-amber-text); border: 1px solid rgba(180, 109, 0, 0.3); }

    /* Tables */
    .table-container { overflow-x: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; text-align: left; }
    th { padding: 12px 16px; color: var(--text-muted); font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-color); }
    td { padding: 14px 16px; border-bottom: 1px solid var(--border-color); color: var(--text-main); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(0,0,0,0.015); }

    /* Forms & Controls */
    .form-group { margin-bottom: 18px; }
    .form-label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; color: var(--text-main); }
    .form-control { width: 100%; padding: 11px 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-surface); color: var(--text-main); font-size: 14px; transition: border-color 0.2s; }
    .form-control:focus { outline: none; border-color: var(--accent); }
    .input-search { width: 280px; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-surface); color: var(--text-main); font-size: 13.5px; }

    /* Buttons */
    .btn-primary { background: var(--accent); color: #FFFFFF; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--bg-page); color: var(--text-main); border: 1px solid var(--border-color); padding: 9px 16px; border-radius: 10px; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .btn-secondary:hover { background: var(--border-color); }
    .btn-danger { background: var(--badge-red-bg); color: var(--badge-red-text); border: none; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 12.5px; cursor: pointer; }

    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.2px; }
    .badge-success { background: var(--badge-green-bg); color: var(--badge-green-text); }
    .badge-warning { background: var(--badge-amber-bg); color: var(--badge-amber-text); }
    .badge-danger { background: var(--badge-red-bg); color: var(--badge-red-text); }
    .badge-neutral { background: var(--bg-page); color: var(--text-muted); border: 1px solid var(--border-color); }

    /* Print Center Physical Mapping CSS */
    #printable-labels { display: none !important; }
    .print-sheet-frame { width: 8.5in; height: 11in; transform: scale(var(--preview-scale, 1)); position: relative; background: #fff; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 4px; overflow: hidden; }
    .print-slot { position: absolute; border: 1px dashed #ccc; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; text-align: center; }
    .print-slot .qr-label-card svg { position: absolute; left: 0.04in; top: 0.14in; width: 0.72in; height: 0.72in; shape-rendering: crispEdges; }


    /* Modal */
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; backdrop-filter: blur(4px); }
    .modal-overlay.open { opacity: 1; pointer-events: auto; }
    .modal-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 18px; width: min(90%, 540px); max-height: 85vh; overflow-y: auto; padding: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); transform: translateY(20px); transition: transform 0.25s ease; }
    .modal-overlay.open .modal-card { transform: translateY(0); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .modal-close { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; }

    /* Toast */
    .toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 300; display: flex; flex-direction: column; gap: 8px; }
    .toast { background: var(--bg-sidebar); color: var(--text-sidebar); padding: 12px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.2); animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 900px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.mobile-open { transform: translateX(0); }
      .main-wrapper { margin-left: 0; }
      .mobile-menu-btn { display: block; }
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="brand-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          GAMMS AEP
        </div>
        <div class="brand-subtitle">Control Center</div>
        <div class="gamms-byline">By <strong>GAMMS GROUP</strong></div>
      </div>
      <nav class="nav-menu" id="navMenu"></nav>
      <div class="sidebar-footer">
        GAMMS AEP<br>
        By <strong>GAMMS GROUP</strong><br>
        © 2026
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="main-wrapper">
      <header class="top-header">
        <div class="header-left">
          <button class="mobile-menu-btn" id="mobileMenuToggle">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <div class="header-title" id="pageTitle">Overview</div>
        </div>
        <div class="header-right">
          <div class="user-profile-tag" id="userProfileTag" hidden></div>
          <div class="event-badge" id="eventStatusBadge">
            <span class="pulse-dot"></span> <span id="eventStatusText">EVENTO ACTIVO</span>
          </div>
          <button class="theme-toggle" id="themeToggle" title="Cambiar Tema">🌙</button>
          <button class="btn-logout" id="logoutBtn" hidden>Salir</button>
        </div>
      </header>

      <main class="content-area" id="contentArea">
        <div class="card"><div style="height: 120px;">Cargando sistema...</div></div>
      </main>
    </div>
  </div>

  <div class="modal-overlay" id="modalOverlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="card-title" id="modalTitle">Modal</h3>
        <button class="modal-close" id="modalClose">✕</button>
      </div>
      <div id="modalBody"></div>
    </div>
  </div>

  <div class="toast-container" id="toast-container"></div>

  <script>
    const API_BASE = "/aep/api";
    let currentRoute = "overview";
    let currentPrintBatch = null;
    let state = {
      theme: localStorage.getItem("gamms_theme") || "system",
      authenticated: false,
      user: null,
      permissions: []
    };

    const NAV_ITEMS = [
      { id: "overview", label: "Overview", perm: "dashboard.read", icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
      { id: "pos", label: "POS Operativo", perm: "pos.access", icon: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>' },
      { id: "my-sales", label: "Mis Ventas", perm: "sales.read_own", icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
      { id: "sales", label: "Ventas", perm: "sales.read", icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
      { id: "products", label: "Productos", perm: "products.read", icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>' },
      { id: "inventory", label: "Inventario", perm: "inventory.read", icon: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
      { id: "qr", label: "Códigos QR", perm: "qr.read", icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
      { id: "print", label: "Print Studio", perm: "print.use", icon: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>' },
      { id: "rewards", label: "Rewards & Canjes", perm: "rewards.read", icon: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>' },
      { id: "customers", label: "Clientes", perm: "customers.read", icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
      { id: "users", label: "Usuarios", perm: "users.read", icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
      { id: "roles", label: "Roles y Permisos", perm: "roles.read", icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
      { id: "shifts", label: "Turnos", perm: "shifts.use", icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { id: "reports", label: "Reportes", perm: "reports.read", icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
      { id: "audit", label: "Auditoría", perm: "audit.read", icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
      { id: "settings", label: "Configuración", perm: "settings.read", icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
      { id: "system", label: "Sistema", perm: "system.read", icon: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' }
    ];

    const sidebar = document.getElementById("sidebar");
    const navMenu = document.getElementById("navMenu");
    const mobileMenuToggle = document.getElementById("mobileMenuToggle");
    const themeToggle = document.getElementById("themeToggle");
    const logoutBtn = document.getElementById("logoutBtn");
    const pageTitle = document.getElementById("pageTitle");
    const contentArea = document.getElementById("contentArea");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalClose = document.getElementById("modalClose");
    const userProfileTag = document.getElementById("userProfileTag");

    function formatMoney(cents) { return "C$ " + ((cents || 0) / 100).toFixed(2); }
    function showToast(msg, isError = false) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = (isError ? "⚠️ " : "✓ ") + msg;
      document.getElementById("toast-container").appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    function closeModal() { modalOverlay.classList.remove("open"); }
    modalClose.addEventListener("click", closeModal);
    function openModal(title, contentHtml) {
      modalTitle.textContent = title;
      modalBody.innerHTML = contentHtml;
      modalOverlay.classList.add("open");
    }

    function applyTheme(theme) {
      state.theme = theme;
      localStorage.setItem("gamms_theme", theme);
      if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
    }
    themeToggle.addEventListener("click", () => {
      const nextTheme = state.theme === "light" ? "dark" : (state.theme === "dark" ? "system" : "light");
      applyTheme(nextTheme);
    });

    async function apiFetch(endpoint, options = {}) {
      try {
        const res = await fetch(API_BASE + (endpoint.startsWith("/") ? endpoint : "/admin" + endpoint), {
          credentials: "same-origin",
          headers: { "Accept": "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
          ...options
        });
        if (res.status === 401 && !endpoint.includes("/login")) {
          renderLogin();
          return { ok: false, code: "SELLER_AUTH_REQUIRED" };
        }
        return res.json();
      } catch (err) {
        return { ok: false, code: "NETWORK_ERROR", message: err.message };
      }
    }

    function userHasPerm(permissionKey) {
      if (!permissionKey) return true;
      if (state.permissions.includes("*")) return true;
      return state.permissions.includes(permissionKey);
    }

    function renderNavMenu() {
      navMenu.innerHTML = NAV_ITEMS
        .filter(item => userHasPerm(item.perm))
        .map(item => \`
          <a class="nav-item \${currentRoute === item.id ? 'active' : ''}" data-route="\${item.id}" onclick="navigate('\${item.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">\${item.icon}</svg>
            <span>\${item.label}</span>
          </a>
        \`).join("");
    }

    async function checkAuth() {
      const res = await apiFetch("/staff/session");
      if (res.authenticated) {
        state.authenticated = true;
        state.user = res.user;
        state.permissions = res.user.permissions || [];
        
        userProfileTag.hidden = false;
        userProfileTag.textContent = (res.user.displayName || res.user.username) + " (" + (res.user.roles?.[0]?.name || "Staff") + ")";
        logoutBtn.hidden = false;
        
        renderNavMenu();
        const availableRoutes = NAV_ITEMS.filter(item => userHasPerm(item.perm)).map(item => item.id);
        const targetRoute = getRouteFromUrl();
        navigate(availableRoutes.includes(targetRoute) ? targetRoute : availableRoutes[0] || "overview");
      } else {
        renderLogin();
      }
    }

    logoutBtn.addEventListener("click", async () => {
      await apiFetch("/staff/logout", { method: "POST", body: "{}" });
      state.authenticated = false;
      renderLogin();
    });

    mobileMenuToggle.addEventListener("click", () => sidebar.classList.toggle("mobile-open"));

    function getRouteFromUrl() {
      const path = window.location.pathname.replace(/^\\/aep\\/controlcenter\\/?/, "");
      return path || "overview";
    }

    function navigate(route, pushState = true) {
      if (!state.authenticated) { renderLogin(); return; }
      currentRoute = route;
      sidebar.classList.remove("mobile-open");

      document.querySelectorAll(".nav-item").forEach(el => {
        el.classList.toggle("active", el.getAttribute("data-route") === route);
      });

      if (pushState) {
        const newPath = "/aep/controlcenter/" + (route === "overview" ? "" : route);
        window.history.pushState({}, "", newPath);
      }

      const navObj = NAV_ITEMS.find(n => n.id === route);
      pageTitle.textContent = navObj ? navObj.label : "Control Center";
      renderRoute(route);
    }

    window.addEventListener("popstate", () => navigate(getRouteFromUrl(), false));

    // LOGIN VIEW
    function renderLogin() {
      pageTitle.textContent = "Control Center Login";
      userProfileTag.hidden = true;
      logoutBtn.hidden = true;
      contentArea.innerHTML = \`
        <div style="max-width: 440px; margin: 40px auto;">
          <div class="card" style="box-shadow: 0 12px 36px rgba(0,0,0,0.12);">
            <div class="card-header" style="justify-content:center; flex-direction:column; text-align:center;">
              <div class="brand-title" style="font-size:24px;">GAMMS AEP</div>
              <div class="brand-subtitle">CONTROL CENTER</div>
              <div class="gamms-byline" style="margin-top:6px;">By <strong>GAMMS GROUP</strong></div>
            </div>
            <form id="loginForm" style="margin-top:12px;">
              <div class="form-group">
                <label class="form-label">Usuario</label>
                <input id="staffUsername" type="text" class="form-control" placeholder="admin / tu usuario" required autofocus>
              </div>
              <div class="form-group">
                <label class="form-label">Contraseña</label>
                <input id="staffPassword" type="password" class="form-control" placeholder="••••••••" required>
              </div>
              <div class="form-group" id="totpGroup" hidden>
                <label class="form-label">Código de Autenticación 2FA (MFA)</label>
                <input id="staffTotp" type="text" class="form-control" placeholder="123456" maxlength="8">
              </div>
              <button type="submit" class="btn-primary" style="width:100%; justify-content:center; margin-top:8px;">
                Iniciar sesión
              </button>
            </form>
          </div>
        </div>
      \`;

      document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("staffUsername").value.trim();
        const password = document.getElementById("staffPassword").value;
        const totpCode = document.getElementById("staffTotp")?.value.trim() || "";

        let res = await apiFetch("/staff/login", {
          method: "POST",
          body: JSON.stringify({ username, password, totpCode })
        });

        if (!res.ok && res.code === "MFA_REQUIRED") {
          document.getElementById("totpGroup").hidden = false;
          showToast("Introduce tu código MFA de 6 dígitos", true);
          return;
        }

        if (res.ok) {
          showToast("Bienvenido " + (res.user.displayName || res.user.username));
          state.authenticated = true;
          state.user = res.user;
          state.permissions = res.user.permissions || [];

          userProfileTag.hidden = false;
          userProfileTag.textContent = (res.user.displayName || res.user.username) + " (" + (res.user.roles?.[0]?.name || "Staff") + ")";
          logoutBtn.hidden = false;

          renderNavMenu();
          navigate("overview");
        } else {
          showToast(res.error || res.code || "Usuario o contraseña incorrectos", true);
        }
      });
    }

    async function renderRoute(route) {
      contentArea.innerHTML = \`<div class="card"><div style="height: 140px; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">Cargando...</div></div>\`;

      switch (route) {
        case "overview": return renderOverview();
        case "pos": return renderPos();
        case "my-sales": return renderMySales();
        case "sales": return renderSales();
        case "products": return renderProducts();
        case "inventory": return renderInventory();
        case "qr": return renderQr();
        case "print": return renderPrintCenter();
        case "rewards": return renderRewards();
        case "customers": return renderCustomers();
        case "users": return renderUsers();
        case "roles": return renderRoles();
        case "shifts": return renderShifts();
        case "reports": return renderReports();
        case "audit": return renderActivity();
        case "settings": return renderSettings();
        case "system": return renderSystem();
        default: return renderOverview();
      }
    }

    // 1. OVERVIEW
    async function renderOverview() {
      const res = await apiFetch("/admin/dashboard");
      if (!res.ok) {
        contentArea.innerHTML = \`<div class="card">Error cargando dashboard</div>\`;
        return;
      }
      const { overview, recentSales, topProducts, lowStockProducts } = res.stats;

      let lowStockAlert = "";
      if (lowStockProducts && lowStockProducts.length > 0) {
        lowStockAlert = \`
          <div class="alert-banner warning">
            <div>
              ⚠️ <strong>Stock bajo detectado:</strong> \${lowStockProducts.map(p => p.name + ' (' + p.stock_quantity + ' rest.)').join(', ')}
            </div>
            <button class="btn-secondary" onclick="navigate('inventory')">Añadir Stock</button>
          </div>
        \`;
      }

      contentArea.innerHTML = \`
        \${lowStockAlert}
        <div class="grid-stats">
          <div class="stat-card">
            <div class="stat-header"><span>REVENUE HOY</span><div class="stat-icon">$</div></div>
            <div class="stat-value">\${formatMoney(overview.todayRevenueCents)}</div>
            <div class="stat-sub">Total acumulado: \${formatMoney(overview.totalRevenueCents)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>BEBIDAS VENDIDAS</span><div class="stat-icon">🥤</div></div>
            <div class="stat-value">\${overview.todaySalesCount}</div>
            <div class="stat-sub">Ventas totales: \${overview.totalSalesCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>REWARDS CANJEADOS</span><div class="stat-icon">🎁</div></div>
            <div class="stat-value">\${overview.redeemedRewardsCount}</div>
            <div class="stat-sub">Disponibles: \${overview.availableRewardsCount} | Claims: \${overview.activeClaimsCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>QR DISPONIBLES</span><div class="stat-icon">🏷️</div></div>
            <div class="stat-value">\${overview.availableQrCount}</div>
            <div class="stat-sub">Usados: \${overview.usedQrCount} | Total: \${overview.totalQrCount}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">Ventas Recientes</div>
              <button class="btn-secondary" onclick="navigate('sales')">Ver todas</button>
            </div>
            <div class="table-container">
              <table>
                <thead><tr><th>Producto</th><th>QR #</th><th>Monto</th><th>Descuento</th></tr></thead>
                <tbody>
                  \${(recentSales || []).map(s => \`
                    <tr>
                      <td><strong>\${s.productName}</strong><br><small style="color:var(--text-muted)">\${s.customerLabel}</small></td>
                      <td>#\${s.qrNumber}</td>
                      <td><strong>\${formatMoney(s.finalPriceCents)}</strong></td>
                      <td>\${s.discountPercent > 0 ? \`<span class="badge badge-warning">\${s.discountPercent}% OFF</span>\` : '<span class="badge badge-success">Normal</span>'}</td>
                    </tr>
                  \`).join('') || '<tr><td colspan="4" style="text-align:center">Sin ventas recientes</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">Productos Más Vendidos</div>
              <button class="btn-secondary" onclick="navigate('products')">Catálogo</button>
            </div>
            <div class="table-container">
              <table>
                <thead><tr><th>Producto</th><th>Ventas</th><th>Revenue</th></tr></thead>
                <tbody>
                  \${(topProducts || []).map(p => \`
                    <tr>
                      <td><strong>\${p.name}</strong></td>
                      <td>\${p.salesCount} ud.</td>
                      <td>\${formatMoney(p.revenueCents)}</td>
                    </tr>
                  \`).join('') || '<tr><td colspan="3" style="text-align:center">Sin productos</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;
    }

    // POS CONTROL CENTER
    async function renderPos() {
      const recent = await apiFetch("/admin/sales?limit=10");
      contentArea.innerHTML = \`
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:24px;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">Canje POS 50%</div>
              <span class="badge badge-success">POS ONLINE</span>
            </div>
            <div class="form-group">
              <label class="form-label">1. Código de Claim o QR del cliente</label>
              <input id="posClaimInput" class="form-control" placeholder="T3X8-5OHC-EW" autofocus>
            </div>
            <div class="filter-bar">
              <button class="btn-secondary" onclick="previewPosClaim()">1. Validar Premio</button>
            </div>
            <div id="posStep2Box" style="margin-top:18px;" hidden>
              <div class="form-group">
                <label class="form-label">2. Escanear Bebida (QR Físico)</label>
                <input id="posPhysicalQrInput" class="form-control" placeholder="Escanear token de la bebida">
              </div>
              <button class="btn-primary" onclick="redeemPosClaim()" style="width:100%; justify-content:center;">Confirmar Canje 50%</button>
            </div>
            <div id="posPreview" style="margin-top:18px;"></div>
          </div>
          <div class="card">
            <div class="card-header">
              <div class="card-title">Últimas Ventas</div>
              <button class="btn-secondary" onclick="navigate('sales')">Ver todas</button>
            </div>
            <div class="table-container">
              <table>
                <thead><tr><th>Producto</th><th>QR</th><th>Total</th><th>Desc.</th></tr></thead>
                <tbody>
                  \${(recent.items || []).map(s => \`
                    <tr><td><strong>\${s.productName}</strong></td><td>#\${s.qrPublicNumber}</td><td>\${formatMoney(s.finalPriceCents)}</td><td>\${s.discountPercent}%</td></tr>
                  \`).join('') || '<tr><td colspan="4" style="text-align:center">Sin ventas recientes</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;
    }

    function normalizeClaimInput(value) { return String(value || "").trim().replace(/^GAMMS-AEP-CLAIM:/i, "").trim(); }

    async function previewPosClaim() {
      const input = document.getElementById("posClaimInput");
      const code = normalizeClaimInput(input.value);
      const box = document.getElementById("posPreview");
      const step2Box = document.getElementById("posStep2Box");
      if (!code) return showToast("Ingresa un código de premio.", true);
      const res = await apiFetch("/seller/claims/" + encodeURIComponent(code));
      if (!res.ok) {
        box.innerHTML = \`<div class="badge badge-danger">\${res.error || res.code || "CLAIM_INVALID"}</div>\`;
        step2Box.hidden = true;
        return;
      }
      step2Box.hidden = false;
      box.innerHTML = \`
        <div class="card" style="margin:0; box-shadow:none; background:var(--bg-page);">
          <div class="card-title">\${res.customer?.displayName || 'Cliente'} (\${res.customer?.customerLabel || ''})</div>
          <p style="margin-top:8px;">Estado: <strong>\${res.claim.status}</strong> · Descuento: <strong>50% OFF</strong></p>
        </div>
      \`;
    }

    async function redeemPosClaim() {
      const code = normalizeClaimInput(document.getElementById("posClaimInput").value);
      const physicalQrToken = document.getElementById("posPhysicalQrInput").value.trim();
      if (!code) return showToast("Ingresa el premio.", true);
      const res = await apiFetch("/seller/redeem", { method: "POST", body: JSON.stringify({ code, physicalQrToken }) });
      if (!res.ok) return showToast(res.error || res.code || "No se pudo canjear.", true);
      showToast("Canje registrado: " + formatMoney(res.purchase.finalPriceCents));
      renderPos();
    }

    // MIS VENTAS (SELLER)
    async function renderMySales() {
      const res = await apiFetch("/seller/my-sales");
      if (!res.ok) { contentArea.innerHTML = \`<div class="card">Error cargando mis ventas</div>\`; return; }

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Mis Ventas Realizadas</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>Fecha / Hora</th><th>Producto</th><th>QR #</th><th>Cliente</th><th>Monto</th><th>Desc.</th></tr></thead>
              <tbody>
                \${(res.sales || []).map(s => \`
                  <tr>
                    <td>\${new Date(s.createdAt).toLocaleString()}</td>
                    <td><strong>\${s.productName}</strong></td>
                    <td>#\${s.qrNumber}</td>
                    <td>\${s.customerDisplayName ? s.customerDisplayName + ' · ' + s.customerLabel : s.customerLabel}</td>
                    <td><strong>\${formatMoney(s.finalPriceCents)}</strong></td>
                    <td>\${s.discountPercent > 0 ? \`<span class="badge badge-warning">\${s.discountPercent}% OFF</span>\` : '<span class="badge badge-success">Normal</span>'}</td>
                  </tr>
                \`).join('') || '<tr><td colspan="6" style="text-align:center">No has realizado ventas en este turno</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 2. SALES (HISTORICAL & ADMIN VOID)
    async function renderSales(page = 1) {
      const query = document.getElementById("salesSearch")?.value || "";
      const res = await apiFetch(\`/admin/sales?page=\${page}&q=\${encodeURIComponent(query)}\`);
      if (!res.ok) return;

      const canVoid = userHasPerm("purchase.void");

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Ventas Registradas (\${res.summary.totalSalesCount})</div>
            <div class="filter-bar">
              <input id="salesSearch" class="input-search" placeholder="Buscar producto, QR o cliente..." value="\${query}">
              <button class="btn-secondary" onclick="exportCsv('sales')">Exportar CSV</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>QR #</th><th>P. Normal</th><th>Desc.</th><th>Total</th>\${canVoid ? '<th>Acciones</th>' : ''}</tr></thead>
              <tbody>
                \${(res.items || []).map(s => \`
                  <tr>
                    <td>#\${s.id}</td>
                    <td>\${new Date(s.createdAt).toLocaleString()}</td>
                    <td>\${s.customerDisplayName ? '<strong>' + s.customerDisplayName + '</strong><br>' : ''}\${s.customerLabel}</td>
                    <td><strong>\${s.productName}</strong></td>
                    <td>#\${s.qrPublicNumber}</td>
                    <td>\${formatMoney(s.regularPriceCents)}</td>
                    <td>\${s.discountPercent}%</td>
                    <td><strong>\${formatMoney(s.finalPriceCents)}</strong></td>
                    \${canVoid ? \`<td><button class="btn-danger" onclick="promptVoidPurchase(\${s.id})">Anular</button></td>\` : ''}
                  </tr>
                \`).join('') || '<tr><td colspan="9" style="text-align:center">Sin ventas</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function promptVoidPurchase(purchaseId) {
      const reason = prompt("Describe el motivo de la anulación administrativa:");
      if (!reason || reason.trim().length < 3) return alert("Debes ingresar un motivo válido.");

      const res = await apiFetch("/admin/purchases/" + purchaseId + "/void", {
        method: "POST",
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        showToast("Venta #" + purchaseId + " anulada exitosamente.");
        renderSales();
      } else {
        showToast(res.error || res.code || "Error al anular venta", true);
      }
    }

    // 3. PRODUCTS
    async function renderProducts() {
      const res = await apiFetch("/admin/products");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Catálogo de Productos</div>
            <button class="btn-primary" onclick="openNewProductModal()">+ Nuevo Producto</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                \${(res.products || []).map(p => \`
                  <tr>
                    <td>#\${p.id}</td>
                    <td><strong>\${p.name}</strong></td>
                    <td>\${formatMoney(p.price_cents)}</td>
                    <td><strong>\${p.stock_quantity}</strong> \${p.stock_quantity <= p.low_stock_threshold ? '<span class="badge badge-warning">Bajo</span>' : ''}</td>
                    <td>\${p.active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
                    <td><button class="btn-secondary" onclick="openEditProductModal(\${p.id})">Editar</button></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 4. INVENTORY
    async function renderInventory() {
      const res = await apiFetch("/admin/inventory");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Movimientos de Inventario</div>
            <button class="btn-primary" onclick="openRestockModal()">+ Ajustar / Restock</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cambio</th><th>Motivo</th><th>Actor</th></tr></thead>
              <tbody>
                \${(res.movements || []).map(m => \`
                  <tr>
                    <td>\${new Date(m.createdAt).toLocaleString()}</td>
                    <td><strong>\${m.productName}</strong></td>
                    <td><span class="badge badge-neutral">\${m.movementType}</span></td>
                    <td><strong style="color:\${m.quantityDelta > 0 ? 'var(--badge-green-text)' : 'var(--badge-red-text)'}">\${m.quantityDelta > 0 ? '+' : ''}\${m.quantityDelta}</strong></td>
                    <td>\${m.reason}</td>
                    <td>\${m.actorType} (\${m.actorIdentifier || 'system'})</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 5. QR CODES
    async function renderQr() {
      const res = await apiFetch("/admin/qr");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Códigos QR Generados</div>
            <button class="btn-primary" onclick="navigate('print')">Generar en Print Studio</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>QR #</th><th>Producto</th><th>Estado</th><th>Creado</th></tr></thead>
              <tbody>
                \${(res.items || []).map(q => \`
                  <tr>
                    <td>#\${q.public_number}</td>
                    <td>\${q.product_name || 'Sin asignar'}</td>
                    <td>\${q.status === 'available' ? '<span class="badge badge-success">Disponible</span>' : (q.status === 'used' ? '<span class="badge badge-neutral">Usado</span>' : '<span class="badge badge-danger">Deshabilitado</span>')}</td>
                    <td>\${new Date(q.created_at).toLocaleString()}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // PRINT STUDIO ENGINE HELPER FUNCTIONS (Phase 3.5 Physical Print Engine)
    async function fetchCurrentBatchPdf() {
      if (!currentPrintBatch) return null;
      const res = await fetch(API_BASE + "/print/pdf", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/pdf" },
        body: JSON.stringify({
          batchId: currentPrintBatch.batchId,
          printProfileId: currentPrintBatch.printProfile?.id,
          startSlot: currentPrintBatch.startSlot,
          tokens: currentPrintBatch.items.map(item => item.token)
        })
      });
      if (!res.ok) return null;
      return res.blob();
    }

    async function downloadCurrentPdf() {
      const blob = await fetchCurrentBatchPdf();
      if (!blob) return showToast("Error al generar PDF", true);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gamms-aep-labels-" + currentPrintBatch.batchId + ".pdf";
      link.click();
      URL.revokeObjectURL(url);
    }

    async function printCurrentBatch() {
      const blob = await fetchCurrentBatchPdf();
      if (!blob) return showToast("Error al preparar impresión PDF", true);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
    }

    function renderBrowserPrintSheets(batch) {
      if (!batch) return "";
      const profile = batch.printProfile || { columns: 5, rows: 10 };
      const slots = getOrderedBrowserSlots(profile);
      return \`
        <div id="printable-labels">
          <div class="print-sheet-frame">
            \${slots.map(s => \`
              <div class="print-slot" style="left:\${s.x}in; top:\${s.y}in; width:\${s.w}in; height:\${s.h}in;">
                <span class="mono">#\${s.number || ''}</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \`;
    }

    function getOrderedBrowserSlots(profile) {
      return Array.from({ length: 50 }).map((_, i) => ({
        x: (i % profile.columns) * 1.5,
        y: Math.floor(i / profile.columns) * 1.0,
        w: 1.5,
        h: 1.0,
        number: i + 1
      }));
    }

    function fitPrintPreview() { /* Scale browser preview */ }
    window.addEventListener("resize", fitPrintPreview);

    // 6. PRINT CENTER STUDIO
    async function renderPrintCenter() {
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">GAMMS AEP Print Studio</div>
              <div class="gamms-byline" style="margin-top:4px;">By <strong>GAMMS GROUP</strong></div>
            </div>
          </div>
          <p style="margin-bottom:12px; color:var(--text-muted);">Motor de impresion: PDF fisico · Letter 8.5 x 11 in · MACO ML-5000 · 5 x 10 (Papel Carta / Letter 8.5 x 11).</p>
          <div style="padding:16px; background:var(--bg-page); border-radius:10px; margin-bottom:16px; font-size:13px; border:1px solid var(--border-color);">
            ℹ️ Browser print is not a production label engine. Todas las impresiones físicas se generan vía PDF Vectorial MACO ML-5000 para preservar quiet zone y confiabilidad de escaneo.
          </div>
          \${renderBrowserPrintSheets(currentPrintBatch)}
        </div>
      \`;
    }

    // 7. REWARDS
    async function renderRewards() {
      const res = await apiFetch("/admin/rewards");
      if (!res.ok) return;
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Premios Generados</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Cliente</th><th>Tipo</th><th>Descuento</th><th>Estado</th><th>Unlocked</th></tr></thead>
              <tbody>
                \${(res.rewards || []).map(r => \`
                  <tr>
                    <td>#\${r.id}</td>
                    <td>\${r.customerLabel}</td>
                    <td>\${r.reward_type}</td>
                    <td>\${r.discount_percent}% OFF</td>
                    <td>\${r.status === 'available' ? '<span class="badge badge-success">Disponible</span>' : '<span class="badge badge-neutral">' + r.status + '</span>'}</td>
                    <td>\${new Date(r.unlocked_at).toLocaleString()}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 8. CUSTOMERS
    async function renderCustomers() {
      const res = await apiFetch("/admin/customers");
      if (!res.ok) return;
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Clientes Registrados</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>Cliente Code</th><th>Compras</th><th>Premios</th><th>Primera Visita</th></tr></thead>
              <tbody>
                \${(res.customers || []).map(c => \`
                  <tr>
                    <td><strong>\${c.displayName || 'Sin nombre'}</strong></td>
                    <td>\${c.customerLabel}</td>
                    <td>\${c.purchaseCount} compras</td>
                    <td>\${c.availableRewards} disponibles</td>
                    <td>\${new Date(c.created_at).toLocaleString()}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 9. USERS (STAFF IAM)
    async function renderUsers() {
      const res = await apiFetch("/admin/users");
      if (!res.ok) return;
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Gestión de Usuarios Internos (Staff IAM)</div>
            <button class="btn-primary" onclick="openCreateUserModal()">+ Crear Usuario</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Nombre</th><th>Usuario</th><th>Rol(es)</th><th>Estado</th><th>MFA 2FA</th><th>Acciones</th></tr></thead>
              <tbody>
                \${(res.users || []).map(u => \`
                  <tr>
                    <td>#\${u.id}</td>
                    <td><strong>\${u.displayName}</strong></td>
                    <td>\${u.username}</td>
                    <td>\${(u.roles || []).map(r => '<span class="badge badge-neutral">' + r.name + '</span>').join(' ')}</td>
                    <td>\${u.active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Desactivado</span>'}</td>
                    <td>\${u.totpEnabled ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-neutral">Inactivo</span>'}</td>
                    <td>
                      <button class="btn-secondary" onclick="openResetUserPassModal(\${u.id}, '\${u.username}')">Reset Pass</button>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function openCreateUserModal() {
      openModal("Crear Usuario Interno", \`
        <form id="createUserForm">
          <div class="form-group"><label class="form-label">Nombre Completo</label><input id="newDisplayName" class="form-control" placeholder="Juan Pérez" required></div>
          <div class="form-group"><label class="form-label">Nombre de Usuario</label><input id="newUsername" class="form-control" placeholder="juan" required></div>
          <div class="form-group"><label class="form-label">Contraseña Temporal</label><input id="newPassword" type="password" class="form-control" placeholder="••••••••" required></div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Crear Usuario</button>
        </form>
      \`);

      document.getElementById("createUserForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const res = await apiFetch("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            displayName: document.getElementById("newDisplayName").value,
            username: document.getElementById("newUsername").value,
            password: document.getElementById("newPassword").value,
            mustChangePassword: true,
            roleIds: [5]
          })
        });
        if (res.ok) { showToast("Usuario creado"); closeModal(); renderUsers(); }
        else { showToast(res.error || "Error al crear", true); }
      });
    }

    function openResetUserPassModal(userId, username) {
      openModal("Resetear Contraseña - " + username, \`
        <form id="resetPassForm">
          <div class="form-group"><label class="form-label">Nueva Contraseña Temporal</label><input id="resetPassInput" type="password" class="form-control" placeholder="••••••••" required></div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Guardar Nueva Contraseña</button>
        </form>
      \`);

      document.getElementById("resetPassForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const res = await apiFetch("/admin/users/" + userId + "/reset-password", {
          method: "POST",
          body: JSON.stringify({ newPassword: document.getElementById("resetPassInput").value })
        });
        if (res.ok) { showToast("Contraseña actualizada"); closeModal(); }
        else { showToast(res.error || "Error al resetear", true); }
      });
    }

    // 10. ROLES & RBAC
    async function renderRoles() {
      const res = await apiFetch("/admin/roles");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Roles y Permisos (RBAC)</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Rol</th><th>Descripción</th><th>Tipo</th><th>Permisos Asignados</th></tr></thead>
              <tbody>
                \${(res.roles || []).map(r => \`
                  <tr>
                    <td>#\${r.id}</td>
                    <td><strong>\${r.name}</strong></td>
                    <td>\${r.description || ''}</td>
                    <td>\${r.is_builtin ? '<span class="badge badge-warning">Built-in</span>' : '<span class="badge badge-neutral">Custom</span>'}</td>
                    <td>\${r.permissions?.length || 0} permisos</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 11. SHIFTS
    async function renderShifts() {
      const current = await apiFetch("/staff/shifts/current");
      const list = await apiFetch("/admin/shifts");

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Mi Turno Actual</div></div>
          \${current.shift ? \`
            <div class="alert-banner warning">
              <div>Turno Activo (#\${current.shift.id}) · Inicio: \${new Date(current.shift.startedAt).toLocaleTimeString()}<br>
              Ventas en turno: <strong>\${current.shift.salesCount}</strong> | Revenue: <strong>\${formatMoney(current.shift.revenueCents)}</strong></div>
              <button class="btn-danger" onclick="closeMyShift()">Cerrar Turno</button>
            </div>
          \` : \`
            <p style="margin-bottom:14px; color:var(--text-muted);">No tienes ningún turno abierto en este momento.</p>
            <button class="btn-primary" onclick="startMyShift()">Iniciar Turno</button>
          \`}
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">Historial General de Turnos</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Usuario</th><th>Inicio</th><th>Fin</th><th>Ventas</th><th>Revenue</th><th>Estado</th></tr></thead>
              <tbody>
                \${(list.shifts || []).map(s => \`
                  <tr>
                    <td>#\${s.id}</td>
                    <td><strong>\${s.displayName || s.username}</strong></td>
                    <td>\${new Date(s.startedAt).toLocaleString()}</td>
                    <td>\${s.endedAt ? new Date(s.endedAt).toLocaleString() : '-'}</td>
                    <td>\${s.salesCount} ud.</td>
                    <td>\${formatMoney(s.revenueCents)}</td>
                    <td>\${s.status === 'open' ? '<span class="badge badge-success">Abierto</span>' : '<span class="badge badge-neutral">Cerrado</span>'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function startMyShift() {
      const res = await apiFetch("/staff/shifts/start", { method: "POST", body: "{}" });
      if (res.ok) { showToast("Turno iniciado"); renderShifts(); }
      else { showToast(res.error || "No se pudo iniciar turno", true); }
    }

    async function closeMyShift() {
      const res = await apiFetch("/staff/shifts/close", { method: "POST", body: "{}" });
      if (res.ok) { showToast("Turno cerrado"); renderShifts(); }
      else { showToast(res.error || "No se pudo cerrar turno", true); }
    }

    // 12. EXECUTIVE REPORTS
    async function renderReports() {
      const res = await apiFetch("/admin/reports/event");
      if (!res.ok) return;
      const r = res.report;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Reporte de Cierre del Evento</div>
              <div class="gamms-byline" style="margin-top:4px;">By <strong>GAMMS GROUP</strong></div>
            </div>
            <a href="/aep/api/admin/reports/export" target="_blank" class="btn-primary">Descargar Reporte CSV</a>
          </div>

          <div class="grid-stats">
            <div class="stat-card">
              <div class="stat-header"><span>REVENUE TOTAL</span></div>
              <div class="stat-value">\${formatMoney(r.totalRevenueCents)}</div>
              <div class="stat-sub">Normal: \${formatMoney(r.normalRevenueCents)} | 50% OFF: \${formatMoney(r.rewardRevenueCents)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-header"><span>DESCUENTOS OTORGADOS</span></div>
              <div class="stat-value">\${formatMoney(r.totalDiscountCents)}</div>
              <div class="stat-sub">En \${r.rewardSalesCount} ventas promocionales</div>
            </div>
            <div class="stat-card">
              <div class="stat-header"><span>UNIDADES VENDIDAS</span></div>
              <div class="stat-value">\${r.totalUnits} ud.</div>
              <div class="stat-sub">Normales: \${r.normalSalesCount} | Con 50%: \${r.rewardSalesCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-header"><span>CLIENTES ÚNICOS</span></div>
              <div class="stat-value">\${r.uniqueCustomersCount}</div>
              <div class="stat-sub">Hora Pico: \${r.peakHour}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:24px; margin-top:20px;">
            <div class="card" style="margin:0;">
              <div class="card-title">Rendimiento por Vendedor</div>
              <div class="table-container">
                <table>
                  <thead><tr><th>Vendedor</th><th>Unidades</th><th>Ingreso</th><th>Ventas 50%</th></tr></thead>
                  <tbody>
                    \${(r.salesBySeller || []).map(s => \`
                      <tr>
                        <td><strong>\${s.seller_name}</strong></td>
                        <td>\${s.units_sold} ud.</td>
                        <td>\${formatMoney(s.revenue_cents)}</td>
                        <td>\${s.reward_sales_count}</td>
                      </tr>
                    \`).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card" style="margin:0;">
              <div class="card-title">Productos Más Vendidos</div>
              <div class="table-container">
                <table>
                  <thead><tr><th>Producto</th><th>Vendidos</th><th>Revenue</th></tr></thead>
                  <tbody>
                    \${(r.topProducts || []).map(p => \`
                      <tr>
                        <td><strong>\${p.name}</strong></td>
                        <td>\${p.units_sold} ud.</td>
                        <td>\${formatMoney(p.revenue_cents)}</td>
                      </tr>
                    \`).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      \`;
    }

    // 13. AUDIT ACTIVITY
    async function renderActivity() {
      const res = await apiFetch("/admin/activity");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Registro de Auditoría</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Detalles</th></tr></thead>
              <tbody>
                \${(res.events || []).map(e => \`
                  <tr>
                    <td>\${new Date(e.created_at).toLocaleString()}</td>
                    <td><strong>\${e.actor_identifier}</strong> (\${e.actor_type})</td>
                    <td><span class="badge badge-neutral">\${e.action}</span></td>
                    <td>\${e.entity_type} #\${e.entity_identifier || ''}</td>
                    <td><small>\${e.metadata_json || ''}</small></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 14. SETTINGS
    async function renderSettings() {
      const res = await apiFetch("/admin/settings");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header"><div class="card-title">Configuración del Evento</div></div>
          <div class="table-container">
            <table>
              <thead><tr><th>Clave</th><th>Valor</th></tr></thead>
              <tbody>
                \${Object.entries(res.settings || {}).map(([k, v]) => \`
                  <tr><td><strong>\${k}</strong></td><td>\${v}</td></tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 15. SYSTEM DIAGNOSTICS
    async function renderSystem() {
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Diagnóstico del Sistema GAMMS AEP</div>
              <div class="gamms-byline" style="margin-top:4px;">By <strong>GAMMS GROUP</strong></div>
            </div>
          </div>
          <p>Group for Advanced Modular Multiplatform Systems</p>
          <div style="margin-top:16px;">
            <p><strong>Estado:</strong> OK</p>
            <p><strong>Arquitectura:</strong> Cloudflare Pages Functions + D1 + Web Crypto API</p>
          </div>
        </div>
      \`;
    }

    // Print Preview Legacy Helper Signatures
    function escapePrintText(value) { return String(value || '').replace(/&/g, "&amp;"); }
    function renderPrintLabel(item) { return escapePrintText(item.public_number); }
    function fitPrintPreview() {}
    window.addEventListener("resize", fitPrintPreview);
    function getOrderedBrowserSlots(profile) {
      const slots = [];
      const rows = profile?.rows || 10, columns = profile?.columns || 5;
      const pushSlot = (r, c) => slots.push({ row: r, col: c });
      for (let row = 0; row < rows; row += 1) { for (let col = columns - 1; col >= 0; col -= 1) pushSlot(row, col); }
      return slots;
    }
    function renderBrowserPrintSheets(batch) { return getOrderedBrowserSlots({}); }

    checkAuth();
  </script>

</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}
