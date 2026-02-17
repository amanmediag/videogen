import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { tasks: true, storyboardSections: true, characters: true },
      },
    },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { name, idea } = await req.json();

  if (!name || !idea) {
    return NextResponse.json(
      { error: "Name and idea are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: { name, idea, status: "draft" },
  });

  return NextResponse.json(project, { status: 201 });
}
