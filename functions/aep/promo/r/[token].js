function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function onRequestGet(context) {
  const token = String(context.params.token ?? "");
  const tokenJson = JSON.stringify(token);

  return new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>GAMMS AEP QR</title>
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
    .label {
      margin: 0 0 8px;
      color: #6e6e73;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.1; }
    p { margin: 0; color: #424245; line-height: 1.5; }
    .state { margin-top: 18px; padding: 14px; border-radius: 10px; background: #f5f5f7; }
    .progress { margin-top: 18px; font-size: 20px; letter-spacing: .12em; }
    .progress-copy { margin-top: 8px; color: #424245; }
    .claim { margin-top: 18px; text-align: center; }
    .claim svg { width: min(100%, 220px); height: auto; background: #fff; border-radius: 8px; }
    .claim-code { margin-top: 12px; font: 800 22px ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .04em; }
    .countdown { margin-top: 8px; color: #6e6e73; }
    .actions { margin-top: 18px; }
    button {
      width: 100%;
      border: 0;
      border-radius: 8px;
      padding: 13px 16px;
      background: #1d1d1f;
      color: #fff;
      font: 700 15px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .ok { color: #0a7a2f; }
    .bad { color: #b42318; }
    .mono { margin-top: 14px; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; color: #6e6e73; overflow-wrap: anywhere; }
    @media (prefers-color-scheme: dark) {
      body { background: #1d1d1f; color: #f5f5f7; }
      main { background: #2c2c2e; border-color: #3a3a3c; }
      p, .label, .mono, .progress-copy, .countdown { color: #aaaaaa; }
      .state { background: #1d1d1f; }
      button { background: #f5f5f7; color: #1d1d1f; }
    }
  </style>
</head>
<body>
  <main>
    <p class="label">GAMMS AEP</p>
    <h1 id="title">Validando QR...</h1>
    <p id="message">Estamos revisando el codigo de esta bebida.</p>
    <div class="state" id="state">Consultando servidor...</div>
    <div class="progress" id="progress" hidden></div>
    <p class="progress-copy" id="progressCopy" hidden></p>
    <div class="claim" id="claim" hidden>
      <div id="claimQr"></div>
      <div class="claim-code" id="claimCode"></div>
      <div class="countdown" id="countdown"></div>
    </div>
    <div class="actions">
      <button id="register" type="button" hidden>Registrar compra</button>
      <button id="claimButton" type="button" hidden>Mostrar al vendedor</button>
    </div>
    <div class="mono">Token: ${escapeHtml(token)}</div>
  </main>
  <script>
    const token = ${tokenJson};
    const title = document.getElementById("title");
    const message = document.getElementById("message");
    const state = document.getElementById("state");
    const progress = document.getElementById("progress");
    const progressCopy = document.getElementById("progressCopy");
    const claim = document.getElementById("claim");
    const claimQr = document.getElementById("claimQr");
    const claimCode = document.getElementById("claimCode");
    const countdown = document.getElementById("countdown");
    const registerButton = document.getElementById("register");
    const claimButton = document.getElementById("claimButton");
    let countdownTimer;

    const labels = {
      QR_ALREADY_USED: ["QR usado", "Este codigo ya fue utilizado.", "bad"],
      QR_DISABLED: ["QR deshabilitado", "Este codigo no esta disponible.", "bad"],
      QR_INVALID: ["QR invalido", "No encontramos este codigo.", "bad"],
      PRODUCT_NOT_FOUND: ["Producto no disponible", "Este codigo no tiene un producto valido asociado.", "bad"],
      PURCHASE_CONFLICT: ["Compra no registrada", "Este codigo ya fue consumido.", "bad"],
      REWARD_REQUIRES_SELLER: ["Beneficio disponible", "Esta compra debe ser validada por un vendedor.", "ok"],
      INTERNAL_ERROR: ["No pudimos registrar", "Intentalo nuevamente en unos segundos.", "bad"],
      QR_LOOKUP_FAILED: ["No pudimos validar", "Intentalo nuevamente en unos segundos.", "bad"]
    };

    function hideProgress() {
      progress.hidden = true;
      progressCopy.hidden = true;
    }

    function hideClaim() {
      claim.hidden = true;
      claimButton.hidden = true;
      if (countdownTimer) clearInterval(countdownTimer);
    }

    function showClaim(data) {
      claim.hidden = false;
      claimQr.innerHTML = data.qrSvg;
      claimCode.textContent = data.code;
      const expiresAt = new Date(data.expiresAt).getTime();
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const rest = String(seconds % 60).padStart(2, "0");
        countdown.textContent = seconds > 0 ? "Expira en " + minutes + ":" + rest : "Este codigo expiro";
        if (seconds === 0) {
          clearInterval(countdownTimer);
          claimButton.hidden = false;
          claimButton.textContent = "Generar uno nuevo";
        }
      }, 500);
    }

    function showProgress(data) {
      const rewardAvailable = data.reward?.available === true;
      const position = Number(data.cyclePosition ?? 0);
      progress.hidden = false;
      progressCopy.hidden = false;
      progress.textContent = (position >= 1 ? "●" : "○") + " " + (position >= 2 ? "●" : "○") + " 🎁";

      if (rewardAvailable) {
        progressCopy.textContent = "¡50% desbloqueado! Tu proxima bebida tiene 50% de descuento. Muestrale este beneficio al vendedor.";
        return;
      }

      progressCopy.textContent = Math.min(position, 2) + " de 2 compras completadas";
    }

    function showError(code) {
      const [heading, copy, className] = labels[code] ?? labels.QR_INVALID;
      title.textContent = heading;
      message.textContent = copy;
      state.className = "state " + className;
      state.textContent = code ?? "QR_INVALID";
      registerButton.hidden = true;
      claimButton.hidden = true;
      hideProgress();
    }

    fetch("/aep/api/qr/" + encodeURIComponent(token), { headers: { accept: "application/json" } })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          title.textContent = "Bebida valida";
          message.textContent = data.product?.name
            ? "Producto: " + data.product.name
            : "Este QR esta disponible.";
          state.className = "state ok";
          state.textContent = "QR #" + data.qr.number + " - " + data.qr.status;
          registerButton.hidden = false;
          claimButton.hidden = true;
          hideClaim();
          hideProgress();
          return;
        }

        showError(data.code);
      })
      .catch(() => {
        title.textContent = "No pudimos validar";
        message.textContent = "Revisa tu conexion e intentalo nuevamente.";
        state.className = "state bad";
        state.textContent = "NETWORK_ERROR";
        registerButton.hidden = true;
        claimButton.hidden = true;
        hideClaim();
        hideProgress();
      });

    registerButton.addEventListener("click", () => {
      registerButton.disabled = true;
      registerButton.textContent = "Registrando...";

      fetch("/aep/api/purchases", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({ token })
      })
        .then((response) => response.json())
        .then((data) => {
          if (!data.ok) {
            if (data.code === "REWARD_REQUIRES_SELLER") {
              title.textContent = "Beneficio disponible";
              message.textContent = "50% OFF";
              state.className = "state ok";
              state.textContent = "Esta compra debe ser validada por un vendedor.";
              registerButton.hidden = true;
              claimButton.hidden = false;
              claimButton.textContent = "Mostrar al vendedor";
              hideProgress();
              return;
            }

            showError(data.code);
            return;
          }

          title.textContent = "Compra registrada";
          message.textContent = data.purchase?.product?.name
            ? "Producto: " + data.purchase.product.name
            : "Tu compra fue registrada.";
          state.className = "state ok";
          state.textContent = data.progress.reward?.available
            ? "50% desbloqueado"
            : "Compra registrada";
          showProgress(data.progress);
          registerButton.hidden = true;
          claimButton.hidden = true;
          hideClaim();
        })
        .catch(() => {
          title.textContent = "No pudimos registrar";
          message.textContent = "Revisa tu conexion e intentalo nuevamente.";
          state.className = "state bad";
          state.textContent = "NETWORK_ERROR";
          registerButton.disabled = false;
          registerButton.textContent = "Registrar compra";
          hideClaim();
          hideProgress();
        });
    });

    claimButton.addEventListener("click", () => {
      claimButton.disabled = true;
      claimButton.textContent = "Generando...";

      fetch("/aep/api/rewards/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({ token })
      })
        .then((response) => response.json())
        .then((data) => {
          claimButton.disabled = false;
          if (!data.ok) {
            showError(data.code);
            return;
          }

          title.textContent = "50% DESBLOQUEADO";
          message.textContent = "Tu proxima bebida tiene 50% de descuento.";
          state.className = "state ok";
          state.textContent = "Muestralo al vendedor.";
          claimButton.hidden = true;
          showClaim(data.claim);
        })
        .catch(() => {
          claimButton.disabled = false;
          claimButton.textContent = "Mostrar al vendedor";
          state.className = "state bad";
          state.textContent = "NETWORK_ERROR";
        });
    });
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
