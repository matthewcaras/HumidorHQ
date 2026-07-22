<!--
Filename: README.md
Revision: 1.1.0
Description: Documents tracked initialization data for optional HumidorHQ runtime copies.
Modified Date: 2026-07-19 10:00 ET
-->

# HumidorHQ Seed Data

These files are safe, empty initialization data tracked with the application. Normal runtime storage defaults to `data/`; this directory is only a source for deliberately initialized copies.

Use `tools/copy-runtime-data.ps1` when intentionally creating another runtime directory. The empty `auth-users.json` intentionally contains no login. Set the optional `HUMIDORHQ_DATA_ROOT` override and create the first user afterward.

Do not place live records, credentials, audit logs, lock files, temporary files, or backups in this directory.
