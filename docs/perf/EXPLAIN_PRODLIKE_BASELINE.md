# AtlasPM DB EXPLAIN Prodlike Baseline (Wave1 only)

- GeneratedAtUTC: 2026-02-27T12:04:40Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                            QUERY PLAN                                                                            
------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.64..78.24 rows=500 width=34) (actual time=0.061..0.655 rows=500 loops=1)
   Buffers: shared hit=514
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.032..0.033 rows=1 loops=1)
           Buffers: shared hit=5
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.031..0.032 rows=1 loops=1)
                 Buffers: shared hit=5
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.031..0.031 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=5
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.005..0.012 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_projectId_sectionId_position_idx" on "Task" t  (cost=0.41..8051.73 rows=53962 width=34) (actual time=0.060..0.636 rows=500 loops=1)
         Index Cond: ("projectId" = $0)
         Filter: (deleted_at IS NULL)
         Buffers: shared hit=514
 Planning:
   Buffers: shared hit=246
 Planning Time: 0.508 ms
 Execution Time: 0.690 ms
(21 rows)

Time: 2.096 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                                                                 QUERY PLAN                                                                                                                                                  
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2289.34..2290.59 rows=500 width=41) (actual time=3.319..3.351 rows=500 loops=1)
   Buffers: shared hit=1743
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.013..0.014 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.013..0.014 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.013..0.013 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.002..0.005 rows=81 loops=1)
                             Buffers: shared hit=2
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.069..0.069 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.069..0.069 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.069..0.069 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.004..0.036 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=2271.59..2282.46 rows=4349 width=41) (actual time=3.319..3.331 rows=500 loops=1)
         Sort Key: t."dueAt"
         Sort Method: top-N heapsort  Memory: 83kB
         Buffers: shared hit=1743
         ->  Bitmap Heap Scan on "Task" t  (cost=169.90..2054.88 rows=4349 width=41) (actual time=0.474..2.883 rows=4916 loops=1)
               Recheck Cond: ((("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1)) OR (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL)))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Rows Removed by Filter: 2300
               Heap Blocks: exact=1714
               Buffers: shared hit=1743
               ->  BitmapOr  (cost=169.90..169.90 rows=6839 width=0) (actual time=0.383..0.383 rows=0 loops=1)
                     Buffers: shared hit=29
                     ->  Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..9.66 rows=73 width=0) (actual time=0.248..0.248 rows=2197 loops=1)
                           Index Cond: (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1))
                           Buffers: shared hit=20
                     ->  Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..158.07 rows=6766 width=0) (actual time=0.134..0.134 rows=5019 loops=1)
                           Index Cond: (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL))
                           Buffers: shared hit=9
 Planning:
   Buffers: shared hit=68
 Planning Time: 0.216 ms
 Execution Time: 3.409 ms
(46 rows)

Time: 4.432 ms
--- Q3: Recently updated tasks in project ---
                                                               QUERY PLAN                                                                
-----------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=4530.28..4553.28 rows=200 width=23) (actual time=6.410..7.576 rows=200 loops=1)
   Buffers: shared hit=1752
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.015..0.016 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.015..0.015 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.015..0.015 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.003..0.007 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Gather Merge  (cost=4527.05..8177.38 rows=31742 width=23) (actual time=6.410..7.566 rows=200 loops=1)
         Workers Planned: 1
         Params Evaluated: $0
         Workers Launched: 1
         Buffers: shared hit=1752
         ->  Sort  (cost=3527.04..3606.40 rows=31742 width=23) (actual time=5.244..5.251 rows=172 loops=2)
               Sort Key: t."updatedAt" DESC
               Sort Method: top-N heapsort  Memory: 39kB
               Buffers: shared hit=1750
               Worker 0:  Sort Method: top-N heapsort  Memory: 39kB
               ->  Parallel Seq Scan on "Task" t  (cost=0.00..2155.18 rows=31742 width=23) (actual time=0.006..3.869 rows=27000 loops=2)
                     Filter: ((deleted_at IS NULL) AND ("projectId" = $0))
                     Rows Removed by Filter: 3000
                     Buffers: shared hit=1714
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.065 ms
 Execution Time: 7.598 ms
(31 rows)

Time: 7.913 ms
--- Q4: Audit timeline for latest task ---
                                                                                      QUERY PLAN                                                                                       
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2614.30..2660.33 rows=500 width=42) (actual time=9.223..9.310 rows=500 loops=1)
   Buffers: shared hit=1732
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=2614.00..2614.01 rows=1 width=15) (actual time=9.160..9.161 rows=1 loops=1)
           Buffers: shared hit=1714
           ->  Limit  (cost=2614.00..2614.00 rows=1 width=23) (actual time=9.159..9.159 rows=1 loops=1)
                 Buffers: shared hit=1714
                 ->  Sort  (cost=2614.00..2764.00 rows=60000 width=23) (actual time=9.158..9.158 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=1714
                       ->  Seq Scan on "Task"  (cost=0.00..2314.00 rows=60000 width=23) (actual time=0.002..6.046 rows=60000 loops=1)
                             Buffers: shared hit=1714
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=9.223..9.290 rows=500 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=1732
 Planning:
   Buffers: shared hit=52
 Planning Time: 0.205 ms
 Execution Time: 9.336 ms
(20 rows)

Time: 9.837 ms
--- Q5: Inbox unread list ---
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1343.82..1344.32 rows=200 width=36) (actual time=3.838..3.852 rows=200 loops=1)
   Buffers: shared hit=438
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.065..0.065 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.064..0.065 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.064..0.064 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.002..0.037 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=1329.29..1366.79 rows=15000 width=36) (actual time=3.838..3.842 rows=200 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: top-N heapsort  Memory: 53kB
         Buffers: shared hit=438
         ->  Seq Scan on inbox_notifications n  (cost=0.00..681.00 rows=15000 width=36) (actual time=0.069..2.167 rows=15000 loops=1)
               Filter: ((read_at IS NULL) AND (user_id = $0))
               Rows Removed by Filter: 5000
               Buffers: shared hit=438
 Planning:
   Buffers: shared hit=88
 Planning Time: 0.275 ms
 Execution Time: 3.872 ms
(25 rows)

Time: 4.363 ms
```
