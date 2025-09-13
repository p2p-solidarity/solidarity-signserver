import { createRoute, z } from "@hono/zod-openapi";
import { ethers } from "ethers";
import { CloudflareBindings, RevokeMemberSchema, RevokeMemberResponseSchema, ErrorSchema } from "../types";
import { getGroupData, saveGroupData, verifyGroupSignature } from "../utils";

export const revokeMemberRoute = createRoute({
  method: "post",
  path: "/groups/{groupId}/revoke",
  request: {
    params: z.object({
      groupId: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid group ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: RevokeMemberSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Member revoked successfully",
      content: {
        "application/json": {
          schema: RevokeMemberResponseSchema,
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
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const revokeMemberHandler = async (c: any) => {
  try {
    const { groupId } = c.req.valid("param");
    const { memberIndex, nullifier, signature } = c.req.valid("json");
    const env = c.env as CloudflareBindings;

    // Get group data from KV
    const groupData = await getGroupData(env.SHOUTOUT_KV, groupId);
    if (!groupData) {
      return c.json({ message: "Group not found" }, 404);
    }

    // Verify the signature is from the group owner
    const message = `Revoke member ${memberIndex} from group ${groupId}`;
    if (!verifyGroupSignature(message, signature, groupData.owner)) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    // Check if member exists
    if (memberIndex >= groupData.members.length) {
      return c.json({ message: "Member not found" }, 404);
    }

    // TODO@groups/ Implement actual smart contract interaction
    // const contract = new ethers.Contract(env.GROUP_CONTRACT_ADDRESS, GROUP_REGISTRY_ABI, provider);
    // const tx = await contract.revokeMember(groupId, memberIndex, nullifier, newRoot);

    // Generate new root and revoke member
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes(nullifier + Date.now().toString()));
    const revokedAt = new Date().toISOString();

    // Update group data
    groupData.revokedMembers.push(nullifier);
    groupData.zkRoot = newRoot;
    await saveGroupData(env.SHOUTOUT_KV, groupId, groupData);

    return c.json({ newRoot, revokedAt });
  } catch (error) {
    console.error("Revoke member error:", error);
    return c.json({ message: "Failed to revoke member" }, 500);
  }
};
