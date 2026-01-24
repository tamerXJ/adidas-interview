require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// 1. המפתח של ה-AI (כבר יש לך אותו)
const API_KEY = "AIzaSyCFtrENytySOKTydsAs4if4LYWeMy_i2N0";

// 2. הלינק לגוגל שיטס (מה שהעתקת הרגע)
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwstjjPaN7ExPbXW0do-b6rnvfq6emZVGhMpt5RhyXlWkM0u-ZR3xNpayjrkTC3yUaWFQ/exec";

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

const questions = [
    { id: 1, text: "למה בחרת להגיש מועמדות דווקא לאדידס, ומה החיבור שלך לספורט?", type: "text" },
    { id: 2, text: "לקוח מתלבט לגבי נעל ריצה מקצועית ויקרה (למשל Ultraboost). הוא טוען שזה יקר לו. איך תשכנע אותו שזו ההשקעה הנכונה?", type: "text" },
    { id: 3, text: "החנות עמוסה מאוד, אתה לבד במחלקה, ו-3 לקוחות שונים פונים אליך לעזרה בו זמנית. איך תתעדף ותפעל?", type: "text" },
    { id: 4, text: "לקוח נכנס כועס מאוד בטענה שנעליים שקנה לפני שבוע נקרעו. הוא מרים את הקול. איך תגיב ומה תעשה?", type: "text" },
    { id: 5, text: "במהלך משמרת עמוסה, המנהל מבקש ממך לעזוב הכל ולבצע משימה שאתה פחות אוהב (כמו סידור מחסן או ניקיון). כיצד תגיב?", type: "text" },
    { id: 6, text: "אדידס היא רשת בינלאומית עם נהלים קפדניים (משמעת, נהלי קופה, הופעה ייצוגית). איך אתה מסתדר עם עבודה לפי 'ספר חוקים' ברור?", type: "text" },
    { id: 7, text: "ספר על מקרה שבו היה מתח או חוסר הסכמה בינך לבין חבר לצוות בעבודה/לימודים. איך פתרתם את זה?", type: "text" },
    { id: 8, text: "האם יש לך רכב צמוד או דרך הגעה עצמאית למשמרות (כולל בסופי שבוע וחגים)?", type: "text" },
    { id: 9, text: "מהי הזמינות שלך למשמרות? (כמה משמרות בשבוע, בקרים/ערבים)", type: "text" }
];

// פונקציה למציאת מודל תקין
async function findWorkingModel() {
    console.log("🔍 מחפש מודל זמין...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        if (data.models) {
            const availableModel = data.models.find(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'));
            if (availableModel) {
                ACTIVE_MODEL = availableModel.name.replace("models/", "");
                console.log(`✅ מודל נבחר: ${ACTIVE_MODEL}`);
            }
        }
    } catch (error) { console.error("Error finding model", error); }
}

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
        אתה מנהל גיוס של אדידס. נתח את הראיון של ${candidate.name}.
        תשובות:
        ${answersText}
        
        החזר תשובה אך ורק בפורמט JSON נקי (בלי המילה json בהתחלה ובלי מרכאות מיותרות), כזה:
        {
          "score": "ציון מספרי 1-10",
          "summary": "סיכום מילולי קצר בעברית של החוזקות והחולשות"
        }
        `;

        // 1. קבלת ניתוח מה-AI
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // ניקוי הטקסט כדי שיהיה JSON תקין
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let analysis = { score: "N/A", summary: "לא התקבל ניתוח" };
        try {
            analysis = JSON.parse(aiText);
        } catch (e) {
            console.error("Failed to parse AI JSON", e);
            analysis.summary = aiText; // אם זה לא JSON, נשמור את כל הטקסט
        }

        console.log(`🤖 ציון: ${analysis.score}`);

        // 2. שליחה לגוגל שיטס (הקסם קורה כאן)
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
            await fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: candidate.name,
                    phone: candidate.phone,
                    city: candidate.city,
                    score: analysis.score,
                    summary: analysis.summary
                })
            });
            console.log("✅ הנתונים נשמרו באקסל!");
        }

        res.json({ message: `תודה ${candidate.name}, הריאיון התקבל בהצלחה!` });

    } catch (error) {
        console.error("System Error:", error);
        res.json({ message: "הריאיון נקלט." });
    }
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel();
});