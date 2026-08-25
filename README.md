# 🌍 Problem Statement & Solution Overview
## Team Name: NEXUS

## 🔍 The Problem

Every year, companies publish thousands of environmental claims — carbon emissions cut by 20%, renewable energy sourced at 80%, sustainability targets hit ahead of schedule. These numbers move from spreadsheets to consultants to sustainability reports to public disclosures, passing through many hands along the way.

By the time a claim reaches a regulator, an investor, or the public, three simple questions become surprisingly hard to answer:

- 📍 **Where did this number actually come from?**
- ✏️ **Has it been quietly changed since it was first recorded?**
- ⚖️ **If two organizations report different numbers for the same thing, which one is right — or is neither?**

Right now, the honest answer to all three is: **you have to trust the organization's word for it.** There's no cryptographic proof behind the number, no independent way to check it, and no visible history if it was edited.

## 🧠 What We Learned Looking at How Others Solved This

🔐 **Certificate Transparency.** A compromised Certificate Authority once secretly issued fraudulent certificates for major domains including Google and Yahoo, and because there was no centralized monitoring system, the breach went undetected for weeks [1]. The industry's fix, in place since 2013: certificates are logged in public, append-only, cryptographically-assured ledgers built on Merkle trees, making it cryptographically impossible to remove or alter a logged entry without detection [2]. Importantly, the system's own documentation is explicit that it cannot prevent a bad certificate from being issued — it only makes misissuance detectable quickly once it happens [3].

🌱 **Blockchain-based carbon accounting.** The Climate Action Data Trust — a permissioned ledger launched by the World Bank, the International Emissions Trading Association, and the Government of Singapore — assigns unique identifiers to carbon credits so there is only ever one authoritative record of a credit's status, preventing double-counting across registries [4]. Industry analysis of blockchain applications in ESG reporting is candid about the same boundary we found in Certificate Transparency: the technology preserves an audit trail once data is recorded, but it does not guarantee the underlying measurement was accurate to begin with [5].

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

If this claim holds, accountability shifts from "trust our word" to "here is math you can independently verify" — a modest, provable foundation for audits and regulators to build on.

---

## Your Reference List (paste at the end of your report)

1. Certificate Transparency Logs: Complete Analysis for Security Professionals — subdomains.dbuidl.com
2. What is Certificate Transparency? — SSL Insights, sslinsights.com
3. What Is Certificate Transparency and How Does It Work? — RapidSSLOnline
4. Blockchain for Environmental Tracking: How Distributed Ledgers Verify Carbon Credits and ESG Data — mychores.in
5. Why Blockchain Works for ESG and Sustainability Reporting — Blockchain Council
6. SciChain: Trustworthy Scientific Data Provenance — Al-Mamun & Zhao, arXiv:2002.00141
