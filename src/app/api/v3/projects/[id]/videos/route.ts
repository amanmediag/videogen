import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prompt, aspectRatio = "portrait", duration = "15" } = await req.json();

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const video = await prisma.v3Video.create({
      data: {
        projectId: id,
        prompt: prompt.trim(),
        aspectRatio,
        duration,
      },
    });

    // Touch project updatedAt
    await prisma.v3Project.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    console.error("[v3/projects/id/videos] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
