const mongoose = require('mongoose')

const notificationModel = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        title: {
            type: String,
        },
        content: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
)

const Notification = mongoose.model('Notification', notificationModel)

module.exports = Notification
