import { SORA_V4_SYSTEM_PROMPT } from "@/lib/prompts";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const API_URL = "https://api.anthropic.com/v1/messages";

async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

export async function generateSoraPrompt(situation: string): Promise<string> {
  return callClaude(SORA_V4_SYSTEM_PROMPT, situation);
}

export async function generateCharacterPrompt(
  basePrompt: string,
  characterUsername: string,
  situation: string
): Promise<string> {
  const systemPrompt = `${SORA_V4_SYSTEM_PROMPT}

------------------------------------------------------------
CHARACTER CONTINUATION RULE
------------------------------------------------------------

You are continuing a video ad that already has a first 15-second clip generated.
The character from the first clip has been saved with the username: ${characterUsername}

Your job is to generate the NEXT 15-second continuation prompt.

Rules:
- The same person must appear (use character_user_name: ${characterUsername} in the prompt)
- Continue the scene naturally from where the first clip left off
- Maintain the same environment, lighting, and camera style
- The script should pick up mid-conversation or mid-thought
- Do NOT repeat the first 15 seconds — this is the NEXT part
- Keep the same archetype and delivery style`;

  const userMessage = `Original situation: ${situation}

First 15s prompt that was generated:
${basePrompt}

Now generate the NEXT 15-second continuation prompt for this video, using the same character (username: ${characterUsername}).`;

  return callClaude(systemPrompt, userMessage);
}
