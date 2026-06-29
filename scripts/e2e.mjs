// End-to-end check: REST create → two Yjs WS clients sync → persistence reload.
// Run with Redis + server up:  node scripts/e2e.mjs
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WebSocket } from "ws";

const API = "http://localhost:1234";
const WS = "ws://localhost:1234/board";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

function connect(boardId, doc, params = {}) {
  return new Promise((resolve) => {
    const provider = new WebsocketProvider(WS, boardId, doc, {
      connect: true,
      WebSocketPolyfill: WebSocket,
      // Critical for faithful testing: without this, multiple providers in the
      // SAME process sync directly via BroadcastChannel and never exercise the
      // server. Real browsers (different origins) don't share that channel.
      disableBc: true,
      params,
    });
    provider.on("status", (e) => {
      if (e.status === "connected") resolve(provider);
    });
  });
}

const waitFor = async (fn, ms = 4000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
};

async function main() {
  // 1) create a board over REST
  const res = await fetch(`${API}/api/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E", visibility: "public" }),
  });
  const board = await res.json();
  check("REST create returns id", typeof board.id === "string" && board.id.length === 12);
  check("REST create returns ownerToken", typeof board.ownerToken === "string" && board.ownerToken.length === 32);

  // 2) two independent clients join the same board
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const provA = await connect(board.id, docA);
  const provB = await connect(board.id, docB);
  check("client A connected", provA.wsconnected);
  check("client B connected", provB.wsconnected);

  // 3) A draws an element → B should receive it (CRDT sync)
  const elsA = docA.getArray("elements");
  const m = new Y.Map();
  docA.transact(() => {
    m.set("id", "el-1");
    m.set("type", "pen");
    m.set("points", [0, 0, 10, 10, 20, 5]);
    m.set("stroke", "#0B0C0E");
    m.set("strokeWidth", 4);
    elsA.push([m]);
  });
  const elsB = docB.getArray("elements");
  const synced = await waitFor(() => elsB.length === 1);
  check("element synced A → B", synced);
  check(
    "synced element content matches",
    synced && elsB.get(0).get("id") === "el-1" && elsB.get(0).get("type") === "pen"
  );

  // 4) awareness (named cursor) propagates
  provA.awareness.setLocalStateField("user", { id: "u1", name: "Ada", color: "#FF4D2E" });
  provA.awareness.setLocalStateField("cursor", { x: 12, y: 34 });
  const awSeen = await waitFor(() => {
    for (const [, st] of provB.awareness.getStates()) {
      if (st.user?.name === "Ada" && st.cursor?.x === 12) return true;
    }
    return false;
  });
  check("awareness cursor synced A → B", awSeen);

  // 5) persistence: disconnect everyone, let the room persist + close, then reload
  provA.destroy();
  provB.destroy();
  await sleep(1500); // room.release() persists snapshot on last disconnect

  const docC = new Y.Doc();
  const provC = await connect(board.id, docC);
  const reloaded = await waitFor(() => docC.getArray("elements").length === 1, 5000);
  check("element persisted + reloaded in fresh client", reloaded);
  provC.destroy();

  // 6) PERMISSION ENFORCEMENT (the security-critical part)
  await sleep(300);
  const pres = await fetch(`${API}/api/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E-private", visibility: "private" }),
  });
  const pboard = await pres.json();
  const perms0 = await (await fetch(`${API}/api/boards/${pboard.id}/permissions`)).json();
  check("private board starts owner-only", perms0.drawMode === "owner");

  const ownerUid = "owner-uid";
  const guestUid = "guest-uid";
  const ownerDoc = new Y.Doc();
  const guestDoc = new Y.Doc();
  const ownerProv = await connect(pboard.id, ownerDoc, {
    uid: ownerUid,
    token: pboard.ownerToken,
  });
  const guestProv = await connect(pboard.id, guestDoc, { uid: guestUid });

  // owner draws → guest (view-only) should still RECEIVE it
  ownerDoc.getArray("elements").push([new Y.Map([["id", "owner-el"], ["type", "pen"]])]);
  check("view-only guest receives owner's draw", await waitFor(() => guestDoc.getArray("elements").length === 1));

  // guest (not allowed) draws → owner must NOT receive it
  guestDoc.getArray("elements").push([new Y.Map([["id", "guest-blocked"], ["type", "pen"]])]);
  await sleep(800);
  const ownerIds = ownerDoc.getArray("elements").toArray().map((m) => m.get("id"));
  check(
    "unauthorized guest write is dropped server-side",
    !ownerIds.includes("guest-blocked")
  );

  // owner grants the guest → a freshly-connected client with that uid can draw.
  // (A real blocked user can't draw at all — the UI gates on canDraw — so we
  // simulate a clean client rather than one that diverged while blocked.)
  await fetch(`${API}/api/boards/${pboard.id}/permissions/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-owner-token": pboard.ownerToken },
    body: JSON.stringify({ uid: guestUid }),
  });
  await sleep(400); // let the room refresh its perms cache via Redis
  const guestDoc2 = new Y.Doc();
  const guestProv2 = await connect(pboard.id, guestDoc2, { uid: guestUid });
  await waitFor(() => guestDoc2.getArray("elements").length >= 1); // sync down first
  guestDoc2.getArray("elements").push([new Y.Map([["id", "guest-allowed"], ["type", "pen"]])]);
  const granted = await waitFor(() =>
    ownerDoc.getArray("elements").toArray().some((m) => m.get("id") === "guest-allowed")
  );
  check("guest write accepted after grant", granted);

  ownerProv.destroy();
  guestProv.destroy();
  guestProv2.destroy();

  console.log(`\n${failures === 0 ? "ALL PASS ✅" : failures + " FAILURE(S) ❌"}`);
  await sleep(200);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
