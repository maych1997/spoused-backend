const Swipe = require('../models/Swipe') // Adjust path as necessary
const Transaction = require('../models/Transaction')
const User = require('../models/User')
const asyncHandler = require('express-async-handler')


exports.payment = async (req, res, next) => {
    try {
        const { type, description, amount, date } = req.body

        const user = await User.findById(req.user._id)

        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            })
        }

        user.proAccount = true

        await user.save()
        
        let trans = await Transaction.create({
            user: req.user._id,
            type,
            description,
            amount,
            endTime: date,
        })

        res.status(201).json({
            message: 'Transaction created successfully',
            data: trans
        })
    } catch (error) {
        res.status(500).json({
            message: 'Error creating transaction',
            error: error.message,
        })
    }
}

exports.getTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user._id })
    res.status(200).json({
        message: 'Transactions fetched successfully',
        data: transactions
    })
})
