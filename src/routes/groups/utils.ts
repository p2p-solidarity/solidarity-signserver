import { ethers } from "ethers";
import { GroupData, MemberData } from "./types";

// Verify signature for group operations
export function verifyGroupSignature(message: string, signature: string, expectedOwner: string): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedOwner.toLowerCase();
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// Get group data from KV
export async function getGroupData(kv: KVNamespace, groupId: string): Promise<GroupData | null> {
  try {
    const data = await kv.get(`groups:${groupId}`, "json");
    return data as GroupData | null;
  } catch (error) {
    console.error("Error getting group data:", error);
    return null;
  }
}

// Save group data to KV
export async function saveGroupData(kv: KVNamespace, groupId: string, data: GroupData): Promise<void> {
  try {
    await kv.put(`groups:${groupId}`, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving group data:", error);
    throw error;
  }
}

// Get member data from KV
export async function getMemberData(kv: KVNamespace, groupId: string, memberIndex: number): Promise<MemberData | null> {
  try {
    const data = await kv.get(`groups:${groupId}:member:${memberIndex}`, "json");
    return data as MemberData | null;
  } catch (error) {
    console.error("Error getting member data:", error);
    return null;
  }
}

// Save member data to KV
export async function saveMemberData(kv: KVNamespace, groupId: string, memberIndex: number, data: MemberData): Promise<void> {
  try {
    await kv.put(`groups:${groupId}:member:${memberIndex}`, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving member data:", error);
    throw error;
  }
}
