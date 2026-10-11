import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { useCallback } from "react";
import { api } from "./api";

const fromB64 = (b64: string) => Transaction.from(Buffer.from(b64, "base64"));
const toB64 = (tx: Transaction) => tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

/**
 * Plan v3 8.3. Flow A: the server already signed; the wallet signs and we send.
 * Flow B: the wallet signs first; the server checks the message, co-signs and sends.
 */
export function useServerTx() {
  const { connection } = useConnection();
  const { signTransaction, publicKey } = useWallet();

  const sign = useCallback(
    async (b64: string) => {
      if (!publicKey || !signTransaction) throw new Error("Connect a wallet first");
      return signTransaction(fromB64(b64));
    },
    [publicKey, signTransaction],
  );

  const sendFlowA = useCallback(
    async (b64: string): Promise<string> => {
      const signed = await sign(b64);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    },
    [connection, sign],
  );

  const purchase = useCallback(
    async (b64: string, flow: "a" | "b"): Promise<string> => {
      if (flow === "a") return sendFlowA(b64);
      return (await api.purchaseSubmit(toB64(await sign(b64)))).signature;
    },
    [sendFlowA, sign],
  );

  const bond = useCallback(async (b64: string) => (await api.bondSubmit(toB64(await sign(b64)))).signature, [sign]);

  const donate = useCallback(async (b64: string) => (await api.donateSubmit(toB64(await sign(b64)))).signature, [sign]);

  return { purchase, bond, donate };
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Opens this page inside Phantom's in-app browser (Phantom's universal link). */
export const phantomBrowseUrl = () =>
  `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;

export const NO_WALLET_EVENT = "atlas:no-wallet";

/**
 * "Connect wallet": the wallet list when the browser has a Solana wallet. Without one the list
 * would be empty, so on a phone it reopens the page inside Phantom, and on a computer it shows
 * how to install one (WalletHelp listens for NO_WALLET_EVENT).
 */
export function useConnectWallet() {
  const { wallets } = useWallet();
  const { setVisible } = useWalletModal();
  return useCallback(() => {
    const injected = typeof window !== "undefined" && !!((window as any).phantom?.solana || (window as any).solana); // eslint-disable-line @typescript-eslint/no-explicit-any
    const found = injected || wallets.some((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
    if (found) setVisible(true);
    else if (isMobile()) window.location.href = phantomBrowseUrl();
    else window.dispatchEvent(new Event(NO_WALLET_EVENT));
  }, [wallets, setVisible]);
}
