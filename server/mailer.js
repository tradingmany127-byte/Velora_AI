import nodemailer from "nodemailer";

export function makeMailer(env) {
  const hasSmtp = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  if (!hasSmtp) return { hasSmtp: false, transport: null };

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: false,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });

  return { hasSmtp: true, transport };
}

export async function sendVerifyCode(mailer, from, to, code) {
  if (!mailer.hasSmtp) return false;
  await mailer.transport.sendMail({
    from,
    to,
    subject: "Velora AI — код подтверждения",
    text: `Ваш код подтверждения: ${code}\n\nЕсли вы не регистрировались — просто игнорируйте это письмо.`
  });
  return true;
}