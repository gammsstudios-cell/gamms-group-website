const state = {
  lang: localStorage.getItem('gamms-lang') || 'es',
  user: null,
  googleReady: false,
  clientId: null,
  accountSection: 'overview',
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const topbar = qs('#topbar');
const menuToggle = qs('#menuToggle');
const navLinks = qs('#navLinks');
const langToggle = qs('#langToggle');
const accountDialog = qs('#accountDialog');
const accountButton = qs('#accountButton');
const accountClose = qs('#accountClose');
const signedOutView = qs('#signedOutView');
const signedInView = qs('#signedInView');
const authStatus = qs('#authStatus');
const googleButton = qs('#googleButton');

qs('#year').textContent = new Date().getFullYear();

function escapeHtml(value = '') {
  const entities = {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'};
  return String(value).replace(/[&<>'"]/g, (char) => entities[char]);
}

function setBilingual(el, es, en) {
  if (!el) return;
  el.dataset.es = es;
  el.dataset.en = en;
  el.textContent = state.lang === 'es' ? es : en;
}

function shortSecretId(id = '') {
  const clean = String(id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!clean) return 'SID-PENDING';
  return `SID-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

function installSecretIdEnhancements() {
  if (!qs('#secretIdEnhancementStyles')) {
    const style = document.createElement('style');
    style.id = 'secretIdEnhancementStyles';
    style.textContent = `
      .nav-actions{position:relative}
      .account-pill-chevron{font-size:10px;opacity:.7;transition:transform .2s}.account-pill.menu-open .account-pill-chevron{transform:rotate(180deg)}
      .account-menu{position:absolute;right:0;top:calc(100% + 12px);width:min(360px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.13);border-radius:24px;background:rgba(9,13,19,.96);box-shadow:0 28px 80px rgba(0,0,0,.55);backdrop-filter:blur(24px) saturate(140%);padding:12px;z-index:120;transform-origin:top right}
      .account-menu[hidden]{display:none}.account-menu-profile{display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:center;padding:10px 9px 14px}.account-menu-profile img{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#141c26}.account-menu-profile strong{display:block;font-size:14px}.account-menu-profile small{display:block;color:#7f8b9b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}.account-menu-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.account-menu-badges span{font-size:9px;letter-spacing:.06em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 7px;color:#96a6ba}.account-menu-badges .google-badge{color:#9de6c9;border-color:rgba(92,227,188,.2)}
      .account-menu-sid{margin:0 6px 10px;padding:11px 12px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.03);display:flex;align-items:center;justify-content:space-between;gap:10px}.account-menu-sid span{display:flex;flex-direction:column}.account-menu-sid small{color:#637083;font-size:9px;text-transform:uppercase;letter-spacing:.12em}.account-menu-sid code{font:700 12px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;color:#dbe9f7}.mini-copy{border:0;background:rgba(255,255,255,.07);color:#9fb0c4;border-radius:10px;min-width:34px;height:34px;cursor:pointer}
      .account-menu-divider{height:1px;background:rgba(255,255,255,.07);margin:7px 5px}.account-menu-item{width:100%;border:0;background:transparent;color:#dce4ee;display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:13px;text-align:left;cursor:pointer;font-size:13px}.account-menu-item:hover{background:rgba(255,255,255,.055)}.account-menu-item .mi{width:25px;height:25px;border-radius:8px;background:rgba(255,255,255,.055);display:grid;place-items:center;color:#89a0b8;font-size:11px}.account-menu-item em{margin-left:auto;font-style:normal;color:#4e5a68}.account-menu-item.danger{color:#ff9d9d}.account-menu-item.danger .mi{color:#ff9d9d;background:rgba(255,120,120,.07)}
      .account-dialog.secret-center{width:min(94vw,920px);padding:0;overflow:hidden;border-radius:28px}.account-dialog.secret-center .dialog-close{z-index:4}.account-dialog.secret-center .account-brand{display:none}.account-center{display:grid;grid-template-columns:230px 1fr;min-height:600px}.account-center-sidebar{border-right:1px solid rgba(255,255,255,.08);padding:28px 16px 18px;background:rgba(255,255,255,.018)}.account-center-logo{display:flex;align-items:center;gap:10px;padding:0 9px 22px;font-size:11px;letter-spacing:.14em;font-weight:800;color:#91a1b4}.account-center-logo img{width:35px;height:35px;border-radius:11px}.account-center-user{padding:0 9px 18px}.account-center-user strong{display:block;font-size:14px}.account-center-user small{display:block;color:#6f7c8d;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-center-nav{display:grid;gap:4px}.account-center-nav button{border:0;background:transparent;color:#93a1b2;padding:10px 11px;border-radius:12px;text-align:left;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:9px}.account-center-nav button:hover,.account-center-nav button.active{background:rgba(255,255,255,.06);color:#fff}.account-center-nav i{font-style:normal;width:20px;text-align:center}.account-center-main{padding:34px 36px 36px;overflow:auto;max-height:78vh}.account-center-eyebrow{color:#5f7084;font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:800}.account-center-main h2{font-size:34px;margin:8px 0 6px}.account-center-lead{margin:0 0 25px!important;color:#8290a2!important;font-size:14px}.account-overview-hero{display:grid;grid-template-columns:64px 1fr auto;gap:15px;align-items:center;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018))}.account-overview-hero img{width:64px;height:64px;border-radius:50%;object-fit:cover}.account-overview-hero h3{margin:0;font-size:19px}.account-overview-hero p{margin:3px 0 0;font-size:12px}.status-chip{border:1px solid rgba(92,227,188,.2);background:rgba(92,227,188,.06);color:#8de2c4;border-radius:999px;padding:7px 10px;font-size:10px;white-space:nowrap}.account-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.account-card{border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025);padding:17px}.account-card.wide{grid-column:span 2}.account-card-label{font-size:9px;letter-spacing:.13em;color:#5f6d80;text-transform:uppercase;font-weight:800}.account-card-value{font-size:14px;margin-top:7px;color:#dce7f2}.account-card code{font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;color:#b9ccdf}.account-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.subtle-button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.04);color:#d9e4ef;border-radius:11px;padding:8px 10px;font-size:11px;cursor:pointer}.subtle-button:hover{background:rgba(255,255,255,.07)}.provider-row,.device-row,.ecosystem-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.06)}.provider-row:last-child,.device-row:last-child,.ecosystem-row:last-child{border-bottom:0}.provider-icon,.device-icon,.ecosystem-icon{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.055);display:grid;place-items:center;font-weight:800}.provider-row strong,.device-row strong,.ecosystem-row strong{display:block;font-size:13px}.provider-row small,.device-row small,.ecosystem-row small{display:block;color:#69778a;font-size:10px}.provider-state{margin-left:auto;font-size:10px;color:#8de2c4}.coming{color:#647286}.settings-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.06)}.settings-row:last-child{border-bottom:0}.settings-row strong{font-size:13px}.settings-row small{display:block;color:#687689;font-size:10px;margin-top:2px}.segmented{display:flex;padding:3px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px}.segmented button{border:0;background:transparent;color:#718095;border-radius:7px;padding:6px 9px;font-size:10px;cursor:pointer}.segmented button.active{background:rgba(255,255,255,.1);color:#fff}.account-placeholder{padding:22px;border:1px dashed rgba(255,255,255,.1);border-radius:16px;color:#6d7b8d;font-size:12px}.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,14px);background:#111821;color:#eaf2fb;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:10px 15px;font-size:11px;opacity:0;pointer-events:none;transition:.2s;z-index:200}.toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:760px){.account-menu{right:-4px}.account-dialog.secret-center{width:min(96vw,620px)}.account-center{grid-template-columns:1fr}.account-center-sidebar{border-right:0;border-bottom:1px solid rgba(255,255,255,.08);padding:18px 16px 12px}.account-center-logo{padding-bottom:12px}.account-center-user{display:none}.account-center-nav{display:flex;overflow:auto;padding-bottom:2px}.account-center-nav button{white-space:nowrap}.account-center-main{padding:24px 19px 28px;max-height:66vh}.account-grid{grid-template-columns:1fr}.account-card.wide{grid-column:auto}.account-overview-hero{grid-template-columns:54px 1fr}.account-overview-hero img{width:54px;height:54px}.account-overview-hero .status-chip{grid-column:span 2;justify-self:start}.account-center-main h2{font-size:29px}}
    `;
    document.head.appendChild(style);
  }

  let menu = qs('#accountMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'accountMenu';
    menu.className = 'account-menu';
    menu.hidden = true;
    qs('.nav-actions')?.appendChild(menu);
  }

  if (!qs('#secretIdToast')) {
    const toast = document.createElement('div');
    toast.id = 'secretIdToast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
}

function configureSecretIdUi() {
  const brand = qs('.account-brand span');
  if (brand) brand.textContent = 'SECRET ID';

  setBilingual(qs('h2', signedOutView), 'Tu Secret ID empieza aquí.', 'Your Secret ID starts here.');
  setBilingual(
    qs('p:not(.auth-status)', signedOutView),
    'Continúa con Google para crear o acceder a tu Secret ID. No necesitas otra contraseña.',
    'Continue with Google to create or access your Secret ID. No extra password required.',
  );
  setBilingual(
    qs('small', signedOutView),
    'Google verifica tu identidad y vincula tu correo; tu cuenta dentro del ecosistema es Secret ID.',
    'Google verifies your identity and links your email; your account inside the ecosystem is Secret ID.',
  );

  const finalCta = qs('.final-cta');
  if (finalCta) {
    const kicker = qs('.section-kicker', finalCta);
    if (kicker) kicker.textContent = 'SECRET ID';
    setBilingual(qs('h2', finalCta), 'Empieza con Secret ID.', 'Start with Secret ID.');
  }
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  qsa('[data-es][data-en]').forEach((el) => {
    el.textContent = el.dataset[state.lang];
  });
  langToggle.textContent = state.lang === 'es' ? 'EN' : 'ES';
  localStorage.setItem('gamms-lang', state.lang);
  updateSessionAwareCtas();
  if (state.user) {
    renderAccountMenu();
    renderAccountCenter(state.accountSection);
  }
}

function updateSessionAwareCtas() {
  qsa('.js-get-started').forEach((button) => {
    const label = qs('span:first-child', button);
    if (!label) return;
    if (state.user) {
      label.textContent = state.lang === 'es' ? 'Mi Secret ID' : 'My Secret ID';
      label.dataset.es = 'Mi Secret ID';
      label.dataset.en = 'My Secret ID';
      button.setAttribute('aria-label', state.lang === 'es' ? 'Abrir mi Secret ID' : 'Open my Secret ID');
    } else {
      label.textContent = 'Get Started';
      label.dataset.es = 'Get Started';
      label.dataset.en = 'Get Started';
      button.setAttribute('aria-label', 'Get Started');
    }
  });

  const finalCta = qs('.final-cta');
  if (finalCta) {
    const title = qs('h2', finalCta);
    const body = qs('p', finalCta);
    if (state.user) {
      setBilingual(title, 'Tu Secret ID está listo.', 'Your Secret ID is ready.');
      setBilingual(body, 'Gestiona tu identidad, cuentas vinculadas, seguridad y acceso al ecosistema GAMMS.', 'Manage your identity, linked accounts, security and access to the GAMMS ecosystem.');
    } else {
      setBilingual(title, 'Empieza con Secret ID.', 'Start with Secret ID.');
      setBilingual(body, 'Una identidad para acceder gradualmente a productos, documentación, experiencias y servicios del ecosistema.', 'One identity for future access to products, documentation, experiences and ecosystem services.');
    }
  }
}

function showToast(message) {
  const toast = qs('#secretIdToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(String(text));
    showToast(successMessage);
  } catch {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    showToast(successMessage);
  }
}

function toggleAccountMenu(force) {
  if (!state.user) return openAccountDialog();
  const menu = qs('#accountMenu');
  if (!menu) return;
  const shouldOpen = typeof force === 'boolean' ? force : menu.hidden;
  menu.hidden = !shouldOpen;
  accountButton.classList.toggle('menu-open', shouldOpen);
  accountButton.setAttribute('aria-expanded', String(shouldOpen));
}

function closeAccountMenu() {
  toggleAccountMenu(false);
}

function renderAccountMenu() {
  const menu = qs('#accountMenu');
  if (!menu || !state.user) return;
  const avatar = escapeHtml(state.user.picture || 'assets/gamms-logo.webp');
  const name = escapeHtml(state.user.name || 'Secret ID User');
  const email = escapeHtml(state.user.email || '');
  const sid = escapeHtml(shortSecretId(state.user.id));
  const t = state.lang === 'es'
    ? {my:'Mi Secret ID', profile:'Perfil', linked:'Cuentas vinculadas', security:'Seguridad y sesiones', devices:'Dispositivos', preferences:'Preferencias', ecosystem:'Ecosistema GAMMS', privacy:'Privacidad y datos', help:'Ayuda y soporte', signout:'Cerrar sesión', id:'Identificador'}
    : {my:'My Secret ID', profile:'Profile', linked:'Linked accounts', security:'Security & sessions', devices:'Devices', preferences:'Preferences', ecosystem:'GAMMS ecosystem', privacy:'Privacy & data', help:'Help & support', signout:'Sign out', id:'Identifier'};

  menu.innerHTML = `
    <div class="account-menu-profile">
      <img src="${avatar}" alt="">
      <div><strong>${name}</strong><small>${email}</small><div class="account-menu-badges"><span>Secret ID</span><span class="google-badge">Signed with Google ✓</span></div></div>
    </div>
    <div class="account-menu-sid"><span><small>${t.id}</small><code>${sid}</code></span><button class="mini-copy" type="button" data-copy-sid aria-label="Copy Secret ID">⧉</button></div>
    <div class="account-menu-divider"></div>
    <button class="account-menu-item" type="button" data-open-section="overview"><span class="mi">ID</span>${t.my}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="profile"><span class="mi">◉</span>${t.profile}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="linked"><span class="mi">↗</span>${t.linked}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="security"><span class="mi">⌾</span>${t.security}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="devices"><span class="mi">▣</span>${t.devices}<em>›</em></button>
    <div class="account-menu-divider"></div>
    <button class="account-menu-item" type="button" data-open-section="preferences"><span class="mi">⚙</span>${t.preferences}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="ecosystem"><span class="mi">◇</span>${t.ecosystem}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="privacy"><span class="mi">◫</span>${t.privacy}<em>›</em></button>
    <button class="account-menu-item" type="button" data-open-section="help"><span class="mi">?</span>${t.help}<em>›</em></button>
    <div class="account-menu-divider"></div>
    <button class="account-menu-item danger" type="button" data-menu-logout><span class="mi">↪</span>${t.signout}</button>
  `;
}

function centerText() {
  return state.lang === 'es'
    ? {
      nav:{overview:'Mi Secret ID',profile:'Perfil',linked:'Cuentas vinculadas',security:'Seguridad',devices:'Dispositivos',preferences:'Preferencias',ecosystem:'Ecosistema',privacy:'Privacidad',help:'Ayuda'},
      title:{overview:'Mi Secret ID',profile:'Perfil',linked:'Cuentas vinculadas',security:'Seguridad y sesiones',devices:'Dispositivos',preferences:'Preferencias',ecosystem:'Ecosistema GAMMS',privacy:'Privacidad y datos',help:'Ayuda y soporte'},
      lead:{overview:'Tu identidad para el ecosistema GAMMS.',profile:'Información asociada a tu Secret ID.',linked:'Proveedores que pueden autenticar tu Secret ID.',security:'Controla tu sesión y revisa cómo accedes.',devices:'Dispositivos y navegadores asociados a tu cuenta.',preferences:'Personaliza cómo se comporta tu cuenta.',ecosystem:'Accesos y productos vinculados a tu identidad.',privacy:'Controla y exporta la información de tu cuenta.',help:'Información y herramientas de soporte.'},
      copy:'Copiar', copied:'Secret ID copiado', fullCopied:'Identificador completo copiado', export:'Exportar datos', current:'Actual', active:'Activo', soon:'Próximamente', signout:'Cerrar sesión en este dispositivo', language:'Idioma de la interfaz', languageDesc:'Se guarda en este navegador.', session:'Sesión actual', sessionDesc:'Protegida con cookie HttpOnly y Secure.', provider:'Proveedor de identidad', primaryEmail:'Correo principal', technicalId:'Identificador técnico', friendlyId:'Secret ID', member:'Cuenta activa', currentDevice:'Este navegador', otherSessions:'Más gestión de sesiones se añadirá cuando habilitemos el historial multidispositivo.', dataExport:'Exportar copia de cuenta', dataExportDesc:'Genera un archivo JSON local con los datos visibles de tu Secret ID.', privacyNote:'No compartimos tu Secret ID técnico en la interfaz pública. Google se usa para autenticar y vincular tu correo.', support:'Centro de soporte', supportDesc:'Próximamente tendremos tickets y recuperación avanzada desde Secret ID.'
    }
    : {
      nav:{overview:'My Secret ID',profile:'Profile',linked:'Linked accounts',security:'Security',devices:'Devices',preferences:'Preferences',ecosystem:'Ecosystem',privacy:'Privacy',help:'Help'},
      title:{overview:'My Secret ID',profile:'Profile',linked:'Linked accounts',security:'Security & sessions',devices:'Devices',preferences:'Preferences',ecosystem:'GAMMS ecosystem',privacy:'Privacy & data',help:'Help & support'},
      lead:{overview:'Your identity for the GAMMS ecosystem.',profile:'Information associated with your Secret ID.',linked:'Providers that can authenticate your Secret ID.',security:'Control your session and review how you sign in.',devices:'Devices and browsers associated with your account.',preferences:'Customize how your account behaves.',ecosystem:'Access and products linked to your identity.',privacy:'Control and export your account information.',help:'Support information and tools.'},
      copy:'Copy', copied:'Secret ID copied', fullCopied:'Full identifier copied', export:'Export data', current:'Current', active:'Active', soon:'Coming soon', signout:'Sign out on this device', language:'Interface language', languageDesc:'Saved in this browser.', session:'Current session', sessionDesc:'Protected with HttpOnly and Secure cookie.', provider:'Identity provider', primaryEmail:'Primary email', technicalId:'Technical identifier', friendlyId:'Secret ID', member:'Active account', currentDevice:'This browser', otherSessions:'More session management will be added when multi-device history is enabled.', dataExport:'Export account copy', dataExportDesc:'Creates a local JSON file with the visible data from your Secret ID.', privacyNote:'We do not expose your technical Secret ID in the public interface. Google is used to authenticate and link your email.', support:'Support center', supportDesc:'Tickets and advanced Secret ID recovery will be added later.'
    };
}

function accountCenterShell(section, body) {
  const t = centerText();
  const name = escapeHtml(state.user?.name || 'Secret ID User');
  const email = escapeHtml(state.user?.email || '');
  const navItems = [
    ['overview','ID'],['profile','◉'],['linked','↗'],['security','⌾'],['devices','▣'],['preferences','⚙'],['ecosystem','◇'],['privacy','◫'],['help','?']
  ].map(([key,icon]) => `<button type="button" data-center-section="${key}" class="${section === key ? 'active' : ''}"><i>${icon}</i>${escapeHtml(t.nav[key])}</button>`).join('');
  return `
    <div class="account-center">
      <aside class="account-center-sidebar">
        <div class="account-center-logo"><img src="assets/gamms-logo.webp" alt=""><span>SECRET ID</span></div>
        <div class="account-center-user"><strong>${name}</strong><small>${email}</small></div>
        <div class="account-center-nav">${navItems}</div>
      </aside>
      <section class="account-center-main">
        <span class="account-center-eyebrow">SECRET ID · GAMMS GROUP</span>
        <h2>${escapeHtml(t.title[section])}</h2>
        <p class="account-center-lead">${escapeHtml(t.lead[section])}</p>
        ${body}
      </section>
    </div>`;
}

function renderAccountCenter(section = 'overview') {
  if (!state.user) return;
  state.accountSection = section;
  const t = centerText();
  const avatar = escapeHtml(state.user.picture || 'assets/gamms-logo.webp');
  const name = escapeHtml(state.user.name || 'Secret ID User');
  const email = escapeHtml(state.user.email || '');
  const sid = escapeHtml(shortSecretId(state.user.id));
  const fullId = escapeHtml(state.user.id || '');
  const platform = escapeHtml(navigator.userAgentData?.platform || navigator.platform || 'Browser');
  let body = '';

  if (section === 'overview') {
    body = `
      <div class="account-overview-hero"><img src="${avatar}" alt=""><div><h3>${name}</h3><p>${email}</p></div><span class="status-chip">● ${t.member}</span></div>
      <div class="account-grid">
        <div class="account-card"><div class="account-card-label">${t.friendlyId}</div><div class="account-card-value"><code>${sid}</code></div><div class="account-card-actions"><button class="subtle-button" type="button" data-copy-friendly>${t.copy}</button></div></div>
        <div class="account-card"><div class="account-card-label">${t.provider}</div><div class="account-card-value">Google · <span style="color:#8de2c4">Signed with Google ✓</span></div></div>
        <div class="account-card"><div class="account-card-label">${t.primaryEmail}</div><div class="account-card-value">${email}</div></div>
        <div class="account-card"><div class="account-card-label">${t.session}</div><div class="account-card-value">${t.active} · ${platform}</div></div>
        <div class="account-card wide"><div class="account-card-label">${t.technicalId}</div><div class="account-card-value"><code>${fullId}</code></div><div class="account-card-actions"><button class="subtle-button" type="button" data-copy-full>${t.copy}</button></div></div>
      </div>`;
  } else if (section === 'profile') {
    body = `<div class="account-grid"><div class="account-card"><div class="account-card-label">Nombre</div><div class="account-card-value">${name}</div></div><div class="account-card"><div class="account-card-label">${t.primaryEmail}</div><div class="account-card-value">${email}</div></div><div class="account-card wide"><div class="account-card-label">Secret ID</div><div class="account-card-value"><code>${sid}</code></div><p style="font-size:11px;margin:10px 0 0;color:#687689">La foto y el nombre actuales provienen de la identidad de Google vinculada.</p></div></div>`;
  } else if (section === 'linked') {
    body = `<div class="account-card"><div class="provider-row"><div class="provider-icon">G</div><div><strong>Google</strong><small>${email}</small></div><span class="provider-state">${t.active} ✓</span></div><div class="provider-row"><div class="provider-icon">A</div><div><strong>Apple</strong><small>Sign in with Apple</small></div><span class="provider-state coming">${t.soon}</span></div><div class="provider-row"><div class="provider-icon">M</div><div><strong>Microsoft</strong><small>Microsoft Account</small></div><span class="provider-state coming">${t.soon}</span></div></div>`;
  } else if (section === 'security') {
    body = `<div class="account-grid"><div class="account-card wide"><div class="account-card-label">${t.session}</div><div class="account-card-value">${t.sessionDesc}</div><div class="device-row"><div class="device-icon">▣</div><div><strong>${platform}</strong><small>${t.currentDevice}</small></div><span class="provider-state">${t.current}</span></div><div class="account-card-actions"><button class="subtle-button" type="button" data-center-logout>${t.signout}</button></div></div><div class="account-card wide"><div class="account-placeholder">${t.otherSessions}</div></div></div>`;
  } else if (section === 'devices') {
    body = `<div class="account-card"><div class="device-row"><div class="device-icon">▣</div><div><strong>${platform}</strong><small>${t.currentDevice} · ${t.active}</small></div><span class="provider-state">${t.current}</span></div><div class="account-placeholder" style="margin-top:12px">${t.otherSessions}</div></div>`;
  } else if (section === 'preferences') {
    body = `<div class="account-card"><div class="settings-row"><div><strong>${t.language}</strong><small>${t.languageDesc}</small></div><div class="segmented"><button type="button" data-language="es" class="${state.lang === 'es' ? 'active' : ''}">ES</button><button type="button" data-language="en" class="${state.lang === 'en' ? 'active' : ''}">EN</button></div></div><div class="settings-row"><div><strong>Secret ID UI</strong><small>${state.lang === 'es' ? 'Tema visual sincronizado con GAMMS GROUP.' : 'Visual theme synchronized with GAMMS GROUP.'}</small></div><span class="status-chip">Dark</span></div></div>`;
  } else if (section === 'ecosystem') {
    body = `<div class="account-card"><a class="ecosystem-row" href="#products" style="color:inherit;text-decoration:none"><div class="ecosystem-icon">M</div><div><strong>GAMMS MDM</strong><small>Enterprise Device Platform</small></div><span class="provider-state">↗</span></a><a class="ecosystem-row" href="#products" style="color:inherit;text-decoration:none"><div class="ecosystem-icon">UI</div><div><strong>GAMMS.UI</strong><small>Multiplatform Design System</small></div><span class="provider-state">↗</span></a><a class="ecosystem-row" href="/secretos/" style="color:inherit;text-decoration:none"><div class="ecosystem-icon">S</div><div><strong>SecretOS</strong><small>Operating System</small></div><span class="provider-state">↗</span></a><a class="ecosystem-row" href="/gma-64/" style="color:inherit;text-decoration:none"><div class="ecosystem-icon">64</div><div><strong>GMA-64</strong><small>Architecture · R&amp;D</small></div><span class="provider-state">↗</span></a></div>`;
  } else if (section === 'privacy') {
    body = `<div class="account-grid"><div class="account-card wide"><div class="account-card-label">${t.dataExport}</div><div class="account-card-value">${t.dataExportDesc}</div><div class="account-card-actions"><button class="subtle-button" type="button" data-export-account>${t.export}</button></div></div><div class="account-card wide"><div class="account-placeholder">${t.privacyNote}</div></div></div>`;
  } else {
    body = `<div class="account-grid"><div class="account-card wide"><div class="account-card-label">${t.support}</div><div class="account-card-value">${t.supportDesc}</div></div><div class="account-card"><div class="account-card-label">Secret ID</div><div class="account-card-value"><code>${sid}</code></div></div><div class="account-card"><div class="account-card-label">Status</div><div class="account-card-value" style="color:#8de2c4">Operational ✓</div></div></div>`;
  }

  signedInView.innerHTML = accountCenterShell(section, body);
}

function openAccountCenter(section = 'overview') {
  if (!state.user) return openAccountDialog();
  closeAccountMenu();
  state.accountSection = section;
  accountDialog.classList.add('secret-center');
  renderAccountCenter(section);
  if (!accountDialog.open) accountDialog.showModal();
}

function openAccountDialog() {
  closeAccountMenu();
  if (state.user) return openAccountCenter(state.accountSection || 'overview');
  accountDialog.classList.remove('secret-center');
  if (!accountDialog.open) accountDialog.showModal();
  prepareGoogleSignIn();
}

function closeAccountDialog() {
  if (accountDialog.open) accountDialog.close();
}

function setUser(user) {
  state.user = user || null;
  if (state.user) {
    signedOutView.hidden = true;
    signedInView.hidden = false;
    accountDialog.classList.toggle('secret-center', accountDialog.open);
    const firstName = escapeHtml((state.user.name || 'Account').split(' ')[0]);
    const avatar = state.user.picture ? `<img src="${escapeHtml(state.user.picture)}" alt="">` : '';
    accountButton.classList.add('signed-in');
    accountButton.innerHTML = `${avatar}<span class="account-pill-label">${firstName}</span><span class="account-pill-chevron">▾</span>`;
    accountButton.setAttribute('aria-haspopup', 'menu');
    accountButton.setAttribute('aria-expanded', 'false');
    renderAccountMenu();
    renderAccountCenter(state.accountSection);
  } else {
    signedOutView.hidden = false;
    signedInView.hidden = true;
    accountDialog.classList.remove('secret-center');
    accountButton.classList.remove('signed-in', 'menu-open');
    accountButton.innerHTML = '<span class="account-pill-label">Get Started</span>';
    accountButton.removeAttribute('aria-haspopup');
    accountButton.setAttribute('aria-expanded', 'false');
    const menu = qs('#accountMenu');
    if (menu) menu.hidden = true;
  }
  updateSessionAwareCtas();
}

async function loadSession() {
  try {
    const response = await fetch('/api/account/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return setUser(null);
    const data = await response.json();
    setUser(data.user || null);
  } catch {
    setUser(null);
  }
}

async function prepareGoogleSignIn() {
  if (state.user || state.googleReady) return;
  authStatus.textContent = state.lang === 'es' ? 'Preparando Google…' : 'Preparing Google…';
  try {
    const response = await fetch('/api/account/config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.clientId) {
      authStatus.textContent = state.lang === 'es'
        ? 'Google Sign-In aún necesita configuración en el servidor.'
        : 'Google Sign-In still needs server configuration.';
      return;
    }
    state.clientId = config.clientId;
    await waitForGoogle();
    google.accounts.id.initialize({
      client_id: state.clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    state.googleReady = true;
    renderGoogleButton();
    authStatus.textContent = '';
  } catch (error) {
    console.error(error);
    authStatus.textContent = state.lang === 'es'
      ? 'No se pudo cargar el inicio de sesión.'
      : 'Sign-in could not be loaded.';
  }
}

function waitForGoogle() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve();
      } else if (++tries > 80) {
        clearInterval(timer);
        reject(new Error('Google Identity Services did not load'));
      }
    }, 100);
  });
}

function renderGoogleButton() {
  if (!state.googleReady || !googleButton) return;
  googleButton.innerHTML = '';
  google.accounts.id.renderButton(googleButton, {
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    width: Math.min(360, Math.max(260, googleButton.clientWidth || 340)),
    locale: state.lang === 'es' ? 'es' : 'en',
  });
}

async function handleGoogleCredential(response) {
  if (!response?.credential) return;
  authStatus.textContent = state.lang === 'es' ? 'Creando tu Secret ID…' : 'Creating your Secret ID…';
  try {
    const result = await fetch('/api/account/google', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data.user) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    authStatus.textContent = '';
    closeAccountDialog();
    showToast(state.lang === 'es' ? 'Secret ID conectado' : 'Secret ID connected');
  } catch (error) {
    console.error(error);
    authStatus.textContent = state.lang === 'es'
      ? 'No se pudo iniciar sesión con Google.'
      : 'Google sign-in failed.';
  }
}

function exportAccountData() {
  if (!state.user) return;
  const payload = {
    type: 'Secret ID export',
    exportedAt: new Date().toISOString(),
    secretId: shortSecretId(state.user.id),
    technicalId: state.user.id,
    name: state.user.name,
    email: state.user.email,
    identityProvider: 'Google',
    locale: state.user.locale || state.lang,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `secret-id-${shortSecretId(state.user.id).toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(state.lang === 'es' ? 'Copia de cuenta generada' : 'Account copy generated');
}

async function logout() {
  try {
    await fetch('/api/account/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    setUser(null);
    closeAccountDialog();
    closeAccountMenu();
  }
}

function toggleLanguage() {
  state.lang = state.lang === 'es' ? 'en' : 'es';
  applyLanguage();
  if (state.googleReady) renderGoogleButton();
}

langToggle.addEventListener('click', toggleLanguage);
accountButton.addEventListener('click', (event) => {
  event.stopPropagation();
  if (state.user) toggleAccountMenu();
  else openAccountDialog();
});
accountClose.addEventListener('click', closeAccountDialog);
qsa('.js-get-started').forEach((button) => button.addEventListener('click', () => state.user ? openAccountCenter('overview') : openAccountDialog()));

qs('.nav-actions')?.addEventListener('click', (event) => {
  const sectionButton = event.target.closest('[data-open-section]');
  if (sectionButton) return openAccountCenter(sectionButton.dataset.openSection);
  if (event.target.closest('[data-copy-sid]') && state.user) return copyText(shortSecretId(state.user.id), state.lang === 'es' ? 'Secret ID copiado' : 'Secret ID copied');
  if (event.target.closest('[data-menu-logout]')) return logout();
});

signedInView.addEventListener('click', (event) => {
  const sectionButton = event.target.closest('[data-center-section]');
  if (sectionButton) return renderAccountCenter(sectionButton.dataset.centerSection);
  if (event.target.closest('[data-copy-friendly]')) return copyText(shortSecretId(state.user?.id), centerText().copied);
  if (event.target.closest('[data-copy-full]')) return copyText(state.user?.id || '', centerText().fullCopied);
  if (event.target.closest('[data-export-account]')) return exportAccountData();
  if (event.target.closest('[data-center-logout]')) return logout();
  const languageButton = event.target.closest('[data-language]');
  if (languageButton) {
    state.lang = languageButton.dataset.language;
    applyLanguage();
    if (state.googleReady) renderGoogleButton();
  }
});

accountDialog.addEventListener('click', (event) => {
  const rect = accountDialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) closeAccountDialog();
});

document.addEventListener('click', (event) => {
  const menu = qs('#accountMenu');
  if (!menu || menu.hidden) return;
  if (!menu.contains(event.target) && !accountButton.contains(event.target)) closeAccountMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAccountMenu();
});

menuToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
qsa('a', navLinks).forEach((link) => link.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 20), { passive: true });
window.addEventListener('resize', () => {
  if (state.googleReady) renderGoogleButton();
  closeAccountMenu();
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: .12 });
qsa('.reveal').forEach((node) => observer.observe(node));

installSecretIdEnhancements();
configureSecretIdUi();
applyLanguage();
loadSession();
