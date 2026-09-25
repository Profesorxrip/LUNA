export type FriendStatus = "none" | "outgoing" | "incoming" | "friends" | "blocked";

interface PendingRequest {
  from: string;
  to: string;
  createdAt: number;
}

const userNames = new Map<string, string>(); // userId -> son bilinen goruntulenen isim
const friendships = new Set<string>(); // "a::b" (sirali) - ikisi de arkadas
const pendingRequests = new Map<string, PendingRequest>(); // "from->to"
const blocks = new Map<string, Set<string>>(); // userId -> engelledigi userId'ler

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function requestKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function setUserName(userId: string, name: string) {
  userNames.set(userId, name);
}

export function getUserName(userId: string): string {
  return userNames.get(userId) || "Kullanici";
}

function isBlockedEither(a: string, b: string): boolean {
  return !!blocks.get(a)?.has(b) || !!blocks.get(b)?.has(a);
}

export function getFriendStatus(a: string, b: string): FriendStatus {
  if (isBlockedEither(a, b)) return "blocked";
  if (friendships.has(pairKey(a, b))) return "friends";
  if (pendingRequests.has(requestKey(a, b))) return "outgoing";
  if (pendingRequests.has(requestKey(b, a))) return "incoming";
  return "none";
}

export function sendRequest(from: string, to: string): boolean {
  if (from === to || isBlockedEither(from, to)) return false;
  if (friendships.has(pairKey(from, to))) return false;
  if (pendingRequests.has(requestKey(from, to)) || pendingRequests.has(requestKey(to, from))) return false;
  pendingRequests.set(requestKey(from, to), { from, to, createdAt: Date.now() });
  return true;
}

export function cancelRequest(from: string, to: string) {
  pendingRequests.delete(requestKey(from, to));
}

export function respondRequest(from: string, to: string, accept: boolean) {
  const key = requestKey(from, to);
  if (!pendingRequests.has(key)) return;
  pendingRequests.delete(key);
  if (accept) friendships.add(pairKey(from, to));
}

export function removeFriend(a: string, b: string) {
  friendships.delete(pairKey(a, b));
}

export function blockUser(userId: string, targetId: string) {
  if (!blocks.has(userId)) blocks.set(userId, new Set());
  blocks.get(userId)!.add(targetId);
  friendships.delete(pairKey(userId, targetId));
  pendingRequests.delete(requestKey(userId, targetId));
  pendingRequests.delete(requestKey(targetId, userId));
}

export function unblockUser(userId: string, targetId: string) {
  blocks.get(userId)?.delete(targetId);
}

export function listFriends(userId: string): { userId: string; name: string }[] {
  const result: { userId: string; name: string }[] = [];
  for (const key of friendships) {
    const [a, b] = key.split("::");
    if (a === userId) result.push({ userId: b, name: getUserName(b) });
    else if (b === userId) result.push({ userId: a, name: getUserName(a) });
  }
  return result;
}

export function listIncoming(userId: string): { userId: string; name: string; createdAt: number }[] {
  const result: { userId: string; name: string; createdAt: number }[] = [];
  for (const req of pendingRequests.values()) {
    if (req.to === userId) result.push({ userId: req.from, name: getUserName(req.from), createdAt: req.createdAt });
  }
  return result;
}

export function listOutgoing(userId: string): { userId: string; name: string; createdAt: number }[] {
  const result: { userId: string; name: string; createdAt: number }[] = [];
  for (const req of pendingRequests.values()) {
    if (req.from === userId) result.push({ userId: req.to, name: getUserName(req.to), createdAt: req.createdAt });
  }
  return result;
}

export function listBlocked(userId: string): { userId: string; name: string }[] {
  const ids = blocks.get(userId);
  if (!ids) return [];
  return [...ids].map((id) => ({ userId: id, name: getUserName(id) }));
}
