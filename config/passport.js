const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../models/User')

module.exports = function (passport) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`,
            },
            async (accessToken, refreshToken, profile, done) => {
                // Check if user already exists in the database

                const existingUser = await User.findOne({
                    email: profile.emails[0].value,
                })

                if (existingUser) {
                    if (existingUser.fromFirebase) {
                        existingUser.fromFirebase = false
                    }
                    existingUser.googleId = profile.id
                    existingUser.displayName = profile.displayName
                    existingUser.photoURL = profile.photos[0].value

                    const token = existingUser.getSignedJwtToken()

                    await existingUser.save()

                    done(null, { user: existingUser, token })
                } else {
                    const newUser = new User({
                        googleId: profile.id,
                        displayName: profile.displayName,
                        email: profile.emails[0].value,
                        photoURL: profile.photos[0].value,
                    })

                    await newUser.save()

                    const token = existingUser.getSignedJwtToken()

                    done(null, { user: newUser, token })
                }
            },
        ),
    )
}
