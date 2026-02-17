import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus } from "@/lib/kie";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const result = await getTaskStatus(taskId);

    if (result.code !== 200) {
      return NextResponse.json(
        { error: result.message || "Failed to fetch status" },
        { status: 500 }
      );
    }

    const { state, progress, resultJson } = result.data;

    let resultUrl: string | null = null;
    if (state === "success" && resultJson) {
      try {
        const parsed = JSON.parse(resultJson);
        resultUrl = parsed.resultUrls?.[0] || null;
      } catch {
        // ignore parse errors
      }
    }

    return NextResponse.json({ taskId, state, progress, resultUrl });
  } catch (error) {
    console.error("[v2/task-status] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
