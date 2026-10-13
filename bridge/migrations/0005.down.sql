-- Version 5 undone: no maintenance leases (a migration down below 5 asks every writer stopped, docs/en/UPGRADING.md).
DROP INDEX maintenance_expires;
DROP INDEX maintenance_one_exclusive;
DROP TABLE maintenance;
