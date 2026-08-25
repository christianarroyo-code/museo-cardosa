import { getStore } from "@netlify/blobs";

// Almacén compartido en la nube para todas las obras del museo.
// Todos los dispositivos leen y escriben aquí, así que la colección es común.

function store() {
  return getStore("museo-obras");
}

export default async (request) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const s = store();

    // GET: devolver todas las obras, más nuevas primero.
    if (request.method === "GET") {
      const list = await s.list();
      // Cargamos todas las obras EN PARALELO (no en bucle secuencial),
      // así el tiempo no crece linealmente con el número de obras.
      const works = await Promise.all(
        list.blobs.map(async (entry) => {
          try {
            return await s.get(entry.key, { type: "json" });
          } catch {
            return null;
          }
        })
      );
      const clean = works.filter(Boolean);
      // Ordenar por createdAt (fecha real de subida). Fallback al id numérico.
      clean.sort((a, b) => {
        const ta = a.createdAt ?? parseInt(String(a.id), 10) ?? 0;
        const tb = b.createdAt ?? parseInt(String(b.id), 10) ?? 0;
        return tb - ta;
      });
      return new Response(JSON.stringify({ works: clean }), { headers });
    }

    // POST: guardar una obra.
    if (request.method === "POST") {
      let work;
      try {
        work = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "JSON no válido" }), { status: 400, headers });
      }
      if (!work || !work.id) {
        return new Response(JSON.stringify({ error: "Obra no válida (falta id)" }), { status: 400, headers });
      }
      await s.setJSON(String(work.id), work);
      return new Response(JSON.stringify({ ok: true, id: work.id }), { headers });
    }

    // DELETE: borrar una obra por id, o todas con ?all=1.
    if (request.method === "DELETE") {
      const url = new URL(request.url);
      if (url.searchParams.get("all") === "1") {
        const list = await s.list();
        await Promise.all(list.blobs.map((entry) => s.delete(entry.key)));
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
      const id = url.searchParams.get("id");
      if (!id) return new Response(JSON.stringify({ error: "Falta id" }), { status: 400, headers });
      await s.delete(String(id));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error de almacenamiento: " + (err?.message || "desconocido") }),
      { status: 500, headers }
    );
  }
};
