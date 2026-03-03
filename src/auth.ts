/**
 * 认证模块 - 管理用户登录状态
 */

import { apiClient } from './apiClient';

interface User {
    user_id: string;
    username: string;
    email?: string;
    level: number;
    experience: number;
}

let currentUser: User | null = null;

/**
 * 显示登录界面
 */
export function showLoginUI(onSuccess: (user: User) => void) {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    overlay.innerHTML = `
        <div style="background: #1e1e1e; padding: 40px; border-radius: 10px; max-width: 400px; width: 90%;">
            <h2 style="color: #00ff88; margin-top: 0;">System Diagnostic Login</h2>
            <div id="auth-error" style="color: #ff4444; margin-bottom: 10px; display: none;"></div>
            
            <div id="login-form">
                <input type="text" id="login-username" placeholder="Username" 
                    style="width: 100%; padding: 10px; margin: 10px 0; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 5px;">
                <input type="password" id="login-password" placeholder="Password" 
                    style="width: 100%; padding: 10px; margin: 10px 0; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 5px;">
                <button id="login-btn" style="width: 100%; padding: 12px; margin: 10px 0; background: #00ff88; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Login
                </button>
                <button id="show-register-btn" style="width: 100%; padding: 12px; background: transparent; color: #00ff88; border: 1px solid #00ff88; border-radius: 5px; cursor: pointer;">
                    Register
                </button>
            </div>

            <div id="register-form" style="display: none;">
                <input type="text" id="reg-username" placeholder="Username" 
                    style="width: 100%; padding: 10px; margin: 10px 0; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 5px;">
                <input type="email" id="reg-email" placeholder="Email (optional)" 
                    style="width: 100%; padding: 10px; margin: 10px 0; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 5px;">
                <input type="password" id="reg-password" placeholder="Password" 
                    style="width: 100%; padding: 10px; margin: 10px 0; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 5px;">
                <button id="register-btn" style="width: 100%; padding: 12px; margin: 10px 0; background: #00ff88; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Create Account
                </button>
                <button id="show-login-btn" style="width: 100%; padding: 12px; background: transparent; color: #00ff88; border: 1px solid #00ff88; border-radius: 5px; cursor: pointer;">
                    Back to Login
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const loginForm = document.getElementById('login-form')!;
    const registerForm = document.getElementById('register-form')!;
    const errorDiv = document.getElementById('auth-error')!;

    // 切换到注册界面
    document.getElementById('show-register-btn')!.onclick = () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        errorDiv.style.display = 'none';
    };

    // 切换到登录界面
    document.getElementById('show-login-btn')!.onclick = () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        errorDiv.style.display = 'none';
    };

    // 登录处理
    document.getElementById('login-btn')!.onclick = async () => {
        const username = (document.getElementById('login-username') as HTMLInputElement).value;
        const password = (document.getElementById('login-password') as HTMLInputElement).value;

        if (!username || !password) {
            showError('Please enter username and password');
            return;
        }

        try {
            const response = await apiClient.login(username, password);
            if (response.code === 0) {
                // 获取用户信息
                const profileRes = await apiClient.getUserProfile();
                if (profileRes.code === 0 && profileRes.data) {
                    currentUser = profileRes.data;
                    overlay.remove();
                    onSuccess(currentUser);
                }
            } else {
                showError(response.message || 'Login failed');
            }
        } catch (error) {
            showError((error as Error).message);
        }
    };

    // 注册处理
    document.getElementById('register-btn')!.onclick = async () => {
        const username = (document.getElementById('reg-username') as HTMLInputElement).value;
        const email = (document.getElementById('reg-email') as HTMLInputElement).value;
        const password = (document.getElementById('reg-password') as HTMLInputElement).value;

        if (!username || !password) {
            showError('Please enter username and password');
            return;
        }

        try {
            const response = await apiClient.register(username, password, email || undefined);
            if (response.code === 0) {
                // 注册成功，自动登录
                await apiClient.login(username, password);
                const profileRes = await apiClient.getUserProfile();
                if (profileRes.code === 0 && profileRes.data) {
                    currentUser = profileRes.data;
                    overlay.remove();
                    onSuccess(currentUser);
                }
            } else {
                showError(response.message || 'Registration failed');
            }
        } catch (error) {
            showError((error as Error).message);
        }
    };

    function showError(message: string) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

/**
 * 检查是否已登录
 */
export async function checkAuth(): Promise<User | null> {
    const token = apiClient.getToken();
    if (!token) {
        return null;
    }

    try {
        const response = await apiClient.getUserProfile();
        if (response.code === 0 && response.data) {
            currentUser = response.data;
            return currentUser;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        apiClient.clearToken();
    }

    return null;
}

/**
 * 获取当前用户
 */
export function getCurrentUser(): User | null {
    return currentUser;
}

/**
 * 登出
 */
export function logout() {
    currentUser = null;
    apiClient.clearToken();
    location.reload();
}
