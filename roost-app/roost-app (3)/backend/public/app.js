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
  { code: 'OTH', label: 'Other', color: 'var(--oth)', dark: 'var(--oth-dark2)', icon: '🐦' },
];
const SCAM_PATTERNS = ['wire transfer', 'western union', 'money gram', 'moneygram', 'gift card', 'ship without meeting', 'shipping only', 'cashapp only', 'venmo only', 'no meeting'];

function catInfo(code) { return CATEGORIES.find(c => c.code === code) || CATEGORIES[CATEGORIES.length - 1]; }

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
function tradeBadgeHtml() {
  return `<span class="trade-badge" title="Seller is open to trades"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>Open to trade</span>`;
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
function escapeAttr(s) { return escapeHtml(s); }

let currentCategory = 'all';
let allListings = [];
let currentUser = null; // {name, email, role} — comes from the server, not local guesswork

function renderChips() {
  const wrap = document.getElementById('category-chips');
  wrap.innerHTML = CATEGORIES.map(c => `
    <button class="chip ${currentCategory === c.code ? 'active' : ''}" data-code="${c.code}">
      <span class="dot" style="background:${c.color}"></span>${c.label}
    </button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = (currentCategory === btn.dataset.code) ? 'all' : btn.dataset.code;
      renderChips();
      updateFilterBadge();
    });
  });
}

function populateCategorySelect() {
  const sel = document.getElementById('f-category');
  sel.innerHTML = CATEGORIES.map(c => `<option value="${c.code}">${c.label}</option>`).join('');
  sel.addEventListener('change', () => {
    const group = document.getElementById('permit-field-group');
    if (sel.value === 'RAP') { group.style.display = 'block'; }
    else { group.style.display = 'none'; document.getElementById('f-permit').value = ''; }
  });
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

async function loadListings() {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = `<div class="empty">Loading listings…</div>`;
  try {
    const data = await api('/listings');
    allListings = data.listings || [];
  } catch (e) {
    allListings = [];
    grid.innerHTML = `<div class="empty">Couldn't load listings right now. <button class="secondary" onclick="loadListings()">Retry</button></div>`;
    return;
  }
  applyFilters();
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
    if (activeLocation) {
      if (locationHasCoords && l.lat != null && l.lon != null) {
        // Real distance — both the search location and this listing geocoded successfully.
        l._distanceMiles = distanceMilesClient(activeLocation.lat, activeLocation.lon, Number(l.lat), Number(l.lon));
        if (l._distanceMiles > Number(activeLocation.radius)) return false;
      } else {
        // Fallback — one side (or both) couldn't be geocoded, so match by city/state text instead.
        l._distanceMiles = null;
        const hay = `${l.city} ${l.state}`.toLowerCase();
        if (!hay.includes(activeLocation.text.toLowerCase())) return false;
      }
    } else {
      l._distanceMiles = null;
    }
    if (tradeOnly && !l.openToTrade) return false;
    return true;
  });

  updateFilterBadge();

  results.sort((a, b) => {
    if (sortFilter === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortFilter === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortFilter === 'price-low') return (a.free ? 0 : a.price) - (b.free ? 0 : b.price);
    if (sortFilter === 'price-high') return (b.free ? 0 : b.price) - (a.free ? 0 : a.price);
    return 0;
  });

  renderGrid(results);
}

function renderGrid(results) {
  const grid = document.getElementById('listings-grid');
  document.getElementById('count-line').textContent = `${results.length} listing${results.length === 1 ? '' : 's'}`;
  if (results.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <h3>No birds match yet</h3>
      <p>Try a different category or search term — or be the first to post.</p>
      <button class="primary" onclick="document.getElementById('tab-post').click()">Post a bird</button>
    </div>`;
    return;
  }
  grid.innerHTML = results.map(l => {
    const c = catInfo(l.category);
    return `
    <a class="card" href="/listing/${l.id}" data-id="${l.id}">
      ${l.free ? '<div class="free-ribbon">FREE</div>' : ''}
      <div class="thumb">
        ${l.status === 'pending' ? '<div class="pending-ribbon">PENDING</div>' : ''}
        ${postTimeBadgeHtml(l.createdAt)}
        <div class="thumb-img-wrap">${l.photoUrl ? `<img src="${escapeAttr(l.photoUrl)}" alt="" onerror="this.parentElement.innerHTML='${c.icon}'">` : c.icon}</div>
      </div>
      <div class="card-body">
        <div class="card-title-row"><h3>${escapeHtml(l.title)}</h3>${l.sellerVerified ? verifiedBadgeHtml('inline') : ''}</div>
        <div class="card-meta">${escapeHtml(l.breed)} · ${escapeHtml(l.age || 'age n/a')} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)}${(l._distanceMiles != null) ? ` · <span class="distance-tag">${formatDistance(l._distanceMiles)}</span>` : ''}</div>
        <div class="card-price">${l.free ? 'Free' : '$' + l.price}${l.openToTrade ? tradeBadgeHtml() : ''}</div>
      </div>
    </a>`;
  }).join('');
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openDetail(card.dataset.id);
    });
  });
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
  const symbol = tristateValue === 'yes' ? '✓' : tristateValue === 'no' ? '✕' : '?';
  const displayText = tristateValue === 'yes' ? 'Yes' : tristateValue === 'no' ? 'No' : 'Not specified';
  const cls = tristateValue === 'yes' ? 'yes' : tristateValue === 'no' ? 'no' : 'unknown';
  return `<div class="trait-row"><span class="trait-icon ${cls}">${symbol}</span><span class="trait-label">${iconEmoji} ${label}:</span> <span class="trait-value">${displayText}</span></div>`;
}
function plainTraitRowHtml(iconEmoji, label, value) {
  return `<div class="trait-row"><span class="trait-label">${iconEmoji} ${label}:</span> <span class="trait-value">${escapeHtml(value) || '?'}</span></div>`;
}
function buildDetailsBlockHtml(l) {
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
  const messageBtnHtml = isOwnListing ? '' : (currentUser
    ? `<button class="primary" id="message-seller-btn" style="width:100%;margin-bottom:10px;">Message seller</button>`
    : `<button class="primary" id="message-seller-btn" style="width:100%;margin-bottom:10px;">Sign in to message seller</button>`);

  const sellerLineHtml = l.seller ? `
    <div class="rating-line">
      <button class="seller-link" id="seller-profile-link" data-seller-id="${l.seller.id}">${escapeHtml(l.seller.name)}${l.seller.verified ? verifiedBadgeHtml('inline') : ''}</button>
      ${l.seller.reviewCount > 0
        ? `${starsDisplayHtml(l.seller.avgRating, 13)}<span class="rating-text">${l.seller.avgRating.toFixed(1)} (${l.seller.reviewCount})</span>`
        : `<span class="rating-text">No reviews yet</span>`}
    </div>` : '';

  const contactBoxHtml = (l.contactLocked === undefined) ? '' : (!l.contactLocked ? `
    <div class="contact-box">
      <div class="label">${l.contactMethod || 'Contact'}</div>
      <div class="value">${escapeHtml(l.contactValue) || 'Not provided'}</div>
    </div>` : `
    <div class="contact-locked">
      <p>Sign in to see how to contact this seller.</p>
      <button class="primary" id="contact-signin-btn">Sign in</button>
    </div>`);

  const thumbStripHtml = photos.length > 1 ? `
    <div class="lp-thumbs">
      ${photos.map((p, i) => `<button class="lp-thumb-btn ${i === 0 ? 'active' : ''}" data-index="${i}" data-full="${escapeAttr(p.full)}"><img src="${escapeAttr(p.thumb)}" alt=""></button>`).join('')}
    </div>` : '';

  return `
    <div class="lp-header-row">
      <div class="lp-band"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};"></span>${c.label}</div>
      <button class="share-btn" id="share-listing-btn" title="Copy link to this listing">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
        Share
      </button>
    </div>
    <h1>${escapeHtml(l.title)}</h1>
    <div class="lp-meta">${escapeHtml(l.breed)} · ${escapeHtml(l.age || 'age n/a')} ${l.sex ? '· ' + escapeHtml(l.sex) : ''} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)}</div>
    ${permitLine}
    <div class="lp-photo" id="lp-main-photo">
      ${postTimeBadgeHtml(l.createdAt)}
      <div class="thumb-img-wrap">${photos.length > 0 ? `<img id="lp-main-img" src="${escapeAttr(photos[0].full)}" alt="" onerror="this.parentElement.innerHTML='${c.icon}'">` : c.icon}</div>
    </div>
    ${thumbStripHtml}
    <div class="lp-price">${l.status === 'sold' ? '<span class="sold-badge">SOLD</span> ' : l.status === 'pending' ? '<span class="pending-badge">PENDING</span> ' : ''}${l.free ? 'Free to a good home' : '$' + l.price}${l.openToTrade ? tradeBadgeHtml() : ''}</div>
    ${sellerLineHtml}
    ${buildDetailsBlockHtml(l)}
    <div class="lp-desc">${escapeHtml(l.description)}</div>
    ${messageBtnHtml}
    <div id="inline-compose-wrap"></div>
    ${contactBoxHtml}
    <div class="safety-note">Roost doesn't verify sellers or handle payments. Meet in person before any money changes hands, and never wire funds or pay with gift cards.</div>
    ${isAdmin() ? `<div class="modal-actions"><button class="secondary" id="modal-admin-remove" style="color:var(--rust-dark);border-color:var(--rust);">Remove listing</button></div>` : ''}
    <button class="report-link" id="report-btn">Report this listing</button>
  `;
}

function wireListingPageHandlers(l, id) {
  document.getElementById('report-btn').addEventListener('click', () => reportListing(id));
  const contactSigninBtn = document.getElementById('contact-signin-btn');
  if (contactSigninBtn) contactSigninBtn.addEventListener('click', () => openAuthModal('login', () => renderListingPage(id)));
  const adminRemoveBtn = document.getElementById('modal-admin-remove');
  if (adminRemoveBtn) adminRemoveBtn.addEventListener('click', () => removeListing(id));
  const messageSellerBtn = document.getElementById('message-seller-btn');
  if (messageSellerBtn) {
    messageSellerBtn.addEventListener('click', () => {
      if (!currentUser) { openAuthModal('login', () => renderListingPage(id)); return; }
      showInlineCompose(id);
    });
  }
  const sellerProfileLink = document.getElementById('seller-profile-link');
  if (sellerProfileLink) sellerProfileLink.addEventListener('click', () => openSellerProfile(sellerProfileLink.dataset.sellerId));
  const shareBtn = document.getElementById('share-listing-btn');
  if (shareBtn) shareBtn.addEventListener('click', () => shareListing(id, l.title));
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
function openDetail(id) {
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
document.getElementById('search-input').addEventListener('input', applyFilters);
document.getElementById('sort-filter').addEventListener('change', applyFilters);

document.getElementById('filter-toggle').addEventListener('click', () => {
  const panel = document.getElementById('filter-panel');
  panel.classList.toggle('show');
  document.getElementById('filter-toggle').classList.toggle('active', panel.classList.contains('show'));
});
document.addEventListener('click', (e) => {
  const panel = document.getElementById('filter-panel');
  const toggle = document.getElementById('filter-toggle');
  if (panel.classList.contains('show') && !panel.contains(e.target) && !toggle.contains(e.target)) {
    panel.classList.remove('show');
    toggle.classList.remove('active');
  }
});
document.getElementById('apply-filters').addEventListener('click', () => {
  applyFilters();
  document.getElementById('filter-panel').classList.remove('show');
  document.getElementById('filter-toggle').classList.remove('active');
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
  document.getElementById('location-overlay').classList.add('show');
});
document.getElementById('location-close').addEventListener('click', () => document.getElementById('location-overlay').classList.remove('show'));
document.getElementById('location-overlay').addEventListener('click', (e) => { if (e.target.id === 'location-overlay') document.getElementById('location-overlay').classList.remove('show'); });
document.getElementById('loc-radius').addEventListener('change', updateRadiusLabel);
function updateRadiusLabel() { document.getElementById('radius-label').textContent = document.getElementById('loc-radius').value + ' mi radius'; }
function setLocationIndicator() {
  const el = document.getElementById('location-indicator');
  const text = document.getElementById('location-indicator-text');
  if (activeLocation) { text.textContent = `${activeLocation.text} · ${activeLocation.radius} mi`; el.classList.remove('unset'); }
  else { text.textContent = 'Choose a location'; el.classList.add('unset'); }
}
document.getElementById('apply-location').addEventListener('click', async () => {
  const text = document.getElementById('loc-search').value.trim();
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
  let coords = null;
  try {
    coords = await api('/geocode?q=' + encodeURIComponent(text));
  } catch (e) {
    // No match found, or the geocoder had trouble — fall back to matching
    // by city/state text below rather than failing the filter entirely.
    coords = null;
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

document.getElementById('tab-browse').addEventListener('click', () => switchView('browse'));
document.getElementById('tab-post').addEventListener('click', () => {
  if (!currentUser) { openAuthModal('signup', () => switchView('post')); return; }
  prefillPosterFields();
  switchView('post');
});

function prefillPosterFields() {
  if (!currentUser) return;
  const nameField = document.getElementById('f-poster-name');
  const emailField = document.getElementById('f-contact-value');
  if (nameField && !nameField.value) nameField.value = currentUser.name;
  if (emailField && !emailField.value) emailField.value = currentUser.email;
}
document.getElementById('tab-messages').addEventListener('click', () => switchView('messages'));
function switchView(view) {
  document.getElementById('view-browse').style.display = view === 'browse' ? 'block' : 'none';
  document.getElementById('view-post').style.display = view === 'post' ? 'block' : 'none';
  document.getElementById('view-messages').style.display = view === 'messages' ? 'block' : 'none';
  document.getElementById('view-listing').style.display = view === 'listing' ? 'block' : 'none';
  document.getElementById('view-mylistings').style.display = view === 'mylistings' ? 'block' : 'none';
  document.getElementById('tab-browse').classList.toggle('active', view === 'browse');
  document.getElementById('tab-post').classList.toggle('active', view === 'post');
  document.getElementById('tab-messages').classList.toggle('active', view === 'messages');
  document.getElementById('tab-mylistings').classList.toggle('active', view === 'mylistings');
  if (view !== 'listing' && window.location.pathname.startsWith('/listing/')) {
    window.history.pushState({}, '', '/');
  }
  if (view === 'browse') loadListings();
  if (view === 'mylistings') loadMyListings();
  if (view === 'messages') { document.getElementById('thread-panel').style.display = 'none'; document.getElementById('conv-list-panel').style.display = 'block'; loadConversations(); }
}

document.getElementById('tab-mylistings').addEventListener('click', () => switchView('mylistings'));

document.getElementById('listing-back').addEventListener('click', () => {
  window.history.pushState({}, '', '/');
  switchView('browse');
});

document.getElementById('brand-home-link').addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  window.history.pushState({}, '', '/');
  switchView('browse');
});

document.getElementById('f-desc').addEventListener('input', (e) => {
  const text = e.target.value.toLowerCase();
  const hit = SCAM_PATTERNS.some(p => text.includes(p));
  document.getElementById('scam-warning').classList.toggle('show', hit);
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
  } else {
    valueField.placeholder = 'you@email.com';
    valueField.type = 'text';
  }
});

// ===================== PHOTO UPLOAD =====================
let pendingPhotos = []; // [{thumb, full}, ...] — first item is the cover photo

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
  return canvas.toDataURL('image/jpeg', quality);
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
    if (!file.type.startsWith('image/')) { errEl.textContent = 'Please choose image files only.'; continue; }
    try {
      const img = await readImageFile(file);
      pendingPhotos.push({
        thumb: resizeImageToDataUrl(img, 260, 0.6),
        full: resizeImageToDataUrl(img, 900, 0.75)
      });
    } catch (err) {
      errEl.textContent = 'Could not process one of those images — try a different photo.';
    }
  }
  document.getElementById('f-photo-file').value = '';
  renderPhotoGrid();
});

// ===================== POST A LISTING =====================
document.getElementById('submit-listing').addEventListener('click', async () => {
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';

  if (!currentUser) {
    errEl.textContent = 'Please sign in first.';
    openAuthModal('signup', () => switchView('post'));
    return;
  }

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
    city: document.getElementById('f-city').value.trim(),
    state: document.getElementById('f-state').value.trim().toUpperCase(),
    description: document.getElementById('f-desc').value.trim(),
    posterName: document.getElementById('f-poster-name').value.trim(),
    contactMethod: document.getElementById('f-contact-method').value,
    contactValue: document.getElementById('f-contact-value').value.trim(),
    attested: document.getElementById('f-attest').checked,
    agreedTerms: document.getElementById('f-agree-terms').checked,
    permitNumber: document.getElementById('f-permit').value.trim(),
    photos: pendingPhotos
  };

  if (!body.title || !body.category || !body.city || !body.state || !body.description || !body.contactValue) {
    errEl.textContent = 'Please fill in title, category, city, state, description, and contact details.';
    return;
  }
  if (!body.free && (!body.price || Number(body.price) < 0)) { errEl.textContent = 'Enter a price, or check "free to a good home".'; return; }
  if (!body.attested) { errEl.textContent = 'Please confirm the captive-bred and ownership attestation before publishing.'; return; }
  if (!body.agreedTerms) { errEl.textContent = 'Please confirm you are 18+ and agree to the Terms of Service and Privacy Policy.'; return; }
  if (body.category === 'RAP' && !body.permitNumber) { errEl.textContent = 'A falconry/raptor permit number is required to list a bird of prey.'; return; }

  const submitBtn = document.getElementById('submit-listing');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing…';
  try {
    await api('/listings', { method: 'POST', body: JSON.stringify(body) });
    await refreshCurrentUser(); // posting without an account may have just created/signed one in
    document.getElementById('post-form-wrap').style.display = 'none';
    document.getElementById('post-success').style.display = 'block';
  } catch (e) {
    errEl.textContent = (e.data && e.data.error) || 'Something went wrong publishing your listing.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish listing';
  }
});

document.getElementById('post-another').addEventListener('click', () => {
  document.querySelectorAll('#post-form-wrap input[type=text], #post-form-wrap input[type=tel], #post-form-wrap input[type=number], #post-form-wrap textarea').forEach(el => el.value = '');
  document.getElementById('f-sex').value = '';
  document.getElementById('f-free').checked = false;
  document.getElementById('f-trade').checked = false;
  document.getElementById('f-shipping').checked = false;
  document.getElementById('f-price').disabled = false;
  document.getElementById('f-attest').checked = false;
  document.getElementById('f-agree-terms').checked = false;
  document.getElementById('permit-field-group').style.display = 'none';
  document.getElementById('f-contact-method').value = 'Email';
  document.getElementById('f-contact-value').type = 'text';
  document.getElementById('f-contact-value').placeholder = 'you@email.com';
  clearPendingPhoto();
  document.getElementById('scam-warning').classList.remove('show');
  document.getElementById('post-error').textContent = '';
  document.getElementById('post-form-wrap').style.display = 'block';
  document.getElementById('post-success').style.display = 'none';
});

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
      <div class="field"><label for="auth-password">Password</label><input type="password" id="auth-password" placeholder="At least 6 characters"></div>
      <div class="auth-error" id="auth-error"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Create account</button>
      <div class="auth-switch">Already have an account? <a href="#" id="auth-switch-link">Log in</a></div>
      <div class="auth-note">By continuing you confirm you're 18 or older and agree to Roost's Terms of Service and Privacy Policy.</div>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('login'); });
    document.getElementById('auth-submit').addEventListener('click', handleSignup);
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
      <div class="field"><label for="auth-password">Password</label><input type="password" id="auth-password" placeholder="Password"></div>
      <div class="auth-error" id="auth-error"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Log in</button>
      <div class="auth-switch">New to Roost? <a href="#" id="auth-switch-link">Create an account</a></div>
      <div class="auth-switch"><a href="#" id="auth-forgot-link">Forgot password?</a></div>
    `;
    document.getElementById('auth-switch-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('signup'); });
    document.getElementById('auth-forgot-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthGate('forgot'); });
    document.getElementById('auth-submit').addEventListener('click', handleLogin);
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
    <div class="field"><label for="reset-password-input">New password</label><input type="password" id="reset-password-input" placeholder="At least 6 characters"></div>
    <div class="auth-error" id="auth-error"></div>
    <button class="primary" id="reset-submit-btn" style="width:100%;">Set new password</button>
  `;
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
  const emailField = document.getElementById('f-contact-value');
  if (emailField && !emailField.value && currentUser) emailField.value = currentUser.email;
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
  if (!currentUser) {
    area.innerHTML = `<button id="signin-btn">Sign in</button>`;
    document.getElementById('signin-btn').addEventListener('click', () => openAuthModal('login'));
    messagesTab.style.display = 'none';
    alertsBtn.style.display = 'none';
    myListingsTab.style.display = 'none';
    return;
  }
  area.innerHTML = `<button id="account-btn" class="greeting-btn">Hi, ${escapeHtml(currentUser.name)}${currentUser.verificationStatus === 'verified' ? verifiedBadgeHtml('inline') : ''}</button><button id="logout-btn">Log out</button>`;
  document.getElementById('account-btn').addEventListener('click', openAccountModal);
  document.getElementById('logout-btn').addEventListener('click', logout);
  messagesTab.style.display = 'inline-flex';
  alertsBtn.style.display = 'flex';
  myListingsTab.style.display = 'inline-flex';
  refreshUnreadBadge();
  refreshAlertsBadge();
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
        <div class="mod-meta">${escapeHtml(catInfo(l.category).label)} · ${escapeHtml(l.city)}, ${escapeHtml(l.state)} · ${l.free ? 'Free' : '$' + l.price}</div>
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
async function openStats() {
  document.getElementById('stats-overlay').classList.add('show');
  const body = document.getElementById('stats-body');
  body.innerHTML = 'Loading…';
  try {
    const s = await api('/stats');
    body.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${s.pageviews || 0}</div><div class="label">Page loads (all time)</div></div>
        <div class="stat-card"><div class="num">${s.listingviews || 0}</div><div class="label">Listing clicks / views</div></div>
        <div class="stat-card"><div class="num">${s.accounts || 0}</div><div class="label">Accounts created</div></div>
        <div class="stat-card"><div class="num">${s.listingsPosted || 0}</div><div class="label">Listings ever posted</div></div>
      </div>
      <div class="stats-grid" style="grid-template-columns:1fr;">
        <div class="stat-card"><div class="num">${s.reportedListings || 0}</div><div class="label">Listings reported at least once</div></div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:30px 10px;">${e.status === 403 ? 'Admin access required.' : 'Could not load stats.'}</div>`;
  }
}
document.getElementById('footer-stats').addEventListener('click', (e) => { e.preventDefault(); openStats(); });
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
    <p>We don't sell your personal information. You can request deletion of your listing and account at any time.</p>
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
    <p>Hawks, falcons, and owls may be listed only under Birds of Prey / Raptors, and only by a permitted falconer providing a valid falconry permit number at the time of posting.</p>
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
function showInlineCompose(listingId) {
  const wrap = document.getElementById('inline-compose-wrap');
  wrap.innerHTML = `
    <div class="compose-inline">
      <textarea id="inline-compose-text" rows="3" placeholder="Introduce yourself and ask about this bird…"></textarea>
      <div id="inline-compose-error" class="auth-error"></div>
      <button class="primary" id="inline-compose-send">Send message</button>
    </div>
  `;
  document.getElementById('inline-compose-send').addEventListener('click', async () => {
    const text = document.getElementById('inline-compose-text').value.trim();
    const errEl = document.getElementById('inline-compose-error');
    errEl.textContent = '';
    if (!text) { errEl.textContent = 'Write a message first.'; return; }
    const btn = document.getElementById('inline-compose-send');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await api('/listings/' + listingId + '/message', { method: 'POST', body: JSON.stringify({ body: text }) });
      wrap.innerHTML = `<div class="compose-inline"><p style="color:var(--muted);font-size:13px;margin:0;">Message sent. <a href="#" id="go-to-inbox" style="color:var(--primary-dark);font-weight:600;">View in Messages</a></p></div>`;
      document.getElementById('go-to-inbox').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('tab-messages').click(); });
      refreshUnreadBadge();
    } catch (e) {
      errEl.textContent = (e.data && e.data.error) || 'Could not send that message.';
      btn.disabled = false; btn.textContent = 'Send message';
    }
  });
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
        <div class="conv-thumb">${c.listingPhoto ? `<img src="${escapeAttr(c.listingPhoto)}" alt="">` : '🐦'}</div>
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

async function openThread(conversationId) {
  document.getElementById('conv-list-panel').style.display = 'none';
  document.getElementById('thread-panel').style.display = 'block';
  document.getElementById('thread-messages').innerHTML = 'Loading…';
  document.getElementById('thread-header').innerHTML = '';

  try {
    const data = await api('/conversations/' + conversationId + '/messages');
    const conv = data.conversation;

    const rateActionHtml = conv.canReview
      ? `<button class="secondary" id="rate-seller-btn" style="margin-top:8px;">★ Rate this seller</button>`
      : (conv.alreadyReviewed ? `<div class="rating-text" style="margin-top:8px;">✓ You reviewed this seller</div>` : '');

    document.getElementById('thread-header').innerHTML = `
      <div class="th-listing">${escapeHtml(conv.listing ? conv.listing.title : 'Listing')}</div>
      <div class="th-with">Conversation about this listing</div>
      ${rateActionHtml}
    `;
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
        return `<div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">${escapeHtml(m.body)}<div class="msg-time">${mine ? 'You' : escapeHtml(m.senderName)} · ${time}</div></div>`;
      }).join('');
    }
    msgsWrap.scrollTop = msgsWrap.scrollHeight;

    const sendBtn = document.getElementById('thread-send');
    const input = document.getElementById('thread-input');
    input.value = '';
    sendBtn.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
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
  document.getElementById('thread-panel').style.display = 'none';
  document.getElementById('conv-list-panel').style.display = 'block';
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
            <div class="smc-thumb">${l.photoUrl ? `<img src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
            <div class="smc-body">
              <div class="smc-title">${escapeHtml(l.title)}</div>
              <div class="smc-price">${l.free ? 'Free' : '$' + l.price}</div>
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
      return acc;
    }, { views: 0, conversations: 0, alerts: 0 });

    summaryEl.innerHTML = `
      <div class="stat-card"><div class="num">${listings.length}</div><div class="label">Active listings</div></div>
      <div class="stat-card"><div class="num">${totals.views}</div><div class="label">Total views</div></div>
      <div class="stat-card"><div class="num">${totals.conversations}</div><div class="label">Buyers messaged you</div></div>
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
      return `
      <div class="myl-item ${l.status === 'sold' ? 'myl-sold' : ''}" data-id="${l.id}">
        <div class="myl-thumb">${l.photoUrl ? `<img src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
        <div class="myl-info">
          <div class="myl-title">${statusBadge}${escapeHtml(l.title)} — ${l.free ? 'Free' : '$' + l.price}</div>
          <div class="myl-meta">Posted ${when} · ${escapeHtml(catInfo(l.category).label)}</div>
          <div class="myl-stats">
            <span class="myl-stat">${statIconSvg(EYE_PATH_1, 13)} ${l.viewCount} view${l.viewCount === 1 ? '' : 's'}</span>
            <span class="myl-stat">${statIconSvg(CHAT_ICON_PATH, 13)} ${l.conversationCount} buyer${l.conversationCount === 1 ? '' : 's'} messaged</span>
            <span class="myl-stat">${statIconSvg(BELL_ICON_PATH, 13)} ${l.alertMatches} alert${l.alertMatches === 1 ? '' : 's'} sent</span>
          </div>
        </div>
        <div class="myl-actions">
          <select class="myl-status-select" data-id="${l.id}">
            <option value="active" ${l.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="pending" ${l.status === 'pending' ? 'selected' : ''}>Pending (deposit)</option>
            <option value="sold" ${l.status === 'sold' ? 'selected' : ''}>Sold</option>
          </select>
          <button class="secondary myl-duplicate" data-id="${l.id}">Duplicate</button>
          <button class="secondary myl-delete" data-id="${l.id}" style="color:var(--rust-dark);border-color:var(--rust);">Delete</button>
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.myl-item').forEach(item => {
      item.addEventListener('click', () => openDetail(item.dataset.id));
    });
    listEl.querySelectorAll('.myl-status-select').forEach(select => {
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', () => updateListingStatus(select.dataset.id, select.value));
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

async function updateListingStatus(id, status) {
  try {
    await api('/listings/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
    const messages = { active: 'Marked as active.', pending: 'Marked as pending — still visible to buyers, flagged as a deal in progress.', sold: 'Marked as sold.' };
    showToast(messages[status] || 'Listing updated.');
    loadMyListings();
  } catch (e) {
    showToast((e.data && e.data.error) || 'Could not update that listing.');
  }
}


// Pre-fills the post form from an existing listing so relisting a similar
// bird (or a whole clutch, one at a time) takes seconds instead of retyping
// everything. Attestation checkboxes are deliberately left unchecked —
// re-confirming them each time is the point, not a formality to skip.
async function duplicateListing(id) {
  switchView('post');
  showToast('Loading listing details to duplicate…');
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
    document.getElementById('f-price').disabled = !!l.free;
    document.getElementById('f-trade').checked = !!l.openToTrade;
    document.getElementById('f-shipping').checked = !!l.shippingAvailable;
    document.getElementById('f-city').value = l.city || '';
    document.getElementById('f-state').value = l.state || '';
    document.getElementById('f-desc').value = l.description || '';
    document.getElementById('f-poster-name').value = l.posterName || (currentUser ? currentUser.name : '');
    document.getElementById('f-contact-method').value = l.contactMethod || 'Email';
    document.getElementById('f-contact-method').dispatchEvent(new Event('change'));
    document.getElementById('f-contact-value').value = l.contactValue || (currentUser ? currentUser.email : '');
    if (l.category === 'RAP' && l.permitNumber) document.getElementById('f-permit').value = l.permitNumber;

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
        <div class="notif-thumb">${n.listingPhoto ? `<img src="${escapeAttr(n.listingPhoto)}" alt="">` : '🐦'}</div>
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
  await renderVerificationSection();
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

let pendingVerifyDoc = null;

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

  pendingVerifyDoc = null;
  wrap.innerHTML = `
    ${rejectedNote}
    <div class="verify-form">
      <div class="field"><label for="verify-business-name">Breeder / business name</label><input type="text" id="verify-business-name" placeholder="e.g. Sacramento Valley Aviary" value="${escapeAttr(status.businessName || '')}"></div>
      <div class="field"><label for="verify-phone">Phone number</label><input type="text" id="verify-phone" placeholder="(555) 555-0100" value="${escapeAttr(status.phone || '')}"></div>
      <div class="field">
        <label>Supporting document (optional)</label>
        <div class="verify-doc-dropzone" id="verify-doc-dropzone">Click to upload a license, health certificate, or similar — helps applications get approved faster</div>
        <input type="file" id="verify-doc-file" accept="image/*" style="display:none;">
      </div>
      <div class="auth-error" id="verify-apply-error"></div>
      <button class="primary" id="verify-apply-submit" style="width:100%;">Submit for review</button>
    </div>
  `;

  const dropzone = document.getElementById('verify-doc-dropzone');
  const fileInput = document.getElementById('verify-doc-file');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const img = await readImageFile(file);
      pendingVerifyDoc = resizeImageToDataUrl(img, 900, 0.7);
      dropzone.innerHTML = `<img class="vi-doc" src="${pendingVerifyDoc}" alt="">`;
    } catch (e) {
      showToast('Could not process that image.');
    }
  });

  document.getElementById('verify-apply-submit').addEventListener('click', async () => {
    const err = document.getElementById('verify-apply-error');
    err.textContent = '';
    const businessName = document.getElementById('verify-business-name').value.trim();
    const phone = document.getElementById('verify-phone').value.trim();
    if (!businessName || !phone) { err.textContent = 'Business/breeder name and phone are both required.'; return; }

    const btn = document.getElementById('verify-apply-submit');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await api('/verification/apply', { method: 'POST', body: JSON.stringify({ businessName, phone, document: pendingVerifyDoc }) });
      showToast('Application submitted — we\'ll review it soon.');
      renderVerificationSection();
    } catch (e) {
      err.textContent = (e.data && e.data.error) || 'Could not submit your application.';
    } finally {
      btn.disabled = false; btn.textContent = 'Submit for review';
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
  try {
    const data = await api('/listings/sold');
    const sold = data.listings || [];
    if (sold.length === 0) { section.style.display = 'none'; return; }
    strip.innerHTML = sold.map(l => {
      const c = catInfo(l.category);
      return `
      <a class="rs-card" href="/listing/${l.id}" data-id="${l.id}">
        <div class="rs-thumb">${l.photoUrl ? `<img src="${escapeAttr(l.photoUrl)}" alt="">` : c.icon}</div>
        <div class="rs-body">
          <div class="rs-name">${escapeHtml(l.title)}</div>
          <div class="rs-price">${l.free ? 'Free' : '$' + l.price}</div>
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

renderChips();
populateCategorySelect();
renderPhotoGrid();
routeFromLocation();
loadRecentlySold();
refreshCurrentUser().then(handleVerifyRedirect);
handleResetTokenRedirect();
api('/stats/pageview', { method: 'POST' }).catch(() => {});
