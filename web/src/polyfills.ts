// Must be imported before anything from @solana/*: web3.js v1 uses Node's Buffer.
import { Buffer } from "buffer";

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
