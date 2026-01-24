require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

const PORT = process.env.PORT || 3000;

// משתנים מ-Render
const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const EMAIL_USER = process.env.EMAIL_USER;       
const EMAIL_PASS = process.env.EMAIL_PASS;       
const MANAGER_EMAIL = process.env.MANAGER_EMAIL; 

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

const questions = [
    { 
        id: 1, 
        text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות עד שעות הלילה המאוחרות (כולל סופ\"ש). האם יש לך מגבלה רפואית או אישית שמונעת ממך לעמוד בזה?", 
        type: "select",
        options: ["אין לי שום מגבלה - זמין/ה להכל", "יש לי מגבלה חלקית (יכול/ה לפרט בראיון)", "לא יכול/ה לעבוד בעמידה/לילות"]
    },
    { id: 2, text: "תאר/י סיטואציה מהעבר שבה עבדת תחת לחץ זמן גדול או תור של לקוחות. איך הגבת ומה עשית כדי להשתלט על המצב?", type: "text" },
    { id: 3, text: "לקוח פונה אליך בטון כועס ולא מכבד ליד אנשים אחרים. מה התגובה הראשונה שלך?", type: "text" },
    { 
        id: 4, 
        text: "שאלה של כנות: האם קרה לך בעבר שנאלצת לאחר למשמרת או לבטל ברגע האחרון?", 
        type: "select",
        options: ["מעולם לא קרה לי (תמיד מגיע/ה בזמן)", "קרה לעיתים רחוקות מאוד בגלל חירום", "קורה לפעמים, זה אנושי"] 
    },
    { id: 5, text: "כמה קל לך ללמוד מפרטים טכניים על מוצרים (כמו טכנולוגיית סוליות או סוגי בדים)?", type: "text" },
    { id: 6, text: "אחראי המשמרת ביקש ממך לבצע משימה (כמו ניקיון מחסן) בזמן שאתה באמצע מכירה ללקוח. איך תפעל?", type: "text" },
    { id: 7, text: "סימולציה: אני לקוח שנכנס לחנות ומחפש נעל ריצה, אבל אני לא מבין בזה כלום. אילו 2-3 שאלות תשאל אותי כדי למצוא לי את הנעל המושלמת?", type: "text" },
    { id: 8, text: "לסיום: למה בחרת דווקא באדידס ולא בחנות אופנה רגילה?", type: "text" }
];

async function findWorkingModel() {
    console.log("🔍 מחפש מודל זמין בחשבון Google AI...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        if (data.models) {
            const availableModel = data.models.find(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'));
            if (availableModel) {
                ACTIVE_MODEL = availableModel.name.replace("models/", "");
                console.log(`✅ מודל נבחר והוגדר אוטומטית: ${ACTIVE_MODEL}`);
            }
        }
    } catch (error) { console.error("❌ שגיאה בבדיקת המודלים:", error); }
}

async function sendEmailAlert(candidateName, score, summary, phone) {
    if (!EMAIL_USER || !EMAIL_PASS) return;
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #000;">🌟 אותר מועמד (בדיקה)</h2>
        <p><strong>שם:</strong> ${candidateName}</p>
        <p><strong>טלפון:</strong> ${phone}</p>
        <p><strong>ציון:</strong> ${score}</p>
        <hr>
        <p>${summary}</p>
        <a href="${GOOGLE_SHEET_URL}">לאקסל המלא</a>
    </div>`;
    try {
        await transporter.sendMail({
            from: `"Adidas AI" <${EMAIL_USER}>`,
            to: MANAGER_EMAIL,
            subject: `🔔 מועמד חדש: ${candidateName} (ציון ${score})`,
            html: htmlContent
        });
        console.log("📨 מייל נשלח!");
    } catch (error) { console.error("❌ שגיאה בשליחת מייל:", error); }
}

app.get('/api/get-questions', (req, res) => { res.json(questions); });

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name}...`);

    try {
        let answersText = "";
        answers.forEach((ans) => {
            const qObj = questions.find(q => q.id === ans.questionId);
            answersText += `שאלה: ${qObj ? qObj.text : ''}\nתשובה: ${ans.answer}\n\n`;
        });

        // === התיקון הקריטי בהנחיה (PROMPT) ===
        const promptText = `
        You are a recruiting expert for Adidas. Analyze the following interview in Hebrew.
        Candidate Name: ${candidate.name}
        Answers:
        ${answersText}

        IMPORTANT: Return the result ONLY as a valid JSON object.
        The KEYS must be in English. The VALUES must be in Hebrew.
        Do NOT wrap the JSON in markdown code blocks.
        
        Required JSON structure:
        {
          "score": 5, // A number between 1-10
          "general": "Summary of personality...",
          "strengths": "List of strengths...",
          "weaknesses": "List of weaknesses...",
          "recommendation": "Yes/No"
        }
        `;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // הדפסה ללוג כדי שנראה מה ה-AI החזיר במקרה של תקלה
        console.log("🔍 תשובה גולמית מה-AI:", aiText);

        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let analysis = { score: 0, general: "שגיאה בפענוח", strengths: "-", weaknesses: "-", recommendation: "-" };

        try {
            analysis = JSON.parse(aiText);
            analysis.score = parseInt(analysis.score) || 0;
        } catch (e) {
            console.error("❌ שגיאה בפענוח ה-JSON:", e);
        }

        console.log(`🤖 ציון: ${analysis.score}`);

        if (analysis.score >= 1) {
            await sendEmailAlert(candidate.name, analysis.score, analysis.general, candidate.phone);
        }

        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
            await fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: candidate.name,
                    phone: candidate.phone,
                    city: candidate.city,
                    score: analysis.score,
                    general: analysis.general,
                    strengths: analysis.strengths,
                    weaknesses: analysis.weaknesses,
                    recommendation: analysis.recommendation
                })
            });
            console.log("✅ נשמר באקסל");
        }

        res.json({ message: "הראיון התקבל בהצלחה." });

    } catch (error) {
        console.error("System Error:", error);
        res.json({ message: "הריאיון נקלט." });
    }
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel();
});