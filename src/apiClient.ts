/**
 * API 客户端 - 统一管理后端 HTTP 请求
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

interface APIResponse<T = any> {
    code: number;
    message?: string;
    data?: T;
}

class APIClient {
    private baseURL: string;
    private token: string | null = null;

    constructor(baseURL: string = API_BASE_URL) {
        this.baseURL = baseURL;
        // 启动时从 localStorage 加载 token
        this.token = localStorage.getItem('access_token');
    }

    setToken(token: string) {
        this.token = token;
        localStorage.setItem('access_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('access_token');
    }

    getToken(): string | null {
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<APIResponse<T>> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            // 401 未授权，清除 token
            if (response.status === 401) {
                this.clearToken();
                throw new Error('Authentication required');
            }
            // 通用错误，不暴露内部信息
            throw new Error('Request failed. Please try again later.');
        }

        return await response.json();
    }

    // --- 认证 API ---
    async register(username: string, password: string, email?: string) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, email }),
        });
    }

    async login(username: string, password: string) {
        const response = await this.request<{ access_token: string; expires_at: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        if (response.data?.access_token) {
            this.setToken(response.data.access_token);
        }
        return response;
    }

    async refreshToken() {
        const response = await this.request<{ access_token: string; expires_at: string }>('/auth/refresh', {
            method: 'POST',
        });
        if (response.data?.access_token) {
            this.setToken(response.data.access_token);
        }
        return response;
    }

    // --- 用户 API ---
    async getUserProfile() {
        return this.request('/user/profile');
    }

    async updateUserProfile(data: any) {
        return this.request('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async getUserStats() {
        return this.request('/user/stats');
    }

    // --- 分数 API ---
    async submitScore(scoreData: {
        score: number;
        mode: string;
        duration: number;
        max_combo: number;
        accuracy: number;
        client_timestamp: string;
        signature: string;
    }) {
        return this.request('/scores', {
            method: 'POST',
            body: JSON.stringify(scoreData),
        });
    }

    async getScoreHistory(page: number = 1, pageSize: number = 10) {
        return this.request(`/scores/history?page=${page}&page_size=${pageSize}`);
    }

    // --- 成就 API ---
    async getAchievements() {
        return this.request('/achievements');
    }

    async unlockAchievement(achievementId: string, proof: any) {
        return this.request('/achievements/unlock', {
            method: 'POST',
            body: JSON.stringify({ achievement_id: achievementId, proof }),
        });
    }

    // --- 设置 API ---
    async getSettings() {
        return this.request('/settings');
    }

    async updateSettings(settings: any) {
        return this.request('/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    }

    // --- 排行榜 API ---
    async getLeaderboard(page: number = 1, pageSize: number = 20, timeRange: string = 'all') {
        return this.request(`/leaderboard?page=${page}&page_size=${pageSize}&time_range=${timeRange}`);
    }

    async getTop10() {
        return this.request('/leaderboard/top10');
    }
}

export const apiClient = new APIClient();
