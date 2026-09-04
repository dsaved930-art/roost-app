// Blocks links in chat messages — a common vector for directing someone to
// a phishing page or an off-platform payment request outside of Roost's
// own (increasingly scam-aware) messaging system. Deliberately requires an
// explicit protocol/www prefix OR a real common top-level domain, rather
// than just "any two words with a period between them" — tested directly
// against realistic bird-marketplace messages (ages like "3.5 months",
// prices, ordinary sentences with periods) to confirm none of those
// false-positive as a blocked link.
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(com|net|org|io|co|info|biz|us|shop|site|me|app)\b/i;

function containsUrl(text) {
  return URL_PATTERN.test(String(text || ''));
}

module.exports = { containsUrl };
