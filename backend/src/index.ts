import express, { type Request, type Response } from "express";
import { createServer, type Server } from "http";
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { performance } from "node:perf_hooks";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_ID = process.env.NODE_ID || "node-1";
const NODE_NAME = process.env.NODE_NAME || NODE_ID;
const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const KEYS_DIR = path.join(DATA_DIR, "keys", NODE_ID);
const NODE_KEYS_DIR = path.join(DATA_DIR, "keys", "nodes", NODE_ID);
const PEERS = (process.env.PEERS || "")
  .split(",")
  .map(value => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const DB_PATH = path.resolve(
  process.env.DB_PATH || path.join(DATA_DIR, `${NODE_ID}.sqlite`),
);

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(KEYS_DIR, { recursive: true });
mkdirSync(NODE_KEYS_DIR, { recursive: true });

const legacyPath = path.join(DATA_DIR, "ecoproof.sqlite");
if (!existsSync(DB_PATH) && NODE_ID === "node-1" && existsSync(legacyPath)) {
  copyFileSync(legacyPath, DB_PATH);
}

const db = new DatabaseSync(DB_PATH);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const rows = (query: string, ...params: SQLInputValue[]) =>
  db.prepare(query).all(...params) as Record<string, unknown>[];
const one = (query: string, ...params: SQLInputValue[]) =>
  db.prepare(query).get(...params) as Record<string, unknown> | undefined;
const sha256 = (input: string) => createHash("sha256").update(input).digest("hex");
const origin = "ORIGIN";

function loadNodeKeys() {
  const privatePath = path.join(NODE_KEYS_DIR, "node.private.pem");
  const publicPath = path.join(NODE_KEYS_DIR, "node.public.pem");
  if (existsSync(privatePath) && existsSync(publicPath)) return { privateKey: readFileSync(privatePath, "utf8"), publicKey: readFileSync(publicPath, "utf8") };
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  writeFileSync(privatePath, keys.privateKey, { mode: 0o600 });
  writeFileSync(publicPath, keys.publicKey, { mode: 0o644 });
  return keys;
}
const nodeKeys = loadNodeKeys();

type StoredRecord = Record<string, unknown>;
type ReplicationResult = {
  nodeId: string;
  url: string;
  accepted: boolean;
  status: number;
  message: string;
};

type Verification = {
  valid: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  chainLinkValid: boolean;
  expectedHash: string;
  actualHash: string;
  reason: string;
};

function hasColumn(table: string, column: string) {
  return rows(`PRAGMA table_info(${table})`).some(item => item.name === column);
}

function migrateLegacySchema() {
  db.exec("PRAGMA foreign_keys = OFF");

  if (one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'organizations'")) {
    if (hasColumn("organizations", "private_key_pem")) {
      const legacyOrgs = rows(
        "SELECT id, name, public_key_pem, private_key_pem, created_at FROM organizations",
      );
      db.exec(`
        CREATE TABLE organizations_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          public_key_pem TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      for (const organization of legacyOrgs) {
        const privateKey = String(organization.private_key_pem || "");
        if (privateKey) {
          const keyPath = path.join(KEYS_DIR, `${String(organization.id)}.private.pem`);
          if (!existsSync(keyPath)) writeFileSync(keyPath, privateKey, { mode: 0o600 });
        }
        db.prepare(
          "INSERT INTO organizations_new (id, name, public_key_pem, created_at) VALUES (?, ?, ?, ?)",
        ).run(
          organization.id as SQLInputValue,
          organization.name as SQLInputValue,
          organization.public_key_pem as SQLInputValue,
          organization.created_at as SQLInputValue,
        );
      }
      db.exec("DROP TABLE organizations; ALTER TABLE organizations_new RENAME TO organizations");
    }
  }

  if (one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'evidence_records'")) {
    if (hasColumn("evidence_records", "tampered")) {
      db.exec(`
        CREATE TABLE evidence_records_new (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL REFERENCES organizations(id),
          claim_key TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          source_file_name TEXT,
          previous_hash TEXT NOT NULL,
          record_hash TEXT NOT NULL,
          signature TEXT NOT NULL,
          version_of TEXT,
          created_at TEXT NOT NULL,
          submitted_at TEXT NOT NULL
        )
      `);
      db.exec(`
        INSERT INTO evidence_records_new
        (id, org_id, claim_key, title, type, payload, source_file_name, previous_hash, record_hash, signature, version_of, created_at, submitted_at)
        SELECT id, org_id, claim_key, title, type, payload, source_file_name, previous_hash, record_hash, signature, version_of, created_at, submitted_at
        FROM evidence_records
      `);
      db.exec("DROP TABLE evidence_records; ALTER TABLE evidence_records_new RENAME TO evidence_records");
    }
  }

  db.exec("PRAGMA foreign_keys = ON");
}

migrateLegacySchema();

  db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    public_key_pem TEXT NOT NULL,
    attestation_status TEXT NOT NULL DEFAULT 'pending',
    attestation_method TEXT,
    attestation_statement TEXT,
    attester_name TEXT,
    attester_role TEXT,
    attestation_hash TEXT,
    attestation_signature TEXT,
    attested_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evidence_records (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id),
    claim_key TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    source_file_name TEXT,
    previous_hash TEXT NOT NULL,
    record_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    version_of TEXT,
    created_at TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS record_backups (
    record_id TEXT PRIMARY KEY REFERENCES evidence_records(id),
    original_payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO record_backups (record_id, original_payload, created_at)
  SELECT id, payload, submitted_at FROM evidence_records;
  CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY,
    claim_key TEXT NOT NULL,
    record_a_id TEXT NOT NULL REFERENCES evidence_records(id),
    record_b_id TEXT NOT NULL REFERENCES evidence_records(id),
    comparison_mode TEXT NOT NULL DEFAULT 'numeric',
    comparable INTEGER NOT NULL DEFAULT 1,
    matches INTEGER NOT NULL DEFAULT 0,
    variance_percent REAL,
    comparison_details TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'needs_review',
    resolution_record_id TEXT,
    resolution_note TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    target TEXT,
    result TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

function addColumn(sql: string) { try { db.exec(sql); } catch { /* Existing clean or migrated schema already has it. */ } }
addColumn("ALTER TABLE organizations ADD COLUMN attestation_status TEXT NOT NULL DEFAULT 'pending'");
addColumn("ALTER TABLE organizations ADD COLUMN attestation_method TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attestation_statement TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attester_name TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attester_role TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attestation_hash TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attestation_signature TEXT");
addColumn("ALTER TABLE organizations ADD COLUMN attested_at TEXT");
addColumn("ALTER TABLE conflicts ADD COLUMN comparison_mode TEXT NOT NULL DEFAULT 'numeric'");
addColumn("ALTER TABLE conflicts ADD COLUMN comparable INTEGER NOT NULL DEFAULT 1");
addColumn("ALTER TABLE conflicts ADD COLUMN matches INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE conflicts ADD COLUMN comparison_details TEXT NOT NULL DEFAULT '{}'");
addColumn("ALTER TABLE conflicts ADD COLUMN resolution_record_id TEXT");
addColumn("ALTER TABLE conflicts ADD COLUMN resolution_note TEXT");
addColumn("ALTER TABLE conflicts ADD COLUMN resolved_at TEXT");


function privateKeyPath(orgId: string) {
  return path.join(KEYS_DIR, `${orgId}.private.pem`);
}

function getPrivateKey(orgId: string) {
  const keyPath = privateKeyPath(orgId);
  if (!existsSync(keyPath)) {
    throw new Error(`Private signing key is not available on ${NODE_ID}`);
  }
  return readFileSync(keyPath, "utf8");
}

function savePrivateKey(orgId: string, pem: string) {
  writeFileSync(privateKeyPath(orgId), pem, { mode: 0o600 });
}

function allRecords() {
  return rows("SELECT * FROM evidence_records ORDER BY created_at ASC, id ASC");
}

function canonicalRecord(record: StoredRecord, payload = String(record.payload || "")) {
  return JSON.stringify({
    id: String(record.id),
    orgId: String(record.org_id ?? record.orgId),
    claimKey: String(record.claim_key ?? record.claimKey),
    title: String(record.title),
    type: String(record.type),
    payload,
    sourceFileName: String(record.source_file_name ?? record.sourceFileName ?? ""),
    versionOf: record.version_of ?? record.versionOf ?? null,
    previousHash: String(record.previous_hash ?? record.previousHash),
    submittedAt: String(record.submitted_at ?? record.submittedAt),
  });
}

function recordHash(record: StoredRecord, payload = String(record.payload || "")) {
  return sha256(canonicalRecord(record, payload));
}

function organizationFor(orgId: string) {
  return one("SELECT * FROM organizations WHERE id = ?", orgId);
}

function verifyStoredRecord(record: StoredRecord, expectedPreviousHash?: string): Verification {
  const organization = organizationFor(String(record.org_id));
  const expectedHash = recordHash(record);
  const actualHash = String(record.record_hash);
  const hashValid = expectedHash === actualHash;
  const signatureValid = Boolean(
    organization &&
      verify(
        null,
        Buffer.from(actualHash),
        String(organization.public_key_pem),
        Buffer.from(String(record.signature), "base64"),
      ),
  );
  const chainLinkValid = expectedPreviousHash === undefined
    ? true
    : String(record.previous_hash) === expectedPreviousHash;
  let reason = "Valid hash, signature, and chain link";
  if (!hashValid) reason = "Hash mismatch: payload or signed metadata changed";
  else if (!signatureValid) reason = "Signature mismatch: signer key rejected the record hash";
  else if (!chainLinkValid) reason = "Chain-link mismatch: previousHash does not match the prior record";
  return {
    valid: hashValid && signatureValid && chainLinkValid,
    hashValid,
    signatureValid,
    chainLinkValid,
    expectedHash,
    actualHash,
    reason,
  };
}

function verificationMap() {
  const records = allRecords();
  const map = new Map<string, Verification>();
  let previous = origin;
  for (const record of records) {
    const result = verifyStoredRecord(record, previous);
    map.set(String(record.id), result);
    previous = String(record.record_hash);
  }
  return map;
}

function publicRecord(record: StoredRecord, verification?: Verification) {
  return {
    id: record.id,
    orgId: record.org_id,
    claimKey: record.claim_key,
    title: record.title,
    type: record.type,
    payload: record.payload,
    sourceFileName: record.source_file_name,
    previousHash: record.previous_hash,
    recordHash: record.record_hash,
    signature: record.signature,
    versionOf: record.version_of,
    submittedAt: record.submitted_at,
    verification: verification || verifyStoredRecord(record),
  };
}

function publicRecords() {
  const map = verificationMap();
  return allRecords().map(record => publicRecord(record, map.get(String(record.id))));
}

function publicOrganization(organization: StoredRecord) {
  return {
    id: organization.id,
    name: organization.name,
    publicKeyPem: organization.public_key_pem,
    createdAt: organization.created_at,
    recordCount: Number(organization.record_count ?? 0),
    identity: {
      status: String(organization.attestation_status || "pending"),
      verified: String(organization.attestation_status || "pending") === "approved",
      method: organization.attestation_method || null,
      statement: organization.attestation_statement || null,
      attesterName: organization.attester_name || null,
      attesterRole: organization.attester_role || null,
      attestationHash: organization.attestation_hash || null,
      attestationSignature: organization.attestation_signature || null,
        attestedAt: organization.attested_at || null,
      authorityNodeId: NODE_ID,
      authorityPublicKeyPem: nodeKeys.publicKey,
    },
  };
}

function logActivity(kind: string, actor: string, target: string | null, result: string, details = "") {
  db.prepare(
    "INSERT INTO activity_events (id, kind, actor, target, result, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id(), kind, actor, target, result, details, now());
}



const NUMERIC_TYPES = new Set(["emissions", "carbon_accounting", "assessment", "scientific_dataset"]);
type Comparison = { mode: "numeric" | "categorical" | "incomparable"; comparable: boolean; matches: boolean; variancePercent: number | null; explanation: string; left: Record<string, unknown>; right: Record<string, unknown> };
function parseMeasurement(payload: string) {
  const trimmed = payload.trim();
  try {
    const parsed = JSON.parse(trimmed) as { value?: unknown; unit?: unknown };
    if (parsed && typeof parsed.value === "number") return { value: parsed.value, unit: String(parsed.unit || "").trim().toLowerCase() };
  } catch { /* Plain text measurement follows. */ }
  const match = trimmed.match(/^([-+]?\d+(?:\.\d+)?)\s*(.*)$/);
  return match ? { value: Number(match[1]), unit: match[2].trim().toLowerCase() } : null;
}
function normalizedCategory(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(parsed, Object.keys(parsed || {}).sort()).trim().toLowerCase();
  } catch { return payload.trim().replace(/\s+/g, " ").toLowerCase(); }
}
function compareEvidence(type: string, payloadA: string, payloadB: string): Comparison {
  if (NUMERIC_TYPES.has(type)) {
    const a = parseMeasurement(payloadA); const b = parseMeasurement(payloadB);
    if (!a || !b || (a.unit && b.unit && a.unit !== b.unit)) return { mode: "incomparable", comparable: false, matches: false, variancePercent: null, explanation: "Numeric comparison requires parseable values with compatible units.", left: a || {}, right: b || {} };
    const denominator = Math.abs((a.value + b.value) / 2);
    const variancePercent = denominator === 0 ? (a.value === b.value ? 0 : 100) : Number(((Math.abs(a.value - b.value) / denominator) * 100).toFixed(2));
    return { mode: "numeric", comparable: true, matches: variancePercent === 0, variancePercent, explanation: `${a.value}${a.unit ? ` ${a.unit}` : ""} vs ${b.value}${b.unit ? ` ${b.unit}` : ""}; symmetric percentage difference.`, left: a, right: b };
  }
  const a = normalizedCategory(payloadA); const b = normalizedCategory(payloadB);
  return { mode: "categorical", comparable: true, matches: a === b, variancePercent: a === b ? 0 : 100, explanation: a === b ? "Normalized categorical values match." : "Normalized categorical values differ.", left: { normalized: a }, right: { normalized: b } };
}
function ensureConflict(record: StoredRecord) {
  const prior = one("SELECT * FROM evidence_records WHERE claim_key = ? AND id <> ? ORDER BY created_at DESC LIMIT 1", record.claim_key as string, record.id as string);
  if (!prior) return null;
  const comparison = compareEvidence(String(record.type), String(prior.payload), String(record.payload));
  if (comparison.matches) return null;
  const open = one("SELECT id FROM conflicts WHERE claim_key = ? AND status = 'needs_review'", record.claim_key as string);
  if (open) return String(open.id);
  const conflictId = id();
  db.prepare("INSERT INTO conflicts (id, claim_key, record_a_id, record_b_id, comparison_mode, comparable, matches, variance_percent, comparison_details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', ?)").run(conflictId, record.claim_key as string, prior.id as string, record.id as string, comparison.mode, comparison.comparable ? 1 : 0, comparison.matches ? 1 : 0, comparison.variancePercent, JSON.stringify(comparison), now());
  logActivity("conflict_opened", NODE_ID, conflictId, "created", comparison.explanation);
  return conflictId;
}



function insertVerifiedRecord(record: StoredRecord, source: "local" | "peer") {
  const existing = one("SELECT * FROM evidence_records WHERE id = ?", record.id as string);
  if (existing) {
    const stored = allRecords();
    const index = stored.findIndex(item => String(item.id) === String(record.id));
    const priorHash = index > 0 ? String(stored[index - 1].record_hash) : origin;
    const incomingVerification = verifyStoredRecord(record, priorHash);
    const sameCanonicalRecord = canonicalRecord(existing) === canonicalRecord(record) && String(existing.signature) === String(record.signature);
    if (!incomingVerification.valid || !sameCanonicalRecord) throw Object.assign(new Error("Existing record ID was presented with a different or invalid signed payload"), { statusCode: 422, verification: incomingVerification });
    return { inserted: false, message: "Record already present and independently verified" };
  }
  const prior = allRecords().at(-1);
  const expectedPreviousHash = prior?.record_hash ? String(prior.record_hash) : origin;
  const verification = verifyStoredRecord(record, expectedPreviousHash);
  if (!verification.valid) {
    throw Object.assign(new Error(verification.reason), { statusCode: 422, verification });
  }
  db.prepare(`
    INSERT INTO evidence_records
    (id, org_id, claim_key, title, type, payload, source_file_name, previous_hash, record_hash, signature, version_of, created_at, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id as SQLInputValue,
    record.org_id as SQLInputValue,
    record.claim_key as SQLInputValue,
    record.title as SQLInputValue,
    record.type as SQLInputValue,
    record.payload as SQLInputValue,
    (record.source_file_name ?? "") as SQLInputValue,
    record.previous_hash as SQLInputValue,
    record.record_hash as SQLInputValue,
    record.signature as SQLInputValue,
    (record.version_of ?? null) as SQLInputValue,
    record.created_at as SQLInputValue,
    record.submitted_at as SQLInputValue,
  );
  db.prepare(
    "INSERT OR IGNORE INTO record_backups (record_id, original_payload, created_at) VALUES (?, ?, ?)",
  ).run(record.id as SQLInputValue, record.payload as SQLInputValue, now());
  ensureConflict(record);
  logActivity(
    source === "local" ? "evidence_anchored" : "record_replicated",
    NODE_ID,
    String(record.id),
    "accepted",
    source === "peer" ? "Verified before local append" : "Signed and appended locally",
  );
  return { inserted: true, message: "Record accepted" };
}

async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 1800) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function nodeIdFromUrl(url: string) {
  const port = Number(new URL(url).port || 80);
  return `node-${port - 3999}`;
}

function peerForNode(nodeId: string) {
  return PEERS.find(url => nodeIdFromUrl(url) === nodeId);
}

async function broadcastRecord(record: StoredRecord): Promise<ReplicationResult[]> {
  const results = await Promise.all(
    PEERS.map(async url => {
      try {
        const { response, body } = await requestJson(`${url}/api/network/receive-record`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(publicRecord(record)),
        });
        return {
          nodeId: nodeIdFromUrl(url),
          url,
          accepted: response.ok || response.status === 409,
          status: response.status,
          message: String(body.message || body.error || response.statusText),
        };
      } catch (error) {
        return {
          nodeId: nodeIdFromUrl(url),
          url,
          accepted: false,
          status: 0,
          message: error instanceof Error ? error.message : "Peer unavailable",
        };
      }
    }),
  );
  return results;
}

let lastSyncAt: string | null = null;
const peerState = new Map<string, { lastSeenAt: string | null; lastError: string | null }>();

async function syncWithPeer(url: string) {
  const nodeId = nodeIdFromUrl(url);
  try {
    const identityResponse = await requestJson(`${url}/api/organizations`, {}, 2500);
    if (!identityResponse.response.ok) throw new Error(`Identity HTTP ${identityResponse.response.status}`);
    const peerOrganizations = Array.isArray(identityResponse.body) ? identityResponse.body : [];
    for (const organization of peerOrganizations) {
      db.prepare(`
        INSERT INTO organizations (id, name, public_key_pem, attestation_status, attestation_method, attestation_statement, attester_name, attester_role, attestation_hash, attestation_signature, attested_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, public_key_pem=excluded.public_key_pem, attestation_status=excluded.attestation_status, attestation_method=excluded.attestation_method, attestation_statement=excluded.attestation_statement, attester_name=excluded.attester_name, attester_role=excluded.attester_role, attestation_hash=excluded.attestation_hash, attestation_signature=excluded.attestation_signature, attested_at=excluded.attested_at
      `).run(
        String(organization.id), String(organization.name), String(organization.publicKeyPem), String(organization.identity?.status || "pending"), organization.identity?.method || null, organization.identity?.statement || null, organization.identity?.attesterName || null, organization.identity?.attesterRole || null, organization.identity?.attestationHash || null, organization.identity?.attestationSignature || null, organization.identity?.attestedAt || null, String(organization.createdAt || now()),
      );
    }
    const { response, body } = await requestJson(`${url}/api/network/records`, {}, 2500);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const peerRecords = Array.isArray(body.records) ? body.records : [];
    let accepted = 0;
    for (const remote of peerRecords) {
      const local = one("SELECT id FROM evidence_records WHERE id = ?", remote.id as string);
      if (local) continue;
      const normalized = {
        ...remote,
        org_id: remote.orgId,
        claim_key: remote.claimKey,
        source_file_name: remote.sourceFileName,
        previous_hash: remote.previousHash,
        record_hash: remote.recordHash,
        version_of: remote.versionOf,
        created_at: remote.submittedAt,
        submitted_at: remote.submittedAt,
      };
      insertVerifiedRecord(normalized, "peer");
      accepted += 1;
    }
    lastSyncAt = now();
    peerState.set(nodeId, { lastSeenAt: lastSyncAt, lastError: null });
    return { nodeId, accepted, available: true, lastSyncAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Peer unavailable";
    peerState.set(nodeId, { lastSeenAt: peerState.get(nodeId)?.lastSeenAt || null, lastError: message });
    return { nodeId, accepted: 0, available: false, message };
  }
}

async function syncWithPeers() {
  const results = await Promise.all(PEERS.map(syncWithPeer));
  if (results.some(result => result.accepted > 0)) {
    logActivity("network_sync", NODE_ID, null, "completed", JSON.stringify(results));
  }
  return results;
}

function nodeSnapshot() {
  const records = allRecords();
  const map = verificationMap();
  const valid = records.filter(record => map.get(String(record.id))?.valid).length;
  return {
    nodeId: NODE_ID,
    name: NODE_NAME,
    port: PORT,
    url: `http://localhost:${PORT}`,
    online: true,
    recordCount: records.length,
    validRecordCount: valid,
    headHash: String(records.at(-1)?.record_hash || origin),
    lastSyncAt,
    nodePublicKeyPem: nodeKeys.publicKey,
  };
}

let server: Server;
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  clearInterval(syncTimer);
  logActivity("node_shutdown", NODE_ID, NODE_ID, "graceful", "Node stopped by live failure demonstration");
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 900);
};

function parseBodyRecord(body: Record<string, unknown>) {
  if (!body.id || !body.orgId || !body.claimKey || !body.title || !body.type || body.payload === undefined || !body.previousHash || !body.recordHash || !body.signature || !body.submittedAt) {
    throw Object.assign(new Error("A complete signed record is required"), { statusCode: 400 });
  }
  return {
    id: String(body.id),
    org_id: String(body.orgId),
    claim_key: String(body.claimKey),
    title: String(body.title),
    type: String(body.type),
    payload: String(body.payload),
    source_file_name: String(body.sourceFileName || ""),
    previous_hash: String(body.previousHash),
    record_hash: String(body.recordHash),
    signature: String(body.signature),
    version_of: body.versionOf ? String(body.versionOf) : null,
    created_at: String(body.submittedAt),
    submitted_at: String(body.submittedAt),
  };
}

function buildBenchmarkChain(length: number, privateKey: string, orgId: string) {
  const chain: StoredRecord[] = [];
  let previousHash = origin;
  for (let index = 0; index < length; index += 1) {
    const record: StoredRecord = {
      id: `benchmark-${length}-${index}`,
      org_id: orgId,
      claim_key: `benchmark.claim.${index}`,
      title: `Benchmark record ${index + 1}`,
      type: "scientific_dataset",
      payload: `${index + 1} unit`,
      source_file_name: "benchmark-wire-measurement",
      previous_hash: previousHash,
      version_of: null,
      submitted_at: new Date(Date.now() + index).toISOString(),
      created_at: new Date(Date.now() + index).toISOString(),
    };
    record.record_hash = recordHash(record);
    record.signature = sign(null, Buffer.from(String(record.record_hash)), privateKey).toString("base64");
    chain.push(record);
    previousHash = String(record.record_hash);
  }
  return chain;
}

function verifyChainForBenchmark(chain: StoredRecord[]) {
  let previous = origin;
  let detected = 0;
  const started = performance.now();
  for (const record of chain) {
    const expected = recordHash(record);
    const hashOk = expected === record.record_hash;
    const linkOk = record.previous_hash === previous;
    const signatureOk = verify(
      null,
      Buffer.from(String(record.record_hash)),
      String(record.public_key_pem),
      Buffer.from(String(record.signature), "base64"),
    );
    if (!hashOk || !linkOk || !signatureOk) detected += 1;
    previous = String(record.record_hash);
  }
  return { detected, elapsedMs: performance.now() - started };
}

async function runBenchmark() {
  const signer = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const benchmarkOrgId = "benchmark-local";
  const sizes = [10, 100, 1000];
  const verificationScaling = sizes.map(length => {
    const chain = buildBenchmarkChain(length, signer.privateKey, benchmarkOrgId);
    for (const record of chain) record.public_key_pem = signer.publicKey;
    const tamperCount = Math.max(1, Math.floor(length / 10));
    for (let index = 0; index < tamperCount; index += 1) {
      const record = chain[index * 10];
      record.payload = `${record.payload} altered`;
    }
    const measured = verifyChainForBenchmark(chain);
    return {
      length,
      tamperedRecords: tamperCount,
      detectedRecords: measured.detected,
      detectionRate: Number(((measured.detected / tamperCount) * 100).toFixed(2)),
      elapsedMs: Number(measured.elapsedMs.toFixed(3)),
      avgMs: Number((measured.elapsedMs / length).toFixed(5)),
    };
  });

  const syncChain = buildBenchmarkChain(100, signer.privateKey, benchmarkOrgId).map(record => ({
    ...record,
    public_key_pem: signer.publicKey,
  }));
  const syncResults = await Promise.all(PEERS.map(async url => {
    const started = performance.now();
    try {
      const { response, body } = await requestJson(`${url}/api/experiment/receive-batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKeyPem: signer.publicKey, records: syncChain.map(record => publicRecord(record)) }),
      }, 10000);
      const elapsedMs = performance.now() - started;
      return {
        nodeId: nodeIdFromUrl(url),
        online: response.ok,
        records: syncChain.length,
        accepted: Number(body.accepted || 0),
        elapsedMs: Number(elapsedMs.toFixed(3)),
        recordsPerSecond: Number((syncChain.length / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
      };
    } catch (error) {
      return {
        nodeId: nodeIdFromUrl(url),
        online: false,
        records: syncChain.length,
        accepted: 0,
        elapsedMs: 0,
        recordsPerSecond: 0,
        error: error instanceof Error ? error.message : "Peer unavailable",
      };
    }
  }));

  const naive = Array.from({ length: 100 }, (_, index) => ({ payload: `${index + 1} unit` }));
  const naiveOriginal = naive.map(item => item.payload);
  const corruptionIndexes = [3, 22, 61, 87, 94];
  corruptionIndexes.forEach(index => { naive[index].payload += " altered"; });
  const naiveDetected = naive.filter((item, index) => item.payload !== naiveOriginal[index]).length;
  logActivity("benchmark_run", NODE_ID, null, "measured", `Verified ${sizes.join(", ")} record chains and sent a 100-record wire batch`);
  return {
    measured: true,
    scope: "Real SHA-256, ECDSA P-256, and HTTP measurements in this running node",
    results: verificationScaling,
    sync: syncResults,
    baseline: {
      records: naive.length,
      corruptedRecords: corruptionIndexes.length,
      detectedRecords: naiveDetected,
      detectionRate: 0,
      note: "Naive storage has no integrity proof; corruption is not detectable by verification.",
    },
  };
}

function signedLocalProof(challenge: string) {
  const records = allRecords();
  const map = verificationMap();
  const proof = {
    challenge,
    nodeId: NODE_ID,
    checkedAt: now(),
    recordCount: records.length,
    headHash: String(records.at(-1)?.record_hash || origin),
    chainValid: records.every(record => map.get(String(record.id))?.valid),
    invalidRecordIds: records.filter(record => !map.get(String(record.id))?.valid).map(record => String(record.id)),
  };
  const proofSignature = sign(null, Buffer.from(JSON.stringify(proof)), nodeKeys.privateKey).toString("base64");
  return { ...proof, nodePublicKeyPem: nodeKeys.publicKey, proofSignature };
}

async function startServer() {
  const app = express();
  server = createServer(app);
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json(nodeSnapshot()));
  app.get("/api/catalog", (_req, res) => res.json({ evidenceTypes: [
    { value: "emissions", label: "Emissions measurement", comparisonMode: "numeric", description: "Numeric quantity with a unit, such as 42.7 tCO2e." },
    { value: "carbon_accounting", label: "Carbon accounting", comparisonMode: "numeric", description: "Numeric accounting value with a compatible unit." },
    { value: "assessment", label: "Environmental assessment", comparisonMode: "numeric", description: "Numeric environmental assessment measurement." },
    { value: "scientific_dataset", label: "Derived scientific dataset", comparisonMode: "numeric", description: "Numeric observation or derived measurement." },
    { value: "compliance_report", label: "Compliance report", comparisonMode: "categorical", description: "Normalized categorical state." },
    { value: "audit", label: "Audit evidence", comparisonMode: "categorical", description: "Normalized categorical or textual result." },
  ], comparisonModes: { numeric: "Symmetric percentage difference", categorical: "Normalized exact match or mismatch" } }));
  app.get("/api/stats", (_req, res) => {
    const records = allRecords();
    const map = verificationMap();
    const validCount = records.filter(record => map.get(String(record.id))?.valid).length;
    const organizations = one("SELECT COUNT(*) AS count FROM organizations")?.count ?? 0;
    const conflicts = one("SELECT COUNT(*) AS count FROM conflicts WHERE status = 'needs_review'")?.count ?? 0;
    const firstBroken = records.find(record => !map.get(String(record.id))?.valid);
    res.json({
      chainHealthPercent: records.length ? Math.round((validCount / records.length) * 100) : 100,
      totalRecords: records.length,
      orgCount: Number(organizations),
      signerIntegrityPercent: records.length
        ? Math.round((records.filter(record => map.get(String(record.id))?.signatureValid).length / records.length) * 100)
        : 100,
      openConflicts: Number(conflicts),
      chainValid: validCount === records.length,
      brokenRecordId: firstBroken?.id || null,
      nodeId: NODE_ID,
      nodeName: NODE_NAME,
      port: PORT,
    });
  });
  app.get("/api/evidence", (_req, res) => res.json(publicRecords().reverse()));
  app.get("/api/evidence/:id/versions", (req, res) => {
    const record = one("SELECT * FROM evidence_records WHERE id = ?", req.params.id);
    if (!record) return res.status(404).json({ error: "Evidence record not found" });
    const map = verificationMap();
    const versions = rows("SELECT * FROM evidence_records WHERE claim_key = ? ORDER BY created_at ASC, id ASC", String(record.claim_key));
    res.json({ claimKey: record.claim_key, versions: versions.map(item => publicRecord(item, map.get(String(item.id)))) });
  });
  app.get("/api/organizations", (_req, res) => res.json(rows(`
    SELECT o.*, COUNT(e.id) AS record_count
    FROM organizations o LEFT JOIN evidence_records e ON e.org_id = o.id
    GROUP BY o.id ORDER BY o.created_at DESC
  `).map(publicOrganization)));
  app.get("/api/conflicts", (_req, res) => {
    const map = verificationMap();
    res.json(rows("SELECT * FROM conflicts ORDER BY created_at DESC").map(conflict => {
      const recordA = one("SELECT * FROM evidence_records WHERE id = ?", conflict.record_a_id as string);
      const recordB = one("SELECT * FROM evidence_records WHERE id = ?", conflict.record_b_id as string);
      return {
        id: conflict.id, claimKey: conflict.claim_key,
        recordA: recordA ? publicRecord(recordA, map.get(String(recordA.id))) : null,
        recordB: recordB ? publicRecord(recordB, map.get(String(recordB.id))) : null,
        comparisonMode: conflict.comparison_mode || "numeric", comparable: Boolean(conflict.comparable), matches: Boolean(conflict.matches),
        variancePercent: conflict.variance_percent === null || conflict.variance_percent === undefined ? null : Number(conflict.variance_percent),
        comparison: JSON.parse(String(conflict.comparison_details || "{}")), status: conflict.status,
        resolutionRecordId: conflict.resolution_record_id || null, resolutionNote: conflict.resolution_note || null, resolvedAt: conflict.resolved_at || null, createdAt: conflict.created_at,
      };
    }));
  });
  app.get("/api/activity", (_req, res) => res.json(rows("SELECT * FROM activity_events ORDER BY created_at DESC LIMIT 200").map(event => ({
    id: event.id,
    kind: event.kind,
    actor: event.actor,
    target: event.target,
    result: event.result,
    details: event.details,
    at: event.created_at,
  }))));
  app.get("/api/verify-local", (req, res) => {
    res.json(signedLocalProof(String(req.query.challenge || randomUUID())));
  });
  app.get("/api/verify-network", async (_req, res) => {
    const challenge = randomUUID();
    const local = signedLocalProof(challenge);
    const peers = await Promise.all(PEERS.map(async url => {
      try {
        const { response, body } = await requestJson(`${url}/api/verify-local?challenge=${encodeURIComponent(challenge)}`, {}, 3000);
        if (!response.ok) return { nodeId: nodeIdFromUrl(url), url, online: false, status: response.status, message: `HTTP ${response.status}` };
        const proof = { challenge: body.challenge, nodeId: body.nodeId, checkedAt: body.checkedAt, recordCount: body.recordCount, headHash: body.headHash, chainValid: body.chainValid, invalidRecordIds: body.invalidRecordIds };
        const signatureValid = Boolean(body.nodePublicKeyPem && body.proofSignature && verify(null, Buffer.from(JSON.stringify(proof)), String(body.nodePublicKeyPem), Buffer.from(String(body.proofSignature), "base64")));
        return { nodeId: String(body.nodeId || nodeIdFromUrl(url)), url, online: true, status: response.status, proof: body, signatureValid };
      } catch (error) {
        return { nodeId: nodeIdFromUrl(url), url, online: false, status: 0, message: error instanceof Error ? error.message : "Peer unavailable" };
      }
    }));
    const nodes = [{ nodeId: NODE_ID, url: `http://localhost:${PORT}`, online: true, proof: local, signatureValid: verify(null, Buffer.from(JSON.stringify({ challenge: local.challenge, nodeId: local.nodeId, checkedAt: local.checkedAt, recordCount: local.recordCount, headHash: local.headHash, chainValid: local.chainValid, invalidRecordIds: local.invalidRecordIds })), nodeKeys.publicKey, Buffer.from(local.proofSignature, "base64")) }, ...peers];
    const reachable = nodes.filter(node => node.online);
    const agree = reachable.length === PEERS.length + 1 && reachable.every(node => node.signatureValid && node.proof?.chainValid) && reachable.every(node => node.proof?.challenge === challenge && node.proof?.recordCount === local.recordCount && node.proof?.headHash === local.headHash);
    logActivity("network_verification", NODE_ID, null, agree ? "valid" : "attention", `Independent signed responses=${reachable.length}/${PEERS.length + 1}; challenge=${challenge}`);
    res.json({ agree, challenge, quorum: { reachable: reachable.length, configured: PEERS.length + 1 }, chainLength: local.recordCount, nodes, local });
  });
  app.get("/api/network/peers", (_req, res) => res.json(PEERS.map(url => ({ nodeId: nodeIdFromUrl(url), url }))));
  app.get("/api/network/records", (_req, res) => res.json({ sourceNodeId: NODE_ID, records: publicRecords() }));
  app.get("/api/network/status", async (_req, res) => {
    const nodes: Record<string, unknown>[] = [nodeSnapshot()];
    for (const url of PEERS) {
      try {
        const { response, body } = await requestJson(`${url}/api/health`, {}, 1500);
        const nodeId = nodeIdFromUrl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const state = peerState.get(nodeId);
        nodes.push({ ...body, url, online: true, lastSeenAt: state?.lastSeenAt || now(), lastError: null });
      } catch (error) {
        const nodeId = nodeIdFromUrl(url);
        const state = peerState.get(nodeId);
        nodes.push({ nodeId, name: nodeId, url, online: false, recordCount: null, validRecordCount: null, headHash: null, lastSeenAt: state?.lastSeenAt || null, lastError: error instanceof Error ? error.message : "offline" });
      }
    }
    res.json({ nodeId: NODE_ID, nodes, lastSyncAt });
  });
  app.post("/api/network/register", (req, res) => {
    const orgId = String(req.body?.id || "");
    const name = String(req.body?.name || "").trim();
    const publicKeyPem = String(req.body?.publicKeyPem || "");
    if (!orgId || !name || !publicKeyPem) return res.status(400).json({ error: "id, name, and publicKeyPem are required" });
    const identity = req.body?.identity || {};
    db.prepare(`
      INSERT INTO organizations (id, name, public_key_pem, attestation_status, attestation_method, attestation_statement, attester_name, attester_role, attestation_hash, attestation_signature, attested_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM organizations WHERE id = ?), ?))
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, public_key_pem=excluded.public_key_pem, attestation_status=excluded.attestation_status, attestation_method=excluded.attestation_method, attestation_statement=excluded.attestation_statement, attester_name=excluded.attester_name, attester_role=excluded.attester_role, attestation_hash=excluded.attestation_hash, attestation_signature=excluded.attestation_signature, attested_at=excluded.attested_at
    `).run(orgId, name, publicKeyPem, String(identity.status || "pending"), identity.method || null, identity.statement || null, identity.attesterName || null, identity.attesterRole || null, identity.attestationHash || null, identity.attestationSignature || null, identity.attestedAt || null, orgId, now());
    logActivity("organization_replicated", NODE_ID, orgId, "accepted", "Identity and attestation received from peer");
    res.status(201).json({ ok: true, nodeId: NODE_ID });
  });
  app.post("/api/network/receive-record", (req, res) => {
    try {
      const record = parseBodyRecord(req.body || {});
      if (!organizationFor(record.org_id)) return res.status(422).json({ error: "Unknown signer organization on this node" });
      const result = insertVerifiedRecord(record, "peer");
      res.status(result.inserted ? 201 : 409).json(result);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 500);
      logActivity("replication_rejected", NODE_ID, String(req.body?.id || "unknown"), "rejected", error instanceof Error ? error.message : "Invalid record");
      res.status(statusCode).json({ error: error instanceof Error ? error.message : "Record rejected", verification: (error as { verification?: Verification }).verification });
    }
  });
  app.post("/api/network/sync", async (_req, res) => {
    const results = await syncWithPeers();
    res.json({ nodeId: NODE_ID, syncedAt: now(), results, records: publicRecords() });
  });
  app.post("/api/network/kill", async (req, res) => {
    const targetNodeId = String(req.body?.nodeId || NODE_ID);
    if (targetNodeId !== NODE_ID) {
      const target = peerForNode(targetNodeId);
      if (!target) return res.status(404).json({ error: `No configured peer for ${targetNodeId}` });
      try {
        await requestJson(`${target}/api/network/kill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nodeId: targetNodeId, internal: true }) }, 1200);
        logActivity("node_shutdown", NODE_ID, targetNodeId, "requested", "Remote node received a graceful shutdown request");
        return res.status(202).json({ ok: true, nodeId: targetNodeId, message: "Shutdown requested" });
      } catch (error) {
        return res.status(502).json({ error: error instanceof Error ? error.message : "Target node unavailable" });
      }
    }
    res.status(202).json({ ok: true, nodeId: NODE_ID, message: "Node shutting down" });
    setTimeout(shutdown, 80);
  });
  app.post("/api/organizations", async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Organization name is required" });
    const keys = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const organization = { id: id(), name, publicKeyPem: keys.publicKey, createdAt: now() };
    try {
      await syncWithPeers();
      db.prepare("INSERT INTO organizations (id, name, public_key_pem, created_at) VALUES (?, ?, ?, ?)").run(organization.id, name, keys.publicKey, organization.createdAt);
      savePrivateKey(organization.id, keys.privateKey);
      const replication = await Promise.all(PEERS.map(async url => {
        try {
          const { response, body } = await requestJson(`${url}/api/network/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: organization.id, name, publicKeyPem: keys.publicKey, identity: { status: "pending", verified: false } }) });
          return { nodeId: nodeIdFromUrl(url), accepted: response.ok, message: String(body.message || body.error || response.statusText) };
        } catch (error) {
          return { nodeId: nodeIdFromUrl(url), accepted: false, message: error instanceof Error ? error.message : "Peer unavailable" };
        }
      }));
      logActivity("organization_registered", NODE_ID, organization.id, "created", `Signer key stored outside SQLite; peers=${JSON.stringify(replication)}`);
      res.status(201).json({ ...publicOrganization({ id: organization.id, name, public_key_pem: keys.publicKey, created_at: organization.createdAt, attestation_status: "pending", record_count: 0 }), replication });
    } catch {
      res.status(409).json({ error: "Organization already exists" });
    }
  });
  app.post("/api/organizations/:id/attest", async (req, res) => {
    const organization = organizationFor(req.params.id);
    if (!organization) return res.status(404).json({ error: "Organization not found" });
    const attesterName = String(req.body?.attesterName || "").trim();
    const attesterRole = String(req.body?.attesterRole || "").trim();
    const statement = String(req.body?.statement || "").trim();
    if (!attesterName || !attesterRole || !statement) return res.status(400).json({ error: "attesterName, attesterRole, and statement are required" });
    const attestedAt = now();
    const attestation = { organizationId: String(organization.id), organizationName: String(organization.name), publicKeyPem: String(organization.public_key_pem), attesterName, attesterRole, statement, attestedAt };
    const attestationHash = sha256(JSON.stringify(attestation));
    const attestationSignature = sign(null, Buffer.from(attestationHash), nodeKeys.privateKey).toString("base64");
    db.prepare("UPDATE organizations SET attestation_status='approved', attestation_method='platform_authority_signature', attestation_statement=?, attester_name=?, attester_role=?, attestation_hash=?, attestation_signature=?, attested_at=? WHERE id=?").run(statement, attesterName, attesterRole, attestationHash, attestationSignature, attestedAt, String(organization.id));
    const updated = organizationFor(String(organization.id))!;
    const replication = await Promise.all(PEERS.map(async url => {
      try {
        const { response, body } = await requestJson(`${url}/api/network/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...updated, id: updated.id, name: updated.name, publicKeyPem: updated.public_key_pem, createdAt: updated.created_at, identity: publicOrganization(updated).identity }) });
        return { nodeId: nodeIdFromUrl(url), accepted: response.ok, message: String(body.message || body.error || response.statusText) };
      } catch (error) { return { nodeId: nodeIdFromUrl(url), accepted: false, message: error instanceof Error ? error.message : "Peer unavailable" }; }
    }));
    logActivity("organization_attested", NODE_ID, String(organization.id), "approved", `Attested by ${attesterName} (${attesterRole})`);
    res.json({ ...publicOrganization(updated), replication, authorityNodeId: NODE_ID, authorityPublicKeyPem: nodeKeys.publicKey });
  });
  app.post("/api/evidence", async (req, res) => {
    const { orgId, title, claimKey, type = "emissions", payload, sourceFileName = "", versionOf = null } = req.body || {};
    if (!orgId || !title || !claimKey || payload === undefined || payload === "") return res.status(400).json({ error: "orgId, title, claimKey, and payload are required" });
    const organization = organizationFor(String(orgId));
    if (!organization) return res.status(404).json({ error: "Signing organization not found" });
    if (String(organization.attestation_status || "pending") !== "approved") return res.status(409).json({ error: "Organization identity must be independently attested before anchoring evidence" });
    let privateKey: string;
    try {
      privateKey = getPrivateKey(String(orgId));
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "Private signing key is unavailable on this node" });
    }
    const previous = allRecords().at(-1);
    const submittedAt = now();
    const record: StoredRecord = {
      id: id(),
      org_id: String(orgId),
      claim_key: String(claimKey),
      title: String(title),
      type: String(type),
      payload: String(payload),
      source_file_name: String(sourceFileName),
      previous_hash: previous?.record_hash ? String(previous.record_hash) : origin,
      version_of: versionOf ? String(versionOf) : null,
      created_at: submittedAt,
      submitted_at: submittedAt,
    };
    record.record_hash = recordHash(record);
    record.signature = sign(null, Buffer.from(String(record.record_hash)), privateKey).toString("base64");
    try {
      insertVerifiedRecord(record, "local");
      const replication = await broadcastRecord(record);
      res.status(201).json({ record: publicRecord(record), replication });
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 500);
      res.status(statusCode).json({ error: error instanceof Error ? error.message : "Could not append record" });
    }
  });
  app.post("/api/evidence/:id/tamper", async (req, res) => {
    const record = one("SELECT * FROM evidence_records WHERE id = ?", req.params.id);
    if (!record) return res.status(404).json({ error: "Evidence record not found" });
    const current = String(record.payload);
    const tamperedPayload = current.length ? `${current.slice(0, -1)}${String.fromCharCode(current.charCodeAt(current.length - 1) ^ 1)}` : "tampered";
    db.prepare("UPDATE evidence_records SET payload = ? WHERE id = ?").run(tamperedPayload, req.params.id);
    logActivity("payload_modified", NODE_ID, req.params.id, "integrity_broken", "Actual payload byte changed; stored hash and signature were not changed");
    const changed = one("SELECT * FROM evidence_records WHERE id = ?", req.params.id)!;
    const replication = await broadcastRecord(changed);
    res.json({ record: publicRecord(changed), verification: verifyStoredRecord(changed), replication });
  });
  app.post("/api/evidence/:id/untamper", (req, res) => {
    const record = one("SELECT * FROM evidence_records WHERE id = ?", req.params.id);
    const backup = one("SELECT original_payload FROM record_backups WHERE record_id = ?", req.params.id);
    if (!record || !backup) return res.status(404).json({ error: "Original payload backup not found" });
    db.prepare("UPDATE evidence_records SET payload = ? WHERE id = ?").run(backup.original_payload as SQLInputValue, req.params.id);
    const restored = one("SELECT * FROM evidence_records WHERE id = ?", req.params.id)!;
    const verification = verifyStoredRecord(restored, allRecords().findIndex(item => item.id === restored.id) > 0 ? String(allRecords()[allRecords().findIndex(item => item.id === restored.id) - 1].record_hash) : origin);
    logActivity("payload_restored", NODE_ID, req.params.id, verification.valid ? "valid" : "invalid", "Original payload restored from local backup");
    res.json({ record: publicRecord(restored, verification), verification });
  });
  app.post("/api/conflicts/:id/resolve", (req, res) => {
    const conflict = one("SELECT * FROM conflicts WHERE id = ?", req.params.id);
    if (!conflict) return res.status(404).json({ error: "Conflict not found" });
    const acceptedRecordId = String(req.body?.acceptedRecordId || conflict.record_b_id);
    if (![String(conflict.record_a_id), String(conflict.record_b_id)].includes(acceptedRecordId)) return res.status(400).json({ error: "acceptedRecordId must reference one preserved conflicting version" });
    const note = String(req.body?.note || "Reviewer selected a preserved version; both versions remain queryable");
    db.prepare("UPDATE conflicts SET status='resolved', resolution_record_id=?, resolution_note=?, resolved_at=? WHERE id=?").run(acceptedRecordId, note, now(), req.params.id);
    logActivity("conflict_resolved", NODE_ID, req.params.id, "resolved", `${note}; preserved versions=${conflict.record_a_id},${conflict.record_b_id}`);
    const map = verificationMap();
    const versions = rows("SELECT * FROM evidence_records WHERE claim_key = ? ORDER BY created_at ASC, id ASC", String(conflict.claim_key)).map(record => publicRecord(record, map.get(String(record.id))));
    const updated = one("SELECT * FROM conflicts WHERE id = ?", req.params.id)!;
    res.json({ ok: true, selectedVersionId: acceptedRecordId, conflict: { id: updated.id, claimKey: updated.claim_key, comparisonMode: updated.comparison_mode, comparable: Boolean(updated.comparable), matches: Boolean(updated.matches), variancePercent: updated.variance_percent === null ? null : Number(updated.variance_percent), comparison: JSON.parse(String(updated.comparison_details || "{}")), status: updated.status, resolutionRecordId: updated.resolution_record_id, resolutionNote: updated.resolution_note, resolvedAt: updated.resolved_at, createdAt: updated.created_at }, versions });
  });
  app.post("/api/judge-demo", async (_req, res) => {
    const suffix = Date.now().toString(36);
    const name = `Demo verifier ${suffix}`;
    const claimKey = `demo.emissions.${suffix}`;
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const organization = { id: id(), name, publicKeyPem: keys.publicKey, createdAt: now() };
    try {
      db.prepare("INSERT INTO organizations (id, name, public_key_pem, created_at) VALUES (?, ?, ?, ?)").run(organization.id, name, keys.publicKey, organization.createdAt);
      savePrivateKey(organization.id, keys.privateKey);
      const identity = { status: "pending", verified: false };
      await Promise.all(PEERS.map(async url => requestJson(`${url}/api/network/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: organization.id, name, publicKeyPem: keys.publicKey, identity }) })));
      const attestedAt = now();
      const attestation = { organizationId: organization.id, organizationName: name, publicKeyPem: keys.publicKey, attesterName: "EcoProof demo authority", attesterRole: "Independent verifier", statement: "This generated demo identity is approved for the judge walkthrough.", attestedAt };
      const attestationHash = sha256(JSON.stringify(attestation));
      const attestationSignature = sign(null, Buffer.from(attestationHash), nodeKeys.privateKey).toString("base64");
      db.prepare("UPDATE organizations SET attestation_status='approved', attestation_method='platform_authority_signature', attestation_statement=?, attester_name=?, attester_role=?, attestation_hash=?, attestation_signature=?, attested_at=? WHERE id=?").run(attestation.statement, attestation.attesterName, attestation.attesterRole, attestationHash, attestationSignature, attestedAt, organization.id);
      const approved = organizationFor(organization.id)!;
      await Promise.all(PEERS.map(async url => requestJson(`${url}/api/network/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: approved.id, name: approved.name, publicKeyPem: approved.public_key_pem, createdAt: approved.created_at, identity: publicOrganization(approved).identity }) })));
      const append = async (payload: string, title: string, versionOf: string | null) => {
        const previous = allRecords().at(-1);
        const submittedAt = now();
        const record: StoredRecord = { id: id(), org_id: organization.id, claim_key: claimKey, title, type: "emissions", payload, source_file_name: "live-demo-generated", previous_hash: previous?.record_hash ? String(previous.record_hash) : origin, version_of: versionOf, created_at: submittedAt, submitted_at: submittedAt };
        record.record_hash = recordHash(record); record.signature = sign(null, Buffer.from(String(record.record_hash)), keys.privateKey).toString("base64");
        insertVerifiedRecord(record, "local"); await broadcastRecord(record); return record;
      };
      const baseline = await append("42.0 tCO2e", "Demo baseline measurement", null);
      const correction = await append("46.0 tCO2e", "Demo corrected measurement", String(baseline.id));
      const conflict = one("SELECT * FROM conflicts WHERE claim_key = ? ORDER BY created_at DESC LIMIT 1", claimKey);
      if (conflict) db.prepare("UPDATE conflicts SET status='resolved', resolution_record_id=?, resolution_note=?, resolved_at=? WHERE id=?").run(String(correction.id), "Demo correction selected; baseline remains queryable.", now(), String(conflict.id));
      logActivity("judge_demo_completed", NODE_ID, organization.id, "measured", `Generated identity, attestation, two versions, conflict, and resolution for ${claimKey}`);
      const network = await requestJson(`http://localhost:${PORT}/api/verify-network`, {}, 5000);
      res.status(201).json({ organization: publicOrganization(organizationFor(organization.id)!), baseline: publicRecord(baseline), correction: publicRecord(correction), conflictId: conflict?.id || null, network: network.body });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Judge demo failed" });
    }
  });
  app.get("/api/experiment/benchmark", async (_req, res) => {
    try {
      res.json(await runBenchmark());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Benchmark failed" });
    }
  });
  app.post("/api/experiment/receive-batch", (req, res) => {
    const incoming = Array.isArray(req.body?.records) ? req.body.records : [];
    let accepted = 0;
    let previous = origin;
    for (const item of incoming) {
      const record = parseBodyRecord(item);
      const normalized = { ...record, public_key_pem: String(req.body?.publicKeyPem || item.publicKeyPem || "") };
      const expected = recordHash(normalized);
      const signatureValid = Boolean(normalized.public_key_pem && verify(null, Buffer.from(record.record_hash), normalized.public_key_pem, Buffer.from(record.signature, "base64")));
      if (expected !== record.record_hash || record.previous_hash !== previous || !signatureValid) return res.status(422).json({ error: "Batch record rejected", accepted });
      accepted += 1;
      previous = record.record_hash;
    }
    res.json({ accepted, records: incoming.length, verified: accepted === incoming.length });
  });

  const staticPath = path.resolve(__dirname, "..", "..", "dist", "frontend");
  app.use(express.static(staticPath));
  app.get("*", (_req: Request, res: Response) => res.sendFile(path.join(staticPath, "index.html")));

  server.listen(PORT, () => {
    console.log(`[${NODE_ID}] listening on http://localhost:${PORT}`);
    console.log(`[${NODE_ID}] database: ${DB_PATH}`);
    console.log(`[${NODE_ID}] peers: ${PEERS.join(", ") || "none"}`);
    void syncWithPeers();
  });
}

const syncTimer = setInterval(() => { void syncWithPeers(); }, 5000);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
