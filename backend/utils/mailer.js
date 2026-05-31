const sendOTPEmail = async (targetEmail, otpCode) => {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "TotalMed Security", email: "duncaluca@gmail.com" }, 
                to: [{ email: targetEmail }],
                subject: '🔒 Your TotalMed Secure Verification Code',
                htmlContent: `
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
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        const data = await response.json();
        console.log(`✅ Email successfully sent via Brevo API to ${targetEmail}`, data);
        return data;
    } catch (error) {
        console.error("🚨 BREVO API ERROR:", error);
        throw error;
    }
};

const sendSecurityAlertEmail = async (targetEmail, location, deviceString) => {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "TotalMed Security", email: "duncaluca@gmail.com" }, 
                to: [{ email: targetEmail }],
                subject: '⚠️ Security Alert: New Login Detected',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #dfe6e9; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #d63031; text-align: center;">TotalMed Security Alert</h2>
                        <p>We detected a login to your TotalMed Vault from a new device or location.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #d63031; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                            <p style="margin: 5px 0;"><strong>Location:</strong> ${location || 'Unknown Location'}</p>
                            <p style="margin: 5px 0;"><strong>Device:</strong> ${deviceString || 'Unknown Device'}</p>
                        </div>

                        <p>If this was you, you can safely ignore this email.</p>
                        <p><strong>If you do not recognize this activity, please log in immediately and change your password, or contact our support team.</strong></p>
                    </div>
                `
            })
        });

        if (!response.ok) throw new Error("Failed to send security alert");
        console.log(`🚨 Security alert email dispatched to ${targetEmail}`);
        
    } catch (error) {
        console.error("🚨 BREVO ALERT ERROR:", error);
    }
};

module.exports = { sendOTPEmail, sendSecurityAlertEmail };