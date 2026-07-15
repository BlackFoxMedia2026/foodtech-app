import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { can, getActiveVenue } from "@/lib/tenant";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "not_an_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const pathname = `campaigns/${ctx.venueId}/${crypto.randomUUID()}.${extension}`;

  const blob = await put(pathname, file, { access: "public" });
  return NextResponse.json({ url: blob.url });
}
