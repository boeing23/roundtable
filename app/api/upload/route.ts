import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { Attachment } from "@/lib/db";

const MAX_BYTES = 25 * 1024 * 1024;

/** POST multipart/form-data with `file` (PDF or text) -> Attachment { name, text, chars }. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (25MB max)" }, { status: 413 });

  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdf = await getDocumentProxy(buf);
    const res = await extractText(pdf, { mergePages: true });
    text = res.text;
  } else {
    text = new TextDecoder().decode(buf);
  }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return NextResponse.json({ error: "no extractable text (scanned PDF?)" }, { status: 422 });

  const att: Attachment = { name: file.name, text, chars: text.length };
  return NextResponse.json(att);
}
