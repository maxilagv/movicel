const nodemailer = require("nodemailer");

// Transporter configurado para SendGrid usando API Key
const transporter = nodemailer.createTransport({
  service: "SendGrid",
  auth: {
    user: "apikey", // literal, no se cambia
    pass: process.env.SENDGRID_API_KEY,
  },
});

async function sendVerificationEmail(to, code) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || "Seguridad Tecnocel";
  const from = fromEmail ? `${fromName} <${fromEmail}>` : undefined;

  return transporter.sendMail({
    from: from || "no-reply@example.com", // tu remitente verificado en SendGrid
    to,
    subject: "Código de verificación",
    text: `Tu código es: ${code}`,
    html: `<p>Tu código es: <b>${code}</b></p>`,
  });
}

module.exports = { sendVerificationEmail };

