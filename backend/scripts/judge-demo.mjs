const response = await fetch("http://localhost:4000/api/judge-demo", { method: "POST" });
const result = await response.json();
if (!response.ok) {
  console.error(result.error || "Judge demo failed");
  process.exit(1);
}
console.log(JSON.stringify({
  organization: result.organization?.name,
  attested: result.organization?.identity?.verified,
  versions: [result.baseline?.payload, result.correction?.payload],
  conflictId: result.conflictId,
  independentQuorum: result.network?.quorum,
  agreement: result.network?.agree,
}, null, 2));
