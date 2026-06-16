const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const extractStatementData = async (fileBuffer, mimeType) => {
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are reading a credit card statement (could be from any bank, any format/language - English or Bengali).
Extract the following fields and return ONLY a valid JSON object, no markdown, no explanation:

{
  "statement_date": "YYYY-MM-DD",
  "previous_outstanding": <number>,
  "current_outstanding": <number>,
  "total_interest_charged": <number>,
  "total_statement_amount": <number, use previous_outstanding if no better base amount is found>,
  "card_last_four_digits": "<string, last 4 digits of card number if visible>",
  "minimum_due": <number, if visible, else null>
}

Notes:
- total_interest_charged should be the SUM of all interest line items (e.g. "Interest on POS Transaction" + "Interest on BT Transaction" + any other interest charges) for this billing period only.
- If any field is not found, use null for that field.
- Numbers should be plain numbers without currency symbols or commas.
- Return ONLY the JSON object, nothing else.`;

  const filePart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, filePart]);
  const responseText = result.response.text();

  const cleaned = responseText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Failed to parse AI response: ' + responseText.substring(0, 200));
  }
};

module.exports = { extractStatementData };