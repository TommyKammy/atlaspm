# AtlasPM DB EXPLAIN After Indexes (Wave2)

- GeneratedAtUTC: 2026-02-27T11:27:28Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=108.71..108.72 rows=3 width=78) (actual time=0.347..0.348 rows=1 loops=1)
   Buffers: shared hit=77
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=93.50..93.51 rows=1 width=37) (actual time=0.312..0.313 rows=1 loops=1)
           Buffers: shared hit=68
           ->  Limit  (cost=93.50..93.50 rows=1 width=45) (actual time=0.312..0.312 rows=1 loops=1)
                 Buffers: shared hit=68
                 ->  Sort  (cost=93.50..98.25 rows=1900 width=45) (actual time=0.311..0.312 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=68
                       ->  Seq Scan on "Project"  (cost=0.00..84.00 rows=1900 width=45) (actual time=0.003..0.178 rows=1900 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.20..15.21 rows=3 width=78) (actual time=0.345..0.346 rows=1 loops=1)
         Sort Key: t."sectionId", t."position"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=77
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.18 rows=3 width=78) (actual time=0.322..0.322 rows=1 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=1
               Buffers: shared hit=71
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.318..0.318 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=70
 Planning:
   Buffers: shared hit=364
 Planning Time: 1.139 ms
 Execution Time: 0.395 ms
(28 rows)

Time: 2.720 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                   QUERY PLAN                                                                                                    
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=179.74..179.75 rows=3 width=73) (actual time=0.566..0.567 rows=1 loops=1)
   Buffers: shared hit=110
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=93.50..93.51 rows=1 width=37) (actual time=0.251..0.252 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=93.50..93.50 rows=1 width=45) (actual time=0.251..0.251 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=93.50..98.25 rows=1900 width=45) (actual time=0.251..0.251 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..84.00 rows=1900 width=45) (actual time=0.002..0.124 rows=1900 loops=1)
                             Buffers: shared hit=65
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=70.98..70.99 rows=1 width=24) (actual time=0.301..0.302 rows=1 loops=1)
           Buffers: shared hit=42
           ->  Limit  (cost=70.98..70.98 rows=1 width=32) (actual time=0.301..0.301 rows=1 loops=1)
                 Buffers: shared hit=42
                 ->  Sort  (cost=70.98..75.81 rows=1932 width=32) (actual time=0.301..0.301 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=42
                       ->  Seq Scan on "User"  (cost=0.00..61.32 rows=1932 width=32) (actual time=0.003..0.180 rows=1932 loops=1)
                             Buffers: shared hit=42
   ->  Sort  (cost=15.24..15.24 rows=3 width=73) (actual time=0.566..0.566 rows=1 loops=1)
         Sort Key: t."dueAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=110
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.21 rows=3 width=73) (actual time=0.562..0.563 rows=1 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("assigneeUserId" = $1) OR ("assigneeUserId" IS NULL)) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Heap Blocks: exact=1
               Buffers: shared hit=110
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.255..0.255 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=62
 Planning Time: 0.314 ms
 Execution Time: 0.599 ms
(40 rows)

Time: 1.774 ms
--- Q3: Recently updated tasks in project ---
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=108.71..108.72 rows=3 width=45) (actual time=0.232..0.233 rows=1 loops=1)
   Buffers: shared hit=68
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=93.50..93.51 rows=1 width=37) (actual time=0.225..0.226 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=93.50..93.50 rows=1 width=45) (actual time=0.225..0.225 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=93.50..98.25 rows=1900 width=45) (actual time=0.225..0.225 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..84.00 rows=1900 width=45) (actual time=0.001..0.116 rows=1900 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.20..15.21 rows=3 width=45) (actual time=0.232..0.232 rows=1 loops=1)
         Sort Key: t."updatedAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=68
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.18 rows=3 width=45) (actual time=0.229..0.229 rows=1 loops=1)
               Recheck Cond: (("projectId" = $0) AND (deleted_at IS NULL))
               Heap Blocks: exact=1
               Buffers: shared hit=68
               ->  Bitmap Index Scan on "Task_active_project_updatedAt_desc_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.228..0.228 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.070 ms
 Execution Time: 0.249 ms
(28 rows)

Time: 0.436 ms
--- Q4: Audit timeline for latest task ---
                                                                                   QUERY PLAN                                                                                   
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=241.41..249.43 rows=1 width=63) (actual time=0.790..0.791 rows=1 loops=1)
   Buffers: shared hit=184
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=240.98..240.99 rows=1 width=37) (actual time=0.778..0.779 rows=1 loops=1)
           Buffers: shared hit=179
           ->  Limit  (cost=240.98..240.98 rows=1 width=45) (actual time=0.778..0.778 rows=1 loops=1)
                 Buffers: shared hit=179
                 ->  Sort  (cost=240.98..251.31 rows=4132 width=45) (actual time=0.777..0.778 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=179
                       ->  Seq Scan on "Task"  (cost=0.00..220.32 rows=4132 width=45) (actual time=0.005..0.545 rows=4132 loops=1)
                             Buffers: shared hit=179
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=0.790..0.790 rows=1 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=184
 Planning:
   Buffers: shared hit=61
 Planning Time: 0.236 ms
 Execution Time: 0.803 ms
(20 rows)

Time: 1.228 ms
--- Q5: Inbox unread list ---
                                                                                      QUERY PLAN                                                                                       
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=79.29..79.30 rows=1 width=53) (actual time=0.268..0.269 rows=0 loops=1)
   Buffers: shared hit=44
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=70.98..70.99 rows=1 width=24) (actual time=0.257..0.257 rows=1 loops=1)
           Buffers: shared hit=42
           ->  Limit  (cost=70.98..70.98 rows=1 width=32) (actual time=0.257..0.257 rows=1 loops=1)
                 Buffers: shared hit=42
                 ->  Sort  (cost=70.98..75.81 rows=1932 width=32) (actual time=0.257..0.257 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=42
                       ->  Seq Scan on "User"  (cost=0.00..61.32 rows=1932 width=32) (actual time=0.002..0.140 rows=1932 loops=1)
                             Buffers: shared hit=42
   ->  Sort  (cost=8.30..8.30 rows=1 width=53) (actual time=0.268..0.268 rows=0 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=44
         ->  Index Scan using inbox_notifications_user_id_read_at_created_at_idx on inbox_notifications n  (cost=0.27..8.29 rows=1 width=53) (actual time=0.265..0.265 rows=0 loops=1)
               Index Cond: ((user_id = $0) AND (read_at IS NULL))
               Buffers: shared hit=44
 Planning:
   Buffers: shared hit=92
 Planning Time: 0.251 ms
 Execution Time: 0.283 ms
(24 rows)

Time: 0.786 ms
```
