import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { chatCompletionStream } from "@/lib/kie";
import { SORA_V4_SYSTEM_PROMPT } from "@/lib/prompts";
import type { KieChatMessage } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { projectId, message, systemPrompt } = await req.json();
    console.log("[chat] Request received:", { projectId, message: message?.slice(0, 50) });

    if (!projectId || !message) {
      return new Response(
        JSON.stringify({ error: "projectId and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Save user message
    console.log("[chat] Saving user message...");
    await prisma.chatMessage.create({
      data: { projectId, role: "user", content: message },
    });
    console.log("[chat] User message saved");

    // Get conversation history
    console.log("[chat] Fetching history...");
    const history = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    console.log("[chat] History fetched, count:", history.length);

    // Build messages for kie.ai
    const messages: KieChatMessage[] = [];
    // Use provided system prompt or default to Sora framework
    messages.push({ role: "system", content: systemPrompt || SORA_V4_SYSTEM_PROMPT });
    for (const msg of history) {
      messages.push({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      });
    }

    // Stream response from Gemini
    console.log("[chat] Calling kie.ai with", messages.length, "messages...");
    const kieResponse = await chatCompletionStream(messages);
    console.log("[chat] kie.ai response received, status:", kieResponse.status);

    if (!kieResponse.body) {
      return new Response(
        JSON.stringify({ error: "No response body from kie.ai" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create a TransformStream to collect the full response while streaming
    const reader = kieResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));

            // Parse SSE events to collect content
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const data = JSON.parse(line.slice(6));
                  const delta = data.choices?.[0]?.delta?.content;
                  if (delta) fullContent += delta;
                } catch {
                  // ignore parse errors on partial chunks
                }
              }
            }
          }

          // Save assistant message after stream completes
          if (fullContent) {
            await prisma.chatMessage.create({
              data: { projectId, role: "assistant", content: fullContent },
            });
          }

          controller.close();
        } catch (err) {
          console.error("[chat] Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[chat] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
