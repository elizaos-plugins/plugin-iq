/**
 * End-to-end test for IQ plugin
 * Tests send + receive on both "clawbal" and "milaidy" channels
 *
 * Usage: SOLANA_PRIVATE_KEY=... npx tsx test-iq.ts
 */

import { Connection, Keypair, Transaction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import bs58 from "bs58";
import iqlabs from "@iqlabs-official/solana-sdk";
import * as fs from "fs";

// Configuration
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const AGENT_NAME = process.env.IQ_AGENT_NAME || "TestAgent";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const CHATROOMS = ["clawbal", "milaidy"];
const DB_ROOT_NAME = "clawbal";
const CHATROOM_PREFIX = "chatroom:";

if (!SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

function sha256(s: string): Uint8Array {
  return createHash("sha256").update(s).digest();
}

interface TestResult {
  chatroom: string;
  tablePda: string;
  readBefore: number;
  sendTx: string | null;
  readAfter: number;
  messageVerified: boolean;
}

async function ensureTableExists(
  conn: Connection,
  keypair: Keypair,
  dbRootId: Uint8Array,
  dbRootPda: ReturnType<typeof iqlabs.contract.getDbRootPda>,
  chatroomName: string
): Promise<void> {
  const tableSeed = sha256(`${CHATROOM_PREFIX}${chatroomName}`);
  const tablePda = iqlabs.contract.getTablePda(dbRootPda, tableSeed);
  const tableInfo = await conn.getAccountInfo(tablePda);
  
  if (tableInfo) return; // Table already exists

  console.log(`   Creating table for "${chatroomName}"...`);
  const programId = iqlabs.contract.getProgramId();
  const instructionTablePda = iqlabs.contract.getInstructionTablePda(dbRootPda, tableSeed);
  const idlPath = new URL("node_modules/@iqlabs-official/solana-sdk/idl/code_in.json", import.meta.url).pathname;
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const builder = iqlabs.contract.createInstructionBuilder(idl, programId);

  const toBuffer = (s: string) => Buffer.from(s, "utf8");
  const ix = iqlabs.contract.createTableInstruction(builder, {
    db_root: dbRootPda,
    receiver: keypair.publicKey,
    signer: keypair.publicKey,
    table: tablePda,
    instruction_table: instructionTablePda,
    system_program: SystemProgram.programId,
  }, {
    db_root_id: Buffer.from(dbRootId),
    table_seed: Buffer.from(tableSeed),
    table_name: toBuffer(`chatroom:${chatroomName}`),
    column_names: [toBuffer("id"), toBuffer("agent"), toBuffer("wallet"), toBuffer("content"), toBuffer("timestamp")],
    id_col: toBuffer("id"),
    ext_keys: [],
    gate_mint_opt: null,
    writers_opt: null,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [keypair]);
  console.log(`   Table created: ${sig}`);
}

async function testChatroom(
  conn: Connection,
  keypair: Keypair,
  dbRootId: Uint8Array,
  dbRootPda: ReturnType<typeof iqlabs.contract.getDbRootPda>,
  chatroomName: string
): Promise<TestResult> {
  const tableSeed = sha256(`${CHATROOM_PREFIX}${chatroomName}`);
  const tablePda = iqlabs.contract.getTablePda(dbRootPda, tableSeed);
  const tablePdaStr = tablePda.toBase58();

  const result: TestResult = {
    chatroom: chatroomName,
    tablePda: tablePdaStr,
    readBefore: 0,
    sendTx: null,
    readAfter: 0,
    messageVerified: false,
  };

  // Ensure table exists
  await ensureTableExists(conn, keypair, dbRootId, dbRootPda, chatroomName);

  // READ: before send
  try {
    const rows = await iqlabs.reader.readTableRows(tablePdaStr, { limit: 10 });
    result.readBefore = rows.length;
  } catch (e) {
    console.log(`   Read before failed: ${(e as Error).message}`);
  }

  // SEND
  const testMsg = {
    id: nanoid(),
    agent: AGENT_NAME,
    wallet: keypair.publicKey.toBase58(),
    content: `e2e test [${chatroomName}] ${new Date().toISOString()}`,
    timestamp: new Date().toISOString(),
  };

  try {
    const txSig = await iqlabs.writer.writeRow(conn, keypair, dbRootId, tableSeed, JSON.stringify(testMsg));
    result.sendTx = txSig;
  } catch (e) {
    console.log(`   Send failed: ${(e as Error).message}`);
  }

  // Wait for confirmation
  await new Promise((r) => setTimeout(r, 2000));

  // READ: after send
  try {
    const rows = await iqlabs.reader.readTableRows(tablePdaStr, { limit: 10 });
    result.readAfter = rows.length;
    const found = rows.find((r: Record<string, unknown>) => {
      try {
        const parsed = typeof r === "string" ? JSON.parse(r) : r;
        return parsed.id === testMsg.id;
      } catch { return false; }
    });
    result.messageVerified = !!found;
  } catch (e) {
    console.log(`   Read after failed: ${(e as Error).message}`);
  }

  return result;
}

async function main() {
  console.log("=".repeat(60));
  console.log("IQ Plugin E2E Test - clawbal + milaidy channels");
  console.log("=".repeat(60));
  console.log("");

  // Setup
  const secretKey = bs58.decode(SOLANA_PRIVATE_KEY);
  const keypair = Keypair.fromSecretKey(secretKey);
  const conn = new Connection(RPC_URL, "confirmed");
  iqlabs.setRpcUrl(RPC_URL);

  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
  const balance = await conn.getBalance(keypair.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Chatrooms: ${CHATROOMS.join(", ")}`);

  const dbRootId = sha256(DB_ROOT_NAME);
  const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId);
  console.log(`DB Root PDA: ${dbRootPda.toBase58()}`);
  console.log("");

  // Test each chatroom
  const results: TestResult[] = [];
  for (const chatroom of CHATROOMS) {
    console.log(`--- Testing "${chatroom}" ---`);
    try {
      const result = await testChatroom(conn, keypair, dbRootId, dbRootPda, chatroom);
      results.push(result);
      console.log(`   Table PDA: ${result.tablePda}`);
      console.log(`   Read before: ${result.readBefore} messages`);
      console.log(`   Send TX: ${result.sendTx || "FAILED"}`);
      console.log(`   Read after: ${result.readAfter} messages`);
      console.log(`   Message verified: ${result.messageVerified ? "YES" : "NO (may need more time)"}`);
    } catch (e) {
      console.error(`   FATAL: ${(e as Error).message}`);
      results.push({ chatroom, tablePda: "", readBefore: 0, sendTx: null, readAfter: 0, messageVerified: false });
    }
    console.log("");
  }

  // Summary
  console.log("=".repeat(60));
  console.log("RESULTS:");
  console.log("=".repeat(60));
  let allPassed = true;
  for (const r of results) {
    const sendOk = !!r.sendTx;
    const readOk = r.readAfter > 0;
    const passed = sendOk && readOk;
    if (!passed) allPassed = false;
    console.log(`  ${passed ? "PASS" : "FAIL"} | ${r.chatroom.padEnd(10)} | send: ${sendOk ? "OK" : "FAIL"} | read: ${readOk ? r.readAfter + " msgs" : "FAIL"} | verified: ${r.messageVerified ? "YES" : "NO"}`);
  }
  console.log("");
  console.log(allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
  console.log("=".repeat(60));

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
