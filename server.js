const express = require('express')
const path = require('path')
const dotenv = require('dotenv');
const cors = require('cors')
const colors = require('colors')
const mongoSanitize = require('express-mongo-sanitize')
const hpp = require('hpp')
const helmet = require('helmet')
const cron = require('node-cron')
const User = require('./models/User')
const morgan = require('morgan')
const Queue = require('bull');

// Connect to Redis and create a new queue
const updateUserQueue = new Queue('updateUserQueue', {
    redis: { host: '127.0.0.1', port: 6379 } // Adjust with your Redis configuration
});


var http = require('http')
var socketIo = require('socket.io')
const app = express()
var server = http.createServer(app)
var io = socketIo(server, {
    path: '/socket',
    cors: {
        origin: '*',
    },
})

const scheduler = require('./scheduler')
const cookieParser = require('cookie-parser')
const errorHandler = require('./middleware/error')
const connectDB = require('./config/db')
const { connectRedis } = require('./config/redis')
const socket = require('./socket')

dotenv.config({ path: './.env' })

// app.use(helmet({ contentSecurityPolicy: false }))

app.set('io', io)
socket(io)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/v1/stripe/webhooks') {
        // Skip this middleware for Stripe webhook route
        next()
    } else {
        // Use express.json() middleware for all other routes
        express.json({ limit: '10mb' })(req, res, next)
    }
})

app.use(cookieParser())
app.use(hpp())
app.use(mongoSanitize())

//  --------------------------SCHEDULER------------------------------
scheduler.checkUserVerification()
scheduler.resetLikes()
scheduler.restrictNonVerifiedUsers()
scheduler.boostUsers()
scheduler.cacheLikes();
scheduler.cacheChats();
scheduler.cacheUsers();
scheduler.cacheMessages()
scheduler.cacheLastMessages()
// scheduler.cacheUserPhotos();
// scheduler.cacheUserPhotos();
// scheduler.cacheBlockedUsers();
//  --------------------------SCHEDULER------------------------------
app.use(cors())

connectDB()

connectRedis()

app.use('/api/v1/auth', require('./routes/auth'))
app.use('/api/v1/profile', require('./routes/profile'))
app.use('/api/v1/swipe', require('./routes/swipe'))
app.use('/api/v1/admin', require('./routes/admin'))

// Test Commit

// --------------------------DEPLOYMENT------------------------------

if (process.env.NODE_ENV === 'production') {
    console.log("coming2 ?production ? ")
    app.use(express.static(path.join(__dirname, 'client', 'build')))

    app.get('*', (req, res) => {
        return res.sendFile(
            path.resolve(__dirname, 'client', 'build', 'index.html'),
        )
    })
}


// --------------------------DEPLOYMENT------------------------------

app.use(errorHandler)
server.listen(process.env.PORT, () => {
    console.log("server running on port update 14 november " + process.env.PORT)
})

// Handling server errors with clean error messages
process.on('unhandledRejection', (err, promise) => {
    console.error('Unhandled rejection:', err);

    if (server && typeof server.close === 'function') {
        server.close(() => {
            console.log('Server closed due to unhandled rejection.');
            process.exit(1);
        });
    } else {
        console.error('Server is not defined or cannot be closed.');
        process.exit(1);
    }
});

