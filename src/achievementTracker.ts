// --- 成就追踪模块 ---
import { ACHIEVEMENTS } from './achievements';
import { ACHIEVEMENT_STORE } from './storage';
import { soundEffects } from './soundEffects';
import { apiClient } from './apiClient';

let sessionStartTime = Date.now();
let keyPressTimestamps: number[] = [];
let bossKeyPressTime: number | null = null;

// 初始化成就
export function initAchievements(achievementData: any): void {
    ACHIEVEMENTS.forEach(achievement => {
        if (!achievementData.achievements[achievement.id]) {
            achievementData.achievements[achievement.id] = {
                id: achievement.id,
                name: achievement.name,
                tier: achievement.tier,
                description: achievement.description,
                unlocked: false,
                unlockedAt: null,
                progress: 0
            };
        }
    });
    
    // 首次启动自动解锁 Env Ready
    checkAndUnlockAchievement('env_ready', achievementData, () => {});
}

// 检测并解锁成就
export function checkAndUnlockAchievement(
    achievementId: string,
    achievementData: any,
    onUnlock?: (achievement: any) => void,
    showNotification = true
): void {
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return;
    
    const achievementState = achievementData.achievements[achievementId];
    if (achievementState.unlocked) return; // 已解锁
    
    const isUnlocked = achievement.check(achievementData.stats, achievementData.achievements);
    
    if (isUnlocked) {
        achievementState.unlocked = true;
        achievementState.unlockedAt = new Date().toISOString();
        achievementState.progress = achievement.requirement || 100;
        
        ACHIEVEMENT_STORE.save(achievementData);
        
        // 同步到后端
        apiClient.unlockAchievement(achievementId, {
            stats: achievementData.stats,
            timestamp: new Date().toISOString()
        }).catch(err => console.error('Failed to sync achievement:', err));
        
        // 播放成就解锁音效
        soundEffects.playAchievement();
        
        if (showNotification) {
            showAchievementNotification(achievement);
        }
        
        if (onUnlock) {
            onUnlock(achievement);
        }
        
        // 检查是否解锁了 Final Build
        checkAndUnlockAchievement('final_build', achievementData, onUnlock, true);
    }
}

// 批量检测成就
export function checkAchievements(achievementData: any): void {
    ACHIEVEMENTS.forEach(achievement => {
        if (achievement.id !== 'env_ready') {
            checkAndUnlockAchievement(achievement.id, achievementData, undefined, true);
        }
    });
    
    // 更新进度
    ACHIEVEMENTS.forEach(achievement => {
        const achievementState = achievementData.achievements[achievement.id];
        if (!achievementState.unlocked && achievement.current) {
            achievementState.progress = achievement.current(achievementData.stats);
        }
    });
}

// 成就解锁通知
function showAchievementNotification(achievement: any): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: linear-gradient(135deg, #4ec9b0 0%, #3aa38f 100%);
        color: #fff;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(78, 201, 176, 0.4);
        font-family: 'Consolas', monospace;
        font-size: 13px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    
    const tierNames = ['', 'Entry Level', 'Senior Dev', 'Tech Lead', 'Chief Architect'];
    
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">
            🏆 Achievement Unlocked
        </div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 3px;">
            [${tierNames[achievement.tier]}] ${achievement.name}
        </div>
        <div style="font-size: 11px; opacity: 0.7;">
            ${achievement.description}
        </div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 统计追踪函数
export function trackClick(achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    achievementData.stats.totalClicks++;
    checkAndUnlockFn('unit_pass', achievementData, undefined, true);
    checkAndUnlockFn('big_data', achievementData, undefined, true);
}

export function trackKeyPress(achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    const now = Date.now();
    keyPressTimestamps.push(now);
    
    // 保留最近1秒的按键
    keyPressTimestamps = keyPressTimestamps.filter(t => now - t < 1000);
    
    if (keyPressTimestamps.length > achievementData.stats.maxConcurrentKeys) {
        achievementData.stats.maxConcurrentKeys = keyPressTimestamps.length;
        checkAndUnlockFn('high_concurrency', achievementData, undefined, true);
    }
}

export function trackBossKey(achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    if (!achievementData.stats.bossKeyUsed) {
        achievementData.stats.bossKeyUsed = true;
        checkAndUnlockFn('hotfix', achievementData, undefined, true);
    }
    
    // 记录 Boss 键按下时间（用于计算反应速度）
    bossKeyPressTime = Date.now();
}

export function trackBossKeyRelease(achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    if (bossKeyPressTime) {
        const responseTime = Date.now() - bossKeyPressTime;
        if (responseTime < achievementData.stats.fastestBossKeyResponse) {
            achievementData.stats.fastestBossKeyResponse = responseTime;
            checkAndUnlockFn('zero_latency', achievementData, undefined, true);
        }
        bossKeyPressTime = null;
    }
}

// 周五下午检测
export function checkFridayAfternoon(achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    const now = new Date();
    if (now.getDay() === 5 && now.getHours() >= 16) {
        achievementData.stats.fridayAfternoon = true;
        checkAndUnlockFn('friday_warrior', achievementData, undefined, true);
    }
}

// 游戏结束钩子
export function onGameEnd(completionTime: number, missedCount: number, achievementData: any, checkAndUnlockFn: (id: string, data: any, cb?: any, notify?: boolean) => void): void {
    achievementData.stats.sessionsCompleted++;
    
    // Agile Sprint: 10分钟内完成
    if (completionTime <= 600) {
        achievementData.stats.fastGameCompletion = true;
        checkAndUnlockFn('agile_sprint', achievementData, undefined, true);
    }
    
    // Stress Test: 持续1分钟不中断
    if (completionTime >= 60 && missedCount === 0) {
        achievementData.stats.longSession = true;
        checkAndUnlockFn('stress_test', achievementData, undefined, true);
    }
    
    // 保存统计数据
    ACHIEVEMENT_STORE.save(achievementData);
}
