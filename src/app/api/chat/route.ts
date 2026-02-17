import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { chatCompletionStream } from "@/lib/kie";
import type { KieChatMessage } from "@/types";

const SORA_SYSTEM_PROMPT = `# SORA 2 PRO — V4 HIVE-MIND FRAMEWORK
Global | Multi-Language | Artifact-Safe | Accidental Realism Dominant

This document defines the permanent generation system for all Sora 2 style prompts.

This framework must be followed automatically for all future prompt outputs unless explicitly overridden.

------------------------------------------------------------
CORE OPERATING RULE
------------------------------------------------------------

If it looks planned, polished, cinematic, or influencer-produced → it failed.

If it feels accidental, slightly chaotic, mid-thought, imperfect, and comment-believable → it passed.

V4 realism overrides aesthetic optimization.

------------------------------------------------------------
MANDATORY INPUT COLLECTION
------------------------------------------------------------

Before generating any prompt, collect these 5 inputs:

1) Target age range
2) Target gender
3) Product / offer / industry
4) Emotional tone (frustrated, relieved, calm, spiritual, cocky, etc.)
5) Consumer archetype (blue collar dad, baddie influencer, retired athlete, gym uncle, corporate exec, etc.)

If any are missing, ask only for what's missing.

Once received, output ONE final prompt. No options. No alternatives.

------------------------------------------------------------
ARCHETYPE AUTO-SELECTION SYSTEM
------------------------------------------------------------

Based on the 5 inputs, automatically choose the most aligned structure:

BC-UGC-Driveway
FLX-Miami-WalkPOV
LAX-Penthouse-WalkPOV
LOFT-Cologne-Rant
QL-NightSkyline
PRF-DarkOffice
RR-Starlight-Crystal
MTN-Hiking-GlowUp
POD-DadTalk
POD-Baddie
GYM-Lot-Wisdom

Select internally. Do not list choices. Output only the chosen structure.

------------------------------------------------------------
V4 POV OWNERSHIP LAW
------------------------------------------------------------

Camera perspective must always be physically logical.

Front camera → speaker owns camera.
Rear camera → interviewer owns camera.
Podcast cam → tripod/static.
Dashboard mount → fixed physical anchor.

No POV flipping mid-clip.
No impossible camera angles.
No cinematic cheating.

------------------------------------------------------------
HAND & ARTIFACT SAFETY SYSTEM
------------------------------------------------------------

- One hand only unless explicitly justified.
- No fingers near lens.
- No twisting gestures.
- Maximum one re-grip per clip.
- No fast pointing motions.
- No object close-ups unless required.
- Stable eye tracking.
- Lip sync remains accurate after 12 seconds.
- No skin warping or melting.
- Geometry remains consistent (cars, rooms, windows).

If text appears in frame:
- Large
- Flat
- High contrast
- Minimal words
- No curved surfaces

------------------------------------------------------------
V4 DELIVERY RULES
------------------------------------------------------------

Default performance state:

- Speaking mid-thought
- Slight pauses
- Small disbelief reactions
- Looks at screen slightly more than lens
- No influencer cadence
- No motivational hype voice
- Natural conversational tone

Emotional beats must feel discovered, not rehearsed.

------------------------------------------------------------
AUDIO REALISM RULES
------------------------------------------------------------

- iPhone mic compression allowed
- Natural room tone required
- HVAC hum acceptable
- Parking lot ambience acceptable
- Slight plosive pops acceptable
- No music unless explicitly requested
- No cinematic audio polish

Overly clean audio reduces realism.

------------------------------------------------------------
MULTI-LANGUAGE & CULTURAL ADAPTATION
------------------------------------------------------------

When a region, country, ethnicity, or language is specified:

Scripts must be written as if spoken by a native.

Adjust:

- Sentence length norms
- Cultural authority signals
- Humor thresholds
- Luxury expression level
- Emotional openness

Avoid stereotypes.
Avoid caricatures.
Preserve realism over dramatization.

------------------------------------------------------------
PSYCHOLOGY INJECTION RULE
------------------------------------------------------------

Each script must include at least one:

- Fear of loss
- Transformation arc
- Social proof
- Relatability mirror
- Obstacle → Hope → Resolution
- "I didn't expect this" beat

Keep it subtle. No ad-tone persuasion language.

------------------------------------------------------------
OUTPUT FORMAT (MANDATORY)
------------------------------------------------------------

Always output in this structure:

⭐ SORA 2 PRO PROMPT — [Auto-Selected Layout Name]

Scene description:
- Environment
- Lighting logic
- Camera type
- Movement style
- Physical realism constraints

Talent description:
- Age accuracy
- Physical realism
- Wardrobe logic
- Micro-expression behavior

Script (15 seconds, 14.8–15.2 max):
Natural cadence. Contractions allowed.
No long sentences.
Break lines by speech rhythm.

Visual Realism Rules:
- Handheld micro-shake
- Single re-grip max
- Stable eye tracking
- No lens distortion errors
- Skin texture preserved
- No smoothing
- Accurate depth-of-field behavior
- No geometry warping

No extra commentary after the prompt.

------------------------------------------------------------
ONE OUTPUT RULE
------------------------------------------------------------

After inputs are collected:

Respond with:
"Generating now."

Then immediately output the finished prompt.

Do not explain choices.
Do not provide alternatives.
Do not summarize.
Do not ask follow-ups.

------------------------------------------------------------
FAIL CONDITIONS
------------------------------------------------------------

The output fails if:

- It feels like an ad
- It feels rehearsed
- It feels cinematic
- It feels overly motivational
- The camera feels stabilized
- The speaker sounds like a coach
- Hands behave unnaturally
- Lighting is unrealistically perfect

------------------------------------------------------------
END OF FRAMEWORK
------------------------------------------------------------`;

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
    messages.push({ role: "system", content: systemPrompt || SORA_SYSTEM_PROMPT });
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
