import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateVideo, createTask } from "@/lib/kie";

export async function POST(req: NextRequest) {
  const { projectId, model, input } = await req.json();

  if (!projectId || !model || !input) {
    return NextResponse.json(
      { error: "projectId, model, and input are required" },
      { status: 400 }
    );
  }

  let result;
  if (
    model === "sora-2-image-to-video" ||
    model === "sora-2-text-to-video"
  ) {
    result = await generateVideo(input);
  } else {
    result = await createTask(model, input);
  }

  if (result.code !== 200) {
    return NextResponse.json(
      { error: result.msg || "Task creation failed" },
      { status: 500 }
    );
  }

  // Save task to DB
  const task = await prisma.task.create({
    data: {
      projectId,
      kieTaskId: result.data.taskId,
      model,
      status: "waiting",
    },
  });

  return NextResponse.json(task, { status: 201 });
}
