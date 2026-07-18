<!--
Filename: outstanding-issues.md
Revision: 1.0.0
Description: Shareable status list of outstanding HumidorHQ review issues on the critical-issue-review branch.
Modified Date: 2026-07-18 ET
-->

# HumidorHQ — Outstanding Issues

**Branch:** `critical-issue-review`
**Source of truth:** [`humidorhq-review-and-remediation.md`](./humidorhq-review-and-remediation.md) (full findings, evidence, and remediation plan). This file is just the short status list for sharing.
**As of:** 2026-07-18

**Legend:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low · **[APPROVAL]** = needs a product/owner/deploy decision before coding · **[BREAKS]** = change large enough to warrant its own reviewed PR with tests · **[MIGRATION]** = existing data must be corrected.

---

## Status summary

- **Fixed & pushed:** 8 items — M-1, M-2, M-3, L-3, L-4, H-4, M-4, M-7 (see CHANGELOG 1.10.2–1.10.4).
- **Outstanding:** 15 items + 2 partial follow-ups (below).
- Every outstanding item is gated on **[APPROVAL]** or **[BREAKS]**, which is why the safe quick-win pass stopped here.

---

## Outstanding issues

### 🔴 Critical (5)

| ID | Issue | Gate |
|----|-------|------|
| **C-1** | Same-location move inflates inventory (phantom stock) | [BREAKS] core move logic + [MIGRATION] |
| **C-2** | Purchase re-sync after a move double-counts inventory | [BREAKS] core sync logic |
| **C-3** | Legacy/partial purchase status silently deletes received inventory | [APPROVAL] semantics + [MIGRATION] |
| **C-4** | `DISCARDED` removals vanish from every report and total | [APPROVAL] (changes displayed numbers) |
| **C-5** | Live runtime data committed inside the Git deploy tree | [APPROVAL/BREAKS] coordinate on deploy + data location |

### 🟠 High (6)

| ID | Issue | Gate |
|----|-------|------|
| **H-1** | `todayIsoDate()` hardcoded to `'2026-07-16'` | [APPROVAL] canonical timezone (do with H-6) |
| **H-2** | Lock-free read-modify-write loses concurrent writes | [BREAKS] every write path |
| **H-3** | No backup or restore mechanism | depends on C-5 (data location) |
| **H-5** | No login throttling; failed logins never audited | [APPROVAL] lockout policy |
| **H-6** | Event dates derived from UTC → timezone rollover | [APPROVAL] canonical timezone (do with H-1) |
| **H-7** | No CSRF token (mitigated only by SameSite=Strict) | [BREAKS] frontend + smoke test |

### 🟡 Medium (2)

| ID | Issue | Gate |
|----|-------|------|
| **M-5** | Unknown money silently treated as zero (averages/savings skew) | [APPROVAL/BREAKS] accounting |
| **M-6** | Floating-point money in all frontend calculations | [BREAKS] report math |

### ⚪ Low (2)

| ID | Issue | Gate |
|----|-------|------|
| **L-1** | No security headers beyond `X-Content-Type-Options` | CSP needs browser testing vs the SPA |
| **L-2** | No idle/absolute session timeout | [APPROVAL] durations |

### Partial follow-ups (from already-landed work)

- **M-4 / M-7** — server-side location snapshots and the smoking-journal fallback are done, but still open:
  1. optional one-time backfill of pre-existing events, and
  2. the frontend Removal History still resolves location live and reads the wrong field (`event.storageLocationId` instead of `fromStorageLocationId`) — needs an `app.js` asset-version bump.

---

## Decisions needed from Matt (to unblock the [APPROVAL] items)

1. **C-3** — Is "un-receiving a purchase deletes its inventory" intended behavior, or a bug? (Fix + a data reclassification depend on the answer.)
2. **C-4** — Should *discarded/damaged* cigars count in lifetime cost/savings totals? (Changes the numbers on the dashboard.)
3. **C-5** — Where should live data live outside the Git/deploy tree, and how is production currently deployed? (Coordinate before moving data.)
4. **H-1 / H-6** — What is the canonical timezone for dates (Eastern, like the audit log)?
5. **H-5 / L-2** — Login lockout policy and session idle/absolute timeout durations.
6. **M-5** — Confirm the accounting rule: known zero stays zero, unknown stays unknown (not silently $0).

## Suggested next engineering move

Tackle the **C-1 + C-2 inventory-corruption cluster** as a single reviewed change with regression tests (they share the `move` / `sync` code paths and should not be fixed piecemeal).

---

*Full detail, evidence, and per-item fix notes: [`humidorhq-review-and-remediation.md`](./humidorhq-review-and-remediation.md). Completed-item write-ups: `CHANGELOG.md` (1.10.2–1.10.4).*
