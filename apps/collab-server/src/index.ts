import { Server } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { jwtVerify } from 'jose';
import { createSecretKey, randomUUID } from 'node:crypto';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';

type RoomState = {
  participants: Map<string, { userId: string; mode: 'readonly' | 'readwrite' }>;
  dirty: boolean;
  debounce?: NodeJS.Timeout;
  lastSavedAt: number;
};

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({ openOnClick: false, autolink: true }),
  Mention.configure({
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
  }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
];

const roomStates = new Map<string, RoomState>();

const COLLAB_PORT = Number(process.env.COLLAB_PORT ?? 8080);
const CORE_API_URL = process.env.CORE_API_URL ?? 'http://core-api:3001';
const COLLAB_JWT_SECRET = process.env.COLLAB_JWT_SECRET ?? '';
const COLLAB_SERVICE_TOKEN = process.env.COLLAB_SERVICE_TOKEN ?? '';
const COLLAB_DEV_MODE = process.env.COLLAB_DEV_MODE === 'true';

if (!COLLAB_JWT_SECRET && !COLLAB_DEV_MODE) {
  throw new Error('COLLAB_JWT_SECRET is required when COLLAB_DEV_MODE=false');
}
if (!COLLAB_SERVICE_TOKEN) {
  throw new Error('COLLAB_SERVICE_TOKEN is required');
}

function correlationId() {
  return randomUUID();
}

function logInfo(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      level: 'info',
      source: 'collab-server',
      event,
      ...payload,
    }),
  );
}

function logError(event: string, payload: Record<string, unknown>) {
  console.error(
    JSON.stringify({
      level: 'error',
      source: 'collab-server',
      event,
      ...payload,
    }),
  );
}

function parseTaskIdFromRoom(roomId: string) {
  const match = roomId.match(/^task:(.+):description$/);
  if (!match?.[1]) throw new Error('Invalid room id');
  return match[1];
}

function stateForRoom(roomId: string) {
  let state = roomStates.get(roomId);
  if (!state) {
    state = { participants: new Map(), dirty: false, lastSavedAt: 0 };
    roomStates.set(roomId, state);
  }
  return state;
}

function extractPlainTextFromDoc(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map((child) => extractPlainTextFromDoc(child)).join(' ');
  if (typeof node === 'object') {
    const value = node as Record<string, unknown>;
    const text = typeof value.text === 'string' ? value.text : '';
    const nested = extractPlainTextFromDoc(value.content);
    return [text, nested].filter(Boolean).join(' ').trim();
  }
  return '';
}

async function saveSnapshot(documentName: string, reason: 'idle' | 'interval' | 'disconnect', ydoc: any) {
  const taskId = parseTaskIdFromRoom(documentName);
  const cid = correlationId();
  const state = stateForRoom(documentName);

  const json = TiptapTransformer.fromYdoc(ydoc, 'default') as Record<string, unknown>;
  const text = extractPlainTextFromDoc(json);
  const participants = [...state.participants.values()];

  const body = {
    roomId: documentName,
    descriptionDoc: json,
    descriptionText: text,
    participants,
    reason,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${CORE_API_URL}/tasks/${taskId}/description/snapshot`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-collab-service-token': COLLAB_SERVICE_TOKEN,
        'x-correlation-id': cid,
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (res?.ok) {
      state.dirty = false;
      state.lastSavedAt = Date.now();
      logInfo('snapshot.saved', {
        correlationId: cid,
        roomId: documentName,
        taskId,
        reason,
        participants: participants.length,
        attempt,
      });
      return;
    }

    logError('snapshot.save_failed', {
      correlationId: cid,
      roomId: documentName,
      taskId,
      reason,
      attempt,
      statusCode: res?.status ?? null,
    });

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
}

const server = Server.configure({
  port: COLLAB_PORT,
  timeout: 30000,

  async onAuthenticate(data) {
    const cid = correlationId();
    if (COLLAB_DEV_MODE) {
      const roomId = data.documentName;
      logInfo('auth.dev_mode', { correlationId: cid, roomId, userId: String(data.token ?? 'dev-user') });
      return {
        userId: String(data.token ?? 'dev-user'),
        mode: 'readwrite',
        roomId,
      };
    }

    if (!data.token || typeof data.token !== 'string') {
      throw new Error('Missing token');
    }

    const { payload } = await jwtVerify(data.token, createSecretKey(Buffer.from(COLLAB_JWT_SECRET)), {
      issuer: 'atlaspm-core-api',
      audience: 'atlaspm-collab',
    });

    if (!payload.sub || !payload.roomId || !payload.mode) {
      throw new Error('Invalid collab token claims');
    }
    if (payload.roomId !== data.documentName) {
      throw new Error('Room mismatch');
    }

    const authPayload = {
      userId: String(payload.sub),
      mode: payload.mode === 'readonly' ? 'readonly' : 'readwrite',
      roomId: String(payload.roomId),
      taskId: String(payload.taskId ?? ''),
      projectId: String(payload.projectId ?? ''),
    };
    logInfo('auth.success', { correlationId: cid, ...authPayload });
    return authPayload;
  },

  async onLoadDocument(data) {
    const taskId = parseTaskIdFromRoom(data.documentName);
    const res = await fetch(`${CORE_API_URL}/internal/tasks/${taskId}/description`, {
      headers: { 'x-collab-service-token': COLLAB_SERVICE_TOKEN, 'x-correlation-id': correlationId() },
    }).catch(() => null);

    if (!res?.ok) {
      return TiptapTransformer.toYdoc({ type: 'doc', content: [{ type: 'paragraph' }] }, 'default', extensions);
    }

    const json = (await res.json()) as { descriptionDoc?: Record<string, unknown> | null };
    const doc = json.descriptionDoc ?? { type: 'doc', content: [{ type: 'paragraph' }] };
    return TiptapTransformer.toYdoc(doc, 'default', extensions);
  },

  async onConnect(data) {
    const state = stateForRoom(data.documentName);
    const session = data.context as { userId?: string; mode?: 'readonly' | 'readwrite' };
    if (session?.userId) {
      state.participants.set(data.socketId, {
        userId: session.userId,
        mode: session.mode ?? 'readwrite',
      });
      logInfo('presence.join', {
        correlationId: correlationId(),
        roomId: data.documentName,
        socketId: data.socketId,
        userId: session.userId,
        mode: session.mode ?? 'readwrite',
        participants: state.participants.size,
      });
    }
  },

  async onDisconnect(data) {
    const state = stateForRoom(data.documentName);
    const participant = state.participants.get(data.socketId);
    state.participants.delete(data.socketId);
    logInfo('presence.leave', {
      correlationId: correlationId(),
      roomId: data.documentName,
      socketId: data.socketId,
      userId: participant?.userId ?? 'unknown',
      participants: state.participants.size,
    });
    if (state.dirty) {
      await saveSnapshot(data.documentName, 'disconnect', data.document);
    }
  },

  async onChange(data) {
    const state = stateForRoom(data.documentName);
    const session = data.context as { mode?: 'readonly' | 'readwrite' };
    if (session?.mode === 'readonly') {
      logError('readonly.write_blocked', {
        correlationId: correlationId(),
        roomId: data.documentName,
        socketId: data.socketId,
      });
      throw new Error('Readonly client cannot edit');
    }

    state.dirty = true;
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => {
      void saveSnapshot(data.documentName, 'idle', data.document);
    }, 3000);
  },

});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, state] of roomStates.entries()) {
    if (!state.dirty) continue;
    if (now - state.lastSavedAt < 30_000) continue;
    const instance = server.documents.get(roomId);
    if (!instance) continue;
    void saveSnapshot(roomId, 'interval', instance as any);
  }
}, 5000);

server.enableMessageLogging();
server.listen();
console.log(`[collab-server] listening on :${COLLAB_PORT}`);
