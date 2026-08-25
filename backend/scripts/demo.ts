import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const root = path.resolve(process.cwd());
const peerUrls = ["http://localhost:4000", "http://localhost:4001", "http://localhost:4002"];
const nodeConfigs = [
  { nodeId: "node-1", port: "4000", peers: peerUrls.filter(url => url !== "http://localhost:4000").join(",") },
  { nodeId: "node-2", port: "4001", peers: peerUrls.filter(url => url !== "http://localhost:4001").join(",") },
  { nodeId: "node-3", port: "4002", peers: peerUrls.filter(url => url !== "http://localhost:4002").join(",") },
];

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const children: ChildProcess[] = [];

for (const config of nodeConfigs) {
  children.push(spawn(process.execPath, [tsxCli, "backend/src/index.ts"], {
    cwd: root,
    env: { ...process.env, NODE_ID: config.nodeId, NODE_NAME: `Verifier ${config.nodeId.slice(-1)}`, PORT: config.port, PEERS: config.peers },
    stdio: "inherit",
  }));
}
children.push(spawn(process.execPath, [viteCli, "--host"], { cwd: root, env: process.env, stdio: "inherit" }));

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
for (const child of children) child.on("exit", code => { if (code && code !== 0) process.exitCode = code; });

console.log("EcoProof live demo: node-1 :4000, node-2 :4001, node-3 :4002, frontend :5173");
console.log("Each node has a separate SQLite database and independently verifies inbound records over HTTP.");
