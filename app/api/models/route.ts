import { NextResponse } from "next/server";
import { isAvailable, MODELS } from "@/lib/models";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      model: m.model,
      color: m.color,
      available: isAvailable(m),
    })),
  );
}
