/**
 * Standalone test script for IQ plugin
 * Tests reading and sending messages on-chain via @iqlabs-official/solana-sdk
 *
 * Usage: npx tsx test-iq.ts
 */

import { Connection, Keypair } from "@solana/web3.js";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import bs58 from "bs58";
import iqlabs from "@iqlabs-official/solana-sdk";

// Configuration
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const AGENT_NAME = process.env.IQ_AGENT_NAME || "TestAgent";
const CHATROOM = process.env.IQ_DEFAULT_CHATROOM || "General";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

if (!SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const DB_ROOT_NAME = "clawbal";
const CHATROOM_PREFIX = "chatroom:";
const GATEWAY_URL = "https://gateway.iqlabs.dev";

function sha256(s: string): Uint8Array {
  return createHash("sha256").update(s).digest();
}

interface IQMessage {
  id: string;
  agent: string;
  wallet: string;
  content: string;
  timestamp: string;
}

async function main() {
  console.log("=".repeat(60));
  console.log("IQ Plugin Test - @iqlabs-official/solana-sdk");
  console.log("=".repeat(60));
  console.log("");

  // 1. Load keypair
  console.log("1. Loading keypair...");
  let keypair: Keypair;
  try {
    const secretKey = bs58.decode(SOLANA_PRIVATE_KEY);
    keypair = Keypair.fromSecretKey(secretKey);
    console.log(`   Wallet: ${keypair.publicKey.toBase58()}`);
  } catch (e) {
    console.error(`   ERROR: Invalid private key format: ${e}`);
    process.exit(1);
  }

  // 2. Connect to Solana
  console.log("\n2. Connecting to Solana...");
  const connection = new Connection(RPC_URL, "confirmed");
  iqlabs.setRpcUrl(RPC_URL);
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`   RPC: ${RPC_URL}`);
    console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    if (balance < 0.001 * 1e9) {
      console.warn("   WARNING: Low balance. May not be able to send messages.");
    }
  } catch (e) {
    console.error(`   ERROR: Failed to connect: ${e}`);
    process.exit(1);
  }

  // 3. Setup on-chain configuration
  console.log("\n3. Setting up on-chain config...");
  const dbRootId = sha256(DB_ROOT_NAME);
  const tableSeed = sha256(`${CHATROOM_PREFIX}${CHATROOM}`);
  const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId);
  const tablePda = iqlabs.contract.getTablePda(dbRootPda, tableSeed);

  console.log(`   DB Root: ${DB_ROOT_NAME}`);
  console.log(`   DB Root PDA: ${dbRootPda.toBase58()}`);
  console.log(`   Chatroom: ${CHATROOM}`);
  console.log(`   Table PDA: ${tablePda.toBase58()}`);

  // 4. Read messages via gateway
  console.log("\n4. Reading messages via gateway...");
  try {
    const gatewayUrl = `${GATEWAY_URL}/table/${tablePda.toBase58()}/rows?limit=10`;
    console.log(`   Gateway URL: ${gatewayUrl}`);
    const response = await fetch(gatewayUrl);
    if (response.ok) {
      const data = await response.json();
      const messages = (data.rows || data || []) as IQMessage[];
      if (messages.length === 0) {
        console.log("   No messages found via gateway.");
      } else {
        console.log(`   Found ${messages.length} messages via gateway:`);
        for (const msg of messages.slice(0, 5)) {
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg);
          console.log(`   - ${msg.agent || "?"}: ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`);
        }
      }
    } else {
      console.log(`   Gateway returned ${response.status}: ${await response.text()}`);
    }
  } catch (e) {
    console.error(`   ERROR reading via gateway: ${e}`);
  }

  // 5. Read messages via SDK directly
  console.log("\n5. Reading messages via SDK...");
  try {
    const rows = await iqlabs.reader.readTableRows(tablePda.toBase58(), { limit: 5 });
    if (rows.length === 0) {
      console.log("   No messages found via SDK.");
    } else {
      console.log(`   Found ${rows.length} messages via SDK:`);
      for (const row of rows.slice(0, 5)) {
        console.log(`   - ${JSON.stringify(row).slice(0, 80)}...`);
      }
    }
  } catch (e) {
    console.error(`   ERROR reading via SDK: ${e}`);
  }

  // 6. Send a test message
  console.log("\n6. Sending test message...");
  const testMessage: IQMessage = {
    id: nanoid(),
    agent: AGENT_NAME,
    wallet: keypair.publicKey.toBase58(),
    content: `gm from ElizaOS plugin-iq test! ${new Date().toISOString()}`,
    timestamp: new Date().toISOString(),
  };
  console.log(`   Message: "${testMessage.content}"`);

  try {
    const txSig = await iqlabs.writer.writeRow(
      connection,
      keypair,
      dbRootId,
      tableSeed,
      JSON.stringify(testMessage)
    );
    console.log(`   SUCCESS! Transaction: ${txSig}`);
    console.log(`   View: https://solscan.io/tx/${txSig}?cluster=devnet`);
  } catch (e) {
    console.error(`   ERROR sending message: ${e}`);
  }

  // 7. Verify by reading again
  console.log("\n7. Verifying...");
  await new Promise((r) => setTimeout(r, 3000));

  try {
    const rows = await iqlabs.reader.readTableRows(tablePda.toBase58(), { limit: 5 });
    const found = rows.find((r: Record<string, unknown>) => {
      const parsed = typeof r === "string" ? JSON.parse(r) : r;
      return parsed.id === testMessage.id;
    });
    if (found) {
      console.log("   Message found on-chain!");
    } else {
      console.log("   Message not found yet (may need more finality time)");
      console.log(`   Latest rows: ${rows.length}`);
    }
  } catch (e) {
    console.error(`   ERROR verifying: ${e}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
