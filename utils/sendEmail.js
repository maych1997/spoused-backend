const nodemailer = require('nodemailer')

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 465,
        // secure: true,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    })

    const message = {
        from: `contact@getspoused.com`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    }

    const info = await transporter.sendMail(message)

}

module.exports = sendEmail
