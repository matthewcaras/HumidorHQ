<?php
declare(strict_types=1);

function find_by_id(string $collection, int $id): ?array
{
    foreach (load_collection($collection) as $row) {
        if (is_array($row) && (int) ($row['id'] ?? 0) === $id) {
            return $row;
        }
    }
    return null;
}

function find_first_by_field(string $collection, string $field, mixed $value): ?array
{
    foreach (load_collection($collection) as $row) {
        if (is_array($row) && ($row[$field] ?? null) === $value) {
            return $row;
        }
    }
    return null;
}

function upsert_by_field(string $collection, string $field, mixed $value, callable $create, callable $update): array
{
    $rows = load_collection($collection);
    foreach ($rows as $index => $row) {
        if (is_array($row) && ($row[$field] ?? null) === $value) {
            $rows[$index] = $update($row);
            save_collection($collection, $rows);
            return $rows[$index];
        }
    }
    $rows[] = $create();
    save_collection($collection, $rows);
    return $rows[array_key_last($rows)];
}

function delete_by_field(string $collection, string $field, mixed $value): array
{
    $rows = load_collection($collection);
    foreach ($rows as $index => $row) {
        if (is_array($row) && ($row[$field] ?? null) === $value) {
            $deleted = $row;
            array_splice($rows, $index, 1);
            save_collection($collection, $rows);
            return $deleted;
        }
    }
    throw new ApiError('JOURNAL_ENTRY_NOT_FOUND', 'Smoking Journal entry was not found.', 404);
}
