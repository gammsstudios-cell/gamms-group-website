function escapeHtml(value) {
  return String(value ?? "")
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
    .header-byline {
      display: flex;
      justify-content: space-between;
      align-items: center;
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
      margin-top: 8px;
      padding: 4px 10px;
      border-radius: 20px;
      background: #e8e8ed;
      font-size: 13px;
      font-weight: 600;
      color: #1d1d1f;
    }
    .state { margin-top: 18px; padding: 14px; border-radius: 10px; background: #f5f5f7; }
    .progress { margin-top: 18px; font-size: 20px; letter-spacing: .12em; }
    .progress-copy { margin-top: 8px; color: #424245; }
    .claim { margin-top: 18px; text-align: center; }
    .claim svg { width: min(100%, 220px); height: auto; background: #fff; border-radius: 8px; padding: 8px; border: 1px solid #e5e5ea; }
    .claim-code { margin-top: 12px; font: 800 22px ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .04em; }
    .countdown { margin-top: 8px; color: #6e6e73; font-weight: 600; }
    .actions { margin-top: 18px; }
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
      p, .label, .mono, .progress-copy, .countdown { color: #aaaaaa; }
      .gamms-byline strong { color: #f5f5f7; }
      .customer-badge { background: #3a3a3c; color: #f5f5f7; }
      .state { background: #1d1d1f; }
      .state.ok { background: #1b3823; color: #4caf50; }
      .state.bad { background: #3c1e1e; color: #f44336; }
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

    <!-- ONBOARDING SECTION -->
    <div id="onboardingSection" hidden>
      <h1>¡Bienvenido!</h1>
      <p>¿Cómo te llamas?</p>
      <div class="actions" style="margin-bottom:14px;">
        <button id="recoverCustomerButton" type="button">Si, tengo mi QR de cliente</button>
      </div>
      <div id="recoverCustomerBox" hidden>
        <p>Escanea o pega el codigo de tu QR de cliente para recuperar tus compras.</p>
        <input type="text" id="customerQrInput" class="input-field" placeholder="GAMMS-AEP-CUSTOMER:...">
        <button id="recoverCustomerSubmit" type="button">Recuperar mis compras</button>
      </div>
      <p style="margin-top:14px;">No, soy cliente nuevo:</p>
      <input type="text" id="nameInput" class="input-field" placeholder="Tu nombre" maxlength="60" autocomplete="given-name">
      <button id="saveNameButton" type="button">Continuar</button>
    </div>

    <!-- MAIN PROMO SECTION -->
    <div id="promoSection">
      <h1 id="title">Validando QR...</h1>
      <p id="message">Estamos revisando el código de esta bebida.</p>
      <div id="customerBadge" class="customer-badge" hidden></div>
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
    </div>

    <div class="footer-byline">
      <div class="gamms-byline">By <strong>GAMMS GROUP</strong></div>
      <div class="mono">Token: ${escapeHtml(token)}</div>
    </div>
  </main>
  <script>
    const token = ${tokenJson};
    const title = document.getElementById("title");
    const message = document.getElementById("message");
    const state = document.getElementById("state");
    const customerBadge = document.getElementById("customerBadge");
    const progress = document.getElementById("progress");
    const progressCopy = document.getElementById("progressCopy");
    const claim = document.getElementById("claim");
    const claimQr = document.getElementById("claimQr");
    const claimCode = document.getElementById("claimCode");
    const countdown = document.getElementById("countdown");
    const registerButton = document.getElementById("register");
    const claimButton = document.getElementById("claimButton");
    
    const onboardingSection = document.getElementById("onboardingSection");
    const promoSection = document.getElementById("promoSection");
    const nameInput = document.getElementById("nameInput");
    const saveNameButton = document.getElementById("saveNameButton");
    const recoverCustomerButton = document.getElementById("recoverCustomerButton");
    const recoverCustomerBox = document.getElementById("recoverCustomerBox");
    const recoverCustomerSubmit = document.getElementById("recoverCustomerSubmit");
    const customerQrInput = document.getElementById("customerQrInput");

    let currentCustomer = null;
    let countdownTimer;
    let pendingIdentityToken = "";

    const labels = {
      QR_ALREADY_USED: ["QR ya utilizado", "Este código ya fue utilizado.", "bad"],
      QR_DISABLED: ["QR deshabilitado", "Este código no está disponible.", "bad"],
      QR_INVALID: ["QR inválido", "No encontramos este código.", "bad"],
      PRODUCT_NOT_FOUND: ["Producto no disponible", "Este código no tiene un producto válido asociado.", "bad"],
      PURCHASE_CONFLICT: ["Compra no registrada", "Este código ya fue consumido.", "bad"],
      REWARD_REQUIRES_SELLER: ["¡Tienes un 50% disponible!", "Muéstrale tu premio al vendedor para comprar esta bebida.", "ok"],
      EVENT_CLOSED: ["Evento cerrado", "Gracias por participar.", "bad"],
      INTERNAL_ERROR: ["No pudimos registrar", "Inténtalo nuevamente en unos segundos.", "bad"]
    };

    function updateCustomerBadge(customer) {
      if (customer && customer.displayName) {
        customerBadge.hidden = false;
        customerBadge.textContent = customer.displayName + " · " + customer.customerLabel;
      } else if (customer && customer.customerLabel) {
        customerBadge.hidden = false;
        customerBadge.textContent = customer.customerLabel;
      }
    }

    function checkCustomerProfile() {
      return fetch("/aep/api/customer/me", { headers: { accept: "application/json" } })
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.customer) {
            currentCustomer = data.customer;
            updateCustomerBadge(currentCustomer);
            if (!currentCustomer.displayName) {
              promoSection.hidden = true;
              onboardingSection.hidden = false;
              return false;
            }
          }
          promoSection.hidden = false;
          onboardingSection.hidden = true;
          return true;
        })
        .catch(() => {
          promoSection.hidden = false;
          onboardingSection.hidden = true;
          return true;
        });
    }

    saveNameButton.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (name.length < 2) {
        alert("Por favor introduce tu nombre (mínimo 2 caracteres).");
        return;
      }
      saveNameButton.disabled = true;
      fetch("/aep/api/customer/profile", {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ displayName: name })
      })
      .then(res => res.json())
      .then(data => {
        saveNameButton.disabled = false;
        if (data.ok && data.customer) {
          currentCustomer = data.customer;
          updateCustomerBadge(currentCustomer);
          onboardingSection.hidden = true;
          promoSection.hidden = false;
          validateQr();
        } else {
          alert(data.error || "Nombre no válido");
        }
      })
      .catch(() => {
        saveNameButton.disabled = false;
        alert("Error al guardar tu nombre.");
      });
    });

    recoverCustomerButton.addEventListener("click", () => {
      recoverCustomerBox.hidden = !recoverCustomerBox.hidden;
      if (!recoverCustomerBox.hidden) customerQrInput.focus();
    });

    function recoverIdentity(confirmSwitch = false) {
      const identityToken = customerQrInput.value.trim();
      if (!identityToken) return alert("Escanea o pega tu QR de cliente.");
      pendingIdentityToken = identityToken;
      recoverCustomerSubmit.disabled = true;
      fetch("/aep/api/customer/identity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token: identityToken, confirmSwitch })
      })
      .then(res => res.json())
      .then(data => {
        recoverCustomerSubmit.disabled = false;
        if (!data.ok && data.code === "IDENTITY_SWITCH_CONFIRMATION_REQUIRED") {
          const current = data.details?.currentCustomer || data.currentCustomer || {};
          const target = data.details?.targetCustomer || data.targetCustomer || {};
          recoverCustomerBox.innerHTML = '<p><strong>Este telefono ya esta vinculado a otro cliente.</strong></p>' +
            '<p>Cliente actual:<br>' + (current.displayName || 'Cliente') + ' · ' + (current.customerLabel || '') + '</p>' +
            '<p>Cliente del QR:<br>' + (target.displayName || 'Cliente') + ' · ' + (target.customerLabel || '') + '</p>' +
            '<button id="cancelIdentitySwitch" type="button">Cancelar</button>' +
            '<button id="confirmIdentitySwitch" type="button" style="margin-top:10px;">Cambiar cliente</button>';
          document.getElementById("cancelIdentitySwitch").addEventListener("click", () => {
            recoverCustomerBox.hidden = true;
          });
          document.getElementById("confirmIdentitySwitch").addEventListener("click", () => {
            customerQrInput.value = pendingIdentityToken;
            recoverIdentity(true);
          });
          return;
        }
        if (!data.ok) return alert("QR de cliente no valido.");
        currentCustomer = data.customer;
        updateCustomerBadge(currentCustomer);
        onboardingSection.hidden = true;
        promoSection.hidden = false;
        validateQr();
      })
      .catch(() => {
        recoverCustomerSubmit.disabled = false;
        alert("No pudimos recuperar tus compras.");
      });
    }

    recoverCustomerSubmit.addEventListener("click", () => {
      recoverIdentity(false);
    });

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
        countdown.textContent = seconds > 0 ? "Expira en " + minutes + ":" + rest : "Este código expiró";
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
        progressCopy.textContent = "¡50% DESBLOQUEADO! Tu próxima bebida tiene 50% de descuento. Muéstrale este beneficio al vendedor.";
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
      if (code === "REWARD_REQUIRES_SELLER") {
        claimButton.hidden = false;
        claimButton.textContent = "Mostrar al vendedor";
      } else {
        claimButton.hidden = true;
      }
      progress.hidden = true;
      progressCopy.hidden = true;
    }

    function validateQr() {
      fetch("/aep/api/qr/" + encodeURIComponent(token), { headers: { accept: "application/json" } })
        .then((response) => response.json())
        .then((data) => {
          if (data.ok) {
            title.textContent = "Bebida válida";
            message.textContent = data.product?.name
              ? "Producto: " + data.product.name
              : "Este QR está disponible.";
            state.className = "state ok";
            state.textContent = "QR #" + data.qr.number + " - " + data.qr.status;
            registerButton.hidden = false;
            claimButton.hidden = true;
            claim.hidden = true;
            progress.hidden = true;
            progressCopy.hidden = true;
            return;
          }
          showError(data.code);
        })
        .catch(() => {
          title.textContent = "No pudimos validar";
          message.textContent = "Revisa tu conexión e inténtalo nuevamente.";
          state.className = "state bad";
          state.textContent = "NETWORK_ERROR";
          registerButton.hidden = true;
          claimButton.hidden = true;
        });
    }

    checkCustomerProfile().then(hasName => {
      if (hasName) validateQr();
    });

    registerButton.addEventListener("click", () => {
      registerButton.disabled = true;
      registerButton.textContent = "Registrando...";

      fetch("/aep/api/purchases", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ token })
      })
        .then((response) => response.json())
        .then((data) => {
          if (!data.ok) {
            if (data.code === "REWARD_REQUIRES_SELLER") {
              title.textContent = "¡50% DESBLOQUEADO!";
              message.textContent = "Tienes un 50% de descuento disponible. Muéstrale tu premio al vendedor para comprar esta bebida.";
              state.className = "state ok";
              state.textContent = "50% OFF Disponible";
              registerButton.hidden = true;
              claimButton.hidden = false;
              claimButton.textContent = "Mostrar al vendedor";
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
          state.textContent = data.progress.reward?.available ? "50% DESBLOQUEADO" : "Compra registrada";
          showProgress(data.progress);
          registerButton.hidden = true;
          if (data.progress.reward?.available) {
            claimButton.hidden = false;
            claimButton.textContent = "Mostrar al vendedor";
          } else {
            claimButton.hidden = true;
          }
        })
        .catch(() => {
          title.textContent = "No pudimos registrar";
          message.textContent = "Revisa tu conexión e inténtalo nuevamente.";
          state.className = "state bad";
          state.textContent = "NETWORK_ERROR";
          registerButton.disabled = false;
          registerButton.textContent = "Registrar compra";
        });
    });

    claimButton.addEventListener("click", () => {
      claimButton.disabled = true;
      claimButton.textContent = "Generando...";

      fetch("/aep/api/rewards/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({})
      })
        .then((response) => response.json())
        .then((data) => {
          claimButton.disabled = false;
          if (!data.ok) {
            showError(data.code);
            return;
          }

          title.textContent = "50% DESBLOQUEADO";
          message.textContent = "Tu próxima bebida tiene 50% de descuento.";
          state.className = "state ok";
          state.textContent = "Muéstralo al vendedor.";
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
