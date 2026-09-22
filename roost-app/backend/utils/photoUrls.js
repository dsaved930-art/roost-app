// Lists of listings (browse, recently sold, saved, my listings, inbox, notifications, profiles) used to
// embed every listing's whole thumbnail as base64 text inside the JSON. With ~100 listings that made the
// browse request about 8.7 MB and took several seconds, which on a phone meant a long blank wait before
// a single bird appeared.
//
// Now those lists carry a small image link instead, and the browser fetches (and caches) each photo
// separately through GET /api/listings/:id/thumb. Only the "is there a photo?" question is asked of the
// database column, which doesn't require reading the image itself.
//
// Returns a SQL expression, e.g. thumbUrlSql('l.id', 'l.photo_thumb').
function thumbUrlSql(idExpr, thumbExpr) {
  return `(CASE WHEN ${thumbExpr} IS NOT NULL THEN '/api/listings/' || ${idExpr} || '/thumb' ELSE NULL END)`;
}

module.exports = { thumbUrlSql };
