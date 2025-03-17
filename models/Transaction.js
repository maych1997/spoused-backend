const mongoose = require('mongoose')

const transactionModel = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        type: {
            type: String,
            enum: ['Subscription', 'Boost'],
        },
        amount: {
            type: Number,
        },
        endTime: {
            default: null,
            type: Date,
        },
        description: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
)

const Transaction = mongoose.model('Transaction', transactionModel)

module.exports = Transaction
