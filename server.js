require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json({ limit: '10mb' })); 
app.use(express.static('public'));

const questions = [
    { id: 1, text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות עד שעות הלילה המאוחרות (כולל סופ\"ש). האם יש לך מגבלה רפואית או אישית שמונעת ממך לעמוד בזה?", type: "select", options: ["אין לי שום מגבלה - זמין/ה להכל", "יש לי מגבלה חלקית (יכול/ה לפרט בראיון)", "לא יכול/ה לעבוד בעמידה/לילות"] },
    { id: 2, text: "האם יש לך רכב צמוד או דרך הגעה עצמאית למשמרות (כולל בסופי שבוע וחגים כשאין תחב\"צ)?", type: "select", options: ["כן, יש לי רכב/ניידות מלאה", "תחבורה ציבורית (מוגבל בסופ\"ש)", "אין לי דרך הגעה מסודרת"] },
    { id: 3, text: "תאר/י סיטואציה מהעבר שבה עבדת תחת לחץ זמן גדול או תור של לקוחות. איך הגבת ומה עשית כדי להשתלט על המצב?", type: "text" },
    { id: 4, text: "לקוח פונה אליך בטון כועס ולא מכבד ליד אנשים אחרים. מה התגובה הראשונה שלך?", type: "text" },
    { id: 5, text: "כמה קל לך ללמוד מפרטים טכניים על מוצרים (כמו טכנולוגיית סוליות או סוגי בדים)?", type: "text" },
    { id: 6, text: "אחראי המשמרת ביקש ממך לבצע משימה (כמו ניקיון מחסן) בזמן שאתה באמצע מכירה ללקוח. איך תפעל?", type: "text" },
    { id: 7, text: "סימולציה: אני לקוח שנכנס לחנות ומחפש נעל ריצה, אבל אני לא מבין בזה כלום. אילו 2-3 שאלות תשאל אותי כדי למצוא לי את הנעל המושלמת?", type: "text" },
    { id: 8, text: "לסיום: למה בחרת דווקא באדידס ולא בחנות אופנה רגילה?", type: "text" }
];

async function findWorkingModel() {
    console.log("🔍 סורק מודלים זמינים בחשבון Google AI...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        if (!response.ok) { throw new Error(`שגיאה בגישה ל-API: ${response.status}`); }
        const data = await response.json();
        if (data.models) {
            const preferred = data.models.find(m => m.name.includes('gemini-1.5-flash'));
            const any = data.models.find(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'));
            if (preferred || any) {
                ACTIVE_MODEL = (preferred || any).name.replace("models/", "");
                console.log(`✅ מודל נבחר: ${ACTIVE_MODEL}`);
            }
        }
    } catch (error) { console.error("❌ שגיאת מודל:", error.message); }
}

function cleanJSON(text) {
    text = text.replace(/```json/g, "").replace(/```/g, "");
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) { return text.substring(firstBrace, lastBrace + 1); }
    return text;
}

app.get('/api/get-questions', (req, res) => { res.json(questions); });

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name}...`);

    try {
        let answersText = "";
        answers.forEach((ans) => {
            const qObj = questions.find(q => q.id === ans.questionId);
            // === הוספנו כאן את נתוני ה"רמאות" כדי שה-AI יראה אותם ===
            answersText += `Question: ${qObj ? qObj.text : ''}\nAnswer: ${ans.answer}\n[METADATA: Time Taken=${ans.timeSeconds}s, Tab Switches=${ans.switchedTabs}]\n\n`;
        });

        const promptText = `
        You are a recruiting expert for Adidas. Analyze the interview below.
        
        Candidate Name: ${candidate.name}
        Interview Data (includes metadata about time and tab switching):
        ${answersText}

        INSTRUCTIONS:
        1. Analyze availability and service skills.
        2. **INTEGRITY CHECK:** Look at the [METADATA]. 
           - If "Tab Switches" is > 2 for a single question, it indicates the user left the screen (possibly to use ChatGPT).
           - If "Time Taken" is very short (< 5s) for a complex question, it indicates copy-paste.
           - If suspicious behavior is found, MENTION IT in the "general" summary and LOWER the score significantly.
        3. Output MUST be a valid JSON object.
        4. Keys MUST be in English. Values MUST be in Hebrew.

        JSON Structure:
        {
          "score": 5, 
          "general": "Summary in Hebrew (Include cheat warnings if any)",
          "strengths": "Strengths in Hebrew",
          "weaknesses": "Weaknesses in Hebrew",
          "recommendation": "Yes/No (in Hebrew)"
        }
        `;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        if (!aiResponse.ok) { throw new Error(`API Error: ${aiResponse.status}`); }

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleanedText = cleanJSON(aiText);
        
        let analysis = { score: 0, general: "שגיאה בפענוח", strengths: "-", weaknesses: "-", recommendation: "-" };

        try {
            analysis = JSON.parse(cleanedText);
            analysis.score = parseInt(analysis.score) || 0;
        } catch (e) { console.error("❌ JSON Parse Failed"); }

        console.log(`🤖 ציון סופי: ${analysis.score}`);

        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
            await fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...candidate, 
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
    await findWorkingModel();
});