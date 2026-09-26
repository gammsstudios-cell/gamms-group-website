export function onRequestGet() {
  return new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>GAMMS AEP Seller</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 24px; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; color: #1d1d1f; }
    main { width: min(100%, 460px); border: 1px solid #d7d7dc; border-radius: 12px; background: #fff; padding: 24px; box-shadow: 0 12px 40px rgb(0 0 0 / 8%); }
    h1 { margin: 0 0 16px; font-size: 26px; }
    label { display: block; margin-top: 14px; color: #424245; font-weight: 700; font-size: 13px; }
    input { width: 100%; margin-top: 6px; border: 1px solid #d7d7dc; border-radius: 8px; padding: 12px; font: 16px ui-monospace, SFMono-Regular, Consolas, monospace; }
    button { width: 100%; margin-top: 14px; border: 0; border-radius: 8px; padding: 13px 16px; background: #1d1d1f; color: #fff; font-weight: 800; cursor: pointer; }
    button.secondary { background: #e8e8ed; color: #1d1d1f; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .state { margin-top: 16px; padding: 14px; border-radius: 10px; background: #f5f5f7; line-height: 1.45; }
    .ok { color: #0a7a2f; }
    .bad { color: #b42318; }
    .price { font-size: 28px; font-weight: 900; }
    video { width: 100%; margin-top: 14px; border-radius: 10px; background: #000; }
    [hidden] { display: none !important; }
    @media (prefers-color-scheme: dark) {
      body { background: #1d1d1f; color: #f5f5f7; }
      main { background: #2c2c2e; border-color: #3a3a3c; }
      label { color: #aaaaaa; }
      input { background: #1d1d1f; color: #f5f5f7; border-color: #3a3a3c; }
      .state { background: #1d1d1f; }
      button { background: #f5f5f7; color: #1d1d1f; }
    }
  </style>
</head>
<body>
  <main>
    <h1>GAMMS AEP Seller</h1>
    <section id="login">
      <label for="passcode">Passcode</label>
      <input id="passcode" type="password" autocomplete="current-password">
      <button id="loginButton" type="button">Entrar</button>
      <div class="state" id="loginState">Sesion de vendedor requerida.</div>
    </section>
    <section id="seller" hidden>
      <label for="claimCode">Codigo del cliente</label>
      <input id="claimCode" inputmode="text" autocomplete="off" placeholder="7K3M-Q9XZ-2P">
      <button id="scanButton" class="secondary" type="button" hidden>Escanear con camara</button>
      <video id="video" playsinline hidden></video>
      <button id="previewButton" type="button">Buscar</button>
      <div class="state" id="previewState">Ingresa el codigo temporal del cliente.</div>
      <button id="redeemButton" type="button" hidden>Confirmar canje</button>
      <button id="logoutButton" class="secondary" type="button">Salir</button>
    </section>
  </main>
  <script>
    const login = document.getElementById("login");
    const seller = document.getElementById("seller");
    const passcode = document.getElementById("passcode");
    const loginButton = document.getElementById("loginButton");
    const loginState = document.getElementById("loginState");
    const claimCode = document.getElementById("claimCode");
    const previewButton = document.getElementById("previewButton");
    const previewState = document.getElementById("previewState");
    const redeemButton = document.getElementById("redeemButton");
    const logoutButton = document.getElementById("logoutButton");
    const scanButton = document.getElementById("scanButton");
    const video = document.getElementById("video");
    let currentCode = "";
    let stream;

    function showSeller() {
      login.hidden = true;
      seller.hidden = false;
    }

    function showLogin() {
      login.hidden = false;
      seller.hidden = true;
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        ...options
      });
      return response.json();
    }

    fetch("/aep/api/seller/session", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data) => data.authenticated ? showSeller() : showLogin());

    loginButton.addEventListener("click", async () => {
      const data = await api("/aep/api/seller/login", {
        method: "POST",
        body: JSON.stringify({ passcode: passcode.value })
      });
      if (!data.ok) {
        loginState.className = "state bad";
        loginState.textContent = data.code || "SELLER_AUTH_INVALID";
        return;
      }
      showSeller();
    });

    previewButton.addEventListener("click", async () => {
      currentCode = claimCode.value.trim();
      redeemButton.hidden = true;
      const data = await api("/aep/api/seller/claims/" + encodeURIComponent(currentCode));
      if (!data.ok) {
        previewState.className = "state bad";
        previewState.textContent = data.code || "CLAIM_INVALID";
        return;
      }
      previewState.className = "state ok";
      previewState.innerHTML = "<strong>" + data.product.name + "</strong><br>QR #" + data.qr.number +
        "<br>Precio normal: " + (data.pricing.regularPriceCents / 100).toFixed(2) +
        "<br>Descuento: " + data.pricing.discountPercent + "%" +
        "<br><span class='price'>Cobrar: " + (data.pricing.finalPriceCents / 100).toFixed(2) + "</span>";
      redeemButton.hidden = false;
    });

    redeemButton.addEventListener("click", async () => {
      redeemButton.disabled = true;
      const data = await api("/aep/api/seller/redeem", {
        method: "POST",
        body: JSON.stringify({ claimCode: currentCode })
      });
      redeemButton.disabled = false;
      redeemButton.hidden = true;
      previewState.className = "state " + (data.ok ? "ok" : "bad");
      previewState.textContent = data.ok ? "Descuento aplicado." : (data.code || "REDEMPTION_CONFLICT");
    });

    logoutButton.addEventListener("click", async () => {
      await api("/aep/api/seller/logout", { method: "POST", body: "{}" });
      showLogin();
    });

    if ("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia) {
      scanButton.hidden = false;
      scanButton.addEventListener("click", async () => {
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
          claimCode.value = codes[0].rawValue.replace("GAMMS-AEP-CLAIM:", "");
        }, 700);
      });
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
