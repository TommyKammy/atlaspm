#!/usr/bin/env bash
set -euo pipefail

BEFORE_REPORT="${1:-docs/perf/EXPLAIN_BASELINE.md}"
AFTER_REPORT="${2:-docs/perf/EXPLAIN_AFTER_INDEXES.md}"
OUTPUT_REPORT="${3:-docs/perf/EXPLAIN_COMPARE_WAVE2.md}"

if [[ ! -f "$BEFORE_REPORT" ]]; then
  echo "Before report not found: $BEFORE_REPORT"
  exit 1
fi

if [[ ! -f "$AFTER_REPORT" ]]; then
  echo "After report not found: $AFTER_REPORT"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_REPORT")"

awk -v before="$BEFORE_REPORT" -v after="$AFTER_REPORT" '
function parse_report(path, prefix,    line, query, title, plan, time) {
  query=""
  while ((getline line < path) > 0) {
    if (line ~ /^--- Q[0-9]+:/) {
      split(line, parts, " ")
      query = parts[2]
      gsub(":", "", query)
      title = line
      sub(/^--- /, "", title)
      sub(/ ---$/, "", title)
      data[prefix, query, "title"] = title
      continue
    }

    if (query == "") {
      continue
    }

    if (line ~ /Execution Time:/) {
      split(line, parts, " ")
      data[prefix, query, "time"] = parts[3]
      continue
    }

    if (data[prefix, query, "plan"] == "" && line ~ /(Bitmap Index Scan on|Index Scan using|Index Scan Backward using)/) {
      plan = line
      sub(/^[[:space:]-]*>/, "", plan)
      sub(/^[[:space:]]+/, "", plan)
      data[prefix, query, "plan"] = plan
    }
  }
  close(path)
}

function trim_query_title(value,    out) {
  out = value
  sub(/^Q[0-9]+: /, "", out)
  return out
}

BEGIN {
  parse_report(before, "before")
  parse_report(after, "after")

  print "# AtlasPM DB EXPLAIN Before/After Comparison"
  print ""
  cmd = "date -u +\"%Y-%m-%dT%H:%M:%SZ\""
  cmd | getline generated_at
  close(cmd)
  print "- GeneratedAtUTC: " generated_at
  print "- Before report: `" before "`"
  print "- After report: `" after "`"
  print ""
  print "> Positive delta means slower after index changes; negative delta means faster."
  print ""
  print "| Query | Before (ms) | After (ms) | Delta (ms) | Delta (%) |"
  print "| --- | ---: | ---: | ---: | ---: |"

  for (i = 1; i <= 9; i++) {
    query = "Q" i
    after_time = data["after", query, "time"]
    if (after_time == "") {
      continue
    }
    before_time = data["before", query, "time"]
    if (before_time == "") {
      before_time = "0"
    }
    delta = after_time - before_time
    if (before_time == 0) {
      delta_percent = "n/a"
    } else {
      delta_percent = sprintf("%.1f%%", (delta / before_time) * 100)
    }
    title = data["after", query, "title"]
    if (title == "") {
      title = data["before", query, "title"]
    }
    printf("| %s (%s) | %s | %s | %.3f | %s |\n", query, trim_query_title(title), before_time, after_time, delta, delta_percent)
  }

  print ""
  print "## Plan Changes"
  print ""
  for (i = 1; i <= 9; i++) {
    query = "Q" i
    after_time = data["after", query, "time"]
    if (after_time == "") {
      continue
    }
    title = data["after", query, "title"]
    if (title == "") {
      title = data["before", query, "title"]
    }
    before_plan = data["before", query, "plan"]
    if (before_plan == "") {
      before_plan = "n/a"
    }
    after_plan = data["after", query, "plan"]
    if (after_plan == "") {
      after_plan = "n/a"
    }
    printf("### %s - %s\n\n", query, trim_query_title(title))
    printf("- Before: `%s`\n", before_plan)
    printf("- After: `%s`\n\n", after_plan)
  }

  print "## Notes"
  print ""
  print "- This comparison is generated from local development data."
  print "- For production decision-making, rerun on representative dataset snapshots."
}
' > "$OUTPUT_REPORT"

echo "Wrote comparison report: $OUTPUT_REPORT"
