export { runCadGeneration } from "@/lib/cadGeneration";

export async function POST() {
  return Response.json(
    { error: "Use WebSocket agents (ws://127.0.0.1:8002 or :8003) for CAD generation." },
    { status: 410 }
  );
}
