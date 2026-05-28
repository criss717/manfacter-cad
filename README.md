# Manfacter CAD

> MVP de diseño CAD 3D asistido por IA — agents, chat, visor, parámetros, exportación.  
> Inspirado en [text-to-cad](https://github.com/earthtojake/text-to-cad) pero llevado a producto completo.

![Manfacter CAD](public/logo.png)

## Qué hace esto

Escribes en español lo que quieres diseñar (o pegas una foto), y la IA te genera una pieza 3D real con geometría sólida, exportable a STEP, STL y GLB para fabricación. Puedes seguir chateando para modificarla: "hazla más grande", "ponle un agujero central", "redondea las esquinas". Todo en vivo, en el navegador.

---

## Demo rápida

```
Usuario: "Diseña un soporte en L de 80x60mm con base de 4mm, pared de 60mm y 2 agujeros avellanados en la base"
→ IA genera código build123d → STEP/STL/GLB aparecen en el visor 3D
→ Sliders muestran las cotas detectadas, puedes arrastrar para cambiar medidas
→ Exportas a STEP para SolidWorks o STL para laminador
```

---

## Comparativa: Manfacter CAD vs text-to-cad

| Característica | Manfacter CAD | text-to-cad |
|---|---|---|
| **Chat persistente** | Conversación viva: el LLM recuerda todo y modifica la pieza incrementalmente | El agente lee/escribe archivos, sin contexto conversacional continuo |
| **Multimodal** | Pega una foto de una pieza real y la IA la modela | No tiene soporte de imágenes |
| **5 proveedores LLM** | DeepSeek V4 Pro, GLM 5.1, Kimi K2.6, Gemini 3.5 Flash, GPT-4o | Depende del agente host (Claude, Codex) |
| **Visor 3D integrado** | React Three Fiber con iluminación estudio, cubo de vistas, auto-zoom | Viewer externo vía $render skill |
| **Parámetros interactivos** | Sliders en vivo que detectan cotas del código y regeneran la geometría | No tiene |
| **Color y apariencia** | Cambia color del modelo y fondo de escena en tiempo real | No tiene |
| **Exportación triple** | STEP + STL + GLB simultáneos con un solo clic | Scripts CLI separados por formato |
| **Persistencia automática** | Conversaciones guardadas en localStorage, sidebar con historial | Archivos en disco |
| **Repair loop inteligente** | 10 categorías de error con hints en español para auto-corrección del agente | Error → reparación manual |
| **Validación geométrica** | Inspección automática post-generación (bbox, caras, aristas, sólidos) | Inspección vía CLI script |
| **Agentes duales** | Google ADK (Gemini nativo) + OpenAI-compatible (DeepSeek/GLM/Kimi) | Un solo agente |
| **Referencias progresivas** | El agente decide si leer documentación según complejidad de la pieza (SIMPLE vs COMPLEX) | Carga de referencias manual |
| **Idioma** | Español nativo en toda la interfaz y respuestas del agente | Inglés |
| **Snapshot visual** | Renderizado PNG del modelo para validación visual | Vía $render skill |
| **Interfaz Apple-style** | Diseño minimalista con animaciones framer-motion, cubo de vistas CSS 3D | — |

---

## Lo que supera a text-to-cad (detalle técnico)

### 1. Agentes con memoria conversacional real

Text-to-cad delega en el agente host (Claude Code, Codex) que lee/escribe archivos. Si quieres modificar una pieza, el agente tiene que releer el archivo `.py` del disco.

Manfacter CAD usa **WebSocket con sesión persistente**: el backend Python mantiene el historial completo de la conversación en RAM. Cuando dices _"añádele 2mm de filete en las aristas superiores"_, el LLM ya sabe qué pieza tienes, qué código la generó y cuáles son sus dimensiones. No relee nada.

### 2. Clasificación SIMPLE vs COMPLEX

El prompt del agente clasifica cada petición antes de generar código:

- **SIMPLE** (< 8 features, solo Box/Cylinder/Sphere + holes + fillets): genera directo sin leer referencias → ahorra tokens
- **COMPLEX** (engranajes, barridos, hélices, loft, assemblies): carga `build123d-modeling.md` bajo demanda → precisión sin desperdicio

Text-to-cad carga referencias manualmente por trigger, pero no tiene esta clasificación automática de complejidad.

### 3. Repair loop con hints en español

Cuando el código falla, el agente recibe un hint clasificado:

```
ERROR: edges() y faces() son METODOS (con parentesis), no atributos.
       Usa shape.edges() no shape.edges.
```

Hay 10 categorías de error mapeadas a hints específicos en español. El agente puede auto-corregirse en el mismo turno.

### 4. Parámetros detectados y regeneración

El InspectorPanel parsea el código Python generado, extrae las variables numéricas (`base_length = 80.0`, `hole_diameter = 4.0`), y las expone como sliders. Arrastras un slider → se reemplaza el valor en el código → se regenera la geometría → el visor se actualiza. No necesitas tocar código.

### 5. Multimodal: pega una foto, obtén un CAD

Arrastras una imagen de una pieza real al chat (o Ctrl+V). El backend la codifica en base64 y se la envía al LLM con capacidades de visión (Gemini, DeepSeek). La IA analiza la forma y genera el código build123d. Text-to-cad no tiene esta capacidad.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Next.js 16, React 19, TypeScript)        │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────┐   │
│  │ ChatPanel│ │Inspector  │ │ CadExplorer (R3F) │   │
│  │ (IA chat)│ │(sliders)  │ │ (visor 3D + cube) │   │
│  └────┬─────┘ └─────┬─────┘ └────────┬─────────┘   │
│       │              │               │              │
│       │  Zustand Store (estado global + localStorage)│
│       │              │               │              │
├───────┼──────────────┼───────────────┼──────────────┤
│       ▼              ▼               ▼              │
│  Backend Python (FastAPI + WebSocket + ADK)         │
│  ┌──────────────────────────────────────────────┐   │
│  │  agent/server.py (WS :8002) — Gemini ADK     │   │
│  │  agent/openai_server.py (WS :8003) — DeepSeek│   │
│  │  main.py (HTTP :8000) — FastAPI REST         │   │
│  │                                              │   │
│  │  agent/tools.py                              │   │
│  │  ├─ run_cad_code() → generator.py            │   │
│  │  ├─ inspect_geometry() → inspect.py          │   │
│  │  ├─ read_reference() → references/*.md       │   │
│  │  └─ make_snapshot() → screenshot.py          │   │
│  │                                              │   │
│  │  cad_engine/generator.py                     │   │
│  │  ├─ build123d → STEP (XCAF, colores)         │   │
│  │  ├─ OCP StlAPI → STL (binario)               │   │
│  │  └─ BRepMesh + trimesh → GLB (visor)        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Flujo de una petición

1. Usuario escribe en el chat → `useCadChat` envía por WebSocket al agente (:8002 o :8003)
2. El agente (LLM) recibe el prompt + herramientas disponibles
3. Decide si leer referencias (`read_reference`)
4. Genera código Python build123d y llama a `run_cad_code(code)`
5. `generator.py` compila el código, ejecuta `gen_step()`, exporta STEP/STL/GLB
6. El agente recibe URLs + geometría facts + inspecciona con `inspect_geometry`
7. El frontend recibe las URLs vía WebSocket → `CadExplorer` carga el GLB en el visor 3D
8. `InspectorPanel` extrae parámetros del código y muestra sliders
9. `autoSave.ts` persiste todo en localStorage

---

## Stack técnico

**Frontend**
- Next.js 16.2 (App Router, Turbopack)
- React 19 + TypeScript 5
- React Three Fiber + Drei (visor 3D)
- Zustand (estado global)
- Framer Motion (animaciones)
- Tailwind CSS 4 (Apple Design System)
- Drizzle ORM + PostgreSQL (persistencia opcional)

**Backend**
- Python 3.11 + FastAPI + Uvicorn
- build123d 0.8+ (modelado CAD paramétrico)
- OpenCASCADE (kernel geométrico)
- Google ADK (agentes Gemini)
- OpenAI SDK (DeepSeek, GLM, Kimi via OpenCode)
- trimesh + Pillow (mallas y snapshots)

---

## Instalación y uso

### Requisitos
- Node.js 20+ y pnpm
- Python 3.11+ con virtualenv
- Claves API (`.env`)

### Setup

```bash
# 1. Frontend
cd manfacter-cad
pnpm install
cp .env.example .env  # editar con tus API keys

# 2. Backend (usa el venv existente en text-to-cad/venv)
cd ../text-to-cad
venv\Scripts\activate  # Windows
pip install -r ../manfacter-cad/backend/requirements.txt

# 3. Arrancar servidores
# Terminal 1 — FastAPI (archivos estáticos y API generate)
python manfacter-cad/backend/main.py

# Terminal 2 — Agente Gemini
python manfacter-cad/backend/agent/server.py

# Terminal 3 — Agente OpenAI-compatible (DeepSeek/GLM/Kimi)
python manfacter-cad/backend/agent/openai_server.py

# Terminal 4 — Frontend
cd manfacter-cad
pnpm dev
```

Abre `http://localhost:3000/cad` y empieza a diseñar.

### Variables de entorno (`.env`)

```
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENCODE_API_KEY=...
OPENAI_API_KEY=...
```

El selector de proveedor en el chat te permite cambiar entre DeepSeek, GLM, Kimi, Gemini y GPT-4o en caliente.

---

## Lo que se puede hacer ahora

- [x] Generar piezas 3D desde texto en español
- [x] Pegar/arrastrar fotos de piezas reales para modelarlas
- [x] Chatear con la IA para modificar la pieza incrementalmente
- [x] Ver la pieza en 3D con iluminación estudio y cubo de vistas
- [x] Ajustar cotas con sliders (regeneración automática)
- [x] Cambiar color del modelo y fondo de escena
- [x] Exportar a STEP (SolidWorks, Fusion), STL (impresión 3D) y GLB
- [x] Cambiar de proveedor LLM en caliente
- [x] Guardar/recuperar conversaciones automáticamente
- [x] Inspección geométrica post-generación
- [x] Snapshot PNG para validación visual
- [x] Clasificación automática SIMPLE/COMPLEX con referencias progresivas
- [x] Repair loop con hints de error en español

## Roadmap

- [ ] Autenticación de usuarios (login ya esbozado)
- [ ] Persistencia en PostgreSQL (esquema Drizzle ya creado)
- [ ] Snapshots visuales enviadas al LLM para auto-validación multimodal
- [ ] Exportación DXF para corte láser
- [ ] Ensamblajes multi-parte
- [ ] Animación de parámetros
- [ ] Renderizado server-side de snapshots para SEO
- [ ] Modo oscuro
- [ ] Undo/redo de modificaciones

---

## Licencia

MIT
