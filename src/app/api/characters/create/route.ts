import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCharacter } from "@/lib/kie";

export async function POST(req: NextRequest) {
  const { projectId, originTaskId, timestamps, characterPrompt, username, safetyInstruction } =
    await req.json();

  if (!projectId || !originTaskId || !timestamps || !characterPrompt) {
    return NextResponse.json(
      {
        error:
          "projectId, originTaskId, timestamps, and characterPrompt are required",
      },
      { status: 400 }
    );
  }

  const result = await createCharacter({
    origin_task_id: originTaskId,
    timestamps,
    character_prompt: characterPrompt,
    character_user_name: username,
    safety_instruction: safetyInstruction,
  });

  if (result.code !== 200) {
    return NextResponse.json(
      { error: result.msg || "Character creation failed" },
      { status: 500 }
    );
  }

  // Save character task to DB
  const task = await prisma.task.create({
    data: {
      projectId,
      kieTaskId: result.data.taskId,
      model: "sora-2-characters-pro",
      status: "waiting",
    },
  });

  // Save character record
  const character = await prisma.character.create({
    data: {
      projectId,
      username: username || `char_${Date.now()}`,
      prompt: characterPrompt,
      originTaskId,
    },
  });

  return NextResponse.json({ task, character }, { status: 201 });
}
