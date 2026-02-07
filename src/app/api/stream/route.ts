export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET() {
  let heartbeat: NodeJS.Timeout | undefined;
  let refreshTick: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "hello", ts: Date.now() });
      heartbeat = setInterval(() => send({ type: "heartbeat", ts: Date.now() }), 15000);
      refreshTick = setInterval(() => send({ type: "refresh", ts: Date.now() }), 60000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (refreshTick) clearInterval(refreshTick);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
