import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Get a V2 project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.v2Project.findUnique({ where: { id } });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Update a V2 project
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    const project = await prisma.v2Project.update({
      where: { id },
      data,
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Delete a V2 project
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.v2Project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
