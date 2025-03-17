const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const User = require('../models/User')
const Subscription = require('../models/Subscription')

const stripeWebhooks = async (req, res, next) => {
    const sig = req.headers['stripe-signature']

    let event

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET,
        )
    } catch (err) {
        console.log(err)
        return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object
            await handleCheckoutSessionCompleted(session.id)
            break
        case 'customer.subscription.updated':
            const subscriptionUpdated = event.data.object
            await handleSubscriptionUpdated(subscriptionUpdated)
            break
        case 'customer.subscription.deleted':
            const subscriptionDeleted = event.data.object
            await handleSubscriptionDeleted(subscriptionDeleted)
            break
        // Add more cases as needed
        default:
            return
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true })
}

async function handleCheckoutSessionCompleted(sessionId) {
    try {
        // Retrieve the session
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        const userId = session.metadata.userId

        // Retrieve the subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(
            session.subscription,
        )

        // Define variables for trial status
        let isTrial = false
        let trialStart = null
        let trialEnd = null

        if (session.metadata.isVerificationFee === 'true') {
            isTrial = true
            trialStart = new Date()
            trialEnd = new Date(subscription.current_period_end * 1000)
        }

        let subs = await Subscription.create({
            stripeSubscriptionId: subscription.id,
            user: userId,
            planId: subscription.items.data[0].plan.id,
            amount: subscription.items.data[0].plan.amount,
            currentPeriodStart: new Date(
                subscription.current_period_start * 1000,
            ),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            planInterval: subscription.items.data[0].plan.interval,
            paymentStatus: isTrial ? 'trial' : 'paid',
            status: subscription.status,
            isTrial: isTrial,
            trialStart: trialStart,
            trialEnd: trialEnd,
            upgradedFromTrial: false,
        })

        // Update the User with subscription details
        await User.findByIdAndUpdate(userId, {
            proAccount: true,
            userSubscription: subs._id,
            planSelected: true,
            unConverted: false,
        })
    } catch (error) {
        console.error(`Error in post-payment processing: ${error.message}`)
    }
}

async function handleSubscriptionUpdated(updatedSubscription) {
    try {
        await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: updatedSubscription.id },
            {
                amount: updatedSubscription.items.data[0].plan.amount,
                currentPeriodStart: new Date(
                    updatedSubscription.current_period_start * 1000,
                ),
                currentPeriodEnd: new Date(
                    updatedSubscription.current_period_end * 1000,
                ),
                planInterval: updatedSubscription.items.data[0].plan.interval,
                status: updatedSubscription.status,
                proCancelled: updatedSubscription.cancel_at_period_end,
            },
        )

    } catch (error) {
        console.error(`Error updating subscription: ${error.message}`)
    }
}

// Function to handle subscription deletions
async function handleSubscriptionDeleted(subscription) {
    try {
        const subs = await Subscription.findOne({
            stripeSubscriptionId: subscription.id,
        })
        if (subs) {
            // Determine if the subscription was in trial or paid state
            if (subs.isTrial) {
                await Subscription.findByIdAndUpdate(subs._id, {
                    trialCancelled: true,
                })
            } else {
                await Subscription.findByIdAndUpdate(subs._id, {
                    proCancelled: true,
                })
            }

            // Optionally, update the user record to reflect the subscription cancellation
            await User.findByIdAndUpdate(subs.user, { proAccount: false })
        }
    } catch (error) {
        console.error(`Error deleting subscription: ${error.message}`)
    }
}

module.exports = { stripeWebhooks }
