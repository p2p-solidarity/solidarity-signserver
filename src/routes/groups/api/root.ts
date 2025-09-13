import { createRoute, z } from "@hono/zod-openapi";
import { CloudflareBindings, GroupRootResponseSchema, ErrorSchema } from "../types";
import { getGroupData } from "../utils";

export const groupRootRoute = createRoute({
  method: "get",
  path: "/groups/{groupId}/root",
  request: {
    params: z.object({
      groupId: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid group ID"),
    }),
  },
  responses: {
    200: {
      description: "Group root retrieved successfully",
      content: {
        "application/json": {
          schema: GroupRootResponseSchema,
        },
      },
    },
    404: {
      description: "Group not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const groupRootHandler = async (c: any) => {
  try {
    const { groupId } = c.req.valid("param");
    const env = c.env as CloudflareBindings;

    // Get group data from KV
    const groupData = await getGroupData(env.SHOUTOUT_KV, groupId);
    if (!groupData) {
      return c.json({ message: "Group not found" }, 404);
    }

    // TODO@groups/ Implement actual smart contract interaction
    // const contract = new ethers.Contract(env.GROUP_CONTRACT_ADDRESS, GROUP_REGISTRY_ABI, provider);
    // const groupInfo = await contract.groups(groupId);
    // const blockNumber = await provider.getBlockNumber();

    // For now, use mock block number
    const blockNumber = Math.floor(Date.now() / 1000); // Mock block number

    return c.json({ zkRoot: groupData.zkRoot, blockNumber });
  } catch (error) {
    console.error("Group root retrieval error:", error);
    return c.json({ message: "Failed to retrieve group root" }, 500);
  }
};
