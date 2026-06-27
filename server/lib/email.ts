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

export async function sendPbcReminderEmail(params: {
  toEmail: string;
  toName: string;
  fromName: string;
  firmName: string;
  clientName: string;
  engagementPeriod: string;
  outstandingItems: { description: string; dueDate?: Date | null; daysOverdue?: number }[];
  portalUrl?: string;
}) {
  const subject = `[Action Required] Outstanding Audit Evidence Request — ${params.clientName}`;
  const itemList = params.outstandingItems
    .map(it => {
      const due = it.dueDate ? ` (due ${it.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})` : "";
      const overdue = it.daysOverdue && it.daysOverdue > 0 ? ` — <span style="color:#E74C3C;font-weight:700;">${it.daysOverdue} days overdue</span>` : "";
      return `<li style="margin:6px 0;">${it.description}${due}${overdue}</li>`;
    })
    .join("");
  const portalBlock = params.portalUrl
    ? `<p style="margin:18px 0 8px;font-size:14px;color:#374151;">You can upload your documents directly using the secure portal link below:</p>
       <a href="${params.portalUrl}" style="display:inline-block;background:#2E86DE;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">Open Client Portal</a>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto;">
      <div style="background: #1a2744; padding: 22px 30px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; font-size: 17px; margin: 0;">${params.firmName}</h1>
        <p style="color: rgba(255,255,255,0.65); font-size: 12px; margin: 4px 0 0;">IT Audit Engagement — ${params.engagementPeriod}</p>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 30px;">
        <h2 style="font-size: 16px; color: #111827; margin: 0 0 14px;">Outstanding Evidence Request</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">Dear ${params.toName},</p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          As part of our audit of <strong>${params.clientName}</strong> for the period ended <strong>${params.engagementPeriod}</strong>,
          we are following up on the items listed below that remain outstanding. Timely receipt of these items is critical
          to completing our fieldwork on schedule.
        </p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin: 0 0 18px;">
          <p style="font-size: 13px; font-weight: 700; color: #111827; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.04em;">Outstanding Items (${params.outstandingItems.length})</p>
          <ul style="margin: 0; padding-left: 18px; color: #374151; font-size: 13px; line-height: 1.7;">
            ${itemList}
          </ul>
        </div>
        ${portalBlock}
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 18px 0 0;">
          Please do not hesitate to contact us if you have any questions. We appreciate your continued cooperation.
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 10px 0 0;">
          Best regards,<br/>
          <strong>${params.fromName}</strong><br/>
          ${params.firmName}
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin: 24px 0 0; border-top: 1px solid #e5e7eb; padding-top: 14px;">
          This message is sent on behalf of ${params.firmName}. For questions, reply to this email.
        </p>
      </div>
    </div>
  `;

  const transport = getTransport();
  if (!transport) {
    console.log(`[Email] SMTP not configured. Would have sent PBC reminder to ${params.toEmail}:\n  Subject: ${subject}`);
    return { subject, html };
  }

  await transport.sendMail({
    from: `"${params.firmName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: `"${params.toName}" <${params.toEmail}>`,
    subject,
    html,
  });

  console.log(`[Email] PBC reminder sent to ${params.toEmail} — ${params.outstandingItems.length} items`);
  return { subject, html };
}

export async function sendFieldworkCompleteEmail(params: {
  toEmail: string;
  toName: string;
  fromName: string;
  firmName: string;
  clientName: string;
  engagementPeriod: string;
  controlsTested: number;
  pbcItemsAccepted: number;
  exceptionsCount: number;
  nextSteps: string;
}) {
  const subject = `Fieldwork Complete — ${params.clientName} IT Audit (${params.engagementPeriod})`;
  const exceptionNote = params.exceptionsCount > 0
    ? `<p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
        During fieldwork we identified <strong>${params.exceptionsCount} exception(s)</strong> which will be communicated separately in our management letter. We will reach out to discuss remediation timelines.
       </p>`
    : `<p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
        We are pleased to report that no exceptions were identified during fieldwork.
       </p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto;">
      <div style="background: #1a2744; padding: 22px 30px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; font-size: 17px; margin: 0;">${params.firmName}</h1>
        <p style="color: rgba(255,255,255,0.65); font-size: 12px; margin: 4px 0 0;">IT Audit Engagement — ${params.engagementPeriod}</p>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 30px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#EAFAF1;display:flex;align-items:center;justify-content:center;">
            <span style="color:#27AE60;font-size:18px;">&#10003;</span>
          </div>
          <h2 style="font-size: 16px; color: #111827; margin: 0;">Fieldwork Complete</h2>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">Dear ${params.toName},</p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 14px;">
          We are pleased to inform you that we have completed our IT audit fieldwork for <strong>${params.clientName}</strong>
          for the period ended <strong>${params.engagementPeriod}</strong>.
        </p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin: 0 0 18px;">
          <p style="font-size: 13px; font-weight: 700; color: #15803d; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.04em;">Fieldwork Summary</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="font-size:13px;color:#374151;padding:4px 0;">Controls Tested</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${params.controlsTested}</td></tr>
            <tr><td style="font-size:13px;color:#374151;padding:4px 0;">Evidence Items Accepted</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${params.pbcItemsAccepted}</td></tr>
            <tr><td style="font-size:13px;color:#374151;padding:4px 0;">Exceptions Identified</td><td style="font-size:13px;font-weight:700;color:${params.exceptionsCount > 0 ? "#E74C3C" : "#27AE60"};text-align:right;">${params.exceptionsCount}</td></tr>
          </table>
        </div>
        ${exceptionNote}
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
          <strong>Next steps:</strong> ${params.nextSteps}
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 16px 0 0;">
          Thank you for your cooperation and the timely provision of evidence throughout this engagement.
          We will be in touch with the final report in due course.
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 10px 0 0;">
          Best regards,<br/>
          <strong>${params.fromName}</strong><br/>
          ${params.firmName}
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin: 24px 0 0; border-top: 1px solid #e5e7eb; padding-top: 14px;">
          This message is sent on behalf of ${params.firmName}. For questions, reply to this email.
        </p>
      </div>
    </div>
  `;

  const transport = getTransport();
  if (!transport) {
    console.log(`[Email] SMTP not configured. Would have sent fieldwork-complete to ${params.toEmail}:\n  Subject: ${subject}`);
    return { subject, html };
  }

  await transport.sendMail({
    from: `"${params.firmName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: `"${params.toName}" <${params.toEmail}>`,
    subject,
    html,
  });

  console.log(`[Email] Fieldwork-complete notification sent to ${params.toEmail}`);
  return { subject, html };
}
