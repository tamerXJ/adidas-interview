const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// === מאגר השאלות המעודכן לאדידס ===
const questions = [
    // 1. חיבור למותג (פתיחה)
    { 
        id: 1, 
        text: "למה בחרת להגיש מועמדות דווקא לאדידס, ומה החיבור שלך לספורט?", 
        type: "text" 
    },

    // 2. מכירות ושכנוע (הכסף)
    { 
        id: 2, 
        text: "לקוח מתלבט לגבי נעל ריצה מקצועית ויקרה (למשל Ultraboost). הוא טוען שזה יקר לו. איך תשכנע אותו שזו ההשקעה הנכונה?", 
        type: "text" 
    },

    // 3. סיטואציה בשירות לקוחות (לחץ)
    { 
        id: 3, 
        text: "החנות עמוסה מאוד, אתה לבד במחלקה, ו-3 לקוחות שונים פונים אליך לעזרה בו זמנית. איך תתעדף ותפעל?", 
        type: "text" 
    },

    // 4. סיטואציה בשירות לקוחות (קונפליקט)
    { 
        id: 4, 
        text: "לקוח נכנס כועס מאוד בטענה שנעליים שקנה לפני שבוע נקרעו. הוא מרים את הקול. איך תגיב ומה תעשה?", 
        type: "text" 
    },

    // 5. היררכיה וקבלת מרות
    { 
        id: 5, 
        text: "במהלך משמרת עמוסה, המנהל מבקש ממך לעזוב הכל ולבצע משימה שאתה פחות אוהב (כמו סידור מחסן או ניקיון). כיצד תגיב?", 
        type: "text" 
    },

    // 6. נהלים וחוקים
    { 
        id: 6, 
        text: "אדידס היא רשת בינלאומית עם נהלים קפדניים (משמעת, נהלי קופה, הופעה ייצוגית). איך אתה מסתדר עם עבודה לפי 'ספר חוקים' ברור?", 
        type: "text" 
    },

    // 7. עבודת צוות
    { 
        id: 7, 
        text: "ספר על מקרה שבו היה מתח או חוסר הסכמה בינך לבין חבר לצוות בעבודה. איך פתרתם את זה?", 
        type: "text" 
    },

    // 8. לוגיסטיקה וזמינות
    { 
        id: 8, 
        text: "האם יש לך רכב צמוד או דרך הגעה עצמאית למשמרות (כולל בסופי שבוע וחגים)?", 
        type: "text" 
    },
    { 
        id: 9, 
        text: "מהי הזמינות שלך למשמרות? (כמה משמרות בשבוע, בקרים/ערבים)", 
        type: "text" 
    }
];

// === נתיבים (Routes) ===

app.get('/api/get-questions', (req, res) => {
    res.json(questions);
});

app.post('/api/submit-interview', (req, res) => {
    const { candidate, answers } = req.body;
    
    // הדפסה לטרמינל בצורה ברורה
    console.log("\n========================================");
    console.log(`📄 ריאיון חדש התקבל: ${candidate.name}`);
    console.log(`📞 טלפון: ${candidate.phone}`);
    console.log(`🏠 עיר: ${candidate.city}`);
    console.log("----------------------------------------");
    
    answers.forEach((ans, index) => {
        // מציאת הטקסט של השאלה לפי ה-ID
        const questionText = questions.find(q => q.id === ans.questionId).text;
        console.log(`שאלה ${index + 1}: ${questionText}`);
        console.log(`תשובה: ${ans.answer}`);
        console.log("-");
    });
    console.log("========================================\n");

    // הודעת סיכום למועמד
    let summary = `תודה רבה ${candidate.name}.\n`;
    summary += "התשובות שלך נשמרו בהצלחה במערכת הגיוס של אדידס עין שמר.\n";
    summary += "אנחנו נעבור על הנתונים וניצור קשר במידה ויימצא זיווג מתאים למשרה.";

    res.json({ message: summary });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});