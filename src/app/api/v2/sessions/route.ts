import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// List all V2 sessions
export async function GET() {
  try {
    const sessions = await prisma.v2Session.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[v2/sessions] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Create a new V2 session
export async function POST(req: NextRequest) {
  try {
    const { situation } = await req.json();

    if (!situation) {
      return NextResponse.json(
        { error: "situation is required" },
        { status: 400 }
      );
    }

    const session = await prisma.v2Session.create({
      data: { situation },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("[v2/sessions] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
