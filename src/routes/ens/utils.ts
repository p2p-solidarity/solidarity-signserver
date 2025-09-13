import { ENSRecord, ReverseENSRecord } from "./types";

// Get ENS record from KV
export async function getENSRecord(kv: KVNamespace, name: string): Promise<ENSRecord | null> {
  try {
    const data = await kv.get(`ens:${name.toLowerCase()}`, "json");
    return data as ENSRecord | null;
  } catch (error) {
    console.error("Error getting ENS record:", error);
    return null;
  }
}

// Save ENS record to KV
export async function saveENSRecord(kv: KVNamespace, name: string, record: ENSRecord): Promise<void> {
  try {
    await kv.put(`ens:${name.toLowerCase()}`, JSON.stringify(record));
  } catch (error) {
    console.error("Error saving ENS record:", error);
    throw error;
  }
}

// Get reverse ENS record from KV
export async function getReverseENSRecord(kv: KVNamespace, address: string): Promise<ReverseENSRecord | null> {
  try {
    const data = await kv.get(`ens:reverse:${address.toLowerCase()}`, "json");
    return data as ReverseENSRecord | null;
  } catch (error) {
    console.error("Error getting reverse ENS record:", error);
    return null;
  }
}

// Save reverse ENS record to KV
export async function saveReverseENSRecord(kv: KVNamespace, address: string, record: ReverseENSRecord): Promise<void> {
  try {
    await kv.put(`ens:reverse:${address.toLowerCase()}`, JSON.stringify(record));
  } catch (error) {
    console.error("Error saving reverse ENS record:", error);
    throw error;
  }
}
