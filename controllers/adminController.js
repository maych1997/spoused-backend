const asyncHandler = require('../middleware/async')
const User = require('../models/User')
const ErrorResponse = require('../utils/errorResponse')
const sendEmail = require('../utils/sendEmail')
const Transaction = require('../models/Transaction')
const bcrypt = require('bcryptjs')
const s3 = require('../config/aws-config')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
const path = require('path')
const sharp = require('sharp')

const s3Client = new S3Client({
    region: 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    },
})

s3.config.update({ region: 'ap-southeast-1' })

const adminController = {
    dashboardStats: asyncHandler(async (req, res, next) => {
        // count the users with role of 'user'
        const totalUsers = await User.countDocuments({ role: 'user' })

        const totalProUsers = await User.countDocuments({ proAccount: true })

        const totalEarnings = await Transaction.aggregate([
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: '$amount',
                    },
                },
            },
        ])

        res.status(200).json({
            success: true,
            data: {
                users: totalUsers,
                upgraded: totalProUsers,
                revenue: totalEarnings,
            },
        })
    }),

    earnings: asyncHandler(async (req, res, next) => {
        const currentYear = new Date().getFullYear()
        const startOfYear = new Date(currentYear, 0, 1) // First day of the current year
        const endOfYear = new Date(currentYear + 1, 0, 1) // First day of the next year

        const earningsPerMonth = await Transaction.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startOfYear,
                        $lt: endOfYear,
                    },
                },
            },
            {
                $project: {
                    month: { $month: '$createdAt' },
                    amount: 1,
                },
            },
            {
                $group: {
                    _id: '$month',
                    total: {
                        $sum: '$amount',
                    },
                },
            },
            {
                $sort: { _id: 1 }, // Sort by month in ascending order
            },
        ])

        // Create an array for all months of the year with default earnings of 0
        const allMonths = Array.from({ length: 12 }, (_, i) => ({
            _id: i + 1,
            total: 0,
        }))

        // Merge the earningsPerMonth data into the allMonths array
        earningsPerMonth.forEach(({ _id, total }) => {
            allMonths[_id - 1].total = total
        })

        res.status(200).json({
            success: true,
            data: allMonths,
        })
    }),

    newUsers: asyncHandler(async (req, res, next) => {
        const users = await User.find({ role: 'user' })
            .sort({ createdAt: -1 })
            .limit(10)

        res.status(200).json({
            success: true,
            data: users,
        })
    }),

    // all users with filters of status user type (all, free, pro) and search and pagination
    allUsers: asyncHandler(async (req, res, next) => {
        const { status, type, search, page, limit } = req.query

        let query = {
            role: 'user',
        }

        if (status && status !== 'show-all') {
            query.accountStatus = status
        }

        if (type && type !== 'show-all') {
            if (type === 'upgraded') {
                query.proAccount = true
            } else if (type === 'free') {
                query.proAccount = false
            }
        }

        if (search) {
            query = {
                ...query,
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }
        }

        // users with pagination from req query
        const perPage = parseInt(limit) || 10
        const currentPage = parseInt(page) || 1

        const users = await User.find(query)
            .select(
                'email fullName photos proAccount accountStatus goldMemberBadge createdAt',
            )
            .sort({ createdAt: -1 })
            .limit(perPage)
            .skip((currentPage - 1) * perPage)

        // total count of users with the query
        const totalUsers = await User.countDocuments(query)

        res.status(200).json({
            success: true,
            data: {
                users,
                totalUsers,
            },
        })
    }),

    deleteUser: asyncHandler(async (req, res, next) => {
        const user = await User.findById(req.params.id)

        if (!user) {
            return next(new ErrorResponse('User not found', 404))
        }

        await user.deleteOne()

        // return a message that the user has been deleted
        res.status(200).json({
            success: true,
            message: 'User deleted',
        })
    }),

    addUser: asyncHandler(async (req, res, next) => {
        const { fullName, email, password, boostCount, instantChats, likes } =
            req.body

        const proAccount = req.body.proAccount || false
        const goldMemberBadge = req.body.goldMemberBadge || false

        if (!fullName || !email || !password) {
            return next(
                new ErrorResponse(
                    'Please provide a name, email and password',
                    400,
                ),
            )
        }

        if (await User.findOne({ email })) {
            return next(new ErrorResponse('User already exists', 400))
        }

        const user = await User.create({
            fullName,
            email,
            password,
            proAccount,
            boostCount,
            goldMemberBadge,
            instantChats,
            likes,
        })

        email_sending(fullName, email, user, password)

        res.status(201).json({
            success: true,
            data: user,
        })
    }),

    editUser: asyncHandler(async (req, res, next) => {
        const {
            fullName,
            email,
            password,
            boostCount,
            instantChats,
            likes,
            accountStatus,
        } = req.body

        const proAccount = req.body.proAccount || false
        const goldMemberBadge = req.body.goldMemberBadge || false

        let user = await User.findById(req.params.id)

        if (!user) {
            return next(new ErrorResponse('User not found', 404))
        }

        user = await User.findByIdAndUpdate(
            req.params.id,
            {
                fullName,
                email,
                password,
                proAccount,
                boostCount,
                goldMemberBadge,
                instantChats,
                likes,
                accountStatus,
            },
            {
                new: true,
                validateBeforeSave: false,
            },
        )

        res.status(200).json({
            success: true,
            message: 'User updated',
        })
    }),

    // get user by id
    getUser: asyncHandler(async (req, res, next) => {
        const user = await User.findById(req.params.id)

        if (!user) {
            return next(new ErrorResponse('User not found', 404))
        }

        res.status(200).json({
            success: true,
            data: user,
        })
    }),

    // edit admin profile
    editAdmin: asyncHandler(async (req, res, next) => {
        const { fullName, email } = req.body
        let file = req.file

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname)
            const fileName = `profile-images/${crypto.randomUUID()}${fileExtension}`
            const key = `profile-images/${fileName}`

            // Compress and resize the image
            const compressedImage = await sharp(req.file.buffer)
                .resize({ width: 1024, height: 1024, fit: 'inside' })
                .jpeg({ quality: 80 })
                .toBuffer()

            const params = {
                Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                Key: key,
                Body: compressedImage,
                ContentType: req.file.mimetype,
            }

            try {
                const command = new PutObjectCommand(params)
                await s3Client.send(command)
                profileImage = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.ap-southeast-1.amazonaws.com/${key}`
            } catch (error) {
                return res.status(500).json({ message: error.message })
            }
        }

        try {
            const admin = await User.findById(req.user.id)

            if (!admin) {
                return res.status(404).json({ message: 'User not found' })
            }

            admin.fullName = fullName
            admin.email = email

            if (profileImage) {
                const oldImage = admin.photos[0] // Get the old image URL
                admin.photos.unshift(profileImage) // Add the new image URL to the start of the photos array

                // Ensure the photos array only contains a maximum of 6 images
                if (admin.photos.length > 6) {
                    admin.photos = admin.photos.slice(0, 6)
                }

                // Remove the old image from S3
                if (oldImage) {
                    const oldImageKey = oldImage.split(
                        `${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.ap-southeast-1.amazonaws.com/`,
                    )[1]
                    const deleteParams = {
                        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                        Key: oldImageKey,
                    }

                    try {
                        const deleteCommand = new DeleteObjectCommand(
                            deleteParams,
                        )
                        await s3Client.send(deleteCommand)
                    } catch (error) {
                        console.error(
                            'Failed to delete old image from S3:',
                            error.message,
                        )
                    }
                }
            }

            await admin.save()

            res.status(200).json({
                success: true,
                data: admin,
            })
        } catch (error) {
            res.status(500).json({ message: 'Failed to update profile', error })
        }
    }),

    changePasswordAdmin: asyncHandler(async (req, res, next) => {
        const { oldPassword, newPassword } = req.body

        const user = await User.findById(req.user.id).select('+password')

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found' })
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password)

        if (!isMatch) {
            return res
                .status(400)
                .json({ success: false, message: 'Old password is incorrect' })
        }

        user.password = newPassword
        await user.save()

        res.status(200).json({
            success: true,
            data: 'Password updated successfully',
        })
    }),

    // get current admin profile
    getAdminProfile: asyncHandler(async (req, res, next) => {
        const admin = await User.findById(req.user.id)
        console.log('This is admin',admin);
        res.status(200).json({
            success: true,
            data: admin,
        })
    }),

    logout: asyncHandler(async (req, res, next) => {
        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true,
        })

        res.status(200).json({
            success: true,
            data: {},
        })
    }),
}

const email_sending = async (fullName, email, user, password) => {
    try {
        // Get reset token
        const resetToken = user.generateEmailVerificationToken()

        // Create reset URL
        const message = `Dear User,

        Welcome aboard! We are excited to have you as part of the Spoused community. Your account has been created by our team, and you are just one step away from unlocking all the innovative features we have to offer.

        To ensure the security of your account and to complete your registration process, please verify your email address by logging in with the following temporary password and changing it to your preferred password after verification.

        Email: ${email}
        Temporary Password: ${password}


        This code will expire in 24 hours, so be sure to use it soon. If you did not request to be added to GetSpoused, please disregard this email.

        Warmest regards,

        The Spoused Team`

        // Call your custom sendEmail function
        await sendEmail({
            email: email,
            subject: 'Welcome to Spoused! Verify Your Email Address',
            message,
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

module.exports = adminController
