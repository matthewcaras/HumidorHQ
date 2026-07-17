<!--
Filename: README.md
Revision: 1.0.0
Description: Documents tracked initialization data for external HumidorHQ runtime storage.
Modified Date: 2026-07-17 11:30 ET
-->

# HumidorHQ Seed Data

These files are safe, empty initialization data tracked with the application. The API never uses this directory as runtime storage and rejects any `HUMIDORHQ_DATA_ROOT` inside the repository.

Use `tools/copy-runtime-data.ps1` to copy this seed into a new external directory. The empty `auth-users.json` intentionally contains no login. Create the first user afterward with `tools/create-auth-user.php` while `HUMIDORHQ_DATA_ROOT` points to that external directory.

Do not place live records, credentials, audit logs, lock files, temporary files, or backups in this directory.
