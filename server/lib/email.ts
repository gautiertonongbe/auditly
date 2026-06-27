import nodemailer from "nodemailer";

// Falls back to console.log if SMTP_HOST is not configured
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendWorkpaperReviewRequest(params: {
  toEmail: string;
  toName: string;
  fromName: string;
  controlRef: string;
  engagementClient: string;
  workpaperId: string;
  engagementId: string;
}) {
  const subject = `[Auditly] Workpaper ready for review: ${params.controlRef} — ${params.engagementClient}`;
  const reviewUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/engagements/${params.engagementId}/workpapers/${params.workpaperId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #1a2744; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; font-size: 18px; margin: 0;">Auditly</h1>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 32px;">
        <h2 style="font-size: 16px; color: #111827; margin: 0 0 16px;">Workpaper ready for your review</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
          <strong>${params.fromName}</strong> has prepared the workpaper for <strong>${params.controlRef}</strong>
          on the <strong>${params.engagementClient}</strong> engagement and submitted it for your review.
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          The AI-generated writeup includes references to each accepted PBC item so you can easily cross-check the testing against the evidence on file.
        </p>
        <a href="${reviewUrl}" style="display: inline-block; background: #2E86DE; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Open Workpaper for Review
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">
          This is an automated notification from Auditly. Reply to this email to contact your engagement team.
        </p>
      </div>
    </div>
  `;

  const transport = getTransport();
  if (!transport) {
    console.log(`[Email] SMTP not configured. Would have sent to ${params.toEmail}:\n  Subject: ${subject}\n  Review URL: ${reviewUrl}`);
    return;
  }

  await transport.sendMail({
    from: `"Auditly" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: `"${params.toName}" <${params.toEmail}>`,
    subject,
    html,
  });

  console.log(`[Email] Review request sent to ${params.toEmail} for ${params.controlRef}`);
}
