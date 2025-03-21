const mongoose = require('mongoose')
// const dburi = "mongodb+srv://diksha:qpsj24IxaLcg4Kmy@getspoused.zn3qe.mongodb.net/?retryWrites=true&w=majority&appName=getSpoused"
const dburi = 'mongodb://127.0.0.1:27017/mydatabase'
// const connectDB = async () => {
//
//     const conn = await mongoose.connect(dburi, {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//         serverSelectionTimeoutMS: 30000
//     })
// }

const connectDB = async () => {
    try {
        await mongoose.connect(dburi, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1); // Exit the app if there's an error
    }
};


module.exports = connectDB
