import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, RotateCw, Send, Trash2, Undo2, Move, Palette, Image as ImageIcon, Grid3x3 } from "lucide-react";

/*
  MORFIS ELEMENTAL — chatbot de transformaciones lineales
  =======================================================
  Todo es álgebra lineal. Dos espacios, ambos con matrices:
   • GEOMETRÍA (posición): rotar, escalar, reflejar, sesgar, trasladar.
     Matriz homogénea 3x3  | a c e |
                           | b d f |   (e,f) = traslación, en unidades
                           | 0 0 1 |
   • COLOR: (R,G,B) es un vector; grises/negativo/sepia/saturación/
     intercambio de canales son matrices 3x3 (+ offset) por píxel.

  COMPOSICIÓN: las operaciones se encadenan en un "pipeline". La geometría
  se compone como producto de matrices (Mₙ·…·M₂·M₁). El orden importa:
  el producto NO es conmutativo (ver nota en el panel).

  MODOS: imagen  |  coordenadas (un polígono cuyos vértices se transforman).

  Convención de pantalla (y hacia abajo): se aplica ctx.transform(a,-b,-c,d,…)
  = S·M·S⁻¹ con S=diag(1,-1), para que lo antihorario se vea antihorario.

  >>> Lenguaje libre: interpret() llama a Groq (Llama) vía /api/interpret y, si
      no hay backend, usa el parser local localIntent(). El backend devuelve
      {space,type,params} y buildGeo/buildColor arman la matriz. Ver api/interpret.js.
*/

const I = "#f5a524", J = "#38bdf8";
const round = (n) => { const r = Math.round(n * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
const firstNumber = (s) => { const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const UNIT = 38;

// ---------------- GEOMETRÍA (homogénea {a,b,c,d,e,f}) ----------------
const GID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (A, B) => ({
  a: A.a * B.a + A.c * B.b, b: A.b * B.a + A.d * B.b,
  c: A.a * B.c + A.c * B.d, d: A.b * B.c + A.d * B.d,
  e: A.a * B.e + A.c * B.f + A.e, f: A.b * B.e + A.d * B.f + A.f,
});
const rotation = (deg) => { const t = deg * Math.PI / 180; return { a: Math.cos(t), b: Math.sin(t), c: -Math.sin(t), d: Math.cos(t), e: 0, f: 0 }; };
const scale = (sx, sy) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
const reflect = (axis) => axis === "x" ? { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 } : { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const shear = (k, h) => h ? { a: 1, b: 0, c: k, d: 1, e: 0, f: 0 } : { a: 1, b: k, c: 0, d: 1, e: 0, f: 0 };
const translate = (tx, ty) => ({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });

// intención (sin matriz) — la usan tanto Groq como el parser local
function localGeo(s) {
  if (/reflej|espej|volte|invier|flip/.test(s)) { const axis = /vertical|arriba|abajo/.test(s) ? "x" : "y"; return { type: "reflect", params: { axis } }; }
  if (/rot|gir|vuelt/.test(s)) {
    let deg = firstNumber(s); if (deg == null) deg = 90;
    if (/horari|derech/.test(s) && !/antihorari/.test(s)) deg = -Math.abs(deg);
    if (/antihorari|izquierd/.test(s)) deg = Math.abs(deg);
    return { type: "rotate", params: { deg } };
  }
  if (/traslad|mueve|mover|despla|corre/.test(s)) {
    let n = firstNumber(s); if (n == null) n = 2; let tx = 0, ty = 0;
    if (/izquierd/.test(s)) tx = -n; else if (/derech/.test(s)) tx = n;
    if (/arriba|sube/.test(s)) ty = n; else if (/abajo|baja/.test(s)) ty = -n;
    if (tx === 0 && ty === 0) tx = n;
    return { type: "translate", params: { tx, ty } };
  }
  if (/sesg|inclin|cizall|shear/.test(s)) { let k = firstNumber(s); if (k == null) k = 0.5; const h = !/vertical/.test(s); return { type: "shear", params: { k, h } }; }
  if (/escal|tama|agrand|amplia|amplía|aument|achic|reduc|redimensi|zoom/.test(s)) {
    let f = firstNumber(s); if (/%/.test(s) && f != null) f /= 100;
    if (f == null) f = /achic|reduc/.test(s) ? 0.5 : 1.5;
    if (/ancho|horizontal/.test(s)) return { type: "scale", params: { sx: f, sy: 1 } };
    if (/alto|vertical/.test(s)) return { type: "scale", params: { sx: 1, sy: f } };
    return { type: "scale", params: { sx: f, sy: f } };
  }
  return null;
}
function buildGeo(type, p) {
  if (type === "rotate") return rotation(p.deg);
  if (type === "scale") return scale(p.sx ?? 1, p.sy ?? 1);
  if (type === "reflect") return reflect(p.axis === "x" ? "x" : "y");
  if (type === "shear") return shear(p.k ?? 0.5, p.h !== false);
  if (type === "translate") return translate(p.tx ?? 0, p.ty ?? 0);
  return GID;
}
function explainGeo(cmd) {
  const m = cmd.matrix, det = round(m.a * m.d - m.b * m.c), homog = m.e !== 0 || m.f !== 0;
  const base = { space: "geo", matrix: m, det, homog, iLands: [round(m.a), round(m.b)], jLands: [round(m.c), round(m.d)] };
  const T = {
    rotate: () => ({ title: `Rotación de ${cmd.params.deg}°`, steps: [
      `cos(${cmd.params.deg}°) = ${round(Math.cos(cmd.params.deg * Math.PI / 180))}, sen(${cmd.params.deg}°) = ${round(Math.sin(cmd.params.deg * Math.PI / 180))}.`,
      `M = [[cosθ, −senθ], [senθ, cosθ]]; cada punto pasa a M·(x,y)ᵀ.`,
      `det = ${det}: conserva área y orientación.`] }),
    scale: () => ({ title: cmd.params.sx === cmd.params.sy ? `Escalado ×${cmd.params.sx}` : `Escalado (ancho ×${cmd.params.sx}, alto ×${cmd.params.sy})`, steps: [
      `Matriz diagonal M = [[${cmd.params.sx}, 0], [0, ${cmd.params.sy}]].`,
      `M·(x,y)ᵀ = (${cmd.params.sx}·x, ${cmd.params.sy}·y).`,
      `det = ${det}: factor de cambio de área.`] }),
    reflect: () => ({ title: cmd.params.axis === "y" ? "Reflexión horizontal (espejo izq–der)" : "Reflexión vertical (espejo arr–ab)", steps: [
      cmd.params.axis === "y" ? `Refleja sobre eje Y: M = [[−1, 0], [0, 1]].` : `Refleja sobre eje X: M = [[1, 0], [0, −1]].`,
      `Cambia de signo ${cmd.params.axis === "y" ? "x → −x" : "y → −y"}.`,
      `det = ${det} (negativo): invierte la orientación.`] }),
    shear: () => ({ title: `Sesgado ${cmd.params.h ? "horizontal" : "vertical"} (k = ${cmd.params.k})`, steps: [
      cmd.params.h ? `M = [[1, ${cmd.params.k}], [0, 1]].` : `M = [[1, 0], [${cmd.params.k}, 1]].`,
      `${cmd.params.h ? `x → x + ${cmd.params.k}·y` : `y → y + ${cmd.params.k}·x`}.`,
      `det = ${det}: conserva el área aunque deforme.`] }),
    translate: () => ({ title: `Traslación (${cmd.params.tx}, ${cmd.params.ty})`, steps: [
      `La traslación NO es lineal en 2D; se usan coordenadas homogéneas (x,y,1).`,
      `M = [[1,0,${cmd.params.tx}], [0,1,${cmd.params.ty}], [0,0,1]].`,
      `M·(x,y,1)ᵀ = (x+${cmd.params.tx}, y+${cmd.params.ty}, 1); el origen se mueve.`] }),
  };
  return { ...base, ...T[cmd.type]() };
}

// ---------------- COLOR (3x3 + offset, sobre 0..255) ----------------
const CID = { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o: [0, 0, 0] };
const LUM = [0.299, 0.587, 0.114];
const satMatrix = (s) => { const [r, g, b] = LUM; return { m: [
  [(1 - s) * r + s, (1 - s) * g, (1 - s) * b], [(1 - s) * r, (1 - s) * g + s, (1 - s) * b], [(1 - s) * r, (1 - s) * g, (1 - s) * b + s],
], o: [0, 0, 0] }; };
function localColor(s) {
  if (/gris|blanco y negro|escala de gris/.test(s)) return { type: "gray", params: {} };
  if (/invert|negativo/.test(s)) return { type: "invert", params: {} };
  if (/sepia/.test(s)) return { type: "sepia", params: {} };
  if (/satur/.test(s)) { let v = firstNumber(s); if (v == null) v = /menos|desatur|baja/.test(s) ? 0.3 : 1.8; return { type: "sat", params: { v } }; }
  if (/intercambi|permut|canal/.test(s)) return { type: "swap", params: {} };
  if (/rojiz|más rojo|mas rojo/.test(s)) return { type: "boost", params: { ch: "rojo" } };
  if (/verd/.test(s)) return { type: "boost", params: { ch: "verde" } };
  if (/azul/.test(s)) return { type: "boost", params: { ch: "azul" } };
  return null;
}
function buildColor(type, p) {
  switch (type) {
    case "gray": return { m: [LUM, LUM, LUM], o: [0, 0, 0] };
    case "invert": return { m: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], o: [255, 255, 255] };
    case "sepia": return { m: [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]], o: [0, 0, 0] };
    case "sat": return satMatrix(p.v ?? 1.8);
    case "swap": return { m: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], o: [0, 0, 0] };
    case "boost": { const f = { rojo: [1.5, 1, 1], verde: [1, 1.5, 1], azul: [1, 1, 1.5] }[p.ch] || [1, 1, 1]; return { m: [[f[0], 0, 0], [0, f[1], 0], [0, 0, f[2]]], o: [0, 0, 0] }; }
    default: return CID;
  }
}
function explainColor(cmd) {
  const base = { space: "color", cmatrix: cmd.cm };
  const M = {
    gray: { title: "Escala de grises", steps: [`Salida = 0.299·R + 0.587·G + 0.114·B (luminosidad).`, `Las tres filas iguales → R=G=B → gris.`, `Es una proyección a una sola dimensión.`] },
    invert: { title: "Negativo", steps: [`M = −I, offset (255,255,255): cada canal → 255 − valor.`, `Refleja el cubo de color respecto a su centro.`] },
    sepia: { title: "Sepia", steps: [`Matriz fija que mezcla canales hacia tonos cálidos.`, `Cada salida es combinación lineal de R, G, B.`] },
    sat: { title: `Saturación ×${cmd.params.v}`, steps: [`M = (1−s)·(luminosidad) + s·I, con s = ${cmd.params.v}.`, `s=0 gris, s=1 igual, s>1 más saturado.`] },
    swap: { title: "Intercambio de canales (R↔B)", steps: [`Matriz de permutación [[0,0,1],[0,1,0],[1,0,0]].`, `Cambia R por B, deja G igual.`] },
    boost: { title: `Realce de canal ${cmd.params.ch}`, steps: [`Matriz diagonal que multiplica un canal por 1.5.`] },
  };
  return { ...base, ...M[cmd.type] };
}
const applyColorChain = (rgb, chain) => {
  let [r, g, b] = rgb;
  for (const cm of chain) {
    const nr = cm.m[0][0] * r + cm.m[0][1] * g + cm.m[0][2] * b + cm.o[0];
    const ng = cm.m[1][0] * r + cm.m[1][1] * g + cm.m[1][2] * b + cm.o[1];
    const nb = cm.m[2][0] * r + cm.m[2][1] * g + cm.m[2][2] * b + cm.o[2];
    r = Math.max(0, Math.min(255, nr)); g = Math.max(0, Math.min(255, ng)); b = Math.max(0, Math.min(255, nb));
  }
  return [r, g, b];
};

function makeSample() {
  const c = document.createElement("canvas"); c.width = 360; c.height = 360; const x = c.getContext("2d");
  x.fillStyle = "#0f1828"; x.fillRect(0, 0, 360, 360);
  x.fillStyle = I; x.fillRect(110, 70, 60, 220); x.fillRect(110, 70, 150, 55); x.fillRect(110, 160, 120, 50);
  x.fillStyle = J; x.beginPath(); x.arc(255, 270, 34, 0, 7); x.fill();
  return c.toDataURL();
}
function parsePoints(str) {
  const pts = []; const re = /\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/g; let m;
  while ((m = re.exec(str))) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  return pts.length >= 2 ? pts : null;
}

// ---------------- RESALTAR ZONAS (máscara espacial, no es matriz) ----------------
const REGIONS = {
  centro: { x: .30, y: .30, w: .40, h: .40 },
  arriba: { x: .22, y: .05, w: .56, h: .42 },
  abajo: { x: .22, y: .53, w: .56, h: .42 },
  izquierda: { x: .05, y: .22, w: .42, h: .56 },
  derecha: { x: .53, y: .22, w: .42, h: .56 },
  "arriba-izquierda": { x: .05, y: .05, w: .44, h: .44 },
  "arriba-derecha": { x: .51, y: .05, w: .44, h: .44 },
  "abajo-izquierda": { x: .05, y: .51, w: .44, h: .44 },
  "abajo-derecha": { x: .51, y: .51, w: .44, h: .44 },
};
function localMask(s) {
  if (/(quita|saca|sin|borra|apaga).*(resalt|destac|foco|ilumin)/.test(s)) return { type: "clear", params: {} };
  if (/resalt|destac|foco|ilumin|spotlight/.test(s)) {
    const up = /arriba|superior/.test(s), down = /abajo|inferior/.test(s), left = /izquierd/.test(s), right = /derech/.test(s);
    let region = "centro";
    if (up && left) region = "arriba-izquierda"; else if (up && right) region = "arriba-derecha";
    else if (down && left) region = "abajo-izquierda"; else if (down && right) region = "abajo-derecha";
    else if (up) region = "arriba"; else if (down) region = "abajo"; else if (left) region = "izquierda"; else if (right) region = "derecha";
    return { type: "highlight", params: { region } };
  }
  return null;
}
function explainMask(region) {
  return { space: "mask", region, title: `Resaltar zona: ${region.replace("-", " ")}`, steps: [
    `Resaltar una zona NO es una transformación lineal: no existe una matriz que lo describa.`,
    `Es una máscara espacial: se atenúa todo el lienzo y queda a plena luz solo la región elegida.`,
    `Sirve para dirigir la atención sin alterar la geometría ni los colores de la imagen.`,
  ] };
}

// ---------------- enrutador de intención ----------------
function localIntent(s) {
  if (/limpia|borra todo|reinici|empezar de nuevo|reset/.test(s)) return { space: "control", type: "reset", params: {} };
  if (/deshace|undo|deshacer|atrás|atras|quita.*últim|quita.*ultim/.test(s)) return { space: "control", type: "undo", params: {} };
  const mk = localMask(s); if (mk) return { space: "mask", ...mk };
  if (/gris|blanco|negativo|invert|sepia|satur|canal|rojiz|rojo|verd|azul/.test(s)) { const c = localColor(s); if (c) return { space: "color", ...c }; }
  const g = localGeo(s); if (g) return { space: "geo", ...g };
  return null;
}
// Intenta entender lenguaje libre con Groq (vía /api/interpret) y si no hay
// backend, cae al parser local. El backend devuelve {space,type,params}.
async function interpret(text) {
  try {
    const res = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (res.ok) { const d = await res.json(); if (d && d.space && d.space !== "none") return d; }
  } catch (e) { /* sin backend: usamos el parser local */ }
  return localIntent(norm(text));
}

// ============================================================
export default function App() {
  const [mode, setMode] = useState("imagen"); // imagen | coords
  const [steps, setSteps] = useState([]);      // pipeline ordenado
  const [highlight, setHighlight] = useState(null); // zona resaltada {x,y,w,h} en 0..1
  const [intensity, setIntensity] = useState(1);    // intensidad del color 0..1
  const [pixels, setPixels] = useState(null);       // grilla de píxeles para el visor
  const [hoverPx, setHoverPx] = useState(null);     // píxel sobre el que está el mouse
  const [info, setInfo] = useState(null);
  const [points, setPoints] = useState([[-1.4, -1], [1.6, -1], [-1.4, 1.4]]);
  const [ptInput, setPtInput] = useState("(-1.4,-1) (1.6,-1) (-1.4,1.4)");
  const [messages, setMessages] = useState([
    { role: "bot", text: "Soy Morfis Elemental. Pídeme transformaciones en lenguaje natural: «gírala un poco a la izquierda y hazla más pequeña», «pásala a blanco y negro», «resalta la esquina de abajo a la derecha». Encadeno las operaciones y te muestro cada matriz y la resultante." },
  ]);
  const [input, setInput] = useState("");
  const beforeRef = useRef(null), afterRef = useRef(null), imgRef = useRef(null);

  useEffect(() => { const img = new Image(); img.onload = () => { imgRef.current = img; drawAll(); }; img.src = makeSample(); }, []);

  // geometría combinada (producto) y cadena de color
  const geoTotal = steps.filter((s) => s.space === "geo").reduce((acc, s) => mul(s.matrix, acc), GID);
  const colorChain = steps.filter((s) => s.space === "color").map((s) => s.cm);
  const geoCount = steps.filter((s) => s.space === "geo").length;

  const drawGrid = (ctx, W, H) => {
    const cx = W / 2, cy = H / 2; ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.strokeStyle = "#1c2942";
    for (let gx = cx % UNIT; gx < W; gx += UNIT) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = cy % UNIT; gy < H; gy += UNIT) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.strokeStyle = "#34507e"; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  };
  // mezcla cada matriz de color hacia la identidad según la intensidad (0..1)
  const lerpCM = (cm, t) => ({ m: cm.m.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) * (1 - t) + v * t)), o: cm.o.map((o) => o * t) });
  const tintedImage = useCallback(() => {
    const img = imgRef.current; if (!img) return null;
    const oc = document.createElement("canvas"); oc.width = img.width; oc.height = img.height;
    const o = oc.getContext("2d"); o.drawImage(img, 0, 0);
    if (colorChain.length && intensity > 0) {
      const chain = colorChain.map((cm) => lerpCM(cm, intensity));
      const data = o.getImageData(0, 0, oc.width, oc.height); const p = data.data;
      for (let i = 0; i < p.length; i += 4) { const [r, g, b] = applyColorChain([p[i], p[i + 1], p[i + 2]], chain); p[i] = r; p[i + 1] = g; p[i + 2] = b; }
      o.putImageData(data, 0, 0);
    }
    return oc;
  }, [colorChain, intensity]);

  const drawAll = useCallback(() => {
    const bc = beforeRef.current, ac = afterRef.current; if (!bc || !ac) return;
    const W = bc.width, H = bc.height, cx = W / 2, cy = H / 2;
    const b = bc.getContext("2d"), a = ac.getContext("2d");
    drawGrid(b, W, H); drawGrid(a, W, H);

    if (mode === "coords") {
      const toScreen = ([x, y]) => [cx + x * UNIT, cy - y * UNIT];
      const tf = ([x, y]) => [geoTotal.a * x + geoTotal.c * y + geoTotal.e, geoTotal.b * x + geoTotal.d * y + geoTotal.f];
      const poly = (ctx, pts, fill, stroke) => {
        ctx.beginPath(); pts.forEach((p, i) => { const [sx, sy] = toScreen(p); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
        pts.forEach((p) => { const [sx, sy] = toScreen(p); ctx.fillStyle = stroke; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 7); ctx.fill(); });
      };
      poly(b, points, "rgba(245,166,36,.18)", I);
      a.save(); a.globalAlpha = .25; poly(a, points, "rgba(138,160,196,.10)", "#3a4d72"); a.restore();
      poly(a, points.map(tf), "rgba(56,189,248,.18)", J);
      return;
    }

    const img = imgRef.current; if (!img) return;
    const fit = (Math.min(W, H) * 0.42) / Math.max(img.width, img.height);
    const w = img.width * fit, h = img.height * fit;
    b.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    a.save(); a.globalAlpha = 0.12; a.drawImage(img, cx - w / 2, cy - h / 2, w, h); a.restore();
    const tint = tintedImage() || img;
    a.save(); a.translate(cx, cy); a.transform(geoTotal.a, -geoTotal.b, -geoTotal.c, geoTotal.d, geoTotal.e * UNIT, -geoTotal.f * UNIT);
    a.drawImage(tint, -w / 2, -h / 2, w, h); a.restore();

    if (highlight) {
      const r = highlight;
      a.save();
      a.fillStyle = "rgba(7,12,22,0.62)";
      a.beginPath(); a.rect(0, 0, W, H); a.rect(r.x * W, r.y * H, r.w * W, r.h * H); a.fill("evenodd");
      a.strokeStyle = J; a.lineWidth = 2; a.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
      a.restore();
    }
  }, [mode, geoTotal, tintedImage, points, highlight]);

  useEffect(() => { drawAll(); }, [drawAll]);

  const botSay = (text) => setMessages((p) => [...p, { role: "bot", text }]);

  function handleIntent(it) {
    if (!it) return botSay("No entendí. Puedes pedir geometría (rotar, escalar, reflejar, sesgar, trasladar), colores (grises, negativo, sepia, saturación, canales) o resaltar una zona.");
    if (it.space === "control") {
      if (it.type === "reset") { setSteps([]); setInfo(null); setHighlight(null); return botSay("Listo, volvimos a la imagen original."); }
      if (it.type === "undo") { setSteps((p) => p.slice(0, -1)); return botSay("Quité la última transformación."); }
      return;
    }
    if (it.space === "mask") {
      if (mode !== "imagen") return botSay("El resaltado funciona en modo imagen.");
      if (it.type === "clear") { setHighlight(null); return botSay("Quité el resaltado."); }
      const region = it.params?.region || "centro";
      setHighlight(REGIONS[region] || REGIONS.centro); setInfo(explainMask(region));
      return botSay(`Resalté la zona: ${region.replace("-", " ")}.`);
    }
    if (it.space === "color") {
      if (mode === "coords") return botSay("El color aplica solo en modo imagen.");
      const cm = buildColor(it.type, it.params || {}); const ex = explainColor({ type: it.type, params: it.params || {}, cm });
      setInfo(ex); setSteps((p) => [...p, { space: "color", cm, label: ex.title }]);
      return botSay(`Agregué: ${ex.title}.`);
    }
    if (it.space === "geo") {
      const matrix = buildGeo(it.type, it.params || {}); const ex = explainGeo({ type: it.type, params: it.params || {}, matrix });
      setInfo(ex); setSteps((p) => [...p, { space: "geo", matrix, label: ex.title }]);
      return botSay(`Agregué: ${ex.title}.${geoCount >= 1 ? " Mira la matriz resultante a la derecha." : ""}`);
    }
  }

  async function applyText(text) {
    const s = text.trim(); if (!s) return;
    setMessages((p) => [...p, { role: "user", text: s }]);
    const it = await interpret(s);
    handleIntent(it);
  }
  const onSend = () => { applyText(input); setInput(""); };

  function loadImage(src) {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200; let final = img;
      if (Math.max(img.width, img.height) > MAX) {
        const k = MAX / Math.max(img.width, img.height);
        const oc = document.createElement("canvas"); oc.width = Math.round(img.width * k); oc.height = Math.round(img.height * k);
        oc.getContext("2d").drawImage(img, 0, 0, oc.width, oc.height);
        final = new Image(); final.onload = () => { imgRef.current = final; setSteps([]); setInfo(null); setHighlight(null); setMode("imagen"); drawAll(); }; final.src = oc.toDataURL();
        return;
      }
      imgRef.current = final; setSteps([]); setInfo(null); setHighlight(null); setMode("imagen"); drawAll();
    };
    img.src = src;
  }
  function onUpload(e) { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => loadImage(ev.target.result); reader.readAsDataURL(file); }
  function commitPoints() { const p = parsePoints(ptInput); if (p) { setPoints(p); botSay(`Cargué ${p.length} puntos.`); } else botSay("No pude leer los puntos. Formato: (x,y) (x,y) (x,y)…"); }

  // visor: reduce la imagen (con el color aplicado) a una matriz NxN de píxeles
  function togglePixels() {
    if (pixels) { setPixels(null); setHoverPx(null); return; }
    const src = tintedImage() || imgRef.current; if (!src) return;
    const N = 10; const oc = document.createElement("canvas"); oc.width = N; oc.height = N;
    const o = oc.getContext("2d"); o.imageSmoothingEnabled = true; o.drawImage(src, 0, 0, N, N);
    const d = o.getImageData(0, 0, N, N).data; const grid = [];
    for (let y = 0; y < N; y++) { const row = []; for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; row.push([d[i], d[i + 1], d[i + 2]]); } grid.push(row); }
    setPixels(grid);
  }

  const chips = mode === "imagen"
    ? [["Rótala 30°", RotateCw], ["Trasládala 2 a la derecha", Move], ["Agrándala 1.4x", Grid3x3], ["Escala de grises", Palette], ["Resalta el centro", Grid3x3]]
    : [["Rótala 45°", RotateCw], ["Refléjala horizontalmente", Move], ["Sesga 0.6", Grid3x3], ["Escálala 1.3x", Grid3x3]];

  const tf = ([x, y]) => [round(geoTotal.a * x + geoTotal.c * y + geoTotal.e), round(geoTotal.b * x + geoTotal.d * y + geoTotal.f)];

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap');
        * { box-sizing:border-box; }
        html, body { margin:0; background:#0b1322; }
        .root { --bg:#0b1322; --panel:#0f1828; --panel2:#131f33; --border:#1f2c46; --text:#e8eef9; --muted:#8aa0c4; --ok:#34d399;
          min-height:100vh; background:radial-gradient(1200px 600px at 82% -12%, #16243f 0%, transparent 60%), var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; padding:22px; }
        .wrap { max-width:1200px; margin:0 auto; }
        .head { display:flex; align-items:center; gap:13px; margin-bottom:6px; }
        .logo { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:24px; letter-spacing:-0.02em; }
        .logo .el { color:var(--muted); font-weight:500; }
        .tag { color:var(--muted); font-size:13px; margin:0 0 16px 0; }
        .grid { display:grid; grid-template-columns:1.18fr 0.82fr; gap:18px; }
        @media (max-width:940px){ .grid{ grid-template-columns:1fr; } }
        .card { background:var(--panel); border:1px solid var(--border); border-radius:18px; }
        .pad { padding:16px; }
        .modes { display:inline-flex; background:#0a111e; border:1px solid var(--border); border-radius:11px; padding:3px; margin-bottom:14px; }
        .modes button { border:none; background:transparent; color:var(--muted); font-family:inherit; font-size:13px; font-weight:600; padding:7px 13px; border-radius:9px; cursor:pointer; display:inline-flex; gap:6px; align-items:center; }
        .modes button.on { background:var(--panel2); color:var(--text); box-shadow:inset 0 0 0 1px ${I}66; }
        .ba { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .ba figcaption { font-family:'Space Grotesk'; font-size:11px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin-bottom:6px; }
        canvas { width:100%; border-radius:11px; background:#0a111e; display:block; }
        .toolbar { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
        .btn { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600; border:1px solid var(--border); background:var(--panel2); color:var(--text); padding:8px 12px; border-radius:10px; cursor:pointer; transition:.15s; }
        .btn:hover { border-color:#2c456f; background:#18253c; }
        .ptrow { display:flex; gap:8px; margin-top:12px; }
        .ptrow input { flex:1; background:#0a111e; border:1px solid var(--border); color:var(--text); border-radius:10px; padding:9px 12px; font-family:'JetBrains Mono'; font-size:12.5px; outline:none; }
        .right { display:flex; flex-direction:column; gap:18px; }
        .panel-h { font-family:'Space Grotesk'; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 8px; }
        .title { font-family:'Space Grotesk'; font-weight:600; font-size:17px; margin:2px 0 14px; }
        .mtx-row { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
        .matrix { display:inline-grid; gap:6px 14px; font-family:'JetBrains Mono'; font-weight:600; font-size:17px; padding:11px 15px; border-left:2px solid var(--muted); border-right:2px solid var(--muted); border-radius:3px; }
        .matrix span { text-align:right; min-width:40px; }
        .col-i { color:${I}; } .col-j { color:${J}; } .col-k { color:var(--muted); }
        .meta { font-family:'JetBrains Mono'; font-size:12.5px; color:var(--muted); line-height:1.8; margin-top:10px; }
        .meta b { color:var(--text); } .pill { font-size:11px; padding:2px 7px; border-radius:6px; border:1px solid var(--border); }
        .steps { list-style:none; margin:14px 0 0; padding:0; counter-reset:s; }
        .steps li { position:relative; padding:8px 0 8px 30px; font-size:12.5px; line-height:1.5; color:#cdd9ef; border-top:1px solid #16223a; counter-increment:s; }
        .steps li:first-child { border-top:none; }
        .steps li::before { content:counter(s); position:absolute; left:0; top:7px; width:20px; height:20px; border-radius:6px; background:var(--panel2); border:1px solid var(--border); color:var(--muted); font-family:'JetBrains Mono'; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
        .pipe { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
        .pstep { font-size:11.5px; font-family:'JetBrains Mono'; padding:4px 9px; border-radius:8px; border:1px solid var(--border); background:#0a111e; color:#cfdcf2; display:inline-flex; align-items:center; gap:6px; }
        .pstep small { color:var(--muted); }
        .note { font-size:12px; color:var(--muted); margin-top:12px; padding:10px 12px; border:1px dashed #2c3f63; border-radius:10px; line-height:1.5; }
        .note b { color:${J}; }
        .empty { color:var(--muted); font-size:13px; padding:8px 0; }
        .chat { display:flex; flex-direction:column; padding:16px; }
        .msgs { overflow:auto; display:flex; flex-direction:column; gap:9px; max-height:170px; padding-right:4px; }
        .msg { font-size:13px; line-height:1.5; padding:9px 12px; border-radius:12px; max-width:90%; }
        .msg.user { align-self:flex-end; background:#1b2c49; border:1px solid #2a3f63; }
        .msg.bot { align-self:flex-start; background:var(--panel2); border:1px solid var(--border); color:#cfdcf2; }
        .chips { display:flex; gap:7px; flex-wrap:wrap; margin:12px 0 10px; }
        .chip { font-size:12px; color:var(--muted); background:transparent; border:1px solid var(--border); padding:6px 10px; border-radius:999px; cursor:pointer; display:inline-flex; gap:6px; align-items:center; transition:.15s; }
        .chip:hover { color:var(--text); border-color:#2c456f; background:#15223a; }
        .composer { display:flex; gap:8px; }
        .composer input { flex:1; background:#0a111e; border:1px solid var(--border); color:var(--text); border-radius:11px; padding:11px 13px; font-size:14px; font-family:inherit; outline:none; }
        .composer input:focus { border-color:#2c456f; }
        .send { background:${I}; color:#1a1102; border:none; border-radius:11px; padding:0 14px; cursor:pointer; display:flex; align-items:center; }
        .slider-row { display:flex; align-items:center; gap:12px; margin-top:14px; font-size:12.5px; color:var(--muted); }
        .slider-row b { color:var(--text); font-family:'JetBrains Mono'; min-width:42px; text-align:right; }
        .slider-row input[type=range] { flex:1; accent-color:${I}; }
        .pixels { margin-top:16px; }
        .px-head { font-size:11.5px; color:var(--muted); margin-bottom:8px; }
        .px-grid { display:grid; grid-template-columns:repeat(10,1fr); gap:2px; max-width:300px; }
        .px { aspect-ratio:1; border-radius:2px; cursor:crosshair; }
        .px:hover { outline:2px solid ${I}; outline-offset:1px; }
        .px-read { margin-top:8px; font-family:'JetBrains Mono'; font-size:12px; color:${I}; }
        .swatches { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .sw { width:30px; height:30px; border-radius:7px; border:1px solid #00000040; }
        .arrow { color:var(--muted); }
        .legend { display:flex; gap:15px; font-size:12px; color:var(--muted); margin-top:10px; flex-wrap:wrap; }
        .dot { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; }
        .coordlist { font-family:'JetBrains Mono'; font-size:12px; color:var(--muted); margin-top:12px; line-height:1.7; }
        .coordlist b { color:var(--text); }
      `}</style>

      <div className="wrap">
        <div className="head">
          <div className="logo">Transformaciones de <b>imagen</b></div>
        </div>
        <p className="tag">Transformaciones lineales sobre imágenes y coordenadas — cada operación, su matriz.</p>

        <div className="grid">
          <div className="card pad">
            <div className="modes">
              <button className={mode === "imagen" ? "on" : ""} onClick={() => setMode("imagen")}><ImageIcon size={14} /> Imagen</button>
              <button className={mode === "coords" ? "on" : ""} onClick={() => setMode("coords")}><Grid3x3 size={14} /> Coordenadas</button>
            </div>
            <div className="ba">
              <figure style={{ margin: 0 }}><figcaption>Antes</figcaption><canvas ref={beforeRef} width={300} height={300} /></figure>
              <figure style={{ margin: 0 }}><figcaption>Después</figcaption><canvas ref={afterRef} width={300} height={300} /></figure>
            </div>
            <div className="legend">
              <span><span className="dot" style={{ background: I }} /> original</span>
              <span><span className="dot" style={{ background: J }} /> transformado</span>
              <span style={{ opacity: .7 }}>{mode === "imagen" ? "imagen tenue = original" : "vértices = puntos"}</span>
            </div>
            {mode === "imagen" ? (
              <div className="toolbar">
                <label className="btn"><Upload size={15} /> Subir imagen<input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} /></label>
                <button className="btn" onClick={() => applyText("limpiar")}><Trash2 size={15} /> Empezar de nuevo</button>
                <button className="btn" onClick={() => applyText("deshacer")}><Undo2 size={15} /> Deshacer última</button>
                <button className="btn" onClick={togglePixels}><Grid3x3 size={15} /> {pixels ? "Ocultar píxeles" : "Ver píxeles"}</button>
              </div>
            ) : (
              <>
                <div className="ptrow">
                  <input value={ptInput} onChange={(e) => setPtInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitPoints()} placeholder="(x,y) (x,y) (x,y)…" />
                  <button className="btn" onClick={commitPoints}>Cargar</button>
                </div>
                <div className="toolbar">
                  <button className="btn" onClick={() => applyText("limpiar")}><Trash2 size={15} /> Empezar de nuevo</button>
                  <button className="btn" onClick={() => applyText("deshacer")}><Undo2 size={15} /> Deshacer última</button>
                </div>
                <div className="coordlist">
                  {points.map((p, i) => { const t = tf(p); return <div key={i}>v{i + 1}: (<b style={{ color: I }}>{p[0]}, {p[1]}</b>) → (<b style={{ color: J }}>{t[0]}, {t[1]}</b>)</div>; })}
                </div>
              </>
            )}

            {mode === "imagen" && colorChain.length > 0 && (
              <div className="slider-row">
                <span>Intensidad del color</span>
                <input type="range" min="0" max="100" value={Math.round(intensity * 100)} onChange={(e) => setIntensity(Number(e.target.value) / 100)} />
                <b>{Math.round(intensity * 100)}%</b>
              </div>
            )}

            {mode === "imagen" && pixels && (
              <div className="pixels">
                <div className="px-head">La imagen es una matriz de píxeles · cada celda es un vector (R, G, B)</div>
                <div className="px-grid">
                  {pixels.map((row, y) => row.map((rgb, x) => (
                    <span key={`${y}-${x}`} className="px" style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }}
                      onMouseEnter={() => setHoverPx({ x, y, rgb })} />
                  )))}
                </div>
                <div className="px-read">{hoverPx ? `píxel (fila ${hoverPx.y + 1}, col ${hoverPx.x + 1}) = (${hoverPx.rgb[0]}, ${hoverPx.rgb[1]}, ${hoverPx.rgb[2]})` : "Pasa el mouse por una celda para ver su valor RGB."}</div>
              </div>
            )}
          </div>

          <div className="right">
            <div className="card pad">
              <p className="panel-h">{info ? (info.space === "color" ? "Última: color" : info.space === "mask" ? "Última: resaltado" : "Última: geometría") : "Transformación"}</p>
              {info ? <div className="title">{info.title}</div> : <div className="empty">Pide una transformación para ver su matriz.</div>}
              {info && (info.space === "color" ? <ColorPanel info={info} /> : info.space === "mask" ? <MaskPanel info={info} /> : <GeoPanel info={info} />)}
              {info && <ol className="steps">{info.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}

              {geoCount >= 2 && (
                <>
                  <p className="panel-h" style={{ marginTop: 18 }}>Matriz geométrica resultante</p>
                  <div className="matrix" style={{ gridTemplateColumns: "auto auto auto" }}>
                    <span className="col-i">{round(geoTotal.a)}</span><span className="col-j">{round(geoTotal.c)}</span><span className="col-k">{round(geoTotal.e)}</span>
                    <span className="col-i">{round(geoTotal.b)}</span><span className="col-j">{round(geoTotal.d)}</span><span className="col-k">{round(geoTotal.f)}</span>
                    <span className="col-k">0</span><span className="col-k">0</span><span className="col-k">1</span>
                  </div>
                  <div className="note">El producto es <b>Mₙ · … · M₂ · M₁</b> (la última se aplica primero al multiplicar). No es conmutativo: cambiar el orden cambia el resultado.</div>
                </>
              )}

              {steps.length > 0 && (
                <>
                  <p className="panel-h" style={{ marginTop: 16 }}>Transformaciones aplicadas ({steps.length})</p>
                  <div className="pipe">{steps.map((s, i) => <span key={i} className="pstep"><small>{i + 1}</small> {s.label}</span>)}</div>
                </>
              )}
            </div>

            <div className="card chat">
              <p className="panel-h">Conversación</p>
              <div className="msgs">{messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}</div>
              <div className="chips">{chips.map(([label, Ic]) => <button key={label} className="chip" onClick={() => applyText(label)}><Ic size={13} /> {label}</button>)}</div>
              <div className="composer">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="Escribe una transformación…" />
                <button className="send" onClick={onSend}><Send size={17} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeoPanel({ info }) {
  const m = info.matrix;
  return (
    <div className="mtx-row">
      <BasisDiagram m={m} det={info.det} />
      <div>
        {info.homog ? (
          <div className="matrix" style={{ gridTemplateColumns: "auto auto auto" }}>
            <span className="col-i">{round(m.a)}</span><span className="col-j">{round(m.c)}</span><span className="col-k">{round(m.e)}</span>
            <span className="col-i">{round(m.b)}</span><span className="col-j">{round(m.d)}</span><span className="col-k">{round(m.f)}</span>
            <span className="col-k">0</span><span className="col-k">0</span><span className="col-k">1</span>
          </div>
        ) : (
          <div className="matrix" style={{ gridTemplateColumns: "auto auto" }}>
            <span className="col-i">{round(m.a)}</span><span className="col-j">{round(m.c)}</span>
            <span className="col-i">{round(m.b)}</span><span className="col-j">{round(m.d)}</span>
          </div>
        )}
        <div className="meta">
          <div>det = <b>{info.det}</b> <span className="pill" style={{ color: info.det < 0 ? "#f87171" : "var(--ok)", borderColor: info.det < 0 ? "#5b2330" : "#244b3c" }}>{info.det < 0 ? "orientación invertida" : info.det === 1 ? "área intacta" : "área ×" + Math.abs(info.det)}</span></div>
          <div>î → (<span className="col-i">{info.iLands[0]}, {info.iLands[1]}</span>)</div>
          <div>ĵ → (<span className="col-j">{info.jLands[0]}, {info.jLands[1]}</span>)</div>
          {info.homog && <div>origen → (<span className="col-k">{round(m.e)}, {round(m.f)}</span>)</div>}
        </div>
      </div>
    </div>
  );
}
function MaskPanel({ info }) {
  const r = REGIONS[info.region] || REGIONS.centro;
  const S = 150, w = S, h = S * 0.78;
  return (
    <div className="mtx-row">
      <svg width={w} height={h} style={{ background: "#0a111e", borderRadius: 12, flexShrink: 0 }}>
        <rect x="0" y="0" width={w} height={h} fill="rgba(7,12,22,0.62)" />
        <rect x={r.x * w} y={r.y * h} width={r.w * w} height={r.h * h} fill="rgba(56,189,248,.12)" stroke={J} strokeWidth="2" />
      </svg>
      <div className="meta">
        <div>tipo: <b>máscara espacial</b></div>
        <div>región: <b>{info.region.replace("-", " ")}</b></div>
        <div style={{ color: "var(--muted)" }}>sin matriz asociada</div>
      </div>
    </div>
  );
}
function ColorPanel({ info }) {
  const cm = info.cmatrix;
  const samples = [[230, 64, 64], [64, 200, 96], [80, 130, 240], [230, 200, 80]];
  const ap = ([r, g, b]) => cm.m.map((row, k) => Math.max(0, Math.min(255, row[0] * r + row[1] * g + row[2] * b + cm.o[k])));
  return (
    <div>
      <div className="mtx-row">
        <div className="matrix" style={{ gridTemplateColumns: "auto auto auto", fontSize: 15 }}>
          {cm.m.flatMap((row, r) => row.map((v, c) => <span key={`${r}-${c}`}>{round(v)}</span>))}
        </div>
        {(cm.o[0] || cm.o[1] || cm.o[2]) ? <div className="meta">offset = ({cm.o.join(", ")})</div> : null}
      </div>
      <div className="swatches" style={{ marginTop: 14 }}>
        {samples.map((s, i) => { const [r, g, b] = ap(s); return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span className="sw" style={{ background: `rgb(${s.join(",")})` }} /><span className="arrow">→</span>
            <span className="sw" style={{ background: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})` }} />
          </span>); })}
      </div>
    </div>
  );
}
function BasisDiagram({ m, det }) {
  const S = 178, c = S / 2, u = 38;
  const P = (x, y) => [c + x * u, c - y * u];
  const [ix, iy] = P(m.a, m.b), [jx, jy] = P(m.c, m.d), [sx, sy] = P(m.a + m.c, m.b + m.d);
  const fill = det < 0 ? "rgba(248,113,113,.16)" : "rgba(52,211,153,.14)";
  const stroke = det < 0 ? "rgba(248,113,113,.5)" : "rgba(52,211,153,.45)";
  const Arrow = ({ x, y, color }) => { const ang = Math.atan2(y - c, x - c), h = 8; return <g><line x1={c} y1={c} x2={x} y2={y} stroke={color} strokeWidth="2.4" /><polygon points={`${x},${y} ${x - h * Math.cos(ang - 0.5)},${y - h * Math.sin(ang - 0.5)} ${x - h * Math.cos(ang + 0.5)},${y - h * Math.sin(ang + 0.5)}`} fill={color} /></g>; };
  return (
    <svg width={S} height={S} style={{ background: "#0a111e", borderRadius: 12, flexShrink: 0 }}>
      {[-2, -1, 1, 2].map((g) => <g key={g}><line x1={c + g * u} y1={0} x2={c + g * u} y2={S} stroke="#16223a" /><line x1={0} y1={c + g * u} x2={S} y2={c + g * u} stroke="#16223a" /></g>)}
      <line x1={0} y1={c} x2={S} y2={c} stroke="#33507e" /><line x1={c} y1={0} x2={c} y2={S} stroke="#33507e" />
      <polygon points={`${P(0, 0)} ${P(1, 0)} ${P(1, 1)} ${P(0, 1)}`} fill="rgba(138,160,196,.07)" stroke="#243450" />
      <polygon points={`${P(0, 0)} ${ix},${iy} ${sx},${sy} ${jx},${jy}`} fill={fill} stroke={stroke} strokeWidth="1.5" />
      <Arrow x={ix} y={iy} color={I} /><Arrow x={jx} y={jy} color={J} />
    </svg>
  );
}
