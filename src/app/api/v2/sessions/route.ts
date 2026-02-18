import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// List all V2 projects
export async function GET() {
  try {
    const projects = await prisma.v2Project.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error("[v2/sessions] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Create a new V2 project
export async function POST(req: NextRequest) {
  try {
    const { name, situation } = await req.json();

    if (!name || !situation) {
      return NextResponse.json(
        { error: "name and situation are required" },
        { status: 400 }
      );
    }

    const project = await prisma.v2Project.create({
      data: { name, situation },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("[v2/sessions] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
