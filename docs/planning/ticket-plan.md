# Implementation ticket plan

**Status:** Approved and published on October 2, 2026. Central [GitLab #1](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/1) links the five gate Issues; each gate owns its native child Tasks.
The [GitLab mapping](gitlab-map.json) records all published IDs.

Read the [implementation spec](implementation-spec.md) first.
Every numbered item below links to its local task record with requirement IDs, test IDs,
acceptance criteria and required evidence. The [traceability matrix](traceability.md)
covers all 119 requirements and all 45 test families.

## How to read the dependencies

- CT identifiers remain stable planning identifiers mapped to GitLab IDs.
- "Blocked by" names actual prerequisites; numbering is a valid dependency order,
  not a requirement to do unrelated tasks serially.
- Gate G0/G1/G2/G3/G4 identifies where a deliverable is assessed. Fixture-based CT-22
  can start after CT-01/CT-02 even while real-environment G0 work is blocked.
- Production G1 work starts after the compatibility gate. G2 production work may
  progress once its concrete prerequisites exist; its qualification also requires G1.
- Dashboard work waits for Windows/container feasibility and the necessary reporting
  and attribution contracts. No generic UI redesign is included.
- Local Windows and WSL2 validation is required during implementation for applicable
  behavior. Actual-container and native Linux coverage remain additional SRS duties.
- The user approved dependency-ordered implementation. Package publication remains separate.

## Gate summary

| Gate | Tickets | Result |
| --- | --- | --- |
| G0 | CT-01–CT-08 | Packed CLI, target discovery, bounded capture/A-to-B experiments and actual compatibility evidence. |
| G1 | CT-09–CT-15 | Safe profiles, scope ownership, crash recovery, local/container launch and measured overhead. |
| G2 | CT-16–CT-21 | Durable capture/replay, attempt/child attribution and installed-version qualification. |
| G3 | CT-22–CT-29 | Bounded collection, deterministic accounting, reports, authenticated dashboard and performance. |
| G4 | CT-30–CT-38 | Migration, lifecycle, privacy, final package, actual platform qualification and release decision. |

## G0 detail

G0 establishes feasibility before scaling the implementation. CT-02/CT-03/CT-04 deliver
small usable CLI behavior; CT-05/CT-06 answer real target questions. CT-06 uses scoped,
controlled activation and test state rather than pretending unfinished production
credential switching is safe. Full safety and attribution verification remains in G1/G2.

CT-07 must run actual local Windows and WSL2 checks plus the required initial native
Linux and legacy-target cases. If any required access/capability is missing, CT-08 remains
blocked. Independent fixture groundwork can continue; incomplete tests do not become passes.

## Approved breakdown

### G0

1. **[CT-01 — Capture reusable behavior and accounting fixtures](draft-tickets/01-capture-reusable-behavior-and-accounting-fixtures.md)**\
   **Blocked by:** None.\
   **Delivers:** Turn the recorded profile-switching reference and pinned accounting behavior into a behavior/fixture inventory for the TypeScript implementation.

2. **[CT-02 — Install a packed CLI and run host capability diagnostics](draft-tickets/02-install-a-packed-cli-and-run-host-capability-diagnostics.md)**\
   **Blocked by:** None.\
   **Delivers:** Build and pack one precompiled JavaScript application whose installed CLI diagnoses host SQLite and compression capabilities.

3. **[CT-03 — Discover targets without changing their environment](draft-tickets/03-discover-targets-without-changing-their-environment.md)**\
   **Blocked by:** CT-02.\
   **Delivers:** Inspect local and existing Docker targets and report precise readiness, path and bridge diagnostics.

4. **[CT-04 — Select a profile and pass through to a harmless child](draft-tickets/04-select-a-profile-and-pass-through-to-a-harmless-child.md)**\
   **Blocked by:** CT-02.\
   **Delivers:** Demonstrate selector behavior and argument/terminal transparency using disposable profile metadata and a harmless child fixture.

5. **[CT-05 — Qualify a minimal metadata bridge on the legacy target](draft-tickets/05-qualify-a-minimal-metadata-bridge-on-the-legacy-target.md)**\
   **Blocked by:** CT-03.\
   **Delivers:** Run a bounded capture experiment that emits sanitized durable metadata using only verified existing legacy-container facilities.

6. **[CT-06 — Probe A-to-B resume attribution feasibility](draft-tickets/06-probe-a-to-b-resume-attribution-feasibility.md)**\
   **Blocked by:** CT-04, CT-05.\
   **Delivers:** Demonstrate whether the installed Codex can expose trustworthy launch/attempt boundaries across a controlled A-to-B resume.

7. **[CT-07 — Qualify initial package and launch behavior locally](draft-tickets/07-qualify-initial-package-and-launch-behavior-locally.md)**\
   **Blocked by:** CT-06.\
   **Delivers:** Establish the initial Windows and WSL2 compatibility evidence before committing to the full build.

8. **[CT-08 — Review the compatibility gate](draft-tickets/08-review-the-compatibility-gate.md)**\
   **Blocked by:** CT-01, CT-07.\
   **Delivers:** Publish an evidence-backed G0 decision identifying which guarantees are feasible and what still blocks qualification.

### G1

9. **[CT-09 — Manage stable profiles through isolated login](draft-tickets/09-manage-stable-profiles-through-isolated-login.md)**\
   **Blocked by:** CT-08.\
   **Delivers:** Add, inspect, rename, reauthenticate and remove profiles while preserving valid credentials and historical identity bindings.

10. **[CT-10 — Guard canonical scopes and identify conflicting processes](draft-tickets/10-guard-canonical-scopes-and-identify-conflicting-processes.md)**\
   **Blocked by:** CT-09.\
   **Delivers:** Refuse competing or ambiguous launches using canonical scope/binding locks and trustworthy process ownership evidence.

11. **[CT-11 — Activate credentials with refresh-safe crash recovery](draft-tickets/11-activate-credentials-with-refresh-safe-crash-recovery.md)**\
   **Blocked by:** CT-10.\
   **Delivers:** Switch identities through a recoverable transaction that preserves the latest matching credentials and durably binds a launch before execution.

12. **[CT-12 — Stop only freshly verified conflicting processes](draft-tickets/12-stop-only-freshly-verified-conflicting-processes.md)**\
   **Blocked by:** CT-11.\
   **Delivers:** Offer scoped graceful shutdown and separately approved force termination without changing credentials on cancellation.

13. **[CT-13 — Launch and resume locally with safe identity ownership](draft-tickets/13-launch-and-resume-locally-with-safe-identity-ownership.md)**\
   **Blocked by:** CT-12.\
   **Delivers:** Connect the selector and explicit CLI to guarded local launch and project-scoped resume.

14. **[CT-14 — Launch and supervise Codex inside the existing container](draft-tickets/14-launch-and-supervise-codex-inside-the-existing-container.md)**\
   **Blocked by:** CT-13.\
   **Delivers:** Safely launch the existing container Codex with correct credentials, build environment and verified remote process lifecycle.

15. **[CT-15 — Qualify safe-launch recovery and performance](draft-tickets/15-qualify-safe-launch-recovery-and-performance.md)**\
   **Blocked by:** CT-14.\
   **Delivers:** Verify the integrated launcher meets G1 safety and latency requirements on the required environments.

### G2

16. **[CT-16 — Capture bounded lifecycle metadata without altering Codex](draft-tickets/16-capture-bounded-lifecycle-metadata-without-altering-codex.md)**\
   **Blocked by:** CT-14.\
   **Delivers:** Install previewed minimal hooks that publish sanitized, versioned metadata durably and return neutral output.

17. **[CT-17 — Replay captured events through a durable host receipt](draft-tickets/17-replay-captured-events-through-a-durable-host-receipt.md)**\
   **Blocked by:** CT-16.\
   **Delivers:** Recover event backlogs without losing or duplicating committed effects, through mounted or background-pull transport.

18. **[CT-18 — Attribute mixed-identity sessions by launch and turn attempt](draft-tickets/18-attribute-mixed-identity-sessions-by-launch-and-turn-attempt.md)**\
   **Blocked by:** CT-17.\
   **Delivers:** Retain A's observations when a session resumes under B, including retry attempts, late events and crashes before completion.

19. **[CT-19 — Attribute nested child work without inherited-history duplication](draft-tickets/19-attribute-nested-child-work-without-inherited-history-duplication.md)**\
   **Blocked by:** CT-18.\
   **Delivers:** Resolve parent/child observations using verified execution relationships while counting each observation once.

20. **[CT-20 — Expose unknown, imported and conflicting attribution](draft-tickets/20-expose-unknown-imported-and-conflicting-attribution.md)**\
   **Blocked by:** CT-19.\
   **Delivers:** Make incomplete or contradictory ownership explicit and support audited deterministic automatic reconciliation.

21. **[CT-21 — Qualify attribution against actual installed Codex](draft-tickets/21-qualify-attribution-against-actual-installed-codex.md)**\
   **Blocked by:** CT-15, CT-20.\
   **Delivers:** Publish the per-version/per-target capability matrix and G2 attribution qualification results.

### G3

22. **[CT-22 — Read rollout sources incrementally with bounded decoding](draft-tickets/22-read-rollout-sources-incrementally-with-bounded-decoding.md)**\
   **Blocked by:** CT-01, CT-02.\
   **Delivers:** Process registered synthetic/read-only rollout sources incrementally, recovering cursor progress without unbounded reads.

23. **[CT-23 — Produce deterministic token totals from native and legacy observations](draft-tickets/23-produce-deterministic-token-totals-from-native-and-legacy-observations.md)**\
   **Blocked by:** CT-22, CT-20.\
   **Delivers:** Generate stable nonnegative accounting totals without counting inherited, cached, reasoning or replayed usage twice.

24. **[CT-24 — Report usage, estimates and quota with shared time semantics](draft-tickets/24-report-usage-estimates-and-quota-with-shared-time-semantics.md)**\
   **Blocked by:** CT-23.\
   **Delivers:** Expose CLI reports and safe exports with identity-correct quotas and transparent API-equivalent estimates.

25. **[CT-25 — Run one recoverable collector without delaying launch](draft-tickets/25-run-one-recoverable-collector-without-delaying-launch.md)**\
   **Blocked by:** CT-17, CT-22.\
   **Delivers:** Start or reconnect a separately owned collector while Codex launches immediately, and recover after restarts or outages.

26. **[CT-26 — Serve authenticated local reports through a restricted API](draft-tickets/26-serve-authenticated-local-reports-through-a-restricted-api.md)**\
   **Blocked by:** CT-24, CT-25.\
   **Delivers:** Let an authenticated local browser read the same reports as the CLI while denying hostile sites and privileged actions.

27. **[CT-27 — Browse sessions, attempts and child identity contributions](draft-tickets/27-browse-sessions-attempts-and-child-identity-contributions.md)**\
   **Blocked by:** CT-21, CT-26.\
   **Delivers:** Show sessions with mixed identities, expandable attempts/children and honest evidence/health state.

28. **[CT-28 — Persist accessible presentation and consistent report filters](draft-tickets/28-persist-accessible-presentation-and-consistent-report-filters.md)**\
   **Blocked by:** CT-27.\
   **Delivers:** Provide keyboard-accessible filters and persistent appearance/session labels without rewriting upstream logs or ownership.

29. **[CT-29 — Qualify accounting, dashboard performance and accessibility](draft-tickets/29-qualify-accounting-dashboard-performance-and-accessibility.md)**\
   **Blocked by:** CT-28.\
   **Delivers:** Demonstrate G3 accounting/report correctness and resource budgets under collection load.

### G4

30. **[CT-30 — Preview and import existing profile and analytics state](draft-tickets/30-preview-and-import-existing-profile-and-analytics-state.md)**\
   **Blocked by:** CT-28.\
   **Delivers:** Import existing codex-as/codex-report state through a backed-up preview while preserving identity uncertainty and user presentation.

31. **[CT-31 — Back up, restore and upgrade with recoverable schema changes](draft-tickets/31-back-up-restore-and-upgrade-with-recoverable-schema-changes.md)**\
   **Blocked by:** CT-30.\
   **Delivers:** Create consistent non-secret analytics backups and recover safely through restore or version upgrades.

32. **[CT-32 — Diagnose and bound retained operational data](draft-tickets/32-diagnose-and-bound-retained-operational-data.md)**\
   **Blocked by:** CT-25.\
   **Delivers:** Explain runtime/source/target/recovery health through redacted diagnostics while bounding operational storage.

33. **[CT-33 — Remove managed integration safely](draft-tickets/33-remove-managed-integration-safely.md)**\
   **Blocked by:** CT-31, CT-32.\
   **Delivers:** Uninstall Tandem integration without erasing user changes, credentials or analytics by default.

34. **[CT-34 — Verify privacy and source containment across the integrated product](draft-tickets/34-verify-privacy-and-source-containment-across-the-integrated-product.md)**\
   **Blocked by:** CT-33.\
   **Delivers:** Demonstrate that secrets/content and untrusted paths cannot escape through capture, storage, reporting or diagnostics.

35. **[CT-35 — Prepare a reproducible release package and notices](draft-tickets/35-prepare-a-reproducible-release-package-and-notices.md)**\
   **Blocked by:** CT-34.\
   **Delivers:** Produce the final inspected tarball and release metadata without publishing it.

36. **[CT-36 — Qualify the final artifact locally on Windows and WSL2](draft-tickets/36-qualify-the-final-artifact-locally-on-windows-and-wsl2.md)**\
   **Blocked by:** CT-29, CT-35.\
   **Delivers:** Execute the final applicable acceptance matrix on both local platforms using the exact packaged candidate.

37. **[CT-37 — Qualify native Linux and remaining runtime/browser combinations](draft-tickets/37-qualify-native-linux-and-remaining-runtime-browser-combinations.md)**\
   **Blocked by:** CT-35.\
   **Delivers:** Complete required native Linux and supported-version evidence beyond the local Windows/WSL2 runs.

38. **[CT-38 — Close traceability and prepare the release decision](draft-tickets/38-close-traceability-and-prepare-the-release-decision.md)**\
   **Blocked by:** CT-36, CT-37.\
   **Delivers:** Deliver a complete requirements-to-evidence record and an explicit release-ready or blocked decision.

## Publication

Specification: [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2). All 38 tasks are open. Native blocking links
are unavailable on this license; each task lists the actual GitLab prerequisites.
Applicable local Windows and WSL2 validation remains mandatory.
