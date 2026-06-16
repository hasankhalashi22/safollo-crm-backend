// SSL Wireless SMS Gateway (Bangladesh)
// Docs: https://sslwireless.com/

const sendSMS = async (phone, message) => {
  // Development: just log
  if (process.env.NODE_ENV === 'development') {
    console.log(`📱 SMS to ${phone}: ${message}`);
    return true;
  }

  try {
    const params = new URLSearchParams({
      api_token: process.env.SMS_API_KEY,
      sid:       process.env.SMS_SID,
      msisdn:    phone.replace(/^0/, '88'), // 01711... → 8801711...
      sms:       message,
      csmsid:    `safollo_${Date.now()}`,
    });

    const response = await fetch(
      `https://alerts.sslwireless.com/api/v3/send-sms?${params}`,
      { method: 'GET' }
    );

    const data = await response.json();
    return data.status === 1000;
  } catch (err) {
    console.error('SMS send error:', err);
    return false;
  }
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { sendSMS, generateOTP };
