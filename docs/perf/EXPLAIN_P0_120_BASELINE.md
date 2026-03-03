# AtlasPM DB EXPLAIN Baseline (P0-3 timeline/dependency paths)

- GeneratedAtUTC: 2026-03-03T12:48:40Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=127.71..127.72 rows=3 width=78) (actual time=0.591..0.592 rows=2 loops=1)
   Buffers: shared hit=77
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.518..0.518 rows=1 loops=1)
           Buffers: shared hit=68
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.517..0.518 rows=1 loops=1)
                 Buffers: shared hit=68
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.517..0.517 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=68
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.017..0.356 rows=3150 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.45..15.45 rows=3 width=78) (actual time=0.590..0.590 rows=2 loops=1)
         Sort Key: t."sectionId", t."position"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=77
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.42 rows=3 width=78) (actual time=0.563..0.564 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=1
               Buffers: shared hit=71
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.555..0.555 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=70
 Planning:
   Buffers: shared hit=400 dirtied=2
 Planning Time: 2.111 ms
 Execution Time: 0.667 ms
(28 rows)

Time: 5.366 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                   QUERY PLAN                                                                                                    
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=237.27..237.28 rows=2 width=73) (actual time=0.868..0.869 rows=2 loops=1)
   Buffers: shared hit=131 dirtied=3
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.327..0.327 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.326..0.327 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.326..0.326 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.002..0.171 rows=3150 loops=1)
                             Buffers: shared hit=65
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=109.53..109.54 rows=1 width=24) (actual time=0.528..0.529 rows=1 loops=1)
           Buffers: shared hit=63 dirtied=3
           ->  Limit  (cost=109.53..109.53 rows=1 width=32) (actual time=0.528..0.528 rows=1 loops=1)
                 Buffers: shared hit=63 dirtied=3
                 ->  Sort  (cost=109.53..117.28 rows=3102 width=32) (actual time=0.528..0.528 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=63 dirtied=3
                       ->  Seq Scan on "User"  (cost=0.00..94.02 rows=3102 width=32) (actual time=0.039..0.368 rows=3102 loops=1)
                             Buffers: shared hit=63 dirtied=3
   ->  Sort  (cost=15.47..15.47 rows=2 width=73) (actual time=0.867..0.868 rows=2 loops=1)
         Sort Key: t."dueAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=131 dirtied=3
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.46 rows=2 width=73) (actual time=0.863..0.864 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("assigneeUserId" = $1) OR ("assigneeUserId" IS NULL)) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Heap Blocks: exact=1
               Buffers: shared hit=131 dirtied=3
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.331..0.331 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=62 dirtied=2
 Planning Time: 0.356 ms
 Execution Time: 0.900 ms
(40 rows)

Time: 3.287 ms
--- Q3: Recently updated tasks in project ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=127.71..127.72 rows=3 width=45) (actual time=0.366..0.367 rows=2 loops=1)
   Buffers: shared hit=68
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.357..0.358 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.357..0.357 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.357..0.357 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.001..0.210 rows=3150 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.45..15.45 rows=3 width=45) (actual time=0.366..0.366 rows=2 loops=1)
         Sort Key: t."updatedAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=68
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.42 rows=3 width=45) (actual time=0.363..0.363 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=1
               Buffers: shared hit=68
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.361..0.361 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.068 ms
 Execution Time: 0.390 ms
(28 rows)

Time: 0.598 ms
--- Q4: Audit timeline for latest task ---
                                                                                   QUERY PLAN                                                                                   
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=385.94..393.96 rows=1 width=63) (actual time=1.760..1.763 rows=1 loops=1)
   Buffers: shared hit=291 dirtied=1
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=385.51..385.52 rows=1 width=37) (actual time=1.394..1.395 rows=1 loops=1)
           Buffers: shared hit=286
           ->  Limit  (cost=385.51..385.51 rows=1 width=45) (actual time=1.392..1.393 rows=1 loops=1)
                 Buffers: shared hit=286
                 ->  Sort  (cost=385.51..402.10 rows=6634 width=45) (actual time=1.391..1.391 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=286
                       ->  Seq Scan on "Task"  (cost=0.00..352.34 rows=6634 width=45) (actual time=0.007..1.036 rows=6634 loops=1)
                             Buffers: shared hit=286
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=1.759..1.760 rows=1 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=291 dirtied=1
 Planning:
   Buffers: shared hit=62
 Planning Time: 0.247 ms
 Execution Time: 1.785 ms
(20 rows)

Time: 2.401 ms
--- Q5: Inbox unread list ---
                                                                              QUERY PLAN                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=119.68..119.68 rows=2 width=53) (actual time=0.498..0.498 rows=0 loops=1)
   Buffers: shared hit=65
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=109.53..109.54 rows=1 width=24) (actual time=0.377..0.378 rows=1 loops=1)
           Buffers: shared hit=63
           ->  Limit  (cost=109.53..109.53 rows=1 width=32) (actual time=0.376..0.377 rows=1 loops=1)
                 Buffers: shared hit=63
                 ->  Sort  (cost=109.53..117.28 rows=3102 width=32) (actual time=0.376..0.376 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=63
                       ->  Seq Scan on "User"  (cost=0.00..94.02 rows=3102 width=32) (actual time=0.005..0.228 rows=3102 loops=1)
                             Buffers: shared hit=63
   ->  Sort  (cost=10.14..10.14 rows=2 width=53) (actual time=0.497..0.497 rows=0 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=65
         ->  Bitmap Heap Scan on inbox_notifications n  (cost=4.29..10.13 rows=2 width=53) (actual time=0.398..0.398 rows=0 loops=1)
               Recheck Cond: ((user_id = $0) AND (read_at IS NULL))
               Buffers: shared hit=65
               ->  Bitmap Index Scan on inbox_notifications_user_id_read_at_created_at_idx  (cost=0.00..4.29 rows=2 width=0) (actual time=0.396..0.397 rows=0 loops=1)
                     Index Cond: ((user_id = $0) AND (read_at IS NULL))
                     Buffers: shared hit=65
 Planning:
   Buffers: shared hit=92
 Planning Time: 0.358 ms
 Execution Time: 0.521 ms
(27 rows)

Time: 1.305 ms
--- Q6: Timeline date-window (project + startAt range) ---
                                                                                              QUERY PLAN                                                                                               
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=120.59..120.60 rows=1 width=53) (actual time=0.431..0.431 rows=0 loops=1)
   Buffers: shared hit=68 read=2
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.380..0.381 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.380..0.380 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.380..0.380 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.004..0.224 rows=3150 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=8.33..8.34 rows=1 width=53) (actual time=0.431..0.431 rows=0 loops=1)
         Sort Key: t."startAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=68 read=2
         ->  Index Scan using "Task_projectId_deleted_at_startAt_idx" on "Task" t  (cost=0.29..8.32 rows=1 width=53) (actual time=0.427..0.427 rows=0 loops=1)
               Index Cond: (("projectId" = $0) AND (deleted_at IS NULL) AND ("startAt" IS NOT NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
               Buffers: shared hit=68 read=2
 Planning:
   Buffers: shared hit=6
 Planning Time: 0.145 ms
 Execution Time: 0.449 ms
(24 rows)

Time: 0.919 ms
--- Q7: Dependency panel (task dependencies, newest first) ---
                                                                                QUERY PLAN                                                                                
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=385.80..393.82 rows=1 width=86) (actual time=1.262..1.263 rows=0 loops=1)
   Buffers: shared hit=286 read=2
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=385.51..385.52 rows=1 width=37) (actual time=1.229..1.230 rows=1 loops=1)
           Buffers: shared hit=286
           ->  Limit  (cost=385.51..385.51 rows=1 width=45) (actual time=1.228..1.229 rows=1 loops=1)
                 Buffers: shared hit=286
                 ->  Sort  (cost=385.51..402.10 rows=6634 width=45) (actual time=1.228..1.228 rows=1 loops=1)
                       Sort Key: "Task"."updatedAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=286
                       ->  Seq Scan on "Task"  (cost=0.00..352.34 rows=6634 width=45) (actual time=0.003..0.827 rows=6634 loops=1)
                             Buffers: shared hit=286
   ->  Index Scan Backward using "TaskDependency_taskId_createdAt_idx" on "TaskDependency" d  (cost=0.28..8.29 rows=1 width=86) (actual time=1.262..1.262 rows=0 loops=1)
         Index Cond: ("taskId" = $0)
         Buffers: shared hit=286 read=2
 Planning:
   Buffers: shared hit=112 read=2
 Planning Time: 0.451 ms
 Execution Time: 1.289 ms
(20 rows)

Time: 2.149 ms
```
