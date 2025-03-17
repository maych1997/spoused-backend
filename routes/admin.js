const express = require('express')
const { registerAdmin } = require('../controllers/auth')
const adminController = require('../controllers/adminController')
const { protect, authorize } = require('../middleware/auth')
const router = express.Router()
const multer = require('multer')
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
    // Allowed mime types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']

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

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        fieldSize: 25 * 1024 * 1024, // 25MB
    },
    fileFilter: fileFilter,
})

router.post('/register', registerAdmin)

router.get(
    '/dashboard',
    protect,
    authorize('admin'),
    adminController.dashboardStats,
)
router.get('/earnings', protect, authorize('admin'), adminController.earnings)

router.get('/newusers', protect, authorize('admin'), adminController.newUsers)

router.get('/allusers', protect, authorize('admin'), adminController.allUsers)

router.delete(
    '/deleteuser/:id',
    protect,
    authorize('admin'),
    adminController.deleteUser,
)

router.post('/adduser', protect, authorize('admin'), adminController.addUser)

router.put(
    '/editUser/:id',
    protect,
    authorize('admin'),
    adminController.editUser,
)

router.get('/user/:id', protect, authorize('admin'), adminController.getUser)

router.put(
    '/editAdminProfile',
    protect,
    authorize('admin'),
    upload.single('file'),
    adminController.editAdmin,
)

router.put(
    '/changeAdminPassword',
    protect,
    authorize('admin'),
    adminController.changePasswordAdmin,
)

router.get(
    '/profile/me',
    protect,
    authorize('admin'),
    adminController.getAdminProfile,
)

router.get(/logout/, protect, authorize('admin'), adminController.logout)

module.exports = router
