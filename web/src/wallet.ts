import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { useCallback } from "react";

/** Sign and send a transaction the chain server already partially signed (purchase, bond deposit). */
export function useSendServerTx() {
  const { connection } = useConnection();
  const { signTransaction, publicKey } = useWallet();
  return useCallback(
    async (base64: string): Promise<string> => {
      if (!publicKey || !signTransaction) throw new Error("Connect a wallet first");
      const tx = Transaction.from(Buffer.from(base64, "base64"));
      const signed = await signTransaction(tx); // keeps the server's partial signature
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    },
    [connection, publicKey, signTransaction],
  );
}
