# HumidorHQ Codex Guidelines

## Purpose

Codex is an implementation assistant.

It should help write code but should never make product or architectural decisions on its own.

## Development Workflow

1. Discuss the feature before writing code.
2. Design database changes before implementation.
3. Design API changes before frontend changes.
4. Implement only the requested feature.
5. Summarize all modified files.
6. Never commit code.
7. Wait for review before additional changes.

## Coding Standards

- Follow the existing project structure.
- Use TypeScript best practices.
- Keep React components readable.
- Prefer small reusable functions.
- Do not introduce unnecessary dependencies.
- Match existing naming conventions.

## Things Codex Should Never Change Without Approval

- Database schema
- Project architecture
- Folder structure
- API routes
- Third-party packages

## Design Philosophy

HumidorHQ follows these principles:

- Enter facts once.
- Never type the same thing twice.
- Preserve complete history.
- Let the software calculate everything possible.
- Reduce friction.

## Response Expectations

After making changes:

1. List every modified file.
2. Explain why each file changed.
3. Mention anything that should be manually tested.
4. Do not commit changes.
