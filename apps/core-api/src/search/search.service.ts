import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Priority, Task, TaskStatus } from '@prisma/client';
import { algoliasearch, Algoliasearch } from 'algoliasearch';

export interface SearchFilters {
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  priority?: Priority;
  parentId?: string | null;
}

export interface TaskSearchHit {
  objectID: string;
  title: string;
  description?: string | null;
  customFieldText?: string | null;
  projectId: string;
  assigneeId?: string | null;
  status: string;
  priority?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
  tags: string[];
  parentId?: string | null;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: Algoliasearch | null = null;
  private readonly indexName = 'tasks';
  private isEnabled: boolean;

  constructor() {
    const appId = process.env.ALGOLIA_APP_ID?.trim();
    const apiKey = process.env.ALGOLIA_API_KEY?.trim();
    const explicitSearchEnabled = this.parseBooleanEnv(process.env.SEARCH_ENABLED);

    this.isEnabled = explicitSearchEnabled ?? !!(appId && apiKey);

    if (this.isEnabled && !(appId && apiKey)) {
      this.logger.warn('SEARCH_ENABLED=true but ALGOLIA credentials are missing. Search will be disabled.');
      this.isEnabled = false;
    }

    if (this.isEnabled) {
      try {
        this.client = algoliasearch(appId!, apiKey!);
        this.logger.log('Algolia search initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Algolia:', error);
        this.isEnabled = false;
      }
    } else {
      this.logger.warn('Algolia not configured. Search will be disabled.');
    }
  }

  onModuleInit() {
    if (this.isEnabled) {
      this.configureIndex();
    }
  }

  private async configureIndex() {
    if (!this.client) return;

    try {
      const settings = {
        indexName: this.indexName,
        indexSettings: {
          searchableAttributes: ['title', 'description', 'customFieldText', 'tags'],
          attributesForFaceting: ['projectId', 'assigneeId', 'status', 'priority', 'parentId', 'tags'],
          ranking: ['typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'],
          customRanking: ['desc(updatedAt)', 'desc(createdAt)'],
          hitsPerPage: 20,
          maxValuesPerFacet: 100,
        },
      };
      
      await this.client.setSettings(settings as any);
      this.logger.log('Algolia index configured successfully');
    } catch (error) {
      this.disableSearch('Failed to configure Algolia index. Falling back to disabled mode.', error);
    }
  }

  isSearchEnabled(): boolean {
    return this.isEnabled;
  }

  async indexTask(task: Task, metadata?: { customFieldText?: string | null }): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      const searchObject = {
        objectID: task.id,
        title: task.title,
        description: task.description,
        customFieldText: metadata?.customFieldText ?? null,
        projectId: task.projectId,
        assigneeId: task.assigneeUserId,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        startAt: task.startAt,
        tags: task.tags ?? [],
        parentId: task.parentId,
        depth: (task as any).depth ?? 0,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };

      await this.client.saveObject({
        indexName: this.indexName,
        body: searchObject as Record<string, unknown>,
      });
      this.logger.debug(`Indexed task ${task.id}`);
    } catch (error) {
      this.disableSearch(`Failed to index task ${task.id}. Falling back to disabled mode.`, error);
    }
  }

  async indexTasks(tasks: Task[], metadataByTaskId?: Map<string, { customFieldText?: string | null }>): Promise<void> {
    if (!this.isEnabled || !this.client || tasks.length === 0) {
      return;
    }

    try {
      const requests = tasks.map((task) => ({
        action: 'addObject' as const,
        body: {
          objectID: task.id,
          title: task.title,
          description: task.description,
          customFieldText: metadataByTaskId?.get(task.id)?.customFieldText ?? null,
          projectId: task.projectId,
          assigneeId: task.assigneeUserId,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt,
          startAt: task.startAt,
          tags: task.tags ?? [],
          parentId: task.parentId,
          depth: (task as any).depth ?? 0,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        } as Record<string, unknown>,
      }));

      await this.client.batch({
        indexName: this.indexName,
        batchWriteParams: { requests },
      });
      this.logger.debug(`Indexed ${tasks.length} tasks`);
    } catch (error) {
      this.disableSearch('Failed to index tasks batch. Falling back to disabled mode.', error);
    }
  }

  async removeTask(taskId: string): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      await this.client.deleteObject({
        indexName: this.indexName,
        objectID: taskId,
      });
      this.logger.debug(`Removed task ${taskId} from index`);
    } catch (error) {
      this.disableSearch(`Failed to remove task ${taskId} from index. Falling back to disabled mode.`, error);
    }
  }

  async removeTasks(taskIds: string[]): Promise<void> {
    if (!this.isEnabled || !this.client || taskIds.length === 0) {
      return;
    }

    try {
      const requests = taskIds.map((id) => ({
        action: 'deleteObject' as const,
        objectID: id,
        body: {},
      }));

      await this.client.batch({
        indexName: this.indexName,
        batchWriteParams: { requests },
      });
      this.logger.debug(`Removed ${taskIds.length} tasks from index`);
    } catch (error) {
      this.disableSearch('Failed to remove tasks batch from index. Falling back to disabled mode.', error);
    }
  }

  async search(query: string, filters?: SearchFilters, page = 0, hitsPerPage = 20) {
    if (!this.isEnabled || !this.client) {
      return {
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        hitsPerPage: 0,
        processingTimeMS: 0,
        query,
        params: '',
      };
    }

    try {
      const filterString = this.buildFilterString(filters);
      
      const result = await this.client.search({
        requests: [{
          indexName: this.indexName,
          query,
          filters: filterString || undefined,
          page,
          hitsPerPage,
          attributesToHighlight: ['title', 'description'],
          highlightPreTag: '<mark>',
          highlightPostTag: '</mark>',
        }],
      });

      const searchResult = result.results[0] as any;
      return {
        hits: searchResult?.hits ?? [],
        nbHits: searchResult?.nbHits ?? 0,
        page: searchResult?.page ?? 0,
        nbPages: searchResult?.nbPages ?? 0,
        hitsPerPage: searchResult?.hitsPerPage ?? 0,
        processingTimeMS: searchResult?.processingTimeMS ?? 0,
        query: searchResult?.query ?? query,
        params: '',
      };
    } catch (error) {
      this.disableSearch('Search backend became unavailable. Falling back to disabled mode.', error);
      return {
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        hitsPerPage: 0,
        processingTimeMS: 0,
        query,
        params: '',
      };
    }
  }

  async searchTasks(
    query: string,
    filters?: SearchFilters,
    options?: { page?: number; hitsPerPage?: number }
  ): Promise<{ hits: TaskSearchHit[]; total: number; page: number; totalPages: number }> {
    const result = await this.search(
      query,
      filters,
      options?.page ?? 0,
      options?.hitsPerPage ?? 20
    );

    return {
      hits: result.hits as TaskSearchHit[],
      total: result.nbHits,
      page: result.page,
      totalPages: result.nbPages,
    };
  }

  private buildFilterString(filters?: SearchFilters): string {
    if (!filters) return '';

    const conditions: string[] = [];

    if (filters.projectId) {
      conditions.push(`projectId:${filters.projectId}`);
    }

    if (filters.assigneeId) {
      conditions.push(`assigneeId:${filters.assigneeId}`);
    }

    if (filters.status) {
      conditions.push(`status:${filters.status}`);
    }

    if (filters.priority) {
      conditions.push(`priority:${filters.priority}`);
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push('parentId:null');
      } else {
        conditions.push(`parentId:${filters.parentId}`);
      }
    }

    return conditions.join(' AND ');
  }

  async reindexAll(
    tasks: Task[],
    metadataByTaskId?: Map<string, { customFieldText?: string | null }>,
  ): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      this.logger.log(`Starting full reindex of ${tasks.length} tasks...`);
      
      await this.client.clearObjects({ indexName: this.indexName });
      
      const batchSize = 1000;
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        await this.indexTasks(batch, metadataByTaskId);
        this.logger.log(`Indexed ${Math.min(i + batchSize, tasks.length)}/${tasks.length} tasks`);
      }
      
      this.logger.log('Full reindex complete');
    } catch (error) {
      this.disableSearch('Full reindex failed. Falling back to disabled mode.', error);
    }
  }

  async getSearchStats(): Promise<{
    isEnabled: boolean;
    totalRecords?: number;
    lastBuildTime?: string;
  }> {
    if (!this.isEnabled || !this.client) {
      return { isEnabled: false };
    }

    try {
      const { results } = await this.client.search({
        requests: [{
          indexName: this.indexName,
          query: '',
          hitsPerPage: 0,
        }],
      });
      
      const result = results[0] as any;
      
      return {
        isEnabled: true,
        totalRecords: result?.nbHits,
      };
    } catch (error) {
      this.disableSearch('Failed to get search stats. Falling back to disabled mode.', error);
      return { isEnabled: false };
    }
  }

  private disableSearch(message: string, error: unknown) {
    this.logger.error(message, error);
    this.isEnabled = false;
    this.client = null;
  }

  private parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    this.logger.warn(
      `Unrecognized SEARCH_ENABLED value "${value}". Expected "true" or "false". Falling back to auto mode.`,
    );
    return undefined;
  }
}
