import { checkCredits } from "@/lib/kie";

export async function GET() {
  try {
    const credits = await checkCredits();
    return new Response(JSON.stringify(credits), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[credits] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
