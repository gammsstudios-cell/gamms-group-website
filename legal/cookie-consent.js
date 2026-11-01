/* GAMMS GROUP — transparent notice of necessary storage; no optional trackers. */
(() => {
  'use strict';
  const KEY = 'gamms-cookie-notice-v2';
  const isAcknowledged = () => {
    try { return localStorage.getItem(KEY) === 'acknowledged'; } catch { return false; }
  };
  let banner;
  let dialog;
  const button = (label, action, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cc-button' + (primary ? ' primary' : '');
    b.dataset.ccAction = action;
    b.textContent = label;
    return b;
  };
  function acknowledge() {
    try { localStorage.setItem(KEY, 'acknowledged'); } catch { /* unavailable storage */ }
    banner.hidden = true;
    if (dialog.open) dialog.close();
    document.dispatchEvent(new CustomEvent('gamms:consentchange', { detail: window.GAMMSConsent.get() }));
  }
  function open() { if (dialog && !dialog.open) dialog.showModal(); }
  function setup() {
    if (document.getElementById('gamms-cookie-banner')) return;
    if (!document.querySelector('link[href="/legal/cookie-consent.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/legal/cookie-consent.css';
      document.head.appendChild(css);
    }
    banner = document.createElement('section');
    banner.id = 'gamms-cookie-banner';
    banner.className = 'cc-banner';
    banner.setAttribute('aria-label', 'Información sobre cookies y privacidad');
    const heading = document.createElement('div');
    heading.innerHTML = '<div class="cc-title">Privacidad y funcionamiento</div><p class="cc-note">Utilizamos almacenamiento local para recordar el idioma y, si inicias sesión, una cookie necesaria para Secret ID. Actualmente no utilizamos cookies publicitarias ni de analítica. <a href="/cookies/">Política de cookies</a>.</p>';
    const actions = document.createElement('div');
    actions.className = 'cc-actions';
    actions.append(button('Ver detalles', 'details'), button('Entendido', 'ack', true));
    banner.append(heading, actions);
    banner.hidden = isAcknowledged();

    dialog = document.createElement('dialog');
    dialog.id = 'gamms-cookie-dialog';
    dialog.className = 'cc-modal';
    dialog.setAttribute('aria-labelledby', 'gamms-cookie-heading');
    dialog.innerHTML = '<div class="cc-modal-body"><div class="cc-modal-header"><div><h2 id="gamms-cookie-heading">Almacenamiento y cookies</h2><p>Este panel explica qué utiliza actualmente GAMMS GROUP. No solicitamos aceptar publicidad o analítica porque no están habilitadas.</p></div><button class="cc-close" type="button" data-cc-action="close" aria-label="Cerrar">×</button></div><div class="cc-option"><div><strong>Necesarias y de preferencias</strong><small>Idioma del sitio, registro de este aviso y sesión de Secret ID únicamente al iniciar sesión.</small></div><span class="cc-fixed">En uso</span></div><div class="cc-option"><div><strong>Analítica y publicidad</strong><small>Actualmente no instaladas ni activadas.</small></div><span class="cc-fixed">No usadas</span></div><p><a href="/cookies/">Leer la política completa de cookies</a></p><div class="cc-modal-footer"></div></div>';
    dialog.querySelector('.cc-modal-footer').append(button('Entendido', 'ack', true));
    document.body.append(banner, dialog);
    document.addEventListener('click', event => {
      const settings = event.target.closest('[data-cookie-settings]');
      if (settings) { event.preventDefault(); open(); return; }
      const b = event.target.closest('[data-cc-action]');
      if (!b) return;
      const action = b.dataset.ccAction;
      if (action === 'ack') acknowledge();
      else if (action === 'details') open();
      else if (action === 'close' && dialog.open) dialog.close();
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  }
  window.GAMMSConsent = {
    get: () => ({
      necessary: true,
      analytics: false,
      marketing: false,
      noticeAcknowledged: isAcknowledged()
    }),
    has: category => category === 'necessary',
    open
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();