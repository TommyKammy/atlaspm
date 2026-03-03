# AtlasPM DB EXPLAIN Baseline (P0-3 timeline/dependency paths)

- GeneratedAtUTC: 2026-03-03T12:58:36Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=127.71..127.72 rows=3 width=78) (actual time=0.725..0.727 rows=2 loops=1)
   Buffers: shared hit=78 dirtied=1
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.665..0.666 rows=1 loops=1)
           Buffers: shared hit=68 dirtied=1
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.664..0.664 rows=1 loops=1)
                 Buffers: shared hit=68 dirtied=1
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.664..0.664 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=68 dirtied=1
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.007..0.407 rows=3173 loops=1)
                             Buffers: shared hit=65 dirtied=1
   ->  Sort  (cost=15.45..15.46 rows=3 width=78) (actual time=0.724..0.725 rows=2 loops=1)
         Sort Key: t."sectionId", t."position"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=78 dirtied=1
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.42 rows=3 width=78) (actual time=0.696..0.699 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=2
               Buffers: shared hit=72 dirtied=1
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.686..0.686 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=70 dirtied=1
 Planning:
   Buffers: shared hit=400
 Planning Time: 1.176 ms
 Execution Time: 0.779 ms
(28 rows)

Time: 3.381 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                   QUERY PLAN                                                                                                    
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=237.28..237.28 rows=2 width=73) (actual time=1.084..1.085 rows=2 loops=1)
   Buffers: shared hit=132 dirtied=4
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.491..0.492 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.491..0.491 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.491..0.491 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.002..0.253 rows=3173 loops=1)
                             Buffers: shared hit=65
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=109.53..109.54 rows=1 width=24) (actual time=0.574..0.574 rows=1 loops=1)
           Buffers: shared hit=63 dirtied=4
           ->  Limit  (cost=109.53..109.53 rows=1 width=32) (actual time=0.574..0.574 rows=1 loops=1)
                 Buffers: shared hit=63 dirtied=4
                 ->  Sort  (cost=109.53..117.28 rows=3102 width=32) (actual time=0.573..0.574 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=63 dirtied=4
                       ->  Seq Scan on "User"  (cost=0.00..94.02 rows=3102 width=32) (actual time=0.024..0.369 rows=3106 loops=1)
                             Buffers: shared hit=63 dirtied=4
   ->  Sort  (cost=15.47..15.48 rows=2 width=73) (actual time=1.084..1.084 rows=2 loops=1)
         Sort Key: t."dueAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=132 dirtied=4
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.46 rows=2 width=73) (actual time=1.078..1.080 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("assigneeUserId" = $1) OR ("assigneeUserId" IS NULL)) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Heap Blocks: exact=2
               Buffers: shared hit=132 dirtied=4
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.500..0.500 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=62 dirtied=1
 Planning Time: 0.383 ms
 Execution Time: 1.123 ms
(40 rows)

Time: 2.538 ms
--- Q3: Recently updated tasks in project ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=127.71..127.72 rows=3 width=45) (actual time=0.431..0.432 rows=2 loops=1)
   Buffers: shared hit=69
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=112.25..112.26 rows=1 width=37) (actual time=0.414..0.415 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=112.25..112.25 rows=1 width=45) (actual time=0.414..0.414 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (actual time=0.414..0.414 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (actual time=0.002..0.210 rows=3173 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.45..15.46 rows=3 width=45) (actual time=0.430..0.431 rows=2 loops=1)
         Sort Key: t."updatedAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=69
         ->  Bitmap Heap Scan on "Task" t  (cost=4.31..15.42 rows=3 width=45) (actual time=0.425..0.426 rows=2 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=2
               Buffers: shared hit=69
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.423..0.423 rows=2 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.087 ms
 Execution Time: 0.456 ms
(28 rows)

Time: 0.702 ms
--- Q4: Audit timeline for latest task ---
                                                                                   QUERY PLAN                                                                                   
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=388.63..396.65 rows=1 width=63) (actual time=1.828..1.829 rows=1 loops=1)
   Buffers: shared hit=293
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=388.20..388.21 rows=1 width=37) (actual time=1.808..1.808 rows=1 loops=1)
           Buffers: shared hit=288
           ->  Limit  (cost=388.20..388.20 rows=1 width=45) (actual time=1.808..1.808 rows=1 loops=1)
                 Buffers: shared hit=288
                 ->  Sort  (cost=388.20..404.90 rows=6680 width=45) (actual time=1.807..1.808 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=288
                       ->  Seq Scan on "Task"  (cost=0.00..354.80 rows=6680 width=45) (actual time=0.005..1.368 rows=6659 loops=1)
                             Buffers: shared hit=288
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=1.827..1.828 rows=1 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=293
 Planning:
   Buffers: shared hit=65 dirtied=5
 Planning Time: 0.308 ms
 Execution Time: 1.840 ms
(20 rows)

Time: 2.369 ms
--- Q5: Inbox unread list ---
                                                                              QUERY PLAN                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=119.68..119.68 rows=2 width=53) (actual time=0.483..0.484 rows=0 loops=1)
   Buffers: shared hit=65
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=109.53..109.54 rows=1 width=24) (actual time=0.466..0.467 rows=1 loops=1)
           Buffers: shared hit=63
           ->  Limit  (cost=109.53..109.53 rows=1 width=32) (actual time=0.466..0.466 rows=1 loops=1)
                 Buffers: shared hit=63
                 ->  Sort  (cost=109.53..117.28 rows=3102 width=32) (actual time=0.466..0.466 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=63
                       ->  Seq Scan on "User"  (cost=0.00..94.02 rows=3102 width=32) (actual time=0.003..0.256 rows=3106 loops=1)
                             Buffers: shared hit=63
   ->  Sort  (cost=10.14..10.14 rows=2 width=53) (actual time=0.483..0.483 rows=0 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=65
         ->  Bitmap Heap Scan on inbox_notifications n  (cost=4.29..10.13 rows=2 width=53) (actual time=0.478..0.479 rows=0 loops=1)
               Recheck Cond: ((user_id = $0) AND (read_at IS NULL))
               Buffers: shared hit=65
               ->  Bitmap Index Scan on inbox_notifications_user_id_read_at_created_at_idx  (cost=0.00..4.29 rows=2 width=0) (actual time=0.478..0.478 rows=0 loops=1)
                     Index Cond: ((user_id = $0) AND (read_at IS NULL))
                     Buffers: shared hit=65
 Planning:
   Buffers: shared hit=92
 Planning Time: 0.246 ms
 Execution Time: 0.501 ms
(27 rows)

Time: 0.939 ms
--- Q6: Timeline date-window (project + startAt range) ---
                                                                                  QUERY PLAN                                                                                   
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=337.32..337.33 rows=1 width=53) (actual time=0.219..0.220 rows=1 loops=1)
   Buffers: shared hit=42
   InitPlan 3 (returns $2)
     ->  Result  (cost=328.99..329.00 rows=1 width=32) (actual time=0.192..0.192 rows=1 loops=1)
           Buffers: shared hit=36
           InitPlan 1 (returns $0)
             ->  Limit  (cost=216.73..216.73 rows=1 width=45) (actual time=0.190..0.191 rows=1 loops=1)
                   Buffers: shared hit=36
                   ->  Sort  (cost=216.73..216.75 rows=7 width=45) (actual time=0.190..0.190 rows=1 loops=1)
                         Sort Key: t_1."updatedAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=36
                         ->  Bitmap Heap Scan on "Task" t_1  (cost=191.79..216.70 rows=7 width=45) (actual time=0.179..0.186 rows=16 loops=1)
                               Recheck Cond: ((deleted_at IS NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                               Heap Blocks: exact=10
                               Buffers: shared hit=36
                               ->  Bitmap Index Scan on "Task_projectId_deleted_at_startAt_idx"  (cost=0.00..191.79 rows=7 width=0) (actual time=0.176..0.176 rows=16 loops=1)
                                     Index Cond: ((deleted_at IS NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                                     Buffers: shared hit=26
           InitPlan 2 (returns $1)
             ->  Limit  (cost=112.25..112.25 rows=1 width=45) (never executed)
                   ->  Sort  (cost=112.25..120.12 rows=3150 width=45) (never executed)
                         Sort Key: "Project"."createdAt" DESC
                         ->  Seq Scan on "Project"  (cost=0.00..96.50 rows=3150 width=45) (never executed)
   ->  Sort  (cost=8.33..8.33 rows=1 width=53) (actual time=0.218..0.219 rows=1 loops=1)
         Sort Key: t."startAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=42
         ->  Index Scan using "Task_projectId_deleted_at_startAt_idx" on "Task" t  (cost=0.29..8.32 rows=1 width=53) (actual time=0.214..0.214 rows=1 loops=1)
               Index Cond: (("projectId" = $2) AND (deleted_at IS NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
               Buffers: shared hit=42
 Planning:
   Buffers: shared hit=6
 Planning Time: 0.210 ms
 Execution Time: 0.262 ms
(35 rows)

Time: 0.820 ms
--- Q7: Dependency panel (task dependencies, newest first) ---
                                                                                QUERY PLAN                                                                                
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=410.10..418.12 rows=1 width=86) (actual time=0.166..0.167 rows=1 loops=1)
   Buffers: shared hit=17 dirtied=1
   InitPlan 3 (returns $2)
     ->  Result  (cost=409.82..409.83 rows=1 width=32) (actual time=0.154..0.155 rows=1 loops=1)
           Buffers: shared hit=13 dirtied=1
           InitPlan 1 (returns $0)
             ->  Limit  (cost=21.61..21.61 rows=1 width=45) (actual time=0.153..0.154 rows=1 loops=1)
                   Buffers: shared hit=13 dirtied=1
                   ->  Sort  (cost=21.61..23.05 rows=574 width=45) (actual time=0.153..0.153 rows=1 loops=1)
                         Sort Key: d_1."createdAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=13 dirtied=1
                         ->  Seq Scan on "TaskDependency" d_1  (cost=0.00..18.74 rows=574 width=45) (actual time=0.008..0.110 rows=578 loops=1)
                               Buffers: shared hit=13 dirtied=1
           InitPlan 2 (returns $1)
             ->  Limit  (cost=388.20..388.20 rows=1 width=45) (never executed)
                   ->  Sort  (cost=388.20..404.90 rows=6680 width=45) (never executed)
                         Sort Key: t."updatedAt" DESC
                         ->  Seq Scan on "Task" t  (cost=0.00..354.80 rows=6680 width=45) (never executed)
   ->  Index Scan Backward using "TaskDependency_taskId_createdAt_idx" on "TaskDependency" d  (cost=0.28..8.29 rows=1 width=86) (actual time=0.165..0.165 rows=1 loops=1)
         Index Cond: ("taskId" = $2)
         Buffers: shared hit=17 dirtied=1
 Planning:
   Buffers: shared hit=114 dirtied=3
 Planning Time: 0.480 ms
 Execution Time: 0.197 ms
(26 rows)

Time: 1.099 ms
```
