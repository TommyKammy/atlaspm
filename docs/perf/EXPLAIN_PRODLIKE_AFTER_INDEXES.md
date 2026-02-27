# AtlasPM DB EXPLAIN Prodlike After Indexes (Wave2)

- GeneratedAtUTC: 2026-02-27T12:04:40Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                             QUERY PLAN                                                                              
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.64..62.68 rows=500 width=34) (actual time=0.049..0.642 rows=500 loops=1)
   Buffers: shared hit=505 read=6
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.028..0.029 rows=1 loops=1)
           Buffers: shared hit=5
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.028..0.028 rows=1 loops=1)
                 Buffers: shared hit=5
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.027..0.028 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=5
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.005..0.011 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_active_project_section_position_idx" on "Task" t  (cost=0.41..6384.99 rows=54076 width=34) (actual time=0.048..0.622 rows=500 loops=1)
         Index Cond: ("projectId" = $0)
         Buffers: shared hit=505 read=6
 Planning:
   Buffers: shared hit=310 read=3
 Planning Time: 0.751 ms
 Execution Time: 0.683 ms
(20 rows)

Time: 2.493 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                                                                 QUERY PLAN                                                                                                                                                  
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2262.44..2263.69 rows=500 width=41) (actual time=3.398..3.429 rows=500 loops=1)
   Buffers: shared hit=1731 read=9
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.015..0.016 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.015..0.015 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.015..0.015 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.002..0.006 rows=81 loops=1)
                             Buffers: shared hit=2
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.061..0.061 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.061..0.061 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.060..0.061 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.004..0.032 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=2244.68..2255.50 rows=4327 width=41) (actual time=3.397..3.408 rows=500 loops=1)
         Sort Key: t."dueAt"
         Sort Method: top-N heapsort  Memory: 83kB
         Buffers: shared hit=1731 read=9
         ->  Bitmap Heap Scan on "Task" t  (cost=144.57..2029.07 rows=4327 width=41) (actual time=0.454..2.928 rows=4916 loops=1)
               Recheck Cond: ((("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1) AND (deleted_at IS NULL)) OR (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL) AND (deleted_at IS NULL)))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Rows Removed by Filter: 2300
               Heap Blocks: exact=1714
               Buffers: shared hit=1731 read=9
               ->  BitmapOr  (cost=144.57..144.57 rows=6820 width=0) (actual time=0.349..0.350 rows=0 loops=1)
                     Buffers: shared hit=17 read=9
                     ->  Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..9.51 rows=73 width=0) (actual time=0.223..0.223 rows=2197 loops=1)
                           Index Cond: (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1))
                           Buffers: shared hit=13 read=5
                     ->  Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..132.91 rows=6747 width=0) (actual time=0.126..0.126 rows=5019 loops=1)
                           Index Cond: (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL))
                           Buffers: shared hit=4 read=4
 Planning:
   Buffers: shared hit=68
 Planning Time: 0.251 ms
 Execution Time: 3.500 ms
(46 rows)

Time: 4.649 ms
--- Q3: Recently updated tasks in project ---
                                                                            QUERY PLAN                                                                             
-------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.52..23.21 rows=200 width=23) (actual time=0.037..0.081 rows=200 loops=1)
   Buffers: shared hit=202 read=2
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.016..0.017 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.016..0.016 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.016..0.016 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.003..0.007 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_active_project_updatedAt_desc_idx" on "Task" t  (cost=0.29..5324.87 rows=54076 width=23) (actual time=0.037..0.073 rows=200 loops=1)
         Index Cond: ("projectId" = $0)
         Buffers: shared hit=202 read=2
 Planning:
   Buffers: shared hit=5
 Planning Time: 0.103 ms
 Execution Time: 0.099 ms
(20 rows)

Time: 0.458 ms
--- Q4: Audit timeline for latest task ---
                                                                                      QUERY PLAN                                                                                       
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2614.30..2660.33 rows=500 width=42) (actual time=9.699..9.780 rows=500 loops=1)
   Buffers: shared hit=1732
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=2614.00..2614.01 rows=1 width=15) (actual time=9.664..9.665 rows=1 loops=1)
           Buffers: shared hit=1714
           ->  Limit  (cost=2614.00..2614.00 rows=1 width=23) (actual time=9.663..9.664 rows=1 loops=1)
                 Buffers: shared hit=1714
                 ->  Sort  (cost=2614.00..2764.00 rows=60000 width=23) (actual time=9.663..9.663 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=1714
                       ->  Seq Scan on "Task"  (cost=0.00..2314.00 rows=60000 width=23) (actual time=0.002..6.426 rows=60000 loops=1)
                             Buffers: shared hit=1714
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=9.698..9.760 rows=500 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=1732
 Planning:
   Buffers: shared hit=54
 Planning Time: 0.174 ms
 Execution Time: 9.802 ms
(20 rows)

Time: 10.327 ms
--- Q5: Inbox unread list ---
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1343.82..1344.32 rows=200 width=36) (actual time=3.874..3.888 rows=200 loops=1)
   Buffers: shared hit=438
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.057..0.058 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.056..0.057 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.056..0.057 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.003..0.030 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=1329.29..1366.79 rows=15000 width=36) (actual time=3.873..3.878 rows=200 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: top-N heapsort  Memory: 53kB
         Buffers: shared hit=438
         ->  Seq Scan on inbox_notifications n  (cost=0.00..681.00 rows=15000 width=36) (actual time=0.062..2.170 rows=15000 loops=1)
               Filter: ((read_at IS NULL) AND (user_id = $0))
               Rows Removed by Filter: 5000
               Buffers: shared hit=438
 Planning:
   Buffers: shared hit=88
 Planning Time: 0.268 ms
 Execution Time: 3.916 ms
(25 rows)

Time: 4.557 ms
```
