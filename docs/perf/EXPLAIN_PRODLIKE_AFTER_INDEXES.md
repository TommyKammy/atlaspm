# AtlasPM DB EXPLAIN Prodlike After Indexes (Wave2)

- GeneratedAtUTC: 2026-03-09T02:05:25Z
- Mode: docker exec atlaspm-postgres (atlaspm/atlaspm)
- Command: `./scripts/db-explain-baseline.sh`

> This report is generated from the current local dataset and is intended for before/after index comparison.

```text
Pager usage is off.
Timing is on.
--- Q1: List view (project tasks, default manual order) ---
                                                                             QUERY PLAN                                                                              
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.64..63.84 rows=500 width=34) (actual time=0.145..2.123 rows=500 loops=1)
   Buffers: shared hit=505 read=6
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.091..0.093 rows=1 loops=1)
           Buffers: shared hit=5
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.090..0.091 rows=1 loops=1)
                 Buffers: shared hit=5
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.089..0.090 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=5
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.015..0.029 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_active_project_section_position_idx" on "Task" t  (cost=0.41..6496.37 rows=53958 width=34) (actual time=0.144..2.069 rows=500 loops=1)
         Index Cond: ("projectId" = $0)
         Buffers: shared hit=505 read=6
 Planning:
   Buffers: shared hit=396 read=3
 Planning Time: 3.773 ms
 Execution Time: 2.237 ms
(20 rows)

Time: 10.108 ms
--- Q2: Filtered list (status + assignee + dueAt) ---
                                                                                                                                                 QUERY PLAN                                                                                                                                                  
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2299.60..2300.85 rows=500 width=41) (actual time=9.339..9.404 rows=500 loops=1)
   Buffers: shared hit=1782 read=9
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.043..0.046 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.043..0.044 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.043..0.043 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.006..0.014 rows=81 loops=1)
                             Buffers: shared hit=2
   InitPlan 2 (returns $1)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.194..0.196 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.194..0.195 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.194..0.194 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.005..0.083 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Sort  (cost=2281.84..2292.56 rows=4286 width=41) (actual time=9.338..9.361 rows=500 loops=1)
         Sort Key: t."dueAt"
         Sort Method: top-N heapsort  Memory: 83kB
         Buffers: shared hit=1782 read=9
         ->  Bitmap Heap Scan on "Task" t  (cost=135.30..2068.28 rows=4286 width=41) (actual time=1.222..7.838 rows=4916 loops=1)
               Recheck Cond: ((("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1) AND (deleted_at IS NULL)) OR (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL) AND (deleted_at IS NULL)))
               Filter: ((status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND (("dueAt" IS NULL) OR ("dueAt" >= (now() - '30 days'::interval))))
               Rows Removed by Filter: 2300
               Heap Blocks: exact=1765
               Buffers: shared hit=1782 read=9
               ->  BitmapOr  (cost=135.30..135.30 rows=6719 width=0) (actual time=0.958..0.959 rows=0 loops=1)
                     Buffers: shared hit=17 read=9
                     ->  Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..9.51 rows=73 width=0) (actual time=0.675..0.675 rows=2197 loops=1)
                           Index Cond: (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" = $1))
                           Buffers: shared hit=13 read=5
                     ->  Bitmap Index Scan on "Task_active_project_status_assignee_dueAt_idx"  (cost=0.00..123.66 rows=6646 width=0) (actual time=0.282..0.282 rows=5019 loops=1)
                           Index Cond: (("projectId" = $0) AND (status = ANY ('{TODO,IN_PROGRESS}'::"TaskStatus"[])) AND ("assigneeUserId" IS NULL))
                           Buffers: shared hit=4 read=4
 Planning:
   Buffers: shared hit=68
 Planning Time: 1.183 ms
 Execution Time: 9.626 ms
(46 rows)

Time: 14.105 ms
--- Q3: Recently updated tasks in project ---
                                                                            QUERY PLAN                                                                             
-------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.52..23.67 rows=200 width=23) (actual time=0.087..0.192 rows=200 loops=1)
   Buffers: shared hit=202 read=2
   InitPlan 1 (returns $0)
     ->  Subquery Scan on p  (cost=3.22..3.23 rows=1 width=15) (actual time=0.037..0.038 rows=1 loops=1)
           Buffers: shared hit=2
           ->  Limit  (cost=3.22..3.22 rows=1 width=23) (actual time=0.036..0.037 rows=1 loops=1)
                 Buffers: shared hit=2
                 ->  Sort  (cost=3.22..3.42 rows=81 width=23) (actual time=0.036..0.036 rows=1 loops=1)
                       Sort Key: "Project"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=2
                       ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (actual time=0.006..0.015 rows=81 loops=1)
                             Buffers: shared hit=2
   ->  Index Scan using "Task_active_project_updatedAt_desc_idx" on "Task" t  (cost=0.29..5436.24 rows=53958 width=23) (actual time=0.086..0.175 rows=200 loops=1)
         Index Cond: ("projectId" = $0)
         Buffers: shared hit=202 read=2
 Planning:
   Buffers: shared hit=5
 Planning Time: 0.232 ms
 Execution Time: 0.241 ms
(20 rows)

Time: 0.849 ms
--- Q4: Audit timeline for latest task ---
                                                                                       QUERY PLAN                                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2665.30..2711.33 rows=500 width=42) (actual time=21.279..21.464 rows=500 loops=1)
   Buffers: shared hit=1783
   InitPlan 1 (returns $0)
     ->  Subquery Scan on target_task  (cost=2665.00..2665.01 rows=1 width=15) (actual time=21.185..21.188 rows=1 loops=1)
           Buffers: shared hit=1765
           ->  Limit  (cost=2665.00..2665.00 rows=1 width=23) (actual time=21.184..21.186 rows=1 loops=1)
                 Buffers: shared hit=1765
                 ->  Sort  (cost=2665.00..2815.00 rows=60000 width=23) (actual time=21.183..21.183 rows=1 loops=1)
                       Sort Key: "Task"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=1765
                       ->  Seq Scan on "Task"  (cost=0.00..2365.00 rows=60000 width=23) (actual time=0.005..12.447 rows=60000 loops=1)
                             Buffers: shared hit=1765
   ->  Index Scan Backward using "AuditEvent_entityType_entityId_createdAt_idx" on "AuditEvent" ae  (cost=0.28..460.60 rows=5000 width=42) (actual time=21.278..21.423 rows=500 loops=1)
         Index Cond: (("entityType" = 'Task'::text) AND ("entityId" = $0))
         Buffers: shared hit=1783
 Planning:
   Buffers: shared hit=54
 Planning Time: 0.597 ms
 Execution Time: 21.530 ms
(20 rows)

Time: 22.650 ms
--- Q5: Inbox unread list ---
                                                                                          QUERY PLAN                                                                                          
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=14.81..36.04 rows=200 width=36) (actual time=0.194..0.272 rows=200 loops=1)
   Buffers: shared hit=14 read=3
   InitPlan 1 (returns $0)
     ->  Subquery Scan on u  (cost=14.52..14.53 rows=1 width=13) (actual time=0.153..0.154 rows=1 loops=1)
           Buffers: shared hit=7
           ->  Limit  (cost=14.52..14.52 rows=1 width=21) (actual time=0.153..0.153 rows=1 loops=1)
                 Buffers: shared hit=7
                 ->  Sort  (cost=14.52..15.77 rows=501 width=21) (actual time=0.152..0.153 rows=1 loops=1)
                       Sort Key: "User"."createdAt" DESC
                       Sort Method: top-N heapsort  Memory: 25kB
                       Buffers: shared hit=7
                       ->  Seq Scan on "User"  (cost=0.00..12.01 rows=501 width=21) (actual time=0.006..0.068 rows=501 loops=1)
                             Buffers: shared hit=7
   ->  Index Scan using inbox_notifications_user_id_unread_created_at_desc_idx on inbox_notifications n  (cost=0.29..1592.10 rows=15000 width=36) (actual time=0.193..0.254 rows=200 loops=1)
         Index Cond: (user_id = $0)
         Buffers: shared hit=14 read=3
 Planning:
   Buffers: shared hit=126 read=1
 Planning Time: 1.219 ms
 Execution Time: 0.322 ms
(20 rows)

Time: 2.094 ms
--- Q6: Timeline date-window (project + startAt range) ---
                                                                                 QUERY PLAN                                                                                  
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8855.19..8912.69 rows=500 width=31) (actual time=66.815..70.920 rows=500 loops=1)
   Buffers: shared hit=3566
   InitPlan 3 (returns $2)
     ->  Result  (cost=3538.01..3538.02 rows=1 width=32) (actual time=39.597..39.602 rows=1 loops=1)
           Buffers: shared hit=1765
           InitPlan 1 (returns $0)
             ->  Limit  (cost=3534.79..3534.79 rows=1 width=26) (actual time=39.591..39.594 rows=1 loops=1)
                   Buffers: shared hit=1765
                   ->  Sort  (cost=3534.79..3669.68 rows=53958 width=26) (actual time=39.590..39.592 rows=1 loops=1)
                         Sort Key: t_1."updatedAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=1765
                         ->  Seq Scan on "Task" t_1  (cost=0.00..3265.00 rows=53958 width=26) (actual time=0.007..31.116 rows=54000 loops=1)
                               Filter: ((deleted_at IS NULL) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                               Rows Removed by Filter: 6000
                               Buffers: shared hit=1765
           InitPlan 2 (returns $1)
             ->  Limit  (cost=3.22..3.22 rows=1 width=23) (never executed)
                   ->  Sort  (cost=3.22..3.42 rows=81 width=23) (never executed)
                         Sort Key: "Project"."createdAt" DESC
                         ->  Seq Scan on "Project"  (cost=0.00..2.81 rows=81 width=23) (never executed)
   ->  Gather Merge  (cost=5317.17..8967.27 rows=31740 width=31) (actual time=66.814..70.873 rows=500 loops=1)
         Workers Planned: 1
         Params Evaluated: $2
         Workers Launched: 1
         Buffers: shared hit=3566
         ->  Sort  (cost=4317.16..4396.51 rows=31740 width=31) (actual time=23.458..23.483 rows=500 loops=2)
               Sort Key: t."startAt"
               Sort Method: top-N heapsort  Memory: 83kB
               Buffers: shared hit=1801
               Worker 0:  Sort Method: top-N heapsort  Memory: 84kB
               ->  Parallel Seq Scan on "Task" t  (cost=0.00..2735.59 rows=31740 width=31) (actual time=0.018..18.146 rows=27000 loops=2)
                     Filter: ((deleted_at IS NULL) AND ("projectId" = $2) AND ("startAt" >= (now() - '30 days'::interval)) AND ("startAt" <= (now() + '90 days'::interval)))
                     Rows Removed by Filter: 3000
                     Buffers: shared hit=1765
 Planning:
   Buffers: shared hit=8
 Planning Time: 0.447 ms
 Execution Time: 71.065 ms
(39 rows)

Time: 72.265 ms
--- Q7: Dependency panel (task dependencies, newest first) ---
                                                                         QUERY PLAN                                                                         
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=2695.32..2695.33 rows=3 width=76) (actual time=21.208..21.211 rows=0 loops=1)
   Buffers: shared hit=1767
   InitPlan 3 (returns $2)
     ->  Result  (cost=2684.01..2684.02 rows=1 width=32) (actual time=21.180..21.183 rows=1 loops=1)
           Buffers: shared hit=1765
           InitPlan 1 (returns $0)
             ->  Limit  (cost=19.00..19.00 rows=1 width=40) (actual time=0.018..0.019 rows=0 loops=1)
                   ->  Sort  (cost=19.00..20.50 rows=600 width=40) (actual time=0.018..0.019 rows=0 loops=1)
                         Sort Key: d_1."createdAt" DESC
                         Sort Method: quicksort  Memory: 25kB
                         ->  Seq Scan on "TaskDependency" d_1  (cost=0.00..16.00 rows=600 width=40) (actual time=0.002..0.003 rows=0 loops=1)
           InitPlan 2 (returns $1)
             ->  Limit  (cost=2665.00..2665.00 rows=1 width=23) (actual time=21.155..21.156 rows=1 loops=1)
                   Buffers: shared hit=1765
                   ->  Sort  (cost=2665.00..2815.00 rows=60000 width=23) (actual time=21.154..21.155 rows=1 loops=1)
                         Sort Key: t."updatedAt" DESC
                         Sort Method: top-N heapsort  Memory: 25kB
                         Buffers: shared hit=1765
                         ->  Seq Scan on "Task" t  (cost=0.00..2365.00 rows=60000 width=23) (actual time=0.005..12.794 rows=60000 loops=1)
                               Buffers: shared hit=1765
   ->  Sort  (cost=11.31..11.31 rows=3 width=76) (actual time=21.206..21.207 rows=0 loops=1)
         Sort Key: d."createdAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=1767
         ->  Bitmap Heap Scan on "TaskDependency" d  (cost=4.17..11.28 rows=3 width=76) (actual time=21.195..21.196 rows=0 loops=1)
               Recheck Cond: ("taskId" = $2)
               Buffers: shared hit=1767
               ->  Bitmap Index Scan on "TaskDependency_taskId_createdAt_idx"  (cost=0.00..4.17 rows=3 width=0) (actual time=21.194..21.194 rows=0 loops=1)
                     Index Cond: ("taskId" = $2)
                     Buffers: shared hit=1767
 Planning:
   Buffers: shared hit=105
 Planning Time: 1.083 ms
 Execution Time: 21.324 ms
(34 rows)

Time: 23.207 ms
```
