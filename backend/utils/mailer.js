const { Resend } = require('resend');

// Initialize the API client
const resend = new Resend(process.env.RESEND_API_KEY);

const sendOTPEmail = async (targetEmail, otpCode) => {
    try {
        const data = await resend.emails.send({
            from: 'TotalMed Security <onboarding@resend.dev>', 
            
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
        });
        
        console.log("✅ Email sent via Resend API!", data);
        return data;
    } catch (error) {
        console.error("🚨 RESEND API ERROR:", error);
        throw error;
    }
};

module.exports = { sendOTPEmail };