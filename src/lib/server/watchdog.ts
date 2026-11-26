import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { query } from './db';
// Best effort local-process watchdog, not a billing cap or a serverless scheduler.
const globalState = globalThis as unknown as {
  ayeshaWatchdogs?: Map<string, { socket: WebSocket; timer: ReturnType<typeof setTimeout> }>;
};
const sockets = (globalState.ayeshaWatchdogs ??= new Map());
export function watchSession(id: string, liveId: string, maxSeconds: number) {
  if (process.env.VERCEL || !process.env.OPENAI_API_KEY) return;
  const socket = new WebSocket(
    `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(liveId)}/attach`,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, handshakeTimeout: 8000 },
  );
  const close = () => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'session.close', event_id: randomUUID() }));
    setTimeout(() => socket.close(), 6000).unref();
  };
  const timer = setTimeout(close, maxSeconds * 1000);
  timer.unref();
  sockets.set(id, { socket, timer });
  socket.on('message', (raw) => {
    try {
      const e = JSON.parse(raw.toString());
      if (e.type === 'session.usage.updated' && typeof e.usage?.seconds === 'number')
        void query('update app_sessions set voice_seconds=greatest(voice_seconds,$2) where id=$1', [
          id,
          e.usage.seconds,
        ]).catch(() => {});
      if (e.type === 'session.closed') {
        void query(
          "update app_sessions set voice_seconds=greatest(voice_seconds,$2),finalized=true,ended_at=coalesce(ended_at,now()),fragments='[]'::jsonb,pending=null where id=$1",
          [id, e.usage?.seconds ?? 0],
        ).catch(() => {});
        clearTimeout(timer);
        socket.close();
        sockets.delete(id);
      }
    } catch {
      /* No payloads, transcripts or audio are logged. */
    }
  });
  socket.on('error', () => {
    clearTimeout(timer);
    sockets.delete(id);
  });
  socket.on('close', () => {
    clearTimeout(timer);
    sockets.delete(id);
  });
}
export function closeWatchdog(id: string) {
  const item = sockets.get(id);
  if (!item) return;
  clearTimeout(item.timer);
  if (item.socket.readyState === WebSocket.OPEN)
    item.socket.send(JSON.stringify({ type: 'session.close', event_id: randomUUID() }));
  setTimeout(() => {
    item.socket.close();
    sockets.delete(id);
  }, 6000).unref();
}
