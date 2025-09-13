import { createRoute } from "@hono/zod-openapi";
import { ethers } from "ethers";
import { CloudflareBindings, GroupCreateSchema, GroupCreateResponseSchema, ErrorSchema, GroupData } from "../types";
import { saveGroupData } from "../utils";

export const groupCreateRoute = createRoute({
  method: "post",
  path: "/groups/create",
  request: {
    body: {
      content: {
        "application/json": {
          schema: GroupCreateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Group created successfully",
      content: {
        "application/json": {
          schema: GroupCreateResponseSchema,
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
  },
});

export const groupCreateHandler = async (c: any) => {
  try {
    const { name, ensName, ensSignature } = c.req.valid("json");
    const env = c.env as CloudflareBindings;

    // Generate group ID and initial zk root
    const groupId = ethers.Wallet.createRandom().address;
    const zkRoot = ethers.keccak256(ethers.toUtf8Bytes(name + Date.now().toString()));

    // TODO@groups/ Implement actual smart contract interaction
    // const contract = new ethers.Contract(env.GROUP_CONTRACT_ADDRESS, GROUP_REGISTRY_ABI, provider);
    // const tx = await contract.createGroup(name, ensName || "", ensSignature || "0x");

    // Store group data in KV
    const groupData: GroupData = {
      name,
      ensName,
      owner: groupId, // For now, use groupId as owner
      zkRoot,
      createdAt: new Date().toISOString(),
      members: [],
      revokedMembers: []
    };

      await saveGroupData(env.SHOUTOUT_KV, groupId, groupData);

    return c.json({ groupId, zkRoot });
  } catch (error) {
    console.error("Group creation error:", error);
    return c.json({ message: "Failed to create group" }, 500);
  }
};
