// Import necessary modules from Node.js and Mongoose
const crypto = require('crypto')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

// Define the schema for the 'User' model
const UserSchema = new mongoose.Schema({
    fullName: { type: String },
    photos: [{ type: String, default: [null, null, null, null, null, null] }],
    photoPrivacy: { type: Boolean, default: false },
    birthday: { type: Date },
    video: { type: String },
    intro: { type: String },
    Age: {
        type: Number,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Non-Binary'],
    },
    phoneCode: {
        type: String,
    },

    phoneNumber: {
        type: String,
    },
    phoneNumberVerified: {
        type: Boolean,
        default: false,
    },
    generalInfoCompleted: {
        type: Boolean,
        default: false,
    },

    profession: { type: String },
    ethnicGroup: { type: String },
    education: { type: String },
    location: { type: String },
    jobTitle: { type: String },
    employer: { type: String },
    languages: { type: Array },
    height: {
        type: Object,
        value: {
            cm: { type: Number },
            ft: { type: String },
        },
        default: { cm: '0', ft: '0' },
    },
    maritalStatus: {
        type: String,
        enum: ['Separated', 'Never Married', 'Annulled', 'Divorced', 'Widowed'],
    },
    datingPreferences: {
        interestedIn: {
            type: Array,
            default: [],
        },
        partnerPreferences: {
            limitlocation: {
                type: Number,
                default: 40,
            },
            gender: {
                type: Array,
                default: ['No Preference'],
            },
            ageRange: {
                min: { type: Number, default: 18 },
                max: { type: Number, default: 85 },
            },
            ethnicity: { type: String, default: 'No Preference' },
            // Additional preferences for pro users

            basicInformation: {
                height: {
                    type: Object,
                    value: {
                        fromCm: { type: Number },
                        fromFt: { type: Number },
                        toCm: { type: String },
                        toFt: { type: String },
                    },
                    default: { fromCm: 0, fromFt: 0, toCm: '0', toFt: '0' },
                },
                maritalStatus: {
                    type: String,
                    enum: [
                        'Separated',
                        'Never Married',
                        'Annulled',
                        'Divorced',
                        'Widowed',
                        'No Preference',
                    ],
                    default: 'No Preference',
                },
                children: {
                    type: String,
                    enum: ['Yes', 'No', 'Maybe', 'No Preference'],
                    default: 'No Preference',
                },
            },
            educationAndCareer: {
                education: { type: String, default: 'No Preference' },
                profession: { type: String, default: 'No Preference' },
            },
            languagesAndEthnicity: {
                languages: { type: [String], default: ['No Preference'] },
                ethnicOrigin: { type: String, default: 'No Preference' },
            },
            religiosity: {
                religion: { type: String, default: 'No Preference' },
                smoke: {
                    type: String,
                    enum: ['Yes', 'No', 'No Preference'],
                    default: 'No Preference',
                },
                drink: {
                    type: String,
                    enum: ['Yes', 'No', 'No Preference'],
                    default: 'No Preference',
                },
                starSign: { type: String, default: 'No Preference' },
            },
            interestsAndPersonality: {
                interests: {
                    sports: [{ type: String }],
                    foodanddrinks: [{ type: String }],
                    artsandculture: [{ type: String }],
                    community: [{ type: String }],
                   
                    outdoors: [{ type: String }],
                    technology: [{ type: String }],
                },
                personalityTraits: [String],
            },
        },
    },
    smoking: {
        type: String,
        enum: ['Yes', 'No'],
    },
    children: { type: String, enum: ['Yes', 'No', 'Maybe'] },
    lookingFor: {
        type: String,
        enum: ['Marriage', 'Long term relationship', 'Others'],
    },
    religion: { type: String },
    drink: {
        type: String,
        enum: ['Yes', 'No'],
    },
    starSign: { type: String },
    interests: {
        sports: [{ type: String }],
        foodanddrinks: [{ type: String }],
        artsandculture: [{ type: String }],
        community: [{ type: String }],
        outdoors: [{ type: String }],
        technology: [{ type: String }],
    },
    personalityTraits: [{ type: String }],
    biography: { type: String },
    locationCoordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: {
            type: [Number],
            default: [0, 0],
            index: '2dsphere',
        },
    },

    likes: {
        type: Number,
        default: 15,
    },

    instantChats: {
        type: Number,
        default: 2,
    },

    boostCount: {
        type: Number,
        default: 2,
    },
    rewinds: {
        type: Number,
        default: 5,
    },

    boosted: {
        type: Boolean,
        default: false,
    },

    boostedAt: {
        type: Date,
        default: null,
    },

    notifications: {
        type: Boolean,
        default: true,
    },

    language: {
        type: String,
        default: 'English',
    },

    fcm: {
        type: String,
        default: '',
    },

    profilesharing: {
        type: Boolean,
        default: true,
    },

    goldMemberBadge: {
        type: Boolean,
        default: false,
    },

    travelMode: {
        type: Object,
        value: {
            toggle: { type: Boolean },
            city: { type: String },
        },
        default: { toggle: false, city: '' },
    },

    hideprofile: {
        reason: {
            type: String,
        },
        sharing: {
            type: Boolean,
            default: false,
        },
    },

    profileVerification: {
        verifiedDocument: {
            type: String,
        },
        verified: {
            type: Boolean,
            default: false,
        },
    },

    expired: { type: Boolean, default: false },

    onboardingCompleted: {
        type: Boolean,
        default: false,
    },

    email: {
        type: String,
        unique: true,
        match: [
            /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            'Please add a valid email',
        ],
    },

    // Role of the user (enum: 'user' or 'admin', default: 'user')
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    // Password of the user (minlength: 6, not selected by default in queries)
    password: {
        type: String,
        minlength: 6,
        select: false,
    },
    // Account type (enum: 'google' or 'local', default: 'local')
    accountType: {
        type: String,
        enum: ['google', 'local', 'apple'],
        default: 'local',
    },
    appleId: {
        type: String,
        default: null,
    },
    // Google ID (default: null)
    googleId: {
        type: String,
        default: null,
    },

    proAccount: {
        type: Boolean,
        default: false,
    },

    // Token for resetting the user's password
    resetPasswordToken: String,
    // Expiry date for the reset password token
    resetPasswordExpire: Date,
    // Timestamp for when the user account was created
    createdAt: {
        type: Date,
        default: Date.now,
    },

    accountStatus: {
        type: String,
        enum: ['active', 'unverified', 'suspended'],
        default: 'active',
    },

    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    emailVerificationToken: String,
    resetEmailExpire: Date,
})

// Encrypt password using bcrypt before saving to the database
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next()
    }

    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
})

// Generate a signed JWT token for the user
UserSchema.methods.getSignedJwtToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    })
}

// Match user entered password to hashed password in the database
UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password)
}

UserSchema.methods.getResetPasswordToken = function () {
    // Generate token
    const resetToken = [...Array(5)]
        .map(() => Math.floor(Math.random() * 10))
        .join('')

    // Set token to resetPasswordToken field
    this.resetPasswordToken = resetToken

    // Set expiry date for the reset password token
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000 // Token expires in 10 minutes

    return resetToken
}

UserSchema.methods.generateEmailVerificationToken = function () {
    const verificationToken = [...Array(5)]
        .map(() => Math.floor(Math.random() * 10))
        .join('')
    this.emailVerificationToken = verificationToken

    return verificationToken
}

UserSchema.index({ locationCoordinates: '2dsphere' })

// Create the 'User' model using the defined schema
const User = mongoose.model('User', UserSchema)

// Export the 'User' model for use in other parts of the application
module.exports = User
