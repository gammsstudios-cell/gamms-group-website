/* GAMMS consent panel — no third-party trackers are installed by this script. */
(function () {
  'use strict';
  var KEY = 'gamms-consent-v1';
  var fallback = null;

  function read() {
    try {
      var data = localStorage.getItem(KEY);
      if (!data) return fallback;
      var parsed = JSON.parse(data);
      return parsed && parsed.version === 1 && parsed.necessary === true ? parsed : null;
    } catch (_) { return fallback; }
  }
  function write(value) {
    fallback = value;
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {}
    document.dispatchEvent(new CustomEvent('gamms:consentchange', { detail: value }));
    window.dispatchEvent(new CustomEvent('gamms:consentchange', { detail: value }));
  }
  function decision(analytics, marketing) {
    return {
      version: 1,
      necessary: true,
      analytics: !!analytics,
      marketing: !!marketing,
      savedAt: new Date().toISOString()
    };
  }
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }
  var banner, dialog, analyticsInput, marketingInput;

  function close() {
    if (dialog && dialog.open) dialog.close();
  }
  function store(value) {
    write(value);
    if (banner) banner.hidden = true;
    close();
  }
  function open() {
    if (!dialog) return;
    var previous = read();
    analyticsInput.checked = !!(previous && previous.analytics);
    marketingInput.checked = !!(previous && previous.marketing);
    if (!dialog.open) dialog.showModal();
  }
  function makeButton(label, role, primary) {
    var b = el('button', 'cc-button' + (primary ? ' primary' : ''));
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-cc-action', role);
    return b;
  }
  function row(title, desc, id, checked, disabled) {
    var label = el('label', 'cc-option');
    var copy = el('span');
    var strong = el('strong');
    strong.textContent = title;
    var small = el('small');
    small.textContent = desc;
    copy.append(strong, small);
    var input = el('input', 'cc-switch');
    input.type = 'checkbox';
    input.id = id;
    input.checked = checked;
    input.disabled = !!disabled;
    input.setAttribute('aria-label', title);
    label.append(copy, input);
    return { label: label, input: input };
  }

  function setup() {
    if (!document.body || document.getElementById('gamms-cookie-banner')) return;
    if (!document.querySelector('link[href="/legal/cookie-consent.css"]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/legal/cookie-consent.css';
      document.head.appendChild(css);
    }

    banner = el('section', 'cc-banner');
    banner.id = 'gamms-cookie-banner';
    banner.setAttribute('aria-label', 'Privacidad y cookies');
    banner.appendChild(el('div', '', '<div class="cc-title">Tu privacidad importa.</div><p class="cc-note">Usamos almacenamiento necesario para tus preferencias y, si inicias sesión, para mantener Secret ID. Tú decides sobre categorías opcionales futuras. <a href="/cookies/">Ver política de cookies</a>.</p>'));
    var actions = el('div', 'cc-actions');
    actions.append(makeButton('Rechazar opcionales', 'reject'), makeButton('Personalizar', 'settings'), makeButton('Aceptar todas', 'accept', true));
    banner.appendChild(actions);
    banner.hidden = !!read();

    dialog = el('dialog', 'cc-modal');
    dialog.id = 'gamms-cookie-dialog';
    dialog.setAttribute('aria-labelledby', 'gamms-cookie-heading');
    var content = el('div', 'cc-modal-body');
    var top = el('div', 'cc-modal-header');
    var topCopy = el('div');
    var title = el('h2'); title.id = 'gamms-cookie-heading'; title.textContent = 'Preferencias de privacidad';
    var hint = el('p'); hint.textContent = 'Elige qué categorías opcionales deseas permitir. Puedes modificar esta decisión cuando quieras.';
    topCopy.append(title, hint);
    var closeBtn = el('button', 'cc-close'); closeBtn.type = 'button'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label', 'Cerrar preferencias'); closeBtn.setAttribute('data-cc-action', 'close');
    top.append(topCopy, closeBtn);
    content.appendChild(top);
    var status = el('div', 'cc-status');
    status.textContent = 'Actualmente no hay scripts de analítica o publicidad integrados en este paquete.';
    content.appendChild(status);
    var necessary = row('Necesarias', 'Autenticación, seguridad y preferencias técnicas. Siempre activas.', 'cc-necessary', true, true);
    var analytics = row('Analítica (futura)', 'No activa actualmente. Su uso requerirá integración y actualización de la política.', 'cc-analytics', false, false);
    var marketing = row('Marketing (futuro)', 'No activo actualmente. Su uso requerirá integración y actualización de la política.', 'cc-marketing', false, false);
    analyticsInput = analytics.input;
    marketingInput = marketing.input;
    content.append(necessary.label, analytics.label, marketing.label);
    var footer = el('div', 'cc-modal-footer');
    footer.append(makeButton('Rechazar opcionales', 'reject'), makeButton('Guardar elección', 'save', true));
    content.appendChild(footer);
    dialog.appendChild(content);
    document.body.append(banner, dialog);

    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-cookie-settings]');
      if (link) { event.preventDefault(); open(); return; }
      var button = event.target.closest('[data-cc-action]');
      if (!button) return;
      var action = button.getAttribute('data-cc-action');
      if (action === 'settings') open();
      else if (action === 'reject') store(decision(false, false));
      else if (action === 'accept') store(decision(true, true));
      else if (action === 'save') store(decision(analyticsInput.checked, marketingInput.checked));
      else if (action === 'close') close();
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) close();
    });
  }

  window.GAMMSConsent = {
    get: read,
    has: function (category) {
      var settings = read();
      return !!(settings && settings[category] === true);
    },
    open: open
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();