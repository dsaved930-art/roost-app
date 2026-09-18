// Toggle this back to false once ready to actually charge for boosts —
// while true, boosting skips Stripe entirely and activates immediately, for
// free, for anyone. Read by both routes/listings.js (to skip payment) and
// server.js (to tell the frontend so it can show honest "free" copy instead
// of a price it isn't actually charging).
const BOOST_FREE_TRIAL = true;

// v1 is deliberately a single flat tier — simplest thing to actually test
// whether sellers want this at all before building out multiple durations
// or Tinder-style bundle pricing (buy 3, buy 5) — that's worth revisiting
// once people are actually re-boosting on their own, not before.
const BOOST_PRICE_CENTS = 499; // $4.99
// Short on purpose: a fast results loop (see it, then decide to boost again)
// matters more at this stage than a long placement window that might just
// sit there quietly not doing much. Reconsider once real usage data shows
// whether a day is long enough to catch real visits at current traffic.
const BOOST_DURATION_HOURS = 24;

// How long a checkout attempt "claims" a listing before the claim expires on
// its own — closes the double-click/two-tabs race without needing an
// explicit cancel callback. Also used as the Stripe Checkout session's own
// expiry, so both time out together (30 minutes is Stripe's minimum allowed).
const BOOST_CHECKOUT_LOCK_MINUTES = 30;

module.exports = { BOOST_FREE_TRIAL, BOOST_PRICE_CENTS, BOOST_DURATION_HOURS, BOOST_CHECKOUT_LOCK_MINUTES };
