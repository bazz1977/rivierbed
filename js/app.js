// ---- Configuratie ----
const API_BASE = "https://elvestrom-driftwood.101-a9b.workers.dev";

const THEME_FILES = {
  "steenmuseum": "css/theme-steenmuseum.css",
  "nachtelijke-fjord": "css/theme-nachtelijke-fjord.css",
  "archiefkaart": "css/theme-archiefkaart.css",
  "rauw-beton": "css/theme-rauwbeton.css",
};

// Tijdelijke drijfhout-placeholders (rechtenvrij, Pexels) totdat er scherpe
// eigen productfoto's zijn. Vervang per titel zodra die er zijn.
const IMAGE_BY_TITLE = {
  "Åndevrak": "https://images.pexels.com/photos/6711834/pexels-photo-6711834.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Nattflo": "https://images.pexels.com/photos/36340078/pexels-photo-36340078.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Trollrot": "https://images.pexels.com/photos/16619830/pexels-photo-16619830.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Vindsjel": "https://images.pexels.com/photos/11183740/pexels-photo-11183740.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Elvedraug": "https://images.pexels.com/photos/19430078/pexels-photo-19430078.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Skyggegren": "https://images.pexels.com/photos/20306275/pexels-photo-20306275.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
  "Runetre": "https://images.pexels.com/photos/38539559/pexels-photo-38539559.jpeg?auto=compress&cs=tinysrgb&w=1000&h=1250&fit=crop",
};
function imageFor(obj){
  return IMAGE_BY_TITLE[obj.title] || obj.image_data || "";
}

let currentUser = null;
let authMode = 'login';
let checkoutObjectId = null;
let shippingRates = [];

// ---- API helper ----
async function api(path, opts={}){
  const res = await fetch(API_BASE + path, {credentials:'include', headers:{'Content-Type':'application/json', ...(opts.headers||{})}, ...opts});
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

// ---- Thema ----
function applyTheme(name){
  const file = THEME_FILES[name] || THEME_FILES["nachtelijke-fjord"];
  document.getElementById('theme-css').setAttribute('href', file);
  document.querySelectorAll('#theme-switcher button').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === name);
  });
}
async function initTheme(){
  const r = await api('/api/settings');
  const settings = r.ok ? r.data : { theme_switcher_enabled: true, default_theme: 'nachtelijke-fjord' };
  const switcherEl = document.getElementById('theme-switcher');

  if (settings.theme_switcher_enabled) {
    switcherEl.hidden = false;
    switcherEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.theme;
        localStorage.setItem('elvestrom_theme', chosen);
        applyTheme(chosen);
      });
    });
    const saved = localStorage.getItem('elvestrom_theme');
    applyTheme(saved && THEME_FILES[saved] ? saved : settings.default_theme);
  } else {
    switcherEl.hidden = true;
    applyTheme(settings.default_theme);
  }
}

// ---- Modals ----
function openModal(id){ document.getElementById(id).classList.add('visible'); }
function closeModal(id){ document.getElementById(id).classList.remove('visible'); document.getElementById(id).querySelectorAll('.error-msg').forEach(e=>e.textContent=''); }

// ---- Account / auth ----
function renderAccountArea(){
  const el = document.getElementById('account-area');
  if (currentUser) {
    el.innerHTML = `<span>${currentUser.email}</span><button onclick="doLogout()">Uitloggen</button>`;
  } else {
    el.innerHTML = `<button onclick="openAuthModal('login')">Inloggen</button>`;
  }
}
function openAuthModal(mode){
  authMode = mode;
  document.getElementById('auth-title').textContent = mode === 'login' ? 'Inloggen' : 'Account aanmaken';
  document.querySelector('#auth-modal .switch').textContent = mode === 'login' ? 'Nog geen account? Registreer hier.' : 'Al een account? Log hier in.';
  openModal('auth-modal');
}
function toggleAuthMode(){ openAuthModal(authMode === 'login' ? 'register' : 'login'); }
async function submitAuth(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const r = await api(path, {method:'POST', body: JSON.stringify({email, password})});
  if (!r.ok) { document.getElementById('auth-error').textContent = (r.data && r.data.error) || 'Er ging iets mis'; return; }
  currentUser = { email: r.data.email, role: r.data.role };
  renderAccountArea();
  closeModal('auth-modal');
}
async function doLogout(){
  await api('/api/auth/logout', {method:'POST'});
  currentUser = null;
  renderAccountArea();
}
async function checkSession(){
  const r = await api('/api/auth/me');
  if (r.ok && r.data.loggedIn) currentUser = { email: r.data.email, role: r.data.role };
  renderAccountArea();
}

// ---- Data ----
function euros(n){ return Number(n).toFixed(2).replace('.', ','); }

async function loadFeatured(){
  const r = await api('/api/objects/featured');
  if (!r.ok || !r.data) { document.getElementById('hero').style.display = 'none'; return; }
  const o = r.data;
  document.getElementById('hero-img').src = imageFor(o);
  document.getElementById('hero-title').textContent = o.title;
  document.getElementById('hero-desc').textContent = o.description || '';
  document.getElementById('hero-tag-text').textContent = `${o.origin_river || ''}, ${o.origin_year || ''}`;
  const priceRow = document.getElementById('hero-price-row');
  priceRow.innerHTML = o.discount_percent > 0
    ? `<span class="now">€ ${euros(o.effective_price)}</span><span class="was">€ ${euros(o.price)}</span>`
    : `<span class="now">€ ${euros(o.price)}</span>`;
  const cta = document.getElementById('hero-cta');
  cta.hidden = false;
  cta.onclick = () => startCheckout(o.id, o.title);
}

async function loadGallery(){
  const r = await api('/api/objects');
  const gallery = document.getElementById('gallery');
  document.getElementById('gallery-count').textContent = r.ok ? `${r.data.length} objecten` : '';
  if (!r.ok) { gallery.innerHTML = '<p style="padding:0 48px 48px;opacity:0.6">Kon de collectie niet laden.</p>'; return; }
  gallery.innerHTML = r.data.map(o => {
    const priceHtml = o.discount_percent > 0
      ? `<span class="now">€ ${euros(o.effective_price)}</span><span class="was">€ ${euros(o.price)}</span>`
      : `<span class="now">€ ${euros(o.price)}</span>`;
    return `
    <div class="item">
      <div class="item-media">
        <img src="${imageFor(o)}" alt="${o.title}">
        <div class="object-tag"><span class="dot"></span><span>${o.origin_river || ''}, ${o.origin_year || ''}</span></div>
      </div>
      <div class="item-info">
        <h3>${o.title}</h3>
        <p>${o.description || ''}</p>
        <div class="price-row">${priceHtml}</div>
        <button class="btn" onclick="startCheckout(${o.id}, '${o.title.replace(/'/g,"\\'")}')">Bestel dit object</button>
      </div>
    </div>`;
  }).join('');
}

async function loadShippingRates(){
  const r = await api('/api/shipping-rates');
  if (r.ok) shippingRates = r.data;
}

// ---- Checkout ----
function startCheckout(objectId, title){
  if (!currentUser) { openAuthModal('login'); return; }
  checkoutObjectId = objectId;
  document.getElementById('co-title').textContent = title;
  const sel = document.getElementById('co-country');
  sel.innerHTML = shippingRates.map(s => `<option value="${s.country}">${s.country}</option>`).join('');
  document.getElementById('co-discount').value = '';
  openModal('checkout-modal');
}
async function submitCheckout(){
  const country = document.getElementById('co-country').value;
  const discount_code = document.getElementById('co-discount').value.trim();
  const r = await api('/api/checkout', {method:'POST', body: JSON.stringify({ object_id: checkoutObjectId, country, discount_code: discount_code || undefined })});
  if (!r.ok) { document.getElementById('co-error').textContent = (r.data && r.data.error) || 'Bestellen mislukt'; return; }
  closeModal('checkout-modal');
  document.getElementById('confirm-body').innerHTML = `
    <div class="summary-line"><span>Object</span><span>${r.data.object_title}</span></div>
    <div class="summary-line"><span>Prijs</span><span>€ ${euros(r.data.price_paid)}</span></div>
    <div class="summary-line"><span>Verzending</span><span>€ ${euros(r.data.shipping_paid)}</span></div>
    <div class="summary-total">Totaal: € ${euros(r.data.total)}</div>
    <p style="font-size:12px;opacity:0.6;margin-top:16px">${r.data.note || ''}</p>
  `;
  openModal('confirm-modal');
  loadGallery();
  loadFeatured();
}

// ---- Start ----
initTheme();
checkSession();
loadFeatured();
loadGallery();
loadShippingRates();
