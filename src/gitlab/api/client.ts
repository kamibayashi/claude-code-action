/**
 * GitLab API client with improved error handling and authentication
 */

import { getGitLabTokenInfo, type TokenInfo } from '../token';

export interface GitLabClient {
  request<T = any>(endpoint: string, options?: RequestInit): Promise<T>;
  get<T = any>(endpoint: string): Promise<T>;
  post<T = any>(endpoint: string, body?: any): Promise<T>;
  put<T = any>(endpoint: string, body?: any): Promise<T>;
  delete<T = any>(endpoint: string): Promise<T>;
}

export function createGitLabClient(
  token?: string,
  baseUrl: string = "https://gitlab.com/api/v4"
): GitLabClient {
  const getHeaders = async (): Promise<Record<string, string>> => {
    let tokenInfo: TokenInfo;
    
    if (token) {
      // If token is provided directly, assume it's a personal/project token
      tokenInfo = { token, type: 'personal' };
    } else {
      // Get token info from environment
      tokenInfo = await getGitLabTokenInfo();
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Use appropriate authentication header based on token type
    if (tokenInfo.type === 'job') {
      headers["JOB-TOKEN"] = tokenInfo.token;
    } else {
      headers["PRIVATE-TOKEN"] = tokenInfo.token;
    }

    return headers;
  };

  const request = async <T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const url = `${baseUrl}${endpoint}`;
    const headers = await getHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      const error = new Error(
        `GitLab API error: ${response.status} ${response.statusText} - ${errorData.message}`
      );
      (error as any).status = response.status;
      (error as any).response = errorData;
      throw error;
    }

    // Handle empty responses (e.g., DELETE requests)
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {} as T;
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return {} as T;
    }

    return JSON.parse(responseText) as T;
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

async function parseErrorResponse(response: any): Promise<{ message: string; details?: any }> {
  try {
    const contentType = response.headers?.get?.('content-type');
    
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      
      // GitLab API error response formats
      if (errorData.message) {
        return { message: errorData.message, details: errorData };
      }
      
      if (errorData.error) {
        return { message: errorData.error, details: errorData };
      }
      
      if (errorData.error_description) {
        return { message: errorData.error_description, details: errorData };
      }
      
      return { message: JSON.stringify(errorData), details: errorData };
    } else {
      const text = await response.text();
      return { message: text || response.statusText };
    }
  } catch {
    return { message: response.statusText || 'Unknown error' };
  }
}
