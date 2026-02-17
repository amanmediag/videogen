import type {
  KieTaskCreateResponse,
  KieTaskStatusResponse,
  KieChatMessage,
  KieChatResponse,
  KieCreditResponse,
  VideoGenerateInput,
  CharacterCreateInput,
} from "@/types";

const API_KEY = process.env.KIE_API_KEY!;
const BASE_URL = "https://api.kie.ai";

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Chat completions (Gemini via kie.ai)
export async function chatCompletion(
  messages: KieChatMessage[],
  model = "gemini-3-pro"
): Promise<KieChatResponse> {
  const res = await fetch(`${BASE_URL}/${model}/v1/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? [{ type: "text", text: m.content }]
            : m.content,
      })),
      stream: false,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Streaming chat completions
export async function chatCompletionStream(
  messages: KieChatMessage[],
  model = "gemini-3-pro"
): Promise<Response> {
  const res = await fetch(`${BASE_URL}/${model}/v1/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? [{ type: "text", text: m.content }]
            : m.content,
      })),
      stream: true,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat streaming API error ${res.status}: ${text}`);
  }

  return res;
}

// Create a task (video generation, character creation, etc.)
export async function createTask(
  model: string,
  input: Record<string, unknown>,
  callBackUrl?: string
): Promise<KieTaskCreateResponse> {
  const body: Record<string, unknown> = { model, input };
  if (callBackUrl) body.callBackUrl = callBackUrl;

  const res = await fetch(`${BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Task create error ${res.status}: ${text}`);
  }

  return res.json();
}

// Get task status
export async function getTaskStatus(
  taskId: string
): Promise<KieTaskStatusResponse> {
  const res = await fetch(
    `${BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Task status error ${res.status}: ${text}`);
  }

  return res.json();
}

// Generate video (text-to-video or image-to-video)
export async function generateVideo(input: VideoGenerateInput) {
  const model = input.image_urls
    ? "sora-2-image-to-video"
    : "sora-2-text-to-video";
  return createTask(model, input as unknown as Record<string, unknown>);
}

// Create a character from an existing video task
export async function createCharacter(input: CharacterCreateInput) {
  return createTask(
    "sora-2-characters-pro",
    input as unknown as Record<string, unknown>
  );
}

// Check credit balance
export async function checkCredits(): Promise<KieCreditResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/chat/credit`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Credits check error ${res.status}: ${text}`);
  }

  return res.json();
}
