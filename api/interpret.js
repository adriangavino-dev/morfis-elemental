// api/interpret.js  — Vercel Serverless Function (Node)
// -----------------------------------------------------------------------------
// Convierte lenguaje natural en español a la intención que entiende Morfis
// Elemental: { space, type, params }. Usa Groq (Llama) en modo JSON.
//
// SEGURIDAD: la GROQ_API_KEY vive SOLO en el servidor (variable de entorno),
// nunca en el navegador. El front llama a /api/interpret, no a Groq directo.
//
// Configurar en Vercel:  Settings → Environment Variables → GROQ_API_KEY
// Modelo gratuito recomendado: llama-3.3-70b-versatile (o llama-3.1-8b-instant
// si querés menor latencia).
// -----------------------------------------------------------------------------

const SYSTEM = `Sos el intérprete de un editor de imágenes basado en álgebra lineal.
Devolvés EXCLUSIVAMENTE un objeto JSON con la forma { "space", "type", "params" }.
No agregues texto, explicaciones ni markdown.

Espacios y tipos válidos:
- space "geo":
  - "rotate"    params {"deg": number}        // grados; positivo = antihorario
  - "scale"     params {"sx": number, "sy": number}  // ancho=sx, alto=sy
  - "reflect"   params {"axis": "x" | "y"}     // "y"=espejo izquierda-derecha, "x"=espejo arriba-abajo
  - "shear"     params {"k": number, "h": boolean}   // h=true horizontal
  - "translate" params {"tx": number, "ty": number}  // en celdas; derecha +tx, izquierda -tx, arriba +ty, abajo -ty
- space "color":
  - "gray" {}    "invert" {}    "sepia" {}    "swap" {}
  - "sat"   params {"v": number}              // 0 gris, 1 igual, >1 más saturado
  - "boost" params {"ch": "rojo" | "verde" | "azul"}
- space "mask":
  - "highlight" params {"region": "centro"|"arriba"|"abajo"|"izquierda"|"derecha"|"arriba-izquierda"|"arriba-derecha"|"abajo-izquierda"|"abajo-derecha"}
  - "clear" {}
- space "control":
  - "reset" {}   // empezar de nuevo / limpiar todo
  - "undo" {}    // deshacer la última

Reglas:
- Elegí el ÚNICO tipo que mejor corresponde al pedido.
- Si el pedido combina varias cosas, devolvé la primera operación; el usuario puede pedir el resto después.
- Si no corresponde a nada de lo anterior, devolvé {"space":"none"}.
Ejemplos:
"gírala un poco a la izquierda" -> {"space":"geo","type":"rotate","params":{"deg":20}}
"hacela el doble de grande" -> {"space":"geo","type":"scale","params":{"sx":2,"sy":2}}
"pasala a blanco y negro" -> {"space":"color","type":"gray","params":{}}
"resaltá la esquina de abajo a la derecha" -> {"space":"mask","type":"highlight","params":{"region":"abajo-derecha"}}
"volvé al original" -> {"space":"control","type":"reset","params":{}}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ space: "none" });
  const text = (req.body && req.body.text) ? String(req.body.text) : "";
  if (!text.trim()) return res.status(400).json({ space: "none" });

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
      }),
    });
    if (!r.ok) return res.status(502).json({ space: "none" });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let intent;
    try { intent = JSON.parse(raw); } catch { return res.status(200).json({ space: "none" }); }
    return res.status(200).json(intent);
  } catch (e) {
    return res.status(500).json({ space: "none" });
  }
}
