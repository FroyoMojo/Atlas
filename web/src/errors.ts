// Plain-language wording for the errors a visitor can hit on buy, bond and donate.
export function friendlyError(e: unknown): string {
  const raw = String((e as Error)?.message ?? e);
  if (/allowlist/i.test(raw)) {
    return "This demo only accepts the Atlas demo wallets. Ask the team to add yours, or try one of the demo wallets.";
  }
  if (/insufficient|no record of a prior credit|could not find account|0x1\b/i.test(raw)) {
    return "This wallet has no test dollars (aUSD) yet. Ask the team to send some, then try again.";
  }
  if (/user rejected|rejected the request|declined|denied by the user|user denied/i.test(raw)) return "You cancelled the request in your wallet. Nothing was sent.";
  return raw;
}
