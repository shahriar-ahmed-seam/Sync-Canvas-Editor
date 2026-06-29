"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WS_URL } from "./env";
import {
  getPermissions,
  setDrawModeApi,
  grantUserApi,
  revokeUserApi,
  type DrawMode,
} from "./api";
import {
  getLocalUser,
  getOwnerToken,
  isOwner as isOwnerLocal,
  type LocalUser,
} from "./identity";
import { addElement, clearScene, readElements, removeElements, type Element } from "./scene";

export type ConnStatus = "connecting" | "connected" | "disconnected";

export interface Peer {
  clientId: number;
  user: LocalUser;
  cursor: { x: number; y: number } | null;
  drawing: boolean;
}

export interface UseBoard {
  doc: Y.Doc;
  status: ConnStatus;
  self: LocalUser;
  isOwner: boolean;
  elements: Element[];
  peers: Peer[];
  drawMode: DrawMode;
  allowedIds: Set<string>;
  canDraw: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setCursor: (point: { x: number; y: number } | null, drawing: boolean) => void;
  addEl: (el: Element) => void;
  removeEls: (ids: Set<string>) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  setDrawMode: (mode: DrawMode) => void;
  grant: (userId: string) => void;
  revoke: (userId: string) => void;
}

export function useBoard(boardId: string, self: LocalUser): UseBoard {
  // The Y.Doc is created once and reused for the component's lifetime.
  const docRef = useRef<Y.Doc>();
  if (!docRef.current) docRef.current = new Y.Doc();
  const doc = docRef.current;

  const providerRef = useRef<WebsocketProvider>();
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [elements, setElements] = useState<Element[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [drawMode, setDrawModeState] = useState<DrawMode>("everyone");
  const [allowedIds, setAllowedIds] = useState<Set<string>>(new Set());

  // Local-only undo/redo. Y.UndoManager tracks transactions whose origin is
  // local (null) — remote edits from other people are applied with the provider
  // as origin, so undo only ever reverts your own work.
  const undoRef = useRef<Y.UndoManager>();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const mgr = new Y.UndoManager(doc.getArray("elements"), { captureTimeout: 0 });
    undoRef.current = mgr;
    const sync = () => {
      setCanUndo(mgr.canUndo());
      setCanRedo(mgr.canRedo());
    };
    mgr.on("stack-item-added", sync);
    mgr.on("stack-item-popped", sync);
    sync();
    return () => {
      mgr.destroy();
      undoRef.current = undefined;
    };
  }, [doc]);

  const owner = useMemo(() => isOwnerLocal(boardId), [boardId]);
  const ownerToken = useMemo(() => getOwnerToken(boardId), [boardId]);

  useEffect(() => {
    const provider = new WebsocketProvider(`${WS_URL}/board`, boardId, doc, {
      connect: true,
      // Identity for server-side write enforcement: the owner token proves
      // ownership; uid is matched against per-user draw grants.
      params: { uid: self.id, token: ownerToken ?? "" },
    });
    providerRef.current = provider;

    provider.awareness.setLocalStateField("user", self);
    provider.awareness.setLocalStateField("cursor", null);
    provider.awareness.setLocalStateField("drawing", false);

    provider.on("status", (e: { status: ConnStatus }) => setStatus(e.status));

    // --- scene reactivity ---
    const elementsArr = doc.getArray("elements");
    const syncElements = () => setElements(readElements(doc));
    elementsArr.observeDeep(syncElements);

    // --- presence reactivity ---
    const syncPeers = () => {
      const states = provider.awareness.getStates();
      const list: Peer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const user = state.user as LocalUser | undefined;
        if (!user) return;
        list.push({
          clientId,
          user,
          cursor: (state.cursor as Peer["cursor"]) ?? null,
          drawing: Boolean(state.drawing),
        });
      });
      setPeers(list);
    };
    provider.awareness.on("change", syncPeers);

    syncElements();
    syncPeers();

    return () => {
      elementsArr.unobserveDeep(syncElements);
      provider.awareness.off("change", syncPeers);
      provider.destroy();
    };
  }, [boardId, doc, self, ownerToken]);

  // --- permissions: server-authoritative, fetched over REST and polled ---
  const refreshPerms = useCallback(async () => {
    try {
      const perms = await getPermissions(boardId);
      if (perms) {
        setDrawModeState(perms.drawMode);
        setAllowedIds(new Set(perms.allowed));
      }
    } catch {
      /* keep last known perms */
    }
  }, [boardId]);

  useEffect(() => {
    void refreshPerms();
    const t = setInterval(() => void refreshPerms(), 3000);
    return () => clearInterval(t);
  }, [refreshPerms]);

  const canDraw = owner || drawMode === "everyone" || allowedIds.has(self.id);

  const setCursor = useCallback(
    (point: { x: number; y: number } | null, drawing: boolean) => {
      const aw = providerRef.current?.awareness;
      if (!aw) return;
      aw.setLocalStateField("cursor", point);
      aw.setLocalStateField("drawing", drawing);
    },
    []
  );

  const addEl = useCallback((el: Element) => addElement(doc, el), [doc]);
  const removeEls = useCallback((ids: Set<string>) => removeElements(doc, ids), [doc]);
  const clear = useCallback(() => clearScene(doc), [doc]);
  const undo = useCallback(() => undoRef.current?.undo(), []);
  const redo = useCallback(() => undoRef.current?.redo(), []);

  // Owner-only mutations go through the REST API (authenticated by the owner
  // token). We optimistically refresh local perms right after.
  const setDrawMode = useCallback(
    async (mode: DrawMode) => {
      if (!ownerToken) return;
      try {
        const perms = await setDrawModeApi(boardId, ownerToken, mode);
        setDrawModeState(perms.drawMode);
        setAllowedIds(new Set(perms.allowed));
      } catch {
        /* ignore */
      }
    },
    [boardId, ownerToken]
  );
  const grant = useCallback(
    async (userId: string) => {
      if (!ownerToken) return;
      try {
        const perms = await grantUserApi(boardId, ownerToken, userId);
        setAllowedIds(new Set(perms.allowed));
      } catch {
        /* ignore */
      }
    },
    [boardId, ownerToken]
  );
  const revoke = useCallback(
    async (userId: string) => {
      if (!ownerToken) return;
      try {
        const perms = await revokeUserApi(boardId, ownerToken, userId);
        setAllowedIds(new Set(perms.allowed));
      } catch {
        /* ignore */
      }
    },
    [boardId, ownerToken]
  );

  return {
    doc,
    status,
    self,
    isOwner: owner,
    elements,
    peers,
    drawMode,
    allowedIds,
    canDraw,
    canUndo,
    canRedo,
    setCursor,
    addEl,
    removeEls,
    clear,
    undo,
    redo,
    setDrawMode,
    grant,
    revoke,
  };
}
