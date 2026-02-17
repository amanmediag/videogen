import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// Create a script for a project
export async function POST(req: NextRequest) {
  try {
    const { projectId, content, isFinal } = await req.json();

    if (!projectId || !content) {
      return new Response(
        JSON.stringify({ error: "projectId and content are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the next version number
    const lastScript = await prisma.script.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });

    const version = (lastScript?.version ?? 0) + 1;

    // If this is marked as final, unmark any existing final scripts
    if (isFinal) {
      await prisma.script.updateMany({
        where: { projectId, isFinal: true },
        data: { isFinal: false },
      });
    }

    const script = await prisma.script.create({
      data: {
        projectId,
        content,
        version,
        isFinal: isFinal ?? false,
      },
    });

    return new Response(JSON.stringify(script), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[scripts] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
