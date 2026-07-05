# Humidor HQ Database Design

## Philosophy

Humidor HQ is an inventory and collection management system.

Inventory is never directly edited.

Instead, inventory is calculated from historical transactions.

Every significant action creates a permanent record.

This provides:

- Complete purchase history
- Complete smoking history
- Complete transfer history
- Complete gifting history
- Complete inventory audit trail

---

# Core Entities

Manufacturer
    ↓
Brand / Line
    ↓
Vitola
    ↓
Lot
    ↓
Transactions

---

## Manufacturer

Examples

- Padron
- Arturo Fuente
- Foundation
- Oliva

---

## Line

Examples

Padron

- 1964 Anniversary
- 1926 Series
- Family Reserve

---

## Vitola

Examples

1964 Anniversary

- Exclusivo
- Torpedo
- Presidente

---

## Lot

A lot represents one purchase of one vitola.

Example

Purchased:

10 Padron 1964 Exclusivos

Vendor:
Small Batch

Purchase Date:
7/5/2026

MSRP:
$15.00

Actual Cost:
$10.75

Remaining:
8

Current Humidor:
Coolidor #1

---

## Transaction Types

Purchase

Smoke

Gift

Transfer

Adjustment

Every transaction has:

Date

Lot

Quantity

Notes