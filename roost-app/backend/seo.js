const fs = require('fs');
const path = require('path');
const pool = require('./db');

const frontendDir = path.join(__dirname, 'public');
const indexPath = path.join(frontendDir, 'index.html');

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function escAttr(s) { return esc(s); }

function publicUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

const CATEGORY_LABELS = {
  FIN: 'Finches & canaries', PAR: 'Parrots', POU: 'Poultry & gamebirds',
  DOV: 'Pigeons & doves', WTF: 'Waterfowl', RAP: 'Birds of prey / raptors', OTH: 'Other'
};

// Builds the same visual markup the client renders (see buildListingPageHtml
// in app.js) so there's no flash-of-different-content once JS takes over —
// this version just has no interactive buttons, since a crawler doesn't need them.
function staticListingHtml(l) {
  const categoryLabel = CATEGORY_LABELS[l.category] || l.category;
  const photo = l.photo_full || l.photo_thumb;
  const priceText = l.free ? 'Free to a good home' : `$${l.price}`;
  return `
    <div class="lp-band">${esc(categoryLabel)}</div>
    <h1>${esc(l.title)}</h1>
    <div class="lp-meta">${esc(l.breed)} · ${esc(l.age || 'age n/a')} ${l.sex ? '· ' + esc(l.sex) : ''} · ${esc(l.city)}, ${esc(l.state)}</div>
    <div class="lp-photo">
      ${(Date.now() - new Date(l.created_at).getTime()) < 24 * 60 * 60 * 1000 ? '<div class="just-listed-badge">Just listed</div>' : ''}
      ${photo ? `<img src="${escAttr(photo)}" alt="${escAttr(l.title)}">` : ''}
    </div>
    <div class="lp-price">${l.sold ? '<span class="sold-badge">SOLD</span> ' : ''}${priceText}${l.open_to_trade ? ' · Open to trade' : ''}</div>
    <div class="lp-desc">${esc(l.description)}</div>
  `;
}

async function renderListingPage(req, res) {
  const id = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404);
      return res.sendFile(indexPath);
    }
    const l = result.rows[0];
    const template = fs.readFileSync(indexPath, 'utf8');

    const photosResult = await pool.query(
      'SELECT photo_full AS "full" FROM listing_photos WHERE listing_id = $1 ORDER BY position ASC',
      [l.id]
    );
    const allImages = photosResult.rows.length > 0
      ? photosResult.rows.map(r => r.full)
      : (l.photo_full || l.photo_thumb ? [l.photo_full || l.photo_thumb] : []);

    const title = `${esc(l.title)} — Roost`;
    const description = esc((l.description || '').slice(0, 155)) + (l.description && l.description.length > 155 ? '…' : '');
    const image = l.photo_full || l.photo_thumb || ''; // cover photo — correct choice for link-preview OG image
    const url = `${publicUrl()}/listing/${l.id}`;
    const priceForMeta = l.free ? '0' : String(l.price);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: l.title,
      description: l.description,
      category: CATEGORY_LABELS[l.category] || l.category,
      offers: {
        '@type': 'Offer',
        price: priceForMeta,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url
      }
    };
    if (allImages.length > 0) jsonLd.image = allImages;

    const headInjection = `
    <meta name="description" content="${description}">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="product">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${url}">
    ${image ? `<meta property="og:image" content="${image}">` : ''}
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>`;

    let html = template
      .replace('<title>Roost — a place for birds to land</title>', `<title>${title}</title>`)
      .replace('</head>', headInjection)
      .replace('<!--LISTING_SSR_CONTENT-->', staticListingHtml(l))
      // Make the listing view visible immediately in the raw HTML (not just after JS runs),
      // so crawlers and link-preview bots that don't fully execute JS still see real content.
      .replace('id="view-browse">', 'id="view-browse" style="display:none;">')
      .replace('id="view-listing" style="display:none;"', 'id="view-listing"');

    res.send(html);
  } catch (e) {
    console.error('SSR listing page error:', e);
    res.sendFile(indexPath);
  }
}

async function renderSitemap(req, res) {
  try {
    const result = await pool.query('SELECT id, created_at FROM listings ORDER BY created_at DESC LIMIT 50000');
    const base = publicUrl();
    const urls = result.rows.map(l =>
      `<url><loc>${base}/listing/${l.id}</loc><lastmod>${new Date(l.created_at).toISOString()}</lastmod></url>`
    ).join('');
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url>${urls}</urlset>`);
  } catch (e) {
    console.error('Sitemap error:', e);
    res.status(500).send('');
  }
}

function renderRobots(req, res) {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${publicUrl()}/sitemap.xml\n`);
}

module.exports = { renderListingPage, renderSitemap, renderRobots };
