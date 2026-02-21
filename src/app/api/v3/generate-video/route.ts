import { NextRequest, NextResponse } from "next/server";
import { generateVideo } from "@/lib/kie";

export async function POST(req: NextRequest) {
  try {
    const { prompt, aspect_ratio = "portrait", n_frames = "15" } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const result = await generateVideo({
      prompt,
      aspect_ratio,
      n_frames,
      upload_method: "s3",
      remove_watermark: true,
    });

    if (result.code !== 200) {
      return NextResponse.json(
        { error: result.msg || "Video generation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ taskId: result.data.taskId });
  } catch (error) {
    console.error("[v3/generate-video] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
