// --- 混合存储：优先API，降级到本地文件 (AES-256-GCM + HMAC) ---
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { apiClient } from './apiClient';

const SECURE_STORE: any = {
    // 使用固定密钥派生（生产环境建议使用更安全的密钥管理）
    masterKey: 'SYS_DIAG_2026_MASTER_SECRET_KEY_V1',
    filePath: path.join(os.homedir(), '.sys_diagnostic_data'),
    
    // 从主密钥派生加密密钥和 HMAC 密钥
    deriveKeys: function() {
        const encKey = crypto.createHash('sha256').update(this.masterKey + '_ENC').digest();
        const hmacKey = crypto.createHash('sha256').update(this.masterKey + '_HMAC').digest();
        return { encKey, hmacKey };
    },
    
    encrypt: function(text: string): string | null {
        try {
            const { encKey, hmacKey } = this.deriveKeys();
            
            // 生成随机 IV
            const iv = crypto.randomBytes(16);
            
            // AES-256-GCM 加密
            const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // 获取认证标签
            const authTag = cipher.getAuthTag();
            
            // 组合: IV + 认证标签 + 密文
            const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
            
            // 计算 HMAC
            const hmac = crypto.createHmac('sha256', hmacKey);
            hmac.update(combined);
            const signature = hmac.digest();
            
            // 最终格式: HMAC + 数据
            const final = Buffer.concat([signature, combined]);
            return final.toString('base64');
        } catch (e) {
            console.error('Encryption failed:', e);
            return null;
        }
    },
    //test
    decrypt: function(encoded: string): string | null {
        try {
            const { encKey, hmacKey } = this.deriveKeys();
            
            // 解码 Base64
            const data = Buffer.from(encoded, 'base64');
            
            // 提取 HMAC 签名和数据
            const signature = data.slice(0, 32);
            const combined = data.slice(32);
            
            // 验证 HMAC
            const hmac = crypto.createHmac('sha256', hmacKey);
            hmac.update(combined);
            const expectedSig = hmac.digest();
            
            if (!crypto.timingSafeEqual(signature, expectedSig)) {
                console.error('HMAC verification failed - data may be tampered');
                return null;
            }
            
            // 提取 IV、认证标签和密文
            const iv = combined.slice(0, 16);
            const authTag = combined.slice(16, 32);
            const encrypted = combined.slice(32);
            
            // AES-256-GCM 解密
            const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encrypted).toString('utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (e) {
            console.error('Decryption failed:', e);
            return null;
        }
    },
    
    save: function(data: any): void {
        try {
            const encrypted = this.encrypt(JSON.stringify(data));
            if (encrypted) {
                fs.writeFileSync(this.filePath, encrypted, 'utf8');
            }
        } catch (e) {
            console.error('Failed to save data:', e);
        }
    },
    
    load: function(): any[] {
        try {
            if (!fs.existsSync(this.filePath)) {
                return [];
            }
            const encrypted = fs.readFileSync(this.filePath, 'utf8');
            const str = this.decrypt(encrypted);
            return str ? JSON.parse(str) : [];
        } catch (e) {
            console.error('Failed to load data:', e);
            return [];
        }
    }
};

// --- 自定义代码库存储 ---
const CUSTOM_SNIPPETS_STORE: any = {
    filePath: path.join(os.homedir(), '.sys_diagnostic_custom_snippets'),
    
    save: function(snippets: string[]): void {
        try {
            const encrypted = SECURE_STORE.encrypt(JSON.stringify(snippets));
            if (encrypted) {
                fs.writeFileSync(this.filePath, encrypted, 'utf8');
            }
        } catch (e) {
            console.error('Failed to save custom snippets:', e);
        }
    },
    
    load: function(): string[] {
        try {
            if (!fs.existsSync(this.filePath)) {
                return [];
            }
            const encrypted = fs.readFileSync(this.filePath, 'utf8');
            const str = SECURE_STORE.decrypt(encrypted);
            return str ? JSON.parse(str) : [];
        } catch (e) {
            console.error('Failed to load custom snippets:', e);
            return [];
        }
    }
};

// --- 成就系统存储 ---
const ACHIEVEMENT_STORE: any = {
    filePath: path.join(os.homedir(), '.sys_diagnostic_achievements'),
    
    save: function(data: any): void {
        try {
            const encrypted = SECURE_STORE.encrypt(JSON.stringify(data));
            if (encrypted) {
                fs.writeFileSync(this.filePath, encrypted, 'utf8');
            }
        } catch (e) {
            console.error('Failed to save achievements:', e);
        }
    },
    
    load: function(): any {
        try {
            if (!fs.existsSync(this.filePath)) {
                return this.createDefaultData();
            }
            const encrypted = fs.readFileSync(this.filePath, 'utf8');
            const str = SECURE_STORE.decrypt(encrypted);
            return str ? JSON.parse(str) : this.createDefaultData();
        } catch (e) {
            console.error('Failed to load achievements:', e);
            return this.createDefaultData();
        }
    },
    
    createDefaultData: function(): any {
        return {
            achievements: {},
            stats: {
                totalClicks: 0,
                totalRuntime: 0,
                maxConcurrentKeys: 0,
                bossKeyUsed: false,
                settingsSaved: false,
                firstDataSave: false,
                tabSwitchCount: 0,
                fastestBossKeyResponse: Infinity,
                sessionsCompleted: 0
            }
        };
    }
};

// --- 音效设置存储 ---
const SOUND_SETTINGS_STORE: any = {
    filePath: path.join(os.homedir(), '.sys_diagnostic_sound_settings'),
    
    save: function(settings: any): void {
        try {
            const encrypted = SECURE_STORE.encrypt(JSON.stringify(settings));
            if (encrypted) {
                fs.writeFileSync(this.filePath, encrypted, 'utf8');
            }
        } catch (e) {
            console.error('Failed to save sound settings:', e);
        }
    },
    
    load: function(): any {
        try {
            if (!fs.existsSync(this.filePath)) {
                return this.createDefaultSettings();
            }
            const encrypted = fs.readFileSync(this.filePath, 'utf8');
            const str = SECURE_STORE.decrypt(encrypted);
            return str ? JSON.parse(str) : this.createDefaultSettings();
        } catch (e) {
            console.error('Failed to load sound settings:', e);
            return this.createDefaultSettings();
        }
    },
    
    createDefaultSettings: function(): any {
        return {
            enabled: true,
            volume: 0.3 // 0-1
        };
    }
};

export { SECURE_STORE, CUSTOM_SNIPPETS_STORE, ACHIEVEMENT_STORE, SOUND_SETTINGS_STORE };
