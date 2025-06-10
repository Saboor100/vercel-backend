const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const auth = require('../middleware/auth');
const UserModel = require('../models/User');
const admin = require('firebase-admin');
const router = express.Router();

// Define the product and price IDs for each plan
const PRODUCT_PRICES = {
  basic: {
    USD: process.env.BASIC_PRICE_ID_USD || 'price_1RUS6HDVCSEfpcepZDs2iHef',
    EUR: process.env.BASIC_PRICE_ID_EUR || 'price_1RUS7iDVCSEfpcepcRk1H7gL',
  },
  pro: {
    USD: process.env.PRO_PRICE_ID_USD || 'price_1ROvRQDVCSEfpcep3hk2S3aA',
    EUR: process.env.PRO_PRICE_ID_EUR || 'price_1RUS78DVCSEfpcepsHVp2ZrN',
  },
};

// GET /api/payment/plans - Fetch available subscription plans
router.get('/plans', async (req, res) => {
  try {
    // Get currency from query, default to 'USD'
    const currency = (req.query.currency || 'USD').toUpperCase();
    const plans = {};

    for (const plan of Object.keys(PRODUCT_PRICES)) {
      const priceId = PRODUCT_PRICES[plan][currency];
      if (!priceId) continue; // skip if priceId for that currency is not defined

      try {
        const price = await stripe.prices.retrieve(priceId);
        plans[plan] = {
          id: price.id,
          name: plan.charAt(0).toUpperCase() + plan.slice(1),
          amount: price.unit_amount,
          currency: price.currency,
        };
      } catch (err) {
        console.error(`Error fetching price for ${plan} (${currency}):`, err);
      }
    }

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
    });
  }
});

// POST /api/payment/checkout
router.post('/checkout', auth, async (req, res) => {
  try {
    const { plan, currency = 'USD' } = req.body;
    const normalizedCurrency = currency.toUpperCase();
    const userId = req.user.id;
    const email = req.user.email;

    // Validate plan
    if (!['basic', 'pro'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan',
      });
    }

    // Validate currency and get price ID
    const priceId = PRODUCT_PRICES[plan][normalizedCurrency];
    if (!priceId) {
      return res.status(404).json({
        success: false,
        message: `Price ID not found for plan: ${plan} and currency: ${normalizedCurrency}`,
      });
    }

    // Fetch user
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Robust Stripe Customer Handling
    let stripeCustomerId = user.stripeCustomerId;

    // Ensure the customer exists in Stripe
    if (stripeCustomerId) {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (err) {
        if (err && err.code === 'resource_missing') {
          // Customer doesn't exist, clear and recreate
          stripeCustomerId = null;
          await UserModel.update(userId, { stripeCustomerId: null });
        } else {
          throw err; // propagate other errors
        }
      }
    }

    // Create new customer if needed
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await UserModel.update(userId, { stripeCustomerId });
      console.log(`Created new Stripe customer for user ${userId}: ${stripeCustomerId}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
      metadata: {
        userId,
        plan,
        email: user.email,
        displayName: user.displayName || user.name || '', // depending on your User model
      },
    });

    res.json({
      success: true,
      data: { url: session.url },
    });
  } catch (error) {
    console.error('Stripe checkout error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
    });
  }
});

// POST /api/payment/webhook
router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log(`Checkout session completed for user ${session.metadata?.userId}`);
      const { userId, plan, email, displayName } = session.metadata;

      // Send POST to Make.com
      await fetch('https://hook.us2.make.com/0p2e2f7l60nakt13hfwjch26q1jq8cj7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'subscription',
          email: email,
          plan: plan,
          displayName: displayName,
          subscribedAt: new Date().toISOString()
        })
      });
      try {
        if (session.metadata?.userId && session.metadata?.plan) {
          // ✅ FIX: Always write an object for subscription!
          await UserModel.update(session.metadata.userId, {
            subscription: {
              id: session.id,
              status: 'active',
              plan: session.metadata.plan,
              cancel_at_period_end: false
            }
          });
          console.log(`User ${session.metadata.userId} subscription updated to ${session.metadata.plan}`);
        }
      } catch (err) {
        console.error('Failed to update user subscription:', err);
      }
      break;
    }

    case 'customer.subscription.created': {
      const subscription = event.data.object;
      console.log(`Subscription created for customer ${subscription.customer}`);
      const session = event.data.object;
      const product = {
        name: session.metadata?.plan
      };

      // Create subscription data in the required format
      const subscriptionData = {
        id: session.id,
        status: 'active',
        plan: product.name,
        cancel_at_period_end: false
      };
      // Update user's subscription status in your DB
      try {
        const userId = subscription.metadata?.userId; // You should add metadata to the subscription if possible
        if (userId) {
          await UserModel.update(userId, {
            subscription: subscriptionData
          });
          console.log(`User ${userId} subscription activated.`);
        }
      } catch (err) {
        console.error('Error saving new subscription:', err);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      console.log(`Subscription updated for customer ${subscription.customer}`);

      try {
        const userId = subscription.metadata?.userId;
        if (userId) {
          await UserModel.update(userId, {
            subscriptionStatus: subscription.status,
          });
          console.log(`User ${userId} subscription status updated to ${subscription.status}`);
        }
      } catch (err) {
        console.error('Error updating subscription status:', err);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer;

      console.log(`Subscription cancelled for customer ${stripeCustomerId}`);

      try {
        // 🔍 Search the user by stripeCustomerId in Firebase Realtime Database
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef
          .orderByChild('stripeCustomerId')
          .equalTo(stripeCustomerId)
          .once('value');

        const users = snapshot.val();
        if (!users) throw new Error('User not found with this stripeCustomerId');

        // Firebase returns an object, get the first key
        const userId = Object.keys(users)[0];
        const user = users[userId];
        const { email, displayName, subscription: plan } = user;

        // 📤 Send webhook to Make
        await fetch('https://hook.us2.make.com/0p2e2f7l60nakt13hfwjch26q1jq8cj7', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'cancellation',
            email,
            displayName,
            plan,
            stripeCustomerId,
            cancelledAt: new Date().toISOString()
          })
        });

        // Cancel subscription in DB
        await UserModel.update(userId, {
          subscription: {
            plan: 'free',
            status: 'canceled',
            endsAt: null
          }
        });

        console.log(`User ${userId} subscription marked as cancelled`);
      } catch (err) {
        console.error('Error handling subscription cancellation:', err);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log(`PaymentIntent succeeded for customer ${paymentIntent.customer}`);
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({ received: true });
});

// GET /api/payment/verify
router.get('/verify', auth, async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check if payment was successful
    if (session.payment_status === 'paid') {
      // Update user subscription status
      try {
        if (session.metadata.userId && session.metadata.plan) {
          // Get the product details
          const product = {
            name: session.metadata.plan
          };

          // Create subscription data in the required format
          const subscriptionData = {
            id: session.id,
            status: 'active',
            plan: product.name,
            cancel_at_period_end: false
          };

          await UserModel.update(session.metadata.userId, {
            subscription: subscriptionData
          });
          console.log(`User ${session.metadata.userId} subscription verified and updated to ${session.metadata.plan}`);
        }
      } catch (error) {
        console.error('Error updating user subscription during verification:', error);
      }

      return res.json({
        success: true,
        data: {
          paid: true,
          plan: session.metadata.plan
        }
      });
    }

    return res.json({
      success: true,
      data: {
        paid: false
      }
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
});

// POST /api/payment/unsubscribe
router.post('/unsubscribe', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Retrieve the user from Firebase
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    const user = snapshot.val();

    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found for this user'
      });
    }

    // Fetch active Stripe subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found for this user on Stripe'
      });
    }

    const subscriptionId = subscriptions.data[0].id;

    // Immediately cancel the subscription
    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);

    // Update Firebase Realtime DB
    await userRef.update({
      subscription: {
        plan: 'free',
        status: 'canceled',
        endsAt: null
      }
    });

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      stripeStatus: canceledSubscription.status
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

module.exports = router;