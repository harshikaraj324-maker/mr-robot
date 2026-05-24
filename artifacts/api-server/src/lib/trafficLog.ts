export type TrafficEntry = {
  id: number;
  ts: string;
  method: string;
  path: string;
  ip: string;
  body: unknown;
  status: number;
  responseSnippet: string;
  ms: number;
};

const MAX = 200;
let seq = 0;
export const trafficLog: TrafficEntry[] = [];

/* SSE subscribers — one per open dashboard tab */
type Subscriber = (entry: TrafficEntry) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function logEntry(e: Omit<TrafficEntry, "id">): void {
  const entry: TrafficEntry = { id: ++seq, ...e };
  trafficLog.unshift(entry);
  if (trafficLog.length > MAX) trafficLog.length = MAX;
  /* push to every open dashboard connection */
  subscribers.forEach(fn => fn(entry));
}
