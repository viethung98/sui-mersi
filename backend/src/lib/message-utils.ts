export function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return JSON.stringify(parts)
  return parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text ?? "")
    .join(" ")
}
