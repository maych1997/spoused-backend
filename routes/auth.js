// Import necessary modules from Express, Passport, and controllers
const express = require('express')
const router = express.Router()

const {
  register,
  login,
  getUserMatches,
  getSettings,
  updateSettings,
  verifyEmail,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmailSend,
  getLikedByUsers,
  appleSignIn,
  deleteUser,
  googleSignIn,
  newPassword,
  removeFcm,
  setNotifications

} = require('../controllers/auth')
const { protect, authorize } = require('../middleware/auth')

// Route for user registration



router.post('/register', register)


// Route for user login
router.post('/login', login)

router.post('/apple', appleSignIn)

router.post('/signInGoogle', googleSignIn)

router.post('/verify-email/', verifyEmail)

router.post('/forgotPassword', forgotPassword)

router.post('/resetPassword', resetPassword)

router.post('/newPassword', newPassword)

router.put('/updatePassword', protect, updatePassword)

router.put('/verifyEmailSend', protect,  verifyEmailSend)

router.put('/resetPassword/:resettoken', resetPassword)

router.get('/usermatches', protect, getUserMatches)

router.get('/settings', protect, getSettings)

router.post('/settings', protect, updateSettings)

router.get('/likedBy', protect, getLikedByUsers)

router.post('/deleteAccount', protect, deleteUser)

router.post('/removeFcm', protect, removeFcm)


// Export the router for use in other parts of the application
module.exports = router
