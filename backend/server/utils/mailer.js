const sgMail = require("@sendgrid/mail");

const API_KEY = process.env.SENDGRID_API_KEY;
if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

function resolveFrom() {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || "Seguridad Tecnocel";
  if (!fromEmail) return null;
  return `${fromName} <${fromEmail}>`;
}

async function sendVerificationEmail(to, code) {
  if (!API_KEY) {
    throw new Error("SENDGRID_API_KEY no configurado");
  }
  const from = resolveFrom();
  if (!from) {
    throw new Error("SENDGRID_FROM_EMAIL no configurado");
  }
  const msg = {
    to,
    from,
    subject: "Código de verificación",
    text: `Tu código es: ${code}`,
    html: `<p>Tu código es: <b>${code}</b></p>`,
  };
  return sgMail.send(msg);
}

module.exports = { sendVerificationEmail };
