import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/kie";

const STORYBOARD_PROMPT = `You are a professional video ad storyboard creator. Given a script, break it down into 3-6 individual scenes/shots that can each be generated as a short video clip.

For each scene, provide:
1. sectionNumber - The order of this scene (1, 2, 3, etc.)
2. description - What happens in this scene (2-3 sentences)
3. visualPrompt - A detailed prompt for AI video generation describing the visual elements, camera angle, lighting, mood, and action. Be specific and cinematic.
4. voiceover - The narration/dialogue for this scene (if any)

Return your response as a JSON array with this exact structure:
[
  {
    "sectionNumber": 1,
    "description": "Opening shot description",
    "visualPrompt": "Detailed video generation prompt...",
    "voiceover": "The narration text..."
  }
]

Only respond with valid JSON, no other text.`;

export async function POST(req: NextRequest) {
  try {
    const { projectId, scriptContent } = await req.json();

    if (!projectId || !scriptContent) {
      return new Response(
        JSON.stringify({ error: "projectId and scriptContent are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate storyboard using AI
    const response = await chatCompletion([
      { role: "system", content: STORYBOARD_PROMPT },
      { role: "user", content: `Create a storyboard for this script:\n\n${scriptContent}` },
    ]);

    const assistantMessage = response.choices?.[0]?.message?.content;
    if (!assistantMessage) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    let sections;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = assistantMessage.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        sections = JSON.parse(jsonMatch[0]);
      } else {
        sections = JSON.parse(assistantMessage);
      }
    } catch {
      console.error("Failed to parse storyboard JSON:", assistantMessage);
      throw new Error("Failed to parse storyboard response");
    }

    // Delete existing storyboard sections for this project
    await prisma.storyboardSection.deleteMany({
      where: { projectId },
    });

    // Create new storyboard sections
    const createdSections = await Promise.all(
      sections.map((section: { sectionNumber: number; description: string; visualPrompt: string; voiceover?: string }) =>
        prisma.storyboardSection.create({
          data: {
            projectId,
            sectionNumber: section.sectionNumber,
            description: section.description,
            visualPrompt: section.visualPrompt,
            voiceover: section.voiceover || null,
            status: "pending",
          },
        })
      )
    );

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "storyboard" },
    });

    return new Response(JSON.stringify(createdSections), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[storyboard/generate] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
