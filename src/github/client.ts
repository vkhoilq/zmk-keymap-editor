/**
 * Minimal GitHub REST client.
 *
 * Everything runs from the browser with a fine grained personal access token,
 * so there is no backend and no OAuth application to maintain.
 */

const API = 'https://api.github.com';

export interface GitHubFile {
  path: string;
  text: string;
  sha: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'GitHubError';
  }
}

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.message ?? detail;
    } catch {
      /* keep the status text */
    }
    throw new GitHubError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Check that the token works and list the repositories it can see. */
export async function whoAmI(token: string): Promise<{ login: string }> {
  return request<{ login: string }>(`${API}/user`, token);
}

/** List the files of a directory. */
export async function listDirectory(
  ref: RepoRef,
  token: string,
  path: string,
): Promise<{ name: string; path: string; type: string; sha: string }[]> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${path}?ref=${encodeURIComponent(ref.branch)}`;
  const result = await request<
    { name: string; path: string; type: string; sha: string }[]
  >(url, token);
  return result;
}

/** Fetch a single file with its content and blob sha. */
export async function getFile(ref: RepoRef, token: string, path: string): Promise<GitHubFile> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${path}?ref=${encodeURIComponent(ref.branch)}`;
  const result = await request<{ content: string; encoding: string; sha: string }>(url, token);
  const text = result.encoding === 'base64' ? atob(result.content.replace(/\n/g, '')) : result.content;
  return { path, text, sha: result.sha };
}

/** The sha of a branch head. */
export async function getRefSha(ref: RepoRef, token: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(ref.branch)}`;
  const result = await request<{ object: { sha: string } }>(url, token);
  return result.object.sha;
}

/** The commit sha a branch points at, used as the parent of a new commit. */
export async function getHeadCommit(ref: RepoRef, token: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(ref.branch)}`;
  const result = await request<{ sha: string }>(url, token);
  return result.sha;
}

/** The tree sha of the head commit. */
export async function getHeadTree(ref: RepoRef, token: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(ref.branch)}`;
  const result = await request<{ commit: { tree: { sha: string } } }>(url, token);
  return result.commit.tree.sha;
}

async function createBlob(ref: RepoRef, token: string, text: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/git/blobs`;
  const result = await request<{ sha: string }>(url, token, {
    method: 'POST',
    body: JSON.stringify({ content: text, encoding: 'utf-8' }),
  });
  return result.sha;
}

/**
 * Commit a set of files in one atomic commit.
 *
 * Uses the git database API (blobs -> tree -> commit -> ref) so that several
 * files, for example a keymap and the shared behavior library it includes,
 * always land in the same commit.
 */
export async function commitFiles(
  ref: RepoRef,
  token: string,
  files: { path: string; text: string }[],
  message: string,
): Promise<string> {
  if (files.length === 0) throw new Error('nothing to commit');

  const [headCommit, headTree] = await Promise.all([
    getHeadCommit(ref, token),
    getHeadTree(ref, token),
  ]);

  const blobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: await createBlob(ref, token, file.text),
    })),
  );

  const treeUrl = `${API}/repos/${ref.owner}/${ref.repo}/git/trees`;
  const tree = await request<{ sha: string }>(treeUrl, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: headTree, tree: blobs }),
  });

  const commitUrl = `${API}/repos/${ref.owner}/${ref.repo}/git/commits`;
  const commit = await request<{ sha: string }>(commitUrl, token, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [headCommit],
    }),
  });

  const refUrl = `${API}/repos/${ref.owner}/${ref.repo}/git/refs/heads/${encodeURIComponent(ref.branch)}`;
  await request(refUrl, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return commit.sha;
}

/** Open a pull request for the current branch. */
export async function createPullRequest(
  ref: RepoRef,
  token: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<{ html_url: string }> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/pulls`;
  return request<{ html_url: string }>(url, token, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  });
}
