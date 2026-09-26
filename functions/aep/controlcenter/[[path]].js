export function onRequestGet() {
  const html = `<!doctype html>
<html lang="es" data-theme="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>GAMMS AEP Control Center</title>
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
    .brand-subtitle { font-size: 11px; text-transform: uppercase; color: #8E8E93; font-weight: 600; margin-top: 4px; letter-spacing: 1px; }

    .nav-menu { flex: 1; padding: 16px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #A1A1A6; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600; transition: all 0.2s ease; cursor: pointer; }
    .nav-item:hover, .nav-item.active { color: #FFFFFF; background: rgba(255,255,255,0.1); }
    .nav-item.active { background: var(--accent); color: #FFFFFF; }
    .nav-item svg { width: 18px; height: 18px; stroke-width: 2.2; }

    .sidebar-footer { padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #8E8E93; text-align: center; }

    /* Main Container */
    .main-wrapper { flex: 1; margin-left: var(--sidebar-width); display: flex; flex-direction: column; min-width: 0; transition: margin 0.3s ease; }
    
    /* Top Header */
    .top-header { height: 68px; background: var(--bg-surface); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 28px; sticky: top; position: sticky; top: 0; z-index: 90; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .mobile-menu-btn { display: none; background: none; border: none; color: var(--text-main); cursor: pointer; padding: 8px; }
    .header-title { font-size: 18px; font-weight: 700; }

    .header-right { display: flex; align-items: center; gap: 16px; }
    .event-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; background: var(--badge-green-bg); color: var(--badge-green-text); }
    .event-badge .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.8s infinite; }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }

    .theme-toggle { background: var(--bg-page); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 10px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
    .btn-logout { background: transparent; border: 1px solid var(--border-color); color: var(--text-main); border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-logout:hover { background: var(--badge-red-bg); color: var(--badge-red-text); border-color: transparent; }

    /* Page Content Area */
    .content-area { padding: 28px; flex: 1; max-width: 1400px; margin: 0 auto; width: 100%; }

    /* Components & Cards */
    .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 28px; }
    .stat-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 22px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; justify-content: space-between; }
    .stat-header { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 13px; font-weight: 600; }
    .stat-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(0, 122, 255, 0.1); color: var(--accent); display: flex; align-items: center; justify-content: center; }
    .stat-value { font-size: 28px; font-weight: 800; margin-top: 14px; letter-spacing: -0.5px; }
    .stat-sub { font-size: 12px; color: var(--text-muted); margin-top: 6px; font-weight: 500; }

    .card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: var(--card-shadow); margin-bottom: 24px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .card-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }

    /* Controls & Filters */
    .filter-bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .input-search, .select-filter { background: var(--bg-page); border: 1px solid var(--border-color); color: var(--text-main); padding: 10px 14px; border-radius: 10px; font-size: 14px; outline: none; }
    .input-search { min-width: 240px; flex: 1; }
    .btn-primary { background: var(--accent); color: #FFF; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--bg-page); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }

    /* Tables */
    .table-container { width: 100%; overflow-x: auto; border-radius: 12px; border: 1px solid var(--border-color); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th { background: var(--bg-page); color: var(--text-muted); font-weight: 700; font-size: 12px; text-transform: uppercase; padding: 14px 16px; border-bottom: 1px solid var(--border-color); }
    td { padding: 16px; border-bottom: 1px solid var(--border-color); color: var(--text-main); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(0, 0, 0, 0.015); }
    [data-theme="dark"] tr:hover td { background: rgba(255, 255, 255, 0.02); }

    .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .badge-success { background: var(--badge-green-bg); color: var(--badge-green-text); }
    .badge-warning { background: var(--badge-amber-bg); color: var(--badge-amber-text); }
    .badge-danger { background: var(--badge-red-bg); color: var(--badge-red-text); }

    /* Pagination */
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; font-size: 13px; color: var(--text-muted); }
    .pagination-btn { padding: 6px 12px; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main); border-radius: 8px; cursor: pointer; }
    .pagination-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Skeleton Loading */
    .skeleton { background: linear-gradient(90deg, var(--border-color) 25%, var(--bg-page) 50%, var(--border-color) 75%); background-size: 200% 100%; animation: loading 1.5s infinite; border-radius: 8px; }
    @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* Modals & Dialogs */
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
    .modal-overlay.open { opacity: 1; pointer-events: auto; }
    .modal-box { background: var(--bg-surface); border-radius: 20px; border: 1px solid var(--border-color); width: min(90%, 540px); max-height: 85vh; overflow-y: auto; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); transform: scale(0.95); transition: transform 0.2s ease; }
    .modal-overlay.open .modal-box { transform: scale(1); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .modal-title { font-size: 18px; font-weight: 800; }
    .btn-close { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; }

    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; color: var(--text-muted); }
    .form-control { width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-page); color: var(--text-main); font-size: 14px; outline: none; }

    /* Toast Container */
    #toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 300; display: flex; flex-direction: column; gap: 10px; }
    .toast { background: var(--bg-sidebar); color: var(--text-sidebar); padding: 14px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px; animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* Print Label Stylesheet */
    @media print {
      @page { size: Letter; margin: 0; }
      body * { visibility: hidden; }
      #printable-labels, #printable-labels * { visibility: visible; }
      #printable-labels { position: absolute; left: 0; top: 0; width: 8.5in; min-height: 11in; display: grid; grid-template-columns: repeat(5, 1.5in); grid-auto-rows: 1in; gap: 0; padding: 0.5in; background: #FFF; }
      .qr-label-card { border: none; border-radius: 0; padding: 0.05in; width: 1.5in; height: 1in; text-align: left; page-break-inside: avoid; background: #FFF !important; color: #000 !important; box-shadow: none; overflow: hidden; }
      .qr-label-card svg { width: 0.62in; height: 0.62in; margin: 0.14in 0.04in 0 0; float: left; }
      .print-guidance { display: block !important; visibility: visible !important; position: fixed; bottom: 0.1in; left: 0.5in; font-size: 8pt; color: #000; }
    }
    
    .qr-label-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 16px; }
    .qr-label-card { border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; text-align: center; background: #FFF; color: #1D1D1F; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .qr-label-card svg { width: 120px; height: 120px; margin: 6px auto; display: block; }
    .qr-label-title { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }
    .qr-label-product { font-size: 13px; font-weight: 700; color: #007AFF; margin-top: 2px; }
    .qr-label-num { font-size: 15px; font-weight: 900; margin-top: 4px; }

    /* Responsive */
    @media (max-width: 900px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.mobile-open { transform: translateX(0); }
      .main-wrapper { margin-left: 0; }
      .mobile-menu-btn { display: block; }
      .content-area { padding: 16px; }
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="brand-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          GAMMS AEP
        </div>
        <div class="brand-subtitle">Control Center</div>
      </div>
      <nav class="nav-menu">
        <a class="nav-item" data-route="overview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Overview
        </a>
        <a class="nav-item" data-route="pos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 18v3"/><path d="M6 8h12"/><path d="M7 12h3M12 12h5"/></svg>
          POS
        </a>
        <a class="nav-item" data-route="sales">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          Ventas
        </a>
        <a class="nav-item" data-route="products">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          Productos
        </a>
        <a class="nav-item" data-route="inventory">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
          Inventario
        </a>
        <a class="nav-item" data-route="qr">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z"/><path d="M17 17h4v4h-4z"/><path d="M14 19h2v2h-2z"/></svg>
          Códigos QR
        </a>
        <a class="nav-item" data-route="print">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print Center
        </a>
        <a class="nav-item" data-route="rewards">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
          Rewards
        </a>
        <a class="nav-item" data-route="customers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Clientes
        </a>
        <a class="nav-item" data-route="sellers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          Vendedores
        </a>
        <a class="nav-item" data-route="activity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Auditoría
        </a>
        <a class="nav-item" data-route="settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuración
        </a>
        <a class="nav-item" data-route="system">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
          Sistema
        </a>
      </nav>
      <div class="sidebar-footer">
        GAMMS Group &copy; 2026<br>Multiplatform Systems
      </div>
    </aside>

    <!-- Main Section -->
    <div class="main-wrapper">
      <header class="top-header">
        <div class="header-left">
          <button class="mobile-menu-btn" id="mobileMenuToggle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="header-title" id="pageTitle">Overview</div>
        </div>
        <div class="header-right">
          <div class="event-badge">
            <span class="pulse-dot"></span>
            EVENTO ACTIVO
          </div>
          <button class="theme-toggle" id="themeToggle" title="Cambiar Tema">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </button>
          <button class="btn-logout" id="logoutBtn">Salir</button>
        </div>
      </header>

      <main class="content-area" id="contentArea">
        <!-- Rendered view injected here -->
      </main>
    </div>
  </div>

  <!-- Modal Component -->
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="modalTitle">Modal</div>
        <button class="btn-close" id="modalClose">&times;</button>
      </div>
      <div id="modalBody"></div>
    </div>
  </div>

  <!-- Toast Container -->
  <div id="toast-container"></div>

  <!-- Client-Side App Logic -->
  <script>
    const API_BASE = "/aep/api/admin";
    let currentRoute = "overview";
    let state = {
      theme: localStorage.getItem("gamms_theme") || "system",
      authenticated: false,
      user: null
    };

    // DOM Selectors
    const sidebar = document.getElementById("sidebar");
    const mobileMenuToggle = document.getElementById("mobileMenuToggle");
    const themeToggle = document.getElementById("themeToggle");
    const logoutBtn = document.getElementById("logoutBtn");
    const pageTitle = document.getElementById("pageTitle");
    const contentArea = document.getElementById("contentArea");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalClose = document.getElementById("modalClose");

    // Helper functions
    function formatMoney(cents) {
      return "C$ " + ((cents || 0) / 100).toFixed(2);
    }

    function showToast(msg, isError = false) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.innerHTML = (isError ? "⚠️ " : "✓ ") + msg;
      document.getElementById("toast-container").appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    function closeModal() {
      modalOverlay.classList.remove("open");
    }
    modalClose.addEventListener("click", closeModal);

    function openModal(title, contentHtml) {
      modalTitle.textContent = title;
      modalBody.innerHTML = contentHtml;
      modalOverlay.classList.add("open");
    }

    // Theme Manager
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
      showToast("Tema: " + nextTheme.toUpperCase());
    });

    // API Wrapper
    async function apiFetch(endpoint, options = {}) {
      try {
        const res = await fetch(API_BASE + endpoint, {
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...(options.headers || {})
          },
          ...options
        });
        
        if (res.status === 401 && endpoint !== "/login") {
          renderLogin();
          return { ok: false, code: "ADMIN_AUTH_REQUIRED" };
        }
        return res.json();
      } catch (err) {
        return { ok: false, code: "NETWORK_ERROR", message: err.message };
      }
    }

    // Check Session
    async function checkAuth() {
      const res = await apiFetch("/session");
      if (res.authenticated) {
        state.authenticated = true;
        state.user = res.user;
        navigate(getRouteFromUrl());
      } else {
        renderLogin();
      }
    }

    logoutBtn.addEventListener("click", async () => {
      await apiFetch("/logout", { method: "POST", body: "{}" });
      state.authenticated = false;
      renderLogin();
    });

    mobileMenuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
    });

    // Navigation Router
    function getRouteFromUrl() {
      const path = window.location.pathname.replace(/^\\/aep\\/controlcenter\\/?/, "");
      return path || "overview";
    }

    function navigate(route, pushState = true) {
      if (!state.authenticated) {
        renderLogin();
        return;
      }
      currentRoute = route;
      sidebar.classList.remove("mobile-open");

      document.querySelectorAll(".nav-item").forEach(el => {
        el.classList.toggle("active", el.getAttribute("data-route") === route);
      });

      if (pushState) {
        const newPath = "/aep/controlcenter/" + (route === "overview" ? "" : route);
        window.history.pushState({}, "", newPath);
      }

      const titles = {
        overview: "Overview", pos: "POS Operativo", sales: "Ventas Historicas", products: "Catalogo de Productos",
        inventory: "Inventario", qr: "Gestion de Codigos QR", print: "Print Center", rewards: "Rewards & Canjes", customers: "Clientes Anonimos",
        sellers: "Vendedores", activity: "Registro de Auditoria", settings: "Configuracion AEP", system: "Diagnostico del Sistema"
      };
      pageTitle.textContent = titles[route] || "Overview";

      renderRoute(route);
    }

    window.addEventListener("popstate", () => navigate(getRouteFromUrl(), false));

    document.querySelectorAll(".nav-item").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(el.getAttribute("data-route"));
      });
    });

    // ----------------------------------------------------
    // VIEWS RENDERERS
    // ----------------------------------------------------

    function renderLogin() {
      pageTitle.textContent = "Iniciar Sesión Administrador";
      contentArea.innerHTML = \`
        <div style="max-width: 420px; margin: 40px auto;">
          <div class="card">
            <div class="card-header" style="justify-content:center; flex-direction:column; text-align:center;">
              <div class="brand-title" style="font-size:22px;">GAMMS AEP</div>
              <div class="brand-subtitle">Control Center Login</div>
            </div>
            <form id="loginForm">
              <div class="form-group">
                <label class="form-label">Passcode de Administrador</label>
                <input id="adminPasscode" type="password" class="form-control" placeholder="••••••••" required autofocus>
              </div>
              <button type="submit" class="btn-primary" style="width:100%; justify-content:center; margin-top:8px;">
                Ingresar al Panel
              </button>
            </form>
          </div>
        </div>
      \`;

      document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const passcode = document.getElementById("adminPasscode").value;
        const res = await apiFetch("/login", {
          method: "POST",
          body: JSON.stringify({ passcode })
        });
        if (res.ok) {
          showToast("Sesión de administrador iniciada.");
          state.authenticated = true;
          navigate("overview");
        } else {
          showToast(res.code || "Credenciales inválidas", true);
        }
      });
    }

    async function renderRoute(route) {
      contentArea.innerHTML = \`<div class="card"><div class="skeleton" style="height: 200px;"></div></div>\`;

      switch (route) {
        case "overview": return renderOverview();
        case "pos": return renderPos();
        case "sales": return renderSales();
        case "products": return renderProducts();
        case "inventory": return renderInventory();
        case "qr": return renderQr();
        case "print": return renderPrintCenter();
        case "rewards": return renderRewards();
        case "customers": return renderCustomers();
        case "sellers": return renderSellers();
        case "activity": return renderActivity();
        case "settings": return renderSettings();
        case "system": return renderSystem();
        default: return renderOverview();
      }
    }

    // 1. OVERVIEW
    async function renderOverview() {
      const res = await apiFetch("/dashboard");
      if (!res.ok) {
        contentArea.innerHTML = \`<div class="card">Error cargando dashboard</div>\`;
        return;
      }
      const { overview, recentSales, topProducts, lowStockProducts } = res.stats;

      contentArea.innerHTML = \`
        <div class="grid-stats">
          <div class="stat-card">
            <div class="stat-header">
              <span>REVENUE HOY</span>
              <div class="stat-icon">$</div>
            </div>
            <div class="stat-value">\${formatMoney(overview.todayRevenueCents)}</div>
            <div class="stat-sub">Total histórico: \${formatMoney(overview.totalRevenueCents)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">
              <span>BEBIDAS VENDIDAS</span>
              <div class="stat-icon">🥤</div>
            </div>
            <div class="stat-value">\${overview.todaySalesCount}</div>
            <div class="stat-sub">Ventas totales: \${overview.totalSalesCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">
              <span>REWARDS CANJEADOS</span>
              <div class="stat-icon">🎁</div>
            </div>
            <div class="stat-value">\${overview.redeemedRewardsCount}</div>
            <div class="stat-sub">Disponibles: \${overview.availableRewardsCount} | Claims: \${overview.activeClaimsCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">
              <span>QR DISPONIBLES</span>
              <div class="stat-icon">🏷️</div>
            </div>
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
                <thead>
                  <tr><th>Producto</th><th>QR #</th><th>Monto</th><th>Descuento</th></tr>
                </thead>
                <tbody>
                  \${recentSales.map(s => \`
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
                <thead>
                  <tr><th>Producto</th><th>Ventas</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  \${topProducts.map(p => \`
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

    // POS
    async function renderPos() {
      const recent = await apiFetch("/sales?limit=10");
      contentArea.innerHTML = \`
        <div style="display:grid; grid-template-columns:minmax(320px, 1fr) minmax(320px, 1fr); gap:24px;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">Canje POS 50%</div>
              <span class="badge badge-success">ONLINE</span>
            </div>
            <div class="form-group">
              <label class="form-label">Codigo de claim o lectura de scanner</label>
              <input id="posClaimInput" class="form-control" placeholder="GAMMS-AEP-CLAIM:ABCD-EFGH-23" autofocus>
            </div>
            <div class="filter-bar">
              <button class="btn-secondary" onclick="previewPosClaim()">Previsualizar</button>
              <button class="btn-primary" onclick="redeemPosClaim()">Canjear 50%</button>
            </div>
            <div id="posPreview" style="margin-top:18px;"></div>
          </div>
          <div class="card">
            <div class="card-header">
              <div class="card-title">Ultimas ventas</div>
              <button class="btn-secondary" onclick="renderSales()">Ver ventas</button>
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
      document.getElementById("posClaimInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") previewPosClaim();
      });
    }

    function normalizeClaimInput(value) {
      return String(value || "").trim().replace(/^GAMMS-AEP-CLAIM:/i, "").trim();
    }

    async function previewPosClaim() {
      const input = document.getElementById("posClaimInput");
      const code = normalizeClaimInput(input.value);
      const box = document.getElementById("posPreview");
      if (!code) return showToast("Ingresa un claim.", true);
      const res = await apiFetch("/pos/claims/" + encodeURIComponent(code));
      if (!res.ok) {
        box.innerHTML = \`<div class="badge badge-danger">\${res.code || "CLAIM_INVALID"}</div>\`;
        return;
      }
      box.innerHTML = \`
        <div class="card" style="margin:0; box-shadow:none;">
          <div class="card-title">\${res.product.name}</div>
          <p style="margin-top:8px;">QR #\${res.qr.number}</p>
          <p style="margin-top:8px;">Precio normal: <strong>\${formatMoney(res.pricing.regularPriceCents)}</strong></p>
          <p>Descuento: <strong>\${res.pricing.discountPercent}%</strong></p>
          <p>Total POS: <strong>\${formatMoney(res.pricing.finalPriceCents)}</strong></p>
        </div>
      \`;
    }

    async function redeemPosClaim() {
      const code = normalizeClaimInput(document.getElementById("posClaimInput").value);
      if (!code) return showToast("Ingresa un claim.", true);
      const res = await apiFetch("/pos/redeem", { method: "POST", body: JSON.stringify({ code }) });
      if (!res.ok) return showToast(res.code || "No se pudo canjear.", true);
      showToast("Canje registrado: " + formatMoney(res.purchase.finalPriceCents));
      renderPos();
    }

    // 2. SALES
    async function renderSales(page = 1) {
      const query = document.getElementById("salesSearch")?.value || "";
      const res = await apiFetch(\`/sales?page=\${page}&q=\${encodeURIComponent(query)}\`);
      if (!res.ok) return;

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
              <thead>
                <tr><th>ID</th><th>Fecha/Hora</th><th>Producto</th><th>QR #</th><th>Normal</th><th>Descuento</th><th>Final</th><th>Cliente</th></tr>
              </thead>
              <tbody>
                \${res.items.map(s => \`
                  <tr>
                    <td>#\${s.id}</td>
                    <td>\${s.createdAt}</td>
                    <td><strong>\${s.productName}</strong></td>
                    <td>#\${s.qrPublicNumber}</td>
                    <td>\${formatMoney(s.regularPriceCents)}</td>
                    <td>\${s.discountPercent > 0 ? \`<span class="badge badge-warning">\${s.discountPercent}%</span>\` : '0%'}</td>
                    <td><strong>\${formatMoney(s.finalPriceCents)}</strong></td>
                    <td>\${s.customerLabel}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
          <div class="pagination-bar">
            <span>Página \${res.pagination.page} de \${res.pagination.totalPages}</span>
            <div>
              <button class="pagination-btn" \${res.pagination.page <= 1 ? 'disabled' : ''} onclick="renderSales(\${res.pagination.page - 1})">Anterior</button>
              <button class="pagination-btn" \${res.pagination.page >= res.pagination.totalPages ? 'disabled' : ''} onclick="renderSales(\${res.pagination.page + 1})">Siguiente</button>
            </div>
          </div>
        </div>
      \`;

      document.getElementById("salesSearch").addEventListener("keyup", (e) => {
        if (e.key === "Enter") renderSales(1);
      });
    }

    // 3. PRODUCTS
    async function renderProducts() {
      const res = await apiFetch("/products");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Gestión de Productos</div>
            <div class="filter-bar">
              <button class="btn-primary" onclick="showCreateProductModal()">+ Nuevo Producto</button>
              <button class="btn-secondary" onclick="exportCsv('products')">Exportar CSV</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>QR Disponibles</th><th>Ventas</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                \${res.items.map(p => \`
                  <tr>
                    <td><strong>\${p.name}</strong><br><small style="color:var(--text-muted)">\${p.description || 'Sin descripción'}</small></td>
                    <td>\${p.category}</td>
                    <td><strong>\${formatMoney(p.priceCents)}</strong></td>
                    <td>
                      \${p.isLowStock ? \`<span class="badge badge-danger">\${p.stockQuantity} ud (Bajo Stock)</span>\` : \`<span>\${p.stockQuantity} ud</span>\`}
                    </td>
                    <td>\${p.availableQrCount} disponible(s)</td>
                    <td>\${p.salesCount} (\${formatMoney(p.revenueCents)})</td>
                    <td>\${p.active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
                    <td>
                      <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="showStockModal(\${p.id}, '\${p.name}', \${p.stockQuantity})">Stock</button>
                      <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="showEditProductModal(\${JSON.stringify(p).replace(/"/g, '&quot;')})">Editar</button>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function showCreateProductModal() {
      openModal("Nuevo Producto", \`
        <form id="createProductForm">
          <div class="form-group">
            <label class="form-label">Nombre del Producto</label>
            <input name="name" class="form-control" required placeholder="Ej: Coca-Cola 500ml">
          </div>
          <div class="form-group">
            <label class="form-label">Categoría</label>
            <input name="category" class="form-control" value="bebidas">
          </div>
          <div class="form-group">
            <label class="form-label">Precio en Céntimos (Ej: 4000 = C$ 40.00)</label>
            <input name="priceCents" type="number" class="form-control" required value="4000">
          </div>
          <div class="form-group">
            <label class="form-label">Stock Inicial</label>
            <input name="stockQuantity" type="number" class="form-control" value="50">
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Guardar Producto</button>
        </form>
      \`);

      document.getElementById("createProductForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const res = await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
        if (res.ok) {
          showToast("Producto creado correctamente.");
          closeModal();
          renderProducts();
        } else {
          showToast(res.code || "Error al crear producto", true);
        }
      });
    }

    function showEditProductModal(product) {
      openModal("Editar Producto: " + product.name, \`
        <form id="editProductForm">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input name="name" class="form-control" value="\${product.name}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Precio en Céntimos</label>
            <input name="priceCents" type="number" class="form-control" value="\${product.priceCents}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select name="active" class="form-control">
              <option value="true" \${product.active ? 'selected' : ''}>Activo</option>
              <option value="false" \${!product.active ? 'selected' : ''}>Inactivo</option>
            </select>
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Actualizar Producto</button>
        </form>
      \`);

      document.getElementById("editProductForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        payload.active = payload.active === "true";
        const res = await apiFetch("/products/" + product.id, { method: "PUT", body: JSON.stringify(payload) });
        if (res.ok) {
          showToast("Producto actualizado.");
          closeModal();
          renderProducts();
        } else {
          showToast(res.code || "Error actualizando producto", true);
        }
      });
    }

    function showStockModal(productId, productName, currentStock) {
      openModal("Ajustar Stock: " + productName, \`
        <form id="adjustStockForm">
          <p style="margin-bottom:12px; font-size:14px;">Stock actual: <strong>\${currentStock} ud</strong></p>
          <div class="form-group">
            <label class="form-label">Tipo de Movimiento</label>
            <select name="movement_type" class="form-control">
              <option value="restock">Restock (+)</option>
              <option value="adjustment">Ajuste / Corrección</option>
              <option value="return">Devolución (+)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cambio en Cantidad (+ o -)</label>
            <input name="quantity_delta" type="number" class="form-control" required placeholder="Ej: 20 o -5">
          </div>
          <div class="form-group">
            <label class="form-label">Razón</label>
            <input name="reason" class="form-control" required value="Restock administrativo manual">
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Guardar Ajuste</button>
        </form>
      \`);

      document.getElementById("adjustStockForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        payload.product_id = productId;
        const res = await apiFetch("/inventory/adjust", { method: "POST", body: JSON.stringify(payload) });
        if (res.ok) {
          showToast("Inventario actualizado.");
          closeModal();
          renderProducts();
        } else {
          showToast(res.message || res.code || "Error ajustando stock", true);
        }
      });
    }

    async function renderInventory(page = 1) {
      const res = await apiFetch(\`/inventory?page=\${page}\`);
      if (!res.ok) return;
      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Ledger de Inventario</div>
            <button class="btn-secondary" onclick="exportCsv('inventory')">Exportar CSV</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cambio</th><th>Purchase</th><th>Razon</th><th>Actor</th></tr></thead>
              <tbody>
                \${res.items.map(m => \`
                  <tr>
                    <td>#\${m.id}</td>
                    <td>\${m.createdAt}</td>
                    <td><strong>\${m.productName}</strong></td>
                    <td><span class="badge \${m.movementType === 'sale' ? 'badge-warning' : 'badge-success'}">\${m.movementType}</span></td>
                    <td><strong>\${m.quantityDelta}</strong></td>
                    <td>\${m.purchaseId ? '#' + m.purchaseId : '-'}</td>
                    <td>\${m.reason}</td>
                    <td>\${m.actorType}:\${m.actorIdentifier || ''}</td>
                  </tr>
                \`).join('') || '<tr><td colspan="8" style="text-align:center">Sin movimientos</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="pagination-bar">
            <span>Pagina \${res.pagination.page} de \${res.pagination.totalPages}</span>
            <div>
              <button class="pagination-btn" \${res.pagination.page <= 1 ? 'disabled' : ''} onclick="renderInventory(\${res.pagination.page - 1})">Anterior</button>
              <button class="pagination-btn" \${res.pagination.page >= res.pagination.totalPages ? 'disabled' : ''} onclick="renderInventory(\${res.pagination.page + 1})">Siguiente</button>
            </div>
          </div>
        </div>
      \`;
    }

    // 4. QR MANAGEMENT
    async function renderQr(page = 1) {
      const res = await apiFetch(\`/qr?page=\${page}\`);
      const prodRes = await apiFetch("/products");
      const products = prodRes.items || [];

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Inventario de Códigos QR</div>
            <div class="filter-bar">
              <button class="btn-primary" onclick="showGenerateQrModal(\${JSON.stringify(products).replace(/"/g, '&quot;')})">⚡ Generar Lote de QR</button>
              <button class="btn-secondary" onclick="exportCsv('qr')">Exportar CSV</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Público #</th><th>Producto Asignado</th><th>Estado</th><th>Creado En</th><th>Usado En</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                \${res.items.map(q => \`
                  <tr>
                    <td><strong>#\${q.publicNumber}</strong></td>
                    <td>\${q.productName} (\${formatMoney(q.productPriceCents)})</td>
                    <td>
                      \${q.status === 'available' ? '<span class="badge badge-success">Disponible</span>' :
                        (q.status === 'used' ? '<span class="badge badge-warning">Usado</span>' : '<span class="badge badge-danger">Deshabilitado</span>')}
                    </td>
                    <td>\${q.createdAt}</td>
                    <td>\${q.usedAt || '-'}</td>
                    <td>
                      \${q.status === 'available' ? \`<button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="disableQr(\${q.publicNumber})">Deshabilitar</button>\` : ''}
                      \${q.status === 'disabled' ? \`<button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="reactivateQr(\${q.publicNumber})">Reactivar</button>\` : ''}
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
          <div class="pagination-bar">
            <span>Página \${res.pagination.page} de \${res.pagination.totalPages}</span>
            <div>
              <button class="pagination-btn" \${res.pagination.page <= 1 ? 'disabled' : ''} onclick="renderQr(\${res.pagination.page - 1})">Anterior</button>
              <button class="pagination-btn" \${res.pagination.page >= res.pagination.totalPages ? 'disabled' : ''} onclick="renderQr(\${res.pagination.page + 1})">Siguiente</button>
            </div>
          </div>
        </div>
      \`;
    }

    function showGenerateQrModal(products) {
      openModal("Generar Lote de Códigos QR Imprimibles", \`
        <form id="generateQrForm">
          <div class="form-group">
            <label class="form-label">Producto Asignado</label>
            <select name="product_id" class="form-control" required>
              \${products.map(p => \`<option value="\${p.id}">\${p.name} (\${formatMoney(p.priceCents)})\</option>\`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cantidad a Generar (Máx 500)</label>
            <input name="count" type="number" class="form-control" value="20" min="1" max="500" required>
          </div>
          <div class="form-group">
            <label class="form-label">Numeración Inicial Pública (Opcional)</label>
            <input name="start_number" type="number" class="form-control" placeholder="Auto-incrementar">
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Generar y Ver Etiquetas</button>
        </form>
      \`);

      document.getElementById("generateQrForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const res = await apiFetch("/qr/generate", { method: "POST", body: JSON.stringify(payload) });
        if (res.ok) {
          showToast(\`Se generaron \${res.count} códigos QR correctamente.\`);
          closeModal();
          showPrintLabelsModal(res.items);
          renderQr();
        } else {
          showToast(res.message || res.code || "Error generando QR", true);
        }
      });
    }

    function showPrintLabelsModal(qrItems) {
      openModal("Etiquetas Generadas para Impresión (" + qrItems.length + ")", \`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <p style="font-size:13px; color:var(--text-muted)">Haz clic en Imprimir para enviar a la impresora de etiquetas.</p>
          <button class="btn-primary" onclick="window.print()">🖨️ Imprimir Etiquetas</button>
        </div>
        <div id="printable-labels" class="qr-label-grid">
          \${qrItems.map(item => \`
            <div class="qr-label-card">
              <div class="qr-label-title">GAMMS AEP</div>
              <div class="qr-label-product">\${item.product.name}</div>
              \${item.svg}
              <div class="qr-label-num">#\${item.publicNumber}</div>
            </div>
          \`).join('')}
        </div>
      \`);
    }

    let currentPrintBatch = null;

    async function renderPrintCenter() {
      const [productsRes, profilesRes, batchesRes] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/print/profiles"),
        apiFetch("/qr/batches?limit=10")
      ]);
      const products = productsRes.items || [];
      const profiles = profilesRes.profiles || [];
      contentArea.innerHTML = \`
        <div style="display:grid; grid-template-columns:minmax(320px, 420px) 1fr; gap:24px;">
          <div class="card">
            <div class="card-header"><div class="card-title">Studio MACO ML-5000</div></div>
            <form id="printGenerateForm">
              <div class="form-group">
                <label class="form-label">Producto</label>
                <select name="productId" class="form-control" required>
                  \${products.map(p => \`<option value="\${p.id}">\${p.name} - \${formatMoney(p.priceCents)}</option>\`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Perfil</label>
                <select name="printProfileId" id="printProfileId" class="form-control" required>
                  \${profiles.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('')}
                </select>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div class="form-group"><label class="form-label">Cantidad</label><input name="count" type="number" min="1" max="500" value="50" class="form-control" required></div>
                <div class="form-group"><label class="form-label">Numero inicial</label><input name="startNumber" type="number" min="1" class="form-control" placeholder="Auto"></div>
              </div>
              <div class="form-group"><label class="form-label">Primer slot de hoja parcial</label><input name="startSlot" type="number" min="1" max="50" value="1" class="form-control"></div>
              <div class="filter-bar">
                <button type="submit" class="btn-primary">Generar lote</button>
                <button type="button" class="btn-secondary" onclick="loadCalibration()">Calibrar</button>
              </div>
            </form>
          </div>
          <div>
            <div class="card">
              <div class="card-header">
                <div class="card-title">Preview seguro</div>
                <div class="filter-bar">
                  <button class="btn-secondary" onclick="printCurrentBatch()">Imprimir</button>
                  <button class="btn-primary" onclick="downloadCurrentPdf()">PDF</button>
                </div>
              </div>
              <p style="color:var(--text-muted); font-size:13px; margin-bottom:12px;">Los tokens aparecen solo en esta sesion de creacion. No se guardan en historial ni en base de datos.</p>
              <div id="printPreview"><p style="color:var(--text-muted)">Genera un lote para ver la hoja.</p></div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title">Ultimos batches</div></div>
              <div class="table-container">
                <table><thead><tr><th>Batch</th><th>Producto</th><th>Rango</th><th>Cantidad</th><th>Perfil</th></tr></thead><tbody>
                  \${(batchesRes.items || []).map(b => \`<tr><td><small>\${b.id}</small></td><td>\${b.productName}</td><td>#\${b.firstPublicNumber}-#\${b.lastPublicNumber}</td><td>\${b.quantity}</td><td>\${b.printProfileName || '-'}</td></tr>\`).join('') || '<tr><td colspan="5" style="text-align:center">Sin batches</td></tr>'}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>
      \`;
      document.getElementById("printGenerateForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(event.target).entries());
        const res = await apiFetch("/qr/generate", { method: "POST", body: JSON.stringify(payload) });
        if (!res.ok) return showToast(res.message || res.code || "Error generando lote", true);
        currentPrintBatch = res;
        renderPrintPreview(res);
        showToast("Batch " + res.batchId + " generado.");
      });
    }

    function renderPrintPreview(batch) {
      document.getElementById("printPreview").innerHTML = \`
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
          <span class="badge badge-success">Batch \${batch.batchId}</span>
          <span class="badge badge-warning">Slot inicial \${batch.startSlot}</span>
          <span class="badge badge-success">\${batch.count} etiquetas</span>
        </div>
        <div id="printable-labels" class="qr-label-grid">
          <div class="print-guidance" style="display:none;">Imprimir a Tamaño real / 100%. Desactivar Ajustar a pagina.</div>
          \${batch.items.map(item => \`<div class="qr-label-card"><div class="qr-label-title">GAMMS AEP</div><div class="qr-label-product">\${item.product.name}</div>\${item.svg}<div class="qr-label-num">#\${item.publicNumber}</div></div>\`).join('')}
        </div>
      \`;
    }

    async function downloadCurrentPdf() {
      if (!currentPrintBatch) return showToast("Genera un batch primero.", true);
      const res = await fetch(API_BASE + "/print/pdf", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/pdf" },
        body: JSON.stringify({
          batchId: currentPrintBatch.batchId,
          printProfileId: currentPrintBatch.printProfile?.id,
          startSlot: currentPrintBatch.startSlot,
          items: currentPrintBatch.items.map(item => ({ token: item.token }))
        })
      });
      if (!res.ok) return showToast("No se pudo generar PDF.", true);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gamms-aep-labels-" + currentPrintBatch.batchId + ".pdf";
      link.click();
      URL.revokeObjectURL(url);
    }

    function printCurrentBatch() {
      if (!currentPrintBatch) return showToast("Genera un batch primero.", true);
      window.print();
    }

    async function loadCalibration() {
      const profileId = document.getElementById("printProfileId")?.value;
      const res = await apiFetch("/print/calibration", { method: "POST", body: JSON.stringify({ printProfileId: profileId }) });
      if (!res.ok) return showToast(res.code || "Error de calibracion", true);
      openModal("Calibracion " + res.profile.name, \`
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Slots detectados: \${res.slots.length}. Usa offset/scale del perfil si la impresora desplaza la hoja.</p>
        <div class="table-container"><table><thead><tr><th>Slot</th><th>Fila</th><th>Col</th><th>X pt</th><th>Y pt</th></tr></thead><tbody>
          \${res.slots.slice(0, 10).map(s => \`<tr><td>\${s.slot}</td><td>\${s.row}</td><td>\${s.column}</td><td>\${s.x.toFixed(2)}</td><td>\${s.y.toFixed(2)}</td></tr>\`).join('')}
        </tbody></table></div>
      \`);
    }

    async function disableQr(num) {
      const res = await apiFetch(\`/qr/\${num}/disable\`, { method: "POST", body: "{}" });
      if (res.ok) { showToast("QR #" + num + " deshabilitado."); renderQr(); }
      else { showToast(res.message || res.code, true); }
    }

    async function reactivateQr(num) {
      const res = await apiFetch(\`/qr/\${num}/reactivate\`, { method: "POST", body: "{}" });
      if (res.ok) { showToast("QR #" + num + " reactivado."); renderQr(); }
      else { showToast(res.message || res.code, true); }
    }

    // 5. REWARDS
    async function renderRewards(page = 1) {
      const res = await apiFetch(\`/rewards?page=\${page}\`);
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Rewards y Canjes Registrados</div>
            <button class="btn-secondary" onclick="exportCsv('rewards')">Exportar CSV</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Cliente</th><th>Ciclo</th><th>Beneficio</th><th>Estado</th><th>Desbloqueado</th><th>Canjeado</th><th>Acción</th></tr>
              </thead>
              <tbody>
                \${res.items.map(r => \`
                  <tr>
                    <td>#\${r.id}</td>
                    <td><strong>\${r.customerLabel}</strong></td>
                    <td>Ciclo \${r.cycleNumber}</td>
                    <td>\${r.discountPercent}% Descuento 3ra bebida</td>
                    <td>
                      \${r.status === 'available' ? '<span class="badge badge-success">Disponible</span>' :
                        (r.status === 'redeemed' ? '<span class="badge badge-warning">Canjeado</span>' : '<span class="badge badge-danger">Cancelado</span>')}
                    </td>
                    <td>\${r.unlockedAt}</td>
                    <td>\${r.redeemedAt || '-'}</td>
                    <td>
                      \${r.status === 'available' ? \`<button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="cancelReward(\${r.id})">Cancelar Reward</button>\` : '-'}
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function cancelReward(id) {
      if (!confirm("¿Seguro que deseas cancelar este reward? Esta acción quedará registrada en auditoría.")) return;
      const res = await apiFetch(\`/rewards/\${id}/cancel\`, { method: "POST", body: "{}" });
      if (res.ok) { showToast("Reward #" + id + " cancelado."); renderRewards(); }
      else { showToast(res.message || res.code, true); }
    }

    // 6. CUSTOMERS
    async function renderCustomers(page = 1) {
      const res = await apiFetch(\`/customers?page=\${page}\`);
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Clientes Anónimos (\${res.pagination.total})</div>
            <button class="btn-secondary" onclick="exportCsv('customers')">Exportar CSV</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Compras</th><th>Progreso Ciclo</th><th>Rewards Ganados</th><th>Rewards Usados</th><th>Gastado Total</th><th>Última Actividad</th></tr>
              </thead>
              <tbody>
                \${res.items.map(c => \`
                  <tr>
                    <td><strong>\${c.idMasked}</strong></td>
                    <td>\${c.purchaseCount} compras</td>
                    <td>\${c.cyclePosition}/3</td>
                    <td>\${c.rewardsEarned}</td>
                    <td>\${c.rewardsRedeemed}</td>
                    <td><strong>\${formatMoney(c.totalSpentCents)}</strong></td>
                    <td>\${c.lastSeenAt}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 7. SELLERS
    async function renderSellers() {
      const res = await apiFetch("/sellers");
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Cuentas de Vendedores</div>
            <button class="btn-primary" onclick="showCreateSellerModal()">+ Crear Vendedor</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Nombre</th><th>Usuario</th><th>Estado</th><th>Último Login</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                \${res.sellers.map(s => \`
                  <tr>
                    <td>#\${s.id}</td>
                    <td><strong>\${s.displayName}</strong></td>
                    <td>\${s.username || 'Global fallback'}</td>
                    <td>\${s.active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
                    <td>\${s.lastLoginAt || 'Nunca'}</td>
                    <td>
                      <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="showResetSellerPasscode(\${s.id}, '\${s.displayName}')">Reset Passcode</button>
                    </td>
                  </tr>
                \`).join('') || '<tr><td colspan="6" style="text-align:center">No hay vendedores individuales creados en DB. Se usa el passcode global de fallback.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function showCreateSellerModal() {
      openModal("Nuevo Vendedor", \`
        <form id="createSellerForm">
          <div class="form-group">
            <label class="form-label">Nombre del Vendedor</label>
            <input name="displayName" class="form-control" required placeholder="Ej: Juan Pérez">
          </div>
          <div class="form-group">
            <label class="form-label">Nombre de Usuario (Opcional)</label>
            <input name="username" class="form-control" placeholder="vendedor1">
          </div>
          <div class="form-group">
            <label class="form-label">Passcode de Acceso (Mínimo 4 caracteres)</label>
            <input name="passcode" type="password" class="form-control" required placeholder="••••">
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Crear Vendedor</button>
        </form>
      \`);

      document.getElementById("createSellerForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const res = await apiFetch("/sellers", { method: "POST", body: JSON.stringify(payload) });
        if (res.ok) {
          showToast("Vendedor creado.");
          closeModal();
          renderSellers();
        } else {
          showToast(res.code || "Error al crear vendedor", true);
        }
      });
    }

    function showResetSellerPasscode(id, name) {
      openModal("Reset Passcode: " + name, \`
        <form id="resetPasscodeForm">
          <div class="form-group">
            <label class="form-label">Nuevo Passcode</label>
            <input name="passcode" type="password" class="form-control" required placeholder="••••">
          </div>
          <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">Cambiar Passcode</button>
        </form>
      \`);

      document.getElementById("resetPasscodeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const passcode = e.target.passcode.value;
        const res = await apiFetch("/sellers/" + id + "/reset-passcode", { method: "POST", body: JSON.stringify({ passcode }) });
        if (res.ok) {
          showToast("Passcode actualizado para " + name);
          closeModal();
        } else {
          showToast(res.code || "Error reseteando passcode", true);
        }
      });
    }

    // 8. ACTIVITY / AUDIT
    async function renderActivity(page = 1) {
      const res = await apiFetch(\`/activity?page=\${page}\`);
      if (!res.ok) return;

      contentArea.innerHTML = \`
        <div class="card">
          <div class="card-header">
            <div class="card-title">Registro de Auditoría y Eventos</div>
            <button class="btn-secondary" onclick="exportCsv('activity')">Exportar CSV</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Fecha/Hora</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Detalles</th></tr>
              </thead>
              <tbody>
                \${res.items.map(a => \`
                  <tr>
                    <td>#\${a.id}</td>
                    <td>\${a.createdAt}</td>
                    <td><strong>\${a.actorType}:\${a.actorIdentifier}</strong></td>
                    <td><span class="badge badge-success">\${a.action}</span></td>
                    <td>\${a.entityType} \${a.entityIdentifier ? '#' + a.entityIdentifier : ''}</td>
                    <td><small style="font-family:monospace; color:var(--text-muted)">\${a.metadata ? JSON.stringify(a.metadata) : '-'}</small></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // 9. SETTINGS
    async function renderSettings() {
      const res = await apiFetch("/settings");
      if (!res.ok) return;
      const s = res.settings;

      contentArea.innerHTML = \`
        <div class="card" style="max-width: 650px;">
          <div class="card-header">
            <div class="card-title">Configuración del Evento AEP</div>
          </div>
          <form id="settingsForm">
            <div class="form-group">
              <label class="form-label">Nombre del Evento</label>
              <input name="event_name" class="form-control" value="\${s.event_name}">
            </div>
            <div class="form-group">
              <label class="form-label">Moneda (Código y Símbolo)</label>
              <div style="display:flex; gap:10px;">
                <input name="currency_code" class="form-control" value="\${s.currency_code}" placeholder="NIO">
                <input name="currency_symbol" class="form-control" value="\${s.currency_symbol}" placeholder="C$">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">TTL de Claim Temporal (Segundos)</label>
              <input name="claim_ttl_seconds" type="number" class="form-control" value="\${s.claim_ttl_seconds}">
            </div>
            <div class="form-group">
              <label class="form-label">Regla de Promoción</label>
              <div style="display:flex; gap:10px;">
                <input name="reward_every_n_purchases" type="number" class="form-control" value="\${s.reward_every_n_purchases}" readonly title="Fijo en esta fase (3ra bebida)">
                <input name="reward_discount_percent" type="number" class="form-control" value="\${s.reward_discount_percent}" readonly title="Fijo en esta fase (50%)">
              </div>
            </div>
            <button type="submit" class="btn-primary" style="margin-top:12px;">Guardar Configuración</button>
          </form>
        </div>
      \`;

      document.getElementById("settingsForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const res = await apiFetch("/settings", { method: "PUT", body: JSON.stringify({ settings: payload }) });
        if (res.ok) {
          showToast("Configuración guardada.");
        } else {
          showToast(res.code || "Error guardando configuración", true);
        }
      });
    }

    // 10. SYSTEM
    async function renderSystem() {
      const res = await apiFetch("/system");
      if (!res.ok) return;
      const sys = res.system;

      contentArea.innerHTML = \`
        <div class="card" style="max-width: 650px;">
          <div class="card-header">
            <div class="card-title">Estado y Diagnóstico del Sistema</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:14px; font-size:14px;">
            <div><strong>Aplicación:</strong> \${sys.appName} v\${sys.version}</div>
            <div><strong>Conectividad D1:</strong> <span class="badge badge-success">\${sys.d1Connectivity}</span></div>
            <div><strong>Entorno:</strong> \${sys.environment}</div>
            <div><strong>Zona Horaria Evento:</strong> \${sys.eventTimezone}</div>
            <div><strong>Hora UTC Actual:</strong> \${sys.utcTime}</div>
            <div><strong>Tablas DB Conocidas:</strong><br>
              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                \${sys.knownTables.map(t => \`<span class="badge" style="background:var(--bg-page); color:var(--text-main); border:1px solid var(--border-color);">\${t}</span>\`).join('')}
              </div>
            </div>
          </div>
        </div>
      \`;
    }

    // CSV Export Helper
    function exportCsv(type) {
      window.open(API_BASE + "/" + type + "?format=csv", "_blank");
    }

    // Initialize App
    applyTheme(state.theme);
    checkAuth();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}
