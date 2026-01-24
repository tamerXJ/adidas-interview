require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================================
// משתנים מ-Render (Environment Variables)
// ==========================================================
const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

// משתנה למודל הפעיל (ברירת מחדל)
let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

// === רשימת השאלות הסופית (כולל רכב וזמינות) ===
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

// === הפונקציה החכמה לבחירת מודל ===
async function findWorkingModel() {
    console.log("🔍 מחפש מודל זמין בחשבון Google AI...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            const availableModel = data.models.find(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods.includes('generateContent')
            );

            if (availableModel) {
                ACTIVE_MODEL = availableModel.name.replace("models/", "");
                console.log(`✅ מודל נבחר והוגדר אוטומטית: ${ACTIVE_MODEL}`);
            } else {
                console.log("⚠️ לא נמצא מודל ברשימה, נשאר עם ברירת המחדל.");
            }
        }
    } catch (error) {
        console.error("❌ שגיאה בבדיקת המודלים (אולי API KEY חסר?):", error);
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
        You are a recruiting expert for Adidas. Analyze the following interview in Hebrew.
        Candidate Name: ${candidate.name}
        Answers:
        ${answersText}

        Specific Analysis Instructions:
        1. **Availability Check:** Check Question 1 (Health/Hours) and Question 2 (Transportation). If there are issues, mark as a risk.
        2. **Service & Sales:** Look for empathy and sales skills in the simulation.

        IMPORTANT: Return the result ONLY as a valid JSON object.
        The KEYS must be in English. The VALUES must be in Hebrew.
        Do NOT wrap the JSON in markdown code blocks.
        
        Required JSON structure:
        {
          "score": 5, // A number between 1-10
          "general": "Summary of personality and impression",
          "strengths": "List of strengths",
          "weaknesses": "List of weaknesses (mention transportation/availability issues here)",
          "recommendation": "Yes/No/Maybe"
        }
        `;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let analysis = { score: 0, general: "שגיאה", strengths: "-", weaknesses: "-", recommendation: "-" };

        try {
            analysis = JSON.parse(aiText);
            analysis.score = parseInt(analysis.score) || 0;
        } catch (e) {
            console.error("Failed to parse AI JSON", e);
            console.log("Raw Response:", aiText);
        }

        console.log(`🤖 ציון: ${analysis.score} | המלצה: ${analysis.recommendation}`);

        // שמירה באקסל
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
        res.json({ message: "הריאיון נקלט." });
    }
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel();
});