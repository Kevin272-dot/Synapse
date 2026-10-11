"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

/**
 * Listens for live knowledge-graph updates broadcast by the socket server
 * after quiescence-triggered extraction, and refreshes the server-rendered
 * graph. This is what makes the graph page update in real time.
 */
export default function GraphLive() {
  const router = useRouter();

  useEffect(() => {
    let socket: Socket | null = null;
    // Debounce refreshes: bursts of graph updates should not re-render 10×.
    let timer: ReturnType<typeof setTimeout> | null = null;

    socket = io({ path: "/api/socket", transports: ["websocket"] });
    socket.on("graph:update", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    });

    return () => {
      if (timer) clearTimeout(timer);
      socket?.disconnect();
    };
  }, [router]);

  return null;
}
