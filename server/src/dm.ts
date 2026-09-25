export interface DMReply {
  text: string;
  fromName: string;
}

export interface DMMessage {
  id: string;
  fromUserId: string;
  fromName: string;
  text: string;
  replyTo: DMReply | null;
  createdAt: number;
  expiresAt: number | null;
}

interface Conversation {
  messages: DMMessage[];
  lastSeenAt: Record<string, number>;
  expiresAfterMs: number | null;
}

const conversations = new Map<string, Conversation>();
const onlineUsers = new Map<string, string>(); // userId -> socketId

export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

export function getOrCreateConversation(key: string): Conversation {
  let convo = conversations.get(key);
  if (!convo) {
    convo = { messages: [], lastSeenAt: {}, expiresAfterMs: null };
    conversations.set(key, convo);
  }
  return convo;
}

/** Suresi gecmis ("Sure sonu" ayariyla silinen) mesajlari sohbetten temizler -
 * dm:open ve dm:send gibi her okuma/yazma noktasinda cagrilir. */
export function pruneExpired(convo: Conversation) {
  const now = Date.now();
  convo.messages = convo.messages.filter((m) => !m.expiresAt || m.expiresAt > now);
}

export function addMessage(convo: Conversation, message: DMMessage) {
  convo.messages.push(message);
  // Bellek sismesin diye sohbet basina makul bir gecmis siniri.
  if (convo.messages.length > 500) convo.messages.shift();
}

export function setExpiryMs(convo: Conversation, ms: number | null) {
  convo.expiresAfterMs = ms;
}

export function markSeen(convo: Conversation, userId: string) {
  convo.lastSeenAt[userId] = Date.now();
}

export function setOnline(userId: string, socketId: string) {
  onlineUsers.set(userId, socketId);
}

export function removeOnlineBySocket(socketId: string) {
  for (const [userId, sid] of onlineUsers) {
    if (sid === socketId) onlineUsers.delete(userId);
  }
}

export function getSocketIdForUser(userId: string): string | undefined {
  return onlineUsers.get(userId);
}

let msgCounter = 0;
export function newMessageId(): string {
  msgCounter += 1;
  return `${Date.now()}-${msgCounter}`;
}
