const jwt = require('jsonwebtoken')
const asyncHandler = require('./async')
const ErrorResponse = require('../utils/errorResponse')
const User = require('../models/User')

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
    let token

    // First check for a token in cookies
    if (req.cookies.token) {
        token = req.cookies.token
        // Then check for a Bearer token in the authorization header
    } else if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        // Set token from Bearer token in header
        token = req.headers.authorization.split(' ')[1]
    }

    // Make sure token exists
    if (!token) {
        return next(
            new ErrorResponse('Not authorized to access this route', 401),
        )
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        req.user = await User.findById(decoded.id)

        next()
    } catch (err) {
        return next(
            new ErrorResponse('Not authorized to access this route', 401),
        )
    }
})

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                new ErrorResponse(
                    `User role ${req.user.role} is not authorized to access this route`,
                    403,
                ),
            )
        }
        next()
    }
}
