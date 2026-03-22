import './js/weapp-adapter.js';

// WeChat specific window info
const windowInfo = wx.getWindowInfo();
const menuButtonInfo = wx.getMenuButtonBoundingClientRect(); // The Capsule position
const pixelRatio = windowInfo.pixelRatio;

// Setup main canvas
const canvas = window.canvas || wx.createCanvas();
const ctx = canvas.getContext('2d');
canvas.width = windowInfo.windowWidth * pixelRatio;
canvas.height = windowInfo.windowHeight * pixelRatio;
ctx.scale(pixelRatio, pixelRatio);

// UI Safespace calculations
const safeTop = menuButtonInfo.bottom + 10;
const safeBottom = windowInfo.windowHeight - windowInfo.safeArea.bottom; // iPhone X bottom bar

// Colors
const COLORS = [
    '#FF6B6B', // 0: Pastel Red
    '#4ECDC4', // 1: Pastel Teal/Blue
    '#FFE66D', // 2: Pastel Yellow
    '#FF9F43', // 3: Pastel Orange
    '#9B59B6', // 4: Pastel Purple
    '#2ECC71'  // 5: Pastel Green
];

// Layout Constants
const GRID_SIZE = 3;
const BOARD_PADDING = 20;
let MAX_BOARD_SIZE = windowInfo.windowWidth - (BOARD_PADDING * 2);
let SLOT_SIZE = MAX_BOARD_SIZE / GRID_SIZE;
let RING_OUTER_RADIUS = SLOT_SIZE * 0.4;
let RING_INNER_RADIUS = SLOT_SIZE * 0.25;
let RING_THICKNESS = RING_OUTER_RADIUS - RING_INNER_RADIUS;

// Center the board
let boardStartX = BOARD_PADDING;
let boardStartY = windowInfo.windowHeight * 0.4 - MAX_BOARD_SIZE * 0.5;

// Global State
const state = {
    started: false,
    gameOver: false,
    screen: 'START', // 'START', 'GAME', 'GAMEOVER', 'LEADERBOARD'
    score: 0,
    highScore: wx.getStorageSync('circly_highscore') || 0,
    round: 1,
    grid: [],
    hands: [null, null, null],
    layout: {},
    drag: { active: false, handIndex: -1, startPos: {x:0, y:0}, currentPos: {x:0, y:0} },
    particles: [],
    floatingTexts: [],
    animations: [],
    settingsOpen: false,
    confirmModal: false,
    settings: { music: true, sounds: true, haptics: true }
};

// Sizing maps
const RING_SIZES = [0.3, 0.52, 0.74];
const LINE_WIDTHS = [6, 12, 6];
const PARTICLE_COUNT = 15;

// Audio & Haptics Maps
const sound = {
    play: (src) => {
        if (!state.settings.sounds) return;
        const a = wx.createInnerAudioContext();
        a.src = 'audio/' + src + '.mp3';
        a.play();
        setTimeout(() => a.destroy(), 2000);
    },
    playPickup: () => sound.play('bullet'), // Remapped to existing file
    playPlace: () => sound.play('bullet'),  // Remapped to existing file
    playClear: () => sound.play('boom'),    // Remapped to existing file
    playCombo: () => sound.play('boom'),    // Remapped to existing file
    playTone: () => {},                     // Prevent missing function crashes
    playGameOver: () => sound.play('boom')  // Remapped to existing file
};
const haptics = {
    impact: () => { if (state.settings.haptics) wx.vibrateShort({type: 'light'}); },
    notification: () => { if (state.settings.haptics) wx.vibrateShort({type: 'medium'}); }
};

// Initialize Layout Matrix
resize();

function resize() {
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;
    state.layout.renderRect = { x: 0, y: 0, w: cw, h: ch };
    
    state.layout.topBarY = safeTop + 10;
    state.layout.scoreY = state.layout.topBarY + 54;
    
    // Bottom offset from safe boundary
    const bottomSafeArea = windowInfo.safeArea ? (ch - windowInfo.safeArea.bottom) : 0;
    state.layout.handOriginY = ch - bottomSafeArea - 60; // Deck is 60px above bottom lip
    
    const availableGridSpace = state.layout.handOriginY - (state.layout.scoreY + 75);
    const maxGridWidth = cw * 0.9;
    const gridAreaSize = Math.min(maxGridWidth, availableGridSpace);
    
    state.layout.cellSize = gridAreaSize / GRID_SIZE;
    state.layout.gridOrigin = {
        x: (cw - gridAreaSize) / 2,
        y: state.layout.scoreY + 75 + (availableGridSpace - gridAreaSize) / 2
    };
    state.layout.handSpacing = cw / 3;
    state.layout.handOrigin = {
        x: state.layout.handSpacing / 2,
        y: state.layout.handOriginY
    };

    if (state.grid.length === 0) {
        state.grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null).map(() => [null, null, null]));
    }
}


// --- Rendering Loop ---
function draw() {
    activeButtons.length = 0; // Clear IMGUI state

    // Clear screen with true original container background
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, windowInfo.windowWidth, windowInfo.windowHeight);

    if (state.screen === 'START') {
        drawStartScreen();
    } else if (state.screen === 'GAME') {
        drawGameScreen();
    } else if (state.screen === 'GAMEOVER') {
        drawGameOverScreen();
    } else if (state.screen === 'LEADERBOARD') {
        drawLeaderboardScreen();
    }

    if (state.confirmModal) {
        drawConfirmModal();
    } else if (state.settingsOpen) {
        drawSettingsModal();
    }

    if (state.drag.active && !state.settingsOpen && !state.confirmModal && state.screen === 'GAME') {
        const piece = state.hands[state.drag.handIndex];
        if (piece) {
            const x = state.drag.currentPos.x;
            const y = state.drag.currentPos.y;
            const visualY = y - (state.layout.cellSize * 1.2);
            drawPiece(x, visualY, piece, state.layout.cellSize * 1.0, 1.0);
        }
    }

    requestAnimationFrame(draw);
}

// --- Screens & UI ---
function drawStartScreen() {
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;

    // Dark body background for letterboxing effect
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, cw, ch);

    // Title
    ctx.fillStyle = '#FFD700';
    ctx.font = '900 56px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#cf9d00';
    ctx.shadowOffsetY = 5;
    ctx.shadowBlur = 0;
    ctx.fillText('无尽彩环', cw / 2, ch * 0.25);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowOffsetY = 10;
    ctx.shadowBlur = 15;
    ctx.fillText('无尽彩环', cw / 2, ch * 0.25);
    ctx.shadowColor = 'transparent'; // Reset shadow
    
    // Play Button (Vibrant Green)
    const playBtn = new CanvasButton(cw/2 - 120, ch * 0.45, 240, 60, 'PLAY', '#00e676', '#ffffff', () => {
        state.screen = 'GAME';
        state.started = true;
        state.gameOver = false;
        
        // Resume check: only generate a new hand if hands are empty and grid is completely clear.
        let isEmpty = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (state.grid[r][c].some(ring => ring !== null)) isEmpty = false;
            }
        }
        if (isEmpty && state.hands.every(h => h === null)) {
            state.score = 0;
            state.round = 0;
            fillHand();
        }
    }, 30);
    
    // Draw button shadow
    ctx.fillStyle = '#00b35c';
    roundRect(ctx, playBtn.x, playBtn.y + 8, playBtn.w, playBtn.h, playBtn.radius, true, false);
    playBtn.draw(ctx);

    const lbBtn = new CanvasButton(cw/2 - 100, ch * 0.45 + 100, 200, 56, 'RANKING', '#3498db', '#ffffff', () => {
        state.screen = 'LEADERBOARD';
        fetchLeaderboard();
    }, 28);
    // Button shadow
    ctx.fillStyle = '#2980b9';
    roundRect(ctx, lbBtn.x, lbBtn.y + 6, lbBtn.w, lbBtn.h, lbBtn.radius, true, false);
    lbBtn.draw(ctx);
}

function drawGameScreen() {
    const cw = windowInfo.windowWidth;

    // Draw Score and Best Score boxes
    const boxW = 100;
    const boxH = 65;
    
    // SCORE Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, cw/2 - 105, state.layout.scoreY, boxW, boxH, 10, true, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7;
    ctx.fillText('SCORE', cw/2 - 105 + boxW/2, state.layout.scoreY + 20);
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(Math.floor(state.score), cw/2 - 105 + boxW/2, state.layout.scoreY + 45);

    // BEST Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, cw/2 + 5, state.layout.scoreY, boxW, boxH, 10, true, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7;
    ctx.fillText('BEST', cw/2 + 5 + boxW/2, state.layout.scoreY + 20);
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(Math.floor(state.highScore), cw/2 + 5 + boxW/2, state.layout.scoreY + 45);

    // Settings Button (⚙)
    const settingsBtn = new CanvasButton(cw - 56, state.layout.topBarY, 40, 40, '⚙️', 'rgba(255,255,255,0.1)', '#ffffff', () => {
        state.settingsOpen = true;
    }, 20);
    settingsBtn.draw(ctx);

    // Back / Home Button
    const backBtn = new CanvasButton(16, state.layout.topBarY, 82, 40, '❮ HOME', 'rgba(255,255,255,0.1)', '#ffffff', () => {
        state.screen = 'START';
        state.started = false;
    }, 20);
    ctx.font = '14px sans-serif'; 
    backBtn.draw(ctx);

    // Draw core game elements
    drawGrid();
    drawHandArea();
    drawParticles();
    drawFloatingTexts();
    drawVFX();
}

function drawGameOverScreen() {
    // Game Over Overlay
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;

    ctx.fillStyle = 'rgba(44, 62, 80, 0.95)';
    ctx.fillRect(0, 0, cw, ch);
    
    ctx.fillStyle = '#1abc9c';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', cw / 2, ch * 0.35);

    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.fillText('Score: ' + Math.floor(state.score), cw / 2, ch * 0.45);

    const retryBtn = new CanvasButton(cw/2 - 120, ch * 0.55, 240, 56, 'PLAY AGAIN', '#1abc9c', '#000000', () => {
        state.screen = 'GAME';
        state.started = true;
        state.gameOver = false;
        state.score = 0;
        state.round = 0;
        state.grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null).map(() => [null, null, null]));
        fillHand();
    }, 28);
    retryBtn.draw(ctx);

    const homeBtn = new CanvasButton(cw/2 - 120, ch * 0.55 + 80, 240, 56, 'MAIN MENU', '#95a5a6', '#ffffff', () => {
        // Clear saved state so next Play is fresh
        wx.removeStorageSync('circly_saved_grid');
        wx.removeStorageSync('circly_saved_hands');
        wx.removeStorageSync('circly_saved_score');
        wx.removeStorageSync('circly_saved_round');
        state.score = 0;
        state.round = 0;
        state.grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null).map(() => [null, null, null]));
        state.hands = [null, null, null];
        
        state.screen = 'START';
        state.started = false;
        state.gameOver = false;
    }, 28);
    homeBtn.draw(ctx);
}

function drawSettingsModal() {
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;

    ctx.fillStyle = 'rgba(44, 62, 80, 0.95)';
    ctx.fillRect(0, 0, cw, ch);

    const mw = cw * 0.85;
    const mh = 420;
    const mx = (cw - mw) / 2;
    const my = ch / 2 - mh / 2;

    ctx.fillStyle = '#34495e';
    roundRect(ctx, mx, my, mw, mh, 20, true, false);

    ctx.fillStyle = '#1abc9c';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SETTINGS', cw / 2, my + 50);

    // Toggles
    const s = state.settings;
    const drawToggle = (y, label, val, onClick) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, mx + 30, y + 25);
        
        const color = val ? '#1abc9c' : '#bdc3c7';
        const text = val ? 'ON' : 'OFF';
        const btn = new CanvasButton(mx + mw - 90, y, 60, 34, text, color, val ? '#000' : '#fff', onClick, 17);
        btn.draw(ctx);
    };

    drawToggle(my + 100, 'Music', s.music, () => { s.music = !s.music; });
    drawToggle(my + 160, 'Sounds', s.sounds, () => { s.sounds = !s.sounds; });
    drawToggle(my + 220, 'Vibration', s.haptics, () => { s.haptics = !s.haptics; });

    const restartBtn = new CanvasButton(mx + 30, my + 290, mw - 60, 44, 'RESTART GAME', '#e74c3c', '#ffffff', () => {
        state.confirmModal = true;
    }, 22);
    restartBtn.draw(ctx);

    // draw divider line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx + 30, my + 350);
    ctx.lineTo(mx + mw - 30, my + 350);
    ctx.stroke();

    const closeBtn = new CanvasButton(mx + 30, my + 365, mw - 60, 44, 'CLOSE', '#1abc9c', '#000000', () => {
        state.settingsOpen = false;
    }, 22);
    closeBtn.draw(ctx);
}

function drawConfirmModal() {
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;

    ctx.fillStyle = 'rgba(44, 62, 80, 0.95)';
    ctx.fillRect(0, 0, cw, ch);

    const mw = Math.min(320, cw * 0.85);
    const mh = 200;
    const mx = (cw - mw) / 2;
    const my = ch / 2 - mh / 2;

    ctx.fillStyle = '#34495e';
    roundRect(ctx, mx, my, mw, mh, 20, true, false);

    ctx.fillStyle = '#1abc9c';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RESTART', cw / 2, my + 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText('Abandon current game?', cw / 2, my + 95);

    const cancelBtn = new CanvasButton(mx + 20, my + 130, mw/2 - 30, 44, 'CANCEL', '#1abc9c', '#000000', () => {
        state.confirmModal = false;
    }, 22);
    cancelBtn.draw(ctx);

    const okBtn = new CanvasButton(mx + mw/2 + 10, my + 130, mw/2 - 30, 44, 'OK', '#e74c3c', '#ffffff', () => {
        state.score = 0;
        state.round = 0;
        state.grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null).map(() => [null, null, null]));
        state.confirmModal = false;
        state.settingsOpen = false;
        state.started = false;
        state.screen = 'START';
    }, 22);
    okBtn.draw(ctx);
}

// --- Leaderboard Integration ---
let leaderboardData = null;
let myLeaderboardData = null;
let leaderboardLoading = false;

function fetchLeaderboard() {
    leaderboardLoading = true;
    wx.cloud.init();
    wx.cloud.callFunction({
        name: 'getLeaderboard',
        success: res => {
            if (res.result && res.result.data) {
                leaderboardData = res.result.data;
                myLeaderboardData = res.result.myData || null;
            } else {
                leaderboardData = [];
            }
        },
        fail: err => {
            console.error('Leaderboard Fetch Error', err);
            leaderboardData = [];
        },
        complete: () => {
            leaderboardLoading = false;
        }
    });
}

function uploadScoreToCloud(nickname) {
    if (state.score <= 0) return;
    wx.cloud.init();
    wx.cloud.callFunction({
        name: 'uploadScore',
        data: { score: state.score, nickname: nickname || 'Player' },
        success: res => console.log('✅ Score Uploaded to Cloud DB Context: ' + JSON.stringify(res)),
        fail: err => console.error('❌ Score Upload Failed: ' + JSON.stringify(err))
    });
}

function drawLeaderboardScreen() {
    const cw = windowInfo.windowWidth;
    const ch = windowInfo.windowHeight;

    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, cw, ch);

    // Title
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GLOBAL TOP 10', cw / 2, safeTop + 40);

    ctx.fillStyle = '#bdc3c7';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Resets Daily at Midnight (UTC+8)', cw / 2, safeTop + 65);

    if (leaderboardLoading) {
        ctx.fillStyle = '#bdc3c7';
        ctx.textAlign = 'center';
        ctx.font = '24px sans-serif';
        ctx.fillText('Loading...', cw / 2, ch / 2);
    } else if (leaderboardData) {
        if (leaderboardData.length === 0) {
            ctx.fillStyle = '#bdc3c7';
            ctx.textAlign = 'center';
            ctx.font = '24px sans-serif';
            ctx.fillText('今日暂无排名', cw / 2, ch / 2);
        } else {
            const startY = safeTop + 120;
            for (let i = 0; i < leaderboardData.length; i++) {
                const entry = leaderboardData[i];
                const y = startY + i * 44;
                
                ctx.font = 'bold 20px sans-serif';
                ctx.fillStyle = i === 0 ? '#f1c40f' : (i === 1 ? '#e67e22' : (i === 2 ? '#e74c3c' : '#ffffff'));
                ctx.textAlign = 'left';
                ctx.fillText(`#${i+1}`, 20, y);
                
                ctx.fillStyle = i === 0 ? '#f1c40f' : '#3498db';
                ctx.beginPath();
                ctx.arc(80, y - 6, 14, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText((entry.nickname || 'P').charAt(0).toUpperCase(), 80, y - 1);
                
                ctx.textAlign = 'left';
                ctx.font = '20px sans-serif';
                ctx.fillText(entry.nickname || 'Player', 110, y);
                
                ctx.textAlign = 'right';
                ctx.fillStyle = '#2ecc71';
                ctx.fillText(entry.score, cw - 20, y);
            }
        }

        if (myLeaderboardData) {
            const myBoxY = ch - 180;
            ctx.fillStyle = '#34495e';
            roundRect(ctx, 10, myBoxY, cw - 20, 64, 12, true, false);
            
            const rTxt = myLeaderboardData.rank > 0 ? myLeaderboardData.rank : '-';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillStyle = '#f1c40f';
            ctx.textAlign = 'left';
            ctx.fillText(rTxt, 30, myBoxY + 38);
            
            ctx.fillStyle = '#1abc9c';
            ctx.beginPath();
            ctx.arc(84, myBoxY + 32, 16, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((myLeaderboardData.nickname || 'P').charAt(0).toUpperCase(), 84, myBoxY + 38);

            ctx.textAlign = 'left';
            ctx.font = '20px sans-serif';
            ctx.fillText(myLeaderboardData.nickname || 'Player', 116, myBoxY + 38);
            
            ctx.textAlign = 'right';
            ctx.fillStyle = '#2ecc71';
            ctx.fillText(myLeaderboardData.score, cw - 30, myBoxY + 38);
        }
    } else {
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'center';
        ctx.font = '24px sans-serif';
        ctx.fillText('Failed to load', cw / 2, ch / 2);
    }

    const closeBtn = new CanvasButton(cw/2 - 80, ch - 80, 160, 50, 'BACK', '#e74c3c', '#ffffff', () => {
        state.screen = 'START';
    }, 25);
    closeBtn.draw(ctx);
}

// --- Utilities ---
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'undefined') {
        radius = 5;
    }
    if (typeof radius === 'number') {
        radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
        var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
        for (var side in defaultRadius) {
            radius[side] = radius[side] || defaultRadius[side];
        }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}

// --- WeChat Touch Events ---
wx.onTouchStart(handleStart);
wx.onTouchMove(handleMove);
wx.onTouchEnd(handleEnd);
wx.onTouchCancel(handleEnd);

const activeButtons = []; // IMGUI active zones

class CanvasButton {
    constructor(x, y, w, h, text, color, textColor, onClick, radius = 25) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.text = text; this.color = color; this.textColor = textColor;
        this.onClick = onClick; this.radius = radius;
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        roundRect(ctx, this.x, this.y, this.w, this.h, this.radius, true, false);
        if (this.text) {
            ctx.fillStyle = this.textColor;
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, this.x + this.w/2, this.y + this.h/2);
        }
        activeButtons.push(this); // Register for this frame
    }
    contains(px, py) {
        return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
    }
}

function getCanvasPos(e) {
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: 0, y: 0 };
}

function handleStart(e) {
    const pos = getCanvasPos(e);
    
    // GUI Intercept logic
    for (let i = activeButtons.length - 1; i >= 0; i--) {
        if (activeButtons[i].contains(pos.x, pos.y)) {
            haptics.impact();
            activeButtons[i].onClick();
            return;
        }
    }

    if (!state.started || state.gameOver || state.settingsOpen || state.confirmModal) return;
    
    const r = state.layout.cellSize / 2;

    for (let i = 0; i < state.hands.length; i++) {
        if (!state.hands[i]) continue;
        const handX = state.layout.handOrigin.x + (i * state.layout.handSpacing);
        const handY = state.layout.handOrigin.y;
        const dx = pos.x - handX;
        const dy = pos.y - handY;

        if (dx * dx + dy * dy < r * r * 2.5) {
            state.drag.active = true;
            state.drag.handIndex = i;
            state.drag.startPos = pos;
            state.drag.currentPos = pos;
            sound.playPickup();
            break;
        }
    }
}

function handleMove(e) {
    if (!state.drag.active) return;
    state.drag.currentPos = getCanvasPos(e);
}

function handleEnd(e) {
    if (!state.drag.active) return;

    const visualY = state.drag.currentPos.y - (state.layout.cellSize * 1.2);
    const gridX = Math.floor((state.drag.currentPos.x - state.layout.gridOrigin.x) / state.layout.cellSize);
    const gridY = Math.floor((visualY - state.layout.gridOrigin.y) / state.layout.cellSize);

    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        const piece = state.hands[state.drag.handIndex];
        if (canPlace(gridX, gridY, piece)) {
            placeRing(gridX, gridY, piece);
            state.hands[state.drag.handIndex] = null;
            sound.playPlace();
            processTurn();
        }
    }

    state.drag.active = false;
    state.drag.handIndex = -1;
}

// --- Game Logic ---
function fillHand() {
    state.round++;
    state.hands = [];
    while (state.hands.length < 3) {
        state.hands.push(generatePiece());
    }
    wx.setStorageSync('circly_saved_grid', JSON.stringify(state.grid));
    wx.setStorageSync('circly_saved_hands', JSON.stringify(state.hands));
    wx.setStorageSync('circly_saved_score', state.score);
    wx.setStorageSync('circly_saved_round', state.round);
}

function generatePiece() {
    const piece = [null, null, null];
    let hasRing = false;
    const baseProb = 0.4;
    const availableColorCount = state.score >= 10000 ? 5 : 4;
    const consistentColor = Math.random() < 0.15;
    const baseColor = Math.floor(Math.random() * availableColorCount);

    while (!hasRing) {
        for (let i = 0; i < 3; i++) {
            if (Math.random() < baseProb) {
                piece[i] = { size: i, color: consistentColor ? baseColor : Math.floor(Math.random() * availableColorCount) };
                hasRing = true;
            }
        }
    }
    if (state.score === 0 && state.round <= 2) {
        for (let i = 0; i < 3; i++) {
            if (piece[i] !== null) piece[i].color = 0;
        }
    }
    return piece;
}

function canPlace(gx, gy, piece) {
    if (!piece) return false;
    const cell = state.grid[gy][gx];
    for (let i = 0; i < 3; i++) {
        if (piece[i] !== null && cell[i] !== null) return false;
    }
    return true;
}

function placeRing(gx, gy, piece) {
    const cell = state.grid[gy][gx];
    for (let i = 0; i < 3; i++) {
        if (piece[i] !== null) cell[i] = piece[i];
    }
    addScore(10);
    haptics.impact();
}

function processTurn() {
    const matchData = findMatchesInGrid(state.grid);
    if (matchData.removals.length > 0) {
        clearMatches(matchData.removals, matchData.reasons);
        sound.playTone();
    }
    if (state.hands.every(h => h === null)) fillHand();
    if (checkGameOverCondition()) {
        state.gameOver = true;
        state.screen = 'GAMEOVER';
        sound.playGameOver();

        const savedNickname = wx.getStorageSync('circly_nickname');
        if (!savedNickname) {
            wx.showModal({
                title: '上榜啦！输入英雄代号',
                content: '',
                editable: true,
                placeholderText: '例如：正义的断幺九',
                success: (res) => {
                    let name = 'Player_' + Math.floor(Math.random() * 9999);
                    if (res.confirm && res.content && res.content.trim() !== '') {
                        name = res.content.substring(0, 10);
                    }
                    wx.setStorageSync('circly_nickname', name);
                    uploadScoreToCloud(name);
                }
            });
        } else {
            uploadScoreToCloud(savedNickname);
        }
    }
}

function clearMatches(matches, reasons = []) {
    if (matches.length === 0) return;

    reasons.forEach(reason => {
        state.animations.push({ ...reason, progress: 1.5 });
    });

    let comboMultiplier = 1;
    if (matches.length > 3) comboMultiplier = 2;
    if (matches.length >= 6) comboMultiplier = 3;
    if (matches.length >= 9) comboMultiplier = 4;

    const points = matches.length * 100 * comboMultiplier;
    addScore(points);
    sound.playClear(matches.length);

    let sumX = 0, sumY = 0;
    matches.forEach(m => {
        sumX += state.layout.gridOrigin.x + (m.c + 0.5) * state.layout.cellSize;
        sumY += state.layout.gridOrigin.y + (m.r + 0.5) * state.layout.cellSize;
        
        spawnParticles(
            state.layout.gridOrigin.x + (m.c + 0.5) * state.layout.cellSize,
            state.layout.gridOrigin.y + (m.r + 0.5) * state.layout.cellSize,
            COLORS[m.color]
        );
        state.animations.push({ type: 'clear', r: m.r, c: m.c, s: m.s, color: m.color, delayFrames: 24, progress: 1.0 });
        state.grid[m.r][m.c][m.s] = null;
    });

    state.floatingTexts.push({ text: '+' + points, x: sumX / matches.length, y: sumY / matches.length, life: 1.0, color: '#F1C40F' });
}

function checkGameOverCondition() {
    let emptyHand = true;
    for (let i = 0; i < state.hands.length; i++) {
        if (state.hands[i]) {
            emptyHand = false;
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (canPlace(c, r, state.hands[i])) return false;
                }
            }
        }
    }
    return !emptyHand;
}

function addScore(p) {
    state.score += p;
    if (state.score > state.highScore) {
        state.highScore = state.score;
        wx.setStorageSync('circly_highscore', state.highScore);
    }
}

function findMatchesInGrid(gridToCheck) {
    const toRemove = [];
    const reasons = [];
    const addRemoval = (r, c, s, color) => {
        if (!toRemove.some(item => item.r === r && item.c === c && item.s === s)) {
            toRemove.push({ r, c, s, color });
        }
    };

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = gridToCheck[r][c];
            if (cell[0] && cell[1] && cell[2] && cell[0].color === cell[1].color && cell[1].color === cell[2].color) {
                const targetColor = cell[0].color;
                reasons.push({ type: 'stack', r: r, c: c, color: targetColor });
                for (let sweepR = 0; sweepR < GRID_SIZE; sweepR++) {
                    for (let sweepC = 0; sweepC < GRID_SIZE; sweepC++) {
                        const sweepCell = gridToCheck[sweepR][sweepC];
                        for (let s = 0; s < 3; s++) {
                            if (sweepCell[s] && sweepCell[s].color === targetColor) addRemoval(sweepR, sweepC, s, targetColor);
                        }
                    }
                }
            }
        }
    }

    const lines = [];
    for (let r = 0; r < GRID_SIZE; r++) lines.push([{ r, c: 0 }, { r, c: 1 }, { r, c: 2 }]);
    for (let c = 0; c < GRID_SIZE; c++) lines.push([{ r: 0, c }, { r: 1, c }, { r: 2, c }]);
    lines.push([{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }]);
    lines.push([{ r: 0, c: 2 }, { r: 1, c: 1 }, { r: 2, c: 0 }]);

    for (let colorIdx = 0; colorIdx < COLORS.length; colorIdx++) {
        for (const line of lines) {
            let count = 0;
            for (const pos of line) {
                const cell = gridToCheck[pos.r][pos.c];
                if (cell.some(ring => ring && ring.color === colorIdx)) count++;
            }
            if (count === GRID_SIZE) {
                reasons.push({ type: 'line', startR: line[0].r, startC: line[0].c, endR: line[2].r, endC: line[2].c, color: colorIdx });
                for (const pos of line) {
                    const cell = gridToCheck[pos.r][pos.c];
                    for (let s = 0; s < 3; s++) {
                        if (cell[s] && cell[s].color === colorIdx) addRemoval(pos.r, pos.c, s, colorIdx);
                    }
                }
            }
        }
    }
    return { removals: toRemove, reasons: reasons };
}

// --- Rendering Sub-components ---
function drawGrid() {
    const { cellSize, gridOrigin } = state.layout;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#34495e';

    let previewMatches = [];
    if (state.drag.active) {
        const visualY = state.drag.currentPos.y - (state.layout.cellSize * 1.2);
        const gx = Math.floor((state.drag.currentPos.x - gridOrigin.x) / cellSize);
        const gy = Math.floor((visualY - gridOrigin.y) / cellSize);
        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
            const piece = state.hands[state.drag.handIndex];
            if (canPlace(gx, gy, piece)) {
                const simGrid = JSON.parse(JSON.stringify(state.grid));
                for (let i = 0; i < 3; i++) { if (piece[i] !== null) simGrid[gy][gx][i] = piece[i]; }
                previewMatches = findMatchesInGrid(simGrid).removals;
            }
        }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const x = gridOrigin.x + c * cellSize;
            const y = gridOrigin.y + r * cellSize;

            ctx.fillStyle = '#34495e';
            ctx.fillRect(x + 4, y + 4, cellSize - 8, cellSize - 8);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#2c3e50';
            ctx.strokeRect(x, y, cellSize, cellSize);

            if (previewMatches.some(m => m.r === r && m.c === c)) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillRect(x, y, cellSize, cellSize);
            }

            drawPiece(x + cellSize / 2, y + cellSize / 2, state.grid[r][c], cellSize, 1.0);

            for (let i = 0; i < state.animations.length; i++) {
                const anim = state.animations[i];
                if (anim.r === r && anim.c === c && anim.type === 'clear') {
                    const rawRadius = (cellSize / 2) * RING_SIZES[anim.s] * anim.progress;
                    const radius = Math.max(0, rawRadius); // Fix native crash with tiny negative floats
                    
                    if (anim.s === 0) {
                        ctx.beginPath(); ctx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
                        ctx.fillStyle = COLORS[anim.color]; ctx.globalAlpha = Math.max(0, anim.progress); ctx.fill(); ctx.globalAlpha = 1.0;
                    } else if (radius > 0) {
                        drawRing(x + cellSize / 2, y + cellSize / 2, radius, COLORS[anim.color], LINE_WIDTHS[anim.s], Math.max(0, anim.progress));
                    }
                }
            }

            if (previewMatches.length > 0 && state.grid[r][c]) {
                for (let s = 0; s < 3; s++) {
                    if (previewMatches.find(m => m.r === r && m.c === c && m.s === s)) {
                        ctx.beginPath();
                        ctx.arc(x + cellSize / 2, y + cellSize / 2, (cellSize / 2) * RING_SIZES[s], 0, Math.PI * 2);
                        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = LINE_WIDTHS[s] + 4;
                        ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1.0;
                    }
                }
            }
        }
    }
}

function drawHandArea() {
    for (let i = 0; i < state.hands.length; i++) {
        if (state.drag.active && state.drag.handIndex === i) continue;
        drawPiece(state.layout.handOrigin.x + (i * state.layout.handSpacing), state.layout.handOrigin.y, state.hands[i], state.layout.cellSize * 0.8, 1.0);
    }
}

function drawPiece(x, y, piece, size, alpha) {
    if (!piece) return;
    for (let i = 0; i < 3; i++) {
        if (piece[i]) {
            const radius = (size / 2) * RING_SIZES[i];
            const color = COLORS[piece[i].color];
            if (i === 0) {
                ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1.0;
            } else {
                drawRing(x, y, radius, color, LINE_WIDTHS[i], alpha);
            }
        }
    }
}

function drawRing(x, y, radius, color, width, alpha) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.globalAlpha = alpha; ctx.stroke(); ctx.globalAlpha = 1.0;
}

function spawnParticles(x, y, color) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 5 + 2;
        state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0, color, size: Math.random() * 3 + 1 });
    }
}

function drawParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    }
}

function drawFloatingTexts() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 36px sans-serif';
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y -= 1.5; ft.life -= 0.015;
        if (ft.life <= 0) { state.floatingTexts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.lineWidth = 4; ctx.strokeStyle = '#2c3e50'; ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y); ctx.globalAlpha = 1.0;
    }
}

function drawVFX() {
    for (let i = state.animations.length - 1; i >= 0; i--) {
        const anim = state.animations[i];
        if (anim.delayFrames > 0) { anim.delayFrames--; continue; }
        anim.progress -= 0.05;
        if (anim.progress <= 0 && anim.type !== 'clear') { state.animations.splice(i, 1); continue; }
        
        if (anim.type === 'line' && anim.progress > 0) {
            const x1 = state.layout.gridOrigin.x + (anim.startC + 0.5) * state.layout.cellSize;
            const y1 = state.layout.gridOrigin.y + (anim.startR + 0.5) * state.layout.cellSize;
            const x2 = state.layout.gridOrigin.x + (anim.endC + 0.5) * state.layout.cellSize;
            const y2 = state.layout.gridOrigin.y + (anim.endR + 0.5) * state.layout.cellSize;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = COLORS[anim.color]; ctx.lineWidth = 14 * Math.min(1.0, anim.progress);
            ctx.lineCap = 'round'; ctx.globalAlpha = Math.min(1.0, anim.progress); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4 * Math.min(1.0, anim.progress); ctx.stroke(); ctx.globalAlpha = 1.0;
        } else if (anim.type === 'stack' && anim.progress > 0) {
            const x = state.layout.gridOrigin.x + (anim.c + 0.5) * state.layout.cellSize;
            const y = state.layout.gridOrigin.y + (anim.r + 0.5) * state.layout.cellSize;
            ctx.beginPath(); ctx.arc(x, y, state.layout.cellSize * 0.8 * (1.5 - anim.progress), 0, Math.PI * 2);
            ctx.strokeStyle = COLORS[anim.color]; ctx.lineWidth = 8 * anim.progress;
            ctx.globalAlpha = anim.progress; ctx.stroke(); ctx.globalAlpha = 1.0;
        }
    }
}

// Start Main Loop
requestAnimationFrame(draw);
