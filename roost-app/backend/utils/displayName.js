// Shows only the first name publicly, wherever someone's name appears on a
// page anyone can view (a listing's seller info, a public seller profile,
// a review's author). This is applied at the point of building the API
// response — the full name never even reaches the browser — rather than
// truncating it client-side, which could be bypassed just by looking at
// the raw network response.
function publicDisplayName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0];
}

module.exports = { publicDisplayName };
