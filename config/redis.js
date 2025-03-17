const redis = require('redis')

const redisClient = redis.createClient();

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

const connectRedis = async () => {
    await redisClient.connect();
    console.log('Connected to Redis');
};
module.exports = {connectRedis, redisClient}
