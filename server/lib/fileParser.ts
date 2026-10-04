import ExcelJS from "exceljs";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ParsedFile = {
  text: string;          // extracted text content
  mimeType: string;
  isImage: boolean;
  isPdf: boolean;
  isExcel: boolean;
};

export function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/avi",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function parseFileBuffer(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const mimeType = getMimeType(fileName);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isExcel = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"].includes(mimeType);
  const isVideo = mimeType.startsWith("video/");

  if (isVideo) {
    return { text: `[Video file: ${fileName}. Content cannot be extracted for AI analysis.]`, mimeType, isImage: false, isPdf: false, isExcel: false };
  }

  if (isExcel) {
    const text = await parseExcel(buffer, fileName);
    return { text, mimeType, isImage: false, isPdf: false, isExcel: true };
  }

  if (isImage || isPdf) {
    // For images and PDFs, return a placeholder — the actual content goes to the vision model inline
    return { text: `[Binary file: ${fileName}, ${(buffer.length / 1024).toFixed(1)} KB]`, mimeType, isImage, isPdf, isExcel: false };
  }

  // Plain text / CSV / other text-based files
  return { text: buffer.toString("utf-8").slice(0, 8000), mimeType, isImage: false, isPdf: false, isExcel: false };
}

async function parseExcel(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  
  if (ext === "csv") {
    return buffer.toString("utf-8").slice(0, 8000);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    rows.push(`=== Sheet: ${sheet.name} ===`);
    
    let rowCount = 0;
    sheet.eachRow((row) => {
      if (rowCount++ > 200) return; // limit per sheet
      const cells = (row.values as (string | number | null)[])
        .slice(1) // ExcelJS rows are 1-indexed with null at [0]
        .map(v => (v == null ? "" : String(v)))
        .join("\t");
      rows.push(cells);
    });

    sheets.push(rows.join("\n"));
  });

  return sheets.join("\n\n").slice(0, 12000);
}

// Classify a PBC file using the AI model — supports images and PDFs via vision
export async function classifyPbcFileAI(params: {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  isImage: boolean;
  isPdf: boolean;
  textContent: string;
}): Promise<{ domain: string; controlType: string; isIpe: boolean; suggestedControl: string }> {
  const systemPrompt = `You are a SOX ITGC auditor. Classify this PBC file uploaded by a client.
Return ONLY valid JSON: { "domain": "ITGC"|"ITAC", "controlType": "CM"|"AM"|"CO"|"PD"|"Input"|"Processing"|"Output"|"Interface", "isIpe": true|false, "suggestedControl": "e.g. AM-02 User access review" }`;

  let messageContent: Anthropic.MessageParam["content"];

  if ((params.isImage || params.isPdf) && params.buffer.length < 5 * 1024 * 1024) {
    // Use vision for images and PDFs under 5MB
    const base64 = params.buffer.toString("base64");
    messageContent = [
      {
        type: "image",
        source: { type: "base64", media_type: params.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: base64 },
      } as Anthropic.ImageBlockParam,
      { type: "text", text: `File name: ${params.fileName}\nClassify this audit evidence file.` },
    ];
  } else {
    messageContent = `File name: ${params.fileName}\nContent preview:\n${params.textContent.slice(0, 3000)}`;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}
