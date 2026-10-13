### Changes

- **A restore has the store alone, or nothing** (4.1.20, ADR 0023): from store schema 5 (migration 0005), `serve` and
  every writing command hold a maintenance lease in the store itself. `restore` and a migration down take the store
  alone. They are refused at once, naming who holds it, while anything else serves or writes. Leases run on the
  database's clock, and an expired lease is never in the way. On Postgres an advisory lock rides beside the lease, on a
  connection of its own (`--lock-timeout`). A `serve` that loses its lease holds its writes (503) and fails `/readyz`
  until it takes one again. **Stop every Bridge older than 4.1.20 before the first restore** (`docs/en/UPGRADING.md`
  §32).
