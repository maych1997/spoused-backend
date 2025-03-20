const User = require('../models/User')
const ErrorResponse = require('../utils/errorResponse')
const asyncHandler = require('../middleware/async')
const axios = require('axios')
const elasticEmail = require('elasticemail')
const sendEmail = require('../utils/sendEmail')
const crypto = require('crypto')
const firebase = require('firebase')
const { error, log } = require('console')
const s3 = require('../config/aws-config')
const multer = require('multer')
const multerS3 = require('multer-s3')
const rekognitionClient = require('../config/rekognition')
const sharp = require('sharp')
const { CompareFacesCommand } = require('@aws-sdk/client-rekognition') // Import Rekognition SDK
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
const Block = require('../models/Block')
const Notification = require('../models/Notification')
const AWS = require('aws-sdk') // Import AWS SDK

// Configure AWS Rekognition with your region and credentials
AWS.config.update({
    region: 'ap-southeast-1', // Ensure this matches your AWS region
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
})

// const ffmpeg = require('fluent-ffmpeg')
// const fs = require('fs')

// ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg')
const s3Client = new S3Client({
    region: 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
})

s3.config.update({ region: 'ap-southeast-1' })

function inchesToCentimeters(inches) {
    const centimeters = inches * 2.54
    return centimeters.toFixed(1) // Round to 1 decimal place
}

function centimetersToInches(centimeters) {
    const inches = centimeters / 2.54
    return inches.toFixed(1) // Round to 1 decimal place
}

function calculateAge(birthDate) {
    const today = new Date()
    const dob = new Date(birthDate)
    let age = today.getFullYear() - dob.getFullYear()
    const monthDiff = today.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--
    }
    return age
}

exports.updateGeneralInfo = async (req, res, next) => {
    try {
        // Check if the user exists
        const userId = req.user.id
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        // Save and verify user information
        const {
            fullName,
            birthday,
            gender,
            phoneNumber,
            phoneNumberVerified,
            phoneCode
        } = req.body
        if (
            !fullName ||
            !birthday ||
            !gender ||
            !phoneCode ||
            !phoneNumber ||
            !phoneNumberVerified ||
            !phoneCode
        ) {
            return res
                .status(400)
                .json({ message: 'Missing required user information' })
        }
        //   const user1 = await User.findById(userId)
        res.status(200).json({
            message: 'User information verified successfully',
            user,
            success: true
        })
        await updateUserQueue.add({
            userId,
            fullName,
            birthday,
            gender,
            phoneNumber,
            phoneNumberVerified,
            phoneCode
        })
    } catch (error) {
        res.status(500).json({
            message: 'Error uploading photos and verifying user information',
            error: error.message
        })
    }
}

const Queue = require('bull')
const updateUserQueue = new Queue('updateUserQueue', {
    redis: { host: '127.0.0.1', port: 6379 } // Adjust based on your Redis configuration
})
const userProfileSaveQueue = new Queue('userProfileSaveQueue', {
    redis: { host: '127.0.0.1', port: 6379 } // Configure Redis as needed
})

updateUserQueue.process(async (job) => {
    const { userId, fullName, birthday, gender, phoneNumber, phoneNumberVerified, phoneCode } = job.data

    try {
        const user = await User.findById(userId)
        if (user) {
            user.fullName = fullName
            user.Age = calculateAge(birthday)
            user.birthday = birthday
            user.gender = gender
            user.phoneCode = phoneCode
            user.phoneNumber = phoneNumber
            user.phoneNumberVerified = phoneNumberVerified
            user.generalInfoCompleted = true
            await user.save()
        }
    } catch (error) {
        console.error('Error processing job:', error.message)
    }
})

exports.onBoarding = async (req, res, next) => {
    console.log('it is in onboarding completed')
    try {
        const userId = req.user.id
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        // Save and verify user information
        const {
            profession,
            ethnicGroup,
            education,
            location,
            height,
            maritalStatus,
            datingPreferences,
            smoking,
            children,
            lookingFor,
            religion,
            drink,
            starSign,
            interests,
            personalityTraits,
            biography,
            locationCoordinates
        } = req.body

        user.profession = profession
        user.ethnicGroup = ethnicGroup
        user.education = education
        user.location = location
        user.height = height
        user.maritalStatus = maritalStatus
        user.datingPreferences = datingPreferences
        user.smoking = smoking
        user.children = children
        user.lookingFor = lookingFor
        user.religion = religion
        user.drink = drink
        user.starSign = starSign
        user.interests = interests
        user.personalityTraits = personalityTraits
        user.biography = biography
        user.locationCoordinates = locationCoordinates
        user.onboardingCompleted = true
        await user.save()
        console.log('its looks like it completes')
        res.status(200).json({
            message: 'Complete Profile Info Updated Successfully',
            user
        })
    } catch (error) {
        console.log('it has an error in completaion')
        res.status(500).json({
            message: 'Error updating Profile Info',
            error: error.message
        })
    }
}

// Edit Profile

exports.updatePhone = async (req, res, next) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        const { phoneCode, phoneNumber } = req.body

        if (!phoneCode || !phoneNumber) {
            return res.status(400).json({
                message: 'Phone code and number are required',
                success: false
            })
        }

        user.phoneCode = phoneCode
        user.phoneNumber = phoneNumber

        await user.save()

        res.status(200).json({
            message: 'Phone number updated successfully',
            success: true,
            user: user
        })
    } catch (error) {
        res.status(500).json({
            message: 'Failed to update phone number',
            success: false
        })
    }
}

exports.updateNotification = async (req, res) => {
    console.log('this is update notification lets see what is happening')
    console.log(req.body)
    console.log('this is update notification lets see what is happening')
    try {
        const userId = req.user.id

        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        user.notifications = req.body.notifications

        if (user.notifications === false) {
            user.fcm = ''
        }

        if (user.notifications === true) {
            user.fcm = req.body.fcm
        }

        await user.save()

        res.status(200).json({
            message: 'Notification settings updated successfully',
            success: true,
            user: user
        })
    } catch (error) {
        res.status(500).json({
            message: 'Failed to update notification settings',
            success: false
        })
    }
}

exports.updateProfileSharing = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        const { profileSharing } = req.body

        user.profilesharing = profileSharing

        await user.save()

        res.status(200).json({
            message: 'Profile sharing settings updated successfully',
            success: true,
            user: user
        })
    } catch (error) {
        res.status(500).json({
            message: 'Failed to update profile sharing settings',
            success: false
        })
    }
}

exports.updateBlurPhoto = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        const { blurPhoto } = req.body

        user.photoPrivacy = blurPhoto

        await user.save()

        res.status(200).json({
            message: 'Blur photo settings updated successfully',
            success: true,
            user: user
        })
    } catch (error) {
        res.status(500).json({
            message: 'Failed to update blur photo settings',
            success: false
        })
    }
}

exports.updateHideProfile = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        const { hideProfile } = req.body

        user.hideprofile.sharing = hideProfile

        await user.save()

        res.status(200).json({
            message: 'Hide profile settings updated successfully',
            success: true,
            user: user
        })
    } catch (error) {
        res.status(500).json({
            message: 'Failed to update hide profile settings',
            success: false
        })
    }
}
exports.uploadUserPhotos = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)
    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    const photoURLs = user.photos
    const file = req.file
    const imageName = `image-${Date.now()}.png`
    const key = `${userId}/${imageName}`

    let imageBuffer = file.buffer

// Check if image size exceeds 5 MB
    if (imageBuffer.length > 5242880) {
        console.log(`Image is larger than 5 MB, compressing...`)
        // Compress the image until it's below the 5 MB limit
        imageBuffer = await sharp(file.buffer)
            .jpeg({ quality: 60 }) // Adjust quality as needed to reduce size
            .toBuffer()
    }
    // Step 1: Use AWS Rekognition to detect labels (including 'Person')
    try {
        const detectLabelsParams = {
            Image: {
                Bytes: imageBuffer
            },
            MaxLabels: 10, // Number of labels to detect
            MinConfidence: 60 // Minimum confidence level for the labels
        }

        const rekognition = new AWS.Rekognition()
        const detectLabelsResponse = await rekognition.detectLabels(detectLabelsParams).promise()
        console.log('this is the detect labels')
        console.log(detectLabelsParams)
        console.log('this is the detect labels')
        // Check if the 'Person' label exists
        const containsPerson = detectLabelsResponse.Labels.some(label => label.Name.toLowerCase() === 'person')

        if (!containsPerson) {
            return res.status(400).json({ message: 'The image does not contain a person. Please upload a valid profile picture.' })
        }

        // Step 2: Resize and compress the image
        const compressedImage = await sharp(file.buffer)
            .resize({ width: 1024, height: 1024, fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer()

        // Step 3: Upload the image to AWS S3
        const putObjectCommand = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
            Key: key,
            Body: compressedImage,
            ContentType: file.mimetype
        })

        await s3Client.send(putObjectCommand)
        const imageUrl = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
        photoURLs[req.body.index] = imageUrl

        // Step 4: If the user is verified, proceed with AWS Rekognition face comparison
        if (user.profileVerification.verified) {
            const client = new s3.Rekognition()
            const params = {
                SourceImage: {
                    S3Object: {
                        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                        Name: user.profileVerification.verifiedDocument.split('.com/')[1]
                    }
                },
                TargetImage: {
                    S3Object: {
                        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                        Name: key
                    }
                },
                SimilarityThreshold: 95
            }

            client.compareFaces(params, function(err, response) {
                if (err) {
                    return res.status(500).json({
                        message: 'Upload and Verification failed',
                        error: err.message,
                        verified: false
                    })
                } else {
                    try {
                        let isMatchFound = false
                        let foundSimilarity = 0

                        if (response.FaceMatches && response.FaceMatches.length > 0) {
                            response.FaceMatches.forEach((data) => {
                                let similarity = data.Similarity
                                if (similarity > 95) {
                                    isMatchFound = true
                                    foundSimilarity = similarity
                                }
                            })

                            user.photos = photoURLs
                            user.save()
                            return res.json({
                                verified: true,
                                photos: user.photos
                            })
                        }

                        return res.json({
                            message: 'Face comparison failed',
                            verified: false
                        })
                    } catch (error) {
                        console.error('Error uploading photos and comparing faces:', error)
                        res.status(500).json({
                            message: 'Error uploading photos and comparing faces',
                            error: error.message
                        })
                    }
                }
            })
        } else {
            user.photos = photoURLs
            await user.save()
            res.json({ verified: true, photos: user.photos })
        }
    } catch (error) {
        console.error(`Error uploading image:`, error)
        return res.status(500).json({ message: `Error uploading image` })
    }
}


// exports.uploadUserPhotos = async (req, res) => {
//     // console.log("it is for uploading image")
//     // console.log(req)
//     // console.log("it is for uploading image")
//     const userId = req.user.id
//     const user = await User.findById(userId)
//     if (!user) {
//         return res.status(404).json({ message: 'User not found' })
//     }
//
//     const photoURLs = user.photos
//
//     const file = req.file
//     const imageName = `image-${Date.now()}.png`
//     const key = `${userId}/${imageName}`
//
//     const compressedImage = await sharp(file.buffer)
//         .resize({ width: 1024, height: 1024, fit: 'inside' }) // resize to 1024x1024
//         .jpeg({ quality: 80 }) // compress to 80% quality
//         .toBuffer()
//
//     const putObjectCommand = new PutObjectCommand({
//         Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//         Key: key,
//         Body: compressedImage,
//         ContentType: file.mimetype,
//     })
//     try {
//         await s3Client.send(putObjectCommand)
//         const imageUrl = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
//         photoURLs[req.body.index] = imageUrl
//
//         if (user.profileVerification.verified) {
//             const client = new s3.Rekognition()
//             const params = {
//                 SourceImage: {
//                     S3Object: {
//                         Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                         Name: user.profileVerification.verifiedDocument.split(
//                             '.com/',
//                         )[1],
//                     },
//                 },
//                 TargetImage: {
//                     S3Object: {
//                         Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                         Name: key,
//                     },
//                 },
//                 SimilarityThreshold: 95,
//             }
//
//             client.compareFaces(params, function (err, response) {
//                 if (err) {
//                     return res.status(500).json({
//                         message: 'Upload and Verification failed',
//                         error: err.message,
//                         verified: false,
//                     })
//                 } else {
//                     try {
//                         let isMatchFound = false
//                         let foundSimilarity = 0
//
//                         if (
//                             response.FaceMatches &&
//                             response.FaceMatches.length > 0
//                         ) {
//                             response.FaceMatches.forEach((data) => {
//                                 let similarity = data.Similarity
//                                 if (similarity > 95) {
//                                     isMatchFound = true
//                                     foundSimilarity = similarity
//                                 }
//                             })
//
//                             user.photos = photoURLs
//                             user.save()
//                             return res.json({
//                                 verified: true,
//                                 photos: user.photos,
//                             })
//                         }
//
//                         return res.json({
//                             message: 'Face comparison failed',
//                             verified: false,
//                         })
//                     } catch (error) {
//                         console.error(
//                             'Error uploading photos and comparing faces:',
//                             error,
//                         )
//                         res.status(500).json({
//                             message:
//                                 'Error uploading photos and comparing faces',
//                             error: error.message,
//                         })
//                     }
//                 }
//             })
//         } else {
//             user.photos = photoURLs
//             await user.save()
//             res.json({ verified: true, photos: user.photos })
//         }
//     } catch (error) {
//         console.error(`Error uploading image:`, error)
//         return res.status(500).json({ message: `Error uploading image` })
//     }
// }

exports.useAsMainPhoto = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    const { index } = req.body
    if (index < 0 || index >= user.photos.length) {
        return res.status(400).json({ message: 'Invalid photo index' })
    }

    // swap the first and the req.body.index photo
    const temp = user.photos[0]
    user.photos[0] = user.photos[index]
    user.photos[index] = temp

    await user.save()

    res.status(200).json({
        message: 'Main photo updated successfully',
        success: true
    })
}

exports.deletePhoto = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    const { index } = req.body
    if (index < 0 || index >= user.photos.length) {
        return res.status(400).json({ message: 'Invalid photo index' })
    }

    const photoUrl = user.photos[index]
    const urlObject = new URL(photoUrl)
    const key = urlObject.pathname.substring(1) // Remove the leading slash

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
        Key: key
    }

    try {
        await s3Client.send(new DeleteObjectCommand(params))
        // Photo deleted successfully from S3, now remove from user's photos array
        user.photos.splice(index, 1)
        await user.save()

        res.status(200).json({
            message: 'Photo deleted successfully',
            success: true
        })
    } catch (err) {
        console.err(err) // an error occurred
        return res
            .status(500)
            .json({ message: 'Failed to delete photo from S3', success: false })
    }
}

exports.uploadVideo = async (req, res) => {
    const userId = req.user.id

    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).send('User not found.')
    }

    if (!req.file) {
        return res
            .status(400)
            .json({ message: 'No video found', success: false })
    }

    const videoName = `video-${userId}-${Date.now()}.mp4`
    const key = `videos/${userId}/${videoName}`
    const buffer = req.file.buffer
    const putObjectCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
        Key: key,
        Body: buffer,
        ContentType: 'video/mp4'
    })

    try {
        const data = await s3Client.send(putObjectCommand)
        const videourl = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
        user.video = videourl
        await user.save()
        res.status(200).json({
            message: 'Video uploaded successfully!',
            success: true
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({
            message: 'Failed to upload video.',
            success: false
        })
    }
}

exports.deleteVideo = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    if (!user.video) {
        return res
            .status(400)
            .json({ message: 'No video found', success: false })
    }

    const videoUrl = user.video
    const urlObject = new URL(videoUrl)
    const key = urlObject.pathname.substring(1) // Remove the leading slash

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
        Key: key
    }

    try {
        await s3Client.send(new DeleteObjectCommand(params))

        user.video = null
        await user.save()

        res.status(200).json({
            message: 'Video deleted successfully',
            success: true
        })
    } catch (err) {
        console.err(err) // an error occurred
        return res
            .status(500)
            .json({ message: 'Failed to delete video from S3', success: false })
    }
}

exports.uploadIntroAudio = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    if (!req.file) {
        return res
            .status(400)
            .json({ message: 'No audio file uploaded.', success: false })
    }

    const audioName = `intro-${userId}-${Date.now()}.mp3` // Assume MP3, adjust based on actual data
    const key = `intros/${userId}/${audioName}` // Store in a folder for organization

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES, // Your S3 Bucket name
        Key: key,
        Body: req.file.buffer,
        ContentType: 'audio/mpeg' // Assume MP3, adjust based on actual data
    }

    try {
        const putObjectCommand = new PutObjectCommand(params)

        let data = await s3Client.send(putObjectCommand)
        const introUrl = `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${key}`
        // Save the audio URL to the user's profile or another appropriate field
        user.intro = introUrl
        await user.save()

        res.status(200).json({
            message: 'Intro audio uploaded successfully!',
            success: true
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({
            message: 'Failed to upload intro audio.',
            success: false
        })
    }
}

exports.deleteIntro = async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)

    if (!user) {
        return res.status(404).json({ message: 'User not found' })
    }

    if (!user.intro) {
        return res
            .status(400)
            .json({ message: 'No intro audio found', success: false })
    }

    const audioUrl = user.intro
    const urlObject = new URL(audioUrl)
    const key = urlObject.pathname.substring(1) // Remove the leading slash

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
        Key: key
    }

    try {
        await s3Client.send(new DeleteObjectCommand(params))

        user.intro = null
        await user.save()

        res.status(200).json({
            message: 'Intro audio deleted successfully',
            success: true
        })
    } catch (err) {
        console.err(err) // an error occurred
        return res.status(500).json({
            message: 'Failed to delete intro audio from S3',
            success: false
        })
    }
}

exports.updateUserProfile = async (req, res) => {
    console.log('Received request body:', req.body)
    console.log('Authenticated user ID:', req.user.id)

    const userId = req.user.id
    const updates = req.body

    try {
        const user = await User.findById(userId)
        console.log('this is when we found it ')
        console.log(user.datingPreferences.partnerPreferences.religiosity)
        console.log('this is when we found it ')
        if (!user) {
            return res.status(404).json({ message: 'User not found', success: false })
        }

        // Iterate over each field provided in the request body
        Object.keys(updates).forEach((key) => {
            console.log(`Updating key: ${key}`)

            // Update top-level fields (excluding datingPreferences)
            if (key in user._doc && key !== 'datingPreferences') {
                user[key] = updates[key]
                console.log(`Updated ${key} to ${updates[key]}`)
            } else if (key === 'maritalStatus') {
                user.maritalStatus = updates[key] // Assuming maritalStatus is a top-level field in user
                console.log(`Updated maritalStatus to ${updates[key]}`)
            } else if (key === 'children') {
                user.children = updates[key]
                console.log(`Updated children to ${updates[key]}`)
            } else if (key === 'religion') {
                user.religion = updates[key]
                console.log(`Updated religion to ${updates[key]}`)
            } else if (key === 'smoking') {
                user.smoking = updates[key]
                console.log(`Updated smoking to ${updates[key]}`)
            } else if (key === 'drink') {
                user.drink = updates[key]
                console.log(`Updated drink to ${updates[key]}`)
            } else if (key === 'starSign') {
                user.starSign = updates[key]
                console.log(`Updated starSign to ${updates[key]}`)
            } else if (key === 'education') {
                user.education = updates[key]
                console.log(`Updated education to ${updates[key]}`)
            } else if (key === 'profession') {
                user.profession = updates[key]
                console.log(`Updated profession to ${updates[key]}`)
            } else if (key === 'ethnicGroup') {
                user.ethnicGroup = updates[key]
                console.log(`Updated ethnicGroup to ${updates[key]}`)
            }
            // Handle nested updates for datingPreferences.partnerPreferences
            else if (key === 'datingPreferences' && updates.datingPreferences) {
                if ('partnerPreferences' in updates.datingPreferences) {
                    const prefs = updates.datingPreferences.partnerPreferences

                    if (user.datingPreferences) {
                        Object.keys(prefs).forEach((prefKey) => {
                            if (['gender', 'ageRange', 'ethnicity'].includes(prefKey)) {
                                user.datingPreferences.partnerPreferences[prefKey] = prefs[prefKey]
                                console.log(`Updated partnerPreferences ${prefKey} to ${prefs[prefKey]}`)
                            }
                        })
                    } else {
                        user.datingPreferences = { partnerPreferences: prefs }
                        console.log('Created new partnerPreferences structure')
                    }
                }
            }
        })
        // Specifically handle religion, smoke, drink, and starSign if they are present in the correct nested structure
        if (
            updates.datingPreferences &&
            updates.datingPreferences.partnerPreferences &&
            updates.datingPreferences.partnerPreferences.religiosity
        ) {
            const religiosityUpdates = updates.datingPreferences.partnerPreferences.religiosity

            // Ensure the nested structure exists before updating
            if (!user.datingPreferences) {
                user.datingPreferences = {
                    partnerPreferences: {
                        religiosity: {
                            religion: '',
                            smoke: '',
                            drink: '',
                            starSign: ''
                        }
                    }
                }
            } else if (!user.datingPreferences.partnerPreferences) {
                user.datingPreferences.partnerPreferences = {
                    religiosity: {
                        religion: '',
                        smoke: '',
                        drink: '',
                        starSign: ''
                    }
                }
            } else if (!user.datingPreferences.partnerPreferences.religiosity) {
                user.datingPreferences.partnerPreferences.religiosity = {
                    religion: '',
                    smoke: '',
                    drink: '',
                    starSign: ''
                }
            }

            // Update religion if present
            if (religiosityUpdates.religion) {
                user.datingPreferences.partnerPreferences.religiosity.religion = religiosityUpdates.religion
                // console.log(`Updated religion to: ${religiosityUpdates.religion}`)
            }

            // Update smoke if present
            if (religiosityUpdates.smoke) {
                user.datingPreferences.partnerPreferences.religiosity.smoke = religiosityUpdates.smoke
                // console.log(`Updated smoke to: ${religiosityUpdates.smoke}`)
            }

            // Update drink if present
            if (religiosityUpdates.drink) {
                user.datingPreferences.partnerPreferences.religiosity.drink = religiosityUpdates.drink
                // console.log(`Updated drink to: ${religiosityUpdates.drink}`)
            }

            // Update starSign if present
            if (religiosityUpdates.starSign) {
                user.datingPreferences.partnerPreferences.religiosity.starSign = religiosityUpdates.starSign
                // console.log(`Updated starSign to: ${religiosityUpdates.starSign}`)
            }
        }

        if (
            updates.datingPreferences &&
            updates.datingPreferences.partnerPreferences &&
            updates.datingPreferences.partnerPreferences.basicInformation &&
            updates.datingPreferences.partnerPreferences.basicInformation.maritalStatus
        ) {
            const newMaritalStatus = updates.datingPreferences.partnerPreferences.basicInformation.maritalStatus

            // Ensure the nested structure exists before updating
            if (!user.datingPreferences) {
                user.datingPreferences = { partnerPreferences: { basicInformation: { maritalStatus: '' } } }
            } else if (!user.datingPreferences.partnerPreferences) {
                user.datingPreferences.partnerPreferences = { basicInformation: { maritalStatus: '' } }
            } else if (!user.datingPreferences.partnerPreferences.basicInformation) {
                user.datingPreferences.partnerPreferences.basicInformation = { maritalStatus: '' }
            }

            // Update maritalStatus
            user.datingPreferences.partnerPreferences.basicInformation.maritalStatus = newMaritalStatus
            console.log(`Updated maritalStatus to: ${newMaritalStatus}`)
        }
        // Specifically handle children if it's present in the correct nested structure
        if (
            updates.datingPreferences &&
            updates.datingPreferences.partnerPreferences &&
            updates.datingPreferences.partnerPreferences.basicInformation &&
            updates.datingPreferences.partnerPreferences.basicInformation.children
        ) {
            const newChildren = updates.datingPreferences.partnerPreferences.basicInformation.children

            // Ensure the nested structure exists before updating
            if (!user.datingPreferences) {
                user.datingPreferences = { partnerPreferences: { basicInformation: { children: '' } } }
            } else if (!user.datingPreferences.partnerPreferences) {
                user.datingPreferences.partnerPreferences = { basicInformation: { children: '' } }
            } else if (!user.datingPreferences.partnerPreferences.basicInformation) {
                user.datingPreferences.partnerPreferences.basicInformation = { children: '' }
            }

            // Update children
            user.datingPreferences.partnerPreferences.basicInformation.children = newChildren
            // console.log(`Updated children to: ${newChildren}`)
        }
        // Specifically handle biography if it's present in the request body
        if (updates.biography) {
            // Check if the user already has a biography field and update or create it
            if (!user.biography) {
                user.biography = ''  // Initialize biography if it doesn't exist
            }

            // Update the biography field
            user.biography = updates.biography
            // console.log(`Updated biography to: ${updates.biography}`)
        }
        if (
            updates.datingPreferences &&
            updates.datingPreferences.partnerPreferences &&
            updates.datingPreferences.partnerPreferences.educationAndCareer &&
            updates.datingPreferences.partnerPreferences.educationAndCareer.education
        ) {
            const newEducation = updates.datingPreferences.partnerPreferences.educationAndCareer.education

            // Ensure the nested structure exists before updating
            if (!user.datingPreferences) {
                user.datingPreferences = { partnerPreferences: { educationAndCareer: { education: '' } } }
            } else if (!user.datingPreferences.partnerPreferences) {
                user.datingPreferences.partnerPreferences = { educationAndCareer: { education: '' } }
            } else if (!user.datingPreferences.partnerPreferences.educationAndCareer) {
                user.datingPreferences.partnerPreferences.educationAndCareer = { education: '' }
            }

            // Update education
            user.datingPreferences.partnerPreferences.educationAndCareer.education = newEducation
            // console.log(`Updated education to: ${newEducation}`)
        }
        // Specifically handle profession if it's present in the correct nested structure
        if (
            updates.datingPreferences &&
            updates.datingPreferences.partnerPreferences &&
            updates.datingPreferences.partnerPreferences.educationAndCareer &&
            updates.datingPreferences.partnerPreferences.educationAndCareer.profession
        ) {
            const newProfession = updates.datingPreferences.partnerPreferences.educationAndCareer.profession

            // Ensure the nested structure exists before updating
            if (!user.datingPreferences) {
                user.datingPreferences = { partnerPreferences: { educationAndCareer: { profession: '' } } }
            } else if (!user.datingPreferences.partnerPreferences) {
                user.datingPreferences.partnerPreferences = { educationAndCareer: { profession: '' } }
            } else if (!user.datingPreferences.partnerPreferences.educationAndCareer) {
                user.datingPreferences.partnerPreferences.educationAndCareer = { profession: '' }
            }

            // Update profession
            user.datingPreferences.partnerPreferences.educationAndCareer.profession = newProfession
            // console.log(`Updated profession to: ${newProfession}`)
        }
        if (updates.location) {
            // Check if the user already has a location field and update or create it
            if (!user.location) {
                user.location = ''  // Initialize location if it doesn't exist
            }

            // Update the location field
            user.location = updates.location
            // console.log(`Updated location to: ${updates.location}`)
        }
        // Specifically handle ethnicGroup if it's present in the request body
        if (updates.ethnicGroup) {
            // Check if the user already has an ethnicGroup field and update or create it
            if (!user.ethnicGroup) {
                user.ethnicGroup = ''  // Initialize ethnicGroup if it doesn't exist
            }
            // Update the ethnicGroup field
            user.ethnicGroup = updates.ethnicGroup
            // console.log(`Updated ethnicGroup to: ${updates.ethnicGroup}`)
        }

        // Log before saving
        // console.log('User before save:', user.datingPreferences.partnerPreferences.religiosity);

        // await user.save();
        userProfileSaveQueue.add({ user })
        // Log after saving
        // const savedUser = await User.findById(userId); // Reload from the database to confirm changes
        // console.log('User after save:', JSON.stringify(savedUser, null, 2));

        res.status(200).json({
            message: 'User profile updated successfully!',
            user: user,
            success: true
        })
    } catch (error) {
        console.error('Error updating user profile:', error)
        res.status(500).json({
            message: 'Failed to update user profile.',
            success: false
        })
    }
}

// Process each job in the queue
userProfileSaveQueue.process(async (job) => {
    try {
        const userData = job.data.user

        // Reload user from the database and apply updates
        const user = await User.findById(userData._id)
        if (!user) {
            console.log(`User with ID ${userData._id} not found`)
            return
        }

        // Apply updates to user object and save it
        Object.assign(user, userData)
        await user.save()

        console.log(`User ${user._id} saved successfully in the background`)
    } catch (error) {
        console.error('Error saving user in background:', error.message)
    }
})

// exports.updateUserProfile = async (req, res) => {
//     console.log('this is the req')
//     console.log(req.body)
//     console.log(req.user.id)
//     console.log('this is the req')
//     const userId = req.user.id // assuming 'req.user.id' contains the authenticated user's ID from authentication middleware
//     const updates = req.body
//     try {
//         const user = await User.findById(userId)
//         if (!user) {
//             return res
//                 .status(404)
//                 .json({ message: 'User not found', success: false })
//         }
//
//         // Iterate over each field provided in the request body
//         Object.keys(updates).forEach((key) => {
//             if (key in user._doc && key !== 'datingPreferences') {
//                 user[key] = updates[key]
//             } else if (
//                 key === 'datingPreferences' &&
//                 updates.datingPreferences
//             ) {
//                 // Handle nested updates specifically for partnerPreferences within datingPreferences
//                 if ('partnerPreferences' in updates.datingPreferences) {
//                     const prefs = updates.datingPreferences.partnerPreferences
//                     if (user.datingPreferences) {
//                         Object.keys(prefs).forEach((prefKey) => {
//                             if (
//                                 ['gender', 'ageRange', 'ethnicity'].includes(
//                                     prefKey,
//                                 )
//                             ) {
//                                 user.datingPreferences.partnerPreferences[
//                                     prefKey
//                                 ] = prefs[prefKey]
//                             }
//                         })
//                     } else {
//                         user.datingPreferences = { partnerPreferences: prefs }
//                     }
//                 }
//             }
//         })
//
//         await user.save()
//
//         res.status(200).json({
//             message: 'User profile updated successfully!',
//             user: user,
//             success: true,
//         })
//     } catch (error) {
//         console.error(error)
//         res.status(500).json({
//             message: 'Failed to update user profile.',
//             success: false,
//         })
//     }
// }

exports.updateGoldStatus = async (req, res) => {
    const userId = req.user.id // Using user ID from authenticated user

    const user = await User.findById(userId)

    if (!user) {
        return res
            .status(404)
            .json({ message: 'User not found', status: false })
    }
    user.goldMemberBadge = req.body.goldMemberBadge

    await user.save()

    res.status(200).json({
        message: 'User gold status updated successfully!',
        user: user,
        success: true
    })
}

exports.updateTravelModeAndLocation = async (req, res) => {
    console.log('this is the travel mode to check if user is more than 1 month since join or it is premium')
    const userId = req.user.id // Using user ID from authenticated user
    const { toggle, locationCoordinates, city } = req.body

    try {
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        const createdAt = new Date(user.createdAt) // Convert createdAt to Date object
        const currentDate = new Date() // Get the current date
        const timeDifference = currentDate - createdAt // Difference in milliseconds
        const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24)) // Co
        if (!user.proAccount && daysDifference > 30 && !user.travelMode.toggle) {
            console.log('its more than 30 days')
            return res.status(400).json({ message: 'You need to buy premium for using travel mode' })
        }

        user.travelMode = {
            toggle,
            city
        }
        // If travelMode is true and locationCoordinates are provided, update location
        if (locationCoordinates && locationCoordinates.coordinates) {
            if (
                // locationCoordinates.type &&
                locationCoordinates.coordinates.length === 2
            ) {
                user.locationCoordinates = {
                    type: 'Point', // Ensuring it always sets to 'Point' to comply with the schema
                    coordinates: locationCoordinates.coordinates
                }
            } else {
                return res.status(400).json({
                    message:
                        'Invalid or incomplete location coordinates provided.',
                    success: false
                })
            }
        }
        await user.save()
        res.status(200).json({
            message: 'User travel mode and location updated successfully!',
            user: user,
            success: true
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            message: 'Failed to update user profile.',
            success: false
        })
    }
}

exports.getMyProfile = async (req, res) => {
    try {
        // Fetch the user document first to check travelMode.toggle
        const user = await User.findById(req.user.id)

        // If user not found
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        // If user.travelMode.toggle is false, then update the coordinates
        if (!user.travelMode.toggle) {
            const updatedUser = await User.findByIdAndUpdate(
                req.user.id,
                {
                    locationCoordinates: {
                        type: 'Point',
                        coordinates: req.body.coordinates
                    }
                },
                { new: true }
            )

            // Return the updated user
            return res.status(200).json({ success: true, data: updatedUser })
        }

        // If user.travelMode.toggle is true, do not update the coordinates, return the user as is
        res.status(200).json({ success: true, data: user })
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.getProfileById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }
        res.status(200).json({ success: true, data: user })
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}
exports.boostAfterPayment = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
        const count = req.body.count
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        } else {
            console.log('we are in the new boost function hope it works')
            console.log(count)
            user.boostCount += count
            user.boosted = true
            await user.save()
            res.status(200).json({
                success: true,
                data: {
                    boostCount: user.boostCount
                },
                message: 'Boosts added successfully!'
            })
        }
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}
exports.boostProfile = async (req, res) => {
    console.log('trying to boost the profile')
    try {
        const user = await User.findById(req.user.id)

        // Check if user exists
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        // Check if user is a pro account holder
        if (!user.proAccount) {
            console.log('the pro account only have boost ? ')
            return res.status(403).json({
                success: false,
                error: 'Access denied. Feature available for pro accounts only.'
            })
        }

        // Check if user has boosts left and if they are not already boosted
        if (user.boostCount > 0 && !user.boosted) {
            user.boostCount -= 1 // decrement the boost count
            user.boosted = true // set boosted to true
            user.boostedAt = Date.now() // set the boostedAt timestamp
            // Save the updated user
            await user.save()

            res.status(200).json({
                success: true,
                data: {
                    boostCount: user.boostCount,
                    boosted: user.boosted
                },
                message: 'Profile boosted successfully!'
            })
        } else {
            // If no boosts left or already boosted
            res.status(400).json({
                success: false,
                error: user.boosted
                    ? 'Profile already boosted.'
                    : 'No boosts left.'
            })
        }
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' })
    }
}


exports.uploadAndCompareFaces = async (req, res) => {
    try {
        // Check if the user exists
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.profileVerification.verified) {
            return res.status(400).json({ message: 'User already verified' });
        }

        // Check if there are two photos in the request
        if (!req.files || req.files.length !== 2) {
            return res.status(400).json({
                message: 'Please provide exactly two photos for comparison',
                verified: false,
            });
        }

        const photoURLs = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const imageName = `image-${Date.now()}-${i}.png`; // Add index to avoid overwriting files with the same timestamp
            const key = `${userId}/${imageName}`; // Organize images by 'id' in folders

            let imageBuffer = file.buffer;

            // Check if image size exceeds 5 MB
            if (imageBuffer.length > 5242880) {
                console.log(`Image ${i + 1} is larger than 5 MB, compressing...`);
                // Compress the image until it's below the 5 MB limit
                imageBuffer = await sharp(file.buffer)
                    .jpeg({ quality: 60 }) // Adjust quality as needed to reduce size
                    .toBuffer();
            }

            // Upload to S3
            const putObjectCommand = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                Key: key,
                Body: imageBuffer, // Use the (possibly) compressed image buffer
                ContentType: 'image/png',
            });

            try {
                await s3Client.send(putObjectCommand);
                photoURLs.push(key);
            } catch (error) {
                return res.status(500).json({
                    message: `Error uploading image ${i + 1} to S3`,
                    verified: false,
                });
            }
        }

        const client = new s3.Rekognition();
        const params = {
            SourceImage: {
                S3Object: {
                    Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                    Name: photoURLs[0],
                },
            },
            TargetImage: {
                S3Object: {
                    Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
                    Name: photoURLs[1],
                },
            },
            SimilarityThreshold: 70,
        };

        let isSimilar = false;

        client.compareFaces(params, function (err, response) {
            if (err) {
                return res.status(500).json({
                    message: 'Upload and Verification failed',
                    error: err.message,
                    verified: false,
                });
            } else {
                try {
                    let isMatchFound = false;
                    let foundSimilarity = 0;
                    if (response.FaceMatches && response.FaceMatches.length > 0) {
                        response.FaceMatches.forEach((data) => {
                            let similarity = data.Similarity;
                            if (similarity > 70) {
                                isMatchFound = true;
                                foundSimilarity = similarity;
                            }
                        });
                    }

                    user.profileVerification = {
                        verifiedDocument: `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${photoURLs[1]}`,
                        verified: isMatchFound,
                    };
                    user.save();
                    res.status(200).json({
                        message: 'Face comparison completed successfully',
                        verified: isMatchFound,
                        similarity: foundSimilarity,
                        user: user,
                    });
                } catch (error) {
                    console.error('Error uploading photos and comparing faces:', error);
                    res.status(500).json({
                        message: 'Error uploading photos and comparing faces',
                        error: error.message,
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error uploading photos and comparing faces:', error);
        res.status(500).json({
            message: 'Error uploading photos and comparing faces',
            error: error.message,
        });
    }
};


// exports.uploadAndCompareFaces = async (req, res) => {
//     try {
//         // Check if the user exists
//         const userId = req.user.id
//         const user = await User.findById(userId)
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' })
//         }
//
//         if (user.profileVerification.verified) {
//             return res.status(400).json({ message: 'User already verified' })
//         }
//         // Check if there are two photos in the request
//         if (!req.files || req.files.length !== 2) {
//             return res.status(400).json({
//                 message: 'Please provide exactly two photos for comparison',
//                 verified: false
//             })
//         }
//
//         const photoURLs = []
//
//         for (let i = 0; i < req.files.length; i++) {
//             const file = req.files[i]
//             const imageName = `image-${Date.now()}-${i}.png` // Add index to avoid overwriting files with the same timestamp
//             const key = `${userId}/${imageName}` // Organize images by 'id' in folders
//
//             // Upload to S3
//             const putObjectCommand = new PutObjectCommand({
//                 Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                 Key: key,
//                 Body: file.buffer,
//                 ContentType: 'image/png'
//             })
//
//             try {
//                 await s3Client.send(putObjectCommand)
//                 photoURLs.push(key)
//             } catch (error) {
//                 return res.status(500).json({
//                     message: `Error uploading image ${i + 1} to S3`,
//                     verified: false
//                 })
//             }
//         }
//         const client = new s3.Rekognition()
//         const params = {
//             SourceImage: {
//                 S3Object: {
//                     Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                     Name: photoURLs[0]
//                 }
//             },
//             TargetImage: {
//                 S3Object: {
//                     Bucket: process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES,
//                     Name: photoURLs[1]
//                 }
//             },
//             SimilarityThreshold: 70
//         }
//
//         let isSimilar = false
//
//         client.compareFaces(params, function(err, response) {
//             if (err) {
//                 return res.status(500).json({
//                     message: 'Upload and Verification failed',
//                     error: err.message,
//                     verified: false
//                 })
//             } else {
//                 try {
//                     let isMatchFound = false // Initialize variable to false
//                     let foundSimilarity = 0
//                     if (
//                         response.FaceMatches &&
//                         response.FaceMatches.length > 0
//                     ) {
//                         response?.FaceMatches.forEach((data) => {
//                             let position = data.Face.BoundingBox
//                             let similarity = data.Similarity
//
//                             if (similarity > 70) {
//                                 isMatchFound = true // Set variable to true if similarity is greater than 70%
//                                 foundSimilarity = similarity
//                             }
//                         }) // for response.faceDetails
//                     }
//
//                     user.profileVerification = {
//                         verifiedDocument: `https://${process.env.AWS_S3_BUCKET_NAME_GENERATED_IMAGES}.s3.amazonaws.com/${photoURLs[1]}`,
//                         verified: isMatchFound
//                     }
//                     user.save()
//                     res.status(200).json({
//                         message: 'Face comparison completed successfully',
//                         verified: isMatchFound, // Pass the variable in the response
//                         similarity: foundSimilarity,
//                         user: user
//                     })
//                 } catch (error) {
//                     console.error(
//                         'Error uploading photos and comparing faces:',
//                         error
//                     )
//                     res.status(500).json({
//                         message: 'Error uploading photos and comparing faces',
//                         error: error.message
//                     })
//                 }
//             }
//         })
//     } catch (error) {
//         console.error('Error uploading photos and comparing faces:', error)
//         res.status(500).json({
//             message: 'Error uploading photos and comparing faces',
//             error: error.message
//         })
//     }
// }

exports.updateDatingPreferences = async (req, res) => {
    const userId = req.user.id // assuming 'req.user.id' contains the authenticated user's ID from middleware

    try {
        const user = await User.findById(userId)
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }
        const { datingPreferences } = req.body

        // Update only the fields that are provided in the request body
        for (const [key, value] of Object.entries(datingPreferences)) {
            // Ensure the key exists in the datingPreferences schema before updating
            if (user.datingPreferences.hasOwnProperty(key)) {
                user.datingPreferences[key] = value
            } else {
                // Recursively set sub-fields if they exist
                for (const subKey in value) {
                    if (
                        user.datingPreferences[key] &&
                        user.datingPreferences[key].hasOwnProperty(subKey)
                    ) {
                        user.datingPreferences[key][subKey] = value[subKey]
                    }
                }
            }
        }

        await user.save()
        res.status(200).json({
            success: true,
            data: user.datingPreferences,
            message: 'Dating preferences updated successfully!'
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.getDatingPreferences = async (req, res) => {
    try {
        const userId = req.user.id // assuming 'req.user.id' contains the authenticated user's ID from middleware
        const user = await User.findById(userId).select('datingPreferences')
        if (!user) {
            return res
                .status(404)
                .json({ success: false, error: 'User not found' })
        }

        res.status(200).json({
            success: true,
            data: user.datingPreferences,
            message: 'Dating preferences retrieved successfully!'
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ success: false, error: 'Server error' })
    }
}

exports.blockUser = async (req, res) => {
    try {
        const { blockedUserId } = req.body
        const userId = req.user.id

        // Check if the user is trying to block themselves
        if (userId === blockedUserId) {
            return res
                .status(400)
                .json({ success: false, message: 'You cannot block yourself' })
        }

        // Check if the user has already blocked this person
        const existingBlock = await Block.findOne({ userId, blockedUserId });
        console.log("I am existing Block ::::::::::::::::::::::::::::::",existingBlock);
        if (existingBlock) {
            console.log(userId+ ' Blocked ',blockedUserId);
            return res
                .status(400)
                .json({ success: false, message: 'User already blocked' })
        }

        // Create a new block
        const block = new Block({ userId, blockedUserId })
        await block.save()

        res.status(200).json({
            success: true,
            message: 'User blocked successfully'
        })
    } catch (error) {
        console.error('Error blocking user:', error)
        res.status(500).json({ success: false, message: 'Error blocking user' })
    }
}

exports.getUserNotifications = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id

        // Fetch notifications for the user, sorted by creation date (latest first)
        const notifications = await Notification.find({ user: userId })
            .sort({ createdAt: -1 })
            .lean()

        if (!notifications) {
            return res.status(404).json({
                message: 'No notifications found',
                notifications: [],
                success: true
            })
        }

        res.status(200).json({
            message: 'Notifications retrieved successfully',
            notifications,
            success: true
        })
    } catch (error) {
        res.status(500).json({ message: error.message, success: false })
    }
})

exports.contactUs = async (req, res) => {
    console.log('sedngin')

    try {
        const { subject, message } = req.body

        const userId = req.user.id

        const user = await User.findById(userId)

        if (!user) {
            return res
                .status(404)
                .json({ message: 'User not found', success: false })
        }

        const email = user.email

        const emailData = {
            email: 'contact@getspoused.com',
            subject: subject,
            message: `From: ${email}\n\n${message}`
        }

        sendEmail(emailData)

        res.status(200).json({
            message: 'Email sent successfully',
            success: true
        })
    } catch (error) {
        res.status(500).json({ message: error.message, success: false })
    }
}
