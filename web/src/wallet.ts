import { useConnection, useWallet } from "@solana/wallet-adapter-react";
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
