import { formatUnits, maxUint256 } from "viem";
import type { Decoded } from "./decode";
import { short, spenderName, tokenInfo } from "./known";

export type Verdict = "Safe" | "Check" | "Danger";
export interface Flag { level: Verdict; code: string; text: string }
export interface Assessment { verdict: Verdict; headline: string; flags: Flag[] }

const UNLIMITED = 2n ** 128n; // anything this big is effectively unlimited
const MAX160 = 2n ** 160n - 1n;
const rank: Record<Verdict, number> = { Safe: 0, Check: 1, Danger: 2 };

const arg = (d: Decoded, n: string) => d.args.find((a) => a.name === n)?.value;

function amountText(token: string | undefined, amt: bigint): string {
  const t = tokenInfo(token);
  return t ? `${formatUnits(amt, t.decimals)} ${t.symbol}` : `${amt} units`;
}
const tokenLabel = (token?: string) => tokenInfo(token)?.symbol ?? (token ? `the token at ${short(token)}` : "this token");
const who = (a: string) => spenderName(a) ?? short(a);

export function assess(d: Decoded): Assessment {
  const flags: Flag[] = [];
  const add = (level: Verdict, code: string, text: string) => flags.push({ level, code, text });
  const to = d.input.to;
  let headline = "";

  if (d.input.value > 0n) add("Check", "value", `This sends ${formatUnits(d.input.value, 18)} ETH along with the call.`);

  if (d.source === "empty") {
    headline = d.input.value > 0n
      ? `You're sending ${formatUnits(d.input.value, 18)} ETH${to ? ` to ${short(to)}` : ""}.`
      : "There is no calldata here, so nothing gets called.";
  } else if (d.source === "none" && d.lookupFailed) {
    add("Check", "lookup-failed", "Couldn't look up this function");
    headline = `You're calling an unrecognised function ${d.selector}${d.input.to ? ` on ${short(d.input.to)}` : ""}.`;
  } else if (d.source === "none") {
    add("Danger", "unknown-selector", `The function ${d.selector} is not in the built-in list or in 4byte.directory, so nobody can say what it does.`);
    headline = `You're calling an unknown function ${d.selector}${to ? ` on ${short(to)}` : ""}.`;
  } else {
    if (d.source === "4byte") add("Check", "4byte", `Decoded from a public 4byte guess (${d.signature}). Selectors can collide, so treat the names as a guess.`);
    const fn = d.functionName;
    const isPermit2Approve = fn === "approve" && d.args.length === 4;
    if ((fn === "approve" || fn === "increaseAllowance" || fn === "permit") && !isPermit2Approve) {
      const spender = String(arg(d, "spender"));
      const amt = (arg(d, "amount") ?? arg(d, "addedValue") ?? arg(d, "value")) as bigint;
      const known = spenderName(spender);
      if (amt === 0n && fn === "approve") {
        headline = `You're removing ${who(spender)}'s access to your ${tokenLabel(to)}.`;
      } else if (amt >= UNLIMITED) {
        add(known ? "Check" : "Danger", "unlimited", `The allowance is ${amt === maxUint256 ? "the maximum possible number" : "effectively unlimited"}.`);
        headline = `You're giving ${who(spender)} unlimited access to your ${tokenLabel(to)}.`;
      } else {
        headline = `You're letting ${who(spender)} spend up to ${amountText(to, amt)}.`;
      }
      if (!known && amt !== 0n) add("Check", "unknown-spender", `${spender} is not on the known list of spenders.`);
      if (fn === "permit") add("Check", "permit", "This is a gasless permit signature; once signed, anyone holding it can submit it.");
    } else if (isPermit2Approve) {
      const token = String(arg(d, "token")), spender = String(arg(d, "spender"));
      const amt = arg(d, "amount") as bigint;
      const known = spenderName(spender);
      if (amt >= MAX160 || amt >= UNLIMITED) {
        add(known ? "Check" : "Danger", "unlimited", "The Permit2 allowance is the maximum possible amount.");
        headline = `You're giving ${who(spender)} unlimited Permit2 access to your ${tokenLabel(token)}.`;
      } else headline = `You're letting ${who(spender)} spend up to ${amountText(token, amt)} through Permit2.`;
      if (!known) add("Check", "unknown-spender", `${spender} is not on the known list of spenders.`);
    } else if (fn === "setApprovalForAll") {
      const op = String(arg(d, "operator"));
      if (arg(d, "approved") === true) {
        add(spenderName(op) ? "Check" : "Danger", "approval-for-all", "This gives control of every item in the collection, now and in future.");
        if (!spenderName(op)) add("Check", "unknown-spender", `${op} is not on the known list of operators.`);
        headline = `You're giving ${who(op)} control of every NFT you hold in ${to ? short(to) : "this collection"}.`;
      } else headline = `You're removing ${who(op)}'s control over this collection.`;
    } else if (fn === "transfer") {
      headline = `You're sending ${amountText(to, arg(d, "amount") as bigint)} to ${short(String(arg(d, "to")))}.`;
    } else if (fn === "transferFrom" || fn === "safeTransferFrom") {
      headline = `You're moving ${d.args.length === 5 ? `${arg(d, "amount")} of item #${arg(d, "id")}` : `${arg(d, "tokenId") ?? arg(d, "amount")}`} from ${short(String(arg(d, "from")))} to ${short(String(arg(d, "to")))}.`;
    } else {
      headline = `You're calling ${fn}${to ? ` on ${short(to)}` : ""}.`;
    }
  }

  const verdict = flags.reduce<Verdict>((v, f) => (rank[f.level] > rank[v] ? f.level : v), "Safe");
  return { verdict, headline, flags };
}
