<!--
Filename: RUNTIME_DATA.md
Revision: 1.5.0
Description: Windows and Hostinger setup for HumidorHQ runtime JSON storage.
Modified Date: 2026-07-19 15:00 ET
-->

# Runtime Data Setup

HumidorHQ defaults runtime storage to `APP_ROOT/data`. `HUMIDORHQ_DATA_ROOT` is optional and may select another existing runtime directory. The selected directory may be inside the application tree.

Startup creates the selected directory when it is missing, then runs transaction journal recovery. Missing non-auth runtime collections are initialized from validated, tracked templates in `seed-data/`, and a missing audit log is created as an empty file. Initialization holds an exclusive lock, uses create-only atomic writes, is idempotent, and never overwrites an existing file. Every runtime JSON file must then be readable and writable and have the expected root structure. Existing malformed JSON is never rewritten or repaired.

`auth-users.json` is deliberately excluded from automatic seeding. If it is missing, initialization creates the non-auth collections and then returns `AUTH_USERS_SETUP_REQUIRED`. Create credentials separately with `tools/create-auth-user.php`; example users, passwords, and password hashes are never installed automatically.

Runtime JSON, credentials, and audit logs under `data/` are ignored by Git. Tracked `data/.htaccess` denies direct Apache browser access, while application data routes remain protected by PHP session authentication.

Authenticated users can create, download, import, preview, and restore portable bundles from the `Backup & Restore` page. Server-side bundles are stored under ignored `backups/`, where a separate tracked `.htaccess` denies direct HTTP access. Downloaded bundles contain password hashes and should be stored securely outside the deployment account. The append-only audit log is intentionally not included in restore bundles.

All listed bundles pass format, SHA-256, and JSON-shape checks. Backup creation and download remain available to preserve parseable legacy data even when the integrity checker reports existing defects. Import and restore also require valid IDs, counters, relationships, and Lot/balance reconciliation; those defects must be corrected before restore. Restore requires an exact confirmation phrase and a current-state fingerprint from a fresh preview. It creates a pre-restore safety bundle and uses the existing transaction journal before replacing any runtime collections. Existing runtime data is never changed merely by creating, listing, downloading, importing, or previewing a backup.

## Windows

With runtime files already under the repository `data/` directory, start normally:

```powershell
.\tools\check-data-integrity.ps1
.\start-local-server.ps1
```

No environment variable is required. To intentionally use another directory for a session:

```powershell
$env:HUMIDORHQ_DATA_ROOT = 'C:\HumidorHQ\runtime-data'
.\start-local-server.ps1
```

Create or update a user in the selected runtime directory:

```powershell
php .\tools\create-auth-user.php 'username' 'strong password' 'Display Name'
```

The guarded `tools/copy-runtime-data.ps1` utility remains available for deliberately initializing a different, empty runtime directory. It is dry-run by default and does not overwrite an existing destination.

## Hostinger

1. Keep live JSON and the audit log in the deployed HumidorHQ `data/` directory.
2. Deploy the tracked `data/.htaccess` and confirm Apache honors its deny rules.
3. Ensure PHP can create, read, and write the directory and runtime files.
4. Do not add live JSON, credentials, audit logs, locks, or temporary files to Git.
5. Leave `HUMIDORHQ_DATA_ROOT` unset to use `APP_ROOT/data`; set it only when intentionally using another existing directory.
6. Set `HUMIDORHQ_FORCE_SECURE_COOKIES=1`. Enable `HUMIDORHQ_TRUST_PROXY_HEADERS=1` only when Hostinger's proxy overwrites forwarded headers.
7. Provision `auth-users.json` securely and separately; first-run initialization will not create credentials.
8. Download important backups and store them securely off-server; the ignored server-side `backups/` directory is deployment-adjacent and is not a substitute for an off-server copy.

During the one-time transition from formerly tracked JSON, back up `data/` before pulling the commit that removes those paths from Git tracking and verify every live file remains afterward. Once untracked and ignored, later code pulls do not manage those files.

## Required runtime files

The selected directory must contain readable, writable JSON values with the expected root structures:

- `auth-users.json`
- `catalog-cigars.json`
- `counters.json`
- `inventory-events.json`
- `lot-location-balances.json`
- `lots.json`
- `purchase-lines.json`
- `purchases.json`
- `smoking-journal-entries.json`
- `storage-locations.json`
- `storage-sub-locations.json`
- `vendors.json`

Collection templates use JSON arrays. `counters.json` uses an object containing the next positive ID for every collection.

`audit-log.jsonl` is optional at startup and is created on the first audited action. If it exists, it must be readable and writable. The optional `.auth-login-state.json` and lock files are created automatically and contain no passwords or password hashes.

## Authentication environment controls

- `HUMIDORHQ_FORCE_SECURE_COOKIES=1`: always marks the session cookie Secure.
- `HUMIDORHQ_TRUST_PROXY_HEADERS=1`: trusts forwarded protocol/client headers only behind a trusted overwriting proxy.
- `HUMIDORHQ_SESSION_IDLE_SECONDS`: inactivity limit, default `1800`.
- `HUMIDORHQ_SESSION_ABSOLUTE_SECONDS`: total session limit, default `43200`.
- `HUMIDORHQ_LOGIN_USERNAME_LIMIT`: failures per username window, default `5`.
- `HUMIDORHQ_LOGIN_CLIENT_LIMIT`: failures per client window, default `20`.
- `HUMIDORHQ_LOGIN_WINDOW_SECONDS`: failure-count window, default `900`.
- `HUMIDORHQ_LOGIN_LOCK_SECONDS`: throttle duration, default `900`.
- `HUMIDORHQ_TIMEZONE`: local calendar timezone, default `America/Indiana/Indianapolis`.

## Startup failures

- `DATA_ROOT_CREATE_FAILED`, `DATA_ROOT_MISSING`, or `DATA_ROOT_NOT_DIRECTORY`: the selected path cannot be created or used as a directory.
- `DATA_ROOT_NOT_WRITABLE`: PHP cannot read or write the directory.
- `DATA_FILE_MISSING`, `DATA_FILE_NOT_WRITABLE`, or `DATA_FILE_INVALID_JSON`: a required collection cannot be used safely.
- `DATA_SEED_MISSING` or `DATA_SEED_INVALID_JSON`: a required tracked initialization template cannot be used safely.
- `DATA_INITIALIZATION_LOCK_FAILED` or `DATA_FILE_CREATE_FAILED`: create-only initialization could not complete safely.
- `AUTH_USERS_SETUP_REQUIRED`: non-auth collections are ready, but credentials must be provisioned separately.
- `AUDIT_FILE_NOT_WRITABLE`: the existing audit log cannot be safely accessed.
- `DATA_TRANSACTION_RECOVERY_FAILED`: an interrupted transaction could not be safely recovered.
