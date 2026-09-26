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
      p, .label, .mono { color: #aaaaaa; }
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
    <div class="actions">
      <button id="register" type="button" hidden>Registrar compra</button>
    </div>
    <div class="mono">Token: ${escapeHtml(token)}</div>
  </main>
  <script>
    const token = ${tokenJson};
    const title = document.getElementById("title");
    const message = document.getElementById("message");
    const state = document.getElementById("state");
    const registerButton = document.getElementById("register");

    const labels = {
      QR_ALREADY_USED: ["QR usado", "Este codigo ya fue utilizado.", "bad"],
      QR_DISABLED: ["QR deshabilitado", "Este codigo no esta disponible.", "bad"],
      QR_INVALID: ["QR invalido", "No encontramos este codigo.", "bad"],
      PRODUCT_NOT_FOUND: ["Producto no disponible", "Este codigo no tiene un producto valido asociado.", "bad"],
      PURCHASE_CONFLICT: ["Compra no registrada", "Este codigo ya fue consumido.", "bad"],
      INTERNAL_ERROR: ["No pudimos registrar", "Intentalo nuevamente en unos segundos.", "bad"],
      QR_LOOKUP_FAILED: ["No pudimos validar", "Intentalo nuevamente en unos segundos.", "bad"]
    };

    function showError(code) {
      const [heading, copy, className] = labels[code] ?? labels.QR_INVALID;
      title.textContent = heading;
      message.textContent = copy;
      state.className = "state " + className;
      state.textContent = code ?? "QR_INVALID";
      registerButton.hidden = true;
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
            showError(data.code);
            return;
          }

          title.textContent = "Compra registrada";
          message.textContent = data.purchase?.product?.name
            ? "Producto: " + data.purchase.product.name
            : "Tu compra fue registrada.";
          state.className = "state ok";
          state.textContent = "Progreso " + data.progress.cyclePosition + "/3";
          registerButton.hidden = true;
        })
        .catch(() => {
          title.textContent = "No pudimos registrar";
          message.textContent = "Revisa tu conexion e intentalo nuevamente.";
          state.className = "state bad";
          state.textContent = "NETWORK_ERROR";
          registerButton.disabled = false;
          registerButton.textContent = "Registrar compra";
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
