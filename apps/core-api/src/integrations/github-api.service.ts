import { Injectable, UnauthorizedException } from '@nestjs/common';
import { GithubIssue } from './github.types';

interface GithubRepoResponse {
  html_url: string;
  full_name: string;
}

interface GithubUserResponse {
  login: string;
}

@Injectable()
export class GithubApiService {
  private readonly baseUrl = process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com';

  async getAuthenticatedUser(accessToken: string): Promise<GithubUserResponse> {
    return this.request<GithubUserResponse>('/user', accessToken);
  }

  async getRepo(owner: string, repo: string, accessToken: string): Promise<GithubRepoResponse> {
    return this.request<GithubRepoResponse>(`/repos/${owner}/${repo}`, accessToken);
  }

  async listIssues(input: {
    owner: string;
    repo: string;
    accessToken: string;
    since?: string | null;
  }): Promise<GithubIssue[]> {
    const params = new URLSearchParams({
      state: 'all',
      sort: 'updated',
      direction: 'asc',
      per_page: '100',
    });
    if (input.since) {
      params.set('since', input.since);
    }
    return this.request<GithubIssue[]>(
      `/repos/${input.owner}/${input.repo}/issues?${params.toString()}`,
      input.accessToken,
    );
  }

  private async request<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'atlaspm-github-integration',
      },
    });

    if (response.status === 401) {
      throw new UnauthorizedException('GitHub credentials were rejected');
    }
    if (!response.ok) {
      throw new Error(`GitHub API request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
