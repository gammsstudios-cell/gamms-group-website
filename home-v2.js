const state = {
  lang: localStorage.getItem('gamms-lang') || 'es',
  user: null,
  googleReady: false,
  clientId: null,
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

function setBilingual(el, es, en) {
  if (!el) return;
  el.dataset.es = es;
  el.dataset.en = en;
  el.textContent = state.lang === 'es' ? es : en;
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

  const profileLabel = qs('.profile-block span', signedInView);
  if (profileLabel) profileLabel.textContent = 'Secret ID';

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
}

function renderIdentityNote() {
  const note = qs('.profile-note', signedInView);
  if (!note || !state.user) return;
  const providerText = state.lang === 'es' ? 'Vinculado con Google ✓' : 'Signed with Google ✓';
  const secretId = escapeHtml(state.user.id || '');
  note.innerHTML = `<strong>${providerText}</strong><br><span>Secret ID</span><br><code>${secretId}</code>`;
}

function toggleLanguage() {
  state.lang = state.lang === 'es' ? 'en' : 'es';
  applyLanguage();
  if (state.user) renderIdentityNote();
  if (state.googleReady) renderGoogleButton();
}

function openAccountDialog() {
  if (!accountDialog.open) accountDialog.showModal();
  if (!state.user) prepareGoogleSignIn();
}

function closeAccountDialog() {
  if (accountDialog.open) accountDialog.close();
}

function escapeHtml(value = '') {
  const entities = {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'};
  return String(value).replace(/[&<>'"]/g, (char) => entities[char]);
}

function setUser(user) {
  state.user = user || null;
  if (state.user) {
    signedOutView.hidden = true;
    signedInView.hidden = false;
    qs('#profileName').textContent = state.user.name || 'Secret ID User';
    qs('#profileEmail').textContent = state.user.email || '';
    const avatar = qs('#profileAvatar');
    avatar.src = state.user.picture || 'assets/gamms-logo.webp';
    avatar.alt = state.user.name || 'Secret ID User';
    renderIdentityNote();

    accountButton.classList.add('signed-in');
    accountButton.innerHTML = `${state.user.picture ? `<img src="${escapeHtml(state.user.picture)}" alt="">` : ''}<span class="account-pill-label">${escapeHtml((state.user.name || 'Account').split(' ')[0])}</span>`;
  } else {
    signedOutView.hidden = false;
    signedInView.hidden = true;
    accountButton.classList.remove('signed-in');
    accountButton.innerHTML = '<span class="account-pill-label">Get Started</span>';
  }
}

async function loadSession() {
  try {
    const response = await fetch('/api/account/me', { credentials: 'same-origin' });
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
  } catch (error) {
    console.error(error);
    authStatus.textContent = state.lang === 'es'
      ? 'No se pudo iniciar sesión con Google.'
      : 'Google sign-in failed.';
  }
}

async function logout() {
  try {
    await fetch('/api/account/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    setUser(null);
    closeAccountDialog();
  }
}

langToggle.addEventListener('click', toggleLanguage);
accountButton.addEventListener('click', openAccountDialog);
accountClose.addEventListener('click', closeAccountDialog);
qs('#logoutButton').addEventListener('click', logout);
qsa('.js-get-started').forEach((button) => button.addEventListener('click', openAccountDialog));

accountDialog.addEventListener('click', (event) => {
  const rect = accountDialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) closeAccountDialog();
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
window.addEventListener('resize', () => state.googleReady && renderGoogleButton());

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: .12 });
qsa('.reveal').forEach((node) => observer.observe(node));

configureSecretIdUi();
applyLanguage();
loadSession();
