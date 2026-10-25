import type { Decoded } from "./decode";
import type { Assessment } from "./rules";

export const GEMMA_MODEL = "gemma3-1b-it-q4f16_1-MLC";

const fmt = (v: unknown) => (typeof v === "bigint" ? v.toString() : String(v));

/** Shorten full 0x addresses to 4+4 hex, e.g. 0x3F9c…a1b2. */
export const shortenAddresses = (t: string) => t.replace(/0x([0-9a-fA-F]{4})[0-9a-fA-F]{32}([0-9a-fA-F]{4})\b/g, "0x$1…$2");

export function templateExplanation(d: Decoded, a: Assessment): string {
  const tail =
    a.verdict === "Danger" ? "Don't sign this unless you trust who is on the other end. If you do, approve only what you need."
    : a.verdict === "Check" ? "Worth a second look before you sign."
    : "Nothing here stands out as risky.";
  return shortenAddresses(`${a.flags.map((f) => f.text).join(" ")} ${tail}`.replace(/\s+/g, " ").trim());
}

export function buildPrompt(d: Decoded, a: Assessment): string {
  const fields = d.args.map((x) => `- ${x.name} (${x.type}): ${fmt(x.value)}`).join("\n") || "- (none)";
  return `You explain blockchain transactions to non-experts in 2 to 3 short, calm sentences. No exclamation marks. Do not give a verdict or contradict the facts; the verdict is fixed. The user already sees the Summary line as the headline: do not restate or paraphrase it. Start directly with the reason or the risk.

Verdict (fixed): ${a.verdict}
Summary: ${a.headline}
Contract: ${d.input.to ?? "unknown"}
Function: ${d.signature ?? d.selector}
Value sent: ${d.input.value} wei
Arguments:
${fields}
Rule findings:
${a.flags.map((f) => `- [${f.level}] ${f.text}`).join("\n") || "- none"}

Explain what signing this would do and what the user should watch for.`;
}

export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;

let enginePromise: Promise<any> | null = null;
export async function gemmaExplain(d: Decoded, a: Assessment, onProgress: (p: { progress: number; text: string }) => void): Promise<string> {
  if (!hasWebGPU()) throw new Error("WebGPU is not available in this browser.");
  if (!enginePromise) {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    enginePromise = CreateMLCEngine(GEMMA_MODEL, { initProgressCallback: (p: any) => onProgress({ progress: p.progress ?? 0, text: p.text ?? "" }) });
    enginePromise.catch(() => (enginePromise = null));
  }
  const engine = await enginePromise;
  const r = await engine.chat.completions.create({
    messages: [{ role: "user", content: buildPrompt(d, a) }],
    temperature: 0.2,
    max_tokens: 160,
  });
  return shortenAddresses((r.choices[0]?.message?.content ?? "").replace(/!/g, ".").trim());
}
