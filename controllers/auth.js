const User = require('../models/User')
const ErrorResponse = require('../utils/errorResponse')
const asyncHandler = require('../middleware/async')
const axios = require('axios')
const elasticEmail = require('elasticemail')
const sendEmail = require('../utils/sendEmail')
const crypto = require('crypto')
const { OAuth2Client } = require('google-auth-library')
const { jwt } = require('jsonwebtoken')
const { schedulerRedisClient } = require('../scheduler');
const firebase = require('firebase')
const { error } = require('console')

const Swipe = require('../models/Swipe')
const Chat = require('../models/Chat')
const Message = require('../models/Message')
const Transaction = require('../models/Transaction')
const Notification = require('../models/Notification')
const Block = require('../models/Block')

exports.register = asyncHandler(async (req, res, next) => {
    const { email, password, coordinates, fcm } = req.body

    // Validate email and password presence
    if (!email || !password) {
        return next(
            new ErrorResponse('Please provide an email and password.', 400)
        )
    }

    // Normalize email to prevent case-sensitive registration issues
    const normalizedEmail = email.toLowerCase().trim()

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail })

    if (existingUser && !existingUser.isEmailVerified) {
        email_sending(existingUser.fullName, existingUser.email, existingUser)
        return res.status(200).json({
            success: false,
            user: {
                id: existingUser._id,
                fullName: existingUser.fullName,
                email: existingUser.email,
                role: existingUser.role,
                isEmailVerified: existingUser.isEmailVerified,
                onboardingCompleted: existingUser.onboardingCompleted,
                generalInfoCompleted: existingUser.generalInfoCompleted,
                locationCoordinates: {
                    type: 'Point',
                    coordinates: req.body.coordinates
                }
            },
            message: 'Email not verified. Verification email sent.'
        })
    }

    if (existingUser && existingUser.isEmailVerified) {
        return next(new ErrorResponse('User Already exists.', 400))
    }

    // Create user
    const user = await User.create({
        email: normalizedEmail,
        password,
        locationCoordinates: {
            type: 'Point',
            coordinates: coordinates,
            fcm
        }
    })

    // Send email to new user (Consider sending asynchronously)
    email_sending(user.fullName, user.email, user)

    // Return success response
    res.status(201).json({
        success: true,
        message: 'User registered successfully.'
    })
})

exports.registerAdmin = asyncHandler(async (req, res, next) => {
    const { name, email, password } = req.body

    if (!name) {
        return next(new ErrorResponse('Please provide a full name.', 400))
    }

    // Validate email and password presence
    if (!email || !password) {
        return next(
            new ErrorResponse('Please provide an email and password.', 400)
        )
    }

    // Normalize email to prevent case-sensitive registration issues
    const normalizedEmail = email.toLowerCase().trim()

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail })
    if (existingUser) {
        return next(new ErrorResponse('User already exists.', 400))
    }

    // Create user

    const user = await User.create({
        email: normalizedEmail,
        password,
        role: 'admin',
        fullName: name,
        isEmailVerified: true
    })

    sendTokenResponse(user, 200, res)
})

// @desc      Login user
// @route     POST /api/v1/auth/login
// @access    Public

exports.login = asyncHandler(async (req, res, next) => {
    console.log(req.body)
    // const { email, password, fcm } = req.body
    const { email, password, fcm, coordinates } = req.body
    // Validate email and password presence
    if (!email || !password) {
        return next(
            new ErrorResponse('Please provide an email and password.', 400)
        )
    }

    // Normalize email to prevent case-sensitive issues and trim spaces
    const normalizedEmail = email.toLowerCase().trim()

    // Attempt to find user by email
    const user = await User.findOne({ email: normalizedEmail }).select(
        '+password isEmailVerified fullName email generalInfoCompleted accountStatus onboardingCompleted role travelMode'
    )

    if (!user) {
        // Delay response to mitigate timing attacks (user enumeration)
        // await new Promise((resolve) => setTimeout(resolve, 1000))
        // return next(new ErrorResponse('Invalid credentials.', 401))
        console.log('Yeah')
        // Create user
        const user = await User.create({
            email: normalizedEmail,
            password,
            locationCoordinates: {
                type: 'Point',
                coordinates: coordinates,
                fcm
            }
        })
        // Send email to new user (Consider sending asynchronously)
        email_sending(user.fullName, user.email, user)
        return res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            user: user
        })
    }

    // Check if the provided password matches the stored hash
    const isMatch = await user.matchPassword(password)
    // const isMatch = true;
    if (!isMatch) {
        // Delay response to mitigate timing attacks
        await new Promise((resolve) => setTimeout(resolve, 1000))
        // return next(new ErrorResponse('Invalid credentials.', 401))
        return next(new ErrorResponse('The password you entered is incorrect. Please try again.', 401))
    }

    let updateData = {
        fcm
    }

    if (user.role == 'user' && !user.travelMode.toggle) {
        // Only add locationCoordinates to updateData if coordinates are provided
        if (req.body.coordinates) {
            updateData.locationCoordinates = {
                type: 'Point',
                coordinates: req.body.coordinates
            }
        }
    }

    let finalData = await User.findByIdAndUpdate(user.id, updateData, {
        new: true
    })

    // Send token response if credentials are valid
    sendTokenResponse(finalData, 200, res)
})

exports.appleSignIn = async (req, res) => {
    const { email, fullName, user, fcm, coordinates } = req.body

    try {
        // Decode the identity token to get user information

        // Find the user by Apple user ID (appleId) first
        let existingUser = await User.findOne({ appleId: user })

        if (!existingUser) {
            // If email is provided, try to find the user by email
            if (email) {
                existingUser = await User.findOne({ email })
            }

            // If user still does not exist, create a new user
            if (!existingUser) {
                const newUser = new User({
                    email: email || null,
                    fullName: fullName
                        ? `${fullName.givenName} ${fullName.familyName}`
                        : null,
                    appleId: user,
                    accountType: 'apple',
                    isEmailVerified: true,
                    role: 'user'
                })

                await newUser.save()
                existingUser = newUser
            } else {
                // If user exists by email, update with Apple ID
                existingUser.appleId = user
                await existingUser.save()
            }
        }

        let updateData = {
            fcm
        }

        // Check the user's role and travel mode, and update FCM token and location coordinates if necessary
        if (existingUser.role === 'user' && !existingUser.travelMode.toggle) {
            // Only add locationCoordinates to updateData if coordinates are provided
            if (coordinates) {
                updateData.locationCoordinates = {
                    type: 'Point',
                    coordinates: coordinates
                }
            }

            existingUser = await User.findByIdAndUpdate(
                existingUser.id,
                updateData,
                {
                    new: true
                }
            )
        }

        // Send token response
        sendTokenResponse(existingUser, 200, res)
    } catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: 'Server Error' })
    }
}

exports.googleSignIn = async (req, res) => {
    const { email, name, id, fcm, coordinates } = req.body

    try {
        // Find the user by Google ID (googleId) first
        let existingUser = await User.findOne({ googleId: id })

        if (!existingUser) {
            // If email is provided, try to find the user by email
            if (email) {
                existingUser = await User.findOne({ email })
            }

            // If user still does not exist, create a new user
            if (!existingUser) {
                const newUser = new User({
                    email: email || null,
                    fullName: name || null,
                    googleId: id,
                    accountType: 'google',
                    isEmailVerified: true,
                    role: 'user'
                })

                await newUser.save()
                existingUser = newUser
            } else {
                // If user exists by email, update with Google ID
                existingUser.googleId = id
                await existingUser.save()
            }
        }

        let updateData = {
            fcm
        }

        // Check the user's role and travel mode, and update FCM token and location coordinates if necessary
        if (existingUser.role === 'user' && !existingUser.travelMode.toggle) {
            // Only add locationCoordinates to updateData if coordinates are provided
            if (coordinates) {
                updateData.locationCoordinates = {
                    type: 'Point',
                    coordinates: coordinates
                }
            }

            existingUser = await User.findByIdAndUpdate(
                existingUser.id,
                updateData,
                {
                    new: true
                }
            )
        }

        // Send token response
        sendTokenResponse(existingUser, 200, res)
    } catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: 'Server Error' })
    }
}

exports.getMe = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id)

    res.status(200).json({
        success: true,
        data: user
    })
})

// @desc      Update password
// @route     PUT /api/v1/auth/update-password
// @access    Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+password')

    if (!req.body.currentPassword || !req.body.newPassword) {
        return next(
            new ErrorResponse(
                'Please provide current password and new password',
                400
            )
        )
    }

    // Check current password
    if (!(await user.matchPassword(req.body.currentPassword))) {
        return next(new ErrorResponse('Password is incorrect', 401))
    }

    user.password = req.body.newPassword
    await user.save()

    res.status(200).json({
        success: true
    })
})

// @desc      Forgot password
// @route     POST /api/v1/auth/forgotpassword
// @access    Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email })

    if (!user) {
        return res
            .status(404)
            .json({ success: false, error: 'No User found with this email' })
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken()

    user.resetPasswordToken = resetToken
    user.resetPasswordExpire = Date.now() + 20 * 60 * 1000 // 10 minutes

    await user.save({ validateBeforeSave: false })

    const message = `Hello User,

We received a request to reset the password for your Spoused account. If you requested this password reset, please use the following code to proceed with the password reset process:

Reset Password Code: ${resetToken}

Please enter this code in the appropriate field in the password reset form. If you did not request this password reset, please ignore this email or contact us immediately at contact@getspoused.com if you suspect any suspicious activity. Your security is our top priority.

When creating a new password, we recommend using a strong, unique password that includes a combination of letters, numbers, and special characters.

Thank you for using GetSpoused.

Best Regards,
Spoused Team`

    try {
        // Call your custom sendEmail function
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Request for Your Spoused Account',
            message
        })

        return res.status(200).json({ success: true })
    } catch (err) {
        console.error(err)
        user.resetPasswordToken = undefined
        user.resetPasswordExpire = undefined

        await user.save({ validateBeforeSave: false })

        return res
            .status(500)
            .json({ success: false, error: 'Email could not be sent' })
    }
})

// @desc      Reset password
// @route     PUT /api/v1/auth/resetpassword/:resettoken
// @access    Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
    // Get hashed token
    const resetPasswordToken = req.body.resettoken

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
    })

    if (!user) {
        return res
            .status(400)
            .json({ success: false, error: 'Invalid code. Please check the code and try again.' })
    }

    res.status(200).json({ success: true })

    // Set new password
    // user.password = req.body.password
    // user.resetPasswordToken = undefined
    // user.resetPasswordExpire = undefined
    // await user.save()
})

exports.newPassword = asyncHandler(async (req, res, next) => {
    const resetPasswordToken = req.body.resettoken

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
    })

    if (!user) {
        return res
            .status(400)
            .json({ success: false, error: 'Invalid or expired token' })
    }

    user.password = req.body.password
    user.resetPasswordToken = undefined
    user.resetPasswordExpire = undefined
    await user.save()

    res.status(200).json({ success: true })
})

const email_sending = async (fulllName, email, user) => {
    try {
        // Get reset token
        const resetToken = user.generateEmailVerificationToken()
        console.log('this is the request token')
        console.log(resetToken)

        console.log('this is the request token')
        // Create reset URL
        const message = `Dear User,
    
    Welcome to Spoused! We’re excited to have you on board.

To complete your registration and activate your account, please verify your email address by entering the following code in the app:

Verification Code: ${resetToken}

Please note that this code will expire in 24 hours. If you did not request this sign-up, please disregard this email.

Best regards,

Spoused Team`

        // Call your custom sendEmail function
        await sendEmail({
            email: email,
            subject: 'Email Verification Request for Your Spoused Account',
            message
        })

        // Update user data
        user.emailVerificationToken = resetToken
        user.resetEmailExpire = Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now
        await user.save({ validateBeforeSave: false })

        return true
    } catch (err) {
        console.error(err)
        // Handle error
        return false
    }
}

// Email verification controller
exports.verifyEmail = async (req, res) => {
    const { token, email } = req.body

    try {
        const user = await User.findOne({
            emailVerificationToken: token,
            isEmailVerified: false,
            resetEmailExpire: { $gt: Date.now() },
            email: email.toLowerCase()
        })

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired email verification token.'
            })
        }

        // Mark email as verified
        user.isEmailVerified = true
        user.emailVerificationToken = undefined // Clear the token after verification
        await user.save()

        // Send token response
        sendTokenResponse(user, 200, res)
    } catch (error) {
        console.error(error)
        res.status(500).json({
            success: false,
            message: 'Server error during email verification.'
        })
    }
}

// @desc      Verify Email
// @route     POST /api/v1/auth/resend-email-verification
// @access    Public
exports.verifyEmailSend = asyncHandler(async (req, res, next) => {
    try {
        // Find the user by email from request user object
        const user = await User.findOne({ email: req.user.email })

        // If user doesn't exist, return 404 error
        if (!user) {
            return next(
                new ErrorResponse('There is no user with that email', 404)
            )
        }

        // If email is already verified, return 400 error
        if (user.isEmailVerified) {
            return next(new ErrorResponse('Email already verified', 400))
        }

        // Retrieve user data by ID for email sending (assuming it's necessary)
        const userData = await User.findById(user._id)

        // Send email and await response
        const emailSent = await email_sending(
            user.fullName,
            user.email,
            userData,
            res
        )

        // If email is successfully sent, respond with success
        if (emailSent) {
            return res.status(200).json({ success: true })
        } else {
            // If email sending fails, respond with failure
            return res.status(400).json({ success: false })
        }
    } catch (err) {
        // If any error occurs, pass it to the error handler middleware
        return next(err)
    }
})

const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = user.getSignedJwtToken()

    const options = {
        expires: new Date(
            Date.now() + "30" * 24 * 60 * 60 * 1000
        ),
        httpOnly: true
    }

    if (process.env.NODE_ENV === 'production') {
        options.secure = true
    }

    res.status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            expiresIn: options.expires,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                onboardingCompleted: user.onboardingCompleted,
                generalInfoCompleted: user.generalInfoCompleted,
                locationCoordinates: user.locationCoordinates
            }
        })
}

function splitfullName(fullName) {
    // Assuming the display name is formatted as "FirstName LastName"
    const nameParts = fullName.split(' ')

    // Extract first name and last name
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') // Join the remaining parts as the last name

    return { firstName, lastName }
}

exports.createUser = async (req, res) => {
    try {
        const newUser = new User(req.body)
        await newUser.save()
        res.status(201).send({
            message: 'User created successfully',
            data: newUser
        })
    } catch (error) {
        res.status(400).send({
            message: 'Failed to create user',
            error: error.message
        })
    }
}

// PUT: Update a user by ID
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.user.id, req.body, {
            new: true
        })
        if (!user) {
            return res.status(404).send({ message: 'User not found' })
        }
        res.status(200).send({
            message: 'User updated successfully',
            data: user
        })
    } catch (error) {
        res.status(400).send({
            message: 'Error updating user',
            error: error.message
        })
    }
}

exports.getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id) // assuming 'req.user.id' contains the authenticated user's ID
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }
        res.status(200).json({ success: true, data: user })
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.getProfileById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }
        res.status(200).json({ success: true, data: user })
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.boostProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)

        // Check if user exists
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        // Check if user is a pro account holder
        if (!user.proAccount) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Feature available for pro accounts only.'
            })
        }

        // Check if user has boosts left and if they are not already boosted
        if (user.boostCount > 0 && !user.boosted) {
            user.boostCount -= 1 // decrement the boost count
            user.boosted = true // set boosted to true

            // Save the updated user
            await user.save()

            res.status(200).json({
                success: true,
                data: {
                    boostCount: user.boostCount,
                    boosted: user.boosted
                },
                message: 'Profile boosted successfully!'
            })
        } else {
            // If no boosts left or already boosted
            res.status(400).json({
                success: false,
                error: user.boosted
                    ? 'Profile already boosted.'
                    : 'No boosts left.'
            })
        }
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.getUserMatches = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).send({ message: 'User not found' })
        } else {
            console.log('looks like user found')
        }

        // Ensure locationCoordinates is present and not empty
        if (
            !user.locationCoordinates ||
            !user.locationCoordinates.coordinates ||
            user.locationCoordinates.coordinates.length !== 2
        ) {
            console.log('is location invalid?')
            return res
                .status(400)
                .send({ message: 'User location coordinates are invalid' })
        }

        // const blockedUsers = await Block.find({
        //     $or: [{ userId }, { blockedUserId: userId }]
        // })
        // const blockedUserIds = blockedUsers.map((block) =>
        //     block.userId.toString() === userId
        //         ? block.blockedUserId.toString()
        //         : block.userId.toString()
        // )

        //----------------------------------
        let potential = {
            _id: { $ne: userId },
            isEmailVerified: true, // Only include verified users
            onboardingCompleted: true, // Only include users who have completed onboarding
            generalInfoCompleted: true
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.ethnicity !==
            'No Preference'
        ) {
            potential.ethnicGroup =
                user.datingPreferences.partnerPreferences.ethnicity
        }
        //-----------------------------------
        if (user.datingPreferences.partnerPreferences.gender.length !== 1) {
            console.log('Applying gender filter');
            console.log('Preferred Genders:', user.datingPreferences.partnerPreferences.gender);
            console.log(user.datingPreferences.partnerPreferences.gender.length)
            console.log(user.datingPreferences.partnerPreferences.gender[0])

            potential.gender = {
                $in: user.datingPreferences.partnerPreferences.gender
            }
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.basicInformation
                .maritalStatus !== 'No Preference'
        ) {
            potential.maritalStatus =
                user.datingPreferences.partnerPreferences.basicInformation.maritalStatus
        }
        //-----------------------------------
        // Calculate age range based on user's preferences
        const currentDate = new Date()
        const maxBirthDate = new Date(
            currentDate.getFullYear() -
            user.datingPreferences.partnerPreferences.ageRange.min,
            currentDate.getMonth(),
            currentDate.getDate()
        )
        const minBirthDate = new Date(
            currentDate.getFullYear() -
            user.datingPreferences.partnerPreferences.ageRange.max -
            1,
            currentDate.getMonth(),
            currentDate.getDate()
        )
        // Apply age range filter if min and max age are not set to "Any"
        if (
            user.datingPreferences.partnerPreferences.ageRange.min !== 0 ||
            user.datingPreferences.partnerPreferences.ageRange.max !== 0
        ) {
            potential.birthday = {
                $gte: minBirthDate,
                $lte: maxBirthDate
            }
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.basicInformation
                .children !== 'No Preference'
        ) {
            potential.children =
                user.datingPreferences.partnerPreferences.basicInformation.children
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.educationAndCareer
                .education !== 'No Preference'
        ) {
            potential.education =
                user.datingPreferences.partnerPreferences.educationAndCareer.education
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.educationAndCareer
                .profession !== 'No Preference'
        ) {
            potential.profession =
                user.datingPreferences.partnerPreferences.educationAndCareer.profession
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.religiosity
                .religion !== 'No Preference'
        ) {
            potential.religion =
                user.datingPreferences.partnerPreferences.religiosity.religion
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.religiosity.smoke !==
            'No Preference'
        ) {
            potential.smoking =
                user.datingPreferences.partnerPreferences.religiosity.smoke
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.religiosity.drink !==
            'No Preference'
        ) {
            potential.drink =
                user.datingPreferences.partnerPreferences.religiosity.drink
        }
        //-----------------------------------
        if (
            user.datingPreferences.partnerPreferences.religiosity
                .starSign !== 'No Preference'
        ) {
            potential.starSign =
                user.datingPreferences.partnerPreferences.religiosity.starSign
        }
        //-----------------------------------
        const interests =
            user.datingPreferences.partnerPreferences
                .interestsAndPersonality.interests

        if (
            Object.values(interests).some((category) => category.length > 0)
        ) {
            potential['$or'] = Object.entries(interests)
                .map(([category, values]) => {
                    if (values.length > 0) {
                        return {
                            [`interests.${category}`]: { $in: values }
                        }
                    }
                    return {}
                })
                .filter((condition) => Object.keys(condition).length > 0)

            // Remove the potentialMatchesQuery['interests'] field if it's empty
            if (potential['$or'].length === 0) {
                delete potential['$or']
            }
        } else {
            potential['interests'] = { $exists: true }
        }
        // ------------------------------------------------
        potential.personalityTraits =
            user.datingPreferences.partnerPreferences
                .interestsAndPersonality.personalityTraits.length > 0
                ? {
                    $in: user.datingPreferences.partnerPreferences
                        .interestsAndPersonality.personalityTraits
                }
                : { $exists: true }
        // ------------------------------------------------
        console.log('this is the potential')
        console.log(potential)
        console.log('this is the potential')
        let potentialMatches = await User.find(potential)
            .sort({ boosted: -1 }) // Sort by boosted status (boosted:true first)
            .limit(10) // Limit the number of potential matches returned

        console.log('this is the potential users')
        console.log(potentialMatches)
        console.log('this is the potential users')
        // Exclude users that the current user has already swiped
        const swipedUsers = await Swipe.find({ userId })
        const swipedUserIds = swipedUsers.map((swipe) =>
            swipe.swipedUserId.toString()
        )

        // Exclude users that has swiped me
        const swipedMe = await Swipe.find({ swipedUserId: userId })
        const swipedMeIds = swipedMe.map((swipe) => swipe.userId.toString())

        // Filter potential matches based on swiped users
        const filteredMatches = potentialMatches.filter(
            (match) =>
                !swipedUserIds.includes(match._id.toString()) &&
                !swipedMeIds.includes(match._id.toString())
        )
        console.log('this is final after search')
        console.log(filteredMatches)
        console.log('this is final after search')
        // -----------------------------------------------
        const { fromCm, toCm } = user.datingPreferences.partnerPreferences.basicInformation.height
        const minHeight = parseFloat(fromCm) || 0
        const maxHeight = parseFloat(toCm) || 0
        if (minHeight > 0 || maxHeight > 0) {
            console.log('Applying height filter with JavaScript')
            potentialMatches = potentialMatches.filter(user => {
                const userHeight = parseFloat(user.height?.cm) || 0
                return userHeight >= minHeight && userHeight <= maxHeight
            })
        }
        // --------------------------------------------------------
        // res.status(200).send(updatedMatches)
        // res.status(200).send(potentialMatches)
        res.status(200).send(filteredMatches)
    } catch (error) {
        console.error(error)
        res.status(500).send({
            message: 'Error getting potential matches',
            error: error.message
        })
    }
}

exports.getLikedByUsers = async (req, res) => {
    const user = await User.findById(req.user.id)

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        })
    }

    const swipes = await Swipe.find({
        swipedUserId: req.user.id,
        action: 'like'
    })

    res.status(200).json({
        success: true,
        data: swipes
    })
}

// Fetch user settings
exports.getSettings = async (req, res) => {
    try {
        const user = await User.findById(
            req.user.id,
            'fullName birthday gender email phoneNumber notifications language profilesharing photoPrivacy hideprofile'
        ) // Select only the required fields

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found' })
        }

        res.status(200).json({ success: true, data: user })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            success: false,
            message: 'Error fetching user settings'
        })
    }
}

exports.updateDatingPreferences = async (req, res) => {
    const userId = req.user.id // assuming 'req.user.id' contains the authenticated user's ID from middleware

    try {
        const user = await User.findById(userId)
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        // Update only the fields that are provided in the request body
        for (const [key, value] of Object.entries(req.body)) {
            // Ensure the key exists in the datingPreferences schema before updating
            if (user.datingPreferences.hasOwnProperty(key)) {
                user.datingPreferences[key] = value
            } else {
                // Recursively set sub-fields if they exist
                for (const subKey in value) {
                    if (
                        user.datingPreferences[key] &&
                        user.datingPreferences[key].hasOwnProperty(subKey)
                    ) {
                        user.datingPreferences[key][subKey] = value[subKey]
                    }
                }
            }
        }

        await user.save()
        res.status(200).json({
            success: true,
            data: user.datingPreferences,
            message: 'Dating preferences updated successfully!'
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.getDatingPreferences = async (req, res) => {
    try {
        const userId = req.user.id // assuming 'req.user.id' contains the authenticated user's ID from middleware
        const user = await User.findById(userId).select('datingPreferences')
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        res.status(200).json({
            success: true,
            data: user.datingPreferences,
            message: 'Dating preferences retrieved successfully!'
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

// Update user settings
exports.updateSettings = async (req, res) => {
    const {
        fullName,
        birthday,
        gender,
        email,
        phoneNumber,
        notifications,
        language,
        profilesharing,
        photoPrivacy,
        hideprofile
    } = req.body

    try {
        const user = await User.findById(req.user.id) // Assuming the user ID is stored in req.user.id

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found' })
        }

        // Update user settings
        user.fullName = fullName || user.fullName
        user.birthday = birthday || user.birthday
        user.gender = gender || user.gender
        user.email = email || user.email
        user.phoneNumber = phoneNumber || user.phoneNumber
        user.notifications =
            notifications !== undefined ? notifications : user.notifications
        user.language = language || user.language
        user.profilesharing =
            profilesharing !== undefined ? profilesharing : user.profilesharing
        user.photoPrivacy =
            photoPrivacy !== undefined ? photoPrivacy : user.photoPrivacy
        user.hideprofile = hideprofile || user.hideprofile

        await user.save()

        res.status(200).json({ success: true, data: user })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            success: false,
            message: 'Error updating user settings'
        })
    }
}

exports.deleteUser = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res
            .status(404)
            .json({ success: false, message: 'User not found' })
    }

    try {
        // Delete user
        await User.findByIdAndDelete(userId)

        // Find all chats the user is part of
        const userChats = await Chat.find({ users: userId })

        // Extract chat IDs
        const chatIds = userChats.map((chat) => chat._id)

        // Delete all messages in the chats that the user was part of
        await Message.deleteMany({ chat: { $in: chatIds } })

        // Delete all chats where the user is involved
        await Chat.deleteMany({ _id: { $in: chatIds } })

        // Delete all notifications for the user
        await Notification.deleteMany({ user: userId })

        // Delete all swipes performed by the user or where the user was swiped on
        await Swipe.deleteMany({ $or: [{ userId }, { swipedUserId: userId }] })

        // Delete all transactions associated with the user
        await Transaction.deleteMany({ user: userId })

        await Block.deleteMany({ $or: [{ userId }, { blockedUserId: userId }] })

        return res
            .status(200)
            .json({ success: true, message: 'User deleted successfully' })
    } catch (error) {
        await session.abortTransaction()
        session.endSession()
        return res.status(500).json({ success: false, message: 'Server error' })
    }
}

exports.removeFcm = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { fcm: '' },
            { new: true }
        )

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found' })
        }

        res.status(200).json({ success: true, data: user })
    } catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: 'Server error' })
    }
}

exports.setNotifications = async (req, res) => {
    try {

        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found' })
        }

        user.notifications = req.body.notifications

        if (user.notifications === false) {
            user.fcm = ''
        }

        if (user.notifications === true) {
            user.fcm = req.body.fcm
        }

        await user.save()


        res.status(200).json({ success: true, user })
    } catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: 'Server error' })
    }
}
