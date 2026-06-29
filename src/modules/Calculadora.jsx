import { useState } from "react";
import { Plus, Minus, X, Send, ClipboardPaste } from "lucide-react";
import * as math from "mathjs";

/*
  CALCULADORA MATRICIAL — módulo de Morfis Elemental
  ==================================================
  Ingreso por grilla NxN (cualquier tamaño; para grandes, "Pegar matriz").
  Operaciones: A+B, A·B, det(A), inv(A), Aᵀ, rango(A), valores/vectores propios.

  El motor de eliminación (rowReduce) está escrito a mano para poder MOSTRAR el
  procedimiento real (operaciones de fila). mathjs se usa solo para los valores
  propios de tamaño general; para 2×2 hay un cálculo analítico propio.

  El chatbot responde SOLO de álgebra lineal, con plantillas deterministas
  (sin IA): explica cada operación en términos de álgebra lineal.
*/

const O = "#f5a524"; // anaranjado (primario)
const C = "#38bdf8"; // cian (secundario)
const fmt = (x) => { const r = Math.round(x * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const clone = (M) => M.map((r) => r.slice());

function fmtN(x) {
  if (x == null) return "0";
  if (typeof x === "number") return String(fmt(x));
  if (typeof x === "object" && "re" in x) {
    const re = fmt(x.re), im = fmt(x.im);
    if (Math.abs(im) < 1e-9) return String(re);
    return `${re} ${im < 0 ? "−" : "+"} ${Math.abs(im)}i`;
  }
  return String(x);
}

// ---- eliminación de Gauss con registro de pasos ----
function rowReduce(A, reduced = false) {
  const M = clone(A), rows = M.length, cols = M[0].length, steps = [];
  let swaps = 0; const pivots = []; let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let piv = r;
    for (let i = r + 1; i < rows; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
    if (Math.abs(M[piv][c]) < 1e-12) continue;
    if (piv !== r) { [M[r], M[piv]] = [M[piv], M[r]]; swaps++; steps.push(`Intercambio F${r + 1} ↔ F${piv + 1} para usar el mayor pivote en la columna ${c + 1}.`); }
    pivots.push(c);
    if (reduced) { const pv = M[r][c]; if (Math.abs(pv - 1) > 1e-12) { for (let j = 0; j < cols; j++) M[r][j] /= pv; steps.push(`F${r + 1} → F${r + 1} ÷ ${fmt(pv)} (normalizo el pivote a 1).`); } }
    const start = reduced ? 0 : r + 1;
    for (let i = start; i < rows; i++) {
      if (i === r) continue;
      const f = M[i][c] / M[r][c];
      if (Math.abs(f) > 1e-12) { for (let j = c; j < cols; j++) M[i][j] -= f * M[r][j]; steps.push(`F${i + 1} → F${i + 1} − (${fmt(f)})·F${r + 1} (hago 0 la columna ${c + 1}).`); }
    }
    r++;
  }
  return { M, steps, swaps, pivots, rank: pivots.length };
}
const rankOf = (A) => rowReduce(A).rank;
function determinant(A) {
  const n = A.length, { M, steps, swaps, rank } = rowReduce(A);
  let d = Math.pow(-1, swaps);
  for (let i = 0; i < n; i++) d *= M[i][i];
  if (rank < n) d = 0;
  return { det: fmt(d), steps, swaps, singular: rank < n };
}
function inverse(A) {
  const n = A.length;
  if (rankOf(A) < n) return { ok: false };
  const aug = A.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  const { M, steps } = rowReduce(aug, true);
  return { ok: true, inv: M.map((row) => row.slice(n).map(fmt)), steps };
}
const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));
const matAdd = (A, B) => A.map((row, i) => row.map((v, j) => fmt(v + B[i][j])));
const matMul = (A, B) => A.map((row) => B[0].map((_, j) => fmt(row.reduce((s, val, k) => s + val * B[k][j], 0))));
function eigen(A) {
  const n = A.length;
  if (n === 2) {
    const [a, b] = A[0], [c, d] = A[1];
    const tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
    const mk = (re, im) => (Math.abs(im) < 1e-9 ? re : { re, im });
    let l1, l2;
    if (disc >= 0) { const s = Math.sqrt(disc); l1 = (tr + s) / 2; l2 = (tr - s) / 2; }
    else { const s = Math.sqrt(-disc) / 2; l1 = mk(tr / 2, s); l2 = mk(tr / 2, -s); }
    const vec = (lam) => { // (A−λI)v=0, real λ
      if (typeof lam !== "number") return null;
      if (Math.abs(b) > 1e-9) return [b, lam - a];
      if (Math.abs(c) > 1e-9) return [lam - d, c];
      return [1, 0];
    };
    return { ok: true, pairs: [{ value: l1, vector: vec(l1) }, { value: l2, vector: vec(l2) }], tr, det };
  }
  try {
    const res = math.eigs(A);
    const values = res.values?.toArray ? res.values.toArray() : res.values;
    let pairs = [];
    if (Array.isArray(res.eigenvectors)) {
      pairs = res.eigenvectors.map((ev) => ({ value: ev.value, vector: ev.vector?.toArray ? ev.vector.toArray() : ev.vector }));
    } else if (res.vectors) {
      const V = res.vectors.toArray ? res.vectors.toArray() : res.vectors;
      pairs = values.map((v, idx) => ({ value: v, vector: V.map((row) => row[idx]) }));
    } else {
      pairs = values.map((v) => ({ value: v, vector: null }));
    }
    return { ok: true, pairs };
  } catch (e) { return { ok: false, error: "No pude calcular los valores propios de esta matriz." }; }
}

// ---- parser determinista (solo álgebra lineal) ----
function parseCmd(text) {
  const s = norm(text);
  if (/determinante|determinant|\bdet\b/.test(s)) return "det";
  if (/inversa|invertir|inverse|\binv\b/.test(s)) return "inv";
  if (/transpuesta|transpon|transpose|traspuesta/.test(s)) return "transpose";
  if (/\brango\b|rank/.test(s)) return "rank";
  if (/autovalor|valor.*propio|vector.*propio|eigen|espectro/.test(s)) return "eigen";
  if (/multiplic|producto|a por b|a x b|a\*b|a·b/.test(s)) return "mul";
  if (/suma|sumar|a \+ b|a mas b|adicion/.test(s)) return "add";
  return null;
}

const newMatrix = (r, c, fill = 0) => Array.from({ length: r }, () => Array.from({ length: c }, () => fill));
const I3 = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
const B3 = [[1, 0, 2], [0, 1, 0], [3, 0, 1]];

export default function App() {
  const [A, setA] = useState(I3);
  const [B, setB] = useState(B3);
  const [result, setResult] = useState(null);
  const [messages, setMessages] = useState([
    { role: "bot", text: "Soy tu asistente de álgebra lineal. Carga las matrices A y B y elige una operación, o pídemela por aquí: «calcula el determinante», «inversa de A», «multiplica A por B», «valores y vectores propios». Te explico el procedimiento paso a paso." },
  ]);
  const [input, setInput] = useState("");
  const [pasteFor, setPasteFor] = useState(null);
  const [pasteText, setPasteText] = useState("");

  const say = (text) => setMessages((p) => [...p, { role: "bot", text }]);

  function resize(which, dr, dc) {
    const M = which === "A" ? A : B, set = which === "A" ? setA : setB;
    const r = Math.max(1, M.length + dr), c = Math.max(1, M[0].length + dc);
    const next = newMatrix(r, c);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) next[i][j] = M[i]?.[j] ?? 0;
    set(next);
  }
  function setCell(which, i, j, val) {
    const M = which === "A" ? A : B, set = which === "A" ? setA : setB;
    const next = clone(M); next[i][j] = val === "" || val === "-" ? val : Number(val);
    set(next);
  }
  const numeric = (M) => M.map((row) => row.map((v) => (v === "" || v === "-" ? 0 : Number(v))));

  function commitPaste() {
    const rows = pasteText.trim().split(/\n+/).map((line) => line.trim().split(/[\s,;]+/).map(Number).filter((x) => !Number.isNaN(x)));
    if (rows.length && rows.every((r) => r.length === rows[0].length)) {
      (pasteFor === "A" ? setA : setB)(rows); setPasteFor(null); setPasteText("");
      say(`Cargué la matriz ${pasteFor} de ${rows.length}×${rows[0].length}.`);
    } else say("No pude leer la matriz. Usá una fila por línea y números separados por espacios o comas.");
  }

  function run(op) {
    const a = numeric(A), b = numeric(B);
    const small = Math.max(a.length, a[0].length) <= 4;
    if (op === "add") {
      if (a.length !== b.length || a[0].length !== b[0].length) { say("Para sumar, A y B deben tener el mismo tamaño. Ajusta las dimensiones e inténtalo de nuevo."); setResult(null); return; }
      setResult({ kind: "matrix", title: "A + B", data: matAdd(a, b) });
      say(`Sumé A y B entrada por entrada: (A+B)ᵢⱼ = Aᵢⱼ + Bᵢⱼ. La suma solo está definida cuando ambas matrices tienen la misma forma, y el resultado conserva ese tamaño (${a.length}×${a[0].length}).`);
    } else if (op === "mul") {
      if (a[0].length !== b.length) { say(`Para multiplicar A·B, las columnas de A (${a[0].length}) deben igualar las filas de B (${b.length}). No coinciden, así que el producto no está definido.`); setResult(null); return; }
      setResult({ kind: "matrix", title: "A · B", data: matMul(a, b) });
      say(`Multipliqué filas por columnas: (A·B)ᵢⱼ = Σₖ Aᵢₖ·Bₖⱼ. Cada entrada es el producto punto de una fila de A con una columna de B. El resultado es ${a.length}×${b[0].length}. Ojo: el producto no es conmutativo, A·B ≠ B·A en general.`);
    } else if (op === "transpose") {
      setResult({ kind: "matrix", title: "Aᵀ", data: transpose(a) });
      say("Transpuse A reflejándola sobre su diagonal: la fila i pasa a ser la columna i, es decir (Aᵀ)ᵢⱼ = Aⱼᵢ. Las dimensiones se invierten.");
    } else if (op === "det") {
      if (a.length !== a[0].length) { say("El determinante solo existe para matrices cuadradas. Iguala filas y columnas de A."); setResult(null); return; }
      const d = determinant(a);
      setResult({ kind: "scalar", title: "det(A)", value: d.det, steps: small ? d.steps.concat(`Multiplico la diagonal y aplico el signo de los ${d.swaps} intercambio(s): det = ${d.det}.`) : null, method: small ? null : "Llevé A a forma triangular por eliminación de Gauss; det = (−1)^(intercambios) × producto de la diagonal." });
      say(`Calculé el determinante llevando A a forma triangular por eliminación: es el producto de los pivotes, ajustado por los intercambios de fila. det(A) = ${d.det}. ${d.singular ? "Como da 0, A es singular: colapsa el espacio a una dimensión menor y no tiene inversa." : "Geométricamente, mide cuánto escala áreas/volúmenes la transformación de A."}`);
    } else if (op === "inv") {
      if (a.length !== a[0].length) { say("La inversa solo existe para matrices cuadradas. Iguala filas y columnas de A."); setResult(null); return; }
      const inv = inverse(a);
      if (!inv.ok) { setResult(null); say("A es singular (su determinante es 0, sus filas son linealmente dependientes), así que no tiene inversa."); return; }
      setResult({ kind: "matrix", title: "A⁻¹", data: inv.inv, steps: small ? inv.steps : null, method: small ? null : "Apliqué Gauss-Jordan a la matriz aumentada [A | I] hasta dejar la identidad a la izquierda." });
      say("Para la inversa armé la matriz aumentada [A | I] y apliqué Gauss-Jordan: cuando la izquierda se vuelve la identidad, la derecha es A⁻¹. Cumple A·A⁻¹ = I.");
    } else if (op === "rank") {
      const rr = rowReduce(a);
      setResult({ kind: "scalar", title: "rango(A)", value: rr.rank, steps: small ? rr.steps.concat(`Conté ${rr.rank} pivote(s) → rango = ${rr.rank}.`) : null, method: small ? null : "Reduje A por filas y conté los pivotes." });
      say(`El rango es la cantidad de filas (o columnas) linealmente independientes. Reduje A por filas y conté ${rr.rank} pivote(s), así que rango(A) = ${rr.rank}. Eso es la dimensión de la imagen de la transformación.`);
    } else if (op === "eigen") {
      if (a.length !== a[0].length) { say("Los valores propios solo existen para matrices cuadradas."); setResult(null); return; }
      const e = eigen(a);
      if (!e.ok) { setResult(null); say(e.error || "No pude calcular el espectro."); return; }
      setResult({ kind: "eigen", title: "Valores y vectores propios", pairs: e.pairs });
      const charNote = a.length === 2 ? ` El polinomio característico es λ² − (${fmt(e.tr)})λ + (${fmt(e.det)}) = 0.` : "";
      say(`Los valores propios λ son los que cumplen det(A − λI) = 0, y cada vector propio v satisface A·v = λ·v: la transformación solo lo estira por λ sin cambiarle la dirección.${charNote}`);
    }
  }

  function onSend() {
    const t = input.trim(); if (!t) return;
    setMessages((p) => [...p, { role: "user", text: t }]); setInput("");
    const op = parseCmd(t);
    if (!op) { say("Soy un asistente de álgebra lineal: puedo sumar, multiplicar, transponer y calcular determinante, inversa, rango y valores/vectores propios. Pídeme alguna de esas sobre tus matrices."); return; }
    run(op);
  }

  const ops = [["det", "Determinante"], ["inv", "Inversa"], ["transpose", "Transpuesta"], ["rank", "Rango"], ["eigen", "Valores propios"], ["add", "A + B"], ["mul", "A · B"]];

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap');
        * { box-sizing:border-box; }
        html, body { margin:0; background:#0b1322; }
        .root { --bg:#0b1322; --panel:#0f1828; --panel2:#131f33; --border:#22304d; --text:#e8eef9; --muted:#8aa0c4; --ok:#34d399; --err:#f87171;
          min-height:100vh; background:radial-gradient(1100px 520px at 85% -15%, #2a1d0e 0%, transparent 55%), var(--bg);
          color:var(--text); font-family:'Inter',system-ui,sans-serif; padding:22px; }
        .wrap { max-width:1180px; margin:0 auto; }
        .logo { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:23px; letter-spacing:-.02em; }
        .logo b { color:${O}; } .tag { color:var(--muted); font-size:13px; margin:2px 0 18px; }
        .grid { display:grid; grid-template-columns:1.1fr .9fr; gap:18px; }
        @media (max-width:920px){ .grid{ grid-template-columns:1fr; } }
        .card { background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:16px; }
        .mh { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .mh h3 { font-family:'Space Grotesk'; font-size:15px; margin:0; }
        .mh h3 b { color:${O}; }
        .dim { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:12px; font-family:'JetBrains Mono'; }
        .step { width:24px; height:24px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .step:hover { border-color:${O}; color:${O}; }
        .matrix-wrap { display:flex; align-items:stretch; gap:4px; overflow:auto; padding:2px 0; }
        .brk { width:10px; border:2px solid ${O}; border-right:none; border-radius:3px 0 0 3px; }
        .brk.r { border:2px solid ${O}; border-left:none; border-radius:0 3px 3px 0; }
        .cells { display:grid; gap:5px; }
        .cells input { width:48px; height:34px; text-align:center; background:#0a111e; border:1px solid var(--border); color:var(--text);
          border-radius:7px; font-family:'JetBrains Mono'; font-size:13px; outline:none; }
        .cells input:focus { border-color:${O}; }
        .paste { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--muted); background:transparent; border:1px solid var(--border); border-radius:8px; padding:4px 8px; cursor:pointer; }
        .paste:hover { border-color:${C}; color:var(--text); }
        .ops { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
        .op { font-family:'Space Grotesk'; font-weight:600; font-size:13px; border:1px solid var(--border); background:var(--panel2); color:var(--text); padding:9px 13px; border-radius:10px; cursor:pointer; transition:.15s; }
        .op:hover { border-color:${O}; background:#1d2638; }
        .op.prim { background:${O}; color:#1a1102; border-color:${O}; }
        .op.prim:hover { filter:brightness(1.05); background:${O}; }
        .res-h { font-family:'Space Grotesk'; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 10px; }
        .res-title { font-family:'Space Grotesk'; font-weight:600; font-size:17px; margin:0 0 12px; color:${O}; }
        .scalar { font-family:'JetBrains Mono'; font-weight:700; font-size:34px; color:var(--text); }
        .resmtx { display:inline-flex; gap:4px; }
        .resmtx .cells span { display:flex; align-items:center; justify-content:center; min-width:52px; height:32px; font-family:'JetBrains Mono'; font-size:13px; }
        .steps { list-style:none; margin:14px 0 0; padding:0; counter-reset:s; }
        .steps li { position:relative; padding:7px 0 7px 30px; font-size:12.5px; line-height:1.5; color:#cbd7ef; border-top:1px solid #16223a; counter-increment:s; font-family:'JetBrains Mono'; }
        .steps li:first-child { border-top:none; }
        .steps li::before { content:counter(s); position:absolute; left:0; top:6px; width:20px; height:20px; border-radius:6px; background:var(--panel2); border:1px solid var(--border); color:${O}; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
        .method { font-size:12.5px; color:var(--muted); margin-top:12px; padding:10px 12px; border:1px dashed #3a3320; border-radius:10px; line-height:1.5; }
        .eig { border-top:1px solid #16223a; padding:10px 0; }
        .eig:first-child { border-top:none; }
        .eig .lam { font-family:'JetBrains Mono'; font-size:14px; color:${O}; font-weight:700; }
        .eig .vec { font-family:'JetBrains Mono'; font-size:12.5px; color:${C}; margin-top:3px; }
        .empty { color:var(--muted); font-size:13px; }
        .chat { margin-top:18px; }
        .msgs { display:flex; flex-direction:column; gap:9px; max-height:210px; overflow:auto; padding-right:4px; }
        .msg { font-size:13px; line-height:1.55; padding:9px 12px; border-radius:12px; max-width:92%; }
        .msg.user { align-self:flex-end; background:#2a1d0e; border:1px solid #4a3517; }
        .msg.bot { align-self:flex-start; background:var(--panel2); border:1px solid var(--border); color:#cfdcf2; }
        .composer { display:flex; gap:8px; margin-top:12px; }
        .composer input { flex:1; background:#0a111e; border:1px solid var(--border); color:var(--text); border-radius:11px; padding:11px 13px; font-size:14px; font-family:inherit; outline:none; }
        .composer input:focus { border-color:${O}; }
        .send { background:${O}; color:#1a1102; border:none; border-radius:11px; padding:0 14px; cursor:pointer; display:flex; align-items:center; }
        .modal { position:fixed; inset:0; background:rgba(4,8,16,.7); display:flex; align-items:center; justify-content:center; padding:20px; }
        .modal .card { width:min(440px,100%); }
        .modal textarea { width:100%; height:150px; background:#0a111e; border:1px solid var(--border); color:var(--text); border-radius:10px; padding:10px; font-family:'JetBrains Mono'; font-size:13px; outline:none; resize:vertical; }
        .modal .row { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
      `}</style>

      <div className="wrap">
        <div className="logo">Calculadora <b>matricial</b></div>
        <p className="tag">Opera con matrices de cualquier tamaño y mira el procedimiento, explicado en álgebra lineal.</p>

        <div className="grid">
          <div>
            <MatrixCard name="A" M={A} resize={resize} setCell={setCell} onPaste={() => { setPasteFor("A"); setPasteText(""); }} />
            <div style={{ height: 14 }} />
            <MatrixCard name="B" M={B} resize={resize} setCell={setCell} onPaste={() => { setPasteFor("B"); setPasteText(""); }} />
            <div className="card" style={{ marginTop: 14 }}>
              <p className="res-h">Operaciones</p>
              <div className="ops">
                {ops.map(([op, label]) => <button key={op} className={`op ${["det", "inv", "eigen"].includes(op) ? "prim" : ""}`} onClick={() => run(op)}>{label}</button>)}
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ minHeight: 220 }}>
              <p className="res-h">Resultado</p>
              {!result ? <div className="empty">Elige una operación o pídemela en el chat. Te muestro el resultado y el procedimiento.</div> : <ResultView result={result} />}
            </div>

            <div className="card chat">
              <p className="res-h">Asistente de álgebra lineal</p>
              <div className="msgs">{messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}</div>
              <div className="composer">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="Pide una operación…" />
                <button className="send" onClick={onSend}><Send size={17} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pasteFor && (
        <div className="modal" onClick={(e) => { if (e.target.className === "modal") setPasteFor(null); }}>
          <div className="card">
            <p className="res-h">Pegar matriz {pasteFor}</p>
            <p className="tag" style={{ margin: "0 0 8px" }}>Una fila por línea; números separados por espacios o comas.</p>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"1 2 3\n4 5 6\n7 8 9"} />
            <div className="row">
              <button className="op" onClick={() => setPasteFor(null)}>Cancelar</button>
              <button className="op prim" onClick={commitPaste}>Cargar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixCard({ name, M, resize, setCell, onPaste }) {
  return (
    <div className="card">
      <div className="mh">
        <h3>Matriz <b>{name}</b></h3>
        <div className="dim">
          <span>filas</span>
          <button className="step" onClick={() => resize(name, -1, 0)}><Minus size={13} /></button>
          <span>{M.length}</span>
          <button className="step" onClick={() => resize(name, 1, 0)}><Plus size={13} /></button>
          <span style={{ margin: "0 4px", opacity: .4 }}><X size={11} /></span>
          <span>col</span>
          <button className="step" onClick={() => resize(name, 0, -1)}><Minus size={13} /></button>
          <span>{M[0].length}</span>
          <button className="step" onClick={() => resize(name, 0, 1)}><Plus size={13} /></button>
          <button className="paste" style={{ marginLeft: 8 }} onClick={onPaste}><ClipboardPaste size={12} /> Pegar</button>
        </div>
      </div>
      <div className="matrix-wrap">
        <div className="brk" />
        <div className="cells" style={{ gridTemplateColumns: `repeat(${M[0].length}, auto)` }}>
          {M.map((row, i) => row.map((v, j) => (
            <input key={`${i}-${j}`} value={v} onChange={(e) => setCell(name, i, j, e.target.value)} />
          )))}
        </div>
        <div className="brk r" />
      </div>
    </div>
  );
}

function ResultView({ result }) {
  return (
    <div>
      <div className="res-title">{result.title}</div>
      {result.kind === "scalar" && <div className="scalar">{result.value}</div>}
      {result.kind === "matrix" && (
        <div className="resmtx">
          <div className="brk" />
          <div className="cells" style={{ gridTemplateColumns: `repeat(${result.data[0].length}, auto)` }}>
            {result.data.map((row, i) => row.map((v, j) => <span key={`${i}-${j}`}>{v}</span>))}
          </div>
          <div className="brk r" />
        </div>
      )}
      {result.kind === "eigen" && result.pairs.map((p, i) => (
        <div key={i} className="eig">
          <div className="lam">λ{i + 1} = {fmtN(p.value)}</div>
          {p.vector && <div className="vec">v{i + 1} = [{p.vector.map((x) => fmtN(x)).join(", ")}]</div>}
        </div>
      ))}
      {result.steps && <ol className="steps">{result.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {result.method && <div className="method">{result.method}</div>}
    </div>
  );
}
