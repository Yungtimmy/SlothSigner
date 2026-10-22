const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const MAX = "f".repeat(64);
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SHADY = "0x3f9c4e7d18b2a05c6e91d7f3b8a2c4e6d10fa1b2";
export const SAMPLES = [
  { label: "Unlimited USDC approve", value: JSON.stringify({ to: USDC, data: `0x095ea7b3${pad(SHADY)}${MAX}`, value: "0x0" }, null, 2) },
  { label: "setApprovalForAll", value: JSON.stringify({ to: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", data: `0xa22cb465${pad(SHADY)}${pad("1")}` }, null, 2) },
  { label: "Normal USDC transfer", value: JSON.stringify({ to: USDC, data: `0xa9059cbb${pad("0x1111111111111111111111111111111111111111")}${pad((25_000_000).toString(16))}` }, null, 2) },
  { label: "Approve Permit2 (100 USDC)", value: JSON.stringify({ to: USDC, data: `0x095ea7b3${pad("0x000000000022D473030F116dDEE9F6B43aC78BA3")}${pad((100_000_000).toString(16))}` }, null, 2) },
];
