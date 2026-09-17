// Toggle this back to false once ready to actually charge for boosts —
// while true, boosting skips Stripe entirely and activates immediately, for
// free, for anyone. Read by both routes/listings.js (to skip payment) and
// server.js (to tell the frontend so it can show honest "free" copy instead
// of a price it isn't actually charging).
const BOOST_FREE_TRIAL = true;

module.exports = { BOOST_FREE_TRIAL };
