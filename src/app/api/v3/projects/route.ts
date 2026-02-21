import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const projects = await prisma.v3Project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        videos: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error("[v3/projects] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const project = await prisma.v3Project.create({
      data: { name: name.trim() },
      include: { videos: true },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("[v3/projects] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
