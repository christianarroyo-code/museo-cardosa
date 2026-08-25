// Función serverless: recibe { messages } del navegador y llama a la API de
// Anthropic usando la clave guardada en la variable de entorno ANTHROPIC_API_KEY.
// Así la clave nunca viaja al cliente.

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "Método no permitido" } }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: "Falta ANTHROPIC_API_KEY en las variables de entorno de Netlify." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: "Cuerpo no válido" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: body.messages,
      }),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: "Error al contactar con la API: " + (err?.message || "desconocido") } }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};
