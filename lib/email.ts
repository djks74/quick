import nodemailer from "nodemailer";
import { Resend } from "resend";

export type EmailProvider = {
  send: (input: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
  enabled: boolean;
};

const normalizeEmail = (value: string) => String(value || "").trim().toLowerCase();

export function getEmailProvider(): EmailProvider {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const resendFrom = String(process.env.RESEND_FROM || "").trim();
  if (resendApiKey && resendFrom) {
    const client = new Resend(resendApiKey);
    return {
      enabled: true,
      send: async ({ to, subject, html, text }) => {
        await client.emails.send({
          from: resendFrom,
          to: [normalizeEmail(to)],
          subject: String(subject || "").trim(),
          html,
          text
        });
      }
    };
  }

  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = normalizeEmail(String(process.env.SMTP_FROM || process.env.SMTP_USER || ""));

  const enabled = Boolean(host && port && user && pass && from);
  if (!enabled) {
    return {
      enabled: false,
      send: async () => {}
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return {
    enabled: true,
    send: async ({ to, subject, html, text }) => {
      await transporter.sendMail({
        from,
        to: normalizeEmail(to),
        subject: String(subject || "").trim(),
        html,
        text
      });
    }
  };
}
