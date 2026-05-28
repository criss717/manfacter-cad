# Manfacter CAD

> Diseño CAD 3D con IA generativa. Le hablas, te modela.
> Basado en [text-to-cad](https://github.com/earthtojake/text-to-cad) pero llevado a experiencia completa de producto.

![Manfacter CAD](public/logo.png)

## Qué hace esto

Describes la pieza que necesitas fabricar (o pegas una foto) y la IA te genera geometría 3D sólida exportable a STEP, STL y GLB. El chat es conversacional: puedes seguir pidiendo cambios como si hablaras con un ingeniero. "Más grande", "agujero central de 8mm", "redondea las aristas". Todo en vivo en el navegador.

Y mientras la IA trabaja en piezas complejas, no te quedas mirando una barra de carga. Te ponemos un modal interactivo con noticias de Manfacter, enlaces a guías de fabricación y un mini juego de engranaje. Porque esperar no tiene que ser aburrido.

---

## Demo rápida

```
Usuario: "necesito un soporte en L de 80mm de largo, 60mm de alto, con base de 40mm de ancho, espesor 4mm y 2 agujeros avellanados en la base"
→ IA genera el CAD → aparece en el visor 3D con iluminación de estudio
→ Las cotas aparecen en la barra de Propiedades como sliders
→ Arrastras un slider y la pieza se regenera al instante
→ Si no te gusta, sigues chateando: "cambia los agujeros a 5mm"
→ Exportas STEP para SolidWorks o STL para tu laminador
→ Cambias de conversación en la barra lateral, vuelves cuando quieras

Usuario: "diseña un conjunto de engranajes planetarios"
→ La IA detecta que es complejo → se abre el modal "mientras esperas"
→ Ves noticias sobre Manfacter, enlaces a guías, y un engranaje interactivo que gira con el cursor
→ Cuando la IA termina, el modal se cierra y tu pieza aparece lista
```

---

## Lo que hace distinto a Manfacter CAD

### Modal interactivo mientras esperas

Cuando le pides algo complejo (engranajes, ensamblajes, barridos, hélices), la IA puede tardar varios intentos en dar con la geometría perfecta. En vez de una pantalla en blanco, aparece un modal con:

- **Noticias reales** de Manfacter en un slider (Premio EmprendeXXI en Cantabria, CaixaBank, El Diario Montañés)
- **Enlaces directos** a [Sobre Manfacter](https://manfacter.com/sobre-manfacter/) y [Guías de fabricación](https://manfacter.com/guias-de-fabricacion/)
- **Mini juego** de engranaje: mueves el cursor sobre un engranaje SVG y gira. Simple, adictivo, temático

Si quieres minimizarlo mientras tanto, se convierte en un indicador flotante. Cuando la IA termina, desaparece solo. No interrumpe tu flujo, te acompaña.

### Chat con reparación inteligente

El agente clasifica cada petición antes de generar código:
- **SIMPLE** (< 8 features, solo primitivas + agujeros + filetes): genera directo, sin leer referencias
- **COMPLEX** (engranajes, barridos, hélices, lofts, assemblies): carga documentación bajo demanda

Si el código falla, el agente recibe un hint en español clasificado por tipo de error (10 categorías). Se auto-corrige y reintenta. Límite de 13 intentos por pieza, después te avisa educadamente.

### Parámetros que se actualizan solos

El panel de Propiedades extrae las variables del código Python generado (`base_length = 80.0`, `hole_diameter = 4.0`) y las expone como sliders. Cuando la IA modifica una cota desde el chat, los sliders se actualizan automáticamente. Si tú tocas un slider, se regenera la geometría al instante sin pasar por el chat.

### Memoria conversacional real

WebSocket con sesión persistente en backend. El agente mantiene todo el contexto en RAM. Si dices "añádele 2mm de filete", ya sabe qué pieza tienes, su código, sus dimensiones. No relee archivos del disco.

### Multimodal: pega una foto, obtén un CAD

Arrastras una imagen de una pieza real al chat (o Ctrl+V) y Gemini la analiza para generar el modelo. La imagen se codifica en base64 y se envía directamente al LLM.

---

## Comparativa: Manfacter CAD vs text-to-cad

| Característica | Manfacter CAD | text-to-cad |
|---|---|---|
| **Chat persistente** | Conversación viva con memoria completa | El agente lee/escribe archivos, sin contexto continuo |
| **Modal mientras esperas** | Noticias, guías y mini juego de engranaje durante generaciones complejas | No tiene |
| **Multimodal** | Imagen → CAD (Gemini nativo) | No tiene soporte de imágenes |
| **Visor 3D integrado** | React Three Fiber con iluminación estudio, cubo de vistas, auto-zoom | Viewer externo vía $render |
| **Parámetros interactivos** | Sliders que se auto-actualizan cuando la IA cambia cotas | No tiene |
| **Color y apariencia** | Cambia color del modelo y fondo en tiempo real | No tiene |
| **Exportación triple** | STEP + STL + GLB simultáneos, un clic | Scripts CLI separados |
| **Persistencia** | Conversaciones en localStorage, sidebar con historial, confirmación al cambiar de chat | Archivos en disco |
| **Repair loop** | 10 categorías de error con hints en español, hasta 13 reintentos | Reparación manual |
| **Validación geométrica** | Inspección post-generación (bbox, caras, aristas, sólidos) | CLI separado |
| **Confirmación al cambiar de chat** | Modal "¿Abandonar el chat?" si la IA está procesando | No tiene |
| **Snapshot visual** | Render PNG para validación visual | Vía $render skill |
| **Idioma** | Español nativo en toda la interfaz | Inglés |
| **Diseño** | Apple-style minimalista con animaciones framer-motion | — |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16, React 19, TypeScript)                │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │ ChatPanel│ │Inspector  │ │CadExplorer│ │ComplexModal│  │
│  │ (IA chat)│ │(sliders)  │ │(visor R3F)│ │(noticias + │  │
│  │          │ │           │ │           │ │ juego)     │  │
│  └────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬──────┘  │
│       │              │             │             │          │
│       │    Zustand Store (estado global + localStorage)    │
│       │              │             │             │          │
├───────┼──────────────┼─────────────┼─────────────┼──────────┤
│       ▼              ▼             ▼             ▼          │
│  Backend Python (FastAPI + WebSocket + Google ADK)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  agent/server.py (WS :8002) — Gemini ADK             │   │
│  │  main.py (HTTP :8000) — FastAPI REST                 │   │
│  │                                                      │   │
│  │  agent/tools.py                                      │   │
│  │  ├─ run_cad_code() → generator.py (límite 13 intentos)│  │
│  │  ├─ inspect_geometry() → inspect.py                  │   │
│  │  ├─ read_reference() → references/*.md               │   │
│  │  ├─ make_snapshot() → screenshot.py                  │   │
│  │  └─ list_outputs() → solo sesión actual              │   │
│  │                                                      │   │
│  │  cad_engine/generator.py                             │   │
│  │  ├─ build123d → STEP (XCAF, colores)                 │   │
│  │  ├─ OCP StlAPI → STL (binario)                       │   │
│  │  └─ BRepMesh + trimesh → GLB (visor)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack técnico

**Frontend**
- Next.js 16.2 (App Router, Turbopack)
- React 19 + TypeScript 5
- React Three Fiber + Drei (visor 3D)
- Zustand (estado global)
- Framer Motion (animaciones)
- Tailwind CSS 4 (Apple Design System con Comfortaa)
- next/font/google (Comfortaa)

**Backend**
- Python 3.11 + FastAPI + Uvicorn
- build123d 0.8+ (modelado CAD paramétrico)
- OpenCASCADE (kernel geométrico)
- Google ADK (agente Gemini 3.5 Flash)
- trimesh + Pillow (mallas y snapshots)
- websockets (comunicación en tiempo real)

---

## Instalación y uso

### Requisitos
- Node.js 20+ y pnpm
- Python 3.11+ con virtualenv
- API key de Gemini (`.env`)

### Setup

```bash
# 1. Clonar e instalar frontend
git clone https://github.com/tu-usuario/manfacter-cad
cd manfacter-cad
pnpm install

# 2. Backend
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt

# 3. Configurar .env
cp ../.env.local.example ../.env
# Añade tu GOOGLE_GENERATIVE_AI_API_KEY

# 4. Arrancar
# Terminal 1 — Agente Gemini
python -m agent.server

# Terminal 2 — Frontend (desde la raíz del proyecto)
pnpm dev
```

Abre `http://localhost:3000/cad` y empieza a diseñar.

### Variables de entorno (`.env`)

```
GOOGLE_GENERATIVE_AI_API_KEY=tu_clave_de_gemini
```

---

## Lo que se puede hacer ahora

- [x] Generar piezas 3D desde texto en español
- [x] Pegar/arrastrar fotos de piezas reales para modelarlas (Gemini)
- [x] Chatear con la IA para modificar la pieza incrementalmente
- [x] Ver la pieza en 3D con iluminación estudio y cubo de vistas
- [x] Ajustar cotas con sliders que se actualizan automáticamente
- [x] Modal interactivo mientras esperas (noticias, guías, mini juego)
- [x] Mini juego de engranaje interactivo con el cursor
- [x] Noticias reales de Manfacter en slider (Premio EmprendeXXI)
- [x] Cambiar color del modelo y fondo de escena
- [x] Exportar a STEP, STL y GLB
- [x] Guardar/recuperar conversaciones automáticamente
- [x] Confirmación al cambiar de chat si la IA está procesando
- [x] Inspección geométrica post-generación
- [x] Snapshot PNG para validación visual
- [x] Clasificación SIMPLE/COMPLEX con referencias progresivas
- [x] Repair loop con 10 categorías de error en español (hasta 13 intentos)
- [x] Interfaz Apple-style con Comfortaa
- [x] Marca Manfacter (#003496) en títulos y Studio

## Roadmap

- [ ] Más proveedores LLM (DeepSeek, GLM, Kimi, GPT-4o)
- [ ] Autenticación de usuarios
- [ ] Persistencia en PostgreSQL
- [ ] Slider de noticias desde API de Manfacter (dinámico)
- [ ] Exportación DXF para corte láser
- [ ] Snapshots enviadas al LLM para auto-validación multimodal
- [ ] Modo oscuro
- [ ] Undo/redo de modificaciones

---

## Licencia

MIT
