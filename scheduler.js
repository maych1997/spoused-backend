const cron = require('node-cron')
const Swipe = require('./models/Swipe');
const redisClient = require('./config/redis');
const User = require('./models/User')
const { createClient } = require('redis')
const Block = require('./models/Block')
const Chat = require('./models/Chat')
const Message = require('./models/Message')
const axios = require('axios');
const AWS = require('aws-sdk'); // AWS SDK for accessing S3
exports.checkUserVerification = async () => {
    cron.schedule('0 * * * *', async () => {
        const totalUsers = await User.find({ expired: false })

        totalUsers.forEach(async (document) => {
            const createdAt = new Date(document.createdAt)
            const currentDate = new Date()
            const daysDifference =
                Math.abs(currentDate - createdAt) / (1000 * 60 * 60 * 24) // Difference in days

            if (daysDifference > 7) {
                await User.findByIdAndUpdate(document._id, {
                    expired: true,
                })
            }
        })
    })
}

exports.resetLikes = async () => {
    cron.schedule('0 0 * * *', async () => {
        try {
            await User.updateMany(
                { proAccount: false },
                { $set: { likes: 15 } },
            )
            console.log('Likes reset for all non-pro users')
        } catch (error) {
            console.error('Error resetting likes:', error)
        }
    })
}

exports.restrictNonVerifiedUsers = async () => {
    cron.schedule('0 0 * * *', async () => {
        const sevenDaysAgo = new Date(
            new Date().setDate(new Date().getDate() - 7),
        )

        try {
            const result = await User.updateMany(
                {
                    createdAt: { $lt: sevenDaysAgo },
                    'profileVerification.verified': false,
                },
                {
                    $set: { accountStatus: 'unverified' },
                },
            )
        } catch (error) {
            console.error('Error updating users to unverified:', error)
        }
    })
}

exports.boostUsers = async () => {
    cron.schedule('0 * * * *', async () => {
        try {
            const users = await User.find({ boosted: true })
            users.forEach(async (user) => {
                const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
                if (user.boostedAt < twentyFourHoursAgo) {
                    user.boosted = false
                    user.boostedAt = null
                    await user.save()
                }
            })
        } catch (error) {
            console.error('Error boosting users:', error)
        }
    })
}

const schedulerRedisClient = createClient({ legacyMode: true });
schedulerRedisClient.connect().catch(console.error);
schedulerRedisClient.on('error', (err) => {
    console.error('Redis error in scheduler:', err);
});
exports.schedulerRedisClient = schedulerRedisClient;

exports.cacheLikes = async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching likes...');

            // Fetch all 'like' swipes for caching
            const likes = await Swipe.find({ action: 'like' })
                .select('userId swipedUserId createdAt')
                .lean();

            // Fetch all block relationships
            const blocks = await Block.find().lean();
            const blockedMap = new Set();

            // Populate blocked relationships in a Set for quick lookup
            blocks.forEach(block => {
                blockedMap.add(`${block.userId}_${block.blockedUserId}`);
                blockedMap.add(`${block.blockedUserId}_${block.userId}`);
            });

            const likesByUser = {};

            // Organize likes by user, filtering out blocked users
            likes.forEach((like) => {
                const userId = like.swipedUserId.toString();
                const likerId = like.userId.toString();

                // Check if either user has blocked the other
                if (!blockedMap.has(`${userId}_${likerId}`)) {
                    if (!likesByUser[userId]) likesByUser[userId] = [];
                    likesByUser[userId].push(JSON.stringify({
                        userId: like.userId,
                        createdAt: like.createdAt,
                    }));
                }
            });

            // Cache each user's likes in Redis in an optimized way
            for (const [userId, userLikes] of Object.entries(likesByUser)) {
                const redisKey = `likes:${userId}`;

                // Clear any existing list for the user in Redis
                await schedulerRedisClient.del(redisKey);

                // Push all user likes in one go
                await schedulerRedisClient.lPush(redisKey, ...userLikes);

                // console.log(`Cached likes for user ${userId}`);
            }

            console.log('Likes cached successfully');
        } catch (error) {
            console.error('Error caching likes:', error);
        }
    });
};
exports.cacheChats = async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching chats...');

            // Fetch all chats and populate necessary data
            const chats = await Chat.find()
                .populate('users', 'fullName email photos')
                .populate({
                    path: 'latestMessage',
                    populate: {
                        path: 'sender',
                        select: 'fullName photos email',
                    },
                })
                .sort({ updatedAt: -1 })
                .lean();

            // Fetch all blocked relationships
            const blocks = await Block.find().lean();
            const blockedMap = new Set();

            blocks.forEach(block => {
                blockedMap.add(`${block.userId}_${block.blockedUserId}`);
                blockedMap.add(`${block.blockedUserId}_${block.userId}`);
            });

            const chatsByUser = {};

            // Organize chats by user, filtering out blocked users
            chats.forEach(chat => {
                chat.users.forEach(user => {
                    const otherUser = chat.users.find(u => u._id.toString() !== user._id.toString());

                    if (otherUser && !blockedMap.has(`${user._id}_${otherUser._id}`)) {
                        if (!chatsByUser[user._id]) {
                            chatsByUser[user._id] = [];
                        }
                        chatsByUser[user._id].push(chat);
                    }
                });
            });

            // Cache each user's chats in Redis
            for (const [userId, userChats] of Object.entries(chatsByUser)) {
                const redisKey = `chats:${userId}`;

                // Clear existing data for this user
                await schedulerRedisClient.del(redisKey);

                // Cache the user's chats with full data including latestMessage.sender details
                for (const chat of userChats) {
                    await schedulerRedisClient.lPush(redisKey, JSON.stringify(chat));
                }
            }

            console.log('Chats cached successfully');
        } catch (error) {
            console.error('Error caching chats:', error);
        }
    });
};
exports.cacheBlockedUsers = async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching blocked users...');

            // Fetch all blocked relationships
            const blocks = await Block.find().lean();
            const blockedByUser = {};

            // Organize blocked users by each userId
            blocks.forEach(block => {
                if (!blockedByUser[block.userId]) {
                    blockedByUser[block.userId] = [];
                }
                if (!blockedByUser[block.blockedUserId]) {
                    blockedByUser[block.blockedUserId] = [];
                }
                blockedByUser[block.userId].push(block.blockedUserId.toString());
                blockedByUser[block.blockedUserId].push(block.userId.toString());
            });

            // Cache each user's blocked list in Redis
            for (const [userId, blockedUserIds] of Object.entries(blockedByUser)) {
                const redisKey = `blocked:${userId}`;
                await schedulerRedisClient.del(redisKey); // Clear existing data
                await schedulerRedisClient.sAdd(redisKey, blockedUserIds); // Add new blocked users
                await schedulerRedisClient.expire(redisKey, 3600); // Set expiry to avoid stale data
                console.log(`Cached blocked users for user ${userId}`);
            }

            console.log('Blocked users cached successfully');
        } catch (error) {
            console.error('Error caching blocked users:', error);
        }
    });
};
// Configure AWS S3
const s3 = new AWS.S3({
    region: 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    },
});

async function fetchAndCacheImageData(s3Key, redisKey) {
    try {
        // Check if the image is already cached
        const cachedImage = await schedulerRedisClient.get(redisKey);
        if (cachedImage) {
            console.log(`Image data already cached for ${redisKey}`);
            return; // Skip if data already cached
        }

        // Fetch image data from S3
        const params = { Bucket: 'your-bucket-name', Key: s3Key };
        const data = await s3.getObject(params).promise();

        // Cache image data with a 1-hour expiration
        await schedulerRedisClient.set(redisKey, data.Body, 'EX', 3600);
        console.log(`Cached image data for ${redisKey}`);
    } catch (error) {
        console.error(`Error caching image for ${s3Key}:`, error);
    }
}

async function fetchAndCacheImage(photoUrl, redisKey) {
    try {
        // Check if the image is already cached
        const cachedImage = await schedulerRedisClient.get(redisKey);
        if (cachedImage) {
            console.log(`Image data already cached for ${redisKey}`);
            return; // Skip if data already cached
        }

        // Fetch the image from the provided URL
        const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });

        // Cache image data (binary) with a 1-hour expiration
        await schedulerRedisClient.set(redisKey, response.data, 'EX', 3600);
        // console.log(`Cached image data for ${redisKey}`);
    } catch (error) {
        console.error(`Error caching image from ${photoUrl}:`, error);
    }
}

exports.cacheUserPhotos = () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching user photos...');

            // Fetch users with photos
            const users = await User.find({ photos: { $exists: true, $ne: [] } }).select('photos').lean();

            for (const user of users) {
                for (const photoUrl of user.photos) {
                    // Use the URL as part of the Redis key for uniqueness
                    const redisKey = `user_photo_data:${user._id}:${photoUrl}`;

                    // Cache the image from the photo URL
                    await fetchAndCacheImage(photoUrl, redisKey);
                }
            }

            console.log('User photos cached successfully');
        } catch (error) {
            console.error('Error caching user photos:', error);
        }
    });
};
exports.cacheUsers = async () => {
    cron.schedule('*/30 * * * * *', async () => {  // Runs every 30 seconds
        try {
            console.log('Caching users...');

            // Fetch all users from MongoDB (or you can filter based on your needs)
            const users = await User.find().lean(); // .lean() for performance improvement

            for (const user of users) {
                const redisKey = `user:${user._id}`; // Redis key for each user

                // Cache each user's data in Redis, setting a 1-hour expiration
                await schedulerRedisClient.set(redisKey, JSON.stringify(user), 'EX', 3600);
            }

            console.log('Users cached successfully');
        } catch (error) {
            console.error('Error caching users:', error);
        }
    });
};
exports.cacheMessages = async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching messages...');

            // Fetch all chat messages
            const chats = await Chat.find().lean();

            for (const chat of chats) {
                const redisKey = `chat:${chat._id}:messages`;
                const messages = await Message.find({ chat: chat._id }).lean();

                // Clear existing data for the chat in Redis
                await schedulerRedisClient.del(redisKey);

                // Push all messages to Redis list
                for (const message of messages) {
                    await schedulerRedisClient.rPush(redisKey, JSON.stringify(message));
                }

                // Set an expiration (e.g., 1 hour = 3600 seconds)
                await schedulerRedisClient.expire(redisKey, 3600);
            }

            console.log('Messages cached successfully with expiration');
        } catch (error) {
            console.error('Error caching messages:', error);
        }
    });
};
exports.cacheLastMessages = async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            console.log('Caching last messages between users...');

            // Fetch all chat messages
            const chats = await Chat.find().lean();

            for (const chat of chats) {
                // Fetch the latest message for this chat
                const lastMessage = await Message.findOne({ chat: chat._id })
                    .sort({ createdAt: -1 })
                    .lean();

                if (lastMessage) {
                    // Assuming the chat has exactly two users
                    const [user1, user2] = chat.users;

                    const redisKey = `chat:last:${user1}:${user2}`;

                    // Cache the last message in Redis for both users
                    await schedulerRedisClient.set(redisKey, JSON.stringify(lastMessage));
                    await schedulerRedisClient.set(`chat:last:${user2}:${user1}`, JSON.stringify(lastMessage));

                    // Set an expiration (e.g., 1 hour = 3600 seconds)
                    await schedulerRedisClient.expire(redisKey, 3600);
                    await schedulerRedisClient.expire(`chat:last:${user2}:${user1}`, 3600);
                }
            }

            console.log('Last messages cached successfully');
        } catch (error) {
            console.error('Error caching last messages:', error);
        }
    });
};


