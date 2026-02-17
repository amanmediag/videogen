import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/kie";

export async function POST(req: NextRequest) {
  const {
    projectId,
    characterUsername,
    prompt,
    aspectRatio = "landscape",
    nFrames = "15",
  } = await req.json();

  if (!projectId || !characterUsername || !prompt) {
    return NextResponse.json(
      { error: "projectId, characterUsername, and prompt are required" },
      { status: 400 }
    );
  }

  // Generate video with character using text-to-video with character reference
  const result = await createTask("sora-2-text-to-video", {
    prompt: `[Character: @${characterUsername}] ${prompt}`,
    aspect_ratio: aspectRatio,
    n_frames: nFrames,
    remove_watermark: true,
  });

  if (result.code !== 200) {
    return NextResponse.json(
      { error: result.msg || "Video generation failed" },
      { status: 500 }
    );
  }

  const task = await prisma.task.create({
    data: {
      projectId,
      kieTaskId: result.data.taskId,
      model: "sora-2-text-to-video",
      status: "waiting",
    },
  });

  return NextResponse.json(task, { status: 201 });
}
