// Import necessary modules from Node.js and Mongoose
const crypto = require('crypto')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

// Define the schema for the 'User' model
const SwipeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }, // ID of the user performing the swipe
    swipedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }, // ID of the user being swiped on
    action: { type: String, required: true, enum: ['like', 'dislike'] }, // Action performed (like or dislike)
    createdAt: { type: Date, default: Date.now },
})

const Swipe = mongoose.model('Swipe', SwipeSchema)

// Export the 'Swipe' model for use in other parts of the application
module.exports = Swipe
