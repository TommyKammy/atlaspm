# DB performance baseline (P4-3)

Use this flow before changing indexes:

1. Ensure Postgres has representative data (seed + realistic task counts).
2. Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/atlaspm_dev ./scripts/db-explain-baseline.sh
```

3. Review the generated report:

- `docs/perf/EXPLAIN_BASELINE.md`

After index changes, run the same command again and compare:

- Total execution time
- Buffers read/hit
- Whether plans switched from `Seq Scan` to index-based paths where expected

Notes:
- This is a local measurement harness for before/after comparison.
- Keep `ANALYZE` output as evidence in PR notes for issue #73.
