const Swipe = require('../models/Swipe') // Adjust path as necessary
const User = require('../models/User')
const asyncHandler = require('express-async-handler')
const Notification = require('../models/Notification')
const Chat = require('../models/Chat')
const { redisClient } = require('../config/redis')
const Block = require('../models/Block')
const Message = require('../models/Message')
const { sendMessage } = require('../firebase')
const accessChat = asyncHandler(async (userid1, userid2) => {
    var isChat = await Chat.find({
        $and: [
            { users: { $elemMatch: { $eq: userid1 } } },
            { users: { $elemMatch: { $eq: userid2 } } },
        ],
    })
        // Population user Model, except password id
        .populate('users', '-password')
        .populate('latestMessage')

    if (isChat.length > 0) {
    } else {
        var chatData = {
            users: [userid1, userid2],
        }

        try {
            const createdChat = await Chat.create(chatData)

            const FullChat = await Chat.findOne({
                _id: createdChat._id,
            }).populate('users', '-password')
            // res.status(200).send(FullChat)
        } catch (error) {
            res.status(400)
            throw new Error(error.message)
        }
    }
})

// POST: Save a swipe and check for matches

exports.saveSwipe = async (req, res) => {
    console.log("in here for swipes?")
    try {
        const { swipedUserId, action } = req.body
        const userId = req.user.id
        const user = await User.findById(userId)
        const swipedUser = await User.findById(swipedUserId)

        if (!user.proAccount && user.likes === 0) {
            console.log("so it should be here. when user have no likes and not premium")
            return res.status(400).json({ message: 'No more likes left' })
        } else if (!user.proAccount) {
            user.likes = user.likes - 1
            await user.save()
        }

        // Save the swipe data
        const swipe = new Swipe({ userId, swipedUserId, action })
        await swipe.save()

        await redisClient.lPush(
            `swipes:${userId}`,
            JSON.stringify({ swipedUserId, action }),
        )
        const result = await redisClient.lRange(`swipes:${userId}`, 0, -1);
        // Check for a match (both users liked each other)
        const reverseSwipe = await Swipe.findOne({
            userId: swipedUserId,
            swipedUserId: userId,
            action,
        })
        if (
            action === 'like' &&
            reverseSwipe &&
            reverseSwipe.action === 'like'
        ) {
            await accessChat(req.user.id, swipedUserId)
            await Notification.create({
                title: 'Swipe Match',
                content: `${user.fullName} has liked you back!`,
                user: swipedUserId,
            })

            if (swipedUser.fcm.length !== 0) {
                await sendMessage({
                    title: 'Swipe Match',
                    body: `${user.fullName} has liked you back!`,
                    token: [swipedUser.fcm],
                })
            }
            return res.status(200).send({ message: 'Match', success: true })
        }
        await Notification.create({
            title: 'Swipe',
            content: `${user.fullName} has liked you.!`,
            user: swipedUserId,
        })

        if (swipedUser.fcm.length !== 0) {
            await sendMessage({
                title: 'Swipe Match',
                body: `${user.fullName} has liked you!`,
                token: [swipedUser.fcm],
            })
        }

        res.status(200).send({
            message: 'Swipe saved successfully',
            success: true,
            user,
        })
    } catch (error) {
        res.status(500).send({
            message: 'Error saving swipe',
            success: false,
        })
    }
}

exports.rewindSwipe = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user.proAccount && user.rewinds == 0) {
            return res
                .status(400)
                .json({ message: 'No more rewinds left', success: false })
        }

        // Get the last swipe from Redis
        const swipeData = await redisClient.lPop(`swipes:${userId}`)

        if (!swipeData) {
            return res
                .status(400)
                .json({ message: 'No swipes to rewind', success: false })
        }

        const { swipedUserId, action } = JSON.parse(swipeData)

        // Remove the swipe from the database
        await Swipe.findOneAndDelete({ userId, swipedUserId, action })

        const userSwiped = await User.findById(swipedUserId)

        if (!user.proAccount) {
            user.rewinds = user.rewinds - 1
            await user.save()
        }

        res.status(200).json({
            message: 'Swipe rewinded successfully',
            success: true,
            user: userSwiped,
        })
    } catch (error) {
        res.status(500).send({
            message: 'Error rewinding swipe',
            success: false,
        })
    }
}

// Calculate age from birthdate
function calculateAge(birthday) {
    let today = new Date()
    let birthDate = new Date(birthday)
    let age = today.getFullYear() - birthDate.getFullYear()
    let m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }
    return age
}

function timeSince(date) {
    let seconds = Math.floor((new Date() - date) / 1000)
    let interval = seconds / 31536000
    if (interval > 1) {
        return Math.floor(interval) + ' years'
    }
    interval = seconds / 2592000
    if (interval > 1) {
        return Math.floor(interval) + ' months'
    }
    interval = seconds / 86400
    if (interval > 1) {
        return Math.floor(interval) + ' days'
    }
    interval = seconds / 3600
    if (interval > 1) {
        return Math.floor(interval) + ' hours'
    }
    interval = seconds / 60
    if (interval > 1) {
        return Math.floor(interval) + ' minutes'
    }
    return Math.floor(seconds) + ' seconds'
}

function counthours(date) {
    let seconds = Math.floor((new Date() - date) / 1000)
    let interval = seconds / 3600
    return Math.floor(interval)
}
exports.getLikes = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch likes from Redis
        const likesData = await redisClient.lRange(`likes:${userId}`, 0, -1);
        const likes = likesData.map(JSON.parse);

        const likeUserIds = likes.map((like) => like.userId);

        // Fetch reverse likes to filter out mutual likes
        const reverseLikes = await Swipe.find({
            swipedUserId: { $in: likeUserIds },
            userId: userId,
        }).lean();

        const reverseLikesSet = new Set(reverseLikes.map(like => like.swipedUserId.toString()));

        // Filter likes data based on reverse likes
        const filteredLikes = likes.filter(like =>
            !reverseLikesSet.has(like.userId)
        );

        // Fetch additional user data from MongoDB in one query for filtered likes
        const users = await User.find({ _id: { $in: filteredLikes.map(like => like.userId) } })
            .select('fullName birthday createdAt profession ethnicGroup location photos')
            .lean();

        const usersData = users.map((user) => ({
            _id: user._id,
            photo: user.photos[0],
            fullName: user.fullName,
            age: calculateAge(user.birthday),
            profession: user.profession,
            ethnicity: user.ethnicGroup,
            location: user.location,
            timeOfLike: timeSince(new Date(filteredLikes.find(like => like.userId === user._id.toString()).createdAt)),
            justJoined: counthours(user.createdAt) < 24,
        }));

        res.status(200).json({ success: true, count: usersData.length, users: usersData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error fetching likes' });
    }
};
// exports.getLikes = async (req, res) => {
//     try {
//         // Fetch all 'like' swipes for the logged-in user
//         const likes = await Swipe.find({
//             swipedUserId: req.user.id,
//             action: 'like',
//         })
//             .populate({
//                 path: 'userId',
//                 select: 'fullName birthday createdAt profession ethnicGroup location createdAt photos',
//             })
//             .lean();
//
//         const likeUserIds = likes.map((like) => like.userId._id);
//
//         // Fetch all reverse likes and blocked users in batch queries
//         const reverseLikes = await Swipe.find({
//             swipedUserId: { $in: likeUserIds },
//             userId: req.user.id,
//         }).lean();
//
//         const blockedUsers = await Block.find({
//             $or: [
//                 { userId: req.user.id, blockedUserId: { $in: likeUserIds } },
//                 { userId: { $in: likeUserIds }, blockedUserId: req.user.id },
//             ],
//         }).lean();
//
//         const reverseLikesSet = new Set(reverseLikes.map(like => like.swipedUserId.toString()));
//         const blockedUsersSet = new Set(
//             blockedUsers.map(block =>
//                 block.userId.toString() === req.user.id ? block.blockedUserId.toString() : block.userId.toString()
//             )
//         );
//
//         const finalLikes = likes.filter(like =>
//             !reverseLikesSet.has(like.userId._id.toString()) &&
//             !blockedUsersSet.has(like.userId._id.toString())
//         );
//
//         const users = finalLikes.map((like) => ({
//             _id: like.userId._id,
//             photo: like.userId.photos[0],
//             fullName: like.userId.fullName,
//             age: calculateAge(like.userId.birthday),
//             profession: like.userId.profession,
//             ethnicity: like.userId.ethnicGroup,
//             location: like.userId.location,
//             timeOfLike: timeSince(like.createdAt),
//             justJoined: counthours(like.userId.createdAt) < 24,
//         }));
//
//         res.status(200).json({ success: true, count: users.length, users });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Error fetching likes' });
//     }
// };

// API FOR UNMATCHING A USER
exports.unmatchUser = async (req, res) => {
    try {
        const { swipedUser } = req.body
        const user = req.user.id

        if (!swipedUser) {
            return res
                .status(400)
                .json({ message: 'Swiped user not provided', success: false })
        }

        if (!user) {
            return res
                .status(400)
                .json({ message: 'User not provided', success: false })
        }

        // Find the match
        const match = await Chat.findOne({
            $and: [
                { users: { $elemMatch: { $eq: user } } },
                { users: { $elemMatch: { $eq: swipedUser } } },
            ],
        })

        if (!match) {
            return res
                .status(400)
                .json({ message: 'Match not found', success: false })
        }

        // Update the match to unmatch
        match.unmatch = true
        await match.save()

        res.status(200).json({
            success: true,
            message: 'Unmatched successfully',
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            success: false,
            message: 'Error unmatching user',
        })
    }
}

exports.rematchUser = async (req, res) => {
    try {
        const { swipedUser } = req.body
        const user = req.user.id

        if (!swipedUser) {
            return res
                .status(400)
                .json({ message: 'Swiped user not provided', success: false })
        }

        if (!user) {
            return res
                .status(400)
                .json({ message: 'User not provided', success: false })
        }

        // Find the match
        const match = await Chat.findOne({
            $and: [
                { users: { $elemMatch: { $eq: user } } },
                { users: { $elemMatch: { $eq: swipedUser } } },
            ],
        })

        if (!match) {
            return res
                .status(400)
                .json({ message: 'Match not found', success: false })
        }

        // Update the match to match
        match.unmatch = false
        await match.save()

        res.status(200).json({
            success: true,
            message: 'Unmatched successfully',
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            success: false,
            message: 'Error unmatching user',
        })
    }
}

exports.singleChat = async (req, res) => {
    try {
        const { chatId } = req.body
        const chat = await Chat.findById(chatId)

        if (!chat) {
            return res.status(400).json({
                success: false,
                message: 'Chat not found',
            })
        }

        res.status(200).json({ success: true, chat })
    } catch (error) {
        res.status(500).send({
            message: 'Error fetching chat',
            success: false,
        })
    }
}
