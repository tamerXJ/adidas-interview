const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

const PORT = process.env.PORT || 3000;

// === כאן תדביק את ה-API KEY שהעתקת מגוגל ===
const GOOGLE_API_KEY = "AIzaSyCxnkFhIAtgKVOFM4JfRZbjS-0kNm7gYOA"; 

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro"});

app.use(express.json());
app.use(express.static('public'));

const questions = [
    { id: 1, text: "למה בחרת להגיש מועמדות דווקא לאדידס, ומה החיבור שלך לספורט?", type: "text" },
    { id: 2, text: "לקוח מתלבט לגבי נעל ריצה יקרה (Ultraboost). הוא טוען שזה יקר לו. איך תשכנע אותו?", type: "text" },
    { id: 3, text: "החנות עמוסה, אתה לבד, ו-3 לקוחות פונים אליך בו זמנית. איך תפעל?", type: "text" },
    { id: 4, text: "לקוח נכנס כועס וצועק שנעליים שקנה נקרעו. מה תעשה?", type: "text" },
    { id: 5, text: "המנהל מבקש ממך לבצע משימה שאתה פחות אוהב (ניקיון/מחסן) בזמן לחץ. כיצד תגיב?", type: "text" },
    { id: 6, text: "איך אתה מסתדר עם עבודה לפי נהלים קפדניים וחוקים ברורים?", type: "text" },
    { id: 7, text: "ספר על מקרה של חוסר הסכמה עם חבר לצוות ואיך פתרתם את זה?", type: "text" },
    { id: 8, text: "האם יש לך רכב צמוד/דרך הגעה עצמאית למשמרות?", type: "text" },
    { id: 9, text: "מהי הזמינות שלך למשמרות?", type: "text" }
];

app.get('/api/get-questions', (req, res) => {
    res.json(questions);
});

// === כאן קורה הקסם של הבינה המלאכותית ===
app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    
    console.log(`\n--- ריאיון חדש התקבל: ${candidate.name} ---`);

    // 1. הכנת הטקסט לשליחה ל-Gemini
    let promptForAI = `
    אני מנהל סניף של אדידס (Adidas). 
    התקבל מועמד חדש לעבודה, אני צריך שתנתח את התשובות שלו ותיתן חוות דעת מקצועית של מנהל משאבי אנוש.
    
    פרטי המועמד:
    שם: ${candidate.name}
    עיר: ${candidate.city}
    
    השאלות והתשובות שענה:
    `;

    answers.forEach(ans => {
        const qText = questions.find(q => q.id === ans.questionId).text;
        promptForAI += `שאלה: ${qText}\nתשובה: ${ans.answer}\n\n`;
    });

    promptForAI += `
    בבקשה תן לי סיכום קצר הכולל:
    1. רמת הניסוח והרצינות.
    2. התאמה לתפקיד מכירות ושירות (האם הוא שירותי? האם יודע למכור?).
    3. התמודדות עם לחץ ומרות.
    4. סיכום: האם לזמן לראיון? (כן/לא/אולי).
    `;

    // 2. שליחה ל-Gemini וקבלת תשובה
    try {
        const result = await model.generateContent(promptForAI);
        const response = await result.response;
        const aiAnalysis = response.text();

        // 3. הדפסת הניתוח לטרמינל שלך
        console.log("\n🤖 ניתוח Gemini AI למועמד:");
        console.log("-----------------------------------");
        console.log(aiAnalysis);
        console.log("-----------------------------------\n");

    } catch (error) {
        console.error("שגיאה בקבלת ניתוח מ-Gemini:", error);
    }

    // תשובה ללקוח (נשאר רגיל)
    res.json({ message: `תודה רבה ${candidate.name}, הפרטים התקבלו והועברו לבדיקה.` });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});