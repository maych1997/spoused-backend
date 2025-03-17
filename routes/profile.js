const express = require('express')
const router = express.Router()

const {
    updateGeneralInfo,
    onBoarding,
    uploadAndCompareFaces,
    uploadUserPhotos,
    uploadVideo,
    uploadIntroAudio,
    updateUserProfile,
    updateTravelModeAndLocation,
    updateDatingPreferences,
    getDatingPreferences,
    getMyProfile,
    getProfileById,
    boostProfile,
    useAsMainPhoto,
    deletePhoto,
    deleteVideo,
    deleteIntro,
    updateGoldStatus,
    updatePhone,
    updateNotification,
    updateProfileSharing,
    updateBlurPhoto,
    updateHideProfile,
    blockUser,
    getUserNotifications,
    contactUs, boostAfterPayment,
} = require('../controllers/profileController')
const { protect, authorize } = require('../middleware/auth')
const multer = require('multer')
const {
    createMessage,
    getAllMessagesOfChat,
    getLastMessageOfChat,
    fetchChat,
    startCall,
    instantChat, markAllMessagesAsRead, getLastMessageSeen,
    endCall,
} = require('../controllers/chatController')
const {
    payment,
    getTransactions,
} = require('../controllers/transactionController')
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
    // Allowed mime types
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        // 'image/webp',
        // 'application/pdf',
    ]

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true) // Accept file
    } else {
        cb(
            new Error(
                'Invalid file type. Only images and PDF files are allowed.',
            ),
            false,
        ) // Reject file
    }
}

const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 5MB limit, adjust as needed
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio')) {
            cb(null, true)
        } else {
            cb(new Error('Only audio files are allowed!'), false)
        }
    },
})

const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 10 MB limit
    fileFilter: (req, file, cb) => {
        // Check if the file MIME type is a video
        if (!file.mimetype.startsWith('video')) {
            return cb(new Error('Only video files are allowed!'), false)
        }
        // Define allowed extensions
        const fileExtension = file.mimetype
        const allowedExtensions = ['video/quicktime', 'video/mp4', 'video/avi', 'video/mov']

        // Check if the file extension is in the list of allowed extensions
        if (!allowedExtensions.includes(fileExtension)) {
            return cb(
                new Error(
                    `Only video files with these extensions are allowed: ${allowedExtensions.join(
                        ', ',
                    )}`,
                ),
                false,
            )
        }

        // If all checks pass, accept the file
        cb(null, true)
    },
})

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        fieldSize: 25 * 1024 * 1024, // 25MB
    },
    fileFilter: fileFilter,
})

const uploadVerification = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        fieldSize: 25 * 1024 * 1024, // 25MB
    },
})

router.post('/generalinfo', protect, upload.array('files'), updateGeneralInfo)
router.post('/updatePhone', protect, updatePhone)
router.post('/updateNotification', protect, updateNotification)
router.post('/updateProfileSharing', protect, updateProfileSharing)
router.post('/updateBlurPhoto', protect, updateBlurPhoto)
router.post('/updateHideProfile', protect, updateHideProfile)
router.post('/onboarding', protect, onBoarding)
router.post(
    '/compare-faces',
    protect,
    uploadVerification.array('files'),
    uploadAndCompareFaces,
)
router.post('/uploadPhotos', protect, upload.single('photos'), uploadUserPhotos)
router.post('/uploadVideo', protect, videoUpload.single('video'), uploadVideo)
router.post(
    '/uploadIntro',
    protect,
    audioUpload.single('intro'),
    uploadIntroAudio,
)
router.post('/swapPhotos', protect, useAsMainPhoto)
router.post('/deletePhoto', protect, deletePhoto)
router.post('/deleteVideo', protect, deleteVideo)
router.post('/deleteIntro', protect, deleteIntro)
router.post('/updateGold', protect, updateGoldStatus)

router.put('/updateProfile', protect, updateUserProfile)
router.put('/updateTravelMode', protect, updateTravelModeAndLocation)

router.put('/datingPreferences', protect, updateDatingPreferences)
router.get('/datingPreferences', protect, getDatingPreferences)

router.patch('/me', protect, getMyProfile)
router.get('/:id', protect, getProfileById)
router.put('/boost', protect, boostProfile)
router.put('/boostNumber', protect, boostAfterPayment)

// ?chat
router.post('/chat/message/add', protect, createMessage)
router.post('/chat/call', protect, startCall)
router.post('/chat/endCall', protect, endCall)
router.get('/chat/conversation/:id', protect, getAllMessagesOfChat)
router.get('/chat/conversationL/:id', protect, getLastMessageOfChat)
router.get('/chat/conversationSeen/:id', protect, markAllMessagesAsRead)
router.get('/chat/conversationLastSeen/:id', protect, getLastMessageSeen)
router.get('/chat/all-chats', protect, fetchChat)

router.post('/chat/instantchat', protect, instantChat)

// transactions
router.post('/payment', protect, payment)

router.post('/myNotifications', protect, getUserNotifications)

router.get('/getPayments', protect, authorize('admin'), getTransactions)


router.post('/blockUser', protect, blockUser)

router.post('/contactUs', protect, contactUs)

module.exports = router
