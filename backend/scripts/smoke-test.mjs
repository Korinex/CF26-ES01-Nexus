const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async (base, path, options = {}) => {
  const response = await fetch(`${base}${path}`, { headers: { "content-type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${base}${path} -> ${response.status}: ${body.error || "request failed"}`);
  return body;
};
const post = (base, path, body) => request(base, path, { method: "POST", body: JSON.stringify(body) });
const nodes = ["http://localhost:4000", "http://localhost:4001", "http://localhost:4002"];
for (const base of nodes) {
  const health = await request(base, "/api/health");
  assert(health.online && health.nodeId && health.nodePublicKeyPem, `${base} is not live or has no node proof key`);
}
const catalog = await request(nodes[0], "/api/catalog");
assert(catalog.evidenceTypes.length >= 6 && catalog.comparisonModes.numeric && catalog.comparisonModes.categorical, "catalog is not served by the backend");
const org = await post(nodes[0], "/api/organizations", { name: `Smoke Organization ${Date.now()}` });
assert(org.identity.status === "pending" && org.publicKeyPem && org.identity.verified === false, "new identity response is incomplete or not pending");
await sleep(250);
const attested = await post(nodes[0], `/api/organizations/${org.id}/attest`, { attesterName: "Smoke Authority", attesterRole: "Independent verifier", statement: "I checked the organization name and public verification key." });
assert(attested.identity.verified && attested.identity.attestationHash && attested.identity.attestationSignature && attested.authorityPublicKeyPem, "attestation did not produce a verifiable approval proof");
await sleep(250);
for (const base of nodes) {
  const organizations = await request(base, "/api/organizations");
  const replicated = organizations.find(item => item.id === org.id);
  assert(replicated?.identity?.verified, `${base} did not receive the approved identity`);
}
const first = await post(nodes[0], "/api/evidence", { orgId: org.id, title: "Smoke numeric baseline", claimKey: `smoke.numeric.${Date.now()}`, type: "emissions", payload: "100 tCO2e", sourceFileName: "smoke.csv" });
const numericClaim = first.record.claimKey;
const second = await post(nodes[0], "/api/evidence", { orgId: org.id, title: "Smoke numeric correction", claimKey: numericClaim, type: "emissions", payload: "110 tCO2e", sourceFileName: "smoke-correction.csv", versionOf: first.record.id });
await sleep(350);
const conflictsAfterNumeric = await request(nodes[0], "/api/conflicts");
const numericConflict = conflictsAfterNumeric.find(item => item.claimKey === numericClaim);
assert(numericConflict?.comparisonMode === "numeric", "numeric conflict did not use typed comparison");
assert(numericConflict.variancePercent === 9.52, `numeric variance was ${numericConflict?.variancePercent}, expected 9.52`);
const categoricalClaim = `smoke.categorical.${Date.now()}`;
const categoricalFirst = await post(nodes[0], "/api/evidence", { orgId: org.id, title: "Smoke categorical baseline", claimKey: categoricalClaim, type: "compliance_report", payload: "approved" });
await post(nodes[0], "/api/evidence", { orgId: org.id, title: "Smoke categorical correction", claimKey: categoricalClaim, type: "compliance_report", payload: "rejected", versionOf: categoricalFirst.record.id });
await sleep(350);
const conflicts = await request(nodes[0], "/api/conflicts");
const categoricalConflict = conflicts.find(item => item.claimKey === categoricalClaim);
assert(categoricalConflict?.comparisonMode === "categorical" && categoricalConflict.variancePercent === 100, "categorical conflict variance is not 100% mismatch");
const resolved = await post(nodes[0], `/api/conflicts/${numericConflict.id}/resolve`, { acceptedRecordId: second.record.id, note: "Correction selected; original and correction remain queryable." });
assert(resolved.versions?.length === 2, "resolving a conflict did not preserve both versions in the response");
const versions = await request(nodes[0], `/api/evidence/${first.record.id}/versions`);
assert(versions.versions.length === 2 && versions.versions.some(item => item.id === first.record.id) && versions.versions.some(item => item.id === second.record.id), "version history is not queryable after resolution");
const network = await request(nodes[0], "/api/verify-network");
assert(network.nodes.length === 3 && network.nodes.every(item => item.online && item.signatureValid) && network.agree, "network verification did not aggregate three independent signed responses");
const tampered = await post(nodes[0], `/api/evidence/${first.record.id}/tamper`, {});
assert(!tampered.verification.valid && tampered.verification.hashValid === false, "tamper simulation did not fail recomputed proof");
const restored = await post(nodes[0], `/api/evidence/${first.record.id}/untamper`, {});
assert(restored.verification.valid, "durable backup restore did not recover valid proof");
for (const base of nodes) {
  const health = await request(base, "/api/health");
  assert(health.recordCount >= 4, `${base} did not converge on replicated records`);
}
console.log(JSON.stringify({ ok: true, nodes: nodes.length, identity: "approved", numericVariance: numericConflict.variancePercent, categoricalVariance: categoricalConflict.variancePercent, versionsPreserved: versions.versions.length, networkAgreement: network.agree, tamperDetected: true }, null, 2));
