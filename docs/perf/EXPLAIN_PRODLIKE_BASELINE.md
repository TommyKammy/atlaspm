# AtlasPM DB EXPLAIN Prodlike Baseline (Wave1 only)

- GeneratedAtUTC: 2026-03-09T02:05:24Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                            QUERY PLAN                                                                            
------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.64..79.42 rows=500 width=34) (actual time=0.210..3.053 rows=500 loops=1)
   Buffers: shared hit=514
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.137..0.140 rows=1 loops=1)
           Buffers: shared hit=5
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.135..0.137 rows=1 loops=1)
                 Buffers: shared hit=5
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.134..0.136 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=5
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.021..0.045 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_projectId_sectionId_position_idx" on "Task" t  (cost=0.41..8169.66 rows=53904 width=34) (actual time=0.208..2.965 rows=500 loops=1)
         Index Cond: ("projectId" = $0)
         Filter: (deleted_at IS NULL)
         Buffers: shared hit=514
 Planning:
   Buffers: shared hit=331
 Planning Time: 4.800 ms
 Execution Time: 3.236 ms
(21 rows)

Time: 13.544 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                                                                 QUERY PLAN                                                                                                                                                  
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2349.99..2351.24 rows=500 width=41) (actual time=14.536..14.646 rows=500 loops=1)
   Buffers: shared hit=1794
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.073..0.076 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.072..0.074 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.072..0.073 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.008..0.024 rows=81 loops=1)
                             Buffers: shared hit=2
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.302..0.304 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.302..0.303 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.302..0.302 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.010..0.143 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=2332.23..2343.15 rows=4369 width=41) (actual time=14.534..14.577 rows=500 loops=1)
         Sort Key: t."dueAt"
         Sort Method: top-N heapsort  Memory: 83kB
         Buffers: shared hit=1794
         ->  Bitmap Heap Scan on "Task" t  (cost=178.15..2114.53 rows=4369 width=41) (actual time=1.690..11.886 rows=4916 loops=1)
               Recheck Cond: ((("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1)) OR (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL)))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Rows Removed by Filter: 2300
               Heap Blocks: exact=1765
               Buffers: shared hit=1794
               ->  BitmapOr  (cost=178.15..178.15 rows=6855 width=0) (actual time=1.372..1.374 rows=0 loops=1)
                     Buffers: shared hit=29
                     ->  Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..9.66 rows=73 width=0) (actual time=0.966..0.966 rows=2197 loops=1)
                           Index Cond: (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1))
                           Buffers: shared hit=20
                     ->  Bitmap Index Scan on "Task_projectId_deleted_at_status_assigneeUserId_dueAt_idx"  (cost=0.00..166.31 rows=6782 width=0) (actual time=0.405..0.405 rows=5019 loops=1)
                           Index Cond: (("projectId" = $0) AND (deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL))
                           Buffers: shared hit=9
 Planning:
   Buffers: shared hit=68
 Planning Time: 1.519 ms
 Execution Time: 14.996 ms
(46 rows)

Time: 21.614 ms
--- Q3: Recently updated tasks in project ---
                                                                QUERY PLAN                                                                
------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=4579.81..4602.81 rows=200 width=23) (actual time=22.703..26.897 rows=200 loops=1)
   Buffers: shared hit=1803
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.063..0.066 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.062..0.064 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.061..0.062 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.009..0.025 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Gather Merge  (cost=4576.58..8223.00 rows=31708 width=23) (actual time=22.701..26.875 rows=200 loops=1)
         Workers Planned: 1
         Params Evaluated: $0
         Workers Launched: 1
         Buffers: shared hit=1803
         ->  Sort  (cost=3576.57..3655.84 rows=31708 width=23) (actual time=18.704..18.714 rows=158 loops=2)
               Sort Key: t."updatedAt" DESC
               Sort Method: top-N heapsort  Memory: 39kB
               Buffers: shared hit=1801
               Worker 0:  Sort Method: top-N heapsort  Memory: 39kB
               ->  Parallel Seq Scan on "Task" t  (cost=0.00..2206.18 rows=31708 width=23) (actual time=0.015..12.769 rows=27000 loops=2)
                     Filter: ((deleted_at IS NULL) AND ("projectId" = $0))
                     Rows Removed by Filter: 3000
                     Buffers: shared hit=1765
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.285 ms
 Execution Time: 27.002 ms
(31 rows)

Time: 27.756 ms
--- Q4: Audit timeline for latest task ---
                                                                                       QUERY PLAN                                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2665.30..2711.33 rows=500 width=42) (actual time=21.227..21.415 rows=500 loops=1)
   Buffers: shared hit=1783
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=2665.00..2665.01 rows=1 width=15) (actual time=21.134..21.136 rows=1 loops=1)
           Buffers: shared hit=1765
           ->  Limit  (cost=2665.00..2665.00 rows=1 width=23) (actual time=21.131..21.132 rows=1 loops=1)
                 Buffers: shared hit=1765
                 ->  Sort  (cost=2665.00..2815.00 rows=60000 width=23) (actual time=21.130..21.131 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=1765
                       ->  Seq Scan on "Task"  (cost=0.00..2365.00 rows=60000 width=23) (actual time=0.006..12.477 rows=60000 loops=1)
                             Buffers: shared hit=1765
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=21.226..21.372 rows=500 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=1783
 Planning:
   Buffers: shared hit=52
 Planning Time: 0.672 ms
 Execution Time: 21.490 ms
(20 rows)

Time: 22.798 ms
--- Q5: Inbox unread list ---
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1352.82..1353.32 rows=200 width=36) (actual time=10.218..10.248 rows=200 loops=1)
   Buffers: shared hit=447
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.149..0.151 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.148..0.149 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.148..0.149 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.004..0.065 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=1338.29..1375.79 rows=15000 width=36) (actual time=10.217..10.227 rows=200 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: top-N heapsort  Memory: 53kB
         Buffers: shared hit=447
         ->  Seq Scan on inbox_notifications n  (cost=0.00..690.00 rows=15000 width=36) (actual time=0.158..5.177 rows=15000 loops=1)
               Filter: ((read_at IS NULL) AND (user_id = $0))
               Rows Removed by Filter: 5000
               Buffers: shared hit=447
 Planning:
   Buffers: shared hit=105
 Planning Time: 1.029 ms
 Execution Time: 10.325 ms
(25 rows)

Time: 11.979 ms
--- Q6: Timeline date-window (project + startAt range) ---
                                                                                 QUERY PLAN                                                                                  
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8853.32..8910.82 rows=500 width=31) (actual time=66.750..70.793 rows=500 loops=1)
   Buffers: shared hit=3566
   InitPlan 3 (returns $2)
     ->  Result  (cost=3537.74..3537.75 rows=1 width=32) (actual time=39.491..39.495 rows=1 loops=1)
           Buffers: shared hit=1765
           InitPlan 1 (returns $0)
             ->  Limit  (cost=3534.52..3534.52 rows=1 width=26) (actual time=39.484..39.486 rows=1 loops=1)
                   Buffers: shared hit=1765
                   ->  Sort  (cost=3534.52..3669.28 rows=53904 width=26) (actual time=39.483..39.484 rows=1 loops=1)
                         Sort Key: t_1."updatedAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=1765
                         ->  Seq Scan on "Task" t_1  (cost=0.00..3265.00 rows=53904 width=26) (actual time=0.009..30.671 rows=54000 loops=1)
                               Filter: ((deleted_at IS NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                               Rows Removed by Filter: 6000
                               Buffers: shared hit=1765
           InitPlan 2 (returns $1)
             ->  Limit  (cost=3.22..3.22 rows=1 width=23) (never executed)
                   ->  Sort  (cost=3.22..3.42 rows=81 width=23) (never executed)
                         Sort Key: "Project"."createdAt" DESC
                         ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (never executed)
   ->  Gather Merge  (cost=5315.57..8961.99 rows=31708 width=31) (actual time=66.749..70.747 rows=500 loops=1)
         Workers Planned: 1
         Params Evaluated: $2
         Workers Launched: 1
         Buffers: shared hit=3566
         ->  Sort  (cost=4315.56..4394.83 rows=31708 width=31) (actual time=23.586..23.610 rows=500 loops=2)
               Sort Key: t."startAt"
               Sort Method: top-N heapsort  Memory: 83kB
               Buffers: shared hit=1801
               Worker 0:  Sort Method: top-N heapsort  Memory: 83kB
               ->  Parallel Seq Scan on "Task" t  (cost=0.00..2735.59 rows=31708 width=31) (actual time=0.020..18.320 rows=27000 loops=2)
                     Filter: ((deleted_at IS NULL) AND ("projectId" = $2) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                     Rows Removed by Filter: 3000
                     Buffers: shared hit=1765
 Planning:
   Buffers: shared hit=6
 Planning Time: 0.373 ms
 Execution Time: 70.963 ms
(39 rows)

Time: 72.121 ms
--- Q7: Dependency panel (task dependencies, newest first) ---
                                                                         QUERY PLAN                                                                         
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2695.32..2695.33 rows=3 width=76) (actual time=21.375..21.379 rows=0 loops=1)
   Buffers: shared hit=1767
   InitPlan 3 (returns $2)
     ->  Result  (cost=2684.01..2684.02 rows=1 width=32) (actual time=21.346..21.348 rows=1 loops=1)
           Buffers: shared hit=1765
           InitPlan 1 (returns $0)
             ->  Limit  (cost=19.00..19.00 rows=1 width=40) (actual time=0.017..0.018 rows=0 loops=1)
                   ->  Sort  (cost=19.00..20.50 rows=600 width=40) (actual time=0.017..0.018 rows=0 loops=1)
                         Sort Key: d_1."createdAt" DESC
                         Sort Method: quicksort  Memory: 25kB
                         ->  Seq Scan on "TaskDependency" d_1  (cost=0.00..16.00 rows=600 width=40) (actual time=0.002..0.003 rows=0 loops=1)
           InitPlan 2 (returns $1)
             ->  Limit  (cost=2665.00..2665.00 rows=1 width=23) (actual time=21.323..21.324 rows=1 loops=1)
                   Buffers: shared hit=1765
                   ->  Sort  (cost=2665.00..2815.00 rows=60000 width=23) (actual time=21.322..21.322 rows=1 loops=1)
                         Sort Key: t."updatedAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=1765
                         ->  Seq Scan on "Task" t  (cost=0.00..2365.00 rows=60000 width=23) (actual time=0.006..12.954 rows=60000 loops=1)
                               Buffers: shared hit=1765
   ->  Sort  (cost=11.31..11.31 rows=3 width=76) (actual time=21.374..21.374 rows=0 loops=1)
         Sort Key: d."createdAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=1767
         ->  Bitmap Heap Scan on "TaskDependency" d  (cost=4.17..11.28 rows=3 width=76) (actual time=21.363..21.363 rows=0 loops=1)
               Recheck Cond: ("taskId" = $2)
               Buffers: shared hit=1767
               ->  Bitmap Index Scan on "TaskDependency_taskId_createdAt_idx"  (cost=0.00..4.17 rows=3 width=0) (actual time=21.361..21.361 rows=0 loops=1)
                     Index Cond: ("taskId" = $2)
                     Buffers: shared hit=1767
 Planning:
   Buffers: shared hit=103 read=2
 Planning Time: 1.143 ms
 Execution Time: 21.497 ms
(34 rows)

Time: 23.389 ms
```
