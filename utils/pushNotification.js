require('dotenv').config()
var FCM = require('fcm-node')
var serverKey = process.env.FCM
var fcm = new FCM(serverKey)

exports.startedBidNotification = async (ids, message) => {
    try {
        var pushMessage = {
            registration_ids: ids,
            content_available: true,
            mutable_content: true,
            notification: {
                title: 'Video Update',
                body: 'You have an active bid on one of your videos.',
                icon: 'myicon',
                sound: 'mySound',
            },
        }

        fcm.send(pushMessage, (err, response) => {
            if (err) {
                console.err('Something has gone wrong!', err)
            } else {
                console.err('Successfully sent with response: ', response)
            }
        })
    } catch (error) {
        console.error('Error is:', error)
    }
}