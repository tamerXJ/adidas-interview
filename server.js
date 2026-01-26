require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"; 

// רשימת מודלים לגיבוי למקרה שהסריקה נכשלת
const FALLBACK_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];
let ACTIVE_MODEL = "gemini-1.5-flash"; // ברירת מחדל

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.use(express.json({ limit: '10mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/candidates', async (req, res) => {
    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "סיסמה שגויה" });
    }
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const data = await response.json();
        res.json(data.reverse());
    } catch (error) {
        console.error("Sheet Error:", error);
        res.status(500).json({ error: "תקלה בטעינת נתונים" });
    }
});

// === פונקציה חכמה למציאת מודל פעיל ===
async function findWorkingModel() {
    console.log("🔍 Scanning for available AI models...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        if (!response.ok) {
            console.warn("⚠️ Could not list models. Using default:", ACTIVE_MODEL);
            return;
        }
        const data = await response.json();
        if (data.models) {
            // מחפש את המודל הכי טוב שזמין לך בחשבון
            const preferred = data.models.find(m => m.name.includes('gemini-1.5-flash')) || 
                              data.models.find(m => m.name.includes('gemini-1.5-pro')) ||
                              data.models.find(m => m.name.includes('gemini-1.0-pro')) ||
                              data.models.find(m => m.name.includes('gemini-pro'));
            
            if (preferred) {
                ACTIVE_MODEL = preferred.name.replace("models/", "");
                console.log(`✅ ACTIVE_MODEL set to: ${ACTIVE_MODEL}`);
            } else {
                console.log("⚠️ No preferred model found, staying with default.");
            }
        }
    } catch (error) {
        console.error("❌ Model scan failed:", error.message);
    }
}

// === פונקציית שליחה עם ניהול תקלות מתקדם ===
async function fetchAIWithRetry(promptText, retries = 3) {
    let currentModel = ACTIVE_MODEL;
    
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🤖 Attempt ${i + 1}/${retries} using ${currentModel}...`);
            
            const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            });

            // טיפול ב-404 (מודל לא קיים) -> נסה מודל אחר מהרשימה
            if (aiResponse.status === 404) {
                console.warn(`⚠️ Model ${currentModel} returned 404.`);
                // מנסה לקחת את המודל הבא ברשימה
                const nextIndex = (FALLBACK_MODELS.indexOf(currentModel) + 1) % FALLBACK_MODELS.length;
                currentModel = FALLBACK_MODELS[nextIndex];
                console.log(`🔄 Switching to backup model: ${currentModel}`);
                continue; 
            }

            // טיפול ב-429 (עומס) -> המתנה
            if (aiResponse.status === 429) {
                if (i === retries - 1) throw new Error("Rate limit 429 - exhausted retries");
                const waitTime = 3000 * (i + 1);
                console.warn(`⚠️ Rate limit. Waiting ${waitTime/1000}s...`);
                await sleep(waitTime);
                continue;
            }

            if (!aiResponse.ok) {
                throw new Error(`AI Status: ${aiResponse.status}`);
            }

            return await aiResponse.json();

        } catch (error) {
            console.error(`❌ Attempt ${i + 1} failed: ${error.message}`);
            if (i === retries - 1) throw error;
        }
    }
    throw new Error("All AI attempts failed");
}

function cleanJSON(text) {
    text = text.replace(/```json/g, "").replace(/```/g, "");
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) { return text.substring(firstBrace, lastBrace + 1); }
    return text;
}

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

app.get('/api/get-questions', (req, res) => { 
    const role = req.query.role || "sales";
    res.json(ROLES_QUESTIONS[role] || ROLES_QUESTIONS["sales"]); 
});

app.post('/api/submit-interview', async (req, res) => {
    const { candidate, answers } = req.body;
    const role = candidate.role || "sales";
    
    console.log(`\n⏳ Processing: ${candidate.name} (${role})...`);

    let analysis = { 
        score: 0, 
        general: "ממתין לניתוח (תקלת AI)", 
        strengths: "-", 
        weaknesses: "-", 
        recommendation: "לבדיקה ידנית" 
    };

    try {
        let answersText = "";
        const currentQuestions = ROLES_QUESTIONS[role] || ROLES_QUESTIONS["sales"];
        answers.forEach((ans) => {
            const qObj = currentQuestions.find(q => q.id === ans.questionId);
            answersText += `Q: ${qObj ? qObj.text : ''}\nA: ${ans.answer}\n[Time=${ans.timeSeconds}s]\n\n`;
        });

        let roleInstruction = "Evaluate this candidate.";
        if (role === "store_manager") roleInstruction = "Evaluate for STORE MANAGER (Strategy, KPI, HR).";
        else if (role === "shift_manager") roleInstruction = "Evaluate for SHIFT MANAGER (Ops, Leadership).";
        else roleInstruction = "Evaluate for SALES ASSOCIATE (Service, Energy).";

        const promptText = `
        You are a recruiting expert for Adidas. Analyze this interview.
        Candidate: ${candidate.name}, Role: ${role}
        Data: ${answersText}
        INSTRUCTIONS:
        1. ${roleInstruction}
        2. Output valid JSON only.
        JSON Structure: {"score": 0-100, "general": "Hebrew summary", "strengths": "Hebrew", "weaknesses": "Hebrew", "recommendation": "Yes/No (Hebrew)"}
        `;

        const aiData = await fetchAIWithRetry(promptText);
        
        if (!aiData || !aiData.candidates) throw new Error("AI returned empty response");

        let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(cleanJSON(aiText));
        
        analysis = {
            score: parseInt(parsed.score) || 0,
            general: parsed.general || analysis.general,
            strengths: parsed.strengths || analysis.strengths,
            weaknesses: parsed.weaknesses || analysis.weaknesses,
            recommendation: parsed.recommendation || analysis.recommendation
        };
        console.log(`🤖 Score: ${analysis.score}`);

    } catch (e) {
        console.error("⚠️ Final AI Failure:", e.message);
    }

    // שמירה לשיטס
    try {
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL.startsWith("http")) {
            await fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...candidate, ...analysis })
            });
            console.log("✅ Saved to Sheets");
        }
        res.json({ message: "OK" });
    } catch (e) {
        console.error("🔥 Save Error:", e.message);
        res.status(500).json({ message: "Error" });
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await findWorkingModel(); // הרצת סריקת מודלים בהפעלה
});