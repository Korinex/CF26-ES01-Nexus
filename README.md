# 🌱 EcoProof

**Tamper-evident, cryptographically verifiable provenance for environmental claims.**

**Team:** NEXUS
**Problem Code:** E-01 — Decentralized Environmental Data Provenance Network

---

## 📋 Table of Contents

- [🧩 Problem & Solution](#-problem--solution)
- [🏗️ Architecture / Workflow](#️-architecture--workflow)
- [🔐 Core Technical Mechanism](#-core-technical-mechanism)
- [🛠️ Technology Stack](#️-technology-stack)
- [⚙️ Setup & Installation](#️-setup--installation)
- [▶️ Usage](#️-usage)
- [📊 Validation & Results](#-validation--results)
- [⚠️ Limitations & Future Scope](#️-limitations--future-scope)
- [🌍 Stakeholders](#-stakeholders)
- [👥 Team](#-team)
- [🤖 AI Assistance Disclosure](#-ai-assistance-disclosure)
- [📚 References](#-references)

---

## 🧩 Problem & Solution

**The problem:** Companies publish claims like "cut emissions 20%" — but nobody outside can check where the number came from, if it was quietly edited later, or which version is right when two orgs disagree.

**One-line statement:**
> No cryptographic way exists to prove an environmental claim wasn't altered after publication, or to resolve two organizations disagreeing on the same number.

**🎯 Real-world spark:** DigiNotar (2011) — fake certs went undetected for weeks. Certificate Transparency (2013) fixed that for the web. Environmental claims have no equivalent.

**👥 Who's affected:**
-  Sustainability/ESG teams — no evidence trail
-  Auditors — can't verify who submitted what, or if it changed
-  Regulators, investors, public — only have "trust us"

** Why existing fixes fall short:**
| Approach | Gap |
|---|---|
| 🔐 Certificate Transparency | Built for certs, no org identity or conflict handling |
| 🌱 Climate Action Data Trust | Stops double-spent credits, not edited claims |
| 📚 Academic provenance research | Right idea, wrong domain (HPC, not ESG) |
| ⚙️ Blockchain-for-ESG proposals | Mostly whitepapers; heavy when built |

**✅ Our solution:** Sign every claim → chain versions → verify independently across nodes → flag conflicts instead of silently overwriting.

**What EcoProof proves:** ✔️ the record wasn't silently altered after signing, and ✔️ which registered key signed it.
**What it does NOT prove:** ❌ that the underlying measurement is scientifically true.

---

## 🏗️ Architecture / Workflow

Four problems solved together:

1.  **Bind** — claim linked to evidence via hash
2.  **Version** — nothing overwritten; every edit = new version
3.  **Verify independently** — 3 replica nodes cross-check, no single trusted party
4.  **Flag conflicts** — disagreement surfaced, never auto-resolved

**Verification steps:**
1. Recompute hash of canonical record
2. Check signature against registered public key
3. Check previous-record link (chain integrity)
4. Check conflict rules, freshness, authorization
5. Compare replica responses → agree / disagree / stale / unavailable

**⚠️ On the 3-node design:** Detects a lone outlier *if* 2 of 3 agree and only 1 is faulty. **Not** full Byzantine Fault Tolerance (which needs 3f+1 replicas). Can't resolve two colluding nodes or 3-way disagreement.

**🪪 Identity:** Orgs attest identity once → gated approval before they can anchor claims. Anchoring blocked until approved.

---

## 🔐 Core Technical Mechanism

| Mechanism | What it does |
|---|---|
| 🔢 **SHA-256** (FIPS 180-4) | Hashes evidence → fixed 256-bit fingerprint. Change 1 byte → hash breaks. |
| ✍️ **ECDSA** (FIPS 186-5) | Signs the hash with org's private key → proves *who* vouched for it. |
| ⛓️ **Hash-chaining** | Each record links to previous record's hash → edits break the chain visibly. |
| 📐 **Canonicalization** | Data converted to one exact byte format before hashing, so equivalent data always hashes the same. |
| 🆚 **Typed conflict rules** | Numbers → % variance threshold. Categories → exact match. Mismatched units → "incomparable," never force-compared. |
| 📦 **Off-chain evidence** | Large/sensitive data stored off-chain (content-addressed); only proofs kept on-record. |

> **Correction note:** FIPS 186-4 was withdrawn Feb 2024 → superseded by **FIPS 186-5**. C2PA's current spec is **v2.4**.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| ⚙️ Runtime | Node.js 22+ |
| 🔌 Backend | Express.js |
| 🗄️ Database | SQLite (`node:sqlite`) — per-node local storage |
| 🔐 Crypto | Node.js `crypto` (OpenSSL) |
| ✍️ Signatures | ECDSA P-256 (FIPS 186-5) |
| 🔢 Hashing | SHA-256 (FIPS 180-4) |
| 🎨 Frontend | React 19 + TypeScript |
| ⚡ Build | Vite |
| 🎨 Styling | Tailwind CSS 4 |
| 📊 Charts | Recharts |
| ✨ Animation | Framer Motion |
| 🔣 Icons | Lucide React |

**Why:** Node.js → built-in crypto/SQLite, no extra deps · SQLite → zero-config, isolated per node · ECDSA P-256 → NIST standard (Signal, SSH, TLS), lighter than RSA · SHA-256 → industry standard, hardware-accelerated

> ⚠️ FIPS 186-4 was withdrawn Feb 2024 → superseded by **FIPS 186-5**

---

## ⚙️ Setup & Installation

**Prerequisites:** 🟢 Node.js 22+ · 📦 npm · 🔧 Git

```bash
git clone https://github.com/Korinex/CF26-ES01-Nexus.git
cd CF26-ES01-Nexus
npm install
npm run demo   # starts 3 backend nodes + frontend
```

**Ports:** Node 1 → `:4000` · Node 2 → `:4001` · Node 3 → `:4002` · Frontend → `:5173`

| Command | Purpose |
|---|---|
| `npm run dev` | 1 node + frontend (dev mode) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run check` | TypeScript type check |
| `npm run judge-demo` | Terminal walkthrough |

---

## ▶️ Usage

**🎯 Judge Demo:** Open `localhost:5173` → click **"Run judge proof"** → auto-runs: org created → identity attested → baseline claim anchored → correction anchored → conflict flagged → network verified

**🔨 Tamper Test:** Evidence lineage → select record → **"Change payload byte"** (verification fails) → **"Restore original payload"** (passes again)

**🖥️ Network Test:** Network verify → **"Stop node-2"** (agreement drops 2/3) → restart + **"Sync peers"** (back to 3/3)

**📊 Benchmarks:** Measured experiments → **"Run measurements"** → view scaling (10/100/1000 records) + baseline comparison (0% vs 100%)

**💻 Terminal:** `npm run judge-demo`

**🔌 Key API Endpoints**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/organizations` | Register org |
| POST | `/api/organizations/:id/attest` | Approve org |
| POST | `/api/evidence` | Anchor claim |
| GET | `/api/evidence/:id/versions` | Version history |
| POST | `/api/evidence/:id/tamper` \| `/untamper` | Tamper / restore demo |
| GET | `/api/network/status` | Node statuses |
| GET | `/api/verify-network` | Challenge all nodes |
| GET | `/api/conflicts` \| POST `/:id/resolve` | View / resolve conflicts |
| GET | `/api/experiment/benchmark` | Run benchmark |

---

## 📊 Validation & Results

| Experiment | Result |
|---|---|
| 🧪 Verification scaling | 10/100/1,000 records → ~2ms/~15ms/~150ms, **100% detection**, scales linearly (~0.15ms/record) |
| 🧪 Tamper detection | 100/1,000 records tampered (10%) → **100% detected** |
| 🧪 Baseline comparison | Naive storage → **0%** detection · EcoProof (SHA-256+ECDSA) → **100%** |
| 🧪 Node sync | 100 records synced in ~200ms (~500 records/sec, ~1ms verify each) |
| 🧪 Network agreement | 3/3 online → AGREE · 1 offline → 2/3 · recovers → back to 3/3 |

> ⚠️ Benchmarks use freshly generated test chains, not real submitted data — validates implementation, not real-world truth.
---

## ⚠️ Limitations & Future Scope

**Assumptions (stated boundaries, not oversights):**
-  Orgs honest *at registration*, not forever after
-  Verifier nodes assumed uncompromised
-  Typed rules cover common cases, not every format
-  Orgs responsible for securing their own key

**Known limits:**
-  Not full BFT — can't catch 2 colluding nodes or 3-way disagreement
-  Doesn't prove truth — a legit org can still sign false data
-  Key compromise unaddressed at prototype stage
-  Can't prove *every* measurement was submitted (no completeness guarantee)

**🚀 Future roadmap:**
- 🔐 Protected key storage, rotation, revocation
- 🌐 HTTPS/TLS across all services
- 🖥️ Independently deployed nodes (separate operators)
- 🧾 External checkpoints for deletion resistance
- 🔗 Interop with W3C Verifiable Credentials / C2PA
- 🧬 Post-quantum signature migration planning

---

## 🌍 Stakeholders

| Category | Examples |
|---|---|
| 🏢 Publishers | ESG/sustainability teams |
| 🕵️ Verifiers | Auditors, assurance firms |
| 🤝 Evidence sources | Data providers, third-party labs |
| 🖥️ Infra operators | Verifier node operators |
| 🏛️ Regulators | Environmental/financial disclosure bodies |
| 💰 Capital | Investors, ESG rating agencies |
| 📰 Oversight | Journalists, watchdog orgs |
| 🌎 End beneficiaries | General public |

---

## 👥 Team

**Team Name: NEXUS**

1. Shifa Shehbaz Akbani (Leader)
2. Khudaija Harmain
3. Jeeya Chavan
4. Khushi Jaiswal

---

## 🤖 AI Assistance Disclosure

AI tools were used to support the team's workflow throughout this project — including research, technical documentation, architectural articulation, and presentation design. The team directed all problem framing and design decisions, using these tools to help structure, refine, and verify the resulting material.

- **Claude (Anthropic)** — Technical documentation, drafting, and reference/standards verification
- **Google AI Studio** — Prototyping support
- **Manus** — Research and task organization
- **Canva (AI features)** — Visual and presentation design

All final technical decisions and content were reviewed and approved by the team.

---

## 📚 References

1. Nakamoto (2008) — Bitcoin whitepaper
2. Merkle (1988) — Digital Signature Based on a Conventional Encryption Function
3. Haber & Stornetta (1991) — How to Time-Stamp a Digital Document
4. [RFC 6962 — Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962)
5. [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)
6. [NIST — Digital Signature glossary](https://csrc.nist.gov/glossary/term/digital_signature)
7. [NIST FIPS 186-5](https://doi.org/10.6028/NIST.FIPS.186-5)
8. [USENIX — Beyond One-Third Faulty Replicas in BFT Systems](https://www.usenix.org/conference/nsdi-07/beyond-one-third-faulty-replicas-byzantine-fault-tolerant-systems)
9. [C2PA Technical Spec v2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)
10. [Git Documentation](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository)
11. [IPFS Docs — Content Identifiers](https://docs.ipfs.tech/concepts/content-addressing/)
12. [PostgreSQL Documentation](https://www.postgresql.org/docs/current/index.html)
13. [SQLite Documentation](https://sqlite.org/docs.html)
