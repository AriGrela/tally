import { toolDefinitions } from "@/lib/server/tools";

export function GET() {
  return Response.json({
    tools: toolDefinitions().map((t) => ({
      name: t.name,
      label: t.meta.label,
      description: t.description,
      category: t.meta.category,
      sideEffect: !!t.meta.sideEffect,
      inputSchema: t.inputSchema,
    })),
  });
}
