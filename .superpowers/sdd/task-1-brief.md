### Task 1: Create conversion tracking artifacts

**Files:**
- Create: `docs/php-json-conversion/file-map.md`
- Create: `docs/php-json-conversion/change-log.md`
- Create: `docs/php-json-conversion/upstream-sync-checklist.md`
- Modify: `docs/superpowers/specs/2026-07-13-humidorhq-php-json-conversion-design.md`

**Interfaces:**
- Consumes: approved design spec requirements.
- Produces: `file-map.md` mapping rows with columns `upstream source | php target | responsibility | status | notes`; `change-log.md` entries with `date`, `upstream ref`, `changed files`, `reviewed php files`, `gaps`; `upstream-sync-checklist.md` step list for future resyncs.

- [ ] **Step 1: Write the initial documentation tests as acceptance checklists**

```md
# docs/php-json-conversion/file-map.md

## Acceptance Checklist
- [ ] Every upstream backend source file has a mapped PHP target.
- [ ] `src/services/api.ts` is mapped to its PHP-facing compatibility work.
- [ ] `prisma/schema.prisma` is mapped to runtime JSON files and migration scripts.
```

```md
# docs/php-json-conversion/change-log.md

## Entry Template
- Date:
- Upstream ref:
- Changed upstream files:
- Reviewed PHP files:
- Parity gaps:
```

- [ ] **Step 2: Verify the docs do not exist yet**

Run: `Test-Path .\docs\php-json-conversion\file-map.md; Test-Path .\docs\php-json-conversion\change-log.md; Test-Path .\docs\php-json-conversion\upstream-sync-checklist.md`
Expected: `False False False`

- [ ] **Step 3: Write the three docs with concrete mappings and procedure**

```md
# PHP/JSON Conversion File Map

| Upstream source | PHP target | Responsibility | Status | Notes |
| --- | --- | --- | --- | --- |
| `server/index.ts` | `api/index.php`, `api/bootstrap.php`, `api/lib/Response.php`, `api/lib/Validation.php` | Route dispatch and response contract | Planned | Route contract must stay stable for frontend |
| `server/services/dashboardService.ts` | `api/lib/services/DashboardService.php` | Dashboard aggregates and issues | Planned | Verify totals against Node version |
| `server/services/catalogService.ts` | `api/lib/services/CatalogService.php` | Catalog reads and writes | Planned | Preserve archive and restore semantics |
```

```md
# PHP/JSON Conversion Change Log

- Date: 2026-07-13
- Upstream ref: `upstream/main@f065979`
- Changed upstream files: initial baseline
- Reviewed PHP files: none yet
- Parity gaps: full conversion pending
```

```md
# Upstream Sync Checklist

1. `git fetch upstream`
2. `git diff --name-only <last-reviewed-upstream-ref> upstream/main`
3. For each changed upstream file, locate mapped PHP target in `file-map.md`.
4. Review and update affected PHP files.
5. Append reviewed items to `change-log.md`.
6. Run targeted parity checks for impacted workflows.
7. Run broader regression checks before deploy.
```

- [ ] **Step 4: Verify the docs exist and contain required anchors**

Run: `Get-Content .\docs\php-json-conversion\file-map.md | Select-String 'server/index.ts|dashboardService'; Get-Content .\docs\php-json-conversion\upstream-sync-checklist.md | Select-String 'git diff --name-only'`
Expected: matching lines found

- [ ] **Step 5: Commit**

```bash
git add docs/php-json-conversion docs/superpowers/specs/2026-07-13-humidorhq-php-json-conversion-design.md
git commit -m "docs: add php json conversion tracking artifacts"
```

