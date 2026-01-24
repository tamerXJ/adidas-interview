require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================================
// משתנים מ-Render (Environment Variables)
// ==========================================================
const API_KEY = process.env.API_KEY;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

// הגדרות מייל
const EMAIL_USER = process.env.EMAIL_USER;       
const EMAIL_PASS = process.env.EMAIL_PASS;       
const MANAGER_EMAIL = process.env.MANAGER_EMAIL; 

let ACTIVE_MODEL = "gemini-1.5-flash"; 

app.use(express.json());
app.use(express.static('public'));

// הגדרת השליחה (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

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

async function sendEmailAlert(candidateName, score, summary, phone) {
    if (!EMAIL_USER || !EMAIL_PASS) {
        console.log("⚠️ לא הוגדרו פרטי מייל ב-Render, מדלג על שליחה.");
        return;
    }

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; direction: rtl; text-align: right;">
        <div style="text-align: center; margin-bottom: 20px;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/2/20/Adidas_Logo.svg" alt="Adidas" style="width: 80px;">
        </div>
        <h2 style="color: #000; text-align: center;">🌟 אותר מועמד (בדיקת מערכת)</h2>
        <hr style="border: 0; border-top: 2px solid #000;">
        
        <p style="font-size: 16px;"><strong>שם המועמד:</strong> ${candidateName}</p>
        <p style="font-size: 16px;"><strong>טלפון:</strong> ${phone}</p>
        <p style="font-size: 16px;"><strong>ציון התאמה:</strong> <span style="background-color: #000; color: #fff; padding: 2px 8px; border-radius: 4px;">${score}/10</span></p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 15px;">
            <strong>סיכום הראיון:</strong><br>
            ${summary}
        </div>

        <div style="text-align: center; margin-top: 20px;">
            <a href="${GOOGLE_SHEET_URL}" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 5px;">מעבר לאקסל המלא</a>
        </div>

        <p style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">
            הודעה זו נשלחה אוטומטית ממערכת הגיוס של אדידס
        </p>
    </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Adidas Recruiting AI" <${EMAIL_USER}>`,
            to: MANAGER_EMAIL,
            subject: `🔔 בדיקה: מועמד חדש (${candidateName}) - ציון ${score}`,
            html: htmlContent
        });
        console.log("📨 מייל התראה נשלח בהצלחה!");
    } catch (error) {
        console.error("❌ שגיאה בשליחת מייל:", error);
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
        אתה מנהל גיוס מומחה של חברת אדידס (Adidas). נתח את הראיון של המועמד ${candidate.name}.
        הנה התשובות:
        ${answersText}
        
        החזר תשובה אך ורק בפורמט JSON נקי (ללא סימון קוד), המכיל את השדות הבאים בעברית:
        {
          "score": "ציון מספרי 1-10 (מספר בלבד)",
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
        
        let analysis = { score: 0, general: "שגיאה" };

        try {
            analysis = JSON.parse(aiText);
            analysis.score = parseInt(analysis.score) || 0;
        } catch (e) {
            console.error("Failed to parse AI JSON", e);
        }

        console.log(`🤖 ציון: ${analysis.score}`);

        // === שינוי לבדיקה: שולח מייל אם הציון הוא 1 ומעלה ===
        if (analysis.score >= 1) {
            await sendEmailAlert(candidate.name, analysis.score, analysis.general, candidate.phone);
        }

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
            console.log("✅ נשמר באקסל");
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