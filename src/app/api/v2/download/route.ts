import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const { url, taskId } = await req.json();

    if (!url || !taskId) {
      return NextResponse.json(
        { error: "url and taskId are required" },
        { status: 400 }
      );
    }

    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download: ${response.statusText}` },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const videosDir = join(process.cwd(), "public", "videos");
    await mkdir(videosDir, { recursive: true });

    const filename = `v2_${taskId}_${Date.now()}.mp4`;
    const filepath = join(videosDir, filename);
    await writeFile(filepath, buffer);

    const localPath = `/videos/${filename}`;
    return NextResponse.json({ localPath, filename });
  } catch (error) {
    console.error("[v2/download] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
