import nodemailer from "nodemailer";

export function makeMailer(env) {
  const hasSmtp = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS;
  
  if (!hasSmtp) {
    console.log("[DEV MODE] SMTP не настроен, коды верификации будут в консоли");
    return {
      hasSmtp: false,
      async sendVerifyCode(to, code) {
        console.log(`[DEV MODE] Verify code for ${to}: ${code}`);
        return true;
      }
    };
  }

  const transporter = nodemailer.createTransporter({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  return {
    hasSmtp: true,
    async sendVerifyCode(to, code) {
      try {
        await transporter.sendMail({
          from: env.SMTP_FROM,
          to: to,
          subject: "Velora AI - Код подтверждения",
          text: `Ваш код подтверждения: ${code}\n\nКод действителен 10 минут.`,
          html: `<p>Ваш код подтверждения: <strong>${code}</strong></p><p>Код действителен 10 минут.</p>`
        });
        return true;
      } catch (error) {
        console.error("Email send error:", error);
        return false;
      }
    }
  };
}

export async function sendVerifyCode(mailer, from, email, code) {
  return await mailer.sendVerifyCode(email, code);
}
