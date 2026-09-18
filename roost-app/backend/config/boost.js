// Toggle this back to false once ready to actually charge for boosts —
// while true, boosting skips Stripe entirely and activates immediately, for
// free, for anyone. Read by both routes/listings.js (to skip payment) and
// server.js (to tell the frontend so it can show honest "free" copy instead
// of a price it isn't actually charging).
const BOOST_FREE_TRIAL = true;

// v1 is deliberately a single flat tier — simplest thing to actually test
// whether sellers want this at all before building out multiple durations.
const BOOST_PRICE_CENTS = 499; // $4.99
const BOOST_DURATION_DAYS = 3;

// How long a checkout attempt "claims" a listing before the claim expires on
// its own — closes the double-click/two-tabs race without needing an
// explicit cancel callback. Also used as the Stripe Checkout session's own
// expiry, so both time out together (30 minutes is Stripe's minimum allowed).
const BOOST_CHECKOUT_LOCK_MINUTES = 30;

module.exports = { BOOST_FREE_TRIAL, BOOST_PRICE_CENTS, BOOST_DURATION_DAYS, BOOST_CHECKOUT_LOCK_MINUTES };
