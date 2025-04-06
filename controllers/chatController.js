const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const bcrypt = require('bcryptjs')
const Chat = require('../models/Chat')
const Message = require('../models/Message')
const Block = require('../models/Block')
const { redisClient } = require('../config/redis')
const s3 = require('../config/aws-config')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { sendMessage } = require('../firebase')
const { schedulerRedisClient } = require('../scheduler')
const { promisify } = require('util')
const { s3Queue, notificationQueue } = require('../bullQueues')
const mongoose = require('mongoose')
const Seen = require('../models/Seen')
const Swipe = require('../models/Swipe')
const s3Client = new S3Client({
    region: 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
})

s3.config.update({ region: 'ap-southeast-1' })

const accessChat = asyncHandler(async (userid1, userid2) => {
    var isChat = await Chat.find({
        $and: [
            { users: { $elemMatch: { $eq: userid1 } } },
            { users: { $elemMatch: { $eq: userid2 } } }
        ]
    })
        .populate('users', '-password')
        .populate('latestMessage')

    if (isChat.length > 0) {
        return {
            success: false,
            message: 'Chat already exists',
            chat: isChat[0]
        }
    } else {
        var chatData = {
            users: [userid1, userid2]
        }

        try {
            const createdChat = await Chat.create(chatData)

            const fullChat = await Chat.findOne({
                _id: createdChat._id
            }).populate('users', '-password')

            return { success: true, chat: fullChat }
        } catch (error) {
            throw new Error(error.message)
        }
    }
})


const fetchChat = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch swiped users (users that the current user swiped on)
        const swipedUsers = await Swipe.find({ userId });
        const swipedUserIds = swipedUsers.map(swipe => swipe.swipedUserId.toString()); // Extract swiped user IDs

        if (swipedUserIds.length === 0) {
            return res.status(200).send([]); // If no swiped users, return empty array
        }

        // Fetch chats from Redis for the current user
        const chatsData = await redisClient.lRange(`chats:${userId}`, 0, -1);
        const chats = chatsData.map(JSON.parse);

        // Filter chats to only include those where the other user is in swipedUserIds
        const filteredChats = chats.filter(chat => {
            const otherUser = chat.users.find(user => user._id.toString() !== userId.toString());
            return otherUser && swipedUserIds.includes(otherUser._id.toString());
        });

        // Fetch user data from Redis and format the response
        const result = await Promise.all(filteredChats.map(async (chat) => {
            const otherUser = chat.users.find(user => user._id.toString() !== userId.toString());
            if (!otherUser) return null;

            try {
                const cachedUserData = await redisClient.get(`user:${otherUser._id}`);
                const parsedData = cachedUserData ? JSON.parse(cachedUserData) : {};

                return {
                    ...chat,
                    users: {
                        _id: otherUser._id,
                        fullName: otherUser.fullName,
                        photos: otherUser.photos,
                        email: otherUser.email,
                        photoPrivacy: parsedData.photoPrivacy || null,
                    },
                    latestMessage: chat.latestMessage,
                };
            } catch (error) {
                console.error('Error fetching user from Redis:', error);
                return {
                    ...chat,
                    users: null,
                    latestMessage: chat.latestMessage,
                };
            }
        }));

        res.status(200).send(result.filter(Boolean)); // Remove null values
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});




// const fetchChat = asyncHandler(async (req, res) => {
//     try {
//         const userId = req.user._id
//
//         // Fetch chats from Redis for the current user
//         const chatsData = await redisClient.lRange(`chats:${userId}`, 0, -1)
//         const chats = chatsData.map(JSON.parse)
//
//         // No database access needed; data is fully populated
//         const result = chats.map((chat) => {
//             const otherUser = chat.users.find(user => user._id.toString() !== userId.toString())
//             console.log('this is other user')
//             console.log(otherUser)
//             console.log('this is other user')
//             // const cachedUserDatwa = await redisClient.get(`user:${otherUser._id}`);
//
//             const cachedUserData = redisClient.get(`user:${otherUser._id}`)
//                 .then((data) => {
//                     const parsedData = JSON.parse(data);
//                     console.log('Cached User Data:', parsedData.photoPrivacy);
//
//                 })
//                 .catch((error) => {
//                     console.error('Error fetching user from Redis:', error);
//                     return null;
//                 });
//             return {
//                 ...chat,
//                 users: otherUser
//                     ? {
//                         _id: otherUser._id,
//                         fullName: otherUser.fullName,
//                         photos: otherUser.photos,
//                         email: otherUser.email,
//                     }
//                     : null,
//                 latestMessage: chat.latestMessage
//             }
//         })
//         res.status(200).send(result)
//     } catch (error) {
//         res.status(400).send({ message: error.message })
//     }
// })


//getter users from redis or db
const redisGetAsync = promisify(schedulerRedisClient.get).bind(schedulerRedisClient)
const redisSetAsync = promisify(schedulerRedisClient.set).bind(schedulerRedisClient)

async function getCachedUser(userId) {
    const redisKey = `user:${userId}`
    try {
        console.log(`Fetching user ${userId} from Redis...`)

        // Use promisified Redis 'get' function
        let user = await redisGetAsync(redisKey)

        if (user) {
            console.log(`User ${userId} found in Redis:`, user)  // Log the raw data from Redis
            return JSON.parse(user)  // Parse and return the user data
        } else {
            console.log(`User ${userId} not found in Redis, fetching from MongoDB...`)
            // Fetch from MongoDB and cache in Redis
            user = await User.findById(userId).lean()
            if (user) {
                // Use promisified Redis 'set' function
                await redisSetAsync(redisKey, JSON.stringify(user), 'EX', 3600)
                console.log(`User ${userId} fetched from MongoDB and cached in Redis`)
            }
            return user
        }
    } catch (error) {
        console.error(`Error fetching user ${userId}:`, error)
        throw error  // Re-throw error for further handling
    }
}

//getter users from redis or db
// const createMessage = asyncHandler(async (req, res) => {
//     try {
//         let { chat, content, type, receiverId } = req.body

//         const userId = req.user.id
//         console.log('Received request to create message:')
//         console.log('Type:', type, 'Content length:', content.length)

//         // const user = await User.findById(userId);
//         // const receiverUser = await User.findById(receiverId);

//         // Get sender and receiver from Redis (or fallback to MongoDB if not in cache)
//         const user = await getCachedUser(userId)
//         const receiverUser = await getCachedUser(receiverId)
//         console.log('this is recievxed user')
//         console.log(receiverUser.notifications)
//         console.log('this is recieved user')
//         console.log('Sender:', user.fullName, 'Receiver:', receiverUser.fullName)

//         if (type !== 'text') {
//             console.log('Non-text message detected. Uploading to S3...')

//             const bufferData = Buffer.from(content, 'base64')
//             const key = `chat/${Date.now()}.${type === 'audio' ? 'mp3' : 'png'}`
//             const putObjectCommand = new PutObjectCommand({
//                 Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                 Key: key,
//                 Body: bufferData,
//                 ContentType: type === 'audio' ? 'audio/mpeg' : 'image/jpeg'
//             })

//             try {
//                 await s3Client.send(putObjectCommand)
//                 const url = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
//                 console.log('S3 upload successful. URL:', url)

//                 let msg = await Message.create({
//                     chat,
//                     sender: req.user._id,
//                     type,
//                     content: url
//                 })

//                 console.log('Message created in the database:', msg._id)

//                 // Send notification for non-text messages
//                 if (receiverUser.fcm.length !== 0) {
//                     console.log('Sending FCM notification for non-text message...')
//                     await sendMessage({
//                         title: 'Call',
//                         body: `${user.fullName} is calling you.`,
//                         token: [receiverUser.fcm]
//                     })
//                     console.log('Notification sent successfully.',user)
//                 }

//                 console.log('Returning success response to the client.')
//                 return res.status(201).json({
//                     message: 'Message sent successfully',
//                     doc: msg // return the created message object
//                 })

//             } catch (error) {
//                 console.error('Error while uploading to S3 or creating message:', error)
//                 return res.status(400).json({ message: error.message, success: false })
//             }

//         } else {
//             // Handle text message creation
//             console.log('Text message detected. Creating message...')

//             let msg = await Message.create({
//                 chat,
//                 sender: req.user._id,
//                 type,
//                 content
//             })

//             console.log('Message created in the database:', msg._id)

//             // Handle notifications for text messages
//             if (receiverUser.fcm.length !== 0) {
//                 console.log('Sending FCM notification for text message...')
//                 if (type === 'text') {
//                     await sendMessage({
//                         title: `${user.fullName}`,
//                         body: `${content}`,
//                         token: [receiverUser.fcm]
//                     })
//                 } else if (type === 'image') {
//                     await sendMessage({
//                         title: `${user.fullName}`,
//                         body: `${user.fullName} sent you an image.`,
//                         token: [receiverUser.fcm]
//                     })
//                 } else if (type === 'audio') {
//                     await sendMessage({
//                         title: `${user.fullName}`,
//                         body: `${user.fullName} sent you an audio.`,
//                         token: [receiverUser.fcm]
//                     })
//                 } else if (type === 'link') {
//                     await sendMessage({
//                         title: `${user.fullName}`,
//                         body: `${user.fullName} calling you.`,
//                         token: [receiverUser.fcm]
//                     });
//                 }
//                 console.log('Notification sent successfully.')
//             }

//             console.log('Returning success response to the client.')
//             console.log(msg)

//             return res.status(200).json({
//                 message: 'Message sent successfully',
//                 msg, // return the created message object
//                 success: true
//             })
//         }
//     } catch (error) {
//         console.error('Error while processing message:', error)
//         return res.status(400).json({ message: error.message, success: false })
//     }
// })

const createMessage = asyncHandler(async (req, res) => {
    try {
        let { chat, content, type,token,receiverId,appId,channelName,userDetails,senderId } = req.body

        const userId = req.user.id
        console.log('Received request to create message:')

        // const user = await User.findById(userId);
        // const receiverUser = await User.findById(receiverId);

        // Get sender and receiver from Redis (or fallback to MongoDB if not in cache)
        const user = await getCachedUser(userId)
        const receiverUser = await getCachedUser(receiverId)
        console.log('this is recievxed user')
        console.log('this is recieved user')
        console.log('Sender:', user.fullName, 'Receiver:', receiverUser.fullName)

        if (type !== 'text') {
            console.log('Non-text message detected. Uploading to S3...')

            const bufferData = Buffer.from(content, 'base64')
            const key = `chat/${Date.now()}.${type === 'audio' ? 'mp3' : 'png'}`
            const putObjectCommand = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                Key: key,
                Body: bufferData,
                ContentType: type === 'audio' ? 'audio/mpeg' : 'image/jpeg'
            })

            try {
                await s3Client.send(putObjectCommand)
                const url = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
                console.log('S3 upload successful. URL:', url)

                let msg = await Message.create({
                    chat,
                    sender: req.user._id,
                    type,
                    content: url,
                    senderId,
                    appId,
                    channelName,
                    userDetails,
                    receiverId
                })

                console.log('Message created in the database:', senderId)

                // Send notification for non-text messages
                if (receiverUser.fcm.length !== 0) {
                    console.log('Sending FCM notification for non-text message...')
                    await sendMessage({
                        title: 'Call',
                        body: `${user.fullName} is calling you.`,
                        token: [receiverUser.fcm],
                        senderId:senderId,
                        appId:appId,
                        channelName:channelName,
                        userDetails:userDetails,
                        receiverId:receiverId,
                        
                    })
                    console.log('Notification sent successfully.',user)
                }

                console.log('Returning success response to the client.')
                return res.status(201).json({
                    message: 'Message sent successfully',
                    doc: msg // return the created message object
                })

            } catch (error) {
                console.error('Error while uploading to S3 or creating message:', error)
                return res.status(400).json({ message: error.message, success: false })
            }

        } else {
            // Handle text message creation
            console.log('Text message detected. Creating message...')

            let msg = await Message.create({
                chat,
                sender: req.user._id,
                type,
                content
            })

            console.log('Message created in the database:', receiverUser);

            // Handle notifications for text messages
            if (receiverUser.fcm.length !== 0) {
                console.log('Sending FCM notification for text message...')
                if (type === 'text') {
                    await sendMessage({
                        title: `${user.fullName}`,
                        body: `${content}`,
                        token: [receiverUser.fcm]
                    })
                } else if (type === 'image') {
                    await sendMessage({
                        title: `${user.fullName}`,
                        body: `${user.fullName} sent you an image.`,
                        token: [receiverUser.fcm]
                    })
                } else if (type === 'audio') {
                    await sendMessage({
                        title: `${user.fullName}`,
                        body: `${user.fullName} sent you an audio.`,
                        token: [receiverUser.fcm]
                    })
                } else if (type === 'link') {
                    await sendMessage({
                        title: `${user.fullName}`,
                        body: `${user.fullName} calling you.`,
                        token: [receiverUser.fcm]
                    });
                }
                console.log('Notification sent successfully.')
            }

            console.log('Returning success response to the client.')
            console.log(msg)

            return res.status(200).json({
                message: 'Message sent successfully',
                msg, // return the created message object
                success: true
            })
        }
    } catch (error) {
        console.error('Error while processing message:', error)
        return res.status(400).json({ message: error.message, success: false })
    }
})

// const getAllMessagesOfChat = asyncHandler(async (req, res) => {
//     try {
//         const id = req.params.id
//         const messages = await Message.find({ chat: id })
//
//         res.status(200).json({ data: messages })
//     } catch (error) {
//         res.status(400)
//         throw new Error(error.message)
//     }
// })

const redisRPushAsync = promisify(schedulerRedisClient.rPush).bind(schedulerRedisClient)
const redisLRangeAsync = promisify(schedulerRedisClient.lRange).bind(schedulerRedisClient)
const redisExpireAsync = promisify(schedulerRedisClient.expire).bind(schedulerRedisClient)

// Then use them in your function without redeclaring

const getAllMessagesOfChat = asyncHandler(async (req, res) => {
    const id = req.params.id
    const redisKey = `chat:${id}:messages`

    try {
        console.log(`Fetching messages for chat ${id} from Redis...`)

        // Fetch messages from Redis using lRange (list-based)
        const cachedMessages = await redisLRangeAsync(redisKey, 0, -1)

        if (cachedMessages.length > 0) {
            const messages = cachedMessages.map(msg => JSON.parse(msg))
            return res.status(200).json({ data: messages })
        }

        // If no cached messages in Redis, fallback to MongoDB
        console.log(`Messages for chat ${id} not found in Redis, fetching from MongoDB...`)
        const messages = await Message.find({ chat: id })

        // Cache the messages in Redis (using rPush for lists) and set expiration
        if (messages.length > 0) {
            for (const message of messages) {
                await redisRPushAsync(redisKey, JSON.stringify(message))
            }

            // Set expiration time for the cached messages (e.g., 1 hour)
            await redisExpireAsync(redisKey, 3600)
            console.log(`Messages for chat ${id} cached in Redis with expiration`)
        }

        // Return the messages from MongoDB
        return res.status(200).json({ data: messages })
    } catch (error) {
        console.error(`Error fetching messages for chat ${id}:`, error)
        res.status(400)
        throw new Error(error.message)
    }
})


// const getLastMessageOfChat = asyncHandler(async (req, res) => {
//     const userId = req.user._id; // Current user ID (the one making the request)
//     const chatId = req.params.id; // Chat ID provided in the request
//
//     try {
//         // Step 1: Fetch the last message from MongoDB for the specified chat
//         console.log(`Fetching the last message for chat ${chatId} from MongoDB...`);
//         const lastMessage = await Message.findOne({ chat: chatId }).sort({ createdAt: -1 });
//
//         // Step 2: If no last message is found, return a response indicating that
//         if (!lastMessage) {
//             return res.status(200).json({
//                 lastMessage: null,
//                 numberOfUnseen: 0
//             });
//         }
//
//         // Step 3: Fetch all messages from the chat
//         const allMessages = await Message.find({ chat: chatId });
//
//         // Step 4: Filter unseen messages where updatedAt equals createdAt
//         const unseenMessages = allMessages.filter(msg => {
//             return new Date(msg.updatedAt).getTime() === new Date(msg.createdAt).getTime();
//         });
//
//         // Step 5: Return the last message and unseen message count
//         return res.status(200).json({
//             lastMessage: lastMessage,
//             numberOfUnseen: unseenMessages.length
//         });
//     } catch (error) {
//         console.error(`Error fetching last message for chat ${chatId}:`, error);
//         return res.status(500).json({ message: 'Error fetching chat details' });
//     }
// });


const getLastMessageOfChat = asyncHandler(async (req, res) => {
    const userId = req.user._id; // Current user ID
    const otherUserId = req.params.id; // Other user ID
    const redisKey = `chat:last:${userId}:${otherUserId}`; // Redis cache key

    try {
        console.log(`Fetching last message between user ${userId} and user ${otherUserId} from Redis...`);

        // Step 1: Check Redis cache
        const cachedMessage = await redisClient.get(redisKey);

        if (cachedMessage) {
            const message = JSON.parse(cachedMessage);

            // Fetch unseen messages sent by the other user
            const unseenMessages = await Message.countDocuments({
                chat: message.chat,
                sender: otherUserId,
                createdAt: { $eq: "$updatedAt" }, // Only count unseen messages
            });

            return res.status(200).json({
                lastMessage: message,
                numberOfUnseen: unseenMessages,
            });
        }

        // Step 2: Fetch last message from MongoDB if not in Redis
        console.log(`Last message not found in Redis, fetching from MongoDB...`);
        const lastMessage = await Message.findOne({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId }
            ]
        }).sort({ createdAt: -1 });

        // If no last message exists, return empty response
        if (!lastMessage) {
            return res.status(200).json({
                lastMessage: null,
                numberOfUnseen: 0,
            });
        }

        // Step 3: Cache last message in Redis
        await redisClient.set(redisKey, JSON.stringify(lastMessage));
        await redisClient.expire(redisKey, 3600); // Expire in 1 hour

        // Step 4: Count unseen messages
        const unseenMessages = await Message.countDocuments({
            chat: lastMessage.chat,
            sender: otherUserId,
            createdAt: { $eq: "$updatedAt" }, // Only count unseen messages
        });

        // Step 5: Return response
        return res.status(200).json({
            lastMessage,
            numberOfUnseen: unseenMessages,
        });
    } catch (error) {
        console.error(`Error fetching last message:`, error);
        return res.status(500).json({ message: 'Error fetching chat details' });
    }
});


// const getLastMessageOfChat = asyncHandler(async (req, res) => {
//     const userId = req.params.id;  // User 1 (current user)
//     const otherUserId = req.user._id;  // User 2 (the other user)
//     const redisKey = `chat:last:${userId}:${otherUserId}`;
//
//     try {
//         console.log(`Fetching the last message between user ${userId} and user ${otherUserId} from Redis...`);
//
//         // Fetch the last message from Redis
//         const cachedMessage = await redisClient.get(redisKey);
//         console.log(cachedMessage)
//         if (cachedMessage) {
//             const message = JSON.parse(cachedMessage);
//
//             // Fetch unseen messages count from MongoDB
//             const unseenCount = await Message.countDocuments({
//                 chat: { $in: [userId, otherUserId] }, // Chat between the two users
//                 sender: { $ne: userId }, // Messages sent by the other user, not the current user
//                 $expr: { $eq: ["$updatedAt", "$createdAt"] } // Compare updatedAt and createdAt within the same document
//             });
//
//             return res.status(200).json({
//                 lastMessage: message,
//                 numberOfUnseen: unseenCount
//             });
//         }
//
//         // If no cached message in Redis, fallback to MongoDB
//         console.log(`Last message between user ${userId} and user ${otherUserId} not found in Redis, fetching from MongoDB...`);
//         const lastMessage = await Message.findOne({
//             $or: [
//                 { sender: userId, receiver: otherUserId },
//                 { sender: otherUserId, receiver: userId }
//             ]
//         }).sort({ createdAt: -1 });
//
//         if (lastMessage) {
//             // Cache the last message in Redis
//             await redisClient.set(redisKey, JSON.stringify(lastMessage));
//             await redisClient.expire(redisKey, 3600);  // Set expiration time
//         }
//
//         // Fetch unseen messages count
//         const unseenCount = await Message.countDocuments({
//             chat: { $in: [userId, otherUserId] }, // Chat between the two users
//             sender: { $ne: userId }, // Messages sent by the other user, not the current user
//             $expr: { $eq: ["$updatedAt", "$createdAt"] } // Compare updatedAt and createdAt within the same document
//         });
//
//         // Return the last message and unseen count from MongoDB
//         return res.status(200).json({
//             lastMessage: lastMessage,
//             numberOfUnseen: unseenCount
//         });
//     } catch (error) {
//         console.error(`Error fetching last message between user ${userId} and user ${otherUserId}:`, error);
//         res.status(400);
//         throw new Error(error.message);
//     }
// });

const markAllMessagesAsRead = asyncHandler(async (req, res) => {
    const userId = req.user._id // Assuming user information is stored in req.user
    const chatId = req.params.id
    console.log(`Marking all messages for chat ${chatId} as read...`)
    try {
        console.log(`Marking all messages for chat ${chatId} as read...`)

        // Update the updatedAt field for all messages in the specific chat
        const result = await Message.updateMany(
            { chat: chatId }, // Update all messages in the chat
            { $set: { updatedAt: new Date() } } // Set updatedAt to the current time
        )
        console.log(`Marked ${result.nModified} messages as read for chat ${chatId}`)
        const messages = await Message.find({
            chat: chatId,
            sender: { $ne: userId } // Exclude messages where the sender is the userId
        }).sort({ createdAt: -1 });
        // console.log('Messasewdsges:', messages)
        const seen = await Seen.create({
            seenUser: userId,
            chat: chatId,
            type: messages[0]?.type,
            content: messages[0]?.content,
            message: messages[0]?._id,
        })
        return res.status(200).json({ message: `Marked ${result.nModified} messages as read.` })
    } catch (error) {
        console.error(`Error marking messages as read for chat ${chatId}:`, error)
        res.status(500)
        throw new Error('Failed to mark messages as read')
    }
})


const getLastMessageSeen = asyncHandler(async (req, res) => {
    const userId = req.user._id // Assuming user information is stored in req.user
    const chatId = req.params.id

    console.log("this is in here get last message seen")

   try {
       const seen = await Seen.find({
           chat: chatId,
           seenUser: { $ne: userId }
       })
       if(seen.length!=0){
       res.status(200).send(seen[0])
       }
   } catch (error) {
       console.error(`Error fetching last message seen for chat ${chatId}:`, error)
       res.status(500)
       throw new Error('Failed to fetch last message seen')
   }

    // const messages = await Message.find({
    //     chat: chatId,
    //     sender: { $ne: userId } // Exclude messages where the sender is the userId
    // }).sort({ createdAt: -1 });

})



const startCall = asyncHandler(async (req, res) => {
    try {
        let { chat, meeting } = req.body
        let msg = await Message.create({
            chat,
            sender: req.user._id,
            type: 'link',
            content: meeting
        })
        res.status(201).json({ message: 'Call started successfully', msg });
        
    } catch (error) {
        
        res.status(400)
        throw new Error(error.message)
    }
});
const endCall = asyncHandler(async (req, res) => {
    try {
        let { chat, meeting } = req.body
        let msg = await Message.create({
            chat,
            sender: req.user._id,
            type: 'linkEnd',
            content: meeting
        })
        res.status(201).json({ message: 'Call Ended successfully', msg })
    } catch (error) {
        
        res.status(400)
        throw new Error(error.message)
    }
});

const instantChat = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user.id)

        if (!user) {
            return res.status(404).json({
                message: 'User not found',
                success: false
            })
        }

        if (user.instantChats === 0) {
            return res.status(400).json({
                message: 'No more instant chat left',
                success: false
            })
        }

        const swipedUser = await User.findById(req.body.swipedUserId)

        if (!swipedUser) {
            return res.status(404).json({
                message: 'Swiped user not found',
                success: false
            })
        }

        const chatResult = await accessChat(req.user.id, req.body.swipedUserId)

        if (chatResult.success) {
            if (!user.proAccount) {
                user.instantChats -= 1
            }

            await user.save()

            return res.status(200).json({
                message: 'Instant chat created successfully',
                chat: chatResult.chat,
                swipedUser,
                user,
                success: true
            })
        } else {
            return res.status(200).json({
                message: 'Chat already exists',
                chat: chatResult.chat,
                swipedUser,
                user,
                success: true
            })
        }
    } catch (error) {
        return res.status(500).json({
            message: 'Error creating instant chat',
            success: false
        })
    }
})

module.exports = {
    fetchChat,
    createMessage,
    getAllMessagesOfChat,
    getLastMessageOfChat,
    markAllMessagesAsRead,
    getLastMessageSeen,
    startCall,
    endCall,
    instantChat
}
