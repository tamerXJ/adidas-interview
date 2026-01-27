require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"; // === תוספת לאדמין ===

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json({ limit: '10mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

// === נתיבים ===

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === תוספת: נתיב לדף האדמין ===
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === תוספת: נתיב למשיכת נתונים מהשיטס ===
app.get('/api/admin/candidates', async (req, res) => {
    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "סיסמה שגויה" });
    }
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const data = await response.json();
        res.json(data.reverse()); // הופך סדר (חדש למעלה)
    } catch (error) {
        console.error("Sheet Error:", error);
        res.status(500).json({ error: "תקלה בטעינת נתונים" });
    }
});

// === לוגיקה מקורית (ללא שינוי) ===

const ROLES_QUESTIONS = {
    "sales": [
        { id: 1, text: "העבודה באדידס דורשת עמידה ממושכת ומשמרות לילה/סופ\"ש. האם יש מגבלה?", type: "select", options: ["זמין להכל", "מגבלה חלקית", "לא יכול"] },
        { id: 2, text: "האם יש לך דרך הגעה עצמאית למשמרות (גם בסופ\"ש)?", type: "select", options: ["כן, יש לי רכב צמוד", "תחב\"צ (מוגבל)", "אין דרך הגעה"] },
        { id: 3, text: "דרג/י את עצמך בתכונות הבאות (1=נמוך, 10=גבוה):", type: "sliders", options: ["אנרגיה ומכירות", "עבודת צוות", "סבלנות ללקוחות", "חיבור לאופנה וספורט"] },
        { id: 4, text: "תאר/י סיטואציה שבה נתת שירות מעל ומעבר ללקוח.", type: "text" },
        { id: 5, text: "לקוח כועס צועק עליך ליד אנשים אחרים. מה התגובה הראשונה שלך?", type: "text" },
        { id: 6, text: "איך תשכנע לקוח שמתלבט לקנות נעל יקרה כי \"זה יקר לו\"?", type: "text" },
        { id: 7, text: "המנהל ביקש ממך לסדר מחסן באמצע מכירה טובה. מה תעשה?", type: "text" },
        { id: 8, text: "למה דווקא אדידס ולא רשת אחרת?", type: "text" }
    ],
    "shift_manager": [
        { id: 1, text: "כמה ניסיון יש לך בניהול משמרת או צוות עובדים?", type: "select", options: ["אין ניסיון", "עד שנה", "מעל שנה"] },
        { id: 2, text: "שני עובדים רבים באמצע המשמרת מול לקוחות. איך אתה פועל באותו רגע?", type: "text" },
        { id: 3, text: "איך אתה מעריך את היכולות שלך בניהול? (גרור את הסמן)", type: "sliders", options: ["אסרטיביות מול עובדים", "פתרון בעיות בזמן אמת", "ניהול משימות במקביל", "שירותיות"] },
        { id: 4, text: "יש עומס מטורף בחנות ואתה רואה שעובד אחד מדבר בטלפון בצד. איך תגיב?", type: "text" },
        { id: 5, text: "לקוח דורש \"מנהל\" וצועק על עובד שלך. איך אתה ניגש לסיטואציה?", type: "text" },
        { id: 6, text: "חסר לך עובד למשמרת סופ\"ש ואף אחד לא רוצה לבוא. איך תפתור את זה?", type: "text" },
        { id: 7, text: "מה ההבדל בעיניך בין \"בוס\" לבין \"מנהל\"?", type: "text" },
        { id: 8, text: "איך תדאג שהחנות תישאר מסודרת גם בשיא הלחץ?", type: "text" },
        { id: 9, text: "במהלך המשמרת אתה מזהה שממוצע הפריטים לעסקה (UPT) נמוך מהיעד. אילו פעולות מיידיות תעשה ברצפה כדי לשפר את זה?", type: "text" }
    ],
    "store_manager": [
        { id: 1, text: "כמה שנים ניהלת חנות או יחידת רווח והפסד (P&L)?", type: "select", options: ["אין ניסיון ניהולי", "1-2 שנים", "3 שנים ומעלה"] },
        { id: 2, text: "החנות לא עומדת ביעד המרה (Conversion) כבר חודש. מה תוכנית הפעולה שלך?", type: "text" },
        { id: 3, text: "דירוג עצמי של מיומנויות ניהול:", type: "sliders", options: ["ראייה עסקית (KPI)", "פיתוח והדרכת עובדים", "גיוס כוח אדם", "עמידה תחת לחץ"] },
        { id: 4, text: "עובד ותיק ומוערך נשחק, מאחר למשמרות ומוכר פחות. איך תבצע שיחת משוב?", type: "text" },
        { id: 5, text: "איך אתה מגייס עובדים איכותיים? מה הדבר הכי חשוב שאתה מחפש במועמד?", type: "text" },
        { id: 6, text: "תאר החלטה ניהולית קשה שנאלצת לקבל בעבר. האם היית משנה אותה היום?", type: "text" },
        { id: 7, text: "איך תרתום את הצוות ליעדים אגרסיביים בתקופת מבצעים לחוצה?", type: "text" },
        { id: 8, text: "מה הערך המוסף שתביא כמנהל לרשת אדידס?", type: "text" },
        { id: 9, text: "מעבר ליעד היומי, איך אתה מנתח דוח KPI שבועי? תן דוגמה לנתון שזיהית בו חולשה ואיך בניית תוכנית לשיפורו.", type: "text" }
    ]
};

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

app.get('/api/get-questions', (req, res) => { 
    const role = req.query.role || "sales";
    const questionSet = ROLES_QUESTIONS[role] || ROLES_QUESTIONS["sales"];
    res.json(questionSet); 
});

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    const role = candidate.role || "sales";
    
    console.log(`\n⏳ מעבד ריאיון עבור: ${candidate.name} (${role})...`);

    const currentQuestions = ROLES_QUESTIONS[role] || ROLES_QUESTIONS["sales"];

    try {
        let answersText = "";
        answers.forEach((ans) => {
            const qObj = currentQuestions.find(q => q.id === ans.questionId);
            answersText += `Question: ${qObj ? qObj.text : ''}\nAnswer: ${ans.answer}\n[METADATA: Time Taken=${ans.timeSeconds}s, Tab Switches=${ans.switchedTabs}]\n\n`;
        });

        let roleInstruction = "";
        if (role === "store_manager") {
            roleInstruction = "Evaluate for a STORE MANAGER. Focus on KPI understanding, Leadership, and Strategy.";
        } else if (role === "shift_manager") {
            roleInstruction = "Evaluate for a SHIFT MANAGER. Focus on Operations, Team Motivation, and Responsibility.";
        } else {
            roleInstruction = "Evaluate for a SALES ASSOCIATE. Focus on Service, Sales Drive, and Teamwork.";
        }

        const promptText = `
        You are a recruiting expert for Adidas. Analyze the interview below.
        
        Candidate Name: ${candidate.name}
        Role: ${role}
        Interview Data:
        ${answersText}

        INSTRUCTIONS:
        1. ${roleInstruction}
        2. CHECK INTEGRITY: High tab switches (>2) or very short times = lower score.
        3. Output valid JSON only.

        JSON Structure:
        {
          "score": 5, 
          "general": "Summary in Hebrew",
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
        
        let analysis = { score: 0 };
        try { analysis = JSON.parse(cleanedText); analysis.score = parseInt(analysis.score) || 0; } 
        catch (e) { console.error("❌ JSON Parse Failed"); }

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
    await findWorkingModel(); // שמרנו את הסריקה המקורית שעובדת!
});