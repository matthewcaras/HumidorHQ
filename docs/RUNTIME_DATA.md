<!--
Filename: RUNTIME_DATA.md
Revision: 1.3.0
Description: Windows and Hostinger setup for HumidorHQ runtime JSON storage.
Modified Date: 2026-07-19 10:00 ET
-->

# Runtime Data Setup

HumidorHQ defaults runtime storage to `APP_ROOT/data`. `HUMIDORHQ_DATA_ROOT` is optional and may select another existing runtime directory. The selected directory may be inside the application tree.

Startup validates that the selected directory exists and is readable and writable. Every required JSON file must exist, be readable and writable, and decode to a JSON array. Transaction journal recovery runs before normal API startup. No startup validation rewrites or repairs runtime JSON.

Runtime JSON, credentials, and audit logs under `data/` are ignored by Git. Tracked `data/.htaccess` denies direct Apache browser access, while application data routes remain protected by PHP session authentication. Keep backups outside `data/` and outside any directory replaced by deployment tooling.

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
3. Ensure PHP can read and write the directory and required runtime files.
4. Do not add live JSON, credentials, audit logs, locks, or temporary files to Git.
5. Leave `HUMIDORHQ_DATA_ROOT` unset to use `APP_ROOT/data`; set it only when intentionally using another existing directory.
6. Set `HUMIDORHQ_FORCE_SECURE_COOKIES=1`. Enable `HUMIDORHQ_TRUST_PROXY_HEADERS=1` only when Hostinger's proxy overwrites forwarded headers.
7. Keep backups outside the runtime directory and outside any deployment replacement target.

During the one-time transition from formerly tracked JSON, back up `data/` before pulling the commit that removes those paths from Git tracking and verify every live file remains afterward. Once untracked and ignored, later code pulls do not manage those files.

## Required runtime files

The selected directory must contain readable, writable JSON arrays named:

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

- `DATA_ROOT_MISSING` or `DATA_ROOT_NOT_DIRECTORY`: the selected path is unavailable.
- `DATA_ROOT_NOT_WRITABLE`: PHP cannot read or write the directory.
- `DATA_FILE_MISSING`, `DATA_FILE_NOT_WRITABLE`, or `DATA_FILE_INVALID_JSON`: a required collection cannot be used safely.
- `AUDIT_FILE_NOT_WRITABLE`: the existing audit log cannot be safely accessed.
- `DATA_TRANSACTION_RECOVERY_FAILED`: an interrupted transaction could not be safely recovered.
