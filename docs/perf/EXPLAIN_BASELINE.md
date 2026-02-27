# AtlasPM DB EXPLAIN Baseline

- GeneratedAtUTC: 2026-02-27T09:12:18Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                         QUERY PLAN                                                                         
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=106.54..106.54 rows=3 width=78) (actual time=0.294..0.294 rows=1 loops=1)
   Buffers: shared hit=77
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=91.33..91.34 rows=1 width=37) (actual time=0.262..0.263 rows=1 loops=1)
           Buffers: shared hit=68
           ->  Limit  (cost=91.33..91.33 rows=1 width=45) (actual time=0.261..0.261 rows=1 loops=1)
                 Buffers: shared hit=68
                 ->  Sort  (cost=91.33..95.71 rows=1755 width=45) (actual time=0.261..0.261 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=68
                       ->  Seq Scan on "Project"  (cost=0.00..82.55 rows=1755 width=45) (actual time=0.002..0.156 rows=1838 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.20..15.21 rows=3 width=78) (actual time=0.293..0.293 rows=1 loops=1)
         Sort Key: t."sectionId", t."position"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=77
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.18 rows=3 width=78) (actual time=0.274..0.274 rows=1 loops=1)
               Recheck Cond: ("projectId" = $0)
               Filter: (deleted_at IS NULL)
               Heap Blocks: exact=1
               Buffers: shared hit=71
               ->  Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.268..0.268 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=70
 Planning:
   Buffers: shared hit=288
 Planning Time: 1.414 ms
 Execution Time: 0.329 ms
(29 rows)

Time: 2.898 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                                QUERY PLAN                                                                                                                
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=176.56..176.57 rows=3 width=73) (actual time=0.467..0.468 rows=1 loops=1)
   Buffers: shared hit=110
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=91.33..91.34 rows=1 width=37) (actual time=0.209..0.209 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=91.33..91.33 rows=1 width=45) (actual time=0.209..0.209 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=91.33..95.71 rows=1755 width=45) (actual time=0.209..0.209 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..82.55 rows=1755 width=45) (actual time=0.001..0.111 rows=1838 loops=1)
                             Buffers: shared hit=65
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=69.98..69.99 rows=1 width=24) (actual time=0.245..0.245 rows=1 loops=1)
           Buffers: shared hit=42
           ->  Limit  (cost=69.98..69.98 rows=1 width=32) (actual time=0.245..0.245 rows=1 loops=1)
                 Buffers: shared hit=42
                 ->  Sort  (cost=69.98..74.64 rows=1865 width=32) (actual time=0.245..0.245 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=42
                       ->  Seq Scan on "User"  (cost=0.00..60.65 rows=1865 width=32) (actual time=0.003..0.146 rows=1865 loops=1)
                             Buffers: shared hit=42
   ->  Sort  (cost=15.24..15.24 rows=3 width=73) (actual time=0.467..0.467 rows=1 loops=1)
         Sort Key: t."dueAt"
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=110
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.21 rows=3 width=73) (actual time=0.461..0.461 rows=1 loops=1)
               Recheck Cond: ("projectId" = $0)
               Filter: ((deleted_at IS NULL) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("assigneeUserId" = $1) OR ("assigneeUserId" IS NULL)) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Heap Blocks: exact=1
               Buffers: shared hit=110
               ->  Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.212..0.212 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=68
 Planning Time: 0.236 ms
 Execution Time: 0.497 ms
(40 rows)

Time: 1.547 ms
--- Q3: Recently updated tasks in project ---
                                                                         QUERY PLAN                                                                         
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=106.54..106.54 rows=3 width=45) (actual time=0.345..0.346 rows=1 loops=1)
   Buffers: shared hit=68
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=91.33..91.34 rows=1 width=37) (actual time=0.335..0.335 rows=1 loops=1)
           Buffers: shared hit=65
           ->  Limit  (cost=91.33..91.33 rows=1 width=45) (actual time=0.335..0.335 rows=1 loops=1)
                 Buffers: shared hit=65
                 ->  Sort  (cost=91.33..95.71 rows=1755 width=45) (actual time=0.334..0.334 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=65
                       ->  Seq Scan on "Project"  (cost=0.00..82.55 rows=1755 width=45) (actual time=0.001..0.165 rows=1838 loops=1)
                             Buffers: shared hit=65
   ->  Sort  (cost=15.20..15.21 rows=3 width=45) (actual time=0.345..0.345 rows=1 loops=1)
         Sort Key: t."updatedAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=68
         ->  Bitmap Heap Scan on "Task" t  (cost=4.30..15.18 rows=3 width=45) (actual time=0.340..0.340 rows=1 loops=1)
               Recheck Cond: ("projectId" = $0)
               Filter: (deleted_at IS NULL)
               Heap Blocks: exact=1
               Buffers: shared hit=68
               ->  Bitmap Index Scan on "Task_projectId_sectionId_position_idx"  (cost=0.00..4.30 rows=3 width=0) (actual time=0.338..0.338 rows=1 loops=1)
                     Index Cond: ("projectId" = $0)
                     Buffers: shared hit=67
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.043 ms
 Execution Time: 0.371 ms
(29 rows)

Time: 0.538 ms
--- Q4: Audit timeline for latest task ---
                                                                                   QUERY PLAN                                                                                   
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=237.85..245.87 rows=1 width=63) (actual time=0.881..0.882 rows=1 loops=1)
   Buffers: shared hit=184
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=237.43..237.44 rows=1 width=37) (actual time=0.861..0.862 rows=1 loops=1)
           Buffers: shared hit=179
           ->  Limit  (cost=237.43..237.43 rows=1 width=45) (actual time=0.860..0.861 rows=1 loops=1)
                 Buffers: shared hit=179
                 ->  Sort  (cost=237.43..247.16 rows=3895 width=45) (actual time=0.860..0.860 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=179
                       ->  Seq Scan on "Task"  (cost=0.00..217.95 rows=3895 width=45) (actual time=0.004..0.592 rows=4000 loops=1)
                             Buffers: shared hit=179
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.41..8.43 rows=1 width=63) (actual time=0.880..0.880 rows=1 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=184
 Planning:
   Buffers: shared hit=63
 Planning Time: 0.479 ms
 Execution Time: 0.902 ms
(20 rows)

Time: 1.847 ms
--- Q5: Inbox unread list ---
                                                                                      QUERY PLAN                                                                                       
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=78.29..78.29 rows=1 width=53) (actual time=0.247..0.248 rows=0 loops=1)
   Buffers: shared hit=43 read=1
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=69.98..69.99 rows=1 width=24) (actual time=0.218..0.219 rows=1 loops=1)
           Buffers: shared hit=42
           ->  Limit  (cost=69.98..69.98 rows=1 width=32) (actual time=0.218..0.218 rows=1 loops=1)
                 Buffers: shared hit=42
                 ->  Sort  (cost=69.98..74.64 rows=1865 width=32) (actual time=0.218..0.218 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=42
                       ->  Seq Scan on "User"  (cost=0.00..60.65 rows=1865 width=32) (actual time=0.003..0.122 rows=1865 loops=1)
                             Buffers: shared hit=42
   ->  Sort  (cost=8.30..8.30 rows=1 width=53) (actual time=0.247..0.247 rows=0 loops=1)
         Sort Key: n.created_at DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=43 read=1
         ->  Index Scan using inbox_notifications_user_id_read_at_created_at_idx on inbox_notifications n  (cost=0.27..8.29 rows=1 width=53) (actual time=0.244..0.244 rows=0 loops=1)
               Index Cond: ((user_id = $0) AND (read_at IS NULL))
               Buffers: shared hit=43 read=1
 Planning:
   Buffers: shared hit=91
 Planning Time: 0.269 ms
 Execution Time: 0.261 ms
(24 rows)

Time: 0.715 ms
```
