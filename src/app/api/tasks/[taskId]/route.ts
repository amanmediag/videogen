import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTaskStatus } from "@/lib/kie";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // Find task in DB
  const task = await prisma.task.findUnique({
    where: { kieTaskId: taskId },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // If already completed, return cached status
  if (task.status === "success" || task.status === "fail") {
    return NextResponse.json(task);
  }

  // Poll kie.ai for latest status
  const kieStatus = await getTaskStatus(taskId);

  if (kieStatus.code !== 200) {
    return NextResponse.json(
      { error: kieStatus.message || "Failed to fetch status" },
      { status: 500 }
    );
  }

  const { state, resultJson, progress } = kieStatus.data;

  // Parse result URL if task succeeded
  let resultUrl: string | null = null;
  if (state === "success" && resultJson) {
    try {
      const parsed = JSON.parse(resultJson);
      resultUrl = parsed.resultUrls?.[0] || null;
    } catch {
      // ignore parse errors
    }
  }

  // Update task in DB
  const updated = await prisma.task.update({
    where: { kieTaskId: taskId },
    data: {
      status: state,
      progress,
      ...(resultUrl && { resultUrl }),
    },
  });

  // Update linked storyboard section if task completed
  if (state === "success" && resultUrl) {
    await prisma.storyboardSection.updateMany({
      where: { taskId },
      data: {
        videoUrl: resultUrl,
        status: "ready",
      },
    });
  } else if (state === "fail") {
    await prisma.storyboardSection.updateMany({
      where: { taskId },
      data: {
        status: "failed",
      },
    });
  }

  return NextResponse.json(updated);
}
