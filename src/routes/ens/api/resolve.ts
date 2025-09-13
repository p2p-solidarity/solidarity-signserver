import { createRoute } from "@hono/zod-openapi";
import { ethers } from "ethers";
import { CloudflareBindings, ENSResolveQuerySchema, ENSResponseSchema, ErrorSchema, ENSRecord } from "../types";
import { getENSRecord, saveENSRecord } from "../utils";

export const ensResolveRoute = createRoute({
  method: "get",
  path: "/ens/resolve",
  request: {
    query: ENSResolveQuerySchema,
  },
  responses: {
    200: {
      description: "ENS resolution successful",
      content: {
        "application/json": {
          schema: ENSResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "ENS name not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const ensResolveHandler = async (c: any) => {
  try {
    const { name } = c.req.valid("query");
    const env = c.env as CloudflareBindings;

    // First check KV storage
      let ensRecord = await getENSRecord(env.SHOUTOUT_KV, name);
    
    if (!ensRecord) {
      // TODO@ens/ Implement actual ENS contract interaction
      // const namehash = ethers.namehash(name);
      // const resolverAddress = await ensContract.resolver(namehash);
      // if (resolverAddress === ethers.ZeroAddress) {
      //   return c.json({ message: "No resolver found for this ENS name" }, 404);
      // }
      // const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, provider);
      // const address = await resolver.addr(namehash);
      // if (address === ethers.ZeroAddress) {
      //   return c.json({ message: "No address found for this ENS name" }, 404);
      // }

      // For demo purposes, create a mock ENS record
      const mockAddress = ethers.Wallet.createRandom().address;
      ensRecord = {
        name,
        address: mockAddress,
        resolver: ethers.Wallet.createRandom().address,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store in KV for future lookups
      await saveENSRecord(env.SHOUTOUT_KV, name, ensRecord);
    }

    return c.json({ address: ensRecord.address, name: ensRecord.name });
  } catch (error) {
    console.error("ENS resolve error:", error);
    return c.json({ message: "Failed to resolve ENS name" }, 500);
  }
};
