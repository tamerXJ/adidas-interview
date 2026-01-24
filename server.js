require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================================
// הדבק כאן את המפתח החדש שלך
const API_KEY = "AIzaSyCFtrENytySOKTydsAs4if4LYWeMy_i2N0";
// ==========================================================

// משתנה שיחזיק את שם המודל שעובד
let ACTIVE_MODEL = "gemini-1.5-flash"; // ברירת מחדל

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

// === פונקציה חכמה למציאת מודל תקין ===
async function findWorkingModel() {
    console.log("🔍 מחפש מודל זמין בחשבון הגוגל שלך...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            // מחפש מודל שמסוגל לייצר תוכן (generateContent)
            const availableModel = data.models.find(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods.includes('generateContent')
            );

            if (availableModel) {
                // גוגל מחזיר את השם עם התחילית "models/", אנחנו צריכים רק את השם עצמו לפעמים
                // אבל בבקשות Fetch רגילות משתמשים בשם המלא
                ACTIVE_MODEL = availableModel.name.replace("models/", "");
                console.log(`✅ מודל נבחר והוגדר: ${ACTIVE_MODEL}`);
            } else {
                console.error("⚠️ לא נמצא מודל Gemini ברשימה, משתמש בברירת מחדל.");
            }
        } else {
            console.error("⚠️ לא התקבלה רשימת מודלים (אולי המפתח שגוי?)");
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("❌ שגיאה בבדיקת המודלים:", error);
    }
}

app.get('/api/get-questions', (req, res) => {
    res.json(questions);
});

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name} עם המודל: ${ACTIVE_MODEL}...`);

    try {
        let answersText = "";
        answers.forEach((ans) => {
            const questionObj = questions.find(q => q.id === ans.questionId);
            const qText = questionObj ? questionObj.text : "שאלה לא ידועה";
            answersText += `שאלה: ${qText}\nתשובה: ${ans.answer}\n\n`;
        });

        const promptText = `
        אתה מנהל גיוס מומחה של חברת אדידס (Adidas).
        קיבלת ראיון עבודה של מועמד בשם ${candidate.name} מעיר ${candidate.city}.
        
        הנה התשובות של המועמד:
        ${answersText}

        אנא נתח את המועמד ותן לי סיכום קצר בעברית הכולל:
        1. **רושם כללי**: האם המועמד נשמע רציני, שירותי ומכירתי?
        2. **נקודות חוזק**: מה בלט לטובה בתשובות שלו?
        3. **נקודות לשיפור/סיכון**: האם יש נורות אדומות?
        4. **ציון התאמה (1-10)** לתפקיד בחנות ספורט.
        5. **המלצה**: לזמן לראיון? (כן/לא).
        `;

        // שימוש במודל שנמצא אוטומטית
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("Error from Google:", JSON.stringify(data.error, null, 2));
            throw new Error(data.error.message);
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || "לא התקבל ניתוח";

        console.log("========================================");
        console.log(`🤖 דוח בינה מלאכותית (${ACTIVE_MODEL}): ${candidate.name}`);
        console.log(analysis);
        console.log("========================================");

        let summary = `תודה רבה ${candidate.name}.\n`;
        summary += "הנתונים נקלטו והועברו לניתוח במערכת.\n";
        summary += "במידה ותמצא מתאים, ניצור קשר בהקדם.";

        res.json({ message: summary });

    } catch (error) {
        console.error("System Error:", error);
        res.json({ message: "הריאיון נקלט בהצלחה. תודה רבה!" });
    }
});

// הפעלת השרת וחיפוש מודל
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await findWorkingModel(); // הרצה של בדיקת המודלים בעלייה
});