import { NextRequest, NextResponse } from "next/server";
import { createCharacter } from "@/lib/kie";

export async function POST(req: NextRequest) {
  try {
    const {
      taskId,
      username,
      characterPrompt,
      timestamps = "1,4",
      safetyInstruction,
    } = await req.json();

    if (!taskId || !characterPrompt || !timestamps) {
      return NextResponse.json(
        { error: "taskId, characterPrompt, and timestamps are required" },
        { status: 400 }
      );
    }

    const result = await createCharacter({
      origin_task_id: taskId,
      timestamps,
      character_prompt: characterPrompt,
      character_user_name: username || undefined,
      safety_instruction: safetyInstruction || undefined,
    });

    if (result.code !== 200) {
      return NextResponse.json(
        { error: result.msg || "Character creation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ taskId: result.data.taskId });
  } catch (error) {
    console.error("[v2/create-character] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
