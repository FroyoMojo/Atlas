const e = import.meta.env;

export const config = {
  useMocks: e.VITE_USE_MOCKS === "true", // mocks only when asked for: a build without the env must never ship fake data
  // Empty or relative = same origin, so one build works on the tunnel URL and the domain.
  engineUrl: e.VITE_ENGINE_URL || "/engine", // an empty value means the default, not the site root
  chainUrl: e.VITE_CHAIN_URL ?? "",
  // Harvey footage on the landing page: a YouTube video id, and the second to start at.
  footageId: e.VITE_FOOTAGE_ID || "rg-L9su5ygI",
  footageStart: Number(e.VITE_FOOTAGE_START) || 601,
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
