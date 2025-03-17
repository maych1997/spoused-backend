const mongoose = require('mongoose')

const seenModel = mongoose.Schema(
    {
        seenUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        type: {
            type: String,
            enum: ['text', 'audio', 'image', 'link','linkEnd'],
        },
        content: {
            type: String,
        },
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat',
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        },
    },
    {
        timestamps: true,
    },
)

const Seen = mongoose.model('Seen', seenModel)

module.exports = Seen
