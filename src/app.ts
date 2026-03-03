// ---导入模块 ---
import type { LangConfig } from './gameConfig';
import { SECURE_STORE, CUSTOM_SNIPPETS_STORE, ACHIEVEMENT_STORE, SOUND_SETTINGS_STORE } from './storage';
import { LANG_CONFIG, CUSTOM_LANG, getDifficultyMultiplier, getLevel, getMaxMisses } from './gameConfig';
import { initComboDisplay, addCombo, forceResetCombo, getComboCount, setInteractionMode, onMissed } from './combo';
import { initPracticeModeUI, isInPracticeMode, filterLanguageConfig } from './practiceMode';
import { saveGameProgress, showRestorePrompt, deleteSaveData } from './gameState';
import { soundEffects } from './soundEffects';
import { checkCheats, isWallCheatActive, resetCheats } from './cheats';
import { checkHighScores, submitScore, exportScores } from './leaderboard';
import { initTerminalInput } from './terminal';
import { initSettingsPanel } from './uiHandlers';
import {
    initAchievements,
    checkAndUnlockAchievement,
    checkAchievements,
    trackClick,
    trackKeyPress,
    trackBossKey,
    trackBossKeyRelease,
    checkFridayAfternoon,
    onGameEnd
} from './achievementTracker';
import {
    initChallengeModeUI,
    getCurrentChallengeMode,
    shouldGameOver,
    getSnippetSpawnInterval,
    getFallSpeedMultiplier,
    shouldShowTimer,
    getRemainingTime,
    loadChallengeMode,
    saveChallengeMode,
    isRankedMode,
    getModeName
} from './challengeModes';
// --- AWDMS 系统导入 ---
import { initDailyTaskState, updateTaskStats, saveDailyTaskState, type DailyTaskState } from './dailyTasks';
import { initItemSystemState, updateMissCount, type ItemSystemState } from './itemSystem';
import { initGachaState, type GachaSystemState } from './gachaSystem';
import {
    initAWDMSUI,
    setupTaskClaimHandler,
    setupItemToggleHandler,
    setupCompileHandler,
    setupPurchaseHandler,
    createCommitsIndicator,
    updateCommitsDisplay
} from './awdmsUI';
import {
    applyAutoPrettier,
    applyDeepSeekAI,
    createAISnippet,
    getK8sMultiplier,
    getLodashBonus,
    stopAllItemEffects
} from './itemEffects';
import './analytics'; // Analytics 函数挂载到 window
import './achievementUI'; // Achievement UI 函数挂载到 window
import { initThemeSystem, getCurrentTheme, applyTheme, initThemeUI } from './themeSystem';
// --- 认证系统 ---
import { checkAuth, showLoginUI, getCurrentUser } from './auth';
import { apiClient } from './apiClient';

// --- 类型定义 ---
type InteractionMode = 'click' | 'type';

// --- 启动时检查登录状态 ---
(async () => {
    const user = await checkAuth();
    if (!user) {
        // 未登录，显示登录界面
        showLoginUI((loggedInUser) => {
            console.log('User logged in:', loggedInUser.username);
            // 登录成功后初始化游戏
            initGame();
        });
    } else {
        // 已登录，直接初始化游戏
        console.log('User already logged in:', user.username);
        initGame();
    }
})();

function initGame() {

// --- 辅助函数：提交分数到后端 ---
async function submitScoreToBackend() {
    try {
        const mode = isInPracticeMode() ? 'practice' : 'normal';
        const accuracy = calculateAccuracy();
        const scoreData = {
            score: currentScore,
            mode,
            duration: seconds,
            max_combo: getComboCount(),
            accuracy,
            client_timestamp: new Date().toISOString(),
            signature: generateScoreSignature(currentScore, seconds)
        };
        await apiClient.submitScore(scoreData);
    } catch (error) {
        console.error('Failed to submit score:', error);
    }
}

function calculateAccuracy(): number {
    const total = currentScore + missedCount;
    return total > 0 ? currentScore / total : 1.0;
}

function generateScoreSignature(score: number, duration: number): string {
    // 简单签名，实际应使用更复杂的算法
    const data = `${score}_${duration}_${Date.now()}`;
    return btoa(data); // Base64 编码
}

// 加载成就数据
let achievementData: any = ACHIEVEMENT_STORE.load();

// 加载音效设置
let soundSettings = SOUND_SETTINGS_STORE.load();
soundEffects.setVolume(soundSettings.volume);
if (!soundSettings.enabled) {
    soundEffects.toggle();
}

// 加载自定义代码片段
let customSnippets = CUSTOM_SNIPPETS_STORE.load();
CUSTOM_LANG.snippets = customSnippets;

// --- 初始化 AWDMS 系统 ---
let awdmsTaskState: DailyTaskState = initDailyTaskState();
let awdmsItemState: ItemSystemState = initItemSystemState();
let awdmsGachaState: GachaSystemState = initGachaState();

// 字符输入追踪（用于burst检测）
let charInputBuffer: { time: number; count: number }[] = [];
let clickTimestamps: number[] = []; // 用于k8s-autoscale频率计算

const container = document.getElementById('game-container')!;
const scoreElement = document.getElementById('score')!;
const stabilityElement = document.getElementById('stability')!;
const timerElement = document.getElementById('timer')!;
const levelElement = document.getElementById('level')!;
const mainUI = document.getElementById('main-ui')!;
const fakeScreen = document.getElementById('fake-screen')!;
const gameOverScreen = document.getElementById('game-over')!;
const cheatMsg = document.getElementById('cheat-msg')!;
const modeToggleBtn = document.getElementById('mode-toggle')!;
const modeText = document.getElementById('mode-text')!;
const typingInputArea = document.getElementById('typing-input-area')!;
const typingInput = document.getElementById('typing-input') as HTMLInputElement;

let currentScore: number = 0.0;
let missedCount: number = 0;
let seconds: number = 0;
let isBossMode: boolean = false;
let isGameOver: boolean = false;
let globalSpeedMultiplier: number = 1.0;
let interactionMode: InteractionMode = 'click';
let lastLevel: number = 1;
let highestScore: number = 0;

// --- 核心生成逻辑 ---
function createSnippet(): void {
    if (isBossMode || isGameOver) return;

    // 混合使用内置和自定义代码片段，并根据练习模式过滤
    let availableConfigs: LangConfig[] = filterLanguageConfig([...LANG_CONFIG]);
    if (CUSTOM_LANG.snippets.length > 0 && !isInPracticeMode()) {
        availableConfigs.push(CUSTOM_LANG as LangConfig);
    }
    
    if (availableConfigs.length === 0) {
        availableConfigs = LANG_CONFIG; // 回退到默认配置
    }
    
    const langData = availableConfigs[Math.floor(Math.random() * availableConfigs.length)];
    const text = langData.snippets[Math.floor(Math.random() * langData.snippets.length)];
    const div = document.createElement('div');
    div.className = `code-line ${langData.colorClass}`;
    div.innerText = text;
    div.dataset.text = text; // 存储文本用于键盘匹配

    const x = Math.random() * (window.innerWidth - 200);
    let y = window.innerHeight;
    let isPaused = false;

    div.style.left = x + 'px';
    div.style.top = y + 'px';

    div.onmouseenter = () => { 
        isPaused = true; 
        soundEffects.playPause(); // 播放暂停音效
    };
    div.onmouseleave = () => { isPaused = false; };

    // 点击模式
    if (interactionMode === 'click') {
        div.onclick = (e) => {
            trackClick(achievementData, checkAndUnlockAchievement); // 追踪点击
            addScore(langData.score, e.clientX, e.clientY);
            div.remove();
        };
    } else {
        // 键盘模式下高亮匹配项
        div.style.cursor = 'default';
    }

    container.appendChild(div);

    // 应用挑战模式的速度倍率
    const challengeSpeedMultiplier = getFallSpeedMultiplier();
    const totalSpeed = (1.0 + Math.random() * 1.5) * langData.speedBonus * globalSpeedMultiplier * challengeSpeedMultiplier;

    function move(): void {
        if (isBossMode || isGameOver) {
            div.remove();
            return;
        }
        if (!isPaused) {
            y -= totalSpeed;

            // --- 作弊逻辑：Wall 模式下，代码在顶部 40px 处停住 ---
            if (isWallCheatActive() && y < 40) {
                y = 40;
            } else {
                div.style.top = y + 'px';
            }
        }

        // --- 正常销毁逻辑 ---
        if (y < 40 && !isWallCheatActive()) { // Wall 模式下不销毁
            missedCount++;
            soundEffects.playMiss(); // 播放 Miss 音效
            onMissed(); // 溢出时重置连击
            
            // AWDMS: 更新Miss计数
            updateMissCount(awdmsItemState, true);
            
            div.remove();
        } else if (!isWallCheatActive() || y > 40) { // 如果没激活作弊，或者虽然激活但还没到顶，继续动画
            requestAnimationFrame(move);
        } else if (isWallCheatActive() && y <= 40) {
            // Wall 模式下，已经到顶了，保持不动，继续循环检测状态以便作弊结束后恢复运动
            requestAnimationFrame(move);
        }
    }
    requestAnimationFrame(move);
}

function addScore(amount: number, x?: number, y?: number): void {
    // 应用道具加成
    const lodashBonus = getLodashBonus(awdmsItemState);
    
    // 更新点击时间戳用于k8s-autoscale
    clickTimestamps.push(Date.now());
    clickTimestamps = clickTimestamps.filter(t => Date.now() - t < 1000); // 只保留最近1秒
    const clicksPerSecond = clickTimestamps.length;
    const k8sMultiplier = getK8sMultiplier(awdmsItemState, clicksPerSecond);
    
    // 计算最终得分
    const finalAmount = (amount + lodashBonus) * k8sMultiplier;
    
    currentScore += finalAmount;
    currentScore = Math.round(currentScore * 10) / 10;
    scoreElement.innerText = currentScore.toFixed(1);
    
    // 检测破纪录
    if (currentScore > highestScore) {
        soundEffects.playNewRecord();
        highestScore = currentScore;
    }
    
    // 播放点击音效
    soundEffects.playClick();
    
    // 添加连击
    const combo = addCombo();
    
    // 检测完美连击里程碑
    if (combo === 20 || combo === 50 || combo === 100) {
        soundEffects.playPerfectCombo(combo);
    }
    
    // AWDMS: 更新字符统计
    updateTaskStats(awdmsTaskState, 'char');
    updateCommitsDisplay(awdmsTaskState);
    
    if (x && y) showFloatScore(x, y, finalAmount, combo);
}

function showFloatScore(x: number, y: number, amount: number, combo: number): void {
    const el = document.createElement('div');
    el.className = 'float-score';
    
    // 如果有连击，显示连击数
    if (combo && combo >= 2) {
        el.innerText = `+${amount.toFixed(1)} (x${combo})`;
        el.style.color = combo >= 5 ? '#dcdcaa' : '#4ec9b0';
    } else {
        el.innerText = `+${amount.toFixed(1)}`;
    }
    
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// --- 游戏主循环 ---
setInterval(() => {
    if (!isBossMode && !isGameOver) {
        seconds++;
        const lv = getLevel(seconds);
        
        // 挑战模式：限时模式显示倒计时
        const remainingTime = getRemainingTime(seconds);
        if (remainingTime !== null) {
            timerElement.innerText = `${Math.floor(remainingTime / 60).toString().padStart(2, '0')}:${(remainingTime % 60).toString().padStart(2, '0')}`;
            timerElement.style.color = remainingTime <= 10 ? '#f44747' : '#d4d4d4';
        } else if (shouldShowTimer()) {
            timerElement.innerText = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
            timerElement.style.color = '#d4d4d4';
        } else {
            // 禅意模式不显示计时器
            timerElement.innerText = '--:--';
            timerElement.style.color = '#666';
        }
        
        levelElement.innerText = String(lv);
        globalSpeedMultiplier = getDifficultyMultiplier(seconds); // 使用公式化难度

        // 检测等级提升
        if (lv > lastLevel) {
            soundEffects.playLevelUp();
            lastLevel = lv;
        }

        const stability = Math.max(0, 100 - (missedCount / getMaxMisses(lv) * 100));
        stabilityElement.innerText = String(Math.floor(stability));

        // 低稳定度警告（每5秒播放一次）
        if (stability < 20 && seconds % 5 === 0) {
            soundEffects.playLowStabilityWarning();
        }

        // 即将失败警告（Miss超过80%上限时）
        const missRatio = missedCount / getMaxMisses(lv);
        if (missRatio > 0.8 && missRatio < 1.0 && seconds % 3 === 0) {
            soundEffects.playNearFail();
        }

        // 使用挑战模式的失败判定
        if (shouldGameOver(missedCount, seconds, lv, getMaxMisses)) {
            triggerGameOver();
        }
    }
}, 1000);

const gameLoop = (): void => {
    if (!isBossMode && !isGameOver) createSnippet();
    // 应用挑战模式的生成间隔倍率
    const baseInterval = 700 / globalSpeedMultiplier;
    const interval = getSnippetSpawnInterval(baseInterval);
    setTimeout(gameLoop, interval);
};
gameLoop();

// --- 模式切换 ---
modeToggleBtn.addEventListener('click', () => {
    soundEffects.playButtonClick(); // 按钮点击音效
    interactionMode = interactionMode === 'click' ? 'type' : 'click';
    modeText.innerText = interactionMode === 'click' ? 'Click' : 'Type';
    setInteractionMode(interactionMode); // 同步连击系统的模式
    
    if (interactionMode === 'type') {
        typingInputArea.style.display = 'block';
        typingInput.focus();
    } else {
        typingInputArea.style.display = 'none';
    }
});

// --- 键盘输入匹配逻辑 ---
if (typingInput) {
    typingInput.addEventListener('input', () => {
        const inputValue = typingInput.value.trim();
        if (inputValue.length === 0) {
            // 清除所有高亮
            document.querySelectorAll('.code-line').forEach(el => {
                (el as HTMLElement).style.outline = 'none';
            });
            return;
        }

        // 查找匹配的代码片段
        let matched = false;
        document.querySelectorAll('.code-line').forEach(el => {
            const htmlEl = el as HTMLElement;
            const text = htmlEl.dataset.text;
            if (text && text.toLowerCase().includes(inputValue.toLowerCase())) {
                htmlEl.style.outline = '2px solid #4ec9b0';
                matched = true;
            } else {
                htmlEl.style.outline = 'none';
            }
        });
    });

    typingInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const inputValue = typingInput.value.trim();
            
            // 查找前缀匹配的代码片段（至少6个字符，且必须唯一匹配）
            if (inputValue.length < 6) return; // 至少6个字符
            
            const allSnippets = Array.from(document.querySelectorAll('.code-line'));
            const matchedSnippets = allSnippets.filter(el => {
                const htmlEl = el as HTMLElement;
                const text = htmlEl.dataset.text;
                return text && text.toLowerCase().startsWith(inputValue.toLowerCase());
            });

            // 必须是唯一匹配
            if (matchedSnippets.length === 1) {
                const matched = matchedSnippets[0] as HTMLElement;
                trackClick(achievementData, checkAndUnlockAchievement); // 追踪键盘匹配（也算作点击）
                // 计算得分（根据语言配置）
                const className = matched.className;
                let score = 1.0;
                for (const lang of LANG_CONFIG) {
                    if (className.includes(lang.colorClass)) {
                        score = lang.score;
                        break;
                    }
                }
                
                const rect = matched.getBoundingClientRect();
                addScore(score, rect.left + rect.width / 2, rect.top + rect.height / 2);
                matched.remove();
                typingInput.value = '';
                
                // 清除所有高亮
                document.querySelectorAll('.code-line').forEach(el => {
                    (el as HTMLElement).style.outline = 'none';
                });
            }
        }
    });
}

// --- 键盘事件与作弊检测 ---
window.addEventListener('keydown', (e) => {
    // 如果在打字输入框或排行榜输入框中，不处理作弊码
    if (e.target === typingInput || e.target === document.getElementById('player-name') || e.target === document.getElementById('terminal-input')) {
        return;
    }

    // Boss 键
    if (e.key === 'Escape' && !isGameOver) {
        trackBossKey(achievementData, checkAndUnlockAchievement); // 追踪 Boss 键按下
        
        // AWDMS: 标记Boss键使用
        updateTaskStats(awdmsTaskState, 'bossKey');
        
        isBossMode = !isBossMode;
        if (isBossMode) {
            mainUI.classList.add('hidden');
            fakeScreen.style.display = 'block';
            container.innerHTML = '';
            // 聚焦命令行输入框
            setTimeout(() => {
                const terminalInput = document.getElementById('terminal-input');
                if (terminalInput) (terminalInput as HTMLElement).focus();
            }, 100);
        } else {
            trackBossKeyRelease(achievementData, checkAndUnlockAchievement); // 追踪 Boss 键释放（计算反应时间）
            mainUI.classList.remove('hidden');
            fakeScreen.style.display = 'none';
        }
        return;
    }

    // 排行榜输入
    const inputArea = document.getElementById('input-area');
    if (e.key === 'Enter' && isGameOver && inputArea && !inputArea.classList.contains('hidden')) {
        handleSubmitScore();
        return;
    }

    // --- 作弊码检测 ---
    if (e.key.length === 1) {
        trackKeyPress(achievementData, checkAndUnlockAchievement); // 追踪键盘按键
        
        // AWDMS: 追踪字符输入和burst
        const now = Date.now();
        charInputBuffer.push({ time: now, count: 1 });
        charInputBuffer = charInputBuffer.filter(entry => now - entry.time < 10000); // 保留10秒内
        const burst10s = charInputBuffer.reduce((sum, entry) => sum + entry.count, 0);
        if (burst10s > (awdmsTaskState.stats.burst10s || 0)) {
            updateTaskStats(awdmsTaskState, 'burst', burst10s);
        }
        
        checkCheats(
            e.key,
            achievementData,
            ACHIEVEMENT_STORE,
            checkAndUnlockAchievement,
            addScore,
            showFloatScore,
            isBossMode,
            isGameOver,
            (m: number) => { globalSpeedMultiplier = m; },
            () => globalSpeedMultiplier
        );
    }
});

// --- 排行榜相关 ---
function triggerGameOver(): void {
    isGameOver = true;
    soundEffects.playGameOver(); // 播放游戏结束音效
    forceResetCombo(); //重置连击
    deleteSaveData(); // 清除存档
    onGameEnd(seconds, missedCount, achievementData, checkAndUnlockAchievement); // 调用成就系统钩子
    
    // 提交分数到后端
    submitScoreToBackend();
    
    gameOverScreen.style.display = 'block';
    const currentResultDiv = document.getElementById('current-result')!;
    
    // 显示模式标识
    const modeName = getModeName();
    const modeTag = isRankedMode() ? '' : `<div style="color: #4ec9b0; font-size: 11px; margin-bottom: 5px;">[ ${modeName}模式 - 不计分 ]</div>`;
    
    currentResultDiv.innerHTML = `
        ${modeTag}
        <div>Processed: <span style="color:#fff">${currentScore.toFixed(1)}</span> objects</div>
        <div style="font-size:0.9em;color:#888">Runtime: ${timerElement.innerText}</div>
        ${getComboCount() > 0 ? `<div style="font-size:0.9em;color:#dcdcaa">Max Combo: x${getComboCount()}</div>` : ''}
    `;
    
    // 只有计分模式才显示排行榜
    if (isRankedMode()) {
        checkHighScores(currentScore);
    } else {
        // 非计分模式直接显示排行榜但不提交
        const scores = SECURE_STORE.load();
        (window as any).renderLeaderboard(scores);
    }
}

// 提交分数的包装函数
function handleSubmitScore(): void {
    submitScore(currentScore, achievementData, checkAndUnlockAchievement);
}

// 绑定到全局window供HTML调用
(window as any).submitScore = handleSubmitScore;
(window as any).exportScores = exportScores;

// --- 自定义代码库管理已移至 uiHandlers.ts ---
// --- 终端功能已移至 terminal.ts ---
// --- 成就系统已移至 achievementTracker.ts ---

// 运行时统计更新（每秒）
setInterval(() => {
    if (!isBossMode && !isGameOver) {
        achievementData.stats.totalRuntime++;
        
        // AWDMS: 更新uptime统计
        updateTaskStats(awdmsTaskState, 'uptime');
        
        checkAndUnlockAchievement('heartbeat', achievementData, undefined, true);
        checkAndUnlockAchievement('high_availability', achievementData, undefined, true);
        checkAndUnlockAchievement('five_nines', achievementData, undefined, true);
        
        checkFridayAfternoon(achievementData, checkAndUnlockAchievement);
    }
}, 1000);

// --- 初始化 ---
initComboDisplay();
initAchievements(achievementData);
initPracticeModeUI();
initChallengeModeUI(); // 初始化挑战模式UI
loadChallengeMode(); // 加载挑战模式设置
initSettingsPanel(achievementData, checkAndUnlockAchievement);
initTerminalInput();

// --- 初始化 AWDMS 系统 ---
initAWDMSUI(awdmsTaskState, awdmsItemState, awdmsGachaState);
setupTaskClaimHandler(awdmsTaskState, awdmsGachaState);
setupItemToggleHandler(awdmsItemState);
setupCompileHandler(awdmsGachaState, awdmsTaskState, awdmsItemState);
setupPurchaseHandler(awdmsTaskState);
createCommitsIndicator(awdmsTaskState);

// 启动道具效果
applyAutoPrettier(awdmsItemState, addScore);
applyDeepSeekAI(awdmsItemState, addScore, () => createAISnippet(container));

// --- 初始化主题系统 ---
const themeState = initThemeSystem();
const currentTheme = getCurrentTheme(themeState);
applyTheme(currentTheme);
initThemeUI(themeState);

// 音效控制 UI 初始化
const soundToggleBtn = document.getElementById('sound-toggle')!;
const soundStatusSpan = document.getElementById('sound-status')!;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;

// 更新UI状态
function updateSoundUI(): void {
    soundStatusSpan.innerText = soundSettings.enabled ? 'ON' : 'OFF';
    soundToggleBtn.style.color = soundSettings.enabled ? '#4ec9b0' : '#888';
    volumeSlider.value = String(soundSettings.volume * 100);
}

// 静音按钮
soundToggleBtn.addEventListener('click', async () => {
    soundSettings.enabled = !soundSettings.enabled;
    soundEffects.toggle();
    SOUND_SETTINGS_STORE.save(soundSettings);
    updateSoundUI();
    
    // 同步到后端
    try {
        await apiClient.updateSettings({ sound_enabled: soundSettings.enabled, sound_volume: soundSettings.volume });
    } catch (error) {
        console.error('Failed to sync sound settings:', error);
    }
});

// 音量滑块
volumeSlider.addEventListener('input', async (e) => {
    const volume = parseFloat((e.target as HTMLInputElement).value) / 100;
    soundSettings.volume = volume;
    soundEffects.setVolume(volume);
    SOUND_SETTINGS_STORE.save(soundSettings);
    
    // 同步到后端
    try {
        await apiClient.updateSettings({ sound_enabled: soundSettings.enabled, sound_volume: soundSettings.volume });
    } catch (error) {
        console.error('Failed to sync sound settings:', error);
    }
});

// 初始化UI状态
updateSoundUI();

// 练习模式下禁用难度增长
if (isInPracticeMode()) {
    globalSpeedMultiplier = 1.0; // 固定难度
}

// 添加进度保存功能（每30秒自动保存）
setInterval(() => {
    if (!isBossMode && !isGameOver && !isInPracticeMode()) {
        saveGameProgress({
            currentScore,
            missedCount,
            seconds,
            interactionMode,
            isPracticeMode: isInPracticeMode(),
            comboCount: getComboCount()
        });
    }
}, 30000);

// 页面关闭前保存进度
window.addEventListener('beforeunload', () => {
    if (!isGameOver && !isInPracticeMode()) {
        saveGameProgress({
            currentScore,
            missedCount,
            seconds,
            interactionMode,
            isPracticeMode: isInPracticeMode(),
            comboCount: getComboCount()
        });
    }
});

// 启动时检查是否有存档需要恢复
showRestorePrompt((progress: any) => {
    currentScore = progress.currentScore || 0;
    missedCount = progress.missedCount || 0;
    seconds = progress.seconds || 0;
    interactionMode = progress.interactionMode || 'click';
    
    scoreElement.innerText = currentScore.toFixed(1);
    modeText.innerText = interactionMode === 'click' ? 'Click' : 'Type';
    setInteractionMode(interactionMode);
    
    if (interactionMode === 'type') {
        typingInputArea.style.display = 'block';
    }
}, () => {});

// 成就系统后台检查
setInterval(() => {
    if (!isBossMode && !isGameOver) {
        checkAchievements(achievementData);
    }
}, 500);

} // initGame 函数结束
