const nodemailer = require('nodemailer');

// Configure the email delivery agent
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,     // e.g., totalmed.auth@gmail.com
        pass: process.env.EMAIL_PASSWORD  // Your 16-character App Password
    }
});

const sendOTPEmail = async (targetEmail, otpCode) => {
    const mailOptions = {
        from: `"TotalMed Secure Vault" <${process.env.EMAIL_USER}>`,
        to: targetEmail,
        subject: '🔒 Your TotalMed Secure Verification Code',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #dfe6e9; padding: 20px; border-radius: 8px;">
                <h2 style="color: #0984e3; text-align: center;">TotalMed Security</h2>
                <p>A login attempt was made for your account. Use the following 6-digit code to verify your identity:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 2.5em; font-weight: bold; letter-spacing: 6px; color: #d35400; background-color: #f8f9fa; padding: 10px 20px; border-radius: 4px; border: 1px dashed #b2bec3;">
                        ${otpCode}
                    </span>
                </div>
                <p style="color: #636e72; font-size: 0.85em; text-align: center;">This code expires in 10 minutes.</p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
};

module.exports = { sendOTPEmail };