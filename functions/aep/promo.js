export function onRequestGet() {
  return new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>GAMMS AEP Promo</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
    }
    main {
      width: min(100%, 420px);
      border: 1px solid #d7d7dc;
      border-radius: 12px;
      background: #fff;
      padding: 24px;
      box-shadow: 0 12px 40px rgb(0 0 0 / 8%);
    }
    .header-byline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 12px;
    }
    .label {
      margin: 0;
      color: #6e6e73;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .gamms-byline {
      flex: 0 0 auto;
      font-size: 11px;
      color: #86868b;
      letter-spacing: .02em;
    }
    .gamms-byline strong {
      color: #1d1d1f;
      font-weight: 700;
    }
    h1 { margin: 0 0 12px; font-size: 26px; line-height: 1.1; }
    p { margin: 0; color: #424245; line-height: 1.5; }
    .customer-badge {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 10px;
      border-radius: 20px;
      background: #e8e8ed;
      font-size: 13px;
      font-weight: 600;
      color: #1d1d1f;
    }
    .state { margin-top: 18px; padding: 14px; border-radius: 10px; background: #f5f5f7; }
    .state strong { display: block; margin-bottom: 4px; color: #1d1d1f; }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 18px;
    }
    .stat {
      padding: 12px;
      border-radius: 10px;
      background: #f5f5f7;
    }
    .stat .value { display: block; font-size: 24px; font-weight: 800; color: #1d1d1f; }
    .stat .caption { display: block; margin-top: 2px; color: #6e6e73; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .input-field {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #d2d2d7;
      border-radius: 8px;
      font-size: 16px;
      margin-top: 12px;
      margin-bottom: 14px;
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 8px;
      padding: 13px 16px;
      background: #1d1d1f;
      color: #fff;
      font: 700 15px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      transition: background .15s ease;
    }
    button:hover { background: #333336; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .ok { color: #0a7a2f; background: #e8f5e9; }
    .bad { color: #b42318; background: #fde8e8; }
    .footer-byline {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px solid #e5e5ea;
      text-align: center;
    }
    .mono { margin-top: 10px; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; color: #86868b; overflow-wrap: anywhere; }
    @media (prefers-color-scheme: dark) {
      body { background: #1d1d1f; color: #f5f5f7; }
      main { background: #2c2c2e; border-color: #3a3a3c; }
      p, .label, .mono { color: #aaaaaa; }
      .gamms-byline strong, .state strong, .stat .value { color: #f5f5f7; }
      .customer-badge, .state, .stat { background: #1d1d1f; color: #f5f5f7; }
      .state.ok { background: #1b3823; color: #4caf50; }
      .state.bad { background: #3c1e1e; color: #f44336; }
      .stat .caption { color: #aaaaaa; }
      .input-field { background: #1d1d1f; border-color: #48484a; color: #fff; }
      button { background: #f5f5f7; color: #1d1d1f; }
      button:hover { background: #e5e5ea; }
      .footer-byline { border-top-color: #3a3a3c; }
    }
  </style>
</head>
<body>
  <main>
    <div class="header-byline">
      <p class="label">GAMMS AEP</p>
      <div class="gamms-byline">By <strong>GAMMS GROUP</strong></div>
    </div>

    <section id="loadingSection">
      <h1>GAMMS AEP</h1>
      <p>Preparando tu perfil de cliente.</p>
      <div class="state">Consultando servidor...</div>
    </section>

    <section id="onboardingSection" hidden>
      <h1>Bienvenido</h1>
      <p>Como te llamas?</p>
      <input type="text" id="nameInput" class="input-field" placeholder="Tu nombre" maxlength="60" autocomplete="given-name">
      <button id="saveNameButton" type="button">Continuar</button>
      <div class="state bad" id="nameError" hidden></div>
    </section>

    <section id="promoSection" hidden>
      <h1 id="displayName">GAMMS AEP</h1>
      <p id="customerLabel"></p>
      <div class="customer-badge" id="customerBadge"></div>

      <div class="state ok">
        <strong>Escanea el QR de tu bebida</strong>
        Para registrar una compra necesitas abrir el QR fisico impreso en la etiqueta de tu bebida.
      </div>

      <div class="stats" id="stats" hidden>
        <div class="stat">
          <span class="value" id="purchaseCount">0</span>
          <span class="caption">Compras</span>
        </div>
        <div class="stat">
          <span class="value" id="availableRewards">0</span>
          <span class="caption">Rewards</span>
        </div>
      </div>

      <div class="state" id="rewardState" hidden></div>
    </section>

    <div class="footer-byline">
      <div class="gamms-byline">By <strong>GAMMS GROUP</strong></div>
      <div class="mono">Ruta cliente: /aep/promo</div>
    </div>
  </main>

  <script>
    const loadingSection = document.getElementById("loadingSection");
    const onboardingSection = document.getElementById("onboardingSection");
    const promoSection = document.getElementById("promoSection");
    const nameInput = document.getElementById("nameInput");
    const saveNameButton = document.getElementById("saveNameButton");
    const nameError = document.getElementById("nameError");
    const displayName = document.getElementById("displayName");
    const customerLabel = document.getElementById("customerLabel");
    const customerBadge = document.getElementById("customerBadge");
    const stats = document.getElementById("stats");
    const purchaseCount = document.getElementById("purchaseCount");
    const availableRewards = document.getElementById("availableRewards");
    const rewardState = document.getElementById("rewardState");

    function show(section) {
      loadingSection.hidden = section !== "loading";
      onboardingSection.hidden = section !== "onboarding";
      promoSection.hidden = section !== "promo";
    }

    function showError(message) {
      nameError.hidden = false;
      nameError.textContent = message;
    }

    function renderCustomer(customer) {
      displayName.textContent = customer.displayName || "GAMMS AEP";
      customerLabel.textContent = customer.customerLabel || "";
      customerBadge.textContent = "GAMMS AEP";
      purchaseCount.textContent = String(customer.purchaseCount ?? 0);
      availableRewards.textContent = String(customer.availableRewards ?? 0);
      stats.hidden = false;

      if (Number(customer.availableRewards ?? 0) > 0 || customer.hasActiveClaim) {
        rewardState.hidden = false;
        rewardState.className = "state ok";
        rewardState.textContent = customer.hasActiveClaim
          ? "Ya tienes un beneficio activo. Muestralo al vendedor."
          : "Tienes un beneficio disponible. Escanea el QR de tu bebida y pide ayuda al vendedor.";
      } else {
        rewardState.hidden = true;
      }
      show("promo");
    }

    async function loadCustomer() {
      show("loading");
      try {
        const response = await fetch("/aep/api/customer/me", {
          credentials: "same-origin",
          headers: { accept: "application/json" }
        });
        const data = await response.json();
        if (!data.ok || !data.customer) throw new Error("CUSTOMER_LOAD_FAILED");
        if (!data.customer.displayName) {
          show("onboarding");
          return;
        }
        renderCustomer(data.customer);
      } catch {
        loadingSection.querySelector(".state").className = "state bad";
        loadingSection.querySelector(".state").textContent = "No pudimos cargar tu perfil. Reintenta en unos segundos.";
      }
    }

    saveNameButton.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      nameError.hidden = true;
      if (name.length < 2) {
        showError("Por favor introduce tu nombre, minimo 2 caracteres.");
        return;
      }

      saveNameButton.disabled = true;
      try {
        const response = await fetch("/aep/api/customer/profile", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ displayName: name })
        });
        const data = await response.json();
        if (!data.ok || !data.customer) {
          showError(data.error || data.code || "Nombre no valido.");
          return;
        }
        renderCustomer(data.customer);
      } catch {
        showError("No pudimos guardar tu nombre. Revisa tu conexion.");
      } finally {
        saveNameButton.disabled = false;
      }
    });

    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveNameButton.click();
    });

    loadCustomer();
  </script>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
