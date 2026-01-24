require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================================
// 1. הדבק את המפתח של ה-AI
const API_KEY = "AIzaSyCFtrENytySOKTydsAs4if4LYWeMy_i2N0";

// 2. הדבק את הלינק של Apps Script
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwstjjPaN7ExPbXW0do-b6rnvfq6emZVGhMpt5RhyXlWkM0u-ZR3xNpayjrkTC3yUaWFQ/exec";
// ==========================================================

// משתנה שיחזיק את המודל שעובד (ברירת מחדל לגיבוי)
let ACTIVE_MODEL = "gemini-pro"; 

app.use(express.json());
app.use(express.static('public'));

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

// === פונקציה חכמה למציאת מודל תקין ===
async function findWorkingModel() {
    console.log("🔍 בודק איזה מודלים זמינים בחשבון שלך...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            // מחפש מודל שמסוגל לייצר תוכן (generateContent)
            // עדיפות למודלים חדשים, אבל לוקח כל מה שיש
            const availableModel = data.models.find(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods.includes('generateContent')
            );

            if (availableModel) {
                // מנקה את התחילית "models/" אם קיימת
                ACTIVE_MODEL = availableModel.name.replace("models/", "");
                console.log(`✅ המודל שנבחר לשימוש: ${ACTIVE_MODEL}`);
            } else {
                console.error("⚠️ לא נמצא מודל Gemini ברשימה, משתמש בברירת מחדל (gemini-pro).");
            }
        } else {
            console.error("⚠️ לא התקבלה רשימת מודלים. משתמש בברירת מחדל.");
        }
    } catch (error) {
        console.error("❌ שגיאה בבדיקת המודלים (נשתמש בגיבוי):", error);
    }
}

app.get('/api/get-questions', (req, res) => {
    res.json(questions);
});

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name} (מודל: ${ACTIVE_MODEL})...`);

    try {
        let answersText = "";
        answers.forEach((ans) => {
            const qObj = questions.find(q => q.id === ans.questionId);
            answersText += `שאלה: ${qObj ? qObj.text : ''}\nתשובה: ${ans.answer}\n\n`;
        });

        const promptText = `
        You are an expert recruitment manager for Adidas. Analyze the interview below.
        
        Candidate Name: ${candidate.name}
        Answers:
        ${answersText}

        Instructions:
        1. Analyze the candidate's fit for a retail sales position.
        2. Identify strengths and weaknesses based on their answers.
        3. Check reliability (Question 4).
        
        CRITICAL: Return the response ONLY as a raw JSON string (no markdown, no code blocks).
        Keys: "score" (1-10), "general" (Hebrew summary), "strengths" (Hebrew list), "weaknesses" (Hebrew list), "recommendation" (Hebrew decision).
        `;

        // שימוש במודל שנמצא אוטומטית
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            })
        });

        const aiData = await response.json();

        // בדיקה שהתקבלה תשובה
        if (!aiData.candidates || !aiData.candidates[0]) {
            console.error("❌ שגיאה: לא התקבלה תשובה מגוגל. פרטים:", JSON.stringify(aiData));
            // נסיון חירום למודל הישן אם החדש נכשל
            throw new Error("AI Response Empty");
        }

        let aiText = aiData.candidates[0].content.parts[0].text;
        
        // ניקוי JSON
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        console.log("📝 תוכן גולמי:", aiText);

        let analysis;
        try {
            analysis = JSON.parse(aiText);
        } catch (e) {
            console.error("Failed to parse JSON", e);
            // יצירת אובייקט חירום אם הניתוח נכשל
            analysis = { score: "0", general: "תקלה בפענוח", strengths: "-", weaknesses: "-", recommendation: "-" };
        }

        console.log(`🤖 ציון סופי: ${analysis.score}`);

        // שליחה לאקסל
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
            console.log("✅ הנתונים נשמרו באקסל!");
        }

        res.json({ message: "הראיון התקבל בהצלחה." });

    } catch (error) {
        console.error("System Error:", error);
        
        // גיבוי: שליחה לאקסל גם במקרה של שגיאה
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
             fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: candidate.name,
                    phone: candidate.phone,
                    city: candidate.city,
                    score: "ERROR",
                    general: "שגיאה טכנית בניתוח",
                    strengths: "-",
                    weaknesses: "-",
                    recommendation: "-"
                })
            }).catch(e => console.error("Sheet Error:", e));
        }
        
        res.json({ message: "הריאיון נקלט." });
    }
});

// הפעלת השרת + חיפוש המודל
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel(); // קריטי: מוצא את המודל הנכון לפני שהכל מתחיל
});