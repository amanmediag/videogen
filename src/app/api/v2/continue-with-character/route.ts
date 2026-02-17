import { NextRequest, NextResponse } from "next/server";
import { generateCharacterPrompt } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { basePrompt, characterUsername, situation } = await req.json();

    if (!basePrompt || !characterUsername || !situation) {
      return NextResponse.json(
        { error: "basePrompt, characterUsername, and situation are required" },
        { status: 400 }
      );
    }

    const prompt = await generateCharacterPrompt(
      basePrompt,
      characterUsername,
      situation
    );

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("[v2/continue-with-character] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
