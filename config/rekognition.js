const AWS = require('aws-sdk')

// Set the AWS region and credentials
AWS.config.update({
    //   region: 'your-region', // Replace 'your-region' with your desired AWS region
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY, // Replace 'your-access-key-id' with your AWS access key ID
        secretAccessKey: process.env.AWS_SECRET_KEY, // Replace 'your-secret-access-key' with your AWS secret access key
    },
})

// Create an instance of the Rekognition service
const rekognitionClient = new AWS.Rekognition()

module.exports = rekognitionClient
