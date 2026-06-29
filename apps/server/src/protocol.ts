import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { WebSocket } from "ws";

/** Top-level message tags on the WebSocket wire (matches y-websocket). */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

export function send(ws: WebSocket, data: Uint8Array): void {
  // 1 === OPEN
  if (ws.readyState !== 1) return;
  ws.send(data, (err) => {
    if (err) ws.close();
  });
}

/** Build the initial sync-step-1 message advertising our state vector. */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/** Wrap a raw Y.Doc update as a sync "update" message. */
export function encodeDocUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** Encode an awareness update for the given clients as a wire message. */
export function encodeAwarenessMessage(
  awareness: Awareness,
  clients: number[]
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clients)
  );
  return encoding.toUint8Array(encoder);
}
