import { createRoute } from "@hono/zod-openapi";
import { CloudflareBindings, ENSReverseQuerySchema, ENSResponseSchema, ErrorSchema, ReverseENSRecord } from "../types";
import { getReverseENSRecord, saveReverseENSRecord } from "../utils";

export const ensReverseRoute = createRoute({
  method: "get",
  path: "/ens/reverse",
  request: {
    query: ENSReverseQuerySchema,
  },
  responses: {
    200: {
      description: "Reverse ENS lookup successful",
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
      description: "No ENS name found for address",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const ensReverseHandler = async (c: any) => {
  try {
    const { address } = c.req.valid("query");
    const env = c.env as CloudflareBindings;

    // First check KV storage
      let reverseRecord = await getReverseENSRecord(env.SHOUTOUT_KV, address);
    
    if (!reverseRecord) {
      // TODO@ens/ Implement actual ENS reverse lookup
      // const node = await reverseRegistrar.node(address);
      // const name = await ensContract.name(node);
      // if (!name || name === "") {
      //   return c.json({ message: "No ENS name found for this address" }, 404);
      // }

      // For demo purposes, create a mock reverse ENS record
      const mockName = `user${Math.random().toString(36).substring(2, 8)}.eth`;
      reverseRecord = {
        address,
        name: mockName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store in KV for future lookups
      await saveReverseENSRecord(env.SHOUTOUT_KV, address, reverseRecord);
    }

    return c.json({ name: reverseRecord.name, address: reverseRecord.address });
  } catch (error) {
    console.error("ENS reverse error:", error);
    return c.json({ message: "Failed to reverse lookup ENS name" }, 500);
  }
};
