const e = import.meta.env;

export const config = {
  useMocks: (e.VITE_USE_MOCKS ?? "true") === "true",
  engineUrl: e.VITE_ENGINE_URL ?? "http://localhost:8000",
  chainUrl: e.VITE_CHAIN_URL ?? "http://localhost:8787",
  rpcUrl: e.VITE_RPC_URL ?? "https://api.devnet.solana.com",
  ausdMint: e.VITE_AUSD_MINT ?? "",
  explorerCluster: e.VITE_EXPLORER_CLUSTER ?? "devnet",
  // Plan v3 8.3: "a" = server signs first, "b" = wallet signs first. Set from the Hour-0 phone test.
  purchaseFlow: ((e.VITE_PURCHASE_FLOW ?? "a").toLowerCase() === "b" ? "b" : "a") as "a" | "b",
};

export function explorer(sigOrAddress: string, kind: "tx" | "address" = "tx"): string {
  const cluster =
    config.explorerCluster === "devnet"
      ? "cluster=devnet"
      : `cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
  return `https://explorer.solana.com/${kind}/${sigOrAddress}?${cluster}`;
}

export const short = (s: string, n = 4) => (s.length > 2 * n + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
