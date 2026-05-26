"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SHELL_URL = "ws://127.0.0.1:8001";

interface ShellMessage {
  type: string;
  cmd?: string;
  id?: string;
  ok?: boolean;
  error?: string;
  traceback?: string;
  session_id?: string;
  message?: string;
  model_id?: string;
  step?: string;
  stl?: string;
  glb?: string;
  facts?: Record<string, unknown>;
  files?: Array<{ name: string; size: number; suffix: string }>;
}

type ShellState = "disconnected" | "connecting" | "ready" | "generating" | "inspecting";

export function useCadShell() {
  const [state, setState] = useState<ShellState>("disconnected");
  const [lastResult, setLastResult] = useState<ShellMessage | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Array<(msg: ShellMessage) => void>>([]);
  const msgIdRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-50), msg]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    addLog("[SHELL] Connecting...");

    const ws = new WebSocket(SHELL_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog("[SHELL] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: ShellMessage = JSON.parse(event.data);
        addLog(`[SHELL] ← ${msg.type}: ${msg.ok ? "OK" : msg.error || ""}`);

        if (msg.type === "ready") {
          setSessionId(msg.session_id || null);
          setState("ready");
        } else if (msg.type === "step_result") {
          setLastResult(msg);
          setState("ready");
        } else if (msg.type === "inspect_result") {
          setLastResult(msg);
          setState("ready");
        }

        if (pendingRef.current.length > 0) {
          const resolve = pendingRef.current.shift()!;
          resolve(msg);
        }
      } catch {
        addLog("[SHELL] Invalid message received");
      }
    };

    ws.onclose = () => {
      addLog("[SHELL] Disconnected");
      setState("disconnected");
      wsRef.current = null;
    };

    ws.onerror = () => {
      addLog("[SHELL] Connection error");
      setState("disconnected");
    };
  }, [addLog]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback(
    (cmd: string, payload: Record<string, unknown> = {}): Promise<ShellMessage> => {
      return new Promise((resolve) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          resolve({ type: "error", error: "WebSocket not connected" });
          return;
        }

        const id = String(++msgIdRef.current);
        const msg = JSON.stringify({ id, cmd, ...payload });
        addLog(`[SHELL] → ${cmd}`);
        ws.send(msg);

        if (cmd === "step") setState("generating");
        else if (cmd === "inspect") setState("inspecting");

        pendingRef.current.push(resolve);

        setTimeout(() => {
          const idx = pendingRef.current.indexOf(resolve);
          if (idx >= 0) {
            pendingRef.current.splice(idx, 1);
            resolve({ type: "error", error: "Timeout" });
            setState("ready");
          }
        }, 120000);
      });
    },
    [addLog]
  );

  const generate = useCallback(
    async (code: string) => {
      if (!code) return null;
      const result = await send("step", { code });
      return result;
    },
    [send]
  );

  const inspect = useCallback(
    async (path: string) => {
      const result = await send("inspect", { path });
      return result;
    },
    [send]
  );

  return {
    connect,
    disconnect,
    state,
    sessionId,
    lastResult,
    log,
    generate,
    inspect,
    send,
  };
}
