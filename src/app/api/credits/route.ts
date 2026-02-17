import { checkCredits } from "@/lib/kie";

export async function GET() {
  try {
    const response = await checkCredits();
    // kie.ai returns { code, msg, data } where data is the balance
    const balance = typeof response === 'object' && 'data' in response
      ? (response as { data: number }).data
      : response;

    return new Response(JSON.stringify({ balance }), {
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
