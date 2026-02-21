import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.v3Project.findUnique({
      where: { id },
      include: {
        videos: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("[v3/projects/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    const project = await prisma.v3Project.update({
      where: { id },
      data,
      include: { videos: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("[v3/projects/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.v3Project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[v3/projects/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
