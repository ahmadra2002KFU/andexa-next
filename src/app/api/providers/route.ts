import { getAvailableProviders } from "@/lib/ai/providers";

export async function GET() {
  const providers = await getAvailableProviders();
  return Response.json(providers);
}
