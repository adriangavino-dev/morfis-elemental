import { useState } from "react";
import { Image as ImageIcon, Grid3x3, Box } from "lucide-react";
import Imagenes from "./modules/Imagenes.jsx";
import Calculadora from "./modules/Calculadora.jsx";
import Visualizador3D from "./modules/Visualizador3D.jsx";

/*
  Morfis Elemental — cáscara con pestañas.
  Renderiza UN módulo por vez (montaje condicional): así los estilos de cada
  módulo no chocan entre sí y el visor 3D libera su contexto WebGL al salir.
  Nota: cambiar de pestaña reinicia el estado interno del módulo.
*/

const TABS = [
  ["img", "Imágenes", ImageIcon],
  ["calc", "Calculadora", Grid3x3],
  ["3d", "3D", Box],
];

export default function App() {
  const [tab, setTab] = useState("img");
  return (
    <div className="shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        html, body { margin:0; background:#0b1322; }
        .shell { font-family:'Inter',system-ui,sans-serif; }
        .shell-bar { position:sticky; top:0; z-index:50; display:flex; align-items:center; gap:20px;
          padding:12px 22px; background:rgba(11,19,34,.82); backdrop-filter:blur(8px);
          border-bottom:1px solid #22304d; }
        .shell-logo { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:18px; color:#e8eef9; letter-spacing:-.02em; }
        .shell-logo b { color:#f5a524; }
        .shell-tabs { display:flex; gap:6px; }
        .shell-tabs button { display:inline-flex; align-items:center; gap:7px; font-family:'Inter',sans-serif;
          font-size:13.5px; font-weight:600; color:#8aa0c4; background:transparent; border:1px solid transparent;
          border-radius:10px; padding:8px 14px; cursor:pointer; transition:.15s; }
        .shell-tabs button:hover { color:#e8eef9; background:#131f33; }
        .shell-tabs button.on { color:#1a1102; background:#f5a524; }
      `}</style>

      <div className="shell-bar">
        <div className="shell-logo">Morfis <b>Elemental</b></div>
        <div className="shell-tabs">
          {TABS.map(([id, label, Ic]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <Ic size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "img" && <Imagenes />}
      {tab === "calc" && <Calculadora />}
      {tab === "3d" && <Visualizador3D />}
    </div>
  );
}
