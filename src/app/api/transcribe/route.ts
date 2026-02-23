import { auth } from "@/lib/auth";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  if (!GROQ_API_KEY) {
    return Response.json({ error: "Groq API key not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const audioFile = formData.get("file") as File | null;
  if (!audioFile) return Response.json({ error: "No audio file provided" }, { status: 400 });

  // Forward to Groq Whisper API
  const groqForm = new FormData();
  groqForm.append("file", audioFile);
  groqForm.append("model", "whisper-large-v3-turbo");
  groqForm.append("response_format", "json");

  const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: groqForm,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    return Response.json({ error: `Transcription failed: ${text}` }, { status: 502 });
  }

  const result = await res.json();
  return Response.json({ text: result.text || "" });
}
