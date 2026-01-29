require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Google Sheets Configuration
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_NAME = 'Candidates';

// Helper: Fetch from Google Sheets
async function fetchFromSheets(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${SHEETS_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch from Google Sheets');
  const data = await response.json();
  return data.values || [];
}

// Helper: Append to Google Sheets
async function appendToSheets(values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}:append?valueInputOption=USER_ENTERED&key=${SHEETS_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] })
  });
  if (!response.ok) throw new Error('Failed to append to Google Sheets');
  return await response.json();
}

// Helper: Update specific row in Google Sheets
async function updateSheetRow(rowIndex, columnIndex, value) {
  const range = `${SHEET_NAME}!${String.fromCharCode(65 + columnIndex)}${rowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED&key=${SHEETS_API_KEY}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] })
  });
  if (!response.ok) throw new Error('Failed to update Google Sheets');
  return await response.json();
}

// Questions Database
const QUESTIONS = {
  sales: [
    { id: 'q1', type: 'text', question: 'ספר/י לנו על עצמך ועל הניסיון שלך במכירות' },
    { id: 'q2', type: 'text', question: 'תאר/י מצב שבו הצלחת לשכנע לקוח קשה' },
    { id: 'q3', type: 'select', question: 'כמה שנות ניסיון יש לך במכירות?', options: ['פחות משנה', '1-2 שנים', '3-5 שנים', 'יותר מ-5 שנים'] },
    { id: 'q4', type: 'slider', question: 'דרג/י את כישורי השכנוע שלך (1-10)', min: 1, max: 10 },
    { id: 'q5', type: 'text', question: 'מה מניע אותך להצליח במכירות?' }
  ],
  shift_manager: [
    { id: 'q1', type: 'text', question: 'ספר/י על ניסיון קודם בניהול צוותים' },
    { id: 'q2', type: 'text', question: 'איך את/ה מתמודד/ת עם קונפליקטים בין עובדים?' },
    { id: 'q3', type: 'select', question: 'כמה עובדים ניהלת בעבר?', options: ['1-5', '6-10', '11-20', 'יותר מ-20'] },
    { id: 'q4', type: 'slider', question: 'דרג/י את יכולת הארגון שלך (1-10)', min: 1, max: 10 },
    { id: 'q5', type: 'text', question: 'מה הסגנון הניהולי שלך?' }
  ],
  store_manager: [
    { id: 'q1', type: 'text', question: 'ספר/י על ניסיון בניהול חנות או עסק' },
    { id: 'q2', type: 'text', question: 'איך את/ה מתמודד/ת עם לחץ ויעדים?' },
    { id: 'q3', type: 'select', question: 'האם יש לך ניסיון בניהול תקציב?', options: ['כן', 'לא', 'מעט'] },
    { id: 'q4', type: 'slider', question: 'דרג/י את כישורי המנהיגות שלך (1-10)', min: 1, max: 10 },
    { id: 'q5', type: 'text', question: 'מה החזון שלך לחנות מצליחה?' },
    { id: 'q6', type: 'text', question: 'תאר/י החלטה עסקית קשה שקיבלת' }
  ]
};

// Validation helpers
function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return /^05\d{8}$/.test(cleaned);
}

function containsHebrew(text) {
  return /[\u0590-\u05FF]/.test(text);
}

// ENDPOINT 1: Get Questions
app.get('/api/get-questions', (req, res) => {
  try {
    const { role } = req.query;
    
    if (!role || !QUESTIONS[role]) {
      return res.status(400).json({ error: 'Invalid role', code: 'INVALID_ROLE' });
    }
    
    res.json({ questions: QUESTIONS[role] });
  } catch (error) {
    console.error('Error in /api/get-questions:', error);
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
  }
});

// ENDPOINT 2: Submit Interview
app.post('/api/submit-interview', async (req, res) => {
  try {
    const { personalDetails, role, answers, cvBase64, metadata } = req.body;
    
    // Validation
    if (!personalDetails || !role || !answers) {
      return res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS' });
    }
    
    if (!validatePhone(personalDetails.phone)) {
      return res.status(400).json({ error: 'Invalid phone number', code: 'INVALID_PHONE' });
    }
    
    if (!containsHebrew(personalDetails.name)) {
      return res.status(400).json({ error: 'Name must contain Hebrew characters', code: 'INVALID_NAME' });
    }
    
    // Build full interview text
    const questions = QUESTIONS[role];
    let fullInterview = `תפקיד: ${role}\n\n`;
    
    Object.keys(answers).forEach((questionId) => {
      const question = questions.find(q => q.id === questionId);
      if (question) {
        fullInterview += `${question.question}\n`;
        fullInterview += `תשובה: ${answers[questionId]}\n`;
        if (metadata?.timeTaken?.[questionId]) {
          fullInterview += `[METADATA: Time=${metadata.timeTaken[questionId]}s]\n`;
        }
        fullInterview += '\n';
      }
    });
    
    if (metadata?.tabSwitches) {
      fullInterview += `[METADATA: Tab Switches=${metadata.tabSwitches}]\n`;
    }
    
    // Call Gemini AI for analysis
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        response_mime_type: "application/json", // CRITICAL: Prevents JSON parse errors
        temperature: 0.7
      }
    });
    
    const prompt = `נתח את הראיון הבא לתפקיד ${role}:

${fullInterview}

החזר JSON בפורמט הבא:
{
  "score": number (1-10),
  "strengths": ["חוזק 1", "חוזק 2", "חוזק 3"],
  "weaknesses": ["חולשה 1", "חולשה 2"],
  "recommendation": "Yes" or "No",
  "summary": "סיכום קצר של המועמד"
}`;
    
    const result = await model.generateContent(prompt);
    const aiText = result.response.text();
    const aiResponse = JSON.parse(aiText);
    
    // Prepare row for Google Sheets
    const row = [
      new Date().toISOString(),
      personalDetails.name,
      role,
      personalDetails.city || '',
      personalDetails.branch || '',
      personalDetails.phone,
      personalDetails.email || '',
      aiResponse.score,
      aiResponse.strengths.join(', '),
      aiResponse.weaknesses.join(', '),
      aiResponse.recommendation,
      'Active', // Status
      fullInterview,
      cvBase64 || '',
      JSON.stringify(metadata || {})
    ];
    
    // Save to Google Sheets
    await appendToSheets(row);
    
    res.json({ 
      success: true, 
      message: 'Interview submitted successfully',
      confirmationNumber: Date.now().toString().slice(-6)
    });
    
  } catch (error) {
    console.error('Error in /api/submit-interview:', error);
    res.status(500).json({ 
      error: 'Failed to submit interview', 
      code: 'SUBMISSION_FAILED',
      details: error.message 
    });
  }
});

// ENDPOINT 3: Get Candidates (Admin)
app.get('/api/admin/candidates', async (req, res) => {
  try {
    const { password } = req.query;
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_PASSWORD' });
    }
    
    const rows = await fetchFromSheets(`${SHEET_NAME}!A2:O`); // Skip header row
    
    const candidates = rows.map((row, index) => ({
      rowIndex: index + 2, // +2 because sheet is 1-indexed and we skip header
      date: row[0] || '',
      name: row[1] || '',
      role: row[2] || '',
      city: row[3] || '',
      branch: row[4] || '',
      phone: row[5] || '',
      email: row[6] || '',
      score: parseInt(row[7]) || 0,
      strengths: row[8] || '',
      weaknesses: row[9] || '',
      recommendation: row[10] || '',
      status: row[11] || 'Active',
      fullInterview: row[12] || '',
      hasCv: !!row[13],
      metadata: row[14] || '{}'
    }));
    
    res.json({ candidates });
    
  } catch (error) {
    console.error('Error in /api/admin/candidates:', error);
    res.status(500).json({ error: 'Failed to fetch candidates', code: 'FETCH_FAILED' });
  }
});

// ENDPOINT 4: Update Candidate Status (Admin)
app.post('/api/admin/update-status', async (req, res) => {
  try {
    const { password, rowIndex, newStatus } = req.body;
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_PASSWORD' });
    }
    
    // Column 11 (L) is status (0-indexed: 11)
    await updateSheetRow(rowIndex, 11, newStatus);
    
    res.json({ success: true, message: 'Status updated successfully' });
    
  } catch (error) {
    console.error('Error in /api/admin/update-status:', error);
    res.status(500).json({ error: 'Failed to update status', code: 'UPDATE_FAILED' });
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Google Sheet ID: ${SHEET_ID}`);
  console.log(`🤖 Gemini AI initialized`);
});
