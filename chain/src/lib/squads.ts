// Squads v4 multisig: the pool vault. 2-of-3, short time lock in demo mode.
import * as multisig from "@sqds/multisig";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, TransactionMessage } from "@solana/web3.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";

const { Permissions } = multisig.types;

export async function createMultisig(
  connection: Connection,
  creator: Keypair,
  members: PublicKey[],
  threshold: number,
  timeLockSeconds: number,
): Promise<{ multisigPda: PublicKey; vault: PublicKey; createKey: PublicKey; signature: string }> {
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);

  const signature = await multisig.rpc.multisigCreateV2({
    connection,
    treasury: programConfig.treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold,
    members: members.map((key) => ({ key, permissions: Permissions.all() })),
    timeLock: timeLockSeconds,
    rentCollector: null,
    sendOptions: { skipPreflight: false },
  });
  await connection.confirmTransaction(signature, "confirmed");
  return { multisigPda, vault: vaultPda(multisigPda), createKey: createKey.publicKey, signature };
}

export function vaultPda(multisigPda: PublicKey): PublicKey {
  return multisig.getVaultPda({ multisigPda, index: 0 })[0];
}

async function nextTransactionIndex(connection: Connection, multisigPda: PublicKey): Promise<bigint> {
  const info = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  return BigInt(info.transactionIndex.toString()) + 1n;
}

/**
 * Move aUSD out of the vault through a full proposal: create, approve by `approvers`,
 * wait out the time lock, execute. Used to fund the bot's float (simple version, plan 8.4).
 */
export async function vaultTransferAusd(params: {
  connection: Connection;
  multisigPda: PublicKey;
  ausdMint: PublicKey;
  to: PublicKey;
  amountUnits: bigint;
  approvers: Keypair[];
  timeLockSeconds: number;
  log?: (msg: string) => void;
}): Promise<string> {
  const { connection, multisigPda, ausdMint, approvers } = params;
  const log = params.log ?? (() => {});
  const proposer = approvers[0];
  const vault = vaultPda(multisigPda);
  const transactionIndex = await nextTransactionIndex(connection, multisigPda);
  const { blockhash } = await connection.getLatestBlockhash();

  const message = new TransactionMessage({
    payerKey: vault,
    recentBlockhash: blockhash,
    instructions: [
      createTransferCheckedInstruction(
        ausdAta(ausdMint, vault, true),
        ausdMint,
        ausdAta(ausdMint, params.to),
        vault,
        params.amountUnits,
        AUSD_DECIMALS,
        [],
        AUSD_PROGRAM_ID,
      ),
    ],
  });

  const confirm = (sig: string) => connection.confirmTransaction(sig, "confirmed");

  await confirm(
    await multisig.rpc.vaultTransactionCreate({
      connection,
      feePayer: proposer,
      multisigPda,
      transactionIndex,
      creator: proposer.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: message,
    }),
  );
  log(`vault transaction #${transactionIndex} created`);

  await confirm(
    await multisig.rpc.proposalCreate({ connection, feePayer: proposer, creator: proposer, multisigPda, transactionIndex }),
  );
  for (const member of approvers) {
    await confirm(
      await multisig.rpc.proposalApprove({ connection, feePayer: member, member, multisigPda, transactionIndex }),
    );
    log(`approved by ${member.publicKey.toBase58()}`);
  }

  if (params.timeLockSeconds > 0) {
    log(`waiting ${params.timeLockSeconds + 2}s for the time lock`);
    await new Promise((r) => setTimeout(r, (params.timeLockSeconds + 2) * 1000));
  }

  const signature = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: proposer,
    multisigPda,
    transactionIndex,
    member: proposer.publicKey,
    signers: [proposer],
  });
  await confirm(signature);
  return signature;
}
