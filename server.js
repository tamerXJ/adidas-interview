require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// שליפת המפתחות מהשרת
const API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

if (!API_KEY) console.error("❌ שגיאה: חסר מפתח GEMINI_API_KEY");
if (!GOOGLE_SHEET_URL) console.error("⚠️ אזהרה: חסר לינק GOOGLE_SHEET_URL");

let ACTIVE_MODEL = "gemini-pro"; 

app.use(express.json());
app.use(express.static('public'));

const questions = [
    { 
        id: 1, 
        text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות עד שעות הלילה המאוחרות. האם יש מניעה מבחינתך?", 
        type: "select",
        options: ["אין לי שום מגבלה - זמין/ה להכל", "יש לי מגבלה חלקית (יכול/ה לפרט בראיון)", "לא יכול/ה לעבוד בעמידה/לילות"]
    },
    { id: 2, text: "תאר/י סיטואציה מהעבר שבה עבדת תחת לחץ זמן גדול או תור של לקוחות. איך הגבת ומה עשית כדי להשתלט על המצב?", type: "text" },
    { id: 3, text: "לקוח פונה אליך בטון כועס ולא מכבד ליד אנשים אחרים. מה התגובה הראשונה שלך?", type: "text" },
    { 
        id: 4, 
        text: "האם קרה לך בעבר שנאלצת לאחר למשמרת או לבטל ברגע האחרון?", 
        type: "select",
        options: ["מעולם לא קרה לי (תמיד מגיע/ה בזמן)", "קרה לעיתים רחוקות מאוד בגלל חירום", "קורה לפעמים, זה אנושי"] 
    },
    { id: 5, text: "כמה קל לך ללמוד מפרטים טכניים על מוצרים (כמו טכנולוגיית סוליות או סוגי בדים)?", type: "text" },
    { id: 6, text: "אחראי המשמרת ביקש ממך לבצע משימה (כמו ניקיון מחסן) בזמן שאתה באמצע מכירה ללקוח. איך תפעל?", type: "text" },
    { id: 7, text: "סימולציה: אני לקוח שנכנס לחנות ומחפש נעל ריצה, אבל אני לא מבין בזה כלום. אילו 2-3 שאלות תשאל אותי כדי למצוא לי את הנעל המושלמת?", type: "text" },
    { id: 8, text: "לסיום: למה בחרת דווקא באדידס ולא בחנות אופנה רגילה?", type: "text" }
];

async function findWorkingModel() {
    console.log("🔍 בודק איזה מודלים פתוחים בחשבון שלך...");
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
                console.log(`✅ המודל שנבחר לשימוש: ${ACTIVE_MODEL}`);
            }
        }
    } catch (error) { 
        console.error("Warning: Could not auto-detect model. Using default.", error); 
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

        // === התיקון בהנחיה נמצא כאן ===
        const promptText = `
        You are an HR expert for Adidas. Analyze this interview data.
        
        Candidate: ${candidate.name}
        Answers:
        ${answersText}

        Task:
        1. Evaluate fit for sales position.
        2. Identify strengths and weaknesses.
        3. Assess reliability based on attendance habits.

        Output ONLY valid JSON string (no markdown, no code blocks).
        IMPORTANT RULES FOR JSON:
        - Do NOT use double quotes (") inside the Hebrew values. Use single quotes (') instead.
        - Ensure the JSON is perfectly formatted.

        Example format:
        {
          "score": "1-10",
          "general": "Summary text without double quotes",
          "strengths": ["Strength 1", "Strength 2"],
          "weaknesses": ["Weakness 1", "Weakness 2"],
          "recommendation": "כן/לא/לשיקול דעת"
        }
        `;

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

        if (!aiData.candidates || !aiData.candidates[0] || !aiData.candidates[0].content) {
            console.error("❌ שגיאה: ה-AI החזיר תשובה ריקה. פרטים:", JSON.stringify(aiData));
            throw new Error("AI Blocked or Empty");
        }

        let aiText = aiData.candidates[0].content.parts[0].text;
        
        // ניקוי נוסף ליתר ביטחון
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        console.log("📝 תשובת AI:", aiText);

        let analysis;
        try {
            analysis = JSON.parse(aiText);
        } catch (e) {
            console.error("Failed to parse JSON", e);
            // אם עדיין יש שגיאה, ננסה "לתקן" אותה ידנית או נחזיר שגיאה מסודרת
            analysis = { score: "0", general: "התקבל פורמט לא תקין מה-AI (נסה שוב)", strengths: "-", weaknesses: "-", recommendation: "-" };
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
                    strengths: Array.isArray(analysis.strengths) ? analysis.strengths.join(", ") : analysis.strengths, // המרה למחרוזת אם זה מערך
                    weaknesses: Array.isArray(analysis.weaknesses) ? analysis.weaknesses.join(", ") : analysis.weaknesses,
                    recommendation: analysis.recommendation
                })
            });
            console.log("✅ הנתונים נשמרו באקסל");
        }

        res.json({ message: "הראיון התקבל בהצלחה." });

    } catch (error) {
        console.error("System Error:", error);
        
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
             fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: candidate.name,
                    phone: candidate.phone,
                    city: candidate.city,
                    score: "ERROR",
                    general: "תקלה טכנית בניתוח",
                    strengths: "-",
                    weaknesses: "-",
                    recommendation: "-"
                })
            }).catch(e => console.error("Sheet Error:", e));
        }
        res.json({ message: "הריאיון נקלט." });
    }
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel();
});