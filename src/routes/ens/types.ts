import { z } from "@hono/zod-openapi";

// Types for Cloudflare bindings
export interface CloudflareBindings {
  ENS_CONTRACT_ADDRESS: string;
  SHOUTOUT_KV: KVNamespace;
}

// Zod schemas
export const ENSResolveQuerySchema = z.object({
  name: z.string().min(1, "ENS name is required"),
}).openapi("ENSResolveQuery");

export const ENSReverseQuerySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
}).openapi("ENSReverseQuery");

export const ENSResponseSchema = z.object({
  address: z.string().optional(),
  name: z.string().optional(),
}).openapi("ENSResponse");

export const ErrorSchema = z.object({ 
  message: z.string() 
}).openapi("ErrorResponse");

// Data interfaces
export interface ENSRecord {
  name: string;
  address: string;
  resolver: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReverseENSRecord {
  address: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
