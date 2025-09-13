import { z } from "@hono/zod-openapi";

// Types for Cloudflare bindings
export interface CloudflareBindings {
  GROUP_CONTRACT_ADDRESS: string;
  SHOUTOUT_KV: KVNamespace;
}

// Zod schemas
export const GroupCreateSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  ensName: z.string().optional(),
  ensSignature: z.string().optional(),
}).openapi("GroupCreateRequest");

export const GroupCreateResponseSchema = z.object({
  groupId: z.string(),
  zkRoot: z.string(),
}).openapi("GroupCreateResponse");

export const AddMemberSchema = z.object({
  commitment: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid commitment format"),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature format"),
}).openapi("AddMemberRequest");

export const AddMemberResponseSchema = z.object({
  newRoot: z.string(),
  index: z.number().int(),
}).openapi("AddMemberResponse");

export const RevokeMemberSchema = z.object({
  memberIndex: z.number().int().min(0, "Member index must be non-negative"),
  nullifier: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid nullifier format"),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature format"),
}).openapi("RevokeMemberRequest");

export const RevokeMemberResponseSchema = z.object({
  newRoot: z.string(),
  revokedAt: z.string(),
}).openapi("RevokeMemberResponse");

export const GroupRootResponseSchema = z.object({
  zkRoot: z.string(),
  blockNumber: z.number().int(),
}).openapi("GroupRootResponse");

export const ErrorSchema = z.object({ 
  message: z.string() 
}).openapi("ErrorResponse");

// Data interfaces
export interface GroupData {
  name: string;
  ensName?: string;
  owner: string;
  zkRoot: string;
  createdAt: string;
  members: string[];
  revokedMembers: string[];
}

export interface MemberData {
  commitment: string;
  index: number;
  addedAt: string;
}
