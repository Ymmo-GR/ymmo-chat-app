/**
 * LLM Chat Application — Ymmo
 * Cloudflare Workers AI + CORS pour localhost et ymmo
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT = `Tu es l'assistant IA de Ymmo, une plateforme immobilière française avec 12 agences.
Tu aides les utilisateurs à trouver des biens, comprendre le processus d'achat/location, et contacter les agents.
Réponds toujours en français, de façon concise et professionnelle.
Informations clés :
- 89 biens disponibles (appartements, maisons, bureaux, terrains)
- 12 agences : Aix-en-Provence, Marseille, Lyon, Paris, Bordeaux, Nice, Toulouse, Nantes, Montpellier, Strasbourg, Lille, Rennes
- Contact : 04 42 00 00 01 | contact@ymmo.fr
- Réservation possible avec acompte de 500€ via Stripe`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Gérer les requêtes OPTIONS (preflight CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Assets statiques
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Route chat
    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { messages?: ChatMessage[]; message?: string };

    let messages: ChatMessage[] = body.messages || [];

    // Support aussi le format simple { message: "texte" }
    if (!messages.length && body.message) {
      messages = [{ role: "user", content: body.message }];
    }

    // Ajouter le system prompt Ymmo
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const inputs = {
      messages,
      max_tokens: 1024,
      stream: true,
    } satisfies AiTextGenerationInput & { stream: true };

    const stream = await env.AI.run<typeof MODEL_ID>(MODEL_ID, inputs);

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }
}
