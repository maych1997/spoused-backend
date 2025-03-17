const Queue = require('bull');
const AWS = require('aws-sdk');
const { sendMessage } = require('./firebase');  // Assuming you have a sendMessage function for FCM notifications
const Message = require('./models/Message');  // Assuming your Message model is here

// Initialize Redis Bull queues
const s3Queue = new Queue('s3Queue', { redis: { host: '127.0.0.1', port: 6379 } });
const notificationQueue = new Queue('notificationQueue', { redis: { host: '127.0.0.1', port: 6379 } });

// Initialize S3 client
const s3Client = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// S3 processing job
s3Queue.process(async (job) => {
    const { content, type, chat, userId } = job.data;

    const bufferData = Buffer.from(content, 'base64');
    const key = `chat/${Date.now()}.${type === 'audio' ? 'mp3' : 'png'}`;
    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
        Key: key,
        Body: bufferData,
        ContentType: type === 'audio' ? 'audio/mpeg' : 'image/jpeg',
    };

    try {
        const uploadResult = await s3Client.upload(params).promise();
        const url = uploadResult.Location;

        // Save the message with the uploaded URL in MongoDB
        await Message.create({
            chat,
            sender: userId,
            type,
            content: url,
        });

        console.log(`S3 upload complete. File URL: ${url}`);
    } catch (error) {
        console.error('Error during S3 upload:', error);
    }
});

// Notification processing job
notificationQueue.process(async (job) => {
    const { title, body, token } = job.data;
    try {
        await sendMessage({ title, body, token });
        console.log(`Notification sent: ${title}`);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
});

module.exports = { s3Queue, notificationQueue };
