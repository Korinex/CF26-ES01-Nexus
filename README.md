<<<<<<< Updated upstream
# 🌍 Problem Statement & Solution Overview
## Team Name: NEXUS

## 🔍 The Problem

Every year, companies publish thousands of environmental claims like carbon emissions cut by 20%, renewable energy sourced at 80%, sustainability targets hit ahead of schedule. These numbers move from spreadsheets to consultants to sustainability reports to public disclosures, passing through many hands along the way.

By the time a claim reaches a regulator, an investor, or the public, three simple questions become surprisingly hard to answer:

- 📍 **Where did this number actually come from?**
- ✏️ **Has it been quietly changed since it was first recorded?**
- ⚖️ **If two organizations report different numbers for the same thing, which one is right — or is neither?**

Right now, the honest answer to all three is: **you have to trust the organization's word for it.** There's no cryptographic proof behind the number, no independent way to check it, and no visible history if it was edited.

## 🧠 What We Learned Looking at How Others Solved This

🔐 **Certificate Transparency.** A compromised Certificate Authority once secretly issued fraudulent certificates for major domains including Google and Yahoo, and because there was no centralized monitoring system, the breach went undetected for weeks [1]. The industry's fix, in place since 2013: certificates are logged in public, append-only, cryptographically-assured ledgers built on Merkle trees, making it cryptographically impossible to remove or alter a logged entry without detection [2]. Importantly, the system's own documentation is explicit that it cannot prevent a bad certificate from being issued , it only makes misissuance detectable quickly once it happens [3].

🌱 **Blockchain-based carbon accounting.** The Climate Action Data Trust — a permissioned ledger launched by the World Bank, the International Emissions Trading Association, and the Government of Singapore , assigns unique identifiers to carbon credits so there is only ever one authoritative record of a credit's status, preventing double-counting across registries [4]. Industry analysis of blockchain applications in ESG reporting is candid about the same boundary we found in Certificate Transparency: the technology preserves an audit trail once data is recorded, but it does not guarantee the underlying measurement was accurate to begin with [5].

📚 **Academic provenance research.** Existing work on data provenance systems notes that most solutions focus on reducing performance overhead and improving query flexibility, while giving little attention to whether the provenance record itself could be fabricated or falsified [6].

## 💡 Our Approach

🔗 Think of it like a notebook where every page is glued to the page before it. Change one page, and the glue breaks — visibly, for anyone checking.

1. 🧾 **Approved identity first** — organizations are independently attested before they can anchor any claim.
2. ✍️ **Cryptographic signing + hash-chaining** — every claim is hashed, linked to its predecessor, and signed.
3. 🕵️ **Independent, multi-node verification** — three separate processes check the chain over real HTTP and compare results, reporting disagreement honestly rather than hiding a failure.
4. ⚠️ **Typed conflict detection** — differing claims are compared with real percentage/categorical logic, not a placeholder, and both versions stay queryable.

## 🎯 Our Claim

> A hash-chained, cryptographically-signed evidence ledger with independent multi-node verification can detect tampering and data conflicts in environmental claims as reliably as a centralized system — without requiring anyone to trust a single central authority.

🛑 We are **not** claiming this proves an environmental measurement is scientifically true — only that once recorded, tampering with it becomes detectable, consistent with the same scope boundary drawn by existing blockchain-ESG research [5].

## 🌟 Why It Matters

If this claim holds, accountability shifts from "trust our word" to "here is math you can independently verify" , a modest, provable foundation for audits and regulators to build on.

---

## Reference List 

1. Certificate Transparency Logs: Complete Analysis for Security Professionals — subdomains.dbuidl.com
2. What is Certificate Transparency? — SSL Insights, sslinsights.com
3. What Is Certificate Transparency and How Does It Work? — RapidSSLOnline
4. Blockchain for Environmental Tracking: How Distributed Ledgers Verify Carbon Credits and ESG Data — mychores.in
5. Why Blockchain Works for ESG and Sustainability Reporting — Blockchain Council
6. SciChain: Trustworthy Scientific Data Provenance — Al-Mamun & Zhao, arXiv:2002.00141
=======
# EcoProof

EcoProof is a hackathon prototype for making environmental claims inspectable. It combines an approved organization identity, signed and versioned evidence, typed conflict comparison, independent HTTP verification, and a visible audit trail.

The prototype is intentionally small and demonstrable. It does not claim that an environmental statement is scientifically true. It proves the integrity, authorship, history, and independent verification of the bytes that were anchored.

## Exact project structure

```text
EcoProof-final/
├── backend/
│   ├── scripts/
│   │   ├── demo.ts
│   │   ├── judge-demo.mjs
│   │   └── smoke-test.mjs
│   └── src/
│       └── index.ts
├── frontend/
│   ├── public/
│   │   └── .gitkeep
│   ├── src/
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── ManusDialog.tsx
│   │   │   └── ui/
│   │   │       ├── accordion.tsx
│   │   │       ├── alert-dialog.tsx
│   │   │       ├── alert.tsx
│   │   │       ├── aspect-ratio.tsx
│   │   │       ├── avatar.tsx
│   │   │       ├── badge.tsx
│   │   │       ├── breadcrumb.tsx
│   │   │       ├── button-group.tsx
│   │   │       ├── button.tsx
│   │   │       ├── calendar.tsx
│   │   │       ├── card.tsx
│   │   │       ├── carousel.tsx
│   │   │       ├── chart.tsx
│   │   │       ├── checkbox.tsx
│   │   │       ├── collapsible.tsx
│   │   │       ├── command.tsx
│   │   │       ├── context-menu.tsx
│   │   │       ├── dialog.tsx
│   │   │       ├── drawer.tsx
│   │   │       ├── dropdown-menu.tsx
│   │   │       ├── empty.tsx
│   │   │       ├── field.tsx
│   │   │       ├── form.tsx
│   │   │       ├── hover-card.tsx
│   │   │       ├── input-group.tsx
│   │   │       ├── input-otp.tsx
│   │   │       ├── input.tsx
│   │   │       ├── item.tsx
│   │   │       ├── kbd.tsx
│   │   │       ├── label.tsx
│   │   │       ├── menubar.tsx
│   │   │       ├── navigation-menu.tsx
│   │   │       ├── pagination.tsx
│   │   │       ├── popover.tsx
│   │   │       ├── progress.tsx
│   │   │       ├── radio-group.tsx
│   │   │       ├── resizable.tsx
│   │   │       ├── scroll-area.tsx
│   │   │       ├── select.tsx
│   │   │       ├── separator.tsx
│   │   │       ├── sheet.tsx
│   │   │       ├── sidebar.tsx
│   │   │       ├── skeleton.tsx
│   │   │       ├── slider.tsx
│   │   │       ├── sonner.tsx
│   │   │       ├── spinner.tsx
│   │   │       ├── switch.tsx
│   │   │       ├── table.tsx
│   │   │       ├── tabs.tsx
│   │   │       ├── textarea.tsx
│   │   │       ├── toggle-group.tsx
│   │   │       ├── toggle.tsx
│   │   │       └── tooltip.tsx
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/
│   │   │   ├── useComposition.ts
│   │   │   ├── useMobile.tsx
│   │   │   └── usePersistFn.ts
│   │   ├── lib/
│   │   │   ├── ecoproof-api.ts
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   └── Home.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   └── index.html
├── patches/
│   └── wouter@3.7.1.patch
├── DEMO.md
├── README.md
├── package-lock.json
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

The `backend/data/` directory is created automatically when the demo starts. It contains runtime SQLite databases and signing-key material and is intentionally not included in the ZIP. `node_modules/` and `dist/` are also generated locally and are not included.

## Requirements

Install **Node.js 22 or newer** and npm. The project uses npm scripts and `package-lock.json` for reproducible installation.

## Run in VS Code

Open the extracted `EcoProof-final` folder in VS Code, open its integrated terminal, and run these commands from the project root:

```bash
npm install
npm run demo
```

The demo starts the frontend at `http://localhost:5173` and three independent backend nodes at `http://localhost:4000`, `http://localhost:4001`, and `http://localhost:4002`. Stop all processes with `Ctrl+C`.

For normal development, use:

```bash
npm run dev
```

This starts one backend development process and the Vite frontend. For a production build, use:

```bash
npm run build
npm run start
```

## Recommended judge walkthrough

Open the dashboard and click **Run judge proof**. This runs a fresh live journey: a pending organization is created, its identity is attested by the verifier authority, the approved identity is replicated to the other nodes, a baseline and correction are signed and anchored, a typed numeric conflict is created and resolved without deleting either version, and all three independent nodes answer a signed verification challenge.

The flow opens **Proof inspector**, which shows the live payload, approved signer, hash, previous-chain link, signature status, complete version history, and independent responses from each node. This is the fastest way to demonstrate the complete product claim.

To demonstrate tamper detection, open **Evidence lineage**, select a record, and use **Change payload byte**. The recomputed proof fails. Use **Restore original payload** to restore the durable original payload and verify the chain again.

To demonstrate the network, open **Network verify**. Show the three different ports, separate record counts, and matching chain heads. If needed, stop a peer to show that the verifier reports disagreement instead of hiding an unavailable node.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies and create `package-lock.json` locally |
| `npm run demo` | Start three backend nodes and the frontend for the full demonstration |
| `npm run judge-demo` | Run the live judge journey from a second terminal while the demo is running |
| `npm run dev` | Start one backend development process and the Vite frontend |
| `npm run check` | Run the TypeScript check |
| `npm run build` | Build the frontend and bundled backend |
| `npm run start` | Start the bundled production backend and static frontend |
| `node backend/scripts/smoke-test.mjs` | Run the live integration test against three running nodes |

## Live frontend/backend boundary

The React UI uses `frontend/src/lib/ecoproof-api.ts` for HTTP transport and stable route contracts. It does not access SQLite, signing keys, or node internals. A future frontend can therefore replace the contents of `frontend/src/` while retaining the backend API and verification model.

## E-01 implementation

**Independent verification** uses three separate Node processes, separate ports, separate SQLite files, and separate node signing keys. `/api/verify-network` sends a challenge over HTTP to every configured peer, verifies every returned proof signature, and compares chain length, head hash, and chain validity.

**Typed conflict variance** compares numeric evidence using symmetric percentage difference and categorical evidence using normalized equality. Incomparable numeric values are explicitly marked incomparable rather than silently assigned a universal mismatch value.

**Verifiable organization identity** starts as pending. The attestation endpoint persists the attester, role, statement, timestamp, hash, and authority signature, replicates the approval, and prevents anchoring until the organization is approved.

**Persistent version history** keeps every signed evidence record as an immutable database row. Conflict resolution stores the selected version and resolution metadata without deleting the original or the correction. The version endpoint returns the complete history.

**Scoped prevention statement:** EcoProof does not claim to prevent arbitrary edits to external files. Once bytes are anchored, signed, chained, and replicated, undetected tampering of those anchored records becomes cryptographically infeasible under the verifier model.

## API routes used by the frontend

| Route | Purpose |
|---|---|
| `GET /api/health` | Live node state and chain summary |
| `GET /api/stats` | Dashboard metrics |
| `GET /api/catalog` | Backend-owned evidence types and comparison semantics |
| `GET /api/organizations` | Registered identities and attestation state |
| `POST /api/organizations` | Register a pending organization |
| `POST /api/organizations/:id/attest` | Persist and replicate identity attestation |
| `GET /api/evidence` | Signed records with recomputed verification |
| `POST /api/evidence` | Anchor approved evidence |
| `GET /api/evidence/:id/versions` | Query all versions for a claim |
| `POST /api/evidence/:id/tamper` | Demonstration-only payload mutation |
| `POST /api/evidence/:id/untamper` | Restore the durable original payload |
| `GET /api/conflicts` | Typed conflict queue |
| `POST /api/conflicts/:id/resolve` | Resolve while preserving both versions |
| `GET /api/network/status` | Independent node status |
| `GET /api/verify-network` | Challenge and aggregate node proofs |
| `POST /api/judge-demo` | Run the complete live judge walkthrough |
>>>>>>> Stashed changes
