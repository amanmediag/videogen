import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { taskId, url } = await req.json();

  if (!taskId || !url) {
    return NextResponse.json(
      { error: "taskId and url are required" },
      { status: 400 }
    );
  }

  // Download the video
  const response = await fetch(url);
  if (!response.ok) {
    return NextResponse.json(
      { error: `Failed to download: ${response.statusText}` },
      { status: 502 }
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Save to public/videos/
  const videosDir = join(process.cwd(), "public", "videos");
  await mkdir(videosDir, { recursive: true });

  const filename = `${taskId}_${Date.now()}.mp4`;
  const filepath = join(videosDir, filename);
  await writeFile(filepath, buffer);

  const localPath = `/videos/${filename}`;

  // Update task with local path
  await prisma.task.update({
    where: { kieTaskId: taskId },
    data: { localPath },
  });

  return NextResponse.json({ localPath, filename });
}
