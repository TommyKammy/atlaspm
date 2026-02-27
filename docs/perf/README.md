# DB performance baseline (P4-3)

Use this flow before changing indexes:

1. Ensure Postgres has representative data (seed + realistic task counts).
2. Generate the baseline report:

```bash
# Option A: local psql (set DATABASE_URL)
DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm ./scripts/db-explain-baseline.sh

# Option B: no local psql needed (uses docker exec atlaspm-postgres)
./scripts/db-explain-baseline.sh
```

3. Apply index migration and generate after report:

```bash
REPORT_TITLE="AtlasPM DB EXPLAIN After Indexes (Wave2)" \
  ./scripts/db-explain-baseline.sh docs/perf/EXPLAIN_AFTER_INDEXES.md
```

4. Build before/after diff report:

```bash
./scripts/db-explain-compare.sh \
  docs/perf/EXPLAIN_BASELINE.md \
  docs/perf/EXPLAIN_AFTER_INDEXES.md \
  docs/perf/EXPLAIN_COMPARE_WAVE2.md
```

5. Review generated reports:

- `docs/perf/EXPLAIN_BASELINE.md`
- `docs/perf/EXPLAIN_AFTER_INDEXES.md`
- `docs/perf/EXPLAIN_COMPARE_WAVE2.md`

Compare:
- Execution time delta (before vs after)
- Buffers read/hit
- Planner path changes (`Bitmap Index Scan` / `Index Scan` usage)

Notes:
- This is a local measurement harness for before/after comparison.
- Keep comparison output as evidence in PR notes for issue #73.
