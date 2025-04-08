const { initializeApp } = require('firebase-admin/app')
const admin = require('firebase-admin')
const { getMessaging } = require('firebase-admin/messaging')
var serviceAccount = require('./firebaseConfig.json')

initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'getspoused-8e12d',
})

const sendMessage = async (message) => {
    if(message?.token!=undefined){
        console.log('Thsi is message title',message);
    for (let i = 0; i < message.token.length; i++) {
        let messagePayload = {
            notification: {
                title: message.title,
                body: message.body, // This is the notification content
            },
            token: message.token[i],
        };
        
        // Check if title exists (for call case)
        if (message.title=='Call') {
            messagePayload.data = {
                text: message.body,
                senderId: message.senderId,
                appId: message.appId,
                channelName: message.channelName,
                userDetails: JSON.stringify(message.userDetails), // Send data as stringified JSON
            };
        }
        await getMessaging()
            .send(messagePayload)
            .then((response) => {
                console.log('I am response',response);
            })
            .catch((error) => {
                console.log('I am error',error);
            })
    }
  }
}

module.exports = { sendMessage }
