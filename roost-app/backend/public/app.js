// ===================== API HELPER =====================
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ===================== CATEGORIES =====================
const CATEGORIES = [
  { code: 'FIN', label: 'Finches & canaries', color: 'var(--fin)', dark: 'var(--fin-dark)', icon: '🐤' },
  { code: 'PAR', label: 'Parrots', color: 'var(--par)', dark: 'var(--par-dark)', icon: '🦜' },
  { code: 'POU', label: 'Poultry & gamebirds', color: 'var(--pou)', dark: 'var(--pou-dark)', icon: '🐓' },
  { code: 'DOV', label: 'Pigeons & doves', color: 'var(--dov)', dark: 'var(--dov-dark)', icon: '🕊️' },
  { code: 'WTF', label: 'Waterfowl', color: 'var(--wtf)', dark: 'var(--wtf-dark)', icon: '🦆' },
  { code: 'RAP', label: 'Birds of prey / raptors', color: 'var(--rap)', dark: 'var(--rap-dark)', icon: '🦅' },
  { code: 'SFT', label: 'Softbills', color: 'var(--sft)', dark: 'var(--sft-dark)', icon: '🍇' },
  { code: 'OTH', label: 'Other', color: 'var(--oth)', dark: 'var(--oth-dark2)', icon: '🐦' },
  { code: 'SUP', label: 'Supplies & equipment', color: 'var(--sup)', dark: 'var(--sup-dark)', icon: '🧰' },
];
// Birds of prey are switched off for now: no listings exist yet, and they carry the most legal and
// ad-policy risk. Flip this to true (and RAPTORS_ENABLED in routes/listings.js) to bring the
// category back; the permit-number logic below is all still in place.
const RAPTORS_ENABLED = false;
const VISIBLE_CATEGORIES = CATEGORIES.filter(c => RAPTORS_ENABLED || c.code !== 'RAP');
const CONDITION_LABELS = { new: 'New', used_like_new: 'Used – like new', used_good: 'Used – good', needs_repair: 'Used – needs repair' };
function conditionLabel(code) { return CONDITION_LABELS[code] || 'Condition not specified'; }
// Deliberately broad, but this is still just a keyword list — it catches
// common, recognizable scam phrasing, not every possible rewording a
// determined scammer might use. It's a real speed bump, not a guarantee.
const SCAM_PATTERNS = [
  'wire transfer', 'western union', 'money gram', 'moneygram', 'gift card',
  'ship without meeting', 'shipping only', 'cashapp only', 'venmo only',
  'zelle only', 'chime only', 'apple pay only', 'no meeting',
  'paypal friends and family', 'paypal f&f', 'friends and family only',
  "cashier's check", 'cashiers check', 'money order',
  'non-refundable deposit', 'deposit to hold', 'deposit first', 'pay a deposit',
  'currently deployed', 'currently overseas', 'out of the country right now',
  'my shipper', 'my agent will', 'shipping agent', 'crypto', 'bitcoin'
];
function containsScamLanguage(text) {
  const lower = String(text || '').toLowerCase();
  return SCAM_PATTERNS.some(p => lower.includes(p));
}
// Same regex as utils/linkDetection.js on the backend — duplicated
// deliberately, since the browser can't require() that file directly.
// This is for instant feedback before sending; the server-side copy is
// the real enforcement, since a client-side-only check could be bypassed.
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(com|net|org|io|co|info|biz|us|shop|site|me|app)\b/i;
function containsUrl(text) {
  return URL_PATTERN.test(String(text || ''));
}

function catInfo(code) { return CATEGORIES.find(c => c.code === code) || CATEGORIES[CATEGORIES.length - 1]; }
// Clarifies whether a price covers one bird or the whole group — shown
// explicitly both ways (not just for the "total" case) since a buyer can
// misread either direction if it's left to guesswork.
function formatPriceDisplay(l, freeLabel) {
  if (l.free) return freeLabel || 'Free';
  return '$' + l.price + (l.priceType === 'total' ? ' for all' : ' each');
}

const STAR_PATH = 'M12 2l2.9 6.26L21 9.27l-4.5 4.4L17.8 21 12 17.77 6.2 21l1.3-7.33L3 9.27l6.1-1.01L12 2z';
function starIconSvg(size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="${STAR_PATH}"/></svg>`;
}
function starsDisplayHtml(avg, size) {
  size = size || 14;
  const pct = Math.max(0, Math.min(100, (Number(avg) || 0) / 5 * 100));
  const row = Array(5).fill(starIconSvg(size)).join('');
  return `<span class="stars-display" style="width:${size * 5 + 24}px;">
    <span class="stars-bg">${row}</span>
    <span class="stars-fg" style="width:${pct}%;">${row}</span>
  </span>`;
}
const CHECK_PATH = 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z';
function verifiedBadgeHtml(mode) {
  const size = mode === 'inline' ? 14 : (mode === 'large' ? 18 : 15);
  return `<span class="verified-badge" title="Verified breeder"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="${CHECK_PATH}"/></svg>${mode === 'large' ? '<span>Verified breeder</span>' : ''}</span>`;
}
// Show/hide toggle for password fields. `visible` describes the field's
// CURRENT state — true (plain text) shows the "eye-off" icon, since
// clicking it hides the password again; false shows the plain eye.
function eyeIconSvg(visible) {
  if (visible) {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}
function passwordFieldHtml(id, label, placeholder) {
  return `<div class="field">
    <label for="${id}">${label}</label>
    <div class="password-field-wrap">
      <input type="password" id="${id}" placeholder="${placeholder}">
      <button type="button" class="password-toggle-btn" data-target="${id}" aria-label="Show password" tabindex="-1">${eyeIconSvg(false)}</button>
    </div>
  </div>`;
}
// Called once right after the field's HTML is inserted into the page.
function wirePasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  const btn = document.querySelector(`.password-toggle-btn[data-target="${inputId}"]`);
  if (!input || !btn) return;
  btn.addEventListener('click', () => {
    const nowVisible = input.type === 'password';
    input.type = nowVisible ? 'text' : 'password';
    btn.innerHTML = eyeIconSvg(nowVisible);
    btn.setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
  });
}

function tradeBadgeHtml() {
  return `<span class="trade-badge" title="Seller is open to trades"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>Open to trade</span>`;
}
const HEART_PATH = 'M12 21s-7.5-4.6-10.2-9.3C.3 8.8 1.7 5 5.4 4.2c2.2-.5 4.3.5 5.6 2.4C12.3 4.7 14.4 3.7 16.6 4.2c3.7.8 5.1 4.6 3.6 7.5C19.5 16.4 12 21 12 21z';
function heartIconSvg(filled, size) {
  size = size || 18;
  return filled
    ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="${HEART_PATH}"></path></svg>`
    : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${HEART_PATH}"></path></svg>`;
}
// Sits on top of the card thumbnail (browse grid and Saved view) — always
// rendered, even signed out, matching the same "let them start, ask them to
// sign in only when it matters" pattern used for the seller message box.
function saveToggleBtnHtml(l) {
  const saved = !!l.savedByMe;
  return `<button type="button" class="save-toggle-btn ${saved ? 'saved' : ''}" data-id="${l.id}" data-saved="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save this listing'}">${heartIconSvg(saved)}</button>`;
}
async function toggleSaveListing(id, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const nowSaved = btn.dataset.saved !== 'true';
  btn.disabled = true;
  try {
    await api('/listings/' + id + '/save', { method: nowSaved ? 'POST' : 'DELETE' });
    // Unsaving from the Saved view itself: the card no longer belongs there,
    // so drop it instead of leaving a stale "saved" card showing unsaved.
    if (!nowSaved && btn.closest('#saved-grid')) {
      btn.closest('.card').remove();
      if (document.querySelectorAll('#saved-grid .card').length === 0) {
        document.getElementById('saved-grid').innerHTML = `<div class="empty" style="grid-column:1/-1;"><h3>No saved listings yet</h3><p>Tap the heart on any listing to save it here for later.</p></div>`;
      }
      return;
    }
    btn.dataset.saved = String(nowSaved);
    btn.classList.toggle('saved', nowSaved);
    btn.innerHTML = heartIconSvg(nowSaved);
    btn.setAttribute('aria-label', nowSaved ? 'Remove from saved' : 'Save this listing');
  } catch (e) {
    showToast('Could not update saved listings.');
  } finally {
    btn.disabled = false;
  }
}

const CLOCK_ICON_PATH = 'M12 8v4l3 3 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z';
// Minimal, always-shown "how long ago was this posted" — deliberately
// distinct from the bird's own age field, which is a completely different
// piece of information and was easy to visually confuse with this one.
function relativePostTime(createdAt) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd';
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks + 'w';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo';
  return Math.floor(days / 365) + 'y';
}
function postTimeBadgeHtml(createdAt) {
  return `<div class="post-time-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOCK_ICON_PATH}"></path></svg>${relativePostTime(createdAt)}</div>`;
}
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

// Formats a US phone number as XXX-XXX-XXXX for display. Falls back to
// showing the raw value untouched for anything that isn't a recognizable
// 10 or 11-digit US number (international numbers, partial entries, etc.)
// rather than mangling it.
function formatPhoneDisplay(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw || '';
}
function phoneDigitsForTel(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 10 ? '1' + digits : digits;
}
function escapeAttr(s) { return escapeHtml(s); }

let currentCategory = 'all';
let allListings = [];
let currentUser = null; // {name, email, role} — comes from the server, not local guesswork
let boostFreeTrial = false; // set from /api/config — while true, Boost is free instead of $4.99

function renderChips() {
  const wrap = document.getElementById('category-chips');
  const allChip = `
    <button class="chip all-chip ${currentCategory === 'all' ? 'active' : ''}" data-code="all">
      All categories
    </button>`;
  wrap.innerHTML = allChip + VISIBLE_CATEGORIES.map(c => `
    <button class="chip ${currentCategory === c.code ? 'active' : ''}" data-code="${c.code}">
      <span class="dot" style="background:${c.color}"></span>${c.label}
    </button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      // Clicking the active category (including "All" itself) is a no-op toggle back to "All" —
      // same behavior as before, "All" is just now a visible, explicit choice instead of a hidden one.
      currentCategory = (currentCategory === btn.dataset.code) ? 'all' : btn.dataset.code;
      renderChips();
      updateFilterBadge();
      applyFilters();
    });
  });
}

function populateCategorySelect() {
  const sel = document.getElementById('f-category');
  sel.innerHTML = VISIBLE_CATEGORIES.map(c => `<option value="${c.code}">${c.label}</option>`).join('');
  sel.addEventListener('change', updatePostFormForCategory);
}

// Reshapes the post form around whichever category is selected — the same
// show/hide approach already used for the raptor permit field, extended so
// Supplies & equipment gets its own relevant fields instead of the
// live-animal-only ones (breed/age/sex/DNA/hand-tame, the captive-bred
// attestation, the prohibited-species notice). One form, one "Post a bird"
// entry point — this is what keeps that simple, instead of forking into a
// second flow.
function updatePostFormForCategory() {
  const category = document.getElementById('f-category').value;
  const isRaptor = category === 'RAP';
  const isSupplies = category === 'SUP';

  document.getElementById('permit-field-group').style.display = isRaptor ? 'block' : 'none';
  if (!isRaptor) document.getElementById('f-permit').value = '';

  document.getElementById('breed-field-group').style.display = isSupplies ? 'none' : 'block';
  document.getElementById('category-breed-row').classList.toggle('single', isSupplies);
  document.getElementById('age-sex-field-group').style.display = isSupplies ? 'none' : 'grid';
  document.getElementById('dna-tame-field-group').style.display = isSupplies ? 'none' : 'grid';
  document.getElementById('species-policy-field-group').style.display = isSupplies ? 'none' : 'block';
  document.getElementById('attest-field-group').style.display = isSupplies ? 'none' : 'block';

  document.getElementById('condition-field-group').style.display = isSupplies ? 'block' : 'none';
  if (!isSupplies) document.getElementById('f-condition').value = '';

  document.getElementById('post-view-title').textContent = isSupplies ? 'Post supplies or equipment' : 'Post a bird';
  document.getElementById('post-view-subtitle').textContent = isSupplies
    ? 'Cages, incubators, brooders, nest boxes, feed, and other bird-keeping supplies & equipment, etc. Your listing is visible to everyone who visits Roost. Contact details are optional and only shown to signed-in users.'
    : 'Your listing is visible to everyone who visits Roost. Contact details are optional and only shown to signed-in users.';

  document.getElementById('f-title').placeholder = isSupplies
    ? 'Large flight cage, barely used'
    : 'Hand-raised cockatiel pair, 1 year old';
  document.getElementById('f-desc').placeholder = isSupplies
    ? "Tell buyers about size/dimensions, brand, any wear or damage, what's included, and why you're selling."
    : "Tell buyers about temperament, diet, cage setup, health history, why you're rehoming, etc.";
  document.getElementById('f-price-type-each-label').textContent = isSupplies ? 'Per item' : 'Per bird';
  document.getElementById('f-free-label').textContent = isSupplies ? 'This item is free to whoever wants it' : 'This bird is free to a good home';
}

// ===================== BROWSE / FILTER =====================
let activeLocation = null;

function formatDistance(miles) {
  if (miles < 0.1) return 'less than 0.1 mi away';
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

// Same formula as the backend's utils/geocode.js — great-circle distance in miles.
function distanceMilesClient(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Playful, rotating captions for the browse grid's loading state — cycles
// every couple seconds so a slower load doesn't just sit on static text.
const BROWSE_LOADING_CAPTIONS = [
  'Fetching the flock…', 'Herding listings into the nest…', 'Counting feathers…',
  'Warming up the roost…', 'Rounding up birds and their people…'
];
let browseLoadingInterval = null;
function showBrowseLoadingState() {
  clearInterval(browseLoadingInterval);
  document.getElementById('listings-grid').innerHTML = `
    <div class="loading-state">
      <div class="loading-bird" aria-hidden="true">🐦</div>
      <div class="loading-text" id="browse-loading-text">${BROWSE_LOADING_CAPTIONS[0]}</div>
    </div>`;
  let i = 0;
  browseLoadingInterval = setInterval(() => {
    const el = document.getElementById('browse-loading-text');
    if (!el) { clearInterval(browseLoadingInterval); return; } // real content already replaced it
    i = (i + 1) % BROWSE_LOADING_CAPTIONS.length;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = BROWSE_LOADING_CAPTIONS[i]; el.style.opacity = '1'; }, 250);
  }, 1700);
}

async function loadListings() {
  const grid = document.getElementById('listings-grid');
  showBrowseLoadingState();
  try {
    const data = await api('/listings');
    allListings = data.listings || [];
  } catch (e) {
    allListings = [];
    clearInterval(browseLoadingInterval);
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Couldn't load listings right now. <button class="secondary" onclick="loadListings()">Retry</button></div>`;
    return;
  }
  applyFilters();
  if (savedBrowseScrollY != null) {
    // Restored only after the grid has real content again — restoring
    // scroll before that would just scroll to nothing, since the "Loading
    // listings…" placeholder is far shorter than the real page.
    window.scrollTo(0, savedBrowseScrollY);
    savedBrowseScrollY = null;
  }
}

function applyFilters() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  const sortFilter = document.getElementById('sort-filter').value;
  const priceMin = document.getElementById('price-min').value;
  const priceMax = document.getElementById('price-max').value;
  const tradeOnly = document.getElementById('trade-filter').checked;
  const locationHasCoords = activeLocation && activeLocation.lat != null && activeLocation.lon != null;

  let results = allListings.filter(l => {
    if (currentCategory !== 'all' && l.category !== currentCategory) return false;
    if (q) {
      const hay = `${l.title} ${l.breed} ${l.city} ${l.state}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (priceMin !== '' && !l.free && l.price < Number(priceMin)) return false;
    if (priceMin !== '' && l.free && Number(priceMin) > 0) return false;
    if (priceMax !== '' && !l.free && l.price > Number(priceMax)) return false;
    // Boosted listings skip the location filter entirely, for now — the app
    // is small enough that a boosted listing getting hidden just because a
    // buyer happened to search a specific area would make the boost feel
    // broken ("I paid and it's not even showing"). Revisit once there's
    // enough volume that a nationwide boosted listing showing up in every
    // local search starts to feel spammy instead of just generous reach.
    if (activeLocation && !l.isBoosted) {
      if (locationHasCoords && l.lat != null && l.lon != null) {
        // Real distance — both the search location and this listing geocoded successfully.
        l._distanceMiles = distanceMilesClient(activeLocation.lat, activeLocation.lon, Number(l.lat), Number(l.lon));
        if (l._distanceMiles > Number(activeLocation.radius)) return false;
      } else {
        // Fallback — one side (or both) couldn't be geocoded, so match by city/state text instead.
        // Commas are stripped from both sides before comparing — "Lodi, CA" (what a Places
        // selection produces) and "Lodi CA" (how listing text is built below) need to be
        // treated as equivalent, not broken by a punctuation mismatch that has nothing to
        // do with whether it's actually the same place.
        l._distanceMiles = null;
        const hay = `${l.city} ${l.state}`.toLowerCase().replace(/,/g, '');
        const needle = activeLocation.text.toLowerCase().replace(/,/g, '');
        if (!hay.includes(needle)) return false;
      }
    } else {
      l._distanceMiles = null;
    }
    if (tradeOnly && !l.openToTrade) return false;
    return true;
  });

  updateFilterBadge();

  results.sort((a, b) => {
    // Boosted listings win regardless of sort order — that guaranteed top
    // placement is the entire point of paying for it. Not shown as a public
    // "sponsored" label, just felt as "this one's always near the top."
    if (!!a.isBoosted !== !!b.isBoosted) return a.isBoosted ? -1 : 1;
    if (sortFilter === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortFilter === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortFilter === 'price-low') return (a.free ? 0 : a.price) - (b.free ? 0 : b.price);
    if (sortFilter === 'price-high') return (b.free ? 0 : b.price) - (a.free ? 0 : a.price);
    return 0;
  });

  renderGrid(results);
}

// Shared by the browse grid and the Saved view, so a card looks and behaves
// identically in both places instead of drifting apart over time.
function listingCardHtml(l) {
  const c = catInfo(l.category);
  const isSupplies = l.category === 'SUP';
  const metaLead = isSupplies ? conditionLabel(l.condition) : `${escapeHtml(l.breed)} · ${escapeHtml(l.age || 'age n/a')}`;
  return `
    <a class="card" href="/listing/${l.id}" data-id="${l.id}">
      ${l.free ? '<div class="free-ribbon">FREE</div>' : ''}
      <div class="thumb">
        ${l.status === 'pending' ? '<div class="pending-ribbon">PENDING</div>' : ''}
        ${postTimeBadgeHtml(l.createdAt)}
        ${saveToggleBtnHtml(l)}
        <div class="thumb-img-wrap">${l.photoUrl ? `<img loading="lazy" decoding="async" src="${escapeAttr(l.photoUrl)}" alt="" onerror="this.parentElement.innerHTML='${c.icon}'">` : c.icon}</div>
      </div>
      <div class="card-body">
        <div class="card-title-row"><h3>${escapeHtml(l.title)}</h3>${l.sellerVerified ? verifiedBadgeHtml('inline') : ''}</div>
        <div class="card-meta">${metaLead} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)}${(l._distanceMiles != null) ? ` · <span class="distance-tag">${formatDistance(l._distanceMiles)}</span>` : ''}</div>
        <div class="card-price">${formatPriceDisplay(l)}${l.openToTrade ? tradeBadgeHtml() : ''}</div>
      </div>
    </a>`;
}
function wireCardClicks(container) {
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openDetail(card.dataset.id);
    });
  });
}
function wireSaveToggleButtons(container) {
  container.querySelectorAll('.save-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); // sits inside the card <a> — don't also navigate
      toggleSaveListing(btn.dataset.id, btn);
    });
  });
}

function renderGrid(results) {
  clearInterval(browseLoadingInterval);
  const grid = document.getElementById('listings-grid');
  document.getElementById('count-line').textContent = `${results.length} listing${results.length === 1 ? '' : 's'}`;
  if (results.length === 0) {
    const isSupplies = currentCategory === 'SUP';
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <h3>${isSupplies ? 'No supplies match yet' : 'No birds match yet'}</h3>
      <p>Try a different category or search term — or be the first to post.</p>
      <button class="primary" onclick="openPostForm(${isSupplies ? "'SUP'" : ''})">${isSupplies ? 'Post supplies' : 'Post a bird'}</button>
    </div>`;
    return;
  }
  grid.innerHTML = results.map(listingCardHtml).join('');
  wireCardClicks(grid);
  wireSaveToggleButtons(grid);
}

function updateFilterBadge() {
  const priceMin = document.getElementById('price-min').value;
  const priceMax = document.getElementById('price-max').value;
  let count = 0;
  if (priceMin !== '') count++;
  if (priceMax !== '') count++;
  if (currentCategory !== 'all') count++;
  if (document.getElementById('trade-filter').checked) count++;
  const badge = document.getElementById('filter-badge');
  if (count > 0) { badge.style.display = 'flex'; badge.textContent = count; }
  else { badge.style.display = 'none'; }
}

// ===================== DETAIL MODAL =====================
function traitRowHtml(iconEmoji, label, tristateValue) {
  const displayText = tristateValue === 'yes' ? 'Yes' : tristateValue === 'no' ? 'No' : 'Not specified';
  return `<div class="trait-row"><span class="trait-label">${iconEmoji} ${label}:</span> <span class="trait-value">${displayText}</span></div>`;
}
function plainTraitRowHtml(iconEmoji, label, value) {
  return `<div class="trait-row"><span class="trait-label">${iconEmoji} ${label}:</span> <span class="trait-value">${escapeHtml(value) || '?'}</span></div>`;
}
function buildDetailsBlockHtml(l) {
  if (l.category === 'SUP') {
    return `
      <div class="lp-details">
        <div class="lp-details-title">Details</div>
        ${plainTraitRowHtml('🏷️', 'Condition', conditionLabel(l.condition))}
        ${traitRowHtml('🚚', 'Shipping available', l.shippingAvailable ? 'yes' : 'no')}
      </div>`;
  }
  return `
    <div class="lp-details">
      <div class="lp-details-title">Details</div>
      ${plainTraitRowHtml('🐦', 'Gender', l.sex)}
      ${plainTraitRowHtml('🎂', 'Age', l.age)}
      ${traitRowHtml('🧬', 'DNA sexed', l.dnaSexed)}
      ${traitRowHtml('🤝', 'Hand-tame', l.handTame)}
      ${traitRowHtml('🚚', 'Shipping available', l.shippingAvailable ? 'yes' : 'no')}
    </div>`;
}

function buildListingPageHtml(l) {
  const c = catInfo(l.category);
  const photos = (Array.isArray(l.photos) && l.photos.length > 0)
    ? l.photos
    : ((l.photoFull || l.photoUrl) ? [{ thumb: l.photoUrl, full: l.photoFull || l.photoUrl }] : []);
  const permitLine = (l.category === 'RAP' && l.permitNumber)
    ? `<div class="meta-line">Permit on file: ${escapeHtml(l.permitNumber)}</div>` : '';

  const isOwnListing = currentUser && l.postedByMe;
  // Always visible (not a popup gated behind a button) — signed-out visitors can type
  // a message immediately too; signing in is only asked for at send time, in wireSellerCompose.
  const sellerComposeHtml = isOwnListing ? '' : `
    <div class="seller-compose" id="seller-compose">
      <div class="seller-compose-label">Message seller</div>
      <div class="seller-compose-row">
        <input type="text" id="inline-compose-text" maxlength="2000" placeholder="${l.category === 'SUP' ? 'Ask about this item…' : 'Introduce yourself and ask about this bird…'}">
        <button class="primary" id="inline-compose-send">Send</button>
      </div>
      <div id="inline-compose-scam-warning" class="warn-banner">A quick safety check: messages that mention wiring money, gift cards, or shipping without meeting in person are common scam patterns. If that's not what you meant, feel free to ignore this.</div>
      <div id="inline-compose-error" class="auth-error"></div>
    </div>`;

  const sellerLineHtml = l.seller ? `
    <div class="rating-line">
      <button class="seller-link" id="seller-profile-link" data-seller-id="${l.seller.id}">${escapeHtml(l.seller.name)}${l.seller.verified ? verifiedBadgeHtml('inline') : ''}</button>
      ${l.seller.reviewCount > 0
        ? `${starsDisplayHtml(l.seller.avgRating, 13)}<span class="rating-text">${l.seller.avgRating.toFixed(1)} (${l.seller.reviewCount})</span>`
        : `<span class="rating-text">No reviews yet</span>`}
    </div>` : '';

  const isPhoneContact = l.contactMethod === 'Phone';
  const contactDisplayValue = isPhoneContact ? formatPhoneDisplay(l.contactValue) : (l.contactValue || '');
  const callButtonHtml = isPhoneContact && l.contactValue
    ? `<a class="call-btn" href="tel:${escapeAttr(phoneDigitsForTel(l.contactValue))}">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
         Call
       </a>` : '';

  const contactBoxHtml = (l.contactLocked === undefined || l.hasContact === false) ? '' : (!l.contactLocked ? `
    <div class="contact-box">
      <div class="label">${l.contactMethod || 'Contact'}</div>
      <div class="value-row">
        <div class="value">${escapeHtml(contactDisplayValue) || 'Not provided'}</div>
        ${callButtonHtml}
      </div>
    </div>` : `
    <div class="contact-locked">
      <p>Sign in to see how to contact this seller.</p>
      <button class="primary" id="contact-signin-btn">Sign in</button>
    </div>`);

  const thumbStripHtml = photos.length > 1 ? `
    <div class="lp-thumbs">
      ${photos.map((p, i) => `<button class="lp-thumb-btn ${i === 0 ? 'active' : ''}" data-index="${i}" data-full="${escapeAttr(p.full)}"><img src="${escapeAttr(p.thumb)}" alt=""></button>`).join('')}
    </div>` : '';

  const saveBtnHtml = l.postedByMe ? '' : `
      <button class="share-btn save-listing-btn ${l.savedByMe ? 'saved' : ''}" id="save-listing-btn" data-id="${l.id}" data-saved="${!!l.savedByMe}">
        ${heartIconSvg(!!l.savedByMe, 14)}
        <span id="save-listing-btn-label">${l.savedByMe ? 'Saved' : 'Save'}</span>
      </button>`;

  return `
    <div class="lp-header-row">
      <div class="lp-band"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};"></span>${c.label}</div>
      <div style="display:flex;gap:8px;">
        ${saveBtnHtml}
        <button class="share-btn" id="share-listing-btn" title="Copy link to this listing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          Share
        </button>
      </div>
    </div>
    <h1>${escapeHtml(l.title)}</h1>
    <div class="lp-meta">${l.category === 'SUP' ? conditionLabel(l.condition) : `${escapeHtml(l.breed)} ${l.sex ? '· ' + escapeHtml(l.sex) : ''}`} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)}</div>
    ${permitLine}
    <div class="lp-photo" id="lp-main-photo">
      ${postTimeBadgeHtml(l.createdAt)}
      <div class="thumb-img-wrap">${photos.length > 0 ? `<img id="lp-main-img" src="${escapeAttr(photos[0].full)}" alt="" onerror="this.parentElement.innerHTML='${c.icon}'">` : c.icon}</div>
    </div>
    ${thumbStripHtml}
    <div class="lp-price">${l.status === 'sold' ? '<span class="sold-badge">SOLD</span> ' : l.status === 'pending' ? '<span class="pending-badge">PENDING</span> ' : ''}${formatPriceDisplay(l, 'Free to a good home')}${l.openToTrade ? tradeBadgeHtml() : ''}</div>
    ${sellerLineHtml}
    ${buildDetailsBlockHtml(l)}
    <div class="lp-desc">${escapeHtml(l.description)}</div>
    ${sellerComposeHtml}
    ${contactBoxHtml}
    ${l.postedByMe ? '' : `<button class="secondary alert-cta-btn" id="alert-cta-btn" style="width:100%;">${statIconSvg(BELL_ICON_PATH, 14)} Get alerts for listings like this</button>`}
    <div class="safety-note">Roost doesn't verify sellers or handle payments. Meet in person before any money changes hands, and never wire funds or pay with gift cards.</div>
    ${l.postedByMe ? `<div class="modal-actions"><button class="secondary" id="detail-edit-btn" style="width:100%;">Edit this listing</button></div>` : ''}
    ${isAdmin() ? `<div class="modal-actions"><button class="secondary" id="modal-admin-remove" style="color:var(--rust-dark);border-color:var(--rust);">Remove listing</button></div>` : ''}
    <button class="report-link" id="report-btn">Report this listing</button>
  `;
}

function wireListingPageHandlers(l, id) {
  document.getElementById('report-btn').addEventListener('click', () => reportListing(id));
  const contactSigninBtn = document.getElementById('contact-signin-btn');
  if (contactSigninBtn) contactSigninBtn.addEventListener('click', () => openAuthModal('login', () => renderListingPage(id)));
  const detailEditBtn = document.getElementById('detail-edit-btn');
  if (detailEditBtn) detailEditBtn.addEventListener('click', () => editListing(id));
  const adminRemoveBtn = document.getElementById('modal-admin-remove');
  if (adminRemoveBtn) adminRemoveBtn.addEventListener('click', () => removeListing(id));
  wireSellerCompose(id);
  const sellerProfileLink = document.getElementById('seller-profile-link');
  if (sellerProfileLink) sellerProfileLink.addEventListener('click', () => openSellerProfile(sellerProfileLink.dataset.sellerId));
  const shareBtn = document.getElementById('share-listing-btn');
  if (shareBtn) shareBtn.addEventListener('click', () => shareListing(id, l.title));
  const saveListingBtn = document.getElementById('save-listing-btn');
  if (saveListingBtn) {
    saveListingBtn.addEventListener('click', async () => {
      if (!currentUser) { openAuthModal('login', () => renderListingPage(id)); return; }
      const nowSaved = saveListingBtn.dataset.saved !== 'true';
      saveListingBtn.disabled = true;
      try {
        await api('/listings/' + id + '/save', { method: nowSaved ? 'POST' : 'DELETE' });
        saveListingBtn.dataset.saved = String(nowSaved);
        saveListingBtn.classList.toggle('saved', nowSaved);
        saveListingBtn.innerHTML = `${heartIconSvg(nowSaved, 14)}<span id="save-listing-btn-label">${nowSaved ? 'Saved' : 'Save'}</span>`;
      } catch (e) {
        showToast('Could not update saved listings.');
      } finally {
        saveListingBtn.disabled = false;
      }
    });
  }
  const alertCtaBtn = document.getElementById('alert-cta-btn');
  if (alertCtaBtn) {
    alertCtaBtn.addEventListener('click', async () => {
      if (!currentUser) { openAuthModal('login', () => renderListingPage(id)); return; }
      alertCtaBtn.disabled = true;
      const name = l.breed ? `${l.breed} alerts` : `${catInfo(l.category).label} alerts`;
      try {
        await api('/saved-searches', { method: 'POST', body: JSON.stringify({
          name, category: l.category, query: l.breed || null, emailAlerts: true
        }) });
        alertCtaBtn.innerHTML = `${statIconSvg(BELL_ICON_PATH, 14)} Alert created — we'll email you about similar listings`;
        refreshAlertsBadge();
      } catch (e) {
        showToast((e.data && e.data.error) || 'Could not create that alert.');
        alertCtaBtn.disabled = false;
      }
    });
  }
  document.querySelectorAll('.lp-thumb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mainImg = document.getElementById('lp-main-img');
      if (mainImg) mainImg.src = btn.dataset.full;
      document.querySelectorAll('.lp-thumb-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

async function shareListing(id, title) {
  const url = window.location.origin + '/listing/' + id;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${title} — Roost`, url });
    } catch (e) {
      // User closed the native share sheet — not an error, do nothing.
    }
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard.');
    } catch (e) {
      window.prompt('Copy this link:', url);
    }
    return;
  }
  window.prompt('Copy this link:', url);
}

// Renders the listing into the full-page view (does NOT change the URL —
// use openDetail() for that; this is the reusable rendering half).
async function renderListingPage(id) {
  const body = document.getElementById('listing-page-body');
  body.innerHTML = `<div style="padding:60px 0;text-align:center;color:var(--muted);">Loading…</div>`;
  let l;
  try {
    const data = await api('/listings/' + id);
    l = data.listing;
  } catch (e) {
    body.innerHTML = `<div class="empty">This listing is no longer available.</div>`;
    return;
  }
  document.title = `${l.title} — Roost`;
  body.innerHTML = buildListingPageHtml(l);
  wireListingPageHandlers(l, id);
}

// The main entry point used everywhere in the app to go to a listing.
// Gives it a real URL (shareable, bookmarkable, works with browser back/forward)
// instead of popping a modal over the current view.
let savedBrowseScrollY = null;
function openDetail(id) {
  savedBrowseScrollY = window.scrollY; // remembered so "back to browse" can restore it, instead of always landing back at the top
  const url = '/listing/' + id;
  if (window.location.pathname !== url) {
    window.history.pushState({ listingId: id }, '', url);
  }
  switchView('listing');
  renderListingPage(id);
}

window.addEventListener('popstate', () => {
  routeFromLocation();
});

function routeFromLocation() {
  const match = window.location.pathname.match(/^\/listing\/(\d+)/);
  if (match) {
    switchView('listing');
    renderListingPage(match[1]);
  } else {
    switchView('browse');
  }
}

async function reportListing(id) {
  try {
    await api('/listings/' + id + '/report', { method: 'POST' });
    showToast('Thanks — this listing has been flagged for review.');
  } catch (e) {
    showToast('Could not submit report right now.');
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ===================== VIEW SWITCHING =====================
// Two separate search fields now: #search-input lives in the sidebar (desktop, unchanged from
// before) and #search-input-mobile is its own field pinned to the top of the page on phones,
// where the sidebar is an off-canvas drawer someone has to open on purpose to find it. Only one
// of the two is ever visible at a given screen width, but both write into the SAME filtering
// logic below (which reads #search-input, and is also what "Save this search" captures), so
// typing in either one works identically and a saved search is correct regardless of which field
// someone actually used.
document.getElementById('search-input').addEventListener('input', applyFilters);
document.getElementById('search-input-mobile').addEventListener('input', () => {
  document.getElementById('search-input').value = document.getElementById('search-input-mobile').value;
  applyFilters();
});
document.getElementById('search-form-mobile').addEventListener('submit', (e) => {
  e.preventDefault();
  applyFilters();
  document.getElementById('search-input-mobile').blur(); // closes the on-screen keyboard once the search is applied
});
document.getElementById('sort-filter').addEventListener('change', applyFilters);

// On iPhone, the on-screen keyboard shrinks the VISUAL viewport but not the LAYOUT viewport that
// position:fixed elements size themselves against — so a fixed drawer doesn't shrink when the
// keyboard opens, and its own content (e.g. the category list) ends up hidden behind the keyboard
// and Safari's own toolbar instead of scrolling up cleanly above it. This keeps the drawer synced
// to the space actually visible, only while it's in its mobile (fixed-position) layout — the
// desktop sticky sidebar is untouched.
function syncFilterPanelToKeyboard() {
  if (!window.visualViewport) return;
  const panel = document.getElementById('filter-panel');
  if (!panel.classList.contains('show') || getComputedStyle(panel).position !== 'fixed') return;
  panel.style.height = window.visualViewport.height + 'px';
  panel.style.top = window.visualViewport.offsetTop + 'px';
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncFilterPanelToKeyboard);
  window.visualViewport.addEventListener('scroll', syncFilterPanelToKeyboard);
}

let scrollYBeforeDrawer = 0;
function setSidebarDrawerOpen(open) {
  document.getElementById('filter-panel').classList.toggle('show', open);
  document.getElementById('filter-toggle').classList.toggle('active', open);
  document.getElementById('sidebar-backdrop').classList.toggle('show', open);
  // position:fixed on <body> is the reliable cross-browser way to fully stop the page behind a
  // mobile drawer from scrolling (overscroll-behavor alone isn't consistent on older iOS Safari) —
  // it has to be paired with restoring the exact scroll position on close, or the page jumps to top.
  if (open) {
    scrollYBeforeDrawer = window.scrollY;
    document.body.style.top = `-${scrollYBeforeDrawer}px`;
    document.body.classList.add('drawer-open-lock');
  } else if (document.body.classList.contains('drawer-open-lock')) {
    document.body.classList.remove('drawer-open-lock');
    document.body.style.top = '';
    window.scrollTo(0, scrollYBeforeDrawer);
  }
  const panel = document.getElementById('filter-panel');
  if (open) { syncFilterPanelToKeyboard(); } else { panel.style.height = ''; panel.style.top = ''; }
}

document.getElementById('filter-toggle').addEventListener('click', () => {
  setSidebarDrawerOpen(!document.getElementById('filter-panel').classList.contains('show'));
});
document.getElementById('sidebar-close-mobile').addEventListener('click', () => setSidebarDrawerOpen(false));
document.getElementById('sidebar-backdrop').addEventListener('click', () => setSidebarDrawerOpen(false));
document.getElementById('sidebar-create-btn').addEventListener('click', () => {
  setSidebarDrawerOpen(false);
  openPostForm();
});
document.getElementById('sidebar-create-supplies-btn').addEventListener('click', () => {
  setSidebarDrawerOpen(false);
  openPostForm('SUP');
});
document.addEventListener('click', (e) => {
  const panel = document.getElementById('filter-panel');
  const toggle = document.getElementById('filter-toggle');
  if (panel.classList.contains('show') && !panel.contains(e.target) && !toggle.contains(e.target)) {
    setSidebarDrawerOpen(false);
  }
});
document.getElementById('apply-filters').addEventListener('click', () => {
  applyFilters();
  setSidebarDrawerOpen(false);
});
document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('price-min').value = '';
  document.getElementById('price-max').value = '';
  document.getElementById('sort-filter').value = 'newest';
  document.getElementById('trade-filter').checked = false;
  currentCategory = 'all';
  renderChips();
  applyFilters();
});

document.getElementById('location-indicator').addEventListener('click', () => {
  document.getElementById('loc-search').value = activeLocation ? activeLocation.text : '';
  document.getElementById('loc-radius').value = activeLocation ? activeLocation.radius : '5';
  updateRadiusLabel();
  updateRadiusLabel();
  document.getElementById('location-overlay').classList.add('show');
});
document.getElementById('location-close').addEventListener('click', () => document.getElementById('location-overlay').classList.remove('show'));
document.getElementById('location-overlay').addEventListener('click', (e) => { if (e.target.id === 'location-overlay') document.getElementById('location-overlay').classList.remove('show'); });
document.getElementById('loc-radius').addEventListener('input', updateRadiusLabel);
function updateRadiusLabel() {
  const miles = Number(document.getElementById('loc-radius').value);
  document.getElementById('loc-radius-value').textContent = miles + ' mi';
  document.getElementById('radius-label').textContent = miles + ' mi radius';

  // Scale the circle to actually reflect the selected radius, instead of
  // staying a fixed decorative size regardless of what's selected. Uses a
  // sqrt curve (not straight linear) so small distances — where most real
  // usage concentrates — stay visually distinguishable from each other,
  // rather than everything under ~20mi looking like the same tiny dot.
  const MIN_MI = 1, MAX_MI = 100, MIN_PX = 20, MAX_PX = 82;
  const t = Math.sqrt((miles - MIN_MI) / (MAX_MI - MIN_MI));
  const px = MIN_PX + t * (MAX_PX - MIN_PX);
  document.getElementById('radius-circle-fill').setAttribute('r', px);
  document.getElementById('radius-circle-outline').setAttribute('r', px);
}
function setLocationIndicator() {
  const el = document.getElementById('location-indicator');
  const text = document.getElementById('location-indicator-text');
  if (activeLocation) { text.textContent = `${activeLocation.text} · ${activeLocation.radius} mi`; el.classList.remove('unset'); }
  else { text.textContent = 'Choose a location'; el.classList.add('unset'); }
}
document.getElementById('apply-location').addEventListener('click', async () => {
  // Google's autocomplete fills this field as "City, State, USA" — strip
  // the trailing country so downstream geocoding and text-matching both
  // keep working exactly as they did with plain "City, State" input.
  const text = document.getElementById('loc-search').value.trim().replace(/,\s*(USA|United States)$/i, '').trim();
  const radius = document.getElementById('loc-radius').value;
  const applyBtn = document.getElementById('apply-location');

  if (!text) {
    activeLocation = null;
    setLocationIndicator();
    document.getElementById('location-overlay').classList.remove('show');
    applyFilters();
    return;
  }

  applyBtn.disabled = true;
  applyBtn.textContent = 'Finding location…';
  let coords = getVerifiedCoords(selectedLocCoords, selectedLocCoordsText, 'loc-search'); // real, precise coords from the Places selection — skip Census entirely when we have these
  if (!coords) {
    try {
      coords = await api('/geocode?q=' + encodeURIComponent(text));
    } catch (e) {
      // No match found, or the geocoder had trouble — fall back to matching
      // by city/state text below rather than failing the filter entirely.
      coords = null;
    }
  }
  applyBtn.disabled = false;
  applyBtn.textContent = 'Use this location';

  activeLocation = { text, radius, lat: coords ? coords.lat : null, lon: coords ? coords.lon : null };
  setLocationIndicator();
  document.getElementById('location-overlay').classList.remove('show');
  applyFilters();
});
document.getElementById('clear-location').addEventListener('click', () => {
  activeLocation = null;
  setLocationIndicator();
  document.getElementById('location-overlay').classList.remove('show');
  applyFilters();
});

document.getElementById('tab-browse').addEventListener('click', () => { savedBrowseScrollY = null; switchView('browse'); });
document.getElementById('tab-post').addEventListener('click', () => openPostForm());

// Shared entry point for every "post a bird" / "post supplies" trigger on the
// site, so there's exactly one place that handles auth-gating and form setup.
// presetCategory (optional) selects a starting category once the form opens —
// e.g. the "Have supplies to sell?" button passes 'SUP' — and survives a
// sign-in detour via the auth modal's callback.
function openPostForm(presetCategory) {
  if (!currentUser) { openAuthModal('signup', () => openPostForm(presetCategory)); return; }
  if (editingListingId) resetPostForm(); // don't let a stale edit silently overwrite the wrong listing
  prefillPosterFields();
  switchView('post');
  if (presetCategory) {
    document.getElementById('f-category').value = presetCategory;
    document.getElementById('f-category').dispatchEvent(new Event('change'));
  }
}

function prefillPosterFields() {
  if (!currentUser) return;
  const nameField = document.getElementById('f-poster-name');
  if (nameField && !nameField.value) nameField.value = currentUser.name;
}
document.getElementById('tab-messages').addEventListener('click', () => switchView('messages'));
function switchView(view) {
  document.getElementById('view-browse').style.display = view === 'browse' ? 'block' : 'none';
  document.getElementById('view-post').style.display = view === 'post' ? 'block' : 'none';
  document.getElementById('view-messages').style.display = view === 'messages' ? 'block' : 'none';
  document.getElementById('view-listing').style.display = view === 'listing' ? 'block' : 'none';
  document.getElementById('view-mylistings').style.display = view === 'mylistings' ? 'block' : 'none';
  document.getElementById('view-saved').style.display = view === 'saved' ? 'block' : 'none';
  document.getElementById('tab-browse').classList.toggle('active', view === 'browse');
  document.getElementById('tab-post').classList.toggle('active', view === 'post');
  document.getElementById('tab-messages').classList.toggle('active', view === 'messages');
  document.getElementById('tab-mylistings').classList.toggle('active', view === 'mylistings');
  document.getElementById('tab-saved').classList.toggle('active', view === 'saved');
  if (view !== 'listing' && window.location.pathname.startsWith('/listing/')) {
    window.history.pushState({}, '', '/');
  }
  if (view === 'browse') loadListings();
  if (view === 'mylistings') loadMyListings();
  if (view === 'saved') { loadSavedListings(); document.getElementById('alerts-btn').style.display = 'flex'; refreshAlertsBadge(); }
  if (view === 'messages') {
    document.getElementById('messages-shell').classList.remove('showing-thread');
    resetThreadPanelEmpty();
    loadConversations();
  }
}

document.getElementById('tab-mylistings').addEventListener('click', () => switchView('mylistings'));
document.getElementById('tab-saved').addEventListener('click', () => switchView('saved'));

async function loadSavedListings() {
  const grid = document.getElementById('saved-grid');
  grid.innerHTML = `<div class="loading-state" style="grid-column:1/-1;"><div class="loading-bird" aria-hidden="true">🐦</div><div class="loading-text">Fetching your saved listings…</div></div>`;
  try {
    const data = await api('/listings/saved');
    const listings = data.listings || [];
    if (listings.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><h3>No saved listings yet</h3><p>Tap the heart on any listing to save it here for later.</p></div>`;
      return;
    }
    grid.innerHTML = listings.map(listingCardHtml).join('');
    wireCardClicks(grid);
    wireSaveToggleButtons(grid);
  } catch (e) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Could not load your saved listings. <button class="secondary" onclick="loadSavedListings()">Retry</button></div>`;
  }
}

document.getElementById('listing-back').addEventListener('click', () => {
  window.history.pushState({}, '', '/');
  switchView('browse');
});

document.getElementById('brand-home-link').addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  savedBrowseScrollY = null; // clicking the logo is a fresh start, not "go back" — shouldn't restore an old scroll position
  window.history.pushState({}, '', '/');
  switchView('browse');
});

document.getElementById('f-desc').addEventListener('input', (e) => {
  document.getElementById('scam-warning').classList.toggle('show', containsScamLanguage(e.target.value));
});
document.getElementById('f-free').addEventListener('change', (e) => {
  document.getElementById('f-price').disabled = e.target.checked;
  if (e.target.checked) document.getElementById('f-price').value = '';
});

document.getElementById('f-contact-method').addEventListener('change', (e) => {
  const valueField = document.getElementById('f-contact-value');
  if (e.target.value === 'Phone') {
    valueField.placeholder = '(555) 555-0100';
    valueField.type = 'tel';
    valueField.value = '';
  } else {
    valueField.placeholder = 'you@email.com';
    valueField.type = 'text';
    valueField.value = '';
  }
});

document.getElementById('f-contact-value').addEventListener('blur', (e) => {
  if (document.getElementById('f-contact-method').value === 'Phone' && e.target.value.trim()) {
    e.target.value = formatPhoneDisplay(e.target.value.trim());
  }
});

// ===================== PHOTO UPLOAD =====================
let pendingPhotos = []; // [{thumb, full}, ...] — first item is the cover photo
let editingListingId = null; // set when the post form is being used to edit an existing listing, not create a new one

// Phone cameras often store rotation as metadata rather than physically
// rotating pixel data. A plain <img> respects that automatically, but
// canvas drawImage() does NOT — without this fix, a portrait photo from an
// iPhone could come out sideways after compression. createImageBitmap with
// imageOrientation:'from-image' bakes the correct rotation into the pixel
// data itself, which then draws correctly regardless of source orientation.
async function readImageFile(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // Some older browsers accept the call but reject the option — fall
      // through to the plain <img> approach below.
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
function resizeImageToDataUrl(img, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return { canvas, dataUrl: canvas.toDataURL('image/jpeg', quality) };
}
// iPhone photos are usually HEIC, which Chrome (and most non-Apple browsers) can't decode. The
// converter is ~1.3MB, so it's only downloaded the first time someone actually picks a HEIC file.
// Pinned to an exact version with an integrity hash so a compromised CDN can't swap the code.
function isHeicFile(file) {
  const t = (file.type || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || /\.(heic|heif)$/i.test(file.name || '');
}
let heicConverterPromise = null;
function loadHeicConverter() {
  if (window.heic2any) return Promise.resolve();
  if (!heicConverterPromise) {
    heicConverterPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js';
      el.integrity = 'sha512-VjmsArkf8Vv2yyvbXCyVxp+R3n4N2WyS1GEQ+YQxa7Hu0tx836WpY4nW9/T1W5JBmvuIsxkVH/DlHgp7NEMjDw==';
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve();
      el.onerror = () => { heicConverterPromise = null; reject(new Error('Could not load the HEIC converter')); };
      document.head.appendChild(el);
    });
  }
  return heicConverterPromise;
}
async function convertHeicToJpeg(file) {
  await loadHeicConverter();
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  return Array.isArray(out) ? out[0] : out; // a multi-frame HEIC (e.g. a Live Photo) comes back as an array
}

const MAX_PHOTOS = 5;

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  const slots = pendingPhotos.map((p, i) => `
    <div class="photo-slot" data-index="${i}">
      <img src="${p.full}" alt="">
      ${i === 0 ? '<span class="cover-tag">Cover</span>' : ''}
      <button type="button" class="remove-photo-btn" data-index="${i}" aria-label="Remove photo">✕</button>
    </div>
  `).join('');
  const addSlot = pendingPhotos.length < MAX_PHOTOS ? `
    <label class="photo-add-slot" for="f-photo-file">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      <span>${pendingPhotos.length === 0 ? 'Add photos' : 'Add more'}</span>
    </label>` : '';
  grid.innerHTML = slots + addSlot;
  grid.querySelectorAll('.remove-photo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      pendingPhotos.splice(Number(btn.dataset.index), 1);
      renderPhotoGrid();
    });
  });
}

function clearPendingPhoto() {
  pendingPhotos = [];
  document.getElementById('f-photo-file').value = '';
  renderPhotoGrid();
}

document.getElementById('f-photo-file').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';
  if (files.length === 0) return;

  const remainingSlots = MAX_PHOTOS - pendingPhotos.length;
  const toProcess = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    errEl.textContent = `Only ${MAX_PHOTOS} photos are allowed — added the first ${remainingSlots === 0 ? 0 : remainingSlots}.`;
  }

  for (const file of toProcess) {
    if (!file.type.startsWith('image/') && !isHeicFile(file)) { errEl.textContent = 'Please choose image files only.'; continue; }
    try {
      let img;
      try {
        img = await readImageFile(file);
      } catch (nativeErr) {
        if (!isHeicFile(file)) throw nativeErr;
        errEl.textContent = 'Converting your iPhone photo…';
        img = await readImageFile(await convertHeicToJpeg(file));
        errEl.textContent = '';
      }
      // The full-size image is generated first, directly from the original —
      // the thumbnail is then generated FROM that already-downscaled result,
      // not independently from the original again. A very large modern phone
      // photo (12+ megapixels) being decoded and drawn twice back-to-back is
      // a real, plausible source of the kind of intermittent, image-specific
      // corruption reported here (one photo's thumbnail rendering solid
      // black while everything else about it displayed correctly) —
      // chaining from the smaller, already-processed canvas instead avoids
      // asking the browser to handle the huge original more than once.
      const fullResult = resizeImageToDataUrl(img, 900, 0.75);
      const thumbResult = resizeImageToDataUrl(fullResult.canvas, 480, 0.72);
      pendingPhotos.push({
        thumb: thumbResult.dataUrl,
        full: fullResult.dataUrl
      });
    } catch (err) {
      errEl.textContent = 'Could not process one of those images — try a different photo.';
      showToast('Could not process one of those images — try a different photo.');
    }
  }
  document.getElementById('f-photo-file').value = '';
  renderPhotoGrid();
});

// ===================== POST FORM FIELD-LEVEL VALIDATION =====================
function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const wrapper = input.closest('.field');
  if (!wrapper) return;
  wrapper.classList.add('field-invalid');
  let msgEl = wrapper.querySelector('.field-error-msg');
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.className = 'field-error-msg';
    wrapper.appendChild(msgEl);
  }
  msgEl.textContent = message;
}
function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const wrapper = input.closest('.field');
  if (!wrapper) return;
  wrapper.classList.remove('field-invalid');
  const msgEl = wrapper.querySelector('.field-error-msg');
  if (msgEl) msgEl.remove();
}
function clearAllPostFormErrors() {
  document.querySelectorAll('#post-form-wrap .field-invalid').forEach(el => el.classList.remove('field-invalid'));
  document.querySelectorAll('#post-form-wrap .field-error-msg').forEach(el => el.remove());
}
['f-title', 'f-category', 'f-price', 'f-free', 'f-city', 'f-state', 'f-desc',
 'f-contact-method', 'f-contact-value', 'f-permit', 'f-condition', 'f-attest', 'f-agree-terms'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => clearFieldError(id));
  if (el) el.addEventListener('change', () => clearFieldError(id));
});

// ===================== POST A LISTING =====================
// The Cancel button only makes sense while editing an existing listing.
function syncEditButtons() {
  document.getElementById('cancel-edit').style.display = editingListingId ? 'inline-block' : 'none';
}
document.getElementById('cancel-edit').addEventListener('click', () => {
  resetPostForm(); // clears editingListingId and the form, so nothing half-edited lingers
  switchView('mylistings');
  loadMyListings();
});

document.getElementById('submit-listing').addEventListener('click', async () => {
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';
  clearAllPostFormErrors();

  if (!currentUser) {
    errEl.textContent = 'Please sign in first.';
    openAuthModal('signup', () => switchView('post'));
    return;
  }

  const isEditing = !!editingListingId;

  const body = {
    title: document.getElementById('f-title').value.trim(),
    category: document.getElementById('f-category').value,
    breed: document.getElementById('f-breed').value.trim(),
    age: document.getElementById('f-age').value.trim(),
    sex: document.getElementById('f-sex').value,
    dnaSexed: document.getElementById('f-dna-sexed').value,
    handTame: document.getElementById('f-hand-tame').value,
    free: document.getElementById('f-free').checked,
    openToTrade: document.getElementById('f-trade').checked,
    shippingAvailable: document.getElementById('f-shipping').checked,
    price: document.getElementById('f-price').value,
    priceType: document.querySelector('input[name="f-price-type"]:checked').value,
    city: document.getElementById('f-city').value.trim(),
    state: document.getElementById('f-state').value.trim().toUpperCase(),
    description: document.getElementById('f-desc').value.trim(),
    posterName: document.getElementById('f-poster-name').value.trim(),
    contactMethod: document.getElementById('f-contact-method').value,
    contactValue: document.getElementById('f-contact-value').value.trim(),
    attested: document.getElementById('f-attest').checked,
    agreedTerms: document.getElementById('f-agree-terms').checked,
    permitNumber: document.getElementById('f-permit').value.trim(),
    condition: document.getElementById('f-condition').value,
    lat: (() => { const c = getVerifiedCoords(selectedCityCoords, selectedCityCoordsText, 'f-city'); return c ? c.lat : null; })(),
    lon: (() => { const c = getVerifiedCoords(selectedCityCoords, selectedCityCoordsText, 'f-city'); return c ? c.lon : null; })(),
    photos: pendingPhotos
  };

  const problems = [];
  if (!body.title) problems.push({ fieldId: 'f-title', message: 'Please enter a listing title.' });
  if (!body.category) problems.push({ fieldId: 'f-category', message: 'Please choose a category.' });
  if (!body.free && (!body.price || Number(body.price) < 0)) {
    problems.push({ fieldId: 'f-price', message: 'Enter a price, or check "free to a good home" below.' });
  }
  if (!body.city) problems.push({ fieldId: 'f-city', message: 'Please enter a city.' });
  if (!body.state) problems.push({ fieldId: 'f-state', message: 'Please enter a state.' });
  if (!body.description) problems.push({ fieldId: 'f-desc', message: 'Please add a description.' });
  if (body.category === 'RAP' && !body.permitNumber) {
    problems.push({ fieldId: 'f-permit', message: 'A falconry/raptor permit number is required to list a bird of prey.' });
  }
  if (body.category === 'SUP' && !body.condition) {
    problems.push({ fieldId: 'f-condition', message: 'Please select the condition of the item.' });
  }
  if (!isEditing && body.category !== 'SUP' && !body.attested) {
    problems.push({ fieldId: 'f-attest', message: 'Please confirm the captive-bred and ownership attestation.' });
  }
  if (!isEditing && !body.agreedTerms) {
    problems.push({ fieldId: 'f-agree-terms', message: 'Please confirm you\'re 18+ and agree to the Terms and Privacy Policy.' });
  }

  if (problems.length > 0) {
    problems.forEach(p => setFieldError(p.fieldId, p.message));
    const fieldWord = problems.length === 1 ? 'field' : 'fields';
    errEl.textContent = `Please fix the highlighted ${fieldWord} below (${problems.length}).`;
    document.getElementById(problems[0].fieldId).closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(problems[0].fieldId).focus();
    return;
  }

  const submitBtn = document.getElementById('submit-listing');
  submitBtn.disabled = true;
  submitBtn.textContent = isEditing ? 'Saving…' : 'Publishing…';
  try {
    if (isEditing) {
      await api('/listings/' + editingListingId, { method: 'PUT', body: JSON.stringify(body) });
      const editedId = editingListingId;
      editingListingId = null;
      showToast('Listing updated.');
      switchView('mylistings');
      loadMyListings();
    } else {
      const wasLoggedOut = !currentUser;
      await api('/listings', { method: 'POST', body: JSON.stringify(body) });
      await refreshCurrentUser(); // posting without an account may have just created/signed one in
      trackConversion('listingPosted');
      if (wasLoggedOut && currentUser) trackConversion('accountCreated'); // signed up as part of posting
      document.getElementById('post-form-wrap').style.display = 'none';
      document.getElementById('post-success').style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = (e.data && e.data.error) || (isEditing ? 'Could not save your changes.' : 'Something went wrong publishing your listing.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingListingId ? 'Save changes' : 'Publish listing';
    syncEditButtons();
  }
});

function resetPostForm() {
  clearAllPostFormErrors();
  selectedCityCoords = null;
  selectedCityCoordsText = null;
  document.querySelectorAll('#post-form-wrap input[type=text], #post-form-wrap input[type=tel], #post-form-wrap input[type=number], #post-form-wrap textarea').forEach(el => el.value = '');
  document.getElementById('f-sex').value = '';
  document.getElementById('f-dna-sexed').value = 'unknown';
  document.getElementById('f-hand-tame').value = 'unknown';
  document.getElementById('f-free').checked = false;
  document.getElementById('f-trade').checked = false;
  document.getElementById('f-shipping').checked = false;
  document.getElementById('f-price').disabled = false;
  document.getElementById('f-price-type-each').checked = true;
  document.getElementById('f-attest').checked = false;
  document.getElementById('f-agree-terms').checked = false;
  document.getElementById('f-condition').value = '';
  updatePostFormForCategory();
  document.getElementById('f-contact-method').value = 'Email';
  document.getElementById('f-contact-value').type = 'text';
  document.getElementById('f-contact-value').placeholder = 'you@email.com';
  clearPendingPhoto();
  document.getElementById('scam-warning').classList.remove('show');
  document.getElementById('post-error').textContent = '';
  document.getElementById('post-form-wrap').style.display = 'block';
  document.getElementById('post-success').style.display = 'none';
  editingListingId = null;
  document.getElementById('submit-listing').textContent = 'Publish listing';
  syncEditButtons();
}
document.getElementById('post-another').addEventListener('click', resetPostForm);

// ===================== AUTH =====================
let authSuccessCallback = null;


function isAdmin() { return !!(currentUser && currentUser.role === 'admin'); }

function openAuthModal(mode, onSuccess) {
  authSuccessCallback = onSuccess || null;
  document.getElementById('auth-overlay').classList.add('show');
  renderAuthGate(mode);
}
document.getElementById('auth-close').addEventListener('click', () => document.getElementById('auth-overlay').classList.remove('show'));
document.getElementById('auth-overlay').addEventListener('click', (e) => { if (e.target.id === 'auth-overlay') document.getElementById('auth-overlay').classList.remove('show'); });

function renderAuthGate(mode) {
  const c = document.getElementById('auth-gate-content');

  if (mode === 'signup') {
    c.innerHTML = `
      <h2>Create your account</h2>
      <div class="auth-sub">Takes about 15 seconds — just a name, email, and password.</div>
      <div class="field"><label for="auth-name">Name</label><input type="text" id="auth-name" placeholder="Jordan"></div>
      <div class="field"><label for="auth-email">Email</label><input type="text" id="auth-email" placeholder="you@email.com"></div>
      ${passwordFieldHtml('auth-password', 'Password', 'At least 6 characters')}
      <div class="auth-error" id="auth-error"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Create account</button>
      <div class="auth-switch">Already have an account? <a href="#" id="auth-switch-link">Log in</a></div>
      <div class="auth-note">By continuing you confirm you're 18 or older and agree to Roost's Terms of Service and Privacy Policy.</div>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('login'); });
    document.getElementById('auth-submit').addEventListener('click', handleSignup);
    wirePasswordToggle('auth-password');
  } else if (mode === 'forgot') {
    c.innerHTML = `
      <h2>Reset your password</h2>
      <div class="auth-sub">Enter your email and we'll send a link to set a new password.</div>
      <div class="field"><label for="auth-email">Email</label><input type="text" id="auth-email" placeholder="you@email.com"></div>
      <div class="auth-error" id="auth-error"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Send reset link</button>
      <div class="auth-switch">Remembered it? <a href="#" id="auth-switch-link">Back to sign in</a></div>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('login'); });
    document.getElementById('auth-submit').addEventListener('click', handleForgotPassword);
  } else {
    c.innerHTML = `
      <h2>Sign in</h2>
      <div class="auth-sub">Sign in to see how to contact this seller.</div>
      <div class="field"><label for="auth-email">Email</label><input type="text" id="auth-email" placeholder="you@email.com"></div>
      ${passwordFieldHtml('auth-password', 'Password', 'Password')}
      <div class="auth-error" id="auth-error"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Log in</button>
      <div class="auth-switch">New to Roost? <a href="#" id="auth-switch-link">Create an account</a></div>
      <div class="auth-switch"><a href="#" id="auth-forgot-link">Forgot password?</a></div>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('signup'); });
    document.getElementById('auth-forgot-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('forgot'); });
    document.getElementById('auth-submit').addEventListener('click', handleLogin);
    wirePasswordToggle('auth-password');
  }
}

async function handleSignup() {
  const err = document.getElementById('auth-error');
  err.style.color = 'var(--rust-dark)';
  err.textContent = '';
  const name = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!name || !email || !password) { err.textContent = 'Please fill in your name, email, and password.'; return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const data = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    currentUser = data.user;
    trackConversion('accountCreated');
    onAuthSuccess();
  } catch (e) {
    err.textContent = (e.data && e.data.error) || 'Something went wrong creating your account.';
  } finally {
    btn.disabled = false; btn.textContent = 'Create account';
  }
}

async function handleLogin() {
  const err = document.getElementById('auth-error');
  err.style.color = 'var(--rust-dark)';
  err.textContent = '';
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    currentUser = data.user;
    onAuthSuccess();
  } catch (e) {
    err.textContent = (e.data && e.data.error) || 'Something went wrong logging in.';
  } finally {
    btn.disabled = false; btn.textContent = 'Log in';
  }
}

async function handleForgotPassword() {
  const err = document.getElementById('auth-error');
  err.style.color = 'var(--rust-dark)';
  err.textContent = '';
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { err.textContent = 'Enter your email address.'; return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const data = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    const c = document.getElementById('auth-gate-content');
    c.innerHTML = `
      <h2>Check your email</h2>
      <div class="auth-sub">${escapeHtml(data.message || "If an account exists for that email, we've sent a password reset link.")}</div>
      <button class="secondary" id="auth-switch-link" style="width:100%;">Back to sign in</button>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', () => renderAuthGate('login'));
  } catch (e) {
    err.textContent = (e.data && e.data.error) || 'Something went wrong. Please try again.';
    btn.disabled = false; btn.textContent = 'Send reset link';
  }
}

async function handleResetPassword(token) {
  const c = document.getElementById('auth-gate-content');
  c.innerHTML = `
    <h2>Set a new password</h2>
    <div class="auth-sub">Choose a new password for your Roost account.</div>
    ${passwordFieldHtml('reset-password-input', 'New password', 'At least 6 characters')}
    <div class="auth-error" id="auth-error"></div>
    <button class="primary" id="reset-submit-btn" style="width:100%;">Set new password</button>
  `;
  wirePasswordToggle('reset-password-input');
  document.getElementById('reset-submit-btn').addEventListener('click', async () => {
    const err = document.getElementById('auth-error');
    err.style.color = 'var(--rust-dark)';
    err.textContent = '';
    const newPassword = document.getElementById('reset-password-input').value;
    if (newPassword.length < 6) { err.textContent = 'Password should be at least 6 characters.'; return; }

    const btn = document.getElementById('reset-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const data = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
      currentUser = data.user;
      document.getElementById('auth-overlay').classList.remove('show');
      updateAuthArea();
      showToast('Password updated — you\'re signed in.');
    } catch (e) {
      err.textContent = (e.data && e.data.error) || 'Could not reset your password.';
      btn.disabled = false; btn.textContent = 'Set new password';
    }
  });
}

function onAuthSuccess() {
  document.getElementById('auth-overlay').classList.remove('show');
  updateAuthArea();
  const nameField = document.getElementById('f-poster-name');
  if (nameField && !nameField.value && currentUser) nameField.value = currentUser.name;
  if (authSuccessCallback) { const cb = authSuccessCallback; authSuccessCallback = null; cb(); }
}

function updateAuthArea() {
  updateModLinkVisibility();
  const area = document.getElementById('auth-area');
  const messagesTab = document.getElementById('tab-messages');
  const alertsBtn = document.getElementById('alerts-btn');
  const myListingsTab = document.getElementById('tab-mylistings');
  const savedTab = document.getElementById('tab-saved');
  if (!currentUser) {
    area.innerHTML = `<button id="signin-btn">Sign in</button><button class="primary" id="signup-btn">Create account</button>`;
    document.getElementById('signin-btn').addEventListener('click', () => openAuthModal('login'));
    document.getElementById('signup-btn').addEventListener('click', () => openAuthModal('signup'));
    messagesTab.style.display = 'none';
    alertsBtn.style.display = 'none';
    myListingsTab.style.display = 'none';
    savedTab.style.display = 'none';
    return;
  }
  area.innerHTML = `<button id="account-btn" class="greeting-btn">Hi, ${escapeHtml(currentUser.name)}${currentUser.verificationStatus === 'verified' ? verifiedBadgeHtml('inline') : ''}</button><button id="logout-btn">Log out</button>`;
  document.getElementById('account-btn').addEventListener('click', openAccountModal);
  document.getElementById('logout-btn').addEventListener('click', logout);
  messagesTab.style.display = 'inline-flex';
  myListingsTab.style.display = 'inline-flex';
  savedTab.style.display = 'inline-flex';
  refreshUnreadBadge();
  // alertsBtn itself now lives inside the Saved page (not the header), so its own visibility is
  // handled by switchView() when that page opens — nothing to do for it here on sign-in.
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  currentUser = null;
  updateAuthArea();
  showToast("You're logged out.");
}

async function refreshCurrentUser() {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
  } catch (e) {
    currentUser = null;
  }
  updateAuthArea();
}

// ===================== MODERATION (real server-enforced admin check) =====================
function updateModLinkVisibility() {
  document.getElementById('footer-modqueue').style.display = isAdmin() ? 'inline' : 'none';
  document.getElementById('footer-stats').style.display = isAdmin() ? 'inline' : 'none';
  document.getElementById('footer-verifqueue').style.display = isAdmin() ? 'inline' : 'none';
}

async function openModerationQueue() {
  document.getElementById('modqueue-overlay').classList.add('show');
  const body = document.getElementById('modqueue-body');
  body.innerHTML = 'Loading…';
  try {
    const data = await api('/listings/admin/reported');
    const flagged = data.listings || [];
    if (flagged.length === 0) { body.innerHTML = `<div class="empty" style="padding:30px 10px;">No reported listings right now.</div>`; return; }
    body.innerHTML = flagged.map(l => `
      <div class="mod-item" data-mod-id="${l.id}">
        <div class="mod-count">${l.reportCount} report${l.reportCount === 1 ? '' : 's'}</div>
        <div class="mod-title">${escapeHtml(l.title)}</div>
        <div class="mod-meta">${escapeHtml(catInfo(l.category).label)} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)} · ${formatPriceDisplay(l)}</div>
        <div class="mod-actions">
          <button class="secondary mod-view-btn" data-id="${l.id}">View listing</button>
          <button class="primary mod-remove-btn" data-id="${l.id}" style="background:var(--rust-dark);">Remove listing</button>
        </div>
      </div>
    `).join('');
    body.querySelectorAll('.mod-view-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
    body.querySelectorAll('.mod-remove-btn').forEach(btn => btn.addEventListener('click', () => removeListing(btn.dataset.id)));
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:30px 10px;">${e.status === 403 ? 'Admin access required.' : 'Could not load the moderation queue.'}</div>`;
  }
}

async function removeListing(id) {
  try {
    await api('/listings/admin/' + id, { method: 'DELETE' });
    allListings = allListings.filter(l => String(l.id) !== String(id));
    applyFilters();
    showToast('Listing removed.');
    if (document.getElementById('modqueue-overlay').classList.contains('show')) openModerationQueue();
  } catch (e) {
    showToast(e.status === 403 ? 'Only moderators can remove listings.' : 'Could not remove that listing.');
  }
}

document.getElementById('footer-modqueue').addEventListener('click', (e) => { e.preventDefault(); openModerationQueue(); });
document.getElementById('modqueue-close').addEventListener('click', () => document.getElementById('modqueue-overlay').classList.remove('show'));
document.getElementById('modqueue-overlay').addEventListener('click', (e) => { if (e.target.id === 'modqueue-overlay') document.getElementById('modqueue-overlay').classList.remove('show'); });

// ===================== STATS (admin-only, real server counts) =====================
function weeklyBarChartHtml(rows, label) {
  if (!rows || rows.length === 0) return `<div class="stats-empty-note">No ${label.toLowerCase()} yet in the last 8 weeks.</div>`;
  const max = Math.max(...rows.map(r => r.count), 1);
  return `<div class="week-bars">${rows.map(r => `
    <div class="week-bar-col">
      <div class="week-bar-track"><div class="week-bar-fill" style="height:${Math.max(4, (r.count / max) * 100)}%;" title="${r.count}"></div></div>
      <div class="week-bar-count">${r.count}</div>
      <div class="week-bar-label">${r.week}</div>
    </div>`).join('')}</div>`;
}
function topLocationsHtml(rows) {
  if (!rows || rows.length === 0) return `<div class="stats-empty-note">No listings yet.</div>`;
  const max = Math.max(...rows.map(r => r.count), 1);
  return rows.map(r => `
    <div class="stats-bar-row">
      <div class="stats-bar-label">${escapeHtml(r.city)}, ${escapeHtml(r.state)}</div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(r.count / max) * 100}%;"></div></div>
      <div class="stats-bar-count">${r.count}</div>
    </div>`).join('');
}
function categoryBreakdownHtml(rows) {
  if (!rows || rows.length === 0) return `<div class="stats-empty-note">No listings yet.</div>`;
  const max = Math.max(...rows.map(r => r.count), 1);
  return rows.map(r => `
    <div class="stats-bar-row">
      <div class="stats-bar-label">${escapeHtml(catInfo(r.category).label)}</div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(r.count / max) * 100}%;background:${catInfo(r.category).color};"></div></div>
      <div class="stats-bar-count">${r.count}</div>
    </div>`).join('');
}

async function openStats() {
  document.getElementById('stats-overlay').classList.add('show');
  const body = document.getElementById('stats-body');
  body.innerHTML = 'Loading…';
  try {
    const s = await api('/stats');
    const messageRate = s.totalListingViews > 0 ? Math.round((s.totalConversations / s.totalListingViews) * 100) : 0;
    body.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${s.pageviews || 0}</div><div class="label">Page loads (all time)</div></div>
        <div class="stat-card"><div class="num">${s.listingviews || 0}</div><div class="label">Listing clicks / views</div></div>
        <div class="stat-card"><div class="num">${s.accounts || 0}</div><div class="label">Accounts created</div></div>
        <div class="stat-card"><div class="num">${s.listingsPosted || 0}</div><div class="label">Listings ever posted</div></div>
      </div>

      <div class="stats-section-title">Growth — last 8 weeks</div>
      <div class="stats-grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div><div class="stats-subhead">New listings</div>${weeklyBarChartHtml(s.weeklyListings, 'listings')}</div>
        <div><div class="stats-subhead">New signups</div>${weeklyBarChartHtml(s.weeklySignups, 'signups')}</div>
      </div>

      <div class="stats-section-title">Where listings are coming from</div>
      <div class="stats-bar-list">${topLocationsHtml(s.topLocations)}</div>

      <div class="stats-section-title">By category</div>
      <div class="stats-bar-list">${categoryBreakdownHtml(s.categoryBreakdown)}</div>

      <div class="stats-section-title">Engagement — is it actually working?</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${s.totalListingViews || 0}</div><div class="label">Total listing views</div></div>
        <div class="stat-card"><div class="num">${s.totalConversations || 0}</div><div class="label">Buyer-seller conversations started</div></div>
        <div class="stat-card"><div class="num">${messageRate}%</div><div class="label">Views that led to a message</div></div>
        <div class="stat-card"><div class="num">${s.soldCount || 0}</div><div class="label">Listings sold</div></div>
        <div class="stat-card"><div class="num">${s.avgDaysToSale != null ? s.avgDaysToSale : '—'}</div><div class="label">Avg. days to sell${s.avgDaysToSale == null ? ' (none yet)' : ''}</div></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${s.verifiedBreeders || 0}</div><div class="label">Verified breeders</div></div>
        <div class="stat-card"><div class="num">${s.savedSearchUsers || 0}</div><div class="label">Buyers with a saved search</div></div>
        <div class="stat-card"><div class="num">${s.totalMessages || 0}</div><div class="label">Total messages sent</div></div>
        <div class="stat-card"><div class="num">${s.reportedListings || 0}</div><div class="label">Listings reported at least once</div></div>
      </div>

      <div class="stats-section-title">Boost${boostFreeTrial ? ' (free trial)' : ''}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${s.boostActiveNow || 0}</div><div class="label">Boosted right now</div></div>
        <div class="stat-card"><div class="num">${s.boostEverBoosted || 0}</div><div class="label">Listings ever boosted</div></div>
        <div class="stat-card"><div class="num">${s.boostTotalViewsGained || 0}</div><div class="label">Total views gained from boosts</div></div>
        <div class="stat-card"><div class="num">$${((s.boostTotalRevenueCents || 0) / 100).toFixed(2)}</div><div class="label">Boost revenue collected</div></div>
      </div>
      <div class="stats-note">Counts each listing's most recent boost only — a listing boosted more than once doesn't add up across boosts yet. Fine for a read on adoption during the test period; worth a proper history table before this doubles as real revenue accounting.</div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:30px 10px;">${e.status === 403 ? 'Admin access required.' : 'Could not load stats.'}</div>`;
  }
}
document.getElementById('footer-stats').addEventListener('click', (e) => {
  e.preventDefault();
  if (!isAdmin()) { alert('You do not have access to this page.'); return; }
  openStats();
});

// Admin coordinate-backfill tool. Runs entirely in the browser — the
// Google key is domain-restricted, which only real browser requests
// satisfy, not a server-to-server call. Throttled between requests to be
// a reasonable citizen of the API rather than firing everything at once.
document.getElementById('backfill-coords-btn').addEventListener('click', async () => {
  const btn = document.getElementById('backfill-coords-btn');
  const statusEl = document.getElementById('backfill-status');
  btn.disabled = true;

  if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
    statusEl.textContent = 'Google Maps isn\'t loaded — check that the Geocoding API is enabled and added to your key\'s restrictions.';
    btn.disabled = false;
    return;
  }

  let listings;
  try {
    const data = await api('/listings/admin/missing-coords');
    listings = data.listings || [];
  } catch (e) {
    statusEl.textContent = 'Could not load the list of listings needing coordinates.';
    btn.disabled = false;
    return;
  }

  if (listings.length === 0) {
    statusEl.textContent = 'Nothing to do — every listing already has coordinates.';
    btn.disabled = false;
    return;
  }

  const geocoder = new google.maps.Geocoder();
  let fixed = 0, failed = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    statusEl.textContent = `Processing ${i + 1} of ${listings.length}… (${fixed} fixed, ${failed} failed so far)`;
    try {
      const result = await new Promise((resolve, reject) => {
        geocoder.geocode(
          { address: `${l.city}, ${l.state}`, componentRestrictions: { country: 'US' } },
          (results, status) => {
            if (status === 'OK' && results && results[0]) resolve(results[0]);
            else reject(new Error(status));
          }
        );
      });
      const loc = result.geometry.location;
      await api('/listings/' + l.id + '/coordinates', {
        method: 'PATCH',
        body: JSON.stringify({ lat: loc.lat(), lon: loc.lng() })
      });
      fixed++;
    } catch (e) {
      console.error('Could not geocode listing', l.id, `"${l.city}, ${l.state}"`, '-', e.message);
      failed++;
    }
    await new Promise(r => setTimeout(r, 250)); // throttle — don't hammer the API in a tight loop
  }

  statusEl.textContent = `Done — fixed ${fixed} of ${listings.length}.` +
    (failed > 0 ? ` ${failed} couldn't be resolved automatically (unusual city/state text — may need a manual look).` : '');
  btn.disabled = false;
});

// Regenerates thumbnails for existing listings from their already-good
// full-size photo — no seller involvement needed, since the full image was
// never actually broken, only the thumbnail generation was. Reuses the
// exact same resizeImageToDataUrl function used for brand-new uploads, so
// regenerated thumbnails are produced by identical logic, not a separate
// reimplementation that could quietly drift out of sync over time.
//
// Deliberately two-step, not one button that processes everything
// immediately: first previews real before/after results on a small
// sample, and only touches every other photo once that's explicitly
// confirmed. The backend also backs up every previous thumbnail before
// replacing it, so "Restore previous thumbnails" below is a genuine,
// complete undo even after a full run — this is a one-level undo (it
// reverts the most recent regeneration), not unlimited history.
function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

let allPhotosForThumbRegen = null;
const PREVIEW_SAMPLE_SIZE = 3;

async function regenerateOnePhoto(p) {
  const img = await loadImageFromDataUrl(p.photoFull);
  const thumbResult = resizeImageToDataUrl(img, 480, 0.72);
  await api('/listings/admin/photo-thumb', {
    method: 'PATCH',
    body: JSON.stringify({ type: p.type, id: p.id, thumbDataUrl: thumbResult.dataUrl })
  });
  return thumbResult.dataUrl;
}

document.getElementById('backfill-thumbs-preview-btn').addEventListener('click', async () => {
  const btn = document.getElementById('backfill-thumbs-preview-btn');
  const statusEl = document.getElementById('backfill-thumbs-status');
  const previewArea = document.getElementById('thumb-preview-area');
  btn.disabled = true;
  statusEl.textContent = 'Loading photos…';

  try {
    const data = await api('/listings/admin/all-photos');
    allPhotosForThumbRegen = [
      ...data.covers.map(p => ({ type: 'cover', id: p.id, photoThumb: p.photoThumb, photoFull: p.photoFull })),
      ...data.gallery.map(p => ({ type: 'gallery', id: p.id, photoThumb: p.photoThumb, photoFull: p.photoFull }))
    ];
  } catch (e) {
    statusEl.textContent = 'Could not load the list of photos.';
    btn.disabled = false;
    return;
  }

  if (allPhotosForThumbRegen.length === 0) {
    statusEl.textContent = 'No photos found.';
    btn.disabled = false;
    return;
  }

  const sample = allPhotosForThumbRegen.slice(0, PREVIEW_SAMPLE_SIZE);
  statusEl.textContent = `Generating a preview from ${sample.length} photo${sample.length === 1 ? '' : 's'}…`;

  const previewRows = [];
  for (const p of sample) {
    try {
      const img = await loadImageFromDataUrl(p.photoFull);
      const newThumb = resizeImageToDataUrl(img, 480, 0.72).dataUrl;
      previewRows.push({ old: p.photoThumb, new: newThumb });
    } catch (e) {
      console.error('Preview failed for a photo:', e.message);
    }
  }

  previewArea.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Before (current) vs. after (regenerated) — nothing has been saved yet</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${previewRows.map(r => `
        <div style="display:flex;gap:10px;align-items:center;">
          <div style="flex:1;text-align:center;"><img src="${r.old || ''}" style="max-width:100%;max-height:110px;border-radius:6px;border:1px solid var(--line);"><div style="font-size:11px;color:var(--muted);margin-top:3px;">Current</div></div>
          <div style="flex:1;text-align:center;"><img src="${r.new}" style="max-width:100%;max-height:110px;border-radius:6px;border:1px solid var(--line);"><div style="font-size:11px;color:var(--muted);margin-top:3px;">Regenerated</div></div>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="secondary" id="thumb-preview-cancel" style="flex:1;">Cancel, don't change anything</button>
      <button class="primary" id="thumb-preview-continue" style="flex:1;">Looks good — do the rest (${allPhotosForThumbRegen.length - sample.length} remaining)</button>
    </div>
  `;
  previewArea.style.display = 'block';
  statusEl.textContent = '';
  btn.disabled = false;

  document.getElementById('thumb-preview-cancel').addEventListener('click', () => {
    previewArea.style.display = 'none';
    previewArea.innerHTML = '';
    statusEl.textContent = 'Cancelled — nothing was changed.';
  });

  document.getElementById('thumb-preview-continue').addEventListener('click', async () => {
    const continueBtn = document.getElementById('thumb-preview-continue');
    const cancelBtn = document.getElementById('thumb-preview-cancel');
    continueBtn.disabled = true;
    cancelBtn.disabled = true;

    let fixed = 0, failed = 0;
    for (let i = 0; i < allPhotosForThumbRegen.length; i++) {
      const p = allPhotosForThumbRegen[i];
      statusEl.textContent = `Processing ${i + 1} of ${allPhotosForThumbRegen.length}… (${fixed} fixed, ${failed} failed so far)`;
      try {
        await regenerateOnePhoto(p);
        fixed++;
      } catch (e) {
        console.error('Could not regenerate thumbnail for', p.type, p.id, '-', e.message);
        failed++;
      }
      await new Promise(r => setTimeout(r, 60));
    }

    statusEl.textContent = `Done — regenerated ${fixed} of ${allPhotosForThumbRegen.length} thumbnails.` +
      (failed > 0 ? ` ${failed} couldn't be processed (may need a manual look).` : '') +
      ' If anything looks wrong, use "Restore previous thumbnails" below.';
    previewArea.style.display = 'none';
    previewArea.innerHTML = '';
  });
});

document.getElementById('restore-thumbs-btn').addEventListener('click', async () => {
  const btn = document.getElementById('restore-thumbs-btn');
  const statusEl = document.getElementById('backfill-thumbs-status');
  if (!confirm('This reverts every thumbnail back to whatever it was before the last regeneration. Continue?')) return;
  btn.disabled = true;
  statusEl.textContent = 'Restoring…';
  try {
    const result = await api('/listings/admin/restore-thumbnails', { method: 'POST' });
    statusEl.textContent = `Restored ${result.coversRestored} cover photo${result.coversRestored === 1 ? '' : 's'} and ${result.galleryRestored} gallery photo${result.galleryRestored === 1 ? '' : 's'} to their previous thumbnails.`;
  } catch (e) {
    statusEl.textContent = 'Could not restore thumbnails.';
  }
  btn.disabled = false;
});


document.getElementById('stats-close').addEventListener('click', () => document.getElementById('stats-overlay').classList.remove('show'));
document.getElementById('stats-overlay').addEventListener('click', (e) => { if (e.target.id === 'stats-overlay') document.getElementById('stats-overlay').classList.remove('show'); });

// ===================== LEGAL MODALS =====================
const LEGAL_CONTENT = {
  terms: `
    <h3>Terms of Service (summary)</h3>
    <p>Roost is a listings platform only. We are not a party to any sale, adoption, or transaction between users, and we don't handle payments, shipping, or verify sellers. You must be 18 or older to use Roost.</p>
    <p>By posting a listing, you grant Roost the right to display that content on the Service, and you're responsible for its accuracy and for complying with all applicable laws regarding the sale or transfer of the animal, including the species restrictions below.</p>
    <p>The Service is provided "as is," without warranties. Roost's liability is limited to the extent permitted by law, and disputes are subject to the governing law and dispute-resolution terms in the full Terms of Service.</p>
    <div class="legal-note">This is a condensed summary. The complete Terms of Service is available as a separate document.</div>
  `,
  privacy: `
    <h3>Privacy Policy (summary)</h3>
    <p>We collect what you submit in a listing and account signup — species, description, city/state, and the contact information you choose to include. Contact information in a listing is only shown to signed-in users.</p>
    <p>We don't sell your personal information. You can delete your account at any time from your account settings, which also removes your listings and messages.</p>
    <p>We advertise Roost using Google Ads. To measure whether our ads work, Google may set cookies or use similar technology on your device when you visit Roost, and we tell Google when an action happens on the site, such as an account being created, a message being sent, or a listing being posted. We don't share the content of your messages or listings for this purpose. You can control ad personalization at <a href="https://adssettings.google.com" target="_blank" rel="noopener">adssettings.google.com</a> or by blocking cookies in your browser.</p>
    <p>Roost is not intended for anyone under 18, and we don't knowingly collect information from anyone under that age.</p>
    <div class="legal-note">This is a condensed summary. The complete Privacy Policy is available as a separate document.</div>
  `,
  species: `
    <h3>Prohibited &amp; Protected Species Policy</h3>
    <p>The following may not be listed on Roost, under any category:</p>
    <ul>
      <li>Eagles of any species — private ownership/transfer is essentially never permitted under federal law</li>
      <li>Wild-caught native bird species — only captive-bred birds may be listed</li>
      <li>Species listed under the U.S. Endangered Species Act or CITES Appendix I</li>
      <li>Species whose sale is restricted or banned under applicable state law</li>
      <li>Any bird the seller doesn't legally own or can't legally transfer</li>
    </ul>
    <p>Hawks, falcons, owls, and other birds of prey are not accepted on Roost at this time.</p>
  `,
  dmca: `
    <h3>DMCA / Copyright Policy (summary)</h3>
    <p>Roost responds to valid notices of copyright infringement under the Digital Millennium Copyright Act. If you believe your copyrighted work has been posted on Roost without authorization, send a notice including identification of the work, the infringing material's location, your contact details, and a statement made under penalty of perjury that the notice is accurate.</p>
    <div class="legal-note">This is a condensed summary. The complete policy, including the designated agent and counter-notice process, is available as a separate document.</div>
  `
};
function openLegal(section) {
  document.getElementById('legal-content').innerHTML = LEGAL_CONTENT[section];
  document.getElementById('legal-overlay').classList.add('show');
}
document.getElementById('legal-close').addEventListener('click', () => document.getElementById('legal-overlay').classList.remove('show'));
document.getElementById('legal-overlay').addEventListener('click', (e) => { if (e.target.id === 'legal-overlay') document.getElementById('legal-overlay').classList.remove('show'); });
document.getElementById('footer-terms').addEventListener('click', (e) => { e.preventDefault(); openLegal('terms'); });
document.getElementById('footer-privacy').addEventListener('click', (e) => { e.preventDefault(); openLegal('privacy'); });
document.getElementById('footer-species').addEventListener('click', (e) => { e.preventDefault(); openLegal('species'); });
document.getElementById('footer-dmca').addEventListener('click', (e) => { e.preventDefault(); openLegal('dmca'); });
document.getElementById('open-species-policy').addEventListener('click', (e) => { e.preventDefault(); openLegal('species'); });
document.getElementById('open-terms-from-form').addEventListener('click', (e) => { e.preventDefault(); openLegal('terms'); });
document.getElementById('open-privacy-from-form').addEventListener('click', (e) => { e.preventDefault(); openLegal('privacy'); });

// ===================== MESSAGING =====================
// Wires the always-visible "Message seller" bar on a listing page. Signed-out
// visitors can type a message right away — signing in is only asked for at
// send time (via the auth modal), rather than gating the whole box behind a
// separate button the way it used to.
// Google Ads conversion tracking. Labels come from Google Ads > Goals > Conversions.
// A missing label or a blocked tag must never break the app, so this fails silently.
const GOOGLE_ADS_ID = 'AW-18462050490';
const CONVERSION_LABELS = {
  messageSent: 'Lg88CKGj1_0cELqRsuNE',
  accountCreated: '-sqzCLKy2_0cELqRsuNE',
  listingPosted: 'pY9SCLWy2_0cELqRsuNE'
};
function trackConversion(name) {
  try {
    const label = CONVERSION_LABELS[name];
    if (label && typeof gtag === 'function') gtag('event', 'conversion', { send_to: GOOGLE_ADS_ID + '/' + label });
  } catch (e) { /* tracking is best-effort */ }
}

function wireSellerCompose(listingId) {
  const sendBtn = document.getElementById('inline-compose-send');
  if (!sendBtn) return; // not rendered at all on your own listing
  const input = document.getElementById('inline-compose-text');
  const warnEl = document.getElementById('inline-compose-scam-warning');
  const errEl = document.getElementById('inline-compose-error');

  input.addEventListener('input', () => {
    warnEl.classList.toggle('show', containsScamLanguage(input.value));
  });

  const send = async () => {
    if (!currentUser) { openAuthModal('login', () => renderListingPage(listingId)); return; }
    const text = input.value.trim();
    errEl.textContent = '';
    if (!text) { errEl.textContent = 'Write a message first.'; return; }
    if (containsUrl(text)) { errEl.textContent = 'Links aren\'t allowed in messages — this helps keep everyone safe from off-platform scams.'; return; }
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      await api('/listings/' + listingId + '/message', { method: 'POST', body: JSON.stringify({ body: text }) });
      trackConversion('messageSent');
      document.getElementById('seller-compose').innerHTML =
        `<p style="color:var(--muted);font-size:13px;margin:0;">Message sent. <a href="#" id="go-to-inbox" style="color:var(--primary-dark);font-weight:600;">View in Messages</a></p>`;
      document.getElementById('go-to-inbox').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('tab-messages').click(); });
      refreshUnreadBadge();
    } catch (e) {
      errEl.textContent = (e.data && e.data.error) || 'Could not send that message.';
      sendBtn.disabled = false; sendBtn.textContent = 'Send';
    }
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
}

async function refreshUnreadBadge() {
  if (!currentUser) return;
  try {
    const data = await api('/conversations/unread-count');
    const badge = document.getElementById('msg-badge');
    if (data.count > 0) { badge.style.display = 'flex'; badge.textContent = data.count > 99 ? '99+' : data.count; }
    else { badge.style.display = 'none'; }
  } catch (e) { /* not signed in or transient error — ignore */ }
}
// Simple polling since this app doesn't have a live socket connection yet.
setInterval(refreshUnreadBadge, 30000);

async function loadConversations() {
  const list = document.getElementById('conv-list');
  list.innerHTML = 'Loading…';
  try {
    const data = await api('/conversations');
    const convs = data.conversations || [];
    if (convs.length === 0) {
      list.innerHTML = `<div class="empty" style="padding:30px 10px;"><h3>No messages yet</h3><p>When you message a seller, or someone messages you about your listing, it'll show up here.</p></div>`;
      return;
    }
    list.innerHTML = convs.map(c => {
      const preview = c.lastMessage ? (c.lastMessageSenderId === currentUser.id ? 'You: ' : '') + c.lastMessage : 'No messages yet';
      return `
      <button class="conv-item ${c.unreadCount > 0 ? 'unread' : ''}" data-conv-id="${c.id}">
        <div class="conv-thumb">${c.listingPhoto ? `<img loading="lazy" decoding="async" src="${escapeAttr(c.listingPhoto)}" alt="">` : '🐦'}</div>
        <div class="conv-info">
          <div class="conv-top">
            <div class="conv-name">${escapeHtml(c.otherUserName)}</div>
            ${c.unreadCount > 0 ? '<span class="conv-unread-dot"></span>' : ''}
          </div>
          <div class="conv-listing">${escapeHtml(c.listingTitle)}</div>
          <div class="conv-preview">${escapeHtml(preview)}</div>
        </div>
      </button>`;
    }).join('');
    list.querySelectorAll('.conv-item').forEach(btn => {
      btn.addEventListener('click', () => openThread(btn.dataset.convId));
    });
  } catch (e) {
    list.innerHTML = `<div class="empty" style="padding:30px 10px;">Could not load your messages.</div>`;
  }
}

// The right-hand pane's placeholder state before any conversation is picked —
// on desktop both panes show side by side, so this is what sits in the thread
// pane at first (rather than it being blank or hidden, Messenger-style).
function resetThreadPanelEmpty() {
  document.getElementById('thread-panel').classList.add('empty');
  document.getElementById('thread-header').innerHTML = '';
  document.getElementById('thread-messages').innerHTML = `<div class="thread-empty-state">Select a conversation to view messages.</div>`;
  document.getElementById('thread-scam-warning').classList.remove('show');
  document.querySelectorAll('.conv-item.active').forEach(el => el.classList.remove('active'));
}

// ===================== MESSAGE REACTIONS =====================
// One emoji per person per message. Desktop: hover a message and click the little smiley. Phones
// (no hover): the smiley is always faintly visible, and double-tapping a message gives it a heart.
// Long-press is deliberately NOT used, so people can still long-press to copy message text.
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏'];
const REACT_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9.5" stroke-dasharray="2.2 2.6"/><circle cx="9" cy="10" r="0.6" fill="currentColor"/><circle cx="15" cy="10" r="0.6" fill="currentColor"/><path d="M8.5 14.2c.9 1.3 2 1.9 3.5 1.9s2.6-.6 3.5-1.9"/></svg>';
let threadMessagesById = {};

function reactionsHtml(m) {
  const list = m.reactions || [];
  const byEmoji = {};
  list.forEach(r => { (byEmoji[r.emoji] = byEmoji[r.emoji] || []).push(r.userId); });
  return Object.keys(byEmoji).map(e => {
    const ids = byEmoji[e];
    const mine = currentUser && ids.includes(currentUser.id);
    return `<button type="button" class="msg-react-chip ${mine ? 'mine-reacted' : ''}" data-emoji="${escapeAttr(e)}">${escapeHtml(e)}${ids.length > 1 ? `<span>${ids.length}</span>` : ''}</button>`;
  }).join('');
}

function closeReactionTray() {
  document.querySelectorAll('.react-tray').forEach(t => t.remove());
}

function openReactionTray(wrap) {
  const alreadyOpen = wrap.querySelector('.react-tray');
  closeReactionTray();
  if (alreadyOpen) return; // clicking the smiley again just closes it
  const m = threadMessagesById[wrap.dataset.mid];
  const mine = currentUser && m ? (m.reactions || []).find(r => r.userId === currentUser.id) : null;
  const tray = document.createElement('div');
  tray.className = 'react-tray';
  tray.innerHTML = REACTION_EMOJIS.map(e =>
    `<button type="button" data-emoji="${escapeAttr(e)}" class="${mine && mine.emoji === e ? 'active' : ''}" aria-label="React ${escapeAttr(e)}">${escapeHtml(e)}</button>`
  ).join('');
  wrap.appendChild(tray);
  // The message list scrolls, so a tray that opens upward on the first message would be cut off.
  const box = wrap.parentElement;
  if (box && wrap.getBoundingClientRect().top - box.getBoundingClientRect().top < 56) tray.classList.add('below');
}

async function reactToMessage(conversationId, wrap, emoji) {
  closeReactionTray();
  const messageId = wrap.dataset.mid;
  try {
    const data = await api('/conversations/' + conversationId + '/messages/' + messageId + '/reaction', { method: 'POST', body: JSON.stringify({ emoji }) });
    const m = threadMessagesById[messageId];
    if (m) m.reactions = data.reactions;
    const holder = wrap.querySelector('.msg-reactions');
    if (holder && m) holder.innerHTML = reactionsHtml(m);
  } catch (e) {
    showToast('Could not save that reaction.');
  }
}

// Registered once per open thread on the message list (delegated, so re-renders don't stack listeners).
let reactionOutsideClickWired = false;
function wireMessageReactions(msgsWrap, conversationId) {
  msgsWrap.onclick = (e) => {
    const wrap = e.target.closest('.msg-wrap');
    if (!wrap) return;
    const trayBtn = e.target.closest('.react-tray button');
    if (trayBtn) { reactToMessage(conversationId, wrap, trayBtn.dataset.emoji); return; }
    if (e.target.closest('.msg-react-btn') || e.target.closest('.msg-react-chip')) { openReactionTray(wrap); return; }
  };
  // Double-tap a message on a touch screen to heart it (or take the heart back off).
  // addEventListener rather than the on* property: non-touch desktop browsers silently ignore
  // the property form, and #thread-messages is reused across threads, so the previous
  // thread's listener is removed first instead of stacking up.
  if (msgsWrap._doubleTapHandler) msgsWrap.removeEventListener('touchend', msgsWrap._doubleTapHandler);
  let lastTapAt = 0, lastTapWrap = null;
  msgsWrap._doubleTapHandler = (e) => {
    const bubble = e.target.closest('.msg-bubble');
    const wrap = bubble && bubble.closest('.msg-wrap');
    if (!wrap) return;
    const now = Date.now();
    if (lastTapWrap === wrap && now - lastTapAt < 300) {
      e.preventDefault();
      lastTapAt = 0; lastTapWrap = null;
      reactToMessage(conversationId, wrap, '❤️');
    } else {
      lastTapAt = now; lastTapWrap = wrap;
    }
  };
  msgsWrap.addEventListener('touchend', msgsWrap._doubleTapHandler, { passive: false });
  if (!reactionOutsideClickWired) {
    reactionOutsideClickWired = true;
    document.addEventListener('click', (e) => { if (!e.target.closest('.react-tray, .msg-react-btn, .msg-react-chip')) closeReactionTray(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReactionTray(); });
  }
}

async function openThread(conversationId) {
  // Mobile (narrow screens): swap the list pane out for the thread pane.
  // Desktop: both panes already show side by side — this just reveals the
  // compose bar and back button that stay hidden in the empty state.
  document.getElementById('messages-shell').classList.add('showing-thread');
  document.getElementById('thread-panel').classList.remove('empty');
  document.querySelectorAll('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.convId === String(conversationId)));
  document.getElementById('thread-messages').innerHTML = 'Loading…';
  document.getElementById('thread-header').innerHTML = '';
  threadMessagesById = {};
  closeReactionTray();

  try {
    const data = await api('/conversations/' + conversationId + '/messages');
    const conv = data.conversation;

    const rateActionHtml = conv.canReview
      ? `<button class="secondary" id="rate-seller-btn" style="margin-top:8px;">★ Rate this seller</button>`
      : (conv.alreadyReviewed ? `<div class="rating-text" style="margin-top:8px;">✓ You reviewed this seller</div>` : '');

    // Thumbnail + title are both one clickable link back to the actual
    // listing — easy to lose track of which bird a thread is about once
    // you're a few messages deep, especially across several conversations.
    const listingLinkHtml = conv.listing ? `
      <button class="th-listing-link" id="th-listing-link">
        <div class="th-listing-thumb">${conv.listing.photoUrl ? `<img loading="lazy" decoding="async" src="${escapeAttr(conv.listing.photoUrl)}" alt="">` : '🐦'}</div>
        <div class="th-listing-title">${escapeHtml(conv.listing.title)}</div>
      </button>` : `<div class="th-listing">Listing</div>`;

    document.getElementById('thread-header').innerHTML = `
      ${listingLinkHtml}
      <div class="th-with">Conversation about this listing</div>
      ${rateActionHtml}
    `;
    const listingLinkBtn = document.getElementById('th-listing-link');
    if (listingLinkBtn) listingLinkBtn.addEventListener('click', () => openDetail(conv.listing.id));
    const rateBtn = document.getElementById('rate-seller-btn');
    if (rateBtn) {
      rateBtn.addEventListener('click', () => openRateModal(conv.sellerId, conv.listing.id, conv.listing.title, conversationId));
    }

    const msgsWrap = document.getElementById('thread-messages');
    if (data.messages.length === 0) {
      msgsWrap.innerHTML = `<div class="empty" style="padding:20px 10px;">No messages yet — say hello.</div>`;
    } else {
      msgsWrap.innerHTML = data.messages.map(m => {
        const mine = m.senderId === currentUser.id;
        const time = new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        // Deliberately checked only on messages from the OTHER person, not
        // your own — a warning shown to whoever sent a risky message does
        // nothing to protect the person reading it, which is the actual
        // point of this feature.
        const flagged = !mine && containsScamLanguage(m.body);
        const warningHtml = flagged
          ? `<div class="msg-scam-warning">⚠️ This message mentions something common in online scams (wiring money, gift cards, shipping without meeting, etc). Never send money before meeting in person and seeing the bird.</div>`
          : '';
        threadMessagesById[m.id] = m;
        const reactBtn = `<button type="button" class="msg-react-btn" aria-label="React to this message" title="React">${REACT_ICON_SVG}</button>`;
        const bubble = `<div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">${escapeHtml(m.body)}<div class="msg-time">${mine ? 'You' : escapeHtml(m.senderName)} · ${time}</div></div>`;
        return `<div class="msg-wrap ${mine ? 'mine' : 'theirs'}" data-mid="${m.id}">${warningHtml}
          <div class="msg-line">${mine ? reactBtn + bubble : bubble + reactBtn}</div>
          <div class="msg-reactions">${reactionsHtml(m)}</div>
        </div>`;
      }).join('');
    }
    msgsWrap.scrollTop = msgsWrap.scrollHeight;
    wireMessageReactions(msgsWrap, conversationId);

    const sendBtn = document.getElementById('thread-send');
    const input = document.getElementById('thread-input');
    input.value = '';
    document.getElementById('thread-scam-warning').classList.remove('show');
    input.oninput = () => {
      document.getElementById('thread-scam-warning').classList.toggle('show', containsScamLanguage(input.value));
    };
    // Enter sends and Shift+Enter starts a new line, like most chat apps. On phones and tablets
    // (touch screens) Enter stays a plain new line, since there's an on-screen Send button and
    // people often want multi-line messages when typing with a thumb.
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    input.onkeydown = (e) => {
      if (isTouchDevice || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      sendBtn.click(); // goes through the same checks as clicking Send; a disabled button ignores it, so no double-send
    };
    sendBtn.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      if (containsUrl(text)) { showToast('Links aren\'t allowed in messages — this helps keep everyone safe.'); return; }
      sendBtn.disabled = true;
      try {
        await api('/conversations/' + conversationId + '/messages', { method: 'POST', body: JSON.stringify({ body: text }) });
        input.value = '';
        openThread(conversationId); // simplest way to re-render with the new message included
      } catch (e) {
        showToast('Could not send that message.');
      } finally {
        sendBtn.disabled = false;
      }
    };

    refreshUnreadBadge();
  } catch (e) {
    document.getElementById('thread-messages').innerHTML = `<div class="empty" style="padding:20px 10px;">Could not load this conversation.</div>`;
  }
}

document.getElementById('thread-back').addEventListener('click', () => {
  document.getElementById('messages-shell').classList.remove('showing-thread');
  resetThreadPanelEmpty();
  loadConversations();
});

// ===================== RATINGS & REVIEWS =====================
let selectedRating = 0;
let pendingRateContext = null; // { sellerId, listingId, listingTitle, conversationId }

function renderStarPicker() {
  const wrap = document.getElementById('star-picker');
  wrap.innerHTML = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return `<button type="button" data-n="${n}" class="${n <= selectedRating ? 'filled' : ''}">${starIconSvg(30)}</button>`;
  }).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    const n = Number(btn.dataset.n);
    btn.addEventListener('mouseenter', () => previewStars(n));
    btn.addEventListener('mouseleave', () => previewStars(selectedRating));
    btn.addEventListener('click', () => { selectedRating = n; previewStars(n); });
  });
}
function previewStars(n) {
  document.querySelectorAll('#star-picker button').forEach(btn => {
    btn.classList.toggle('filled', Number(btn.dataset.n) <= n);
  });
}

function openRateModal(sellerId, listingId, listingTitle, conversationId) {
  pendingRateContext = { sellerId, listingId, listingTitle, conversationId };
  selectedRating = 0;
  document.getElementById('rate-seller-name').textContent = `About: ${listingTitle}`;
  document.getElementById('rate-comment').value = '';
  document.getElementById('rate-error').textContent = '';
  renderStarPicker();
  document.getElementById('rate-overlay').classList.add('show');
}
document.getElementById('rate-close').addEventListener('click', () => document.getElementById('rate-overlay').classList.remove('show'));
document.getElementById('rate-overlay').addEventListener('click', (e) => { if (e.target.id === 'rate-overlay') document.getElementById('rate-overlay').classList.remove('show'); });

document.getElementById('rate-submit').addEventListener('click', async () => {
  const err = document.getElementById('rate-error');
  err.textContent = '';
  if (!selectedRating) { err.textContent = 'Pick a star rating first.'; return; }
  if (!pendingRateContext) return;

  const btn = document.getElementById('rate-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    await api('/listings/' + pendingRateContext.listingId + '/reviews', {
      method: 'POST',
      body: JSON.stringify({ rating: selectedRating, comment: document.getElementById('rate-comment').value.trim() })
    });
    document.getElementById('rate-overlay').classList.remove('show');
    showToast('Thanks — your review was posted.');
    if (pendingRateContext.conversationId) openThread(pendingRateContext.conversationId);
  } catch (e) {
    err.textContent = (e.data && e.data.error) || 'Could not submit your review.';
  } finally {
    btn.disabled = false; btn.textContent = 'Submit review';
  }
});

async function openSellerProfile(sellerId) {
  document.getElementById('seller-overlay').classList.add('show');
  const body = document.getElementById('seller-profile-body');
  body.innerHTML = 'Loading…';
  try {
    const data = await api('/users/' + sellerId + '/profile');
    const u = data.user;
    const memberSince = new Date(u.memberSince).toLocaleDateString([], { year: 'numeric', month: 'long' });

    const reviewsHtml = data.reviews.length === 0
      ? `<div class="empty" style="padding:20px 10px;">No reviews yet.</div>`
      : data.reviews.map(r => `
        <div class="review-item">
          <div class="review-top">
            <span class="review-name">${escapeHtml(r.reviewerName)}</span>
            ${starsDisplayHtml(r.rating, 12)}
          </div>
          <div class="review-listing">About: ${escapeHtml(r.listingTitle)}</div>
          ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
        </div>
      `).join('');

    const listingsHtml = data.listings.length === 0
      ? `<div class="empty" style="padding:16px 10px;">No active listings right now.</div>`
      : `<div class="seller-listings-grid">${data.listings.map(l => {
          const c = catInfo(l.category);
          return `<div class="seller-mini-card" data-id="${l.id}">
            <div class="smc-thumb">${l.photoUrl ? `<img loading="lazy" decoding="async" src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
            <div class="smc-body">
              <div class="smc-title">${escapeHtml(l.title)}</div>
              <div class="smc-price">${formatPriceDisplay(l)}</div>
            </div>
          </div>`;
        }).join('')}</div>`;

    body.innerHTML = `
      <div class="seller-header">
        <h2>${escapeHtml(u.name)}${u.verified ? verifiedBadgeHtml('large') : ''}</h2>
        <div class="member-since">Member since ${memberSince}</div>
        ${u.reviewCount > 0
          ? `<div class="rating-line">${starsDisplayHtml(u.avgRating, 16)}<span class="rating-text">${u.avgRating.toFixed(1)} (${u.reviewCount} review${u.reviewCount === 1 ? '' : 's'})</span></div>`
          : `<div class="rating-text">No reviews yet</div>`}
      </div>
      <div class="seller-section-title">Reviews</div>
      ${reviewsHtml}
      <div class="seller-section-title">Active listings</div>
      ${listingsHtml}
    `;
    body.querySelectorAll('.seller-mini-card').forEach(card => {
      card.addEventListener('click', () => { document.getElementById('seller-overlay').classList.remove('show'); openDetail(card.dataset.id); });
    });
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:30px 10px;">Could not load this profile.</div>`;
  }
}
document.getElementById('seller-close').addEventListener('click', () => document.getElementById('seller-overlay').classList.remove('show'));
document.getElementById('seller-overlay').addEventListener('click', (e) => { if (e.target.id === 'seller-overlay') document.getElementById('seller-overlay').classList.remove('show'); });

// ===================== MY LISTINGS (seller analytics) =====================
const EYE_PATH_1 = 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z';
const EYE_PATH_2 = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const CHAT_ICON_PATH = 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z';
const BELL_ICON_PATH = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9';

function statIconSvg(pathD, size) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}"><path d="${pathD}"></path></svg>`;
}

async function loadMyListings() {
  const summaryEl = document.getElementById('myl-summary');
  const listEl = document.getElementById('myl-list');
  summaryEl.innerHTML = '';
  listEl.innerHTML = 'Loading…';
  try {
    const data = await api('/listings/mine');
    const listings = data.listings || [];

    const totals = listings.reduce((acc, l) => {
      acc.views += l.viewCount;
      acc.conversations += l.conversationCount;
      acc.alerts += l.alertMatches;
      acc.saves += l.saveCount;
      return acc;
    }, { views: 0, conversations: 0, alerts: 0, saves: 0 });

    summaryEl.innerHTML = `
      <div class="stat-card"><div class="num">${listings.length}</div><div class="label">Active listings</div></div>
      <div class="stat-card"><div class="num">${totals.views}</div><div class="label">Total views</div></div>
      <div class="stat-card"><div class="num">${totals.conversations}</div><div class="label">Buyers messaged you</div></div>
      <div class="stat-card"><div class="num">${totals.saves}</div><div class="label">Times saved by buyers</div></div>
      <div class="stat-card"><div class="num">${totals.alerts}</div><div class="label">Saved-search alerts sent</div></div>
    `;

    if (listings.length === 0) {
      listEl.innerHTML = `<div class="empty" style="padding:30px 10px;"><h3>No listings yet</h3><p>Once you post a bird, its stats will show up here.</p><button class="primary" onclick="document.getElementById('tab-post').click()">Post a bird</button></div>`;
      return;
    }

    listEl.innerHTML = listings.map(l => {
      const c = catInfo(l.category);
      const when = new Date(l.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const statusBadge = l.status === 'sold' ? '<span class="sold-badge">SOLD</span> ' : l.status === 'pending' ? '<span class="pending-badge">PENDING</span> ' : '';
      const boostResultsHtml = (label) => `<span class="myl-boost-results">${label}: +${l.boostViewsGained} view${l.boostViewsGained === 1 ? '' : 's'} · +${l.boostSavesGained} save${l.boostSavesGained === 1 ? '' : 's'} · +${l.boostConversationsGained} message${l.boostConversationsGained === 1 ? '' : 's'}</span>`;
      // Non-refundable, including an early sale — spelled out up front so it's
      // never a surprise raised after the fact. Doesn't apply during the free
      // trial, since there's nothing charged to refund.
      const boostDisclaimerHtml = boostFreeTrial ? '' : `<div class="myl-boost-disclaimer">One-time charge, non-refundable — even if this sells or gets removed before the boost runs out.</div>`;
      let boostSectionHtml = '';
      if (l.status === 'sold') {
        // Sold mid-boost: the boost isn't refunded, but leaving the seller
        // with zero explanation for why a boost they paid for stopped
        // "working" is exactly the kind of thing that turns into a dispute.
        if (l.boostIsActive) {
          const until = new Date(l.boostedUntil).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          boostSectionHtml = `
            <div class="myl-boost-status">
              <span class="myl-boost-results">🚀 This boost runs through ${until}, but won't show since the listing is marked sold — boosts are non-refundable, including when an item sells early (that's the boost working).</span>
            </div>`;
        }
      } else if (l.boostIsActive) {
        boostSectionHtml = `
          <div class="myl-boost-status myl-boost-active">
            <span class="myl-boost-flag myl-boost-countdown" data-boosted-until="${l.boostedUntil}">🚀 —</span>
            ${boostResultsHtml('Since boosting')}
            <button class="secondary myl-boost-end-btn" data-id="${l.id}">Turn off boost</button>
          </div>`;
      } else {
        boostSectionHtml = `
          <div class="myl-boost-status">
            ${l.boostStartedAt ? boostResultsHtml('Last boost') : ''}
            <button class="secondary myl-boost-btn" data-id="${l.id}">${boostButtonLabel()}</button>
            ${boostDisclaimerHtml}
          </div>`;
      }
      return `
      <div class="myl-item ${l.status === 'sold' ? 'myl-sold' : ''} ${l.boostIsActive && l.status !== 'sold' ? 'boosted-glow' : ''}" data-id="${l.id}">
        <div class="myl-thumb">${l.photoUrl ? `<img loading="lazy" decoding="async" src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
        <div class="myl-info">
          <div class="myl-title">${statusBadge}${escapeHtml(l.title)} — ${formatPriceDisplay(l)}</div>
          <div class="myl-meta">Posted ${when} · ${escapeHtml(catInfo(l.category).label)}</div>
          <div class="myl-stats">
            <span class="myl-stat">${statIconSvg(EYE_PATH_1, 13)} ${l.viewCount} view${l.viewCount === 1 ? '' : 's'}</span>
            <span class="myl-stat">${statIconSvg(CHAT_ICON_PATH, 13)} ${l.conversationCount} buyer${l.conversationCount === 1 ? '' : 's'} messaged</span>
            <span class="myl-stat">${heartIconSvg(true, 13)} ${l.saveCount} save${l.saveCount === 1 ? '' : 's'}</span>
            <span class="myl-stat">${statIconSvg(BELL_ICON_PATH, 13)} ${l.alertMatches} alert${l.alertMatches === 1 ? '' : 's'} sent</span>
          </div>
          ${boostSectionHtml}
        </div>
        <div class="myl-actions">
          <select class="myl-status-select" data-id="${l.id}">
            <option value="active" ${l.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="pending" ${l.status === 'pending' ? 'selected' : ''}>Pending (deposit)</option>
            <option value="sold" ${l.status === 'sold' ? 'selected' : ''}>Sold</option>
          </select>
          <button class="secondary myl-edit" data-id="${l.id}">Edit</button>
          <button class="secondary myl-duplicate" data-id="${l.id}">Duplicate</button>
          <button class="secondary myl-delete" data-id="${l.id}" style="color:var(--rust-dark);border-color:var(--rust);">Delete</button>
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.myl-boost-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); boostListing(btn.dataset.id, btn); });
    });
    listEl.querySelectorAll('.myl-boost-end-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); endBoostEarly(btn.dataset.id); });
    });
    startBoostCountdowns();
    const justCompleted = listings.find(l => l.boostJustCompleted);
    if (justCompleted) showBoostResultPopup(justCompleted);
    listEl.querySelectorAll('.myl-item').forEach(item => {
      item.addEventListener('click', () => openDetail(item.dataset.id));
    });
    listEl.querySelectorAll('.myl-status-select').forEach(select => {
      select.dataset.prevValue = select.value;
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', () => {
        if (select.value === 'sold') {
          openSoldToPicker(select.dataset.id, select);
        } else {
          updateListingStatus(select.dataset.id, select.value);
          select.dataset.prevValue = select.value;
        }
      });
    });
    listEl.querySelectorAll('.myl-edit').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); editListing(btn.dataset.id); });
    });
    listEl.querySelectorAll('.myl-duplicate').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); duplicateListing(btn.dataset.id); });
    });
    listEl.querySelectorAll('.myl-delete').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteMyListing(btn.dataset.id); });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="empty" style="padding:30px 10px;">Could not load your listings.</div>`;
  }
}

// Keep the "24 hours" wording in sync with BOOST_DURATION_HOURS in
// config/boost.js — the server is what actually enforces the price/dates,
// this is just the button's label. Reflects the free-trial flag from
// /api/config so the button never claims to charge when it won't.
function boostButtonLabel() {
  return boostFreeTrial
    ? '🚀 Try Boost free — 24 hours (trial period)'
    : '🚀 Boost this listing — $4.99 for 24 hours';
}

// Redirects to Stripe's hosted checkout for a one-time boost purchase — or,
// during the free trial, activates immediately with no payment step at all.
async function boostListing(id, btn) {
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = boostFreeTrial ? 'Activating…' : 'Starting checkout…';
  try {
    const data = await api('/listings/' + id + '/boost/checkout', { method: 'POST' });
    if (data.free) {
      showToast('🚀 Boosted for free — trial period!');
      loadMyListings();
      return;
    }
    window.location.href = data.url;
  } catch (e) {
    showToast((e.data && e.data.error) || 'Could not start checkout for that boost.');
    btn.disabled = false; btn.textContent = original;
  }
}

// Lets a seller stop their own boost early if they don't want the exposure
// anymore — never refunded, just stops it. The no-refund confirm() (same
// pattern as deleting a listing elsewhere in this file) only appears once
// boosts actually cost money; during the free trial there's nothing to warn
// about, so it just stops. Tied to boostFreeTrial, so it comes back on its
// own when BOOST_FREE_TRIAL is switched off in config/boost.js.
async function endBoostEarly(id) {
  if (!boostFreeTrial && !confirm("End this boost now? It won't be refunded, but it'll stop showing right away.")) return;
  try {
    await api('/listings/' + id + '/boost/end', { method: 'POST' });
    showToast('Boost ended.');
    loadMyListings();
  } catch (e) {
    showToast((e.data && e.data.error) || 'Could not end that boost.');
  }
}

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return 'wrapping up…';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

// One shared ticking interval for every countdown on the page at once,
// restarted on each My Listings render rather than left to pile up across
// visits. When a countdown actually reaches zero while someone's watching,
// it reloads the list — which is also what surfaces the "boost complete"
// popup the moment it's earned, not just on the next visit.
let boostCountdownInterval = null;
function startBoostCountdowns() {
  clearInterval(boostCountdownInterval);
  const els = document.querySelectorAll('.myl-boost-countdown');
  if (els.length === 0) return;
  const tick = () => {
    let anyJustEnded = false;
    document.querySelectorAll('.myl-boost-countdown').forEach(el => {
      const remaining = new Date(el.dataset.boostedUntil).getTime() - Date.now();
      el.textContent = `🚀 ${formatCountdown(remaining)}`;
      if (remaining <= 0) anyJustEnded = true;
    });
    if (anyJustEnded) { clearInterval(boostCountdownInterval); loadMyListings(); }
  };
  tick();
  boostCountdownInterval = setInterval(tick, 1000);
}

// The Hinge-style "Boost complete!" popup — shows once per boost (the
// backend's boost_result_acknowledged flag makes sure of that), with the
// actual before/after numbers rather than a multiplier claim we can't back
// up credibly at our current traffic.
// Below this, the popup leads with encouragement about the free placement rather than a
// discouraging "+0" — a real number is still shown once there's at least one to show. The
// threshold is "any single number that's actually worth naming", not an average.
function boostResultMessage(l) {
  const parts = [];
  if (l.boostViewsGained > 0) parts.push(`+${l.boostViewsGained} view${l.boostViewsGained === 1 ? '' : 's'}`);
  if (l.boostSavesGained > 0) parts.push(`+${l.boostSavesGained} save${l.boostSavesGained === 1 ? '' : 's'}`);
  if (l.boostConversationsGained > 0) parts.push(`+${l.boostConversationsGained} message${l.boostConversationsGained === 1 ? '' : 's'}`);
  if (parts.length === 0) {
    return `"${l.title}" was featured at the top of Browse for 24 hours. Roost's traffic is still growing, so boosted listings will get more eyes on them as more buyers visit. Want to feature it again, free, while boosting is free?`;
  }
  const joined = parts.length === 1 ? parts[0] : parts.length === 2 ? parts.join(' and ') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  return `"${l.title}" picked up ${joined} while it was boosted.`;
}
function showBoostResultPopup(l) {
  document.getElementById('boost-result-text').textContent = boostResultMessage(l);
  document.getElementById('boost-result-overlay').classList.add('show');

  const acknowledge = () => api('/listings/' + l.id + '/boost/acknowledge-result', { method: 'POST' }).catch(() => {});

  document.getElementById('boost-result-ok').onclick = () => {
    document.getElementById('boost-result-overlay').classList.remove('show');
    acknowledge().then(loadMyListings); // re-check — there could be another completed boost queued up
  };
  document.getElementById('boost-result-again').onclick = () => {
    document.getElementById('boost-result-overlay').classList.remove('show');
    acknowledge().then(() => boostListing(l.id, document.createElement('button')));
  };
}

async function updateListingStatus(id, status, soldToUserId) {
  try {
    await api('/listings/' + id, { method: 'PATCH', body: JSON.stringify({ status, soldToUserId: soldToUserId || null }) });
    const messages = { active: 'Marked as active.', pending: 'Marked as pending — still visible to buyers, flagged as a deal in progress.', sold: 'Marked as sold.' };
    showToast(messages[status] || 'Listing updated.');
    loadMyListings();
  } catch (e) {
    showToast((e.data && e.data.error) || 'Could not update that listing.');
  }
}

// Shown when a seller switches a listing to "Sold" — lets them pick which
// buyer (from everyone who's messaged about it) it actually went to, since
// that's what now unlocks that buyer's ability to leave a review. `select`
// is the <select> that triggered this, so a cancel can revert its value
// instead of leaving it visually stuck on "Sold" without confirming.
async function openSoldToPicker(listingId, select) {
  document.getElementById('sold-to-overlay').classList.add('show');
  const listEl = document.getElementById('sold-to-list');
  listEl.innerHTML = 'Loading…';
  try {
    const data = await api('/listings/' + listingId + '/buyers');
    const buyers = data.buyers || [];
    if (buyers.length === 0) {
      listEl.innerHTML = `<div class="empty" style="padding:16px 0;">No one has messaged you about this listing yet — you can still mark it sold below.</div>`;
    } else {
      listEl.innerHTML = buyers.map(b => `<button class="sold-to-buyer-btn" data-buyer-id="${b.id}">${escapeHtml(b.name)}</button>`).join('');
      listEl.querySelectorAll('.sold-to-buyer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('sold-to-overlay').classList.remove('show');
          updateListingStatus(listingId, 'sold', btn.dataset.buyerId);
          if (select) select.dataset.prevValue = 'sold';
        });
      });
    }
  } catch (e) {
    listEl.innerHTML = `<div class="empty" style="padding:16px 0;">Could not load buyers for this listing.</div>`;
  }

  document.getElementById('sold-to-skip').onclick = () => {
    document.getElementById('sold-to-overlay').classList.remove('show');
    updateListingStatus(listingId, 'sold');
    if (select) select.dataset.prevValue = 'sold';
  };
  const closeWithoutChoosing = () => {
    document.getElementById('sold-to-overlay').classList.remove('show');
    if (select) select.value = select.dataset.prevValue; // didn't confirm — don't leave the dropdown stuck on "Sold"
  };
  document.getElementById('sold-to-close').onclick = closeWithoutChoosing;
  document.getElementById('sold-to-overlay').onclick = (e) => { if (e.target.id === 'sold-to-overlay') closeWithoutChoosing(); };
}


// Pre-fills the post form from an existing listing so relisting a similar
// bird (or a whole clutch, one at a time) takes seconds instead of retyping
// everything. Attestation checkboxes are deliberately left unchecked —
// re-confirming them each time is the point, not a formality to skip.
async function duplicateListing(id) {
  clearAllPostFormErrors();
  selectedCityCoords = null;
  selectedCityCoordsText = null;
  switchView('post');
  showToast('Loading listing details to duplicate…');
  editingListingId = null;
  document.getElementById('submit-listing').textContent = 'Publish listing';
  syncEditButtons();
  try {
    const data = await api('/listings/' + id);
    const l = data.listing;

    document.getElementById('f-title').value = l.title || '';
    document.getElementById('f-category').value = l.category || '';
    document.getElementById('f-category').dispatchEvent(new Event('change'));
    document.getElementById('f-breed').value = l.breed || '';
    document.getElementById('f-age').value = l.age || '';
    document.getElementById('f-sex').value = l.sex || '';
    document.getElementById('f-dna-sexed').value = l.dnaSexed || 'unknown';
    document.getElementById('f-hand-tame').value = l.handTame || 'unknown';
    document.getElementById('f-free').checked = !!l.free;
    document.getElementById('f-price').value = l.free ? '' : l.price;
    document.querySelector(`input[name="f-price-type"][value="${l.priceType === 'total' ? 'total' : 'each'}"]`).checked = true;
    document.getElementById('f-price').disabled = !!l.free;
    document.getElementById('f-trade').checked = !!l.openToTrade;
    document.getElementById('f-shipping').checked = !!l.shippingAvailable;
    document.getElementById('f-city').value = l.city || '';
    document.getElementById('f-state').value = l.state || '';
    document.getElementById('f-desc').value = l.description || '';
    document.getElementById('f-poster-name').value = l.posterName || (currentUser ? currentUser.name : '');
    document.getElementById('f-contact-method').value = l.contactMethod || 'Email';
    document.getElementById('f-contact-method').dispatchEvent(new Event('change'));
    document.getElementById('f-contact-value').value = l.contactValue || '';
    if (l.category === 'RAP' && l.permitNumber) document.getElementById('f-permit').value = l.permitNumber;
    if (l.category === 'SUP' && l.condition) document.getElementById('f-condition').value = l.condition;

    if (Array.isArray(l.photos) && l.photos.length > 0) {
      pendingPhotos = l.photos.map(p => ({ thumb: p.thumb, full: p.full }));
    } else if (l.photoFull || l.photoUrl) {
      pendingPhotos = [{ thumb: l.photoUrl || l.photoFull, full: l.photoFull || l.photoUrl }];
    } else {
      pendingPhotos = [];
    }
    renderPhotoGrid();

    showToast('Review the details below, then publish when ready.');
  } catch (e) {
    showToast('Could not load that listing to duplicate.');
  }
}

async function editListing(id) {
  clearAllPostFormErrors();
  selectedCityCoords = null;
  selectedCityCoordsText = null;
  switchView('post');
  showToast('Loading your listing…');
  try {
    const data = await api('/listings/' + id);
    const l = data.listing;

    document.getElementById('f-title').value = l.title || '';
    document.getElementById('f-category').value = l.category || '';
    document.getElementById('f-category').dispatchEvent(new Event('change'));
    document.getElementById('f-breed').value = l.breed || '';
    document.getElementById('f-age').value = l.age || '';
    document.getElementById('f-sex').value = l.sex || '';
    document.getElementById('f-dna-sexed').value = l.dnaSexed || 'unknown';
    document.getElementById('f-hand-tame').value = l.handTame || 'unknown';
    document.getElementById('f-free').checked = !!l.free;
    document.getElementById('f-price').value = l.free ? '' : l.price;
    document.querySelector(`input[name="f-price-type"][value="${l.priceType === 'total' ? 'total' : 'each'}"]`).checked = true;
    document.getElementById('f-price').disabled = !!l.free;
    document.getElementById('f-trade').checked = !!l.openToTrade;
    document.getElementById('f-shipping').checked = !!l.shippingAvailable;
    document.getElementById('f-city').value = l.city || '';
    document.getElementById('f-state').value = l.state || '';
    document.getElementById('f-desc').value = l.description || '';
    document.getElementById('f-poster-name').value = l.posterName || (currentUser ? currentUser.name : '');
    document.getElementById('f-contact-method').value = l.contactMethod || 'Email';
    document.getElementById('f-contact-method').dispatchEvent(new Event('change'));
    document.getElementById('f-contact-value').value = l.contactValue || '';
    if (l.category === 'RAP' && l.permitNumber) document.getElementById('f-permit').value = l.permitNumber;
    if (l.category === 'SUP' && l.condition) document.getElementById('f-condition').value = l.condition;

    if (Array.isArray(l.photos) && l.photos.length > 0) {
      pendingPhotos = l.photos.map(p => ({ thumb: p.thumb, full: p.full }));
    } else if (l.photoFull || l.photoUrl) {
      pendingPhotos = [{ thumb: l.photoUrl || l.photoFull, full: l.photoFull || l.photoUrl }];
    } else {
      pendingPhotos = [];
    }
    renderPhotoGrid();

    editingListingId = id;
    document.getElementById('submit-listing').textContent = 'Save changes';
    syncEditButtons();
    showToast('Editing your listing — update anything, then save.');
  } catch (e) {
    showToast('Could not load that listing to edit.');
  }
}

async function deleteMyListing(id) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;
  try {
    await api('/listings/' + id, { method: 'DELETE' });
    showToast('Listing deleted.');
    loadMyListings();
  } catch (e) {
    showToast((e.data && e.data.error) || 'Could not delete that listing.');
  }
}

// ===================== SAVED SEARCHES & ALERTS =====================
document.getElementById('save-search-btn').addEventListener('click', () => {
  if (!currentUser) { openAuthModal('login'); return; }
  const inline = document.getElementById('save-search-inline');
  inline.style.display = inline.style.display === 'none' ? 'block' : 'none';
  document.getElementById('save-search-error').textContent = '';
});

document.getElementById('save-search-confirm').addEventListener('click', async () => {
  const err = document.getElementById('save-search-error');
  err.textContent = '';
  const name = document.getElementById('save-search-name').value.trim();
  if (!name) { err.textContent = 'Give this search a name.'; return; }

  const payload = {
    name,
    category: currentCategory !== 'all' ? currentCategory : null,
    query: document.getElementById('search-input').value.trim() || null,
    priceMin: document.getElementById('price-min').value || null,
    priceMax: document.getElementById('price-max').value || null,
    locationText: activeLocation ? activeLocation.text : null,
    tradeOnly: document.getElementById('trade-filter').checked,
    emailAlerts: true
  };

  const btn = document.getElementById('save-search-confirm');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/saved-searches', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('save-search-inline').style.display = 'none';
    document.getElementById('save-search-name').value = '';
    showToast('Search saved — we\'ll alert you about new matches.');
  } catch (e) {
    err.textContent = (e.data && e.data.error) || 'Could not save that search.';
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
});

async function refreshAlertsBadge() {
  if (!currentUser) return;
  try {
    const data = await api('/saved-searches/notifications/unread-count');
    const badge = document.getElementById('alerts-badge');
    if (data.count > 0) { badge.style.display = 'flex'; badge.textContent = data.count > 99 ? '99+' : data.count; }
    else { badge.style.display = 'none'; }
  } catch (e) { /* ignore */ }
}
setInterval(refreshAlertsBadge, 30000);

document.getElementById('alerts-btn').addEventListener('click', openAlerts);
document.getElementById('alerts-close').addEventListener('click', () => document.getElementById('alerts-overlay').classList.remove('show'));
document.getElementById('alerts-overlay').addEventListener('click', (e) => { if (e.target.id === 'alerts-overlay') document.getElementById('alerts-overlay').classList.remove('show'); });

async function openAlerts() {
  document.getElementById('alerts-overlay').classList.add('show');
  await Promise.all([loadSavedSearchesList(), loadNotificationsList()]);
  try {
    await api('/saved-searches/notifications/mark-read', { method: 'POST' });
    refreshAlertsBadge();
  } catch (e) { /* ignore */ }
}

function describeSearch(s) {
  const parts = [];
  if (s.category) parts.push(catInfo(s.category).label);
  if (s.query) parts.push(`"${s.query}"`);
  if (s.priceMin || s.priceMax) parts.push(`$${s.priceMin || 0}–${s.priceMax || '∞'}`);
  if (s.locationText) parts.push(s.locationText);
  if (s.tradeOnly) parts.push('Trades only');
  return parts.length ? parts.join(' · ') : 'All birds';
}

async function loadSavedSearchesList() {
  const wrap = document.getElementById('saved-searches-list');
  wrap.innerHTML = 'Loading…';
  try {
    const data = await api('/saved-searches');
    const searches = data.savedSearches || [];
    if (searches.length === 0) {
      wrap.innerHTML = `<div class="empty" style="padding:16px 10px;">No saved searches yet. Use the filter icon on Browse to save one.</div>`;
      return;
    }
    wrap.innerHTML = searches.map(s => `
      <div class="saved-search-item" data-id="${s.id}">
        <div class="ss-info">
          <div class="ss-name">${escapeHtml(s.name)}</div>
          <div class="ss-detail">${escapeHtml(describeSearch(s))}</div>
        </div>
        <div class="ss-actions">
          <label class="ss-toggle"><input type="checkbox" class="ss-email-toggle" data-id="${s.id}" ${s.emailAlerts ? 'checked' : ''}> Email</label>
          <button class="ss-delete" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('.ss-email-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        try { await api('/saved-searches/' + cb.dataset.id, { method: 'PATCH', body: JSON.stringify({ emailAlerts: cb.checked }) }); }
        catch (e) { showToast('Could not update that setting.'); cb.checked = !cb.checked; }
      });
    });
    wrap.querySelectorAll('.ss-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await api('/saved-searches/' + btn.dataset.id, { method: 'DELETE' }); loadSavedSearchesList(); showToast('Saved search deleted.'); }
        catch (e) { showToast('Could not delete that search.'); }
      });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:16px 10px;">Could not load your saved searches.</div>`;
  }
}

async function loadNotificationsList() {
  const wrap = document.getElementById('notifications-list');
  wrap.innerHTML = 'Loading…';
  try {
    const data = await api('/saved-searches/notifications');
    const notifs = data.notifications || [];
    if (notifs.length === 0) {
      wrap.innerHTML = `<div class="empty" style="padding:16px 10px;">No matches yet — you'll see new listings here as they come in.</div>`;
      return;
    }
    wrap.innerHTML = notifs.map(n => {
      const when = new Date(n.notifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `
      <div class="notif-item ${!n.readAt ? 'unread' : ''}" data-listing-id="${n.listingId}">
        <div class="notif-thumb">${n.listingPhoto ? `<img loading="lazy" decoding="async" src="${escapeAttr(n.listingPhoto)}" alt="">` : '🐦'}</div>
        <div class="notif-text">
          <div><strong>${escapeHtml(n.listingTitle)}</strong> — ${n.free ? 'Free' : '$' + n.price} · ${escapeHtml(n.city)}, ${escapeHtml(n.state)}</div>
          <div class="notif-search-name">Matches "${escapeHtml(n.searchName)}" · ${when}</div>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => { document.getElementById('alerts-overlay').classList.remove('show'); openDetail(item.dataset.listingId); });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:16px 10px;">Could not load your alerts.</div>`;
  }
}

// ===================== ACCOUNT: EMAIL & BREEDER VERIFICATION =====================
document.getElementById('account-close').addEventListener('click', () => document.getElementById('account-overlay').classList.remove('show'));
document.getElementById('account-overlay').addEventListener('click', (e) => { if (e.target.id === 'account-overlay') document.getElementById('account-overlay').classList.remove('show'); });

async function openAccountModal() {
  document.getElementById('account-overlay').classList.add('show');
  renderEmailStatus();
  renderNameSection();
  renderPasswordSection();
  renderDeleteSection();
  renderNotificationPrefs(); // deliberately not awaited: if it fails it can't hold up the rest of this window
  await renderVerificationSection();
}

// ---- Your name ----
function renderNameSection() {
  const wrap = document.getElementById('name-body');
  wrap.innerHTML = `
    <div class="account-form">
      <div class="field"><input type="text" id="account-name-input" maxlength="60" autocomplete="name" value="${escapeAttr(currentUser.name)}" aria-label="Your name"></div>
      <div class="auth-error" id="account-name-error"></div>
      <div class="btn-row"><button class="secondary" id="account-name-save">Save name</button></div>
    </div>`;
  const input = document.getElementById('account-name-input');
  const errEl = document.getElementById('account-name-error');
  const btn = document.getElementById('account-name-save');
  btn.addEventListener('click', async () => {
    errEl.textContent = '';
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (!name) { errEl.textContent = 'Please enter a name.'; return; }
    if (name === currentUser.name) { showToast('That\'s already your name.'); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const data = await api('/users/me/name', { method: 'PUT', body: JSON.stringify({ name }) });
      currentUser.name = data.name;
      input.value = data.name;
      updateAuthArea(); // the "Hi, name" greeting in the header
      showToast('Name updated.');
    } catch (e) {
      errEl.textContent = (e.data && e.data.error) || 'Could not save your name. Please try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Save name';
    }
  });
}

// ---- Password ----
function renderPasswordSection() {
  const wrap = document.getElementById('password-body');
  // Collapsed by default: just a button. The fields only appear once someone asks to change their password.
  wrap.innerHTML = `<button class="secondary" id="pw-start">Change password</button>`;
  document.getElementById('pw-start').addEventListener('click', () => {
    wrap.innerHTML = `
      <div class="account-form">
        ${passwordFieldHtml('pw-current', 'Current password', '')}
        ${passwordFieldHtml('pw-new', 'New password', 'At least 6 characters')}
        ${passwordFieldHtml('pw-confirm', 'Confirm new password', '')}
        <div class="auth-error" id="pw-error"></div>
        <div class="btn-row">
          <button class="primary" id="pw-save">Update password</button>
          <button class="secondary" id="pw-cancel" type="button">Cancel</button>
        </div>
      </div>`;
    ['pw-current', 'pw-new', 'pw-confirm'].forEach(id => wirePasswordToggle(id));
    document.getElementById('pw-current').autocomplete = 'current-password';
    document.getElementById('pw-new').autocomplete = 'new-password';
    document.getElementById('pw-confirm').autocomplete = 'new-password';
    document.getElementById('pw-current').focus();
    document.getElementById('pw-cancel').addEventListener('click', renderPasswordSection); // closes it and discards anything typed

    const errEl = document.getElementById('pw-error');
    const btn = document.getElementById('pw-save');
    btn.addEventListener('click', async () => {
      errEl.textContent = '';
      const currentPassword = document.getElementById('pw-current').value;
      const newPassword = document.getElementById('pw-new').value;
      const confirmPassword = document.getElementById('pw-confirm').value;
      if (!currentPassword || !newPassword) { errEl.textContent = 'Enter your current password and a new one.'; return; }
      if (newPassword.length < 6) { errEl.textContent = 'Your new password should be at least 6 characters.'; return; }
      if (newPassword !== confirmPassword) { errEl.textContent = 'The new passwords don\'t match.'; return; }
      btn.disabled = true; btn.textContent = 'Updating…';
      try {
        await api('/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
        renderPasswordSection(); // folds back down to the single button, with nothing left in the fields
        showToast('Password changed.');
      } catch (e) {
        errEl.textContent = (e.data && e.data.error) || 'Could not change your password. Please try again.';
        btn.disabled = false; btn.textContent = 'Update password';
      }
    });
  });
}

// ---- Delete account ----
function renderDeleteSection() {
  const wrap = document.getElementById('delete-body');
  wrap.innerHTML = `<button class="danger-outline" id="delete-start">Delete my account…</button>`;
  document.getElementById('delete-start').addEventListener('click', () => {
    wrap.innerHTML = `
      <div class="delete-warning">
        <strong>This is permanent and can't be undone.</strong> Deleting your account will:
        <ul>
          <li>remove all of your listings,</li>
          <li>remove your messages, including those conversations for the other person,</li>
          <li>remove reviews you've written or received, and your saved searches and saved listings,</li>
          <li>end any active boost, with no refund.</li>
        </ul>
      </div>
      <div class="account-form">
        ${passwordFieldHtml('delete-password', 'Your password', '')}
        <div class="field"><label for="delete-confirm">Type <strong>DELETE</strong> to confirm</label><input type="text" id="delete-confirm" autocomplete="off" autocapitalize="characters"></div>
        <div class="auth-error" id="delete-error"></div>
        <div class="btn-row">
          <button class="danger" id="delete-go" disabled>Permanently delete my account</button>
          <button class="secondary" id="delete-cancel" type="button">Cancel</button>
        </div>
      </div>`;
    wirePasswordToggle('delete-password');
    document.getElementById('delete-password').autocomplete = 'current-password';
    const confirmInput = document.getElementById('delete-confirm');
    const goBtn = document.getElementById('delete-go');
    const errEl = document.getElementById('delete-error');
    confirmInput.addEventListener('input', () => { goBtn.disabled = confirmInput.value.trim() !== 'DELETE'; });
    document.getElementById('delete-cancel').addEventListener('click', renderDeleteSection);
    goBtn.addEventListener('click', async () => {
      errEl.textContent = '';
      goBtn.disabled = true; goBtn.textContent = 'Deleting…';
      try {
        await api('/users/me/delete', { method: 'POST', body: JSON.stringify({ password: document.getElementById('delete-password').value, confirm: confirmInput.value.trim() }) });
        document.getElementById('account-overlay').classList.remove('show');
        currentUser = null;
        updateAuthArea();
        switchView('browse');
        showToast('Your account has been deleted.');
      } catch (e) {
        errEl.textContent = (e.data && e.data.error) || 'Could not delete your account. Please try again.';
        goBtn.disabled = confirmInput.value.trim() !== 'DELETE';
        goBtn.textContent = 'Permanently delete my account';
      }
    });
  });
}

// Email notification settings. Each section of this window loads on its own and handles its own
// errors, so one failing (for example a settings lookup) never blanks out the others.
async function renderNotificationPrefs() {
  const wrap = document.getElementById('notify-prefs-body');
  wrap.innerHTML = 'Loading…';
  let prefs;
  try {
    prefs = await api('/users/me/preferences');
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:12px 10px;">Couldn't load your notification settings right now. Please try again in a moment.</div>`;
    return;
  }
  wrap.innerHTML = `
    <label class="notify-row" for="notify-new-messages">
      <input type="checkbox" id="notify-new-messages" ${prefs.notifyNewMessages ? 'checked' : ''}>
      <span><strong>New messages</strong><span class="notify-hint">Email me when someone sends me a message. You'll still see every message in Roost either way.</span></span>
    </label>
    <div class="notify-hint" style="margin-top:8px;">Emails about saved searches are controlled on each saved search.</div>
    <div class="auth-error" id="notify-error"></div>`;

  const box = document.getElementById('notify-new-messages');
  const errEl = document.getElementById('notify-error');
  box.addEventListener('change', async () => {
    const wanted = box.checked;
    errEl.textContent = '';
    box.disabled = true;
    try {
      const saved = await api('/users/me/preferences', { method: 'PUT', body: JSON.stringify({ notifyNewMessages: wanted }) });
      box.checked = saved.notifyNewMessages;
      showToast(saved.notifyNewMessages ? 'You\'ll get emails for new messages.' : 'Message emails turned off.');
    } catch (e) {
      box.checked = !wanted; // put it back so the switch always shows what's really saved
      errEl.textContent = (e.data && e.data.error) || 'Could not save that. Please try again.';
    } finally {
      box.disabled = false;
    }
  });
}

// The "turn these off" link in message emails lands here with ?account=notifications.
function handleAccountRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('account')) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('account');
  window.history.replaceState({}, '', url.toString());
  if (!currentUser) { openAuthModal('login', () => openAccountModal()); return; }
  openAccountModal();
}

function renderEmailStatus() {
  const wrap = document.getElementById('email-status-body');
  if (currentUser.emailVerified) {
    wrap.innerHTML = `<div class="status-box ok">✓ ${escapeHtml(currentUser.email)} is verified</div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="status-box warn">
      <span>${escapeHtml(currentUser.email)} isn't verified yet</span>
      <button class="secondary" id="resend-verify-btn" style="font-size:12px;padding:6px 10px;">Resend email</button>
    </div>`;
  document.getElementById('resend-verify-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      showToast('Verification email sent — check your inbox.');
    } catch (err) {
      showToast((err.data && err.data.error) || 'Could not send that email.');
    } finally {
      btn.disabled = false; btn.textContent = 'Resend email';
    }
  });
}

async function renderVerificationSection() {
  const wrap = document.getElementById('verification-body');
  wrap.innerHTML = 'Loading…';
  let status;
  try {
    status = await api('/verification/status');
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:16px 10px;">Could not load your verification status.</div>`;
    return;
  }

  if (status.status === 'verified') {
    wrap.innerHTML = `<div class="status-box ok">${verifiedBadgeHtml('inline')} You're a verified breeder on Roost</div>`;
    return;
  }
  if (status.status === 'pending') {
    wrap.innerHTML = `<div class="status-box">Your application is under review — we'll email you once it's decided.</div>`;
    return;
  }

  const rejectedNote = status.status === 'rejected'
    ? `<div class="status-box warn">Your previous application wasn't approved: ${escapeHtml(status.note || 'No reason given.')} You're welcome to update the details below and reapply.</div>`
    : '';

  wrap.innerHTML = `
    ${rejectedNote}
    <div class="verify-form">
      <div class="field"><label for="verify-business-name">Breeder / business name</label><input type="text" id="verify-business-name" placeholder="e.g. Sacramento Valley Aviary" value="${escapeAttr(status.businessName || '')}"></div>
      <div class="field"><label for="verify-phone">Phone number</label><input type="text" id="verify-phone" placeholder="(555) 555-0100" value="${escapeAttr(status.phone || '')}"></div>
      <div class="auth-error" id="verify-apply-error"></div>
      <button class="primary" id="verify-apply-submit" style="width:100%;">Save changes</button>
    </div>
  `;

  document.getElementById('verify-apply-submit').addEventListener('click', async () => {
    const err = document.getElementById('verify-apply-error');
    err.textContent = '';
    const businessName = document.getElementById('verify-business-name').value.trim();
    const phone = document.getElementById('verify-phone').value.trim();
    if (!businessName || !phone) { err.textContent = 'Business/breeder name and phone are both required.'; return; }

    const btn = document.getElementById('verify-apply-submit');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await api('/verification/apply', { method: 'POST', body: JSON.stringify({ businessName, phone }) });
      showToast('Application submitted — we\'ll review it soon.');
      renderVerificationSection();
    } catch (e) {
      err.textContent = (e.data && e.data.error) || 'Could not submit your application.';
    } finally {
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  });
}

// ---- Admin: verification queue ----
document.getElementById('footer-verifqueue').addEventListener('click', (e) => { e.preventDefault(); openVerifQueue(); });
document.getElementById('verifqueue-close').addEventListener('click', () => document.getElementById('verifqueue-overlay').classList.remove('show'));
document.getElementById('verifqueue-overlay').addEventListener('click', (e) => { if (e.target.id === 'verifqueue-overlay') document.getElementById('verifqueue-overlay').classList.remove('show'); });

async function openVerifQueue() {
  document.getElementById('verifqueue-overlay').classList.add('show');
  const body = document.getElementById('verifqueue-body');
  body.innerHTML = 'Loading…';
  try {
    const data = await api('/verification/admin/pending');
    const pending = data.pending || [];
    if (pending.length === 0) {
      body.innerHTML = `<div class="empty" style="padding:20px 10px;">No pending applications right now.</div>`;
      return;
    }
    body.innerHTML = pending.map(p => `
      <div class="verif-item" data-user-id="${p.id}">
        <div class="vi-top"><span class="vi-name">${escapeHtml(p.businessName)}</span></div>
        <div class="vi-meta">${escapeHtml(p.name)} · ${escapeHtml(p.email)} · ${escapeHtml(p.phone)}</div>
        ${p.document ? `<img class="vi-doc" src="${escapeAttr(p.document)}" alt="">` : ''}
        <div class="vi-actions">
          <button class="primary vi-approve" data-id="${p.id}">Approve</button>
          <button class="secondary vi-reject-toggle" data-id="${p.id}" style="color:var(--rust-dark);border-color:var(--rust);">Reject</button>
        </div>
        <input type="text" class="vi-reject-note" data-id="${p.id}" placeholder="Reason for rejection (shown to the applicant)">
      </div>
    `).join('');

    body.querySelectorAll('.vi-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api('/verification/admin/' + btn.dataset.id + '/approve', { method: 'POST' });
          showToast('Application approved.');
          openVerifQueue();
        } catch (e) { showToast('Could not approve that application.'); btn.disabled = false; }
      });
    });
    body.querySelectorAll('.vi-reject-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const note = body.querySelector(`.vi-reject-note[data-id="${btn.dataset.id}"]`);
        if (note.style.display === 'block') {
          submitRejection(btn.dataset.id, note.value.trim());
        } else {
          note.style.display = 'block';
          note.focus();
        }
      });
    });
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:20px 10px;">${e.status === 403 ? 'Admin access required.' : 'Could not load verification requests.'}</div>`;
  }
}

async function submitRejection(userId, note) {
  try {
    await api('/verification/admin/' + userId + '/reject', { method: 'POST', body: JSON.stringify({ note }) });
    showToast('Application rejected.');
    openVerifQueue();
  } catch (e) {
    showToast('Could not reject that application.');
  }
}

// ===================== RECENTLY SOLD (social proof strip) =====================
function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

async function loadRecentlySold() {
  const section = document.getElementById('recently-sold-section');
  const strip = document.getElementById('recently-sold-strip');
  if (!section || !strip) return; // temporarily not in the layout — revisit later
  try {
    const data = await api('/listings/sold');
    const sold = data.listings || [];
    if (sold.length === 0) { section.style.display = 'none'; return; }
    strip.innerHTML = sold.map(l => {
      const c = catInfo(l.category);
      return `
      <a class="rs-card" href="/listing/${l.id}" data-id="${l.id}">
        <div class="rs-thumb">${l.photoUrl ? `<img loading="lazy" decoding="async" src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
        <div class="rs-body">
          <div class="rs-name">${escapeHtml(l.title)}</div>
          <div class="rs-price">${formatPriceDisplay(l)}</div>
          <div class="rs-when">Sold ${relativeTime(l.soldAt)}</div>
        </div>
      </a>`;
    }).join('');
    strip.querySelectorAll('.rs-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        openDetail(card.dataset.id);
      });
    });
    section.style.display = 'block';
  } catch (e) {
    section.style.display = 'none';
  }
}

// ===================== BOOT =====================
function handleVerifyRedirect() {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get('verify');
  if (!verify) return;
  const messages = {
    success: 'Your email is now verified.',
    invalid: 'That verification link is invalid.',
    expired: 'That verification link has expired — request a new one from your account menu.',
    error: 'Something went wrong verifying your email.',
    missing: 'That verification link looks incomplete.'
  };
  showToast(messages[verify] || 'Verification updated.');
  const url = new URL(window.location.href);
  url.searchParams.delete('verify');
  window.history.replaceState({}, '', url.toString());
}

function handleResetTokenRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('resetToken');
  if (!token) return;
  document.getElementById('auth-overlay').classList.add('show');
  handleResetPassword(token);
  const url = new URL(window.location.href);
  url.searchParams.delete('resetToken');
  window.history.replaceState({}, '', url.toString());
}

// Clicking "Reply on Roost" in a new-message email lands here with
// ?conversation=<id> — jumps straight into that thread instead of making
// someone hunt for it in their inbox tab.
function handleConversationRedirect() {
  const params = new URLSearchParams(window.location.search);
  const conversationId = params.get('conversation');
  if (!conversationId) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('conversation');
  window.history.replaceState({}, '', url.toString());

  const openIt = () => { switchView('messages'); openThread(conversationId); };
  if (!currentUser) { openAuthModal('login', openIt); return; }
  openIt();
}

// Lands here after Stripe Checkout redirects back — either a successful
// boost payment (?boostConfirm=<listingId>&session_id=<id>) or a canceled
// one (?boostCanceled=<listingId>). Success still requires calling the
// server to actually activate the boost; Stripe redirecting back here only
// proves the browser made it back, not that the payment succeeded.
function handleBoostConfirmRedirect() {
  const params = new URLSearchParams(window.location.search);
  const canceledId = params.get('boostCanceled');
  if (canceledId) {
    const url = new URL(window.location.href);
    url.searchParams.delete('boostCanceled');
    window.history.replaceState({}, '', url.toString());
    showToast('Boost checkout canceled — no charge made.');
    return;
  }

  const listingId = params.get('boostConfirm');
  const sessionId = params.get('session_id');
  if (!listingId || !sessionId) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('boostConfirm');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.toString());

  const confirmIt = async () => {
    try {
      await api('/listings/' + listingId + '/boost/confirm', { method: 'POST', body: JSON.stringify({ sessionId }) });
      showToast('🚀 Listing boosted for 24 hours!');
      switchView('mylistings');
    } catch (e) {
      showToast((e.data && e.data.error) || 'Could not confirm that boost.');
    }
  };
  if (!currentUser) { openAuthModal('login', confirmIt); return; }
  confirmIt();
}

// ===================== CITY/STATE AUTOCOMPLETE (optional) =====================
// Only activates if a GOOGLE_PLACES_API_KEY is configured server-side —
// otherwise these fields just work as plain text, same as always.
//
// Both widgets now also capture real coordinates directly from Google's
// response, not just the text. This exists because of a real limitation
// discovered the hard way: the free Census geocoder used elsewhere in this
// app is built for full street addresses (Census's own docs: "the building
// number and street name are required... city name, state, and ZIP code
// are optional") — a bare "Lodi, CA" query can fail to resolve through it
// even though it's a perfectly real city. Google's Places response already
// includes precise coordinates for whatever was actually selected, at no
// extra cost (same session, just requesting one more field) — so that's
// used as the primary source now, with Census kept only as a fallback for
// anyone who types a location without picking a suggestion.
let selectedCityCoords = null;
let selectedCityCoordsText = null; // exact field text at the moment coords were captured
let selectedLocCoords = null;
let selectedLocCoordsText = null;

// Returns the captured coordinates only if the field's current text still
// matches what was there when they were captured — if the seller edited
// the text afterward, this returns null, which correctly falls back to
// server-side geocoding instead of attaching a stale/wrong point. This
// deliberately does NOT rely on a plain "input" event listener to clear
// stale state: a real bug was found here — Google's autocomplete widget
// appears to fire its own synthetic input event as part of programmatically
// filling in a selection, which raced against and silently wiped out the
// very coordinates just captured by place_changed. Comparing text at the
// point of use sidesteps that event-ordering problem entirely.
function getVerifiedCoords(coords, capturedText, currentInputId) {
  if (!coords) return null;
  const currentText = document.getElementById(currentInputId).value.trim();
  return currentText === capturedText ? coords : null;
}

function initCityAutocomplete() {
  const cityInput = document.getElementById('f-city');
  const stateInput = document.getElementById('f-state');
  if (cityInput && window.google && window.google.maps && window.google.maps.places) {
    const autocomplete = new google.maps.places.Autocomplete(cityInput, {
      types: ['(cities)'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'geometry']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place || !place.address_components) return;
      let city = '', state = '';
      place.address_components.forEach(c => {
        if (c.types.includes('locality')) city = c.long_name;
        else if (!city && c.types.includes('sublocality')) city = c.long_name; // fallback for some smaller towns
        if (c.types.includes('administrative_area_level_1')) state = c.short_name;
      });
      if (city) { cityInput.value = city; clearFieldError('f-city'); }
      if (state) { stateInput.value = state; clearFieldError('f-state'); }
      selectedCityCoords = (place.geometry && place.geometry.location)
        ? { lat: place.geometry.location.lat(), lon: place.geometry.location.lng() }
        : null;
      selectedCityCoordsText = cityInput.value.trim();
    });
  }

  // "Change location" search — same coordinate-capture approach.
  const locInput = document.getElementById('loc-search');
  if (locInput && window.google && window.google.maps && window.google.maps.places) {
    const locAutocomplete = new google.maps.places.Autocomplete(locInput, {
      types: ['(cities)'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'geometry']
    });
    locAutocomplete.addListener('place_changed', () => {
      const place = locAutocomplete.getPlace();
      locInput.value = locInput.value.trim().replace(/,\s*(USA|United States)$/i, '').trim();
      selectedLocCoords = (place && place.geometry && place.geometry.location)
        ? { lat: place.geometry.location.lat(), lon: place.geometry.location.lng() }
        : null;
      selectedLocCoordsText = locInput.value.trim();
    });
  }
}

async function setupGooglePlacesIfConfigured() {
  try {
    const config = await api('/config');
    boostFreeTrial = !!config.boostFreeTrial;
    if (!config.googlePlacesApiKey) return; // not configured — plain text fields, no error, no fuss
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googlePlacesApiKey)}&libraries=places&callback=initCityAutocomplete`;
    script.async = true;
    window.initCityAutocomplete = initCityAutocomplete;
    document.head.appendChild(script);
  } catch (e) {
    console.error('Could not load address autocomplete:', e); // non-fatal — form still works without it
  }
}

// Ad landing links like /?cat=finches open Roost already filtered to that category, so someone
// who searched "finches for sale" doesn't have to hunt for finches. Raptors are intentionally
// not linkable this way. The URL is deliberately left untouched afterwards: Google's tag reads
// the ad-click ID (gclid) from it, and stripping it would break conversion attribution.
const CATEGORY_URL_SLUGS = {
  parrots: 'PAR', finches: 'FIN', canaries: 'FIN', poultry: 'POU', doves: 'DOV', pigeons: 'DOV',
  waterfowl: 'WTF', softbills: 'SFT', other: 'OTH', supplies: 'SUP'
};
function applyCategoryFromUrl() {
  const slug = (new URLSearchParams(window.location.search).get('cat') || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CATEGORY_URL_SLUGS, slug)) currentCategory = CATEGORY_URL_SLUGS[slug];
}
applyCategoryFromUrl();

renderChips();
updateFilterBadge();
populateCategorySelect();
renderPhotoGrid();
routeFromLocation();
loadRecentlySold();
refreshCurrentUser().then(() => { handleVerifyRedirect(); handleConversationRedirect(); handleBoostConfirmRedirect(); handleAccountRedirect(); });
handleResetTokenRedirect();
setupGooglePlacesIfConfigured();
api('/stats/pageview', { method: 'POST' }).catch(() => {});
