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
    for (let i = 0; i < message.token.length; i++) {
        await getMessaging()
            .send({
                notification: {
                    title: message.title,
                    body: message.body,
                },
                token: message.token[i],
            })
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
