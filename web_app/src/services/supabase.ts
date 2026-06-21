import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — uses anon key, RLS-protected
export const supabase = createClient(url, anonKey);

// Server client — uses service role key for admin operations (server-side only)
export function createServerSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

// ── Matter record schema (mirrors on-chain Record struct) ─────────────────────
export type MatterRecord = {
  id?: number;
  cert_id: string;
  reference: string;
  sha256: string;
  walrus_blob: string;
  sealed_ms: number;
  sealer: string;
  status: number;
  client_identity: string | null;
  created_at?: string;
};

// Supabase table DDL (run in Supabase SQL editor once):
// create table matters (
//   id bigserial primary key,
//   cert_id text unique not null,
//   reference text not null,
//   sha256 text not null,
//   walrus_blob text not null,
//   sealed_ms bigint not null,
//   sealer text not null,
//   status int not null default 0,
//   client_identity text,
//   created_at timestamptz default now()
// );
// create index on matters (sealer);
// create index on matters (client_identity);
// create index on matters (status);

export async function upsertMatter(record: MatterRecord): Promise<void> {
  const { error } = await supabase
    .from("matters")
    .upsert(record, { onConflict: "cert_id" });
  if (error) throw error;
}

export async function getMattersByCertId(certId: string): Promise<MatterRecord | null> {
  const { data, error } = await supabase
    .from("matters")
    .select("*")
    .eq("cert_id", certId)
    .single();
  if (error) return null;
  return data;
}

export async function getMattersBySealer(
  sealer: string,
  status?: number,
): Promise<MatterRecord[]> {
  let query = supabase.from("matters").select("*").eq("sealer", sealer);
  if (status !== undefined) query = query.eq("status", status);
  const { data, error } = await query.order("sealed_ms", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getMattersByClientIdentity(
  clientIdentity: string,
): Promise<MatterRecord[]> {
  const { data, error } = await supabase
    .from("matters")
    .select("*")
    .eq("client_identity", clientIdentity)
    .order("sealed_ms", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function updateMatterStatus(certId: string, status: number): Promise<void> {
  const { error } = await supabase
    .from("matters")
    .update({ status })
    .eq("cert_id", certId);
  if (error) throw error;
}
