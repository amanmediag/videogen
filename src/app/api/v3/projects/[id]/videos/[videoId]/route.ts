import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const data = await req.json();

    const video = await prisma.v3Video.update({
      where: { id: videoId },
      data,
    });

    return NextResponse.json(video);
  } catch (error) {
    console.error("[v3/videos/videoId] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> }
) {
  try {
    const { videoId } = await params;
    await prisma.v3Video.delete({ where: { id: videoId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[v3/videos/videoId] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
