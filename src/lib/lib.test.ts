import { describe, it, expect } from "vitest";
import { toFunctionSelector } from "viem";
import { decode, decodeBuiltin, parseInput } from "./decode";
import { assess } from "./rules";
import { templateExplanation, shortenAddresses, buildPrompt } from "./explain";
import { SAMPLES } from "../samples";

const pad = (h: string) => h.replace(/^0x/, "").padStart(64, "0");
const run = (raw: string) => { const d = decodeBuiltin(parseInput(raw)); return { d, a: assess(d) }; };
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

describe("parseInput", () => {
  it("accepts raw hex without 0x", () => expect(parseInput("a9059cbb").data).toBe("0xa9059cbb"));
  it("accepts JSON tx with value", () => expect(parseInput('{"to":"0x1","data":"0x","value":"0x10"}').value).toBe(16n));
  it("rejects junk", () => expect(() => parseInput("hello")).toThrow());
});

describe("decoder + rules", () => {
  it("unlimited USDC approve to unknown spender is Danger", () => {
    const { d, a } = run(SAMPLES[0].value);
    expect(d.functionName).toBe("approve");
    expect(a.verdict).toBe("Danger");
    expect(a.headline).toMatch(/unlimited access to your USDC/);
    expect(a.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["unlimited", "unknown-spender"]));
  });
  it("setApprovalForAll true to unknown is Danger", () => {
    const { a } = run(SAMPLES[1].value);
    expect(a.verdict).toBe("Danger");
  });
  it("normal transfer is Safe", () => {
    const { a } = run(SAMPLES[2].value);
    expect(a.verdict).toBe("Safe");
    expect(a.headline).toContain("25 USDC");
  });
  it("limited approve to Permit2 is Safe", () => expect(run(SAMPLES[3].value).a.verdict).toBe("Safe"));
  it("unlimited approve to known Permit2 is Check", () => {
    expect(run(`0x095ea7b3${pad(PERMIT2)}${"f".repeat(64)}`).a.verdict).toBe("Check");
  });
  it("revoke (approve 0) is Safe", () => expect(run(`0x095ea7b3${pad("0x3f9c4e7d18b2a05c6e91d7f3b8a2c4e6d10fa1b2")}${pad("0")}`).a.verdict).toBe("Safe"));
  it("decodes increaseAllowance and transferFrom", () => {
    expect(run(`0x39509351${pad("0x01")}${pad("5")}`).d.functionName).toBe("increaseAllowance");
    expect(run(`0x23b872dd${pad("0x01")}${pad("0x02")}${pad("5")}`).d.functionName).toBe("transferFrom");
  });
  it("decodes ERC721 safeTransferFrom", () => {
    expect(run(`0x42842e0e${pad("0x01")}${pad("0x02")}${pad("7")}`).d.signature).toBe("safeTransferFrom(address,address,uint256)");
  });
  it("decodes Permit2 approve and flags max uint160", () => {
    const { d, a } = run(`0x87517c45${pad("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")}${pad("0x3f9c4e7d18b2a05c6e91d7f3b8a2c4e6d10fa1b2")}${pad("f".repeat(40))}${pad("ffffffffffff")}`);
    expect(d.signature).toBe("approve(address,address,uint160,uint48)");
    expect(a.verdict).toBe("Danger");
  });
  it("non-zero ETH value is Check", () => expect(run('{"to":"0x1111111111111111111111111111111111111111","data":"0x","value":"1000000000000000000"}').a.verdict).toBe("Check"));
  it("template explanation never contains exclamation marks", () => {
    const { d, a } = run(SAMPLES[0].value);
    expect(templateExplanation(d, a)).not.toContain("!");
  });
  it("template explanation does not repeat the headline", () => {
    const { d, a } = run(SAMPLES[0].value);
    expect(templateExplanation(d, a)).not.toContain(a.headline);
    expect(templateExplanation(d, a)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
  it("shortens addresses 4+4 and tells Gemma not to restate", () => {
    expect(shortenAddresses("to 0x3f9c4e7d18b2a05c6e91d7f3b8a2c4e6d10fa1b2.")).toBe("to 0x3f9c…a1b2.");
    const { d, a } = run(SAMPLES[0].value);
    expect(buildPrompt(d, a)).toContain("do not restate");
  });
});

describe("4byte fallback", () => {
  const data = `${toFunctionSelector("doThing(address)")}${pad("0x01")}`;
  it("decodes with a 4byte signature and marks Check", async () => {
    const fetcher = async () => ({ ok: true, json: async () => ({ results: [{ text_signature: "doThing(address)" }] }) });
    const d = await decode(parseInput(data), fetcher);
    expect(d.source).toBe("4byte");
    expect(assess(d).verdict).toBe("Check");
  });
  it("unknown selector is Danger", async () => {
    const d = await decode(parseInput(data), async () => ({ ok: true, json: async () => ({ results: [] }) }));
    expect(assess(d).verdict).toBe("Danger");
  });
  it("network error on 4byte lookup is Check, not Danger", async () => {
    const d = await decode(parseInput(data), async () => { throw new TypeError("Failed to fetch"); });
    const a = assess(d);
    expect(d.lookupFailed).toBe(true);
    expect(a.verdict).toBe("Check");
    expect(a.flags.map((f) => f.text)).toContain("Couldn't look up this function");
  });
});

import { formatArg } from "./format";
import { short } from "./known";
describe("formatArg", () => {
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  it("max uint256 is Unlimited with raw kept", () => {
    const f = formatArg("amount", 2n ** 256n - 1n, USDC);
    expect(f.text).toBe("Unlimited (max uint256)"); expect(f.raw).toMatch(/^1157/);
  });
  it("max uint160 is labelled", () => expect(formatArg("amount", 2n ** 160n - 1n).text).toBe("Unlimited (max uint160)"));
  it("known token gets decimals and symbol", () => expect(formatArg("amount", 1234500000n, USDC).text).toBe("1,234.5 USDC"));
  it("unknown token stays raw", () => expect(formatArg("amount", 5n, "0x0000000000000000000000000000000000000001").text).toBe("5"));
  it("short is 4+4", () => expect(short("0x3F9c000000000000000000000000000000a1b2")).toBe("0x3F9c…a1b2"));
});
