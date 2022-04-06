// export interface JiraIssue {
//   [key]: value;
// }

export interface GitHubProject {
  name: string;
  label: string;
}

export interface GitHubIssue {
  owner: string;
  repo: string;
  title: string;
  body: string;
  assignee: string;
  milestone: string;
  labels: string[];
  assignees: string[];
}

export interface GitHubMilestone {
  number?: string;
  owner: string;
  repo: string;
  title: string;
  state?: string;
  description?: string;
  due_on?: string;
}


export interface JiraVersion {
  id: string;
  repo: string;
  name: string;
  description: string;
  userReleaseDate: string;
  projectId: number;
}

