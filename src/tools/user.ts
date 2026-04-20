import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest } from "../ynab-client.js";

export function registerUserTools(server: McpServer): void {
  server.registerTool(
    "get_user",
    {
      title: "Get YNAB User",
      description: "Returns the authenticated YNAB user information (user ID).",
      inputSchema: z.object({}),
    },
    async () => {
      const data = await ynabRequest<{ user: { id: string } }>("/user");
      return {
        content: [{ type: "text", text: JSON.stringify(data.user, null, 2) }],
      };
    },
  );
}
