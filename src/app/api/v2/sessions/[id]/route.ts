import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Get a V2 session
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await prisma.v2Session.findUnique({ where: { id } });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Update a V2 session
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    const session = await prisma.v2Session.update({
      where: { id },
      data,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Delete a V2 session
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.v2Session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[v2/sessions/id] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
