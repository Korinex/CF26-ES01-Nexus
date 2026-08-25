import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Clipboard,
  Database,
  GitBranch,
  KeyRound,
  Leaf,
  Network,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, contracts } from "../lib/ecoproof-api";

type Screen = "overview" | "lineage" | "anchor" | "network" | "proof" | "activity";
type Verification = {
  valid: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  chainLinkValid: boolean;
  expectedHash: string;
  actualHash: string;
  reason: string;
};
type Stats = {
  chainHealthPercent: number;
  totalRecords: number;
  orgCount: number;
  signerIntegrityPercent: number;
  openConflicts: number;
  chainValid: boolean;
  brokenRecordId?: string | null;
  nodeId: string;
  nodeName: string;
  port: number;
};
type RecordT = {
  id: string;
  orgId: string;
  claimKey: string;
  title: string;
  type: string;
  payload: string;
  sourceFileName?: string;
  previousHash: string;
  recordHash: string;
  signature: string;
  versionOf?: string | null;
  submittedAt: string;
  verification: Verification;
};
type Org = { id: string; name: string; publicKeyPem: string; createdAt: string; recordCount: number; identity: { status: string; verified: boolean; method?: string; statement?: string; attesterName?: string; attesterRole?: string; attestationHash?: string; attestedAt?: string } };
type Conflict = { id: string; claimKey: string; recordA: RecordT; recordB: RecordT; comparisonMode: string; comparable: boolean; matches: boolean; variancePercent: number | null; comparison: { explanation?: string }; status: string; resolutionRecordId?: string | null; createdAt: string };
type CatalogEntry = { value: string; label: string; comparisonMode: string; description: string };
type NodeState = {
  nodeId: string;
  name: string;
  port?: number;
  url: string;
  online: boolean;
  recordCount: number | null;
  validRecordCount: number | null;
  headHash: string | null;
  lastSeenAt?: string | null;
  lastError?: string | null;
};
type ActivityEvent = { id: string; kind: string; actor: string; target?: string | null; result: string; details?: string; at: string };

const short = (value?: string | null, length = 14) => value ? value.length > length ? `${value.slice(0, length)}…${value.slice(-6)}` : value : "—";
const when = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const relative = (value?: string | null) => value ? `${Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))}s ago` : "never";

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return <div className={`reveal ${className}`} style={{ animationDelay: `${delay}s` }}>{children}</div>;
}
function Glass({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`glass ${className}`}><div className="glass-inner">{children}</div></section>;
}
function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div>; }
function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return <button className="copy" title="Copy identifier" onClick={() => { navigator.clipboard?.writeText(value); setDone(true); toast.success("Copied"); window.setTimeout(() => setDone(false), 1000); }}>{done ? <Check size={12} /> : <Clipboard size={12} />}</button>;
}
function StatusDot({ online, valid = true }: { online: boolean; valid?: boolean }) { return <i className={`status-dot ${online && valid ? "good" : "bad"}`} />; }

export default function Home() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [records, setRecords] = useState<RecordT[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [benchmark, setBenchmark] = useState<any>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [proofRecord, setProofRecord] = useState<RecordT | null>(null);
  const [proofVersions, setProofVersions] = useState<RecordT[]>([]);
  const [networkProof, setNetworkProof] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [attesterName, setAttesterName] = useState("");
  const [attesterRole, setAttesterRole] = useState("");
  const [attestationStatement, setAttestationStatement] = useState("");
  const [boot, setBoot] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ orgId: "", title: "", claimKey: "", type: "emissions", payload: "", sourceFileName: "", versionOf: "" });

  const refresh = async (silent = false) => {
    try {
      const [nextStats, nextOrgs, nextRecords, nextConflicts, network, nextActivity, catalogResponse] = await Promise.all([
        api<Stats>(contracts.stats),
        api<Org[]>(contracts.organizations),
        api<RecordT[]>(contracts.evidence),
        api<Conflict[]>(contracts.conflicts),
        api<{ nodes: NodeState[] }>(contracts.networkStatus),
        api<ActivityEvent[]>(contracts.activity),
        api<{ evidenceTypes: CatalogEntry[] }>(contracts.catalog),
      ]);
      setStats(nextStats); setOrgs(nextOrgs); setRecords(nextRecords); setConflicts(nextConflicts); setNodes(network.nodes); setActivities(nextActivity); setCatalog(catalogResponse.evidenceTypes);
      if (!form.orgId && nextOrgs[0]) setForm(current => ({ ...current, orgId: nextOrgs[0].id }));
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "The node API is unavailable");
    }
  };
  useEffect(() => { void refresh(); const timeout = window.setTimeout(() => setBoot(false), 550); const interval = window.setInterval(() => void refresh(true), 3000); return () => { clearTimeout(timeout); clearInterval(interval); }; }, []);

  const go = (next: Screen) => setScreen(next);
  const selectedRecord = records.find(record => record.id === selected) || records[0];
  const chronological = useMemo(() => records.slice().reverse(), [records]);
  const onlinePeers = nodes.filter(node => node.online && node.nodeId !== stats?.nodeId).length;

  const submitEvidence = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy("anchor");
    try {
      const result = await api<{ record: RecordT; replication: { nodeId: string; accepted: boolean; message: string }[] }>(contracts.evidence, { method: "POST", body: JSON.stringify(form) });
      setSelected(result.record.id); toast.success(`Anchored and sent to ${result.replication.filter(item => item.accepted).length} peer(s)`); setForm(current => ({ ...current, title: "", claimKey: "", payload: "", sourceFileName: "", versionOf: "" })); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not anchor record"); }
    finally { setBusy(null); }
  };
  const submitOrg = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgName.trim()) return; setBusy("org");
    try { const result = await api<Org>(contracts.organizations, { method: "POST", body: JSON.stringify({ name: orgName }) }); setOrgName(""); setForm(current => ({ ...current, orgId: result.id })); toast.success("Organization key created and public key replicated"); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not register organization"); }
    finally { setBusy(null); }
  };
  const attestOrganization = async (organization: Org) => {
    if (!attesterName.trim() || !attesterRole.trim() || !attestationStatement.trim()) {
      toast.error("Enter the attester name, role, and attestation statement first");
      return;
    }
    setBusy(`attest-${organization.id}`);
    try {
      await api(contracts.attest(organization.id), { method: "POST", body: JSON.stringify({ attesterName, attesterRole, statement: attestationStatement }) });
      setAttesterName(""); setAttesterRole(""); setAttestationStatement("");
      toast.success(`${organization.name} is now independently attested`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not attest organization"); }
    finally { setBusy(null); }
  };
  const tamper = async (record: RecordT) => {
    const restore = !record.verification.valid && record.verification.expectedHash !== record.verification.actualHash;
    setBusy(record.id);
    try {
      const action = restore ? "untamper" : "tamper";
      await api(contracts.evidenceAction(record.id, action), { method: "POST" });
      toast.success(restore ? "Original payload restored; hash verifies again" : "Payload byte changed; peers rejected the modified signed record"); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Integrity action failed"); }
    finally { setBusy(null); }
  };
  const sync = async () => { setBusy("sync"); try { const result = await api<{ results: { nodeId: string; accepted: number; available: boolean }[] }>(contracts.sync, { method: "POST" }); toast.success(`Sync completed with ${result.results.filter(item => item.available).length} available peer(s)`); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Sync failed"); } finally { setBusy(null); } };
  const stopNode = async (nodeId: string) => { setBusy(nodeId); try { await api(contracts.killNode, { method: "POST", body: JSON.stringify({ nodeId }) }); toast.success(`${nodeId} shutdown requested; restart it from its terminal`); window.setTimeout(() => void refresh(), 800); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not request shutdown"); } finally { setBusy(null); } };
  const runBenchmark = async () => { setBusy("benchmark"); try { const result = await api(contracts.benchmark); setBenchmark(result); toast.success("Measured cryptographic and HTTP experiments complete"); } catch (error) { toast.error(error instanceof Error ? error.message : "Benchmark failed"); } finally { setBusy(null); } };
  const openProof = async (record: RecordT) => { setBusy("proof"); try { const [versionResponse, networkResponse] = await Promise.all([api<{ versions: RecordT[] }>(contracts.versions(record.id)), api(contracts.verifyNetwork)]); setProofRecord(record); setProofVersions(versionResponse.versions); setNetworkProof(networkResponse); setScreen("proof"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load proof"); } finally { setBusy(null); } };
  const runJudgeDemo = async () => { setBusy("judge-demo"); try { const result = await api<{ correction: RecordT; network: any }>(contracts.judgeDemo, { method: "POST" }); const versions = await api<{ versions: RecordT[] }>(contracts.versions(result.correction.id)); setProofRecord(result.correction); setProofVersions(versions.versions); setNetworkProof(result.network); setScreen("proof"); toast.success("Live judge journey complete: identity, attestation, conflict, resolution, and quorum proof"); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Judge demo failed"); } finally { setBusy(null); } };
  const resolveConflict = async (id: string) => { try { await api(contracts.resolveConflict(id), { method: "POST", body: JSON.stringify({ note: "Reviewer selected the correction; both signed versions remain queryable." }) }); toast.success("Conflict resolved"); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not resolve conflict"); } };

  if (boot) return <div className="boot"><div className="boot-symbol"><Leaf size={30} /></div><div className="boot-line"><span /></div><small>OPENING LIVE PROVENANCE NETWORK</small></div>;
  const healthTone = stats?.chainValid ? "good" : "bad";

  return <div className={`experience ${railCollapsed ? "rail-is-collapsed" : ""}`}>
    <div className="grain" />
    <aside className={`proof-rail-nav ${railCollapsed ? "collapsed" : ""}`}>
      <button className="rail-toggle" onClick={() => setRailCollapsed(value => !value)} aria-label="Toggle navigation"><ChevronRight size={14} /></button>
      <button className="rail-brand" onClick={() => go("overview")}><span className="rail-logo"><Leaf size={18} /></span><span className="rail-brand-copy"><strong>ECOPROOF</strong><small>PROVENANCE NETWORK</small></span></button>
      <div className="rail-rule" />
      {([ ["overview", Activity, "Overview"], ["lineage", GitBranch, "Evidence lineage"], ["anchor", Upload, "Anchor evidence"], ["network", Network, "Network verify"], ["proof", ShieldCheck, "Proof inspector"], ["activity", Activity, "Activity log"] ] as const).map(([id, Icon, label]) => <button key={id} className={screen === id ? "active" : ""} onClick={() => go(id)}><Icon size={15} /><span>{label}</span></button>)}
      <div className="rail-bottom"><span className="rail-live" /><span className="rail-caption">LIVE<br />PROOF</span></div>
    </aside>
    <header className="nav"><button className="logo" onClick={() => go("overview")}><span className="logo-mark"><Leaf size={17} /></span><span>ECOPROOF</span></button><div className="nav-right"><span className="live"><i />{stats ? `${stats.nodeId} · :${stats.port}` : "CONNECTING"}</span><button className="nav-refresh" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw size={14} /></button></div></header>
    <main id="top">
      {screen === "overview" && <>
        <section className="hero wrap"><Reveal><div className="hero-kicker"><span className="orb" />DECENTRALIZED ENVIRONMENTAL DATA PROVENANCE</div><div className="hero-proof"><span><b>{stats?.chainHealthPercent ?? "—"}%</b><small>chain health</small></span><i /><span><b>{stats?.signerIntegrityPercent ?? "—"}%</b><small>signer integrity</small></span><i /><span><b>{stats?.totalRecords ?? "—"}</b><small>records anchored</small></span></div><h1>Make every<br /><em>claim inspectable.</em></h1><p className="hero-copy">EcoProof binds source payloads to a signed hash chain and replicates each accepted record across independent HTTP nodes.</p><div className="hero-actions"><button className="button light" onClick={() => go("network")}>Open live network <ArrowDownRight size={16} /></button><button className="button ghost" onClick={() => go("anchor")}>Anchor evidence <ArrowUpRight size={15} /></button><button className="button ghost" onClick={() => void runJudgeDemo()} disabled={busy === "judge-demo"}>{busy === "judge-demo" ? "Running live proof…" : "Run judge proof"} <ShieldCheck size={14} /></button></div></Reveal><Reveal delay={.2} className="hero-side"><div className="orbit"><div className="orbit-core"><span>{onlinePeers + 1}<small>/3</small></span><label>NODES REACHABLE</label></div><i className="orbit-dot d1" /><i className="orbit-dot d2" /><i className="orbit-dot d3" /></div><div className="hero-side-note"><span className="mono">SHA-256</span><span>+</span><span className="mono">ECDSA P-256</span></div></Reveal></section>
        <section className="wrap proof-grid"><Glass className="manifesto"><Eyebrow>THE PROOF LAYER</Eyebrow><h2>Evidence is only<br /><span>as strong as its history.</span></h2><p>Every accepted record carries a canonical hash, a signer signature, and a link to the prior record. A verifier recomputes the proof from the current bytes; there is no integrity-status field to trust.</p><button className="inline-link" onClick={() => go("lineage")}>Inspect the chain <ChevronRight size={14} /></button></Glass><Glass className="stat-stage"><div className="stage-top"><Eyebrow>SYSTEM PULSE · {stats?.nodeId}</Eyebrow><span className={`verified ${healthTone}`}><StatusDot online={true} valid={stats?.chainValid ?? true} /> {stats?.chainValid ? "ALL PROOFS VALID" : "INTEGRITY ATTENTION"}</span></div><div className="stat-number">{stats?.totalRecords ?? "—"}<small>evidence records on this node</small></div><div className="stage-bottom"><span><strong>{stats?.orgCount ?? "—"}</strong> signers</span><span><strong>{stats?.openConflicts ?? "—"}</strong> open conflicts</span><span className="timestamp">last peer sync {relative(nodes.find(node => node.nodeId === stats?.nodeId)?.lastSeenAt)}</span></div></Glass><Glass className="proof-slip"><Eyebrow>LIVE NODE QUORUM</Eyebrow><div className="slip-number">{onlinePeers + 1}<small>/3</small></div><strong>{onlinePeers === 2 ? "Three-node path available" : "Partial network"}</strong><p>{onlinePeers} configured peer{onlinePeers === 1 ? " is" : "s are"} reachable from {stats?.nodeId || "this node"} right now.</p><div className="slip-foot"><ShieldCheck size={14} /> HTTP REPLICATION / LOCAL SQLITE</div></Glass></section>
        <section className="wrap lower-grid"><Glass className="network-card"><div className="section-intro compact"><div><Eyebrow>01 / LIVE TOPOLOGY</Eyebrow><h2>Independent nodes.</h2></div><Network size={21} /></div><div className="node-list overview-nodes">{nodes.map(node => <div className="node-line" key={node.nodeId}><StatusDot online={node.online} /><strong>{node.nodeId}</strong><small>:{node.port ?? "—"} · {node.online ? `${node.recordCount ?? 0} records` : "offline"}</small><em className={node.online ? "online-label" : "offline-label"}>{node.online ? "ONLINE" : "OFFLINE"}</em></div>)}</div><button className="inline-link" onClick={() => go("network")}>Operate network <ChevronRight size={14} /></button></Glass><Glass className="lab-card"><div className="section-intro compact"><div><Eyebrow>02 / EXPERIMENTAL LAB</Eyebrow><h2>Measure the proof.</h2></div><BarChart3 size={21} /></div><p>Run SHA-256, ECDSA, corruption detection, baseline, and real HTTP batch measurements against the running nodes.</p><button className="button light mini" onClick={() => void runBenchmark()} disabled={busy === "benchmark"}><Zap size={14} />{busy === "benchmark" ? "Measuring…" : "Run measurements"}</button>{benchmark && <div className="benchmark-summary"><b>{benchmark.results?.[benchmark.results.length - 1]?.detectionRate ?? 0}%</b><span>cryptographic detection rate</span></div>}</Glass></section>
        <section className="wrap org-conflict-grid"><Glass className="orgs-card"><div className="section-intro compact"><div><Eyebrow>03 / SIGNER REGISTRY</Eyebrow><h2>Known identities.</h2></div><Users size={20} /></div><form className="org-form" onSubmit={submitOrg}><input value={orgName} onChange={event => setOrgName(event.target.value)} placeholder="Register organization" /><button className="button light mini" disabled={busy === "org"}>{busy === "org" ? "…" : "Register"}</button></form>{orgs.slice(0, 4).map(org => <div className="org-line" key={org.id}><span><KeyRound size={13} /></span><div><strong>{org.name}</strong><small>{org.recordCount} record{org.recordCount === 1 ? "" : "s"} · {org.identity.verified ? `ATTESTED · ${org.identity.attesterName}` : "PENDING ATTESTATION"}</small></div><Copy value={org.publicKeyPem} />{!org.identity.verified && <button className="button ghost mini" onClick={() => void attestOrganization(org)} disabled={busy === `attest-${org.id}`}>{busy === `attest-${org.id}` ? "…" : "Attest"}</button>}</div>)}{orgs.some(org => !org.identity.verified) && <div className="attestation-form"><small className="muted">Independent attestation is signed by this verifier node and replicated to peers.</small><input value={attesterName} onChange={event => setAttesterName(event.target.value)} placeholder="Attester name" /><input value={attesterRole} onChange={event => setAttesterRole(event.target.value)} placeholder="Attester role" /><textarea rows={2} value={attestationStatement} onChange={event => setAttestationStatement(event.target.value)} placeholder="I verified this organization’s identity and public key." /></div>}{!orgs.length && <p className="muted">Register the first signer to create a P-256 key pair stored outside SQLite.</p>}</Glass><Glass className="conflicts-card"><div className="section-intro compact"><div><Eyebrow>04 / REVIEW QUEUE</Eyebrow><h2>Conflicts stay visible.</h2></div><TriangleAlert size={20} /></div>{conflicts.slice(0, 4).map(conflict => <div className="conflict-line" key={conflict.id}><div><strong>{conflict.claimKey}</strong><small>{short(conflict.recordA?.payload, 20)} vs {short(conflict.recordB?.payload, 20)} · {conflict.comparisonMode}{conflict.comparison?.explanation ? ` · ${conflict.comparison.explanation}` : ""}</small></div><b>{conflict.variancePercent === null ? "N/A" : `${conflict.variancePercent}%`}</b>{conflict.status === "needs_review" ? <button onClick={() => void resolveConflict(conflict.id)}>Resolve</button> : <span className="resolved-label">RESOLVED</span>}</div>)}{!conflicts.length && <p className="muted">No conflicting payloads are waiting for review.</p>}</Glass></section>
      </>}

      {screen === "lineage" && <><section className="wrap lineage-section"><div className="section-intro"><div><Eyebrow>05 / PROVENANCE GRAPH</Eyebrow><h2>Follow the signal.</h2></div><p>Records below are ordered from origin to newest. Select one to inspect its real recomputed proof.</p></div><Glass className="chain-card"><div className="chain-caption"><span>LIVE CHAIN · {stats?.nodeId}</span><span className="mono">{chronological.length ? `${chronological.length} LINKED RECORDS` : "ORIGIN READY"}</span></div><div className="chain-visual chain-scroll"><div className="chain-node origin"><span className="node-icon"><Database size={18} /></span><div><small>CHAIN ORIGIN</small><strong>ORIGIN</strong><p>First accepted predecessor</p></div></div>{chronological.map(record => <div className="chain-pair" key={record.id}><div className="connector"><i /><span>previousHash</span></div><button className={`chain-node hash ${record.verification.valid ? "" : "fractured"}`} onClick={() => setSelected(record.id)}><span className="node-icon">{record.verification.valid ? <GitBranch size={18} /> : <TriangleAlert size={18} />}</span><div><small>{record.verification.valid ? "VERIFIED RECORD" : "INTEGRITY FAILURE"}</small><strong>{short(record.recordHash, 12)}</strong><p>{record.title}</p></div></button></div>)}</div><div className="chain-footer"><span><i className="legend-dot origin-dot" />Origin</span><span><i className="legend-dot" />Hash verified</span><span><i className="legend-dot red-dot" />Recomputed proof failed</span><span className="chain-api">{selectedRecord ? <><span className="mono">{when(selectedRecord.submittedAt)}</span> <Copy value={selectedRecord.recordHash} /></> : "No records in API"}</span></div></Glass></section><section className="wrap split-section"><div className="records-column"><div className="section-intro compact"><div><Eyebrow>06 / EVIDENCE FEED</Eyebrow><h2>What the chain remembers.</h2></div><span className="record-count">{records.length} records</span></div><div className="record-stack">{records.map(record => <button key={record.id} className={`record-card ${selected === record.id ? "selected" : ""} ${record.verification.valid ? "" : "tampered"}`} onClick={() => setSelected(record.id)}><span className="record-index">{String(records.length - records.indexOf(record)).padStart(2, "0")}</span><span className="record-state">{record.verification.valid ? <Check size={13} /> : <TriangleAlert size={13} />}</span><span className="record-info"><strong>{record.title}</strong><small>{record.type} · {when(record.submittedAt)}</small><code>{short(record.recordHash, 24)}</code></span><span className="record-action"><span className="proof-link" role="button" tabIndex={0} title="Inspect proof" onClick={event => { event.stopPropagation(); void openProof(record); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void openProof(record); } }}><ShieldCheck size={14} /></span><ArrowUpRight size={16} /></span></button>)}{!records.length && <div className="empty-state"><GitBranch size={22} /><strong>Origin is ready.</strong><span>Anchor the first record from the evidence form.</span></div>}</div></div><Glass className="inspect-card evidence-slip"><Eyebrow>INSPECTED RECORD</Eyebrow>{selectedRecord ? <><div className="inspect-title">{selectedRecord.title}</div><div className="inspect-lines"><div><span>CLAIM KEY</span><b>{selectedRecord.claimKey}</b></div><div><span>PAYLOAD</span><b>{selectedRecord.payload}</b></div><div><span>SOURCE FILE</span><b>{selectedRecord.sourceFileName || "Payload reference"}</b></div><div><span>SIGNER</span><b>{short(selectedRecord.orgId)}</b></div><div><span>PREVIOUS HASH</span><b className="mono">{short(selectedRecord.previousHash)}</b></div></div><div className={`verification-box ${selectedRecord.verification.valid ? "valid" : "invalid"}`}><strong>{selectedRecord.verification.valid ? "VALID PROOF" : "PROOF FAILED"}</strong><span>{selectedRecord.verification.reason}</span>{!selectedRecord.verification.valid && <><small>Expected hash <code>{short(selectedRecord.verification.expectedHash, 25)}</code></small><small>Stored hash <code>{short(selectedRecord.verification.actualHash, 25)}</code></small></>}</div><div className="inspect-actions"><button className="button mini fracture-btn" onClick={() => void tamper(selectedRecord)} disabled={busy === selectedRecord.id}>{busy === selectedRecord.id ? "Working…" : selectedRecord.verification.valid ? "Change payload byte" : "Restore original payload"}</button><Copy value={selectedRecord.recordHash} /></div></> : <div className="empty-state"><ShieldCheck size={22} /><strong>Select an evidence node.</strong><span>Recomputed hashes and signatures will appear here.</span></div>}</Glass></section></>}

      {screen === "anchor" && <section className="wrap anchor-section"><div className="section-intro"><div><Eyebrow>07 / ANCHOR EVIDENCE</Eyebrow><h2>Put a claim on record.</h2></div><p>The node canonicalizes the payload, links the previous hash, signs the digest, stores the record, and sends it to its configured peers.</p></div><Glass className="anchor-card"><form onSubmit={submitEvidence}><div className="form-heading"><Upload size={15} /> SIGNED RECORD CREATION</div><label>Organization<select required value={form.orgId} onChange={event => setForm({ ...form, orgId: event.target.value })}><option value="">Select signer</option>{orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><div className="form-two"><label>Claim title<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="FY25 Scope 1 emissions" /></label><label>Claim key<input required value={form.claimKey} onChange={event => setForm({ ...form, claimKey: event.target.value })} placeholder="emissions.scope1.fy25" /></label></div><div className="form-two"><label>Evidence type<select required value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="">Select evidence type</option>{catalog.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select>{catalog.find(entry => entry.value === form.type) && <small className="field-hint">{catalog.find(entry => entry.value === form.type)?.description}</small>}</label><label>Source filename<input value={form.sourceFileName} onChange={event => setForm({ ...form, sourceFileName: event.target.value })} placeholder="scope1-fy25.csv" /></label></div><label>Source payload<textarea required rows={5} value={form.payload} onChange={event => setForm({ ...form, payload: event.target.value })} placeholder="42.7 tCO2e" /></label><label>Version of (optional)<input value={form.versionOf} onChange={event => setForm({ ...form, versionOf: event.target.value })} placeholder="Prior record ID" /></label><button className="button light submit" disabled={busy === "anchor"}>{busy === "anchor" ? "Signing and replicating…" : "Hash, sign & replicate"}<ArrowUpRight size={15} /></button></form><div className="anchor-aside"><div className="aside-orbit"><ShieldCheck size={18} /></div><h3>Trust is a<br /><em>traceable action.</em></h3><p>Only the digest, metadata, and signature are replicated. Large source datasets can remain off-chain while the evidence reference stays inspectable.</p><div className="aside-proof"><span>CHAIN LINK</span><b>{records[0]?.recordHash ? short(records[0].recordHash) : "ORIGIN"}</b></div></div></Glass></section>}

      {screen === "network" && <><section className="wrap network-page"><div className="section-intro"><div><Eyebrow>08 / NETWORK OPERATIONS</Eyebrow><h2>Three nodes. One trail.</h2></div><p>These are actual HTTP processes with separate SQLite files. Every inbound record is checked before append; unavailable peers remain unavailable until restarted.</p></div><Glass className="network-ops-card"><div className="network-ops-head"><div><span className={`consensus-label ${stats?.chainValid && nodes.filter(node => node.online).every(node => node.recordCount === stats?.totalRecords) ? "good" : "bad"}`}>{stats?.chainValid && nodes.filter(node => node.online).every(node => node.recordCount === stats?.totalRecords) ? "AGREE" : "DISAGREE"}</span><p>{nodes.filter(node => node.online).length}/3 processes reachable · local chain {stats?.totalRecords ?? 0} records</p></div><div className="network-actions"><button className="button light mini" onClick={() => void sync()} disabled={busy === "sync"}><RefreshCw size={14} />{busy === "sync" ? "Syncing…" : "Sync peers"}</button></div></div><div className="node-grid">{nodes.map(node => <div className={`node-card ${node.online ? "online" : "offline"}`} key={node.nodeId}><div className="node-card-top"><StatusDot online={node.online} /><strong>{node.nodeId}</strong><span>{node.port ? `:${node.port}` : "—"}</span></div><div className="node-card-count">{node.online ? node.recordCount : "—"}<small>records</small></div><div className="node-card-meta"><span>head <code>{short(node.headHash, 18)}</code></span><span>{node.online ? `seen ${relative(node.lastSeenAt)}` : node.lastError || "No heartbeat"}</span></div>{node.nodeId !== stats?.nodeId && node.online && <button className="button ghost mini danger-button" onClick={() => void stopNode(node.nodeId)} disabled={busy === node.nodeId}>{busy === node.nodeId ? "Stopping…" : `Stop ${node.nodeId}`}</button>}{node.nodeId !== stats?.nodeId && !node.online && <small className="restart-hint">Restart from its terminal, then click Sync peers.</small>}</div>)}</div><div className="demo-command"><span>LIVE DEMO COMMANDS</span><code>npm run demo</code><small>or start node-1, node-2, and node-3 with the commands in DEMO.md</small></div></Glass></section><section className="wrap lower-grid"><Glass className="lab-card"><div className="section-intro compact"><div><Eyebrow>09 / MEASURED EXPERIMENTS</Eyebrow><h2>Evidence, not theater.</h2></div><BarChart3 size={21} /></div><p>Measurements use real Node.js crypto and HTTP calls. The verification scaling chart uses chains of 10, 100, and 1,000 records; sync uses a 100-record signed batch.</p><button className="button light mini" onClick={() => void runBenchmark()} disabled={busy === "benchmark"}><Zap size={14} />{busy === "benchmark" ? "Measuring…" : "Run measurements"}</button>{benchmark?.results && <div className="bars">{benchmark.results.map((item: any) => <div className="bar" key={item.length}><span>{item.length} records</span><i style={{ width: `${Math.max(8, item.elapsedMs / Math.max(...benchmark.results.map((entry: any) => entry.elapsedMs), 1) * 100)}%` }} /><b>{item.elapsedMs}ms · {item.detectionRate}%</b></div>)}</div>}</Glass><Glass className="lab-card"><div className="section-intro compact"><div><Eyebrow>10 / BASELINE</Eyebrow><h2>Proof changes the outcome.</h2></div><ShieldCheck size={21} /></div>{benchmark?.baseline ? <><div className="baseline-row"><span>Naive storage</span><b>{benchmark.baseline.detectionRate}%</b><small>detectable corruption</small></div><div className="baseline-row proof"><span>EcoProof verification</span><b>{benchmark.results?.[benchmark.results.length - 1]?.detectionRate ?? 0}%</b><small>tampering detected</small></div><p className="muted">{benchmark.baseline.note}</p></> : <p className="muted">Run measurements to capture the baseline and cryptographic results in this session.</p>}</Glass></section></>}

      {screen === "proof" && <section className="wrap proof-inspector-page"><div className="section-intro"><div><Eyebrow>12 / VERIFIER VIEW</Eyebrow><h2>Proof, not a promise.</h2></div><p>Every value below is fetched from the node API and recomputed from the selected signed record.</p></div><div className="proof-inspector-grid"><Glass className="proof-focus-card"><div className="proof-focus-head"><div><Eyebrow>SELECTED CLAIM</Eyebrow><h3>{proofRecord?.title || "Choose a record"}</h3><p>{proofRecord?.claimKey || "Open a record from Evidence lineage to inspect its proof."}</p></div>{proofRecord && <span className={`verified ${proofRecord.verification.valid ? "good" : "bad"}`}><StatusDot online={true} valid={proofRecord.verification.valid} /> {proofRecord.verification.valid ? "VERIFIED" : "FAILED"}</span>}</div>{proofRecord ? <><div className="proof-payload"><span>LIVE PAYLOAD</span><code>{proofRecord.payload}</code></div><div className="proof-attestation"><div><span>APPROVED SIGNER</span><strong>{orgs.find(org => org.id === proofRecord.orgId)?.name || short(proofRecord.orgId)}</strong></div><b>{orgs.find(org => org.id === proofRecord.orgId)?.identity.verified ? "IDENTITY ATTESTED" : "IDENTITY NOT ATTESTED"}</b></div><div className="proof-facts"><div><span>HASH</span><code>{short(proofRecord.recordHash, 26)}</code><Copy value={proofRecord.recordHash} /></div><div><span>PREVIOUS LINK</span><code>{short(proofRecord.previousHash, 26)}</code><Copy value={proofRecord.previousHash} /></div><div><span>SIGNATURE</span><b>{proofRecord.verification.signatureValid ? "ECDSA P-256 accepted" : "Signature rejected"}</b></div><div><span>CHAIN LINK</span><b>{proofRecord.verification.chainLinkValid ? "Prior hash matches" : "Prior hash mismatch"}</b></div></div><p className="muted">{proofRecord.verification.reason}</p></> : <div className="empty-state"><ShieldCheck size={22} /><strong>No claim selected.</strong><span>Choose “Inspect proof” from the evidence lineage.</span></div>}</Glass><Glass className="proof-versions-card"><div className="section-intro compact"><div><Eyebrow>VERSION HISTORY</Eyebrow><h2>Nothing disappears.</h2></div><Database size={20} /></div>{proofVersions.length ? proofVersions.map((version, index) => <button className={`proof-version ${version.id === proofRecord?.id ? "selected" : ""}`} key={version.id} onClick={() => void openProof(version)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{version.title}</strong><small>{version.payload} · {when(version.submittedAt)}</small></div><b>{version.verification.valid ? "VALID" : "FAILED"}</b></button>) : <p className="muted">Select a record to load every signed version for its claim.</p>}</Glass></div><Glass className="proof-network-card"><div className="section-intro compact"><div><Eyebrow>INDEPENDENT QUORUM</Eyebrow><h2>Three nodes answer separately.</h2></div><Network size={20} /></div><div className="proof-quorum"><strong>{networkProof?.agree ? "AGREEMENT" : networkProof ? "ATTENTION" : "—"}</strong><span>{networkProof?.quorum ? `${networkProof.quorum.reachable}/${networkProof.quorum.configured} signed responses received` : "Run the proof inspector to challenge the network."}</span></div><div className="proof-node-proof">{networkProof?.nodes?.map((node: any) => <div key={node.nodeId} className="proof-node-line"><StatusDot online={node.online} valid={node.signatureValid !== false} /><span>{node.nodeId}</span><small>{node.online ? `${node.signatureValid ? "signature valid" : "signature failed"} · ${node.proof?.recordCount ?? "—"} records` : node.message || "offline"}</small></div>)}</div></Glass></section>}
      {screen === "activity" && <section className="wrap activity-page"><div className="section-intro"><div><Eyebrow>11 / AUDIT TRAIL</Eyebrow><h2>Every mutation leaves a mark.</h2></div><p>Activity comes from the node’s SQLite audit table, not browser storage.</p></div><Glass className="activity-card">{activities.map(event => <div className="activity-line" key={event.id}><span className={`activity-marker ${event.result === "accepted" || event.result === "valid" || event.result === "resolved" || event.result === "measured" ? "good" : event.result === "rejected" || event.result === "integrity_broken" ? "bad" : "neutral"}`}><Activity size={13} /></span><div><strong>{event.kind.replaceAll("_", " ")}</strong><small>{event.details || event.result} · actor {event.actor}{event.target ? ` · target ${short(event.target)}` : ""}</small></div><time>{when(event.at)}</time></div>)}{!activities.length && <div className="empty-state"><Activity size={22} /><strong>Audit trail is empty.</strong><span>Anchor a record or register an organization to create the first event.</span></div>}</Glass></section>}
    </main>
    <footer className="footer wrap"><span>ECOPROOF / LIVE PROVENANCE NETWORK</span><span>Integrity proves unchanged bytes — it does not prove scientific truth.</span></footer>
  </div>;
}
