export interface GithubProviderSettings {
  owner: string;
  repo: string;
  projectId: string;
  repoUrl?: string;
  accountLogin?: string;
}

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  updated_at: string;
  pull_request?: Record<string, unknown>;
}
