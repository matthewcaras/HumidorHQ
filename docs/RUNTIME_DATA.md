<!--
Filename: RUNTIME_DATA.md
Revision: 1.2.0
Description: Windows and Hostinger setup for HumidorHQ external runtime JSON storage.
Modified Date: 2026-07-17 19:00 ET
-->

# External Runtime Data Setup

HumidorHQ requires `HUMIDORHQ_DATA_ROOT` to identify an existing, readable, writable directory outside the repository or deployed application directory. The API has no repository-data fallback. A code deployment can replace the entire application tree without touching live JSON because live JSON is not below that tree.

The tracked `seed-data/` directory contains empty initialization records only. The repository `data/` directory is retained temporarily as the explicit legacy-copy source for existing local records; the application will reject it as a runtime root.

## Windows: preserve the current local data

Choose external sibling directories that are not inside `C:\Development\HumidorHQ`. Preview the copy first:

```powershell
.\tools\copy-runtime-data.ps1 `
  -SourceRoot 'C:\Development\HumidorHQ\data' `
  -DestinationRoot 'C:\HumidorHQ\runtime-data' `
  -ManifestRoot 'C:\HumidorHQ\migration-manifests'
```

The default is dry-run. After reviewing the source, empty destination, and manifest location, perform the one-time copy explicitly:

```powershell
.\tools\copy-runtime-data.ps1 `
  -SourceRoot 'C:\Development\HumidorHQ\data' `
  -DestinationRoot 'C:\HumidorHQ\runtime-data' `
  -ManifestRoot 'C:\HumidorHQ\migration-manifests' `
  -Apply `
  -Confirmation 'COPY-HUMIDORHQ-RUNTIME-DATA'
```

The utility refuses a destination inside the repository and refuses any nonempty destination. It copies only required JSON plus an existing audit log, verifies SHA-256 hashes, writes a timestamped external manifest, and removes newly created files if verification fails.

Set the variable for the current PowerShell session and, optionally, future sessions:

```powershell
$env:HUMIDORHQ_DATA_ROOT = 'C:\HumidorHQ\runtime-data'
[Environment]::SetEnvironmentVariable('HUMIDORHQ_DATA_ROOT', 'C:\HumidorHQ\runtime-data', 'User')
```

Validate the copied data and start the app:

```powershell
.\tools\check-data-integrity.ps1
.\start-local-server.ps1
```

For a new empty installation, omit `-SourceRoot` to copy tracked seed data. Then set the environment variable and create the first user before starting PHP:

```powershell
php .\tools\create-auth-user.php 'username' 'strong password' 'Display Name'
```

Do not delete or reset the legacy `data/` directory until the external copy, manifest, integrity result, login, and backup have all been verified separately.

## Hostinger

1. Create a private directory outside `public_html` and outside any Git deployment target, for example `/home/ACCOUNT/humidorhq-runtime`.
2. Copy verified runtime JSON into that directory using SFTP/SSH or a separately rehearsed migration. Do not initialize it by deploying repository `data/`.
3. Restrict ownership to the account/PHP worker. A typical target is directory mode `700` and file mode `600`, adjusted only if Hostinger's PHP worker requires a shared group.
4. Configure `HUMIDORHQ_DATA_ROOT=/home/ACCOUNT/humidorhq-runtime` in Hostinger's persistent environment/PHP configuration. If Hostinger requires Apache `SetEnv`, add it through the server-managed configuration and keep the account-specific absolute path out of Git.
   Also set `HUMIDORHQ_FORCE_SECURE_COOKIES=1`. Enable `HUMIDORHQ_TRUST_PROXY_HEADERS=1` only when Hostinger's proxy overwrites `X-Forwarded-Proto` and `X-Forwarded-For` rather than accepting client-supplied values.
5. Confirm PHP can read and write the directory and required JSON. The API returns HTTP 503 with a `DATA_ROOT_*` error until configuration is valid.
6. Keep backups and copy manifests outside both `public_html` and the runtime directory.
7. Deploy only code and tracked `seed-data/`. Never make the external runtime directory a webhook, Git checkout, release-extraction, or synchronization target.

## Required runtime files

The external directory must contain readable, writable JSON files named:

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

`audit-log.jsonl` is optional at startup and is created on the first audited action. If it exists, it must also be readable and writable.

The optional `.auth-login-state.json` and its lock are created automatically in the external runtime directory after login activity. The state contains hashed throttle keys and timestamps, never passwords or password hashes.

## Authentication environment controls

- `HUMIDORHQ_FORCE_SECURE_COOKIES=1`: always marks the session cookie Secure; recommended for Hostinger HTTPS.
- `HUMIDORHQ_TRUST_PROXY_HEADERS=1`: trusts forwarded protocol/client headers; use only behind a trusted, overwriting proxy.
- `HUMIDORHQ_SESSION_IDLE_SECONDS`: inactivity limit, default `1800`.
- `HUMIDORHQ_SESSION_ABSOLUTE_SECONDS`: total session limit, default `43200`.
- `HUMIDORHQ_LOGIN_USERNAME_LIMIT`: failures per username window, default `5`.
- `HUMIDORHQ_LOGIN_CLIENT_LIMIT`: failures per client window, default `20`.
- `HUMIDORHQ_LOGIN_WINDOW_SECONDS`: failure-count window, default `900`.
- `HUMIDORHQ_LOGIN_LOCK_SECONDS`: throttle duration, default `900`.
- `HUMIDORHQ_TIMEZONE`: local calendar timezone for inventory event dates, default `America/Indiana/Indianapolis`.

## Startup failures

- `DATA_ROOT_NOT_CONFIGURED`: the environment variable is empty.
- `DATA_ROOT_MISSING` or `DATA_ROOT_NOT_DIRECTORY`: the configured path is unavailable.
- `DATA_ROOT_INSIDE_APP`: the path points into the Git/deployment tree.
- `DATA_ROOT_NOT_WRITABLE`: PHP cannot read or write the directory.
- `DATA_FILE_MISSING`, `DATA_FILE_NOT_WRITABLE`, or `DATA_FILE_INVALID_JSON`: a required collection cannot be used safely.
- `AUDIT_FILE_NOT_WRITABLE`: the existing audit log cannot be safely accessed.
