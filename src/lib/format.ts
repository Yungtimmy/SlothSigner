import { formatUnits, maxUint256 } from "viem";
import { tokenInfo } from "./known";

const MAX160 = 2n ** 160n - 1n;
const LIMIT = 2n ** 128n;
const AMOUNT_ARGS = new Set(["amount", "value", "addedValue", "wad"]);

export interface Formatted { text: string; raw?: string }

/** Format a decoded argument for the Details list. */
export function formatArg(name: string, v: unknown, token?: string): Formatted {
  if (typeof v !== "bigint") return { text: String(v) };
  const raw = v.toString();
  if (v === MAX160) return { text: "Unlimited (max uint160)", raw };
  if (v >= LIMIT) return { text: v === maxUint256 ? "Unlimited (max uint256)" : "Unlimited (≥ 2^128)", raw };
  const t = AMOUNT_ARGS.has(name) ? tokenInfo(token) : undefined;
  if (t) return { text: `${Number(formatUnits(v, t.decimals)).toLocaleString("en-US", { maximumFractionDigits: t.decimals })} ${t.symbol}`, raw };
  return { text: raw };
}

const FLAG_NAMES: Record<string, string> = {
  unlimited: "maximum allowance", "unknown-spender": "unknown spender", "approval-for-all": "approve all",
  permit: "gasless permit", value: "sends ETH", "4byte": "guessed function", "lookup-failed": "lookup failed", "unknown-selector": "unknown function",
};
export const flagName = (code: string) => FLAG_NAMES[code] ?? code.replace(/-/g, " ");
