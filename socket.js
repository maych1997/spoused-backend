const ErrorResponse = require('./utils/errorResponse')
const User = require('./models/User')
const jwt = require('jsonwebtoken')
const { sendMessage } = require('./firebase')


// Helper function to fetch user from Redis cache or MongoDB

module.exports = (io) => {
    io.use(async (socket, next) => {
        const token =
            socket.handshake.auth.token || socket.handshake.query.token

        if (!token) {
            return next(
                new ErrorResponse('Authentication token not provided', 401),
            )
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)

            // Find the user associated with the token
            const user = await User.findById(decoded.id)

            if (!user) {
                return next(new ErrorResponse('User not found', 401))
            }

            socket.user = user
            next()
        } catch (err) {
            console.log(err)
            return next(new ErrorResponse('Authentication failed', 401))
        }
    })

    io.on('connection', (socket) => {

        addUser(socket.user.id, socket.id)

        socket.on(
            'sendMessage',
            async ({ senderId, receiverId, type, data }) => {
                const user = getUser(receiverId)
                // const user = await getCachedUser(receiverId);
                if (!user && type === 'link') {
                    // const userData = await User.findById(receiverId)
                    // const senderData = await User.findById(senderId)
                    sendMessage({
                        senderId,
                        link: data,
                        type: 'link',
                    })
                }
                if (user) {
                    io.to(user.socketId).emit('getMessage', {
                        senderId,
                        type,
                        data,
                    })
                }
            },
        )

        socket.on('disconnect', () => {
            removeUser(socket.id)
            io.emit('getUsers', users)
        })
    })
}

let users = []
const addUser = (userId, socketId) => {
    users = users.filter((user) => user.userId !== userId)
    !users.some((user) => user.userId === userId) &&
        users.push({ userId, socketId })
}
const getUser = (userId) => {
    return users.find((user) => user.userId === userId)
}

const removeUser = (socketId) => {
    users = users.filter((user) => user.socketId !== socketId)
}
