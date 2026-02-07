/**
 * Standalone test script for IQ plugin
 * Tests sending and receiving messages on-chain
 *
 * Usage: bun run test-iq.ts
 */

import { Connection, Keypair } from "@solana/web3.js";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import bs58 from "bs58";

// Configuration from environment (set these in your .env or shell)
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const MOLTBOOK_TOKEN = process.env.MOLTBOOK_TOKEN;
const AGENT_NAME = process.env.IQ_AGENT_NAME || "TestAgent";
const CHATROOM = process.env.IQ_CHATROOM || "General";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

if (!SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Constants
const DB_ROOT_NAME = "iq";
const CHATROOM_PREFIX = "chatroom:";
const GATEWAY_URL = "https://gateway.iqlabs.dev";
const MOLTBOOK_URL = "https://www.moltbook.com/api/v1";

// SHA-256 hash helper
function sha256(s: string): Buffer {
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
  console.log("IQ Plugin Test");
  console.log("=".repeat(60));
  console.log("");

  // 1. Load keypair from base58 private key
  console.log("1. Loading keypair from SOLANA_PRIVATE_KEY...");
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
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`   RPC: ${RPC_URL}`);
    console.log(`   Balance: ${(balance / 1e9).toFixed(4)} SOL`);

    if (balance < 0.001 * 1e9) {
      console.warn("   WARNING: Low balance. May not be able to send messages.");
    }
  } catch (e) {
    console.error(`   ERROR: Failed to connect to Solana: ${e}`);
    process.exit(1);
  }

  // 3. Import iqlabs-sdk
  console.log("\n3. Loading IQLabs SDK...");
  let iqlabs: typeof import("iqlabs-sdk");
  try {
    iqlabs = await import("iqlabs-sdk").then((m) => m.default || m);
    console.log("   SDK loaded successfully");
  } catch (e) {
    console.error(`   ERROR: Failed to load iqlabs-sdk: ${e}`);
    console.log("   Make sure to run: npm install iqlabs-sdk");
    process.exit(1);
  }

  // 4. Setup on-chain configuration
  console.log("\n4. Setting up on-chain configuration...");
  const dbRootId = sha256(DB_ROOT_NAME);
  const tableSeed = sha256(`${CHATROOM_PREFIX}${CHATROOM}`);
  const programId = iqlabs.contract.getProgramId();
  const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId, programId);
  const tablePda = iqlabs.contract.getTablePda(dbRootPda, tableSeed, programId);

  console.log(`   DB Root: ${DB_ROOT_NAME}`);
  console.log(`   Chatroom: ${CHATROOM}`);
  console.log(`   Table PDA: ${tablePda.toBase58()}`);

  // 5. Read recent messages
  console.log("\n5. Reading recent messages from chatroom...");
  try {
    const gatewayUrl = `${GATEWAY_URL}/table/${tablePda.toBase58()}/rows?limit=10`;
    const response = await fetch(gatewayUrl);
    
    if (response.ok) {
      const data = await response.json();
      const messages = (data.rows || data || []) as IQMessage[];
      
      if (messages.length === 0) {
        console.log("   No messages found in chatroom yet.");
      } else {
        console.log(`   Found ${messages.length} recent messages:`);
        for (const msg of messages.slice(0, 5)) {
          console.log(`   - ${msg.agent}: ${msg.content.slice(0, 50)}${msg.content.length > 50 ? "..." : ""}`);
        }
      }
    } else {
      console.log(`   Gateway returned ${response.status}, trying direct read...`);
      const rows = await iqlabs.reader.readTableRows(tablePda, { limit: 10 });
      console.log(`   Read ${(rows as IQMessage[]).length} messages directly from chain`);
    }
  } catch (e) {
    console.error(`   ERROR reading messages: ${e}`);
  }

  // 6. Send a test message
  console.log("\n6. Sending test message to chatroom...");
  const testMessage: IQMessage = {
    id: nanoid(),
    agent: AGENT_NAME,
    wallet: keypair.publicKey.toBase58(),
    content: `gm from ElizaOS IQ plugin test! Timestamp: ${new Date().toISOString()}`,
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
    console.log(`   View on Solscan: https://solscan.io/tx/${txSig}?cluster=devnet`);
  } catch (e) {
    console.error(`   ERROR sending message: ${e}`);
  }

  // 7. Test Moltbook integration
  console.log("\n7. Testing Moltbook integration...");
  if (!MOLTBOOK_TOKEN) {
    console.log("   Skipping - no MOLTBOOK_TOKEN set");
  } else {
    // Browse Moltbook
    console.log("   Browsing Moltbook hot posts...");
    try {
      const browseResponse = await fetch(`${MOLTBOOK_URL}/posts?sort=hot&limit=5`);
      const browseData = await browseResponse.json();

      if (browseData.posts && browseData.posts.length > 0) {
        console.log(`   Found ${browseData.posts.length} posts:`);
        for (const post of browseData.posts.slice(0, 3)) {
          console.log(`   - [${post.submolt?.name || "general"}] ${post.title?.slice(0, 40)}...`);
        }
      } else {
        console.log("   No posts found on Moltbook");
      }
    } catch (e) {
      console.error(`   ERROR browsing Moltbook: ${e}`);
    }

    // Post to Moltbook
    console.log("\n   Posting to Moltbook...");
    try {
      const postResponse = await fetch(`${MOLTBOOK_URL}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MOLTBOOK_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submolt: "iq",
          title: `ElizaOS IQ Plugin Test - ${new Date().toISOString().slice(0, 16)}`,
          content: `Testing the new @elizaos/plugin-iq! This plugin enables Eliza agents to chat on-chain via Solana across any channel.\n\nWallet: ${keypair.publicKey.toBase58()}\n\nJoin us on IQ: https://ai.iqlabs.dev/chat`,
        }),
      });

      const postData = await postResponse.json();
      if (postResponse.ok && postData.post) {
        console.log(`   SUCCESS! Post ID: ${postData.post.id}`);
        console.log(`   View at: https://moltbook.com/p/${postData.post.id}`);
      } else {
        console.log(`   Response: ${JSON.stringify(postData)}`);
      }
    } catch (e) {
      console.error(`   ERROR posting to Moltbook: ${e}`);
    }
  }

  // 8. Verify message was sent by reading again
  console.log("\n8. Verifying message was sent...");
  await new Promise((r) => setTimeout(r, 3000)); // Wait 3s for finality

  try {
    const gatewayUrl = `${GATEWAY_URL}/table/${tablePda.toBase58()}/rows?limit=5&fresh=true`;
    const response = await fetch(gatewayUrl);
    
    if (response.ok) {
      const data = await response.json();
      const messages = (data.rows || data || []) as IQMessage[];
      
      const ourMessage = messages.find((m) => m.id === testMessage.id);
      if (ourMessage) {
        console.log("   SUCCESS! Message found on-chain:");
        console.log(`   - ID: ${ourMessage.id}`);
        console.log(`   - Agent: ${ourMessage.agent}`);
        console.log(`   - Content: ${ourMessage.content}`);
      } else {
        console.log("   Message not found yet (may need more time for finality)");
        console.log("   Recent messages:");
        for (const msg of messages.slice(0, 3)) {
          console.log(`   - ${msg.agent}: ${msg.content.slice(0, 50)}`);
        }
      }
    }
  } catch (e) {
    console.error(`   ERROR verifying: ${e}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
