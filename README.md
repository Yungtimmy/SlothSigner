# SlothSigner

Read before you sign. Slowly.

SlothSigner explains a wallet signature request in plain English before you approve it. Paste a transaction or a typed-data request, and it shows who you are giving access to, what they can move, and how much.

- **Fixed rules decide the verdict:** Safe, Check, or Danger. Things like unlimited approvals, permits, and unknown functions are flagged by code, not by the model.
- **Gemma writes the explanation.** It runs fully in your browser with WebLLM (`gemma3-1b-it-q4f16_1-MLC`). Nothing you paste leaves your machine. The model downloads once, then is cached.
- Decodes ERC-20, ERC-721/1155, EIP-2612 permit and Permit2. Other calls are looked up on 4byte.

Needs a browser with WebGPU (recent Chrome or Edge) for the Gemma explanation.

## Run it

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # static build in dist/
```

## Why

Built for the DEV Hacktoberfest **Slow and Steady** challenge, Gemma category.
