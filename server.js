require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================================
// הדבק כאן את המפתח של ה-AI
const API_KEY = "AIzaSyCFtrENytySOKTydsAs4if4LYWeMy_i2N0";

// הדבק כאן את הלינק של Apps Script
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwstjjPaN7ExPbXW0do-b6rnvfq6emZVGhMpt5RhyXlWkM0u-ZR3xNpayjrkTC3yUaWFQ/exec";
// ==========================================================

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

// === מאגר השאלות המקצועי ===
const questions = [
    { 
        id: 1, 
        text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות עד שעות הלילה המאוחרות (כולל סופ\"ש). האם יש לך מגבלה רפואית או אישית שמונעת ממך לעמוד בזה?", 
        type: "select",
        options: ["אין לי שום מגבלה - זמין/ה להכל", "יש לי מגבלה חלקית (יכול/ה לפרט בראיון)", "לא יכול/ה לעבוד בעמידה/לילות"]
    },
    { 
        id: 2, 
        text: "תאר/י סיטואציה מהעבר שבה עבדת תחת לחץ זמן גדול או תור של לקוחות. איך הגבת ומה עשית כדי להשתלט על המצב?", 
        type: "text" 
    },
    { 
        id: 3, 
        text: "לקוח פונה אליך בטון כועס ולא מכבד ליד אנשים אחרים. מה התגובה הראשונה שלך?", 
        type: "text" 
    },
    { 
        id: 4, 
        text: "שאלה של כנות: האם קרה לך בעבר שנאלצת לאחר למשמרת או לבטל ברגע האחרון?", 
        type: "select",
        options: ["מעולם לא קרה לי (תמיד מגיע/ה בזמן)", "קרה לעיתים רחוקות מאוד בגלל חירום", "קורה לפעמים, זה אנושי"] 
        // הערה: זו שאלה טריקית. מי שעונה "מעולם לא" עלול להיתפס כלא אמין ע"י ה-AI
    },
    { 
        id: 5, 
        text: "כמה קל לך ללמוד מפרטים טכניים על מוצרים (כמו טכנולוגיית סוליות או סוגי בדים)?", 
        type: "text" 
    },
    { 
        id: 6, 
        text: "אחראי המשמרת ביקש ממך לבצע משימה (כמו ניקיון מחסן) בזמן שאתה באמצע מכירה ללקוח. איך תפעל?", 
        type: "text" 
    },
    { 
        id: 7, 
        text: "סימולציה: אני לקוח שנכנס לחנות ומחפש נעל ריצה, אבל אני לא מבין בזה כלום. אילו 2-3 שאלות תשאל אותי כדי למצוא לי את הנעל המושלמת?", 
        type: "text" 
    },
    { 
        id: 8, 
        text: "לסיום: למה בחרת דווקא באדידס ולא בחנות אופנה רגילה?", 
        type: "text" 
    }
];

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
        אתה מנהל גיוס מומחה של חברת אדידס (Adidas). נתח את הראיון של המועמד ${candidate.name}.
        
        הנה התשובות:
        ${answersText}
        
        אנא בצע ניתוח פסיכולוגי ומקצועי עמוק לפי ההנחיות הבאות:
        1. **בדיקת זמינות (שאלה 1):** אם המועמד סימן שיש לו מגבלה, ציין זאת כסיכון גבוה.
        2. **מבחן האמינות (שאלה 4):** אם המועמד בחר "מעולם לא קרה לי", התייחס לזה בחשדנות (חוסר אמינות/חוסר מודעות), אלא אם שאר התשובות מושלמות.
        3. **שירותיות:** חפש בתשובות (במיוחד בסימולציה ובמקרה הלקוח הכועס) סימנים לאמפתיה, סבלנות ומקצועיות.
        
        החזר תשובה אך ורק בפורמט JSON נקי (ללא מרכאות מסביב ל-JSON), המכיל את השדות הבאים בעברית:
        {
          "score": "ציון מספרי 1-10",
          "general": "פסקה קצרה על הרושם הכללי והאישיות",
          "strengths": "רשימת נקודות חוזק בולטות",
          "weaknesses": "רשימת חולשות, סיכונים או חשד לחוסר אמינות",
          "recommendation": "כן/לא/לשיקול דעת"
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
        
        let analysis = { score: "0", general: "שגיאה", strengths: "-", weaknesses: "-", recommendation: "-" };

        try {
            analysis = JSON.parse(aiText);
        } catch (e) {
            console.error("Failed to parse AI JSON", e);
            analysis.general = "התקבל טקסט לא תקין מה-AI";
        }

        console.log(`🤖 ציון: ${analysis.score} | המלצה: ${analysis.recommendation}`);

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