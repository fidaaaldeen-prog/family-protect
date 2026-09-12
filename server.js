// server.js
const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// { phone: { code, status, requestedAt } }
const pendingActivations = {};

function checkAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  next();
}

// الأب يطلب كود تفعيل
app.post("/api/request-activation", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });

  pendingActivations[phone] = {
    code: null,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };

  if (BOT_TOKEN && ADMIN_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: `📱 طلب تفعيل جديد\nرقم الهاتف: ${phone}\nافتح لوحة التحكم لإرسال الكود.`,
        }),
      });
    } catch (e) {
      console.error("Telegram notify failed:", e);
    }
  }

  res.json({ message: "تم إرسال طلبك، سيصلك الكود قريبًا" });
});

// التطبيق يتحقق من الكود
app.post("/api/verify-code", (req, res) => {
  const { phone, code } = req.body;
  const record = pendingActivations[phone];
  if (record && record.code && record.code === code) {
    record.status = "activated";
    return res.json({ activated: true });
  }
  res.status(400).json({ activated: false, error: "الكود غير صحيح" });
});

/* ---------- Admin endpoints (protected) ---------- */

// عرض كل الطلبات
app.get("/api/admin/requests", checkAdmin, (req, res) => {
  const list = Object.entries(pendingActivations).map(([phone, data]) => ({
    phone,
    ...data,
  }));
  res.json({ requests: list });
});

// إرسال كود لرقم معين
app.post("/api/admin/send-code", checkAdmin, (req, res) => {
  const { phone, code } = req.body;
  if (!pendingActivations[phone]) {
    pendingActivations[phone] = { requestedAt: new Date().toISOString() };
  }
  pendingActivations[phone].code = code;
  pendingActivations[phone].status = "code_sent";
  res.json({ message: "تم إرسال الكود" });
});

// إيقاف تفعيل رقم معين
app.post("/api/admin/deactivate", checkAdmin, (req, res) => {
  const { phone } = req.body;
  if (pendingActivations[phone]) {
    pendingActivations[phone].status = "deactivated";
  }
  res.json({ message: "تم الإيقاف" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
