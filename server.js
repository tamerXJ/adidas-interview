require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// בדיקת טעינת משתנים
const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

if (!API_KEY) {
    console.error("❌ CRITICAL ERROR: API_KEY is missing in Render Environment Variables!");
} else {
    console.log("✅ API_KEY loaded successfully (starts with: " + API_KEY.substring(0, 5) + "...)");
}

// שימוש במודל קבוע וידוע כדי למנוע תקלות חיפוש
const FIXED_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

const questions = [
    { 
        id: 1, 
        text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות עד שעות הלילה המאוחרות (כולל סופ\"ש). האם יש לך מגבלה רפואית או אישית שמונעת ממך לעמוד בזה?", 
        type: "select",
        options: ["אין לי שום מגבלה - זמין/ה להכל", "יש לי מגבלה חלקית (יכול/ה לפרט בראיון)", "לא יכול/ה לעבוד בעמידה/לילות"]
    },
    { 
        id: 2, 
        text: "האם יש לך רכב צמוד או דרך הגעה עצמאית למשמרות (כולל בסופי שבוע וחגים כשאין תחב\"צ)?", 
        type: "select",
        options: ["כן, יש לי רכב/ניידות מלאה", "תחבורה ציבורית (מוגבל בסופ\"ש)", "אין לי דרך הגעה מסודרת"]
    },
    { id: 3, text: "תאר/י סיטואציה מהעבר שבה עבדת תחת לחץ זמן גדול או תור של לקוחות. איך הגבת ומה עשית כדי להשתלט על המצב?", type: "text" },
    { id: 4, text: "לקוח פונה אליך בטון כועס ולא מכבד ליד אנשים אחרים. מה התגובה הראשונה שלך?", type: "text" },
    { id: 5, text: "כמה קל לך ללמוד מפרטים טכניים על מוצרים (כמו טכנולוגיית סוליות או סוגי בדים)?", type: "text" },
    { id: 6, text: "אחראי המשמרת ביקש ממך לבצע משימה (כמו ניקיון מחסן) בזמן שאתה באמצע מכירה ללקוח. איך תפעל?", type: "text" },
    { id: 7, text: "סימולציה: אני לקוח שנכנס לחנות ומחפש נעל ריצה, אבל אני לא מבין בזה כלום. אילו 2-3 שאלות תשאל אותי כדי למצוא לי את הנעל המושלמת?", type: "text" },
    { id: 8, text: "לסיום: למה בחרת דווקא באדידס ולא בחנות אופנה רגילה?", type: "text" }
];

// ניקוי JSON
function cleanJSON(text) {
    text = text.replace(/```json/g, "").replace(/```/g, "");
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        return text.substring(firstBrace, lastBrace + 1);
    }
    return text;
}

app.get('/api/get-questions', (req, res) => { res.json(questions); });

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name}...`);

    try {
        // בניית הטקסט ל-AI
        let answersText = "";
        answers.forEach((ans) => {
            const qObj = questions.find(q => q.id === ans.questionId);
            answersText += `Question: ${qObj ? qObj.text : 'Unknown'}\nAnswer: ${ans.answer}\n\n`;
        });

        // בדיקה שאנחנו לא שולחים טקסט ריק
        if (answersText.trim() === "") {
            console.error("❌ Error: Answers text is empty!");
        }

        const promptText = `
        You are a recruiting expert for Adidas. Analyze the interview below.
        
        Candidate Name: ${candidate.name}
        Interview Data:
        ${answersText}

        INSTRUCTIONS:
        1. Analyze availability (Questions 1-2) and service skills.
        2. Output MUST be a valid JSON object.
        3. Do NOT add any text before or after the JSON.
        4. Keys MUST be in English. Values MUST be in Hebrew.

        JSON Structure:
        {
          "score": 5, 
          "general": "Summary in Hebrew",
          "strengths": "Strengths in Hebrew",
          "weaknesses": "Weaknesses in Hebrew",
          "recommendation": "Yes/No (in Hebrew)"
        }
        `;

        // שליחה ל-Google AI עם בדיקת שגיאות
        console.log(`📤 שולח בקשה למודל: ${FIXED_MODEL}...`);
        
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${FIXED_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        // === כאן התיקון הגדול: הדפסת השגיאה המדויקת ===
        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error("❌ GOOGLE API ERROR:", errorText);
            console.error("Status:", aiResponse.status);
            throw new Error("Failed to get response from AI");
        }

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        console.log("🔍 Raw AI Response:", aiText);

        const cleanedText = cleanJSON(aiText);
        let analysis = { score: 0, general: "שגיאה בפענוח", strengths: "-", weaknesses: "-", recommendation: "-" };

        try {
            analysis = JSON.parse(cleanedText);
            analysis.score = parseInt(analysis.score) || 0;
        } catch (e) {
            console.error("❌ JSON Parse Failed. Text was:", cleanedText);
        }

        console.log(`🤖 ציון סופי: ${analysis.score}`);

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

        res.json({ message: "OK" });

    } catch (error) {
        console.error("🔥 System Error:", error.message);
        res.json({ message: "Error" });
    }
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    // ביטלנו את החיפוש האוטומטי כדי למנוע תקלות כרגע
    console.log(`Using hardcoded model: ${FIXED_MODEL}`);
});