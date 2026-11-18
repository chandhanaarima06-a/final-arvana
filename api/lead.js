// Vercel serverless function. Handles TWO independent emails via Resend:
//   stage "interest"      -> Email 1: contact details, sent when "Book a Free Session" is clicked
//   stage "questionnaire" -> Email 2: contact details + all discovery answers
// Environment variables (Vercel > Settings > Environment Variables):
//   RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const row = (l, v) => `<tr><td style="padding:8px 12px;color:#777;width:140px;font-size:13px">${l}</td><td style="padding:8px 12px;font-size:14px;color:#111"><b>${esc(v)}</b></td></tr>`;
const shell = (title, inner) => `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e5e0d0"><div style="background:#080808;color:#D4AF37;padding:18px 22px;font-size:18px;letter-spacing:2px">ARVANA</div><div style="padding:22px"><h2 style="margin:0 0 14px;font-size:18px;color:#111">${title}</h2>${inner}</div></div>`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let b = req.body;
  try { if (typeof b === 'string') b = JSON.parse(b || '{}'); } catch { return res.status(400).json({ error: 'Bad request' }); }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot
  const t = (v, n) => String(v || '').trim().slice(0, n);
  const name = t(b.name, 100), whatsapp = t(b.whatsapp, 20), email = t(b.email, 150), sid = t(b.sid, 64);
  if (!['interest', 'questionnaire'].includes(b.stage) || !/^[\w-]{8,64}$/.test(sid) || name.length < 2 ||
      !/^\+?[0-9\s-]{10,15}$/.test(whatsapp) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const contact = `<table style="border-collapse:collapse;width:100%;background:#faf7ee">${row('Name', name)}${row('WhatsApp', whatsapp)}${row('Email', email)}</table>`;
  let subject, html;
  if (b.stage === 'interest') {
    subject = `New ARVANA enquiry (interested): ${name}`;
    html = shell('New interest: customer clicked “Book a Free Session”', contact + '<p style="color:#777;font-size:12px">They are now filling in the discovery form. You will get a second email if they complete it.</p>');
  } else {
    const a = Array.isArray(b.answers) ? b.answers.slice(0, 20) : [];
    if (!a.length || a.some((x) => !x || !t(x.q, 300) || !t(x.a, 300))) return res.status(400).json({ error: 'Invalid answers' });
    subject = `Completed discovery form: ${name}`;
    html = shell('Completed Business Discovery Form', contact + '<h3 style="margin:22px 0 4px;font-size:15px;color:#111">Discovery answers</h3>' +
      a.map((x, i) => `<div style="margin:10px 0;padding:10px 14px;border-left:3px solid #D4AF37;background:#faf7ee"><div style="font-size:12px;color:#777">Question ${i + 1}</div><div style="font-size:14px;color:#111">${esc(t(x.q, 300))}</div><div style="margin-top:6px;font-size:15px;color:#7a5a10"><b>${esc(t(x.a, 300))}</b></div></div>`).join(''));
  }
  const { RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !LEAD_TO_EMAIL || !LEAD_FROM_EMAIL) return res.status(500).json({ error: 'Email service not configured' });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${b.stage}-${sid}` },
      body: JSON.stringify({ from: LEAD_FROM_EMAIL, to: [LEAD_TO_EMAIL], reply_to: email, subject, html }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Email failed' });
    return res.status(200).json({ ok: true });
  } catch { return res.status(502).json({ error: 'Email failed' }); }
};
