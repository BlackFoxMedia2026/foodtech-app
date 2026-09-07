import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { put } from "@vercel/blob";

import { updateWaiter } from "@/server/waiters";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;

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

  try {
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const pathname = `waiters/${ctx.venueId}/${params.id}/${crypto.randomUUID()}.${extension}`;
    const blob = await put(pathname, file, { access: "public" });
    const updated = await updateWaiter(ctx.venueId, params.id, { photoUrl: blob.url });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
