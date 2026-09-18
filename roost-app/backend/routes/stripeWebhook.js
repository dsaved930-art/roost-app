const { stripe, stripeConfigured } = require('../utils/stripe');
const { activateBoost } = require('../services/boost');
const { BOOST_PRICE_CENTS } = require('../config/boost');

// The safety net for the one real gap in the success-page confirm flow: if
// someone's browser closes or loses connection between paying and landing
// back on success_url, /boost/confirm never runs and the boost never
// activates — even though Stripe was paid. Stripe calls this endpoint
// server-to-server regardless of what the buyer's browser does, so it's
// the backstop that makes sure a real payment always eventually activates
// its boost. activateBoost's own idempotency check means it doesn't matter
// which of this or /boost/confirm gets there first.
//
// Needs raw (unparsed) body to verify Stripe's signature, so this route is
// registered in server.js with express.raw(), before the app-wide
// express.json() middleware — by the time this file's handler runs, req.body
// is a Buffer, not a parsed object.
module.exports = async function stripeWebhookHandler(req, res) {
  if (!stripeConfigured) return res.status(503).send('Stripe is not configured.');

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set — ignoring.');
    return res.status(500).send('Webhook secret not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e.message);
    return res.status(400).send('Invalid signature.');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const listingId = session.metadata && session.metadata.listingId;
    if (session.payment_status === 'paid' && listingId) {
      try {
        await activateBoost(listingId, session.id, BOOST_PRICE_CENTS);
      } catch (e) {
        console.error('Webhook boost activation failed:', e);
        // Still 200 — telling Stripe to retry won't fix a bug on our end,
        // it'll just retry into the same error repeatedly.
      }
    }
  }

  res.json({ received: true });
};
