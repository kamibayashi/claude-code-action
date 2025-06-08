/**
 * GitLab API client
 */

export interface GitLabClient {
  request<T = any>(endpoint: string, options?: RequestInit): Promise<T>;
  get<T = any>(endpoint: string): Promise<T>;
  post<T = any>(endpoint: string, body?: any): Promise<T>;
  put<T = any>(endpoint: string, body?: any): Promise<T>;
  delete<T = any>(endpoint: string): Promise<T>;
}

export function createGitLabClient(
  token: string,
  baseUrl: string = "https://gitlab.com/api/v4",
): GitLabClient {
  const headers = {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
  };

  const request = async <T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> => {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  };

  return {
    request,
    get: (endpoint) => request(endpoint, { method: "GET" }),
    post: (endpoint, body) =>
      request(endpoint, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    put: (endpoint, body) =>
      request(endpoint, {
        method: "PUT",
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: (endpoint) => request(endpoint, { method: "DELETE" }),
  };
}
