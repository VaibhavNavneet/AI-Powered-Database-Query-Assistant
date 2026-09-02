import { getSchema } from "@/lib/database";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { tables } = await getSchema();
    return Response.json({ tables });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read database schema.";
    return Response.json({ error: message }, { status: 500 });
  }
}
