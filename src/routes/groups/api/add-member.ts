import { createRoute, z } from "@hono/zod-openapi";
import { ethers } from "ethers";
import { CloudflareBindings, AddMemberSchema, AddMemberResponseSchema, ErrorSchema, MemberData } from "../types";
import { getGroupData, saveGroupData, saveMemberData, verifyGroupSignature } from "../utils";

export const addMemberRoute = createRoute({
  method: "post",
  path: "/groups/{groupId}/add-member",
  request: {
    params: z.object({
      groupId: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid group ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: AddMemberSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Member added successfully",
      content: {
        "application/json": {
          schema: AddMemberResponseSchema,
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

export const addMemberHandler = async (c: any) => {
  try {
    const { groupId } = c.req.valid("param");
    const { commitment, signature } = c.req.valid("json");
    const env = c.env as CloudflareBindings;

    // Get group data from KV
    const groupData = await getGroupData(env.SHOUTOUT_KV, groupId);
    if (!groupData) {
      return c.json({ message: "Group not found" }, 404);
    }

    // Verify the signature is from the group owner
    const message = `Add member to group ${groupId}`;
    if (!verifyGroupSignature(message, signature, groupData.owner)) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    // TODO@groups/ Implement actual smart contract interaction
    // const contract = new ethers.Contract(env.GROUP_CONTRACT_ADDRESS, GROUP_REGISTRY_ABI, provider);
    // const tx = await contract.addMember(groupId, commitment, newRoot, proof);

    // Generate new root and member index
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes(commitment + Date.now().toString()));
    const index = groupData.members.length;

    // Store member data in KV
    const memberData: MemberData = {
      commitment,
      index,
      addedAt: new Date().toISOString()
    };

    await saveMemberData(env.SHOUTOUT_KV, groupId, index, memberData);

    // Update group data
    groupData.members.push(commitment);
    groupData.zkRoot = newRoot;
    await saveGroupData(env.SHOUTOUT_KV, groupId, groupData);

    return c.json({ newRoot, index });
  } catch (error) {
    console.error("Add member error:", error);
    return c.json({ message: "Failed to add member" }, 500);
  }
};
