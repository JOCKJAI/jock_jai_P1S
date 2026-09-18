import { getBindings, type QueueItem } from '@/lib/cloud-db';

type SupabaseQueueRow = QueueItem & {
  edit_password_salt?: string;
  edit_password_hash?: string;
};

const textEncoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) || []);
}

async function derivePasswordHash(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function makePasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToHex(salt), hash: await derivePasswordHash(password, salt) };
}

async function passwordMatches(password: string, saltHex: string, expectedHash: string) {
  const salt = hexToBytes(saltHex);
  if (salt.length !== 16 || expectedHash.length !== 64) return false;
  const actualHash = await derivePasswordHash(password, salt);
  let difference = actualHash.length ^ expectedHash.length;
  for (let index = 0; index < Math.min(actualHash.length, expectedHash.length); index += 1) {
    difference |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

function config() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getBindings();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  // Legacy JWT service-role keys use Authorization. Supabase's newer
  // `sb_secret_` keys authenticate through the apikey header only.
  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return {
    baseUrl: SUPABASE_URL.replace(/\/$/, ''),
    headers,
  };
}

async function request(path: string, init?: RequestInit) {
  const settings = config();
  if (!settings) throw new Error('SUPABASE_NOT_CONFIGURED');
  const response = await fetch(`${settings.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...settings.headers, ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`SUPABASE_${response.status}`);
  return response;
}

export function hasSupabaseQueue() {
  return Boolean(config());
}

export async function listSupabaseQueue(): Promise<QueueItem[]> {
  const response = await request('queue_entries?select=id,name,color&order=created_at.asc,id.asc&limit=100');
  return response.json() as Promise<QueueItem[]>;
}

export async function addSupabaseQueueItem(name: string, password: string) {
  const { salt, hash } = await makePasswordRecord(password);
  await request('queue_entries', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      name,
      color: '#abf23e',
      edit_password_salt: salt,
      edit_password_hash: hash,
    }),
  });
  return listSupabaseQueue();
}

async function getProtectedRow(id: string) {
  const response = await request(
    `queue_entries?id=eq.${encodeURIComponent(id)}&select=id,edit_password_salt,edit_password_hash&limit=1`,
  );
  const rows = await response.json() as SupabaseQueueRow[];
  return rows[0] || null;
}

async function authorize(id: string, password: string) {
  const row = await getProtectedRow(id);
  if (!row?.edit_password_salt || !row.edit_password_hash) return false;
  return passwordMatches(password, row.edit_password_salt, row.edit_password_hash);
}

export async function updateSupabaseQueueItem(id: string, name: string, password: string) {
  if (!(await authorize(id, password))) throw new Error('INVALID_PASSWORD');
  await request(`queue_entries?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
  });
  return listSupabaseQueue();
}

export async function deleteSupabaseQueueItem(id: string, password: string) {
  if (!(await authorize(id, password))) throw new Error('INVALID_PASSWORD');
  await request(`queue_entries?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return listSupabaseQueue();
}
