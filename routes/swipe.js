const express = require('express')
const router = express.Router()
const swipeController = require('../controllers/swipeController') // Adjust path as necessary
const { protect, authorize } = require('../middleware/auth')


router.post('/saveswipes', protect, swipeController.saveSwipe)

router.post('/rewind', protect, swipeController.rewindSwipe)

router.get('/likes', protect, swipeController.getLikes)

router.post('/unmatch' , protect, swipeController.unmatchUser)

router.post('/rematch' , protect, swipeController.rematchUser)
router.post('/singleChat' , protect, swipeController.singleChat)

module.exports = router


