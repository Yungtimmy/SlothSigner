import { decodeFunctionData, parseAbi, parseAbiItem, toFunctionSelector, type Abi, type Hex, isHex } from "viem";

export const BUILTIN_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function increaseAllowance(address spender, uint256 addedValue)",
  "function setApprovalForAll(address operator, bool approved)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export interface TxInput { to?: string; data: Hex; value: bigint }
export interface Decoded {
  input: TxInput;
  selector: Hex;
  source: "builtin" | "4byte" | "none" | "empty";
  functionName?: string;
  signature?: string;
  args: { name: string; type: string; value: unknown }[];
  /** true when the 4byte lookup itself failed (network error / bad response) */
  lookupFailed?: boolean;
}

export function parseInput(raw: string): TxInput {
  const s = raw.trim();
  if (!s) throw new Error("Paste something first.");
  if (s.startsWith("{")) {
    let o: any;
    try { o = JSON.parse(s); } catch { throw new Error("That looks like JSON but it does not parse."); }
    const tx = o.params?.[0] ?? o;
    const data = (tx.data ?? tx.input ?? "0x").toLowerCase();
    if (!isHex(data)) throw new Error("The data field is not hex.");
    let value = 0n;
    if (tx.value !== undefined && tx.value !== null && tx.value !== "") value = BigInt(tx.value);
    return { to: tx.to, data: data as Hex, value };
  }
  const hex = (s.startsWith("0x") ? s : `0x${s}`).replace(/\s+/g, "").toLowerCase();
  if (!isHex(hex)) throw new Error("That is not hex calldata or a JSON transaction.");
  return { data: hex as Hex, value: 0n };
}

function decodeWith(abi: Abi, data: Hex) {
  const r = decodeFunctionData({ abi, data });
  const sel = data.slice(0, 10);
  const item = (abi as any[]).find(
    (i) => i.type === "function" && i.name === r.functionName && toFunctionSelector(i) === sel,
  );
  const inputs: { name?: string; type: string }[] = item?.inputs ?? [];
  const args = (r.args ?? []).map((v, i) => ({ name: inputs[i]?.name || `arg${i}`, type: inputs[i]?.type ?? "?", value: v }));
  const signature = `${r.functionName}(${inputs.map((x) => x.type).join(",")})`;
  return { functionName: r.functionName, signature, args };
}

export function decodeBuiltin(input: TxInput): Decoded {
  const selector = (input.data.length >= 10 ? input.data.slice(0, 10) : "0x") as Hex;
  if (input.data === "0x" || input.data.length < 10) return { input, selector, source: "empty", args: [] };
  try {
    return { input, selector, source: "builtin", ...decodeWith(BUILTIN_ABI, input.data) };
  } catch {
    return { input, selector, source: "none", args: [] };
  }
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<any> }>;

export async function lookup4byte(selector: Hex, fetcher: Fetcher = fetch): Promise<string[]> {
  const res = await fetcher(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}&ordering=created_at`);
  if (!res.ok) throw new Error(`4byte lookup failed (${(res as any).status ?? "bad response"})`);
  const j = await res.json();
  return (j.results ?? []).map((r: any) => r.text_signature as string);
}

export async function decode(input: TxInput, fetcher?: Fetcher): Promise<Decoded> {
  const d = decodeBuiltin(input);
  if (d.source !== "none") return d;
  let sigs: string[] = [];
  try { sigs = await lookup4byte(d.selector, fetcher); } catch { return { ...d, lookupFailed: true }; }
  for (const sig of sigs) {
    try {
      const abi = [parseAbiItem(`function ${sig}`)] as Abi;
      return { ...d, source: "4byte", ...decodeWith(abi, input.data) };
    } catch { /* try next */ }
  }
  return d;
}
