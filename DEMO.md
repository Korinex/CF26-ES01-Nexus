# EcoProof judge walkthrough

EcoProof is designed to be demonstrated as a short, evidence-first journey rather than as a collection of screens.

## Start

From the project root:

```bash
npm install
npm run demo
```

Open `http://localhost:5173`.

## The 90-second path

First, point out the dark mineral canvas, beige proof cards, and green/red integrity signals. Explain that the visual language mirrors the product claim: environmental evidence is treated as a material trail, not a generic dashboard.

Next, click **Run judge proof**. This is a real API flow, not a browser mock. The backend generates a fresh organization identity, stores its P-256 signing key outside the database, creates a pending identity, applies an authority-signed attestation, replicates the approved identity to the other two nodes, anchors a baseline measurement, anchors a corrected version, opens a typed numeric conflict, resolves it without deleting either version, and challenges all three nodes over HTTP.

The **Proof inspector** then shows the generated payload, record hash, previous-chain link, signature state, complete version history, and independent node responses. The key judging sentence is:

> EcoProof does not merely say that a claim is valid. It shows the bytes, signer, predecessor, versions, and independent verifier responses that make the claim inspectable.

Open **Evidence lineage** and select any record. Use the shield icon to return to the verifier view. Use **Change payload byte** to demonstrate an actual integrity failure, then use **Restore original payload** to show durable recovery from the stored original payload.

Open **Network verify** to show three separate processes, three separate SQLite files, different ports, and matching chain heads. Stop one peer only if the judges want to see failure handling: the network status changes to disagreement rather than pretending that the quorum is healthy.

## What is live

The frontend receives all operational data from the backend API. Evidence types come from `/api/catalog`; records, organizations, conflicts, activity, node state, version history, and quorum proofs come from API routes. The frontend transport code is isolated in `frontend/src/lib/ecoproof-api.ts`, so a future frontend can be replaced without changing the backend.

## Why this is different

Most prototypes stop at a dashboard or a signature checkbox. EcoProof connects four visible layers in one demonstrable loop: approved signer identity, signed versioned provenance, typed conflict comparison, and independent network verification. It also communicates the limitation honestly: cryptographic proof protects the integrity and authorship of anchored bytes; it does not claim that the underlying environmental statement is scientifically true.

## CLI shortcut

After `npm run demo` is running, this command executes the same live judge journey from a terminal:

```bash
npm run judge-demo
```
