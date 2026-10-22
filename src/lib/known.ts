import { getAddress, type Address } from "viem";

export const KNOWN_SPENDERS: Record<string, string> = {
  "0x000000000022D473030F116dDEE9F6B43aC78BA3": "Uniswap Permit2",
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D": "Uniswap V2 Router",
  "0xE592427A0AEce92De3Edee1F18E0157C05861564": "Uniswap V3 SwapRouter",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Uniswap SwapRouter02",
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD": "Uniswap Universal Router",
  "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af": "Uniswap Universal Router v4",
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC": "OpenSea Seaport 1.5",
};

export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": { symbol: "USDC", decimals: 6 },
  "0xdAC17F958D2ee523a2206206994597C13D831ec7": { symbol: "USDT", decimals: 6 },
  "0x6B175474E89094C44Da98b954EedeAC495271d0F": { symbol: "DAI", decimals: 18 },
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": { symbol: "WETH", decimals: 18 },
};

function norm(a: string): string {
  try { return getAddress(a); } catch { return a; }
}
export const spenderName = (a?: string) => (a ? KNOWN_SPENDERS[norm(a)] : undefined);
export const tokenInfo = (a?: string) => (a ? KNOWN_TOKENS[norm(a)] : undefined);
export const short = (a: Address | string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
