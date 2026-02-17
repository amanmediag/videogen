import { NextRequest, NextResponse } from "next/server";
import { generateSoraPrompt } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { situation } = await req.json();

    if (!situation) {
      return NextResponse.json(
        { error: "situation is required" },
        { status: 400 }
      );
    }

    const prompt = await generateSoraPrompt(situation);
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("[v2/generate-prompt] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
