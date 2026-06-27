import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

/*
  VISUALIZADOR 3D — módulo de Morfis Elemental
  ============================================
  Ingresas una matriz 3×3 (o eliges una transformación) y un cubo unitario se
  convierte en paralelepípedo en tiempo real. Se ven los vectores base î/ĵ/k̂
  (las columnas de la matriz) y el determinante como factor de volumen.

  - La matriz 3×3 se aplica como Matrix4 (parte lineal, traslación 0) al grupo
    transformado; el cubo y los vectores base son hijos, así que se transforman
    solos al cambiar la matriz.
  - Controles de órbita propios (mouse) para no depender de OrbitControls, así
    funciona igual en la vista previa y en el deploy con `npm install three`.
*/

const O = "#f5a524", C = "#38bdf8", K = "#34d399"; // x / y / z
const fmt = (x) => { const r = Math.round(x * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; };
const rad = (d) => (d * Math.PI) / 180;
const ID = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const det3 = (M) =>
  fmt(M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]));

const presets = {
  "Rotar X 45°": (() => { const c = Math.cos(rad(45)), s = Math.sin(rad(45)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; })(),
  "Rotar Y 45°": (() => { const c = Math.cos(rad(45)), s = Math.sin(rad(45)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; })(),
  "Rotar Z 45°": (() => { const c = Math.cos(rad(45)), s = Math.sin(rad(45)); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; })(),
  "Escalar 1.5": [[1.5, 0, 0], [0, 1.5, 0], [0, 0, 1.5]],
  "Reflejar (plano XY)": [[1, 0, 0], [0, 1, 0], [0, 0, -1]],
  "Cizalla": [[1, 0.6, 0], [0, 1, 0], [0, 0, 1]],
  "Identidad": ID,
};

export default function App() {
  const [M, setM] = useState(presets["Rotar Y 45°"]);
  const mountRef = useRef(null);
  const refs = useRef({});

  // ---- init Three (una vez) ----
  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = 380;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a111e");
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(3, 5, 2); scene.add(dir);
    const grid = new THREE.GridHelper(6, 12, 0x2a3a57, 0x1a2740); scene.add(grid);

    const center = new THREE.Vector3(0.5, 0.5, 0.5);

    // cubo unitario [0,1]^3 (geometría trasladada para que un vértice quede en el origen)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);

    // --- grupo original (tenue, identidad) ---
    const orig = new THREE.Group();
    orig.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0x3a4d72 })));
    scene.add(orig);

    // --- grupo transformado ---
    const tg = new THREE.Group(); tg.matrixAutoUpdate = false;
    const solid = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x1b2c49, transparent: true, opacity: 0.35 }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0x9fb4d8 }));
    tg.add(solid); tg.add(wire);
    const axis = (color, to) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...to)]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    };
    tg.add(axis(O, [1, 0, 0])); tg.add(axis(C, [0, 1, 0])); tg.add(axis(K, [0, 0, 1]));
    const tip = (color, at) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), new THREE.MeshBasicMaterial({ color })); m.position.set(...at); return m; };
    tg.add(tip(O, [1, 0, 0])); tg.add(tip(C, [0, 1, 0])); tg.add(tip(K, [0, 0, 1]));
    scene.add(tg);

    // ---- órbita propia ----
    let R = 3.6, theta = 0.7, phi = 1.1, dragging = false, px = 0, py = 0;
    const place = () => { camera.position.set(center.x + R * Math.sin(phi) * Math.cos(theta), center.y + R * Math.cos(phi), center.z + R * Math.sin(phi) * Math.sin(theta)); camera.lookAt(center); };
    place();
    const el = renderer.domElement;
    const down = (e) => { dragging = true; px = e.clientX; py = e.clientY; };
    const move = (e) => { if (!dragging) return; theta -= (e.clientX - px) * 0.01; phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - (e.clientY - py) * 0.01)); px = e.clientX; py = e.clientY; place(); };
    const up = () => { dragging = false; };
    const wheel = (e) => { e.preventDefault(); R = Math.max(1.8, Math.min(9, R + e.deltaY * 0.002)); place(); };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); el.addEventListener("wheel", wheel, { passive: false });

    let raf;
    const loop = () => { if (!dragging) { theta += 0.0016; place(); } renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const onResize = () => { const w = mount.clientWidth; camera.aspect = w / H; camera.updateProjectionMatrix(); renderer.setSize(w, H); };
    window.addEventListener("resize", onResize);

    refs.current = { scene, tg, renderer, el };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", down); el.removeEventListener("wheel", wheel);
      renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // ---- aplicar la matriz cuando cambia ----
  useEffect(() => {
    const tg = refs.current.tg; if (!tg) return;
    const m4 = new THREE.Matrix4().set(
      M[0][0], M[0][1], M[0][2], 0,
      M[1][0], M[1][1], M[1][2], 0,
      M[2][0], M[2][1], M[2][2], 0,
      0, 0, 0, 1
    );
    tg.matrix.copy(m4); tg.matrixWorldNeedsUpdate = true;
  }, [M]);

  const det = det3(M);
  const setCell = (i, j, v) => { const n = M.map((r) => r.slice()); n[i][j] = v === "" || v === "-" ? v : Number(v); setM(n); };
  const num = M.map((r) => r.map((v) => (v === "" || v === "-" ? 0 : Number(v))));

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap');
        * { box-sizing:border-box; }
        html, body { margin:0; background:#0b1322; }
        .root { --bg:#0b1322; --panel:#0f1828; --panel2:#131f33; --border:#22304d; --text:#e8eef9; --muted:#8aa0c4; --ok:#34d399; --err:#f87171;
          min-height:100vh; background:radial-gradient(1100px 520px at 85% -15%, #2a1d0e 0%, transparent 55%), var(--bg);
          color:var(--text); font-family:'Inter',system-ui,sans-serif; padding:22px; }
        .wrap { max-width:1100px; margin:0 auto; }
        .logo { font-family:'Space Grotesk'; font-weight:700; font-size:23px; letter-spacing:-.02em; }
        .logo b { color:${O}; } .tag { color:var(--muted); font-size:13px; margin:2px 0 18px; }
        .grid { display:grid; grid-template-columns:1.25fr .75fr; gap:18px; }
        @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
        .card { background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:16px; }
        .view { padding:0; overflow:hidden; }
        .view .mount { width:100%; height:380px; cursor:grab; }
        .view .hint { font-size:11.5px; color:var(--muted); padding:8px 14px; border-top:1px solid var(--border); }
        .res-h { font-family:'Space Grotesk'; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 10px; }
        .cells { display:grid; grid-template-columns:repeat(3,auto); gap:6px; }
        .cells input { width:56px; height:36px; text-align:center; background:#0a111e; border:1px solid var(--border); color:var(--text); border-radius:8px; font-family:'JetBrains Mono'; font-size:14px; outline:none; }
        .cells input:focus { border-color:${O}; }
        .col0 { border-bottom:2px solid ${O}33; } .col1 { border-bottom:2px solid ${C}33; } .col2 { border-bottom:2px solid ${K}33; }
        .presets { display:flex; flex-wrap:wrap; gap:7px; margin-top:6px; }
        .pchip { font-size:12px; color:var(--muted); background:transparent; border:1px solid var(--border); padding:6px 10px; border-radius:999px; cursor:pointer; }
        .pchip:hover { color:var(--text); border-color:${O}; background:#1d2638; }
        .meta { font-family:'JetBrains Mono'; font-size:12.5px; color:var(--muted); line-height:1.9; margin-top:6px; }
        .meta b { color:var(--text); }
        .cx { color:${O}; } .cy { color:${C}; } .cz { color:${K}; }
        .pill { font-size:11px; padding:2px 7px; border-radius:6px; border:1px solid var(--border); }
        .legend { display:flex; gap:14px; font-size:12px; color:var(--muted); margin-top:10px; flex-wrap:wrap; }
        .dot { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; }
        .note { font-size:12.5px; color:#cbd7ef; line-height:1.55; margin-top:14px; padding-top:12px; border-top:1px solid #16223a; }
      `}</style>

      <div className="wrap">
        <div className="logo">Visualización <b>3D</b></div>
        <p className="tag">Una matriz 3×3 transforma el cubo unitario. Arrastra para orbitar; usa la rueda para acercar.</p>

        <div className="grid">
          <div className="card view">
            <div className="mount" ref={mountRef} />
            <div className="hint">Arrastra para rotar la cámara · rueda para zoom · el cubo tenue es el original</div>
          </div>

          <div>
            <div className="card">
              <p className="res-h">Matriz 3×3</p>
              <div className="cells">
                {M.map((row, i) => row.map((v, j) => (
                  <input key={`${i}-${j}`} className={`col${j}`} value={v} onChange={(e) => setCell(i, j, e.target.value)} />
                )))}
              </div>
              <div className="presets">
                {Object.keys(presets).map((k) => <button key={k} className="pchip" onClick={() => setM(presets[k])}>{k}</button>)}
              </div>
              <div className="legend">
                <span><span className="dot" style={{ background: O }} /> î · col 1 · eje x</span>
                <span><span className="dot" style={{ background: C }} /> ĵ · col 2 · eje y</span>
                <span><span className="dot" style={{ background: K }} /> k̂ · col 3 · eje z</span>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <p className="res-h">Lectura</p>
              <div className="meta">
                <div>î → (<span className="cx">{fmt(num[0][0])}, {fmt(num[1][0])}, {fmt(num[2][0])}</span>)</div>
                <div>ĵ → (<span className="cy">{fmt(num[0][1])}, {fmt(num[1][1])}, {fmt(num[2][1])}</span>)</div>
                <div>k̂ → (<span className="cz">{fmt(num[0][2])}, {fmt(num[1][2])}, {fmt(num[2][2])}</span>)</div>
                <div style={{ marginTop: 6 }}>det = <b>{det}</b> <span className="pill" style={{ color: det < 0 ? "var(--err)" : "var(--ok)", borderColor: det < 0 ? "#5b2330" : "#244b3c" }}>{det < 0 ? "invierte orientación" : det === 1 ? "volumen intacto" : "volumen ×" + Math.abs(det)}</span></div>
              </div>
              <div className="note">
                En 3D, las columnas de la matriz son dónde caen los vectores base î, ĵ y k̂. El cubo unitario se convierte en el paralelepípedo que ellos generan, y el <b>determinante</b> es el factor por el que cambia su <b>volumen</b> (negativo = se invierte la orientación, como un espejo).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
