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

// נקבע קבוע את המודל הכי טוב ל-JSON
const MODEL_NAME = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

// === מאגר השאלות ===
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

app.get('/api/get-questions', (req, res) => {
    res.json(questions);
});

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name}...`);

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
        
        Return the response as a JSON object with these keys:
        score (1-10), general (Hebrew summary), strengths (Hebrew list), weaknesses (Hebrew list), recommendation (Hebrew decision).
        `;

        // שינוי קריטי: הוספת הגדרות בטיחות ופורמט JSON
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                // 1. מבטל את מסנני הבטיחות כדי למנוע חסימות שווא
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ],
                // 2. מכריח את המודל להחזיר JSON תקין
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        const aiData = await response.json();
        
        // בדיקה מעמיקה ללוגים אם משהו משתבש
        if (!aiData.candidates || !aiData.candidates[0]) {
            console.error("❌ שגיאה: לא התקבלה תשובה מגוגל. הנה המידע המלא:", JSON.stringify(aiData, null, 2));
            throw new Error("Empty AI Response");
        }

        let aiText = aiData.candidates[0].content.parts[0].text;
        console.log("📝 Raw AI Response:", aiText);

        let analysis = JSON.parse(aiText); // עכשיו זה בטוח JSON

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
            console.log("✅ הנתונים נשמרו באקסל!");
        }

        res.json({ message: "הראיון התקבל בהצלחה." });

    } catch (error) {
        console.error("System Error:", error);
        // שולח נתונים בסיסיים לאקסל גם אם ה-AI נכשל, כדי שלא ילך לאיבוד
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
             fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: candidate.name,
                    phone: candidate.phone,
                    city: candidate.city,
                    score: "0",
                    general: "תקלה בניתוח AI - יש לבדוק ידנית",
                    strengths: "-",
                    weaknesses: "-",
                    recommendation: "-"
                })
            }).catch(e => console.error("Sheet Error:", e));
        }
        res.json({ message: "הריאיון נקלט." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});