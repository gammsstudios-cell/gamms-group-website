export function onRequestGet() {
  return new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>GAMMS AEP Seller POS</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 24px; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; color: #1d1d1f; }
    main { width: min(100%, 480px); border: 1px solid #d7d7dc; border-radius: 12px; background: #fff; padding: 24px; box-shadow: 0 12px 40px rgb(0 0 0 / 8%); }
    .header-byline { display: flex; justify-space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e5e5ea; padding-bottom: 12px; }
    .title-sub { font-size: 12px; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: .08em; }
    .gamms-byline { font-size: 12px; color: #86868b; }
    .gamms-byline strong { color: #1d1d1f; font-weight: 700; }
    h1 { margin: 0 0 16px; font-size: 26px; }
    label { display: block; margin-top: 14px; color: #424245; font-weight: 700; font-size: 13px; }
    input { width: 100%; margin-top: 6px; border: 1px solid #d7d7dc; border-radius: 8px; padding: 12px; font: 16px ui-monospace, SFMono-Regular, Consolas, monospace; }
    button { width: 100%; margin-top: 14px; border: 0; border-radius: 8px; padding: 13px 16px; background: #1d1d1f; color: #fff; font-weight: 800; cursor: pointer; transition: background .15s; }
    button.secondary { background: #e8e8ed; color: #1d1d1f; }
    button:hover { opacity: .9; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .state { margin-top: 16px; padding: 14px; border-radius: 10px; background: #f5f5f7; line-height: 1.5; }
    .ok { color: #0a7a2f; background: #e8f5e9; }
    .bad { color: #b42318; background: #fde8e8; }
    .price-box { margin-top: 12px; padding: 14px; border-radius: 10px; background: #f0f0f5; border: 1px dashed #007aff; }
    .price { font-size: 28px; font-weight: 900; color: #007aff; }
    .customer-name { font-size: 18px; font-weight: 800; color: #1d1d1f; margin-bottom: 4px; }
    .customer-label { font-size: 13px; color: #6e6e73; font-weight: 600; }
    video { width: 100%; margin-top: 14px; border-radius: 10px; background: #000; }
    .footer-byline { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e5e5ea; text-align: center; }
    [hidden] { display: none !important; }
    @media (prefers-color-scheme: dark) {
      body { background: #1d1d1f; color: #f5f5f7; }
      main { background: #2c2c2e; border-color: #3a3a3c; }
      .header-byline, .footer-byline { border-color: #3a3a3c; }
      label { color: #aaaaaa; }
      input { background: #1d1d1f; color: #f5f5f7; border-color: #3a3a3c; }
      .state { background: #1d1d1f; }
      .state.ok { background: #1b3823; color: #4caf50; }
      .state.bad { background: #3c1e1e; color: #f44336; }
      .price-box { background: #1c2536; border-color: #007aff; }
      .customer-name { color: #f5f5f7; }
      .customer-label { color: #aaaaaa; }
      .gamms-byline strong { color: #f5f5f7; }
      button { background: #f5f5f7; color: #1d1d1f; }
      button.secondary { background: #3a3a3c; color: #f5f5f7; }
    }
  </style>
</head>
<body>
  <main>
    <div class="header-byline">
      <div class="title-sub">GAMMS AEP POS</div>
      <div class="gamms-byline">By <strong>GAMMS GROUP</strong></div>
    </div>

    <!-- LOGIN SECTION -->
    <section id="login">
      <h1>Iniciar Sesión</h1>
      <label for="username">Usuario</label>
      <input id="username" type="text" autocomplete="username" placeholder="vendedor">
      <label for="passcode">Contraseña / Passcode</label>
      <input id="passcode" type="password" autocomplete="current-password">
      <button id="loginButton" type="button">Iniciar sesión</button>
      <div class="state" id="loginState">Credenciales de vendedor requeridas.</div>
    </section>

    <!-- SELLER POS INTERFACE -->
    <section id="seller" hidden>
      <h1>POS — Canje de Premios</h1>
      
      <!-- STEP 1: SCAN CLAIM CODE -->
      <div id="step1">
        <label for="claimCode">1. Escanear Premio del Cliente (Código Claim)</label>
        <input id="claimCode" inputmode="text" autocomplete="off" placeholder="T3X8-5OHC-EW">
        <button id="scanClaimButton" class="secondary" type="button" hidden>Escanear QR Claim con Cámara</button>
        <button id="findClaimButton" type="button">Validar Premio</button>
      </div>

      <!-- STEP 2: SCAN PHYSICAL QR -->
      <div id="step2" hidden>
        <div id="customerSummary" class="state ok"></div>
        <label for="physicalQrInput">2. Escanear Bebida (QR Físico)</label>
        <input id="physicalQrInput" inputmode="text" autocomplete="off" placeholder="Pegar o escanear URL/token del QR físico">
        <button id="scanQrButton" class="secondary" type="button" hidden>Escanear QR Físico con Cámara</button>
        <button id="previewProductButton" type="button">Ver Previsualización de Venta</button>
      </div>

      <!-- STEP 3: CONFIRMATION & PREVIEW -->
      <div id="step3" hidden>
        <div id="previewCard" class="price-box"></div>
        <button id="redeemButton" type="button">CONFIRMAR VENTA</button>
        <button id="cancelStep3Button" class="secondary" type="button">Cancelar</button>
      </div>

      <video id="video" playsinline hidden></video>
      <div class="state" id="posStatus">Escanear el premio del cliente para comenzar.</div>
      <button id="logoutButton" class="secondary" type="button" style="margin-top:20px;">Cerrar Sesión</button>
    </section>

    <div class="footer-byline">
      <div class="gamms-byline">GAMMS AEP POS · By <strong>GAMMS GROUP</strong></div>
    </div>
  </main>
  <script>
    const login = document.getElementById("login");
    const seller = document.getElementById("seller");
    const usernameInput = document.getElementById("username");
    const passcode = document.getElementById("passcode");
    const loginButton = document.getElementById("loginButton");
    const loginState = document.getElementById("loginState");

    const step1 = document.getElementById("step1");
    const step2 = document.getElementById("step2");
    const step3 = document.getElementById("step3");
    const claimCode = document.getElementById("claimCode");
    const findClaimButton = document.getElementById("findClaimButton");
    const customerSummary = document.getElementById("customerSummary");
    const physicalQrInput = document.getElementById("physicalQrInput");
    const previewProductButton = document.getElementById("previewProductButton");
    const previewCard = document.getElementById("previewCard");
    const redeemButton = document.getElementById("redeemButton");
    const cancelStep3Button = document.getElementById("cancelStep3Button");
    const posStatus = document.getElementById("posStatus");
    const logoutButton = document.getElementById("logoutButton");

    const scanClaimButton = document.getElementById("scanClaimButton");
    const scanQrButton = document.getElementById("scanQrButton");
    const video = document.getElementById("video");

    let currentClaim = null;
    let currentPhysicalToken = "";
    let activeScanTarget = null;
    let stream = null;

    function showSeller() { login.hidden = true; seller.hidden = false; resetPos(); }
    function showLogin() { login.hidden = false; seller.hidden = true; }

    function resetPos() {
      step1.hidden = false;
      step2.hidden = true;
      step3.hidden = true;
      claimCode.value = "";
      physicalQrInput.value = "";
      currentClaim = null;
      currentPhysicalToken = "";
      posStatus.className = "state";
      posStatus.textContent = "Escanear el premio del cliente para comenzar.";
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        ...options
      });
      return response.json();
    }

    fetch("/aep/api/staff/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => data.authenticated ? showSeller() : showLogin())
      .catch(() => showLogin());

    loginButton.addEventListener("click", async () => {
      loginButton.disabled = true;
      loginState.textContent = "Verificando...";

      // Try unified staff login first
      let data = await api("/aep/api/staff/login", {
        method: "POST",
        body: JSON.stringify({ username: usernameInput.value.trim() || passcode.value.trim(), password: passcode.value })
      });

      if (!data.ok) {
        // Fallback to legacy seller login
        data = await api("/aep/api/seller/login", {
          method: "POST",
          body: JSON.stringify({ passcode: passcode.value })
        });
      }

      loginButton.disabled = false;
      if (!data.ok) {
        loginState.className = "state bad";
        loginState.textContent = data.error || data.code || "Usuario o contraseña incorrectos";
        return;
      }
      showSeller();
    });

    findClaimButton.addEventListener("click", async () => {
      const code = claimCode.value.trim();
      if (!code) { alert("Introduce el código de premio del cliente."); return; }
      findClaimButton.disabled = true;
      posStatus.textContent = "Validando premio...";

      const data = await api("/aep/api/seller/claims/" + encodeURIComponent(code));
      findClaimButton.disabled = false;

      if (!data.ok) {
        posStatus.className = "state bad";
        posStatus.textContent = data.error || "Premio inválido o expirado.";
        return;
      }

      currentClaim = data;
      step1.hidden = true;
      step2.hidden = false;
      customerSummary.innerHTML = "<strong>Premio Válido ✓</strong><br>" +
        "<div class='customer-name'>" + (data.customer?.displayName || "Cliente") + "</div>" +
        "<div class='customer-label'>" + (data.customer?.customerLabel || "") + "</div>" +
        "Descuento: 50% OFF · Ciclo #" + (data.reward?.cycleNumber || 1);
      posStatus.className = "state ok";
      posStatus.textContent = "Premio verificado. Ahora escanea el QR físico de la bebida.";
    });

    previewProductButton.addEventListener("click", async () => {
      let tokenVal = physicalQrInput.value.trim();
      if (tokenVal.includes("/aep/promo/r/")) {
        tokenVal = tokenVal.split("/aep/promo/r/")[1];
      }
      if (!tokenVal) { alert("Escanea o introduce el QR físico de la bebida."); return; }
      currentPhysicalToken = tokenVal;

      previewProductButton.disabled = true;
      posStatus.textContent = "Verificando bebida...";

      const data = await api("/aep/api/seller/claims/preview-product", {
        method: "POST",
        body: JSON.stringify({ code: claimCode.value.trim(), physicalQrToken: currentPhysicalToken })
      });
      previewProductButton.disabled = false;

      if (!data.ok) {
        posStatus.className = "state bad";
        posStatus.textContent = data.error || "Bebida inválida o sin stock.";
        return;
      }

      step2.hidden = true;
      step3.hidden = false;
      previewCard.innerHTML =
        "<div class='customer-name'>" + (data.customer?.displayName || "Cliente") + "</div>" +
        "<div class='customer-label'>" + (data.customer?.customerLabel || "") + "</div><hr>" +
        "<strong>" + data.product.name + "</strong> (QR #" + data.qr.publicNumber + ")<br>" +
        "Precio normal: C$ " + (data.pricing.regularPriceCents / 100).toFixed(2) + "<br>" +
        "Descuento 50%: -C$ " + ((data.pricing.regularPriceCents - data.pricing.finalPriceCents) / 100).toFixed(2) + "<br>" +
        "<span class='price'>TOTAL: C$ " + (data.pricing.finalPriceCents / 100).toFixed(2) + "</span><br>" +
        "<small>Stock restante: " + data.product.stockQuantity + "</small>";

      posStatus.className = "state ok";
      posStatus.textContent = "Revisa los detalles y confirma la venta.";
    });

    redeemButton.addEventListener("click", async () => {
      redeemButton.disabled = true;
      posStatus.textContent = "Procesando venta...";

      const data = await api("/aep/api/seller/redeem", {
        method: "POST",
        body: JSON.stringify({ code: claimCode.value.trim(), physicalQrToken: currentPhysicalToken })
      });

      redeemButton.disabled = false;
      if (!data.ok) {
        posStatus.className = "state bad";
        posStatus.textContent = data.error || data.code || "Error al realizar el canje";
        return;
      }

      step3.hidden = true;
      previewCard.innerHTML = "";
      posStatus.className = "state ok";
      posStatus.innerHTML = "✓ <strong>VENTA COMPLETADA</strong><br>" +
        (data.customer?.displayName || "Cliente") + " (" + (data.customer?.customerLabel || "") + ")<br>" +
        data.purchase.product.name + " (QR #" + data.purchase.qrNumber + ")<br>" +
        "<strong>Total cobrado: C$ " + (data.purchase.finalPriceCents / 100).toFixed(2) + "</strong><br>" +
        "<button type='button' onclick='resetPos()' style='margin-top:10px;'>NUEVA VENTA</button>";
    });

    cancelStep3Button.addEventListener("click", () => {
      step3.hidden = true;
      step2.hidden = false;
    });

    logoutButton.addEventListener("click", async () => {
      await api("/aep/api/staff/logout", { method: "POST", body: "{}" });
      await api("/aep/api/seller/logout", { method: "POST", body: "{}" });
      showLogin();
    });

    if ("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia) {
      scanClaimButton.hidden = false;
      scanQrButton.hidden = false;

      const startScanner = async (targetInput) => {
        activeScanTarget = targetInput;
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.hidden = false;
        await video.play();

        const timer = setInterval(async () => {
          const codes = await detector.detect(video);
          if (codes.length === 0) return;
          clearInterval(timer);
          stream.getTracks().forEach((track) => track.stop());
          video.hidden = true;
          let val = codes[0].rawValue;
          if (val.includes("/aep/promo/r/")) val = val.split("/aep/promo/r/")[1];
          val = val.replace("GAMMS-AEP-CLAIM:", "");
          activeScanTarget.value = val;
        }, 700);
      };

      scanClaimButton.addEventListener("click", () => startScanner(claimCode));
      scanQrButton.addEventListener("click", () => startScanner(physicalQrInput));
    }
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
