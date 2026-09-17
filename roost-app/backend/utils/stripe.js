const Stripe = require('stripe');

const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
const stripe = stripeConfigured ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

module.exports = { stripe, stripeConfigured };
