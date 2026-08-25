import { spawn } from "node:child_process";
import path from "node:path";

const nodeId = process.argv[2];
const configs = {
  "node-1": { port: "4000" },
  "node-2": { port: "4001" },
  "node-3": { port: "4002" },
};

if (!configs[nodeId]) {
  console.error("Usage: npm run restart:node -- node-1|node-2|node-3");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "../..");
const dataDir = path.join(root, "backend", "data", "demo-runtime");
const peerUrls = Object.values(configs).map(({ port }) => `http://localhost:${port}`);
const { port } = configs[nodeId];
const peers = peerUrls.filter(url => url !== `http://localhost:${port}`).join(",");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

console.log(`Starting ${nodeId} on :${port}. It will sync missed identities and records from healthy peers.`);
const child = spawn(process.execPath, [tsxCli, "backend/src/index.ts"], {
  cwd: root,
  env: { ...process.env, DATA_DIR: dataDir, NODE_ID: nodeId, NODE_NAME: `Verifier ${nodeId.slice(-1)}`, PORT: port, PEERS: peers },
  stdio: "inherit",
});

child.on("exit", code => process.exit(code ?? 0));
