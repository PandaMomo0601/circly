/**
 * Color Rings Game
 * A pure HTML5 + JS implementation
 */

// --- Constants ---
const GRID_SIZE = 3;
const COLORS = [
    '#FF6B6B', // Pastel Red
    '#4ECDC4', // Pastel Teal/Blue
    '#FFE66D', // Pastel Yellow
    '#FF9F43', // Pastel Orange
    '#9B59B6', // Pastel Purple (5th color)
    '#2ECC71'  // Pastel Green (6th color)
];
const RING_SIZES = [0.3, 0.52, 0.74]; // Reduced large size slightly to avoid "box border" look
const LINE_WIDTHS = [6, 12, 6]; // Inner solid (drawn via fill), Middle thick, Outer thin

// Game Configuration
const ANIMATION_SPEED = 0.2; // 0-1 lerp factor
const PARTICLE_COUNT = 20;

// --- Sound Manager ---
const sound = {
    ctx: null,
    bgmSource: null,
    bgmMuted: false,
    sfxMuted: false,
    vibEnabled: true, // Native vibration toggle
    bgmBuffer: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.generateProceduralCanonInD(); // Placeholder for BGM generation
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playTone(freq, type, duration, vol = 0.1, attack = 0.01, release = 0.1) {
        if (this.sfxMuted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const t = this.ctx.currentTime;
        // Start gain at 0
        gain.gain.setValueAtTime(0, t);
        // Approach target volume (vol) with a time-constant of attack/3
        gain.gain.setTargetAtTime(vol, t, attack / 3);
        // Wait until duration is over, then approach 0 with time-constant of release/3
        gain.gain.setTargetAtTime(0, t + duration, release / 3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + duration + release + 0.1); // add buffer to stop
    },

    playPickup() {
        this.vibrate('light');
        if (this.sfxMuted) return;
        // Softer sine blip
        this.playTone(500, 'sine', 0.1, 0.1, 0.01, 0.1);
    },

    playPlace() {
        this.vibrate('light');
        if (this.sfxMuted) return;
        // Soft thud
        this.playTone(200, 'sine', 0.15, 0.15, 0.01, 0.2);
    },

    playError() {
        this.vibrate('warning');
        if (this.sfxMuted) return;
        // Low hum instead of harsh saw
        this.playTone(100, 'triangle', 0.3, 0.1, 0.05, 0.2);
    },

    playClear(count) {
        this.vibrate('heavy');
        if (this.sfxMuted) return;
        // Gentle major chord arpeggio
        const base = 300; // Lower base pitch
        const chord = [0, 4, 7, 12]; // Major intervals
        for (let i = 0; i < 3 + Math.min(count, 3); i++) {
            setTimeout(() => {
                const note = base * Math.pow(2, chord[i % 4] / 12);
                this.playTone(note, 'sine', 0.4, 0.1, 0.05, 0.5);
            }, i * 80);
        }
    },

    playGameOver() {
        if (this.sfxMuted || !this.ctx) return;
        this.stopBGM();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 2.0);

        const t = this.ctx.currentTime;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.setTargetAtTime(0, t, 2.0 / 3); // Smooth decay over 2 seconds

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 2.0 + 0.1);
    },

    // This function is a placeholder. In a real game, you'd generate or load actual BGM.
    generateProceduralCanonInD() {
        if (this.bgmBuffer) return; // Already generated
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise 
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Fill buffer with random noise (static)
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.bgmBuffer = buffer;
    },

    startBGM() {
        if (!this.bgmBuffer || this.bgmMuted || this.bgmSource) return;
        this.bgmSource = this.ctx.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;
        this.bgmSource.loop = true;

        // Pass noise through a lowpass filter to make it sound like muffled wind or deep static
        // rather than harsh TV white noise.
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400; // Cut off high frequencies for a softer rumble

        const gain = this.ctx.createGain();
        gain.gain.value = 0.05; // Very low volume ambient

        this.bgmSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        this.bgmSource.start();
    },

    stopBGM() {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
    },

    vibrate(type) {
        if (!this.vibEnabled) return;

        // Native Capacitor Haptics Bridge
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            let capStyle = 'LIGHT';
            if (type === 'medium' || type === 'warning') capStyle = 'MEDIUM';
            if (type === 'heavy') capStyle = 'HEAVY';

            window.Capacitor.Plugins.Haptics.impact({ style: capStyle }).catch(e => console.error(e));
        } else {
            console.log(`[Haptics]: ${type} vibration triggered`);
        }
    }
};

// --- State ---
const state = {
    started: false,
    grid: [], // 3x3 grid
    hands: [], // 3 bottom slots
    score: 0,
    bestScore: parseInt(localStorage.getItem('colorRings_best') || '0'),
    round: 1, // New Round tracking
    startTime: 0, // For difficulty scaling
    drag: {
        active: false,
        handIndex: -1,
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        offset: { x: 0, y: 0 }
    },
    particles: [],
    animations: [],
    floatingTexts: [],
    gameOver: false,
    layout: {
        cellSize: 0,
        gridOrigin: { x: 0, y: 0 },
        handOrigin: { x: 0, y: 0 },
        handSpacing: 0
    }
};

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency in background
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const gameOverModal = document.getElementById('game-over-modal');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const startScreenModal = document.getElementById('start-screen-modal');
const startBtn = document.getElementById('start-btn');
const scoreBoard = document.querySelector('.score-board');
const backBtn = document.getElementById('back-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const bgmToggleCheckbox = document.getElementById('bgm-toggle-checkbox');
const sfxToggleCheckbox = document.getElementById('sfx-toggle-checkbox');
const vibToggleCheckbox = document.getElementById('vib-toggle-checkbox');
const settingsRestartBtn = document.getElementById('settings-restart-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmOkBtn = document.getElementById('confirm-ok-btn');

// --- AdMob Native Manager ---
const adManager = {
    initialized: false,
    async init() {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
            try {
                const { AdMob } = window.Capacitor.Plugins;
                await AdMob.initialize({ initializeForTesting: true });
                this.initialized = true;
                console.log("[AdMob] Initialized");
                this.showBanner();
                this.prepareInterstitial();
            } catch (e) {
                console.error("[AdMob] Init failed", e);
                alert("AdMob Init Failed: " + JSON.stringify(e));
            }
        }
    },
    async showBanner() {
        if (!this.initialized) return;
        const { AdMob } = window.Capacitor.Plugins;
        const options = {
            adId: 'ca-app-pub-5798121521319194/4067818342', // User's Production Banner ID
            adSize: 'BANNER',
            position: 'BOTTOM_CENTER',
            margin: 0,
            isTesting: false
        };
        try {
            await AdMob.showBanner(options);
            console.log("[AdMob] Banner Displayed");
        } catch (e) {
            console.error("[AdMob] Banner failed", e);
        }
    },
    async prepareInterstitial() {
        if (!this.initialized) return;
        const { AdMob } = window.Capacitor.Plugins;
        // User's Production Interstitial ID
        const options = {
            adId: 'ca-app-pub-5798121521319194/4356281315',
            isTesting: false // Enforce test mode for safety
        };
        try {
            await AdMob.prepareInterstitial(options);
            console.log("[AdMob] Interstitial Prepared");
        } catch (e) {
            console.error("[AdMob] Prepare failed", e);
            alert("AdMob Prepare Failed: " + JSON.stringify(e));
        }
    },
    async showInterstitial() {
        if (!this.initialized) return;
        const { AdMob } = window.Capacitor.Plugins;
        try {
            await AdMob.showInterstitial();
            // Pre-load the next one immediately after showing
            this.prepareInterstitial();
        } catch (e) {
            console.error("[AdMob] Show failed", e);
            alert("AdMob Show Failed: " + JSON.stringify(e));
        }
    }
};

// --- Initialization ---
function init() {
    // Setup Grid
    state.grid = Array(GRID_SIZE).fill(null).map(() =>
        Array(GRID_SIZE).fill(null).map(() => [null, null, null])
    );

    // Setup Input
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', (e) => handleStart(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent scroll
        handleMove(e.touches[0]);
    }, { passive: false });
    canvas.addEventListener('touchend', handleEnd);

    // Setup UI
    restartBtn.addEventListener('click', () => {
        clearSavedState();
        resetGame();
    });
    startBtn.addEventListener('click', startGame);
    bestScoreEl.textContent = state.bestScore;

    backBtn.addEventListener('click', goHome);
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);

    // Checkbox uses 'change' event instead of 'click'
    bgmToggleCheckbox.addEventListener('change', toggleBGM);
    sfxToggleCheckbox.addEventListener('change', toggleSFX);
    vibToggleCheckbox.addEventListener('change', toggleVib);

    settingsRestartBtn.addEventListener('click', () => {
        closeSettings();
        confirmModal.classList.remove('hidden');
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    confirmOkBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        clearSavedState();
        resetGame();
        // Force the app back into game state if they clicked restart from home screen settings
        startScreenModal.classList.add('hidden');
        scoreBoard.classList.remove('hidden');
        backBtn.classList.remove('hidden');
        state.started = true;
    });

    // Initial Preferences Check
    const savedPrefs = localStorage.getItem('circly_prefs');
    if (savedPrefs) {
        const parsed = JSON.parse(savedPrefs);
        if (parsed.bgmMuted !== undefined) sound.bgmMuted = parsed.bgmMuted;
        if (parsed.sfxMuted !== undefined) sound.sfxMuted = parsed.sfxMuted;
        if (parsed.vibEnabled !== undefined) sound.vibEnabled = parsed.vibEnabled;
    }
    bgmToggleCheckbox.checked = !sound.bgmMuted; // Sync UI switch with state
    sfxToggleCheckbox.checked = !sound.sfxMuted;
    vibToggleCheckbox.checked = sound.vibEnabled;

    // Initial State Check
    startBtn.textContent = 'PLAY';

    // Boot AdMob Engine
    adManager.init();

    // Resize & Loop
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(loop);
}

function startGame() {
    sound.init(); // Unlock AudioContext legally via user click
    startScreenModal.classList.add('hidden');
    scoreBoard.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    state.started = true;

    if (localStorage.getItem('circly_savegame')) {
        loadGameState();
        // Ensure sounds play if we load into a round
        if (sound.ctx && !sound.bgmMuted) sound.startBGM();
    } else {
        resetGame();
    }
}

function handleGameOver() {
    state.gameOver = true;
    finalScoreEl.textContent = state.score;
    gameOverModal.classList.remove('hidden');
    clearSavedState(); // Wipe save when user fails naturally

    // Trigger AdMob Interstitial Ad (Will only fire on native, safely ignored on web)
    adManager.showInterstitial();
}
function goHome() {
    state.started = false; // Pauses logic
    startScreenModal.classList.remove('hidden');
    scoreBoard.classList.add('hidden');
    backBtn.classList.add('hidden');
    if (sound.bgmSource) {
        sound.bgmSource.stop();
        sound.bgmSource.disconnect();
        sound.bgmSource = null;
    }
}

function openSettings() {
    settingsModal.classList.remove('hidden');
    // Hide Restart button if not actively playing
    if (!state.started || state.gameOver) {
        settingsRestartBtn.classList.add('hidden');
    } else {
        settingsRestartBtn.classList.remove('hidden');
    }
}

function closeSettings() {
    settingsModal.classList.add('hidden');
}

function toggleBGM() {
    sound.bgmMuted = !bgmToggleCheckbox.checked;
    savePreferences();

    if (sound.bgmMuted) {
        if (sound.bgmSource) {
            sound.bgmSource.stop();
            sound.bgmSource.disconnect();
            sound.bgmSource = null;
        }
    } else {
        if (state.started) sound.startBGM(); // Only start playing if game is active
    }
}

function toggleSFX() {
    sound.sfxMuted = !sfxToggleCheckbox.checked;
    savePreferences();
}

function toggleVib() {
    sound.vibEnabled = vibToggleCheckbox.checked;
    savePreferences();
    if (sound.vibEnabled) sound.vibrate('medium'); // Provide immediate feedback when toggled ON
}

function savePreferences() {
    localStorage.setItem('circly_prefs', JSON.stringify({
        bgmMuted: sound.bgmMuted,
        sfxMuted: sound.sfxMuted,
        vibEnabled: sound.vibEnabled
    }));
}

function saveGameState() {
    if (!state.started || state.gameOver) return;
    const saveData = {
        grid: state.grid,
        hands: state.hands,
        score: state.score,
        round: state.round
    };
    localStorage.setItem('circly_savegame', JSON.stringify(saveData));
}

function loadGameState() {
    try {
        const saved = JSON.parse(localStorage.getItem('circly_savegame'));
        if (saved) {
            state.grid = saved.grid;
            state.hands = saved.hands;
            state.score = saved.score;
            state.round = saved.round;
            state.gameOver = false;
            state.particles = [];
            state.floatingTexts = [];
            state.animations = [];
            updateScore(0); // Refresh UI
            updateRound();
            gameOverModal.classList.add('hidden');
        }
    } catch (e) {
        console.error("Failed to load save state", e);
        resetGame();
    }
}

function clearSavedState() {
    localStorage.removeItem('circly_savegame');
    startBtn.textContent = 'PLAY';
}

function resetGame() {
    state.grid = Array(GRID_SIZE).fill(null).map(() =>
        Array(GRID_SIZE).fill(null).map(() => [null, null, null])
    );
    state.score = 0;
    state.gameOver = false;
    state.particles = [];
    state.floatingTexts = [];
    state.hands = [];

    state.difficultyStartTime = Date.now();
    state.round = 1;
    updateRound();

    if (sound.ctx) sound.startBGM();

    updateScore(0);
    fillHand();
    saveGameState();

    gameOverModal.classList.add('hidden');
}

function fillHand() {
    state.round++;
    updateRound();
    state.hands = [];
    while (state.hands.length < 3) {
        state.hands.push(generatePiece());
    }
    saveGameState();
}

function getDifficulty() {
    // Implicit time-based difficulty is temporarily disabled (returns 0) 
    // to test if score-based explicit difficulty (addColor at 10k) is sufficient.

    // const elapsed = Date.now() - state.difficultyStartTime;
    // const diff = Math.min(elapsed / 300000, 1.0);

    return 0;
}

function generatePiece() {
    const piece = [null, null, null];
    let hasRing = false;

    // Base probability to add a ring at size i
    // Fixed at 40% (original easy mode density) to keep early game pressure low
    const baseProb = 0.4;

    // Explicit Difficulty: Available colors based on score
    const availableColorCount = state.score >= 10000 ? 5 : 4;

    // Color consistency
    // Since difficulty is fixed to 0, old logic `> (difficulty * 0.8)` meant 100% chance of same color.
    // Changing this to a fixed, low chance (e.g. 15%) of being forced to the same color.
    const consistentColor = Math.random() < 0.15;
    const baseColor = Math.floor(Math.random() * availableColorCount);

    while (!hasRing) {
        for (let i = 0; i < 3; i++) {
            if (Math.random() < baseProb) {
                if (consistentColor) {
                    piece[i] = { size: i, color: baseColor };
                } else {
                    piece[i] = { size: i, color: Math.floor(Math.random() * availableColorCount) };
                }
                hasRing = true;
            }
        }
        // If we failed to generate any ring (rare but possible), retry loop
    }

    // GUARANTEED TUTORIAL MECHANIC:
    // For the very first hand (when score is 0 and round is incremented to 2), 
    // forcefully change any generated ring's color to Red.
    // This allows the player to easily learn the single-color line clear rule.
    // It does NOT force extra rings to spawn, preserving the slow-paced single-ring density of early game.
    if (state.score === 0 && state.round <= 2) {
        for (let i = 0; i < 3; i++) {
            if (piece[i] !== null) {
                piece[i].color = 0; // Force Red
            }
        }
    }

    return piece;
}

// --- Layout & Resize ---
// --- Layout & Resize ---
function resize() {
    const parent = canvas.parentElement;
    const cw = parent.clientWidth;
    const ch = parent.clientHeight;

    // Force 9:16 Aspect Ratio Logic within the container
    const windowRatio = cw / ch;
    const targetRatio = 9 / 16;

    let renderW, renderH;

    if (windowRatio > targetRatio) {
        // Container is wider than 9:16
        renderH = ch;
        renderW = renderH * targetRatio;
    } else {
        // Container is taller/narrower
        renderW = cw;
        renderH = renderW / targetRatio;
    }

    // Set canvas internal resolution to match container
    canvas.width = cw;
    canvas.height = ch;

    // Center the render area
    const offsetX = (cw - renderW) / 2;
    const offsetY = (ch - renderH) / 2;

    state.layout.renderRect = { x: offsetX, y: offsetY, w: renderW, h: renderH };

    // Calculate layout metrics relative to renderRect
    // Grid area: Top portion
    const gridAreaSize = renderW * 0.9;
    state.layout.cellSize = gridAreaSize / GRID_SIZE;

    state.layout.gridOrigin = {
        x: offsetX + (renderW - gridAreaSize) / 2,
        y: offsetY + (renderH * 0.25) // Start at 25% height
    };

    // Dynamically position the scoreBoard just above the grid
    // Max(80, ...) ensures it doesn't overlap the 60px height of the top navigation buttons (Back / Settings).
    const scoreBoardTop = Math.max(80, state.layout.gridOrigin.y - 100);
    scoreBoard.style.top = scoreBoardTop + 'px';

    // Hand area: Bottom
    state.layout.handSpacing = renderW / 3;
    state.layout.handOrigin = {
        x: offsetX + (state.layout.handSpacing / 2),
        y: offsetY + (renderH * 0.82) // Moved up slightly to accommodate AdMob Banner
    };
}

// --- Input Handling ---
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function handleStart(e) {
    if (!state.started || state.gameOver) return; // Halt input if game not started or game over
    const pos = e.clientX ? getCanvasPos(e) : { x: e.pageX, y: e.pageY };

    // Check if clicked on a hand item
    // In hand, items are centered at:
    // x: (0.5 + i) * handSpacing
    // y: handOrigin.y
    const r = state.layout.cellSize / 2; // Approximate hit radius

    for (let i = 0; i < state.hands.length; i++) {
        if (!state.hands[i]) continue;

        // Hand Layout uses renderRect offsets implicitly via handOrigin
        const handX = state.layout.handOrigin.x + (i * state.layout.handSpacing);
        const handY = state.layout.handOrigin.y;

        const dx = pos.x - handX;
        const dy = pos.y - handY;

        if (dx * dx + dy * dy < r * r * 2.5) { // Increased hit area slightly
            state.drag.active = true;
            state.drag.handIndex = i;
            state.drag.startPos = pos;
            state.drag.currentPos = pos;

            // Visual Offset: Ring should appear ABOVE finger/cursor
            // We don't change 'offset' logic for mapping, but we use it for rendering?
            // Actually, handleMove updates currentPos. 
            // We want render to be at currentPos - visualOffset.
            // But logic needs to know where the "hotspot" is.
            // Let's say hotspot is exactly under finger (currentPos).
            // Render will be shifted up.

            sound.playPickup();
            break;
        }
    }
}

function handleMove(e) {
    if (!state.drag.active) return;
    const pos = e.clientX ? getCanvasPos(e) : { x: e.pageX, y: e.pageY };
    state.drag.currentPos = pos;
}

function handleEnd() {
    if (!state.drag.active) return;

    // Try to place
    // WYSIWYG Logic: Logic must match the visual offset
    // Visual Y = currentPos.y - (cellSize * 1.2)
    const visualY = state.drag.currentPos.y - (state.layout.cellSize * 1.2);

    const gridX = Math.floor((state.drag.currentPos.x - state.layout.gridOrigin.x) / state.layout.cellSize);
    const gridY = Math.floor((visualY - state.layout.gridOrigin.y) / state.layout.cellSize);

    let success = false;

    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        // Valid grid coordinate, check if placeable
        const piece = state.hands[state.drag.handIndex];
        if (canPlace(gridX, gridY, piece)) {
            placeRing(gridX, gridY, piece);
            state.hands[state.drag.handIndex] = null; // Remove from hand
            sound.playPlace();
            success = true;

            // Check matches or game over
            processTurn();
        } else {
            // sound.playError(); // Removed penalty for invalid drop
        }
    } else {
        // sound.playError(); // Removed penalty for dropping outside grid
    }

    // Reset drag
    state.drag.active = false;
    state.drag.handIndex = -1;
}

// --- Game Logic ---
function canPlace(gx, gy, piece) {
    if (!piece) return false;
    const cell = state.grid[gy][gx];

    // Check collision: if grid cell has a ring at index i, and hand has ring at index i, collision.
    for (let i = 0; i < 3; i++) {
        if (piece[i] !== null && cell[i] !== null) {
            return false;
        }
    }
    return true;
}

function placeRing(gx, gy, piece) {
    const cell = state.grid[gy][gx];
    for (let i = 0; i < 3; i++) {
        if (piece[i] !== null) {
            cell[i] = piece[i];
        }
    }
    addScore(10);
    createPlaceEffect(gx, gy);
}

function processTurn() {
    // Check matches
    const matchData = findMatches();
    const matches = matchData.removals;
    const reasons = matchData.reasons;

    if (matches.length > 0) {
        // Execute clear
        clearMatches(matches, reasons);

        // Refill hand if empty logic usually happens after drop, 
        // but if we match, we might want to delay slightly or just do it.
        if (sound.ctx) {
            sound.playTone(400, 'sine', 0.1, 0.05); // Clean combo sound
        }
    }

    // Check if hand needs refilling after matches (in case a match cleared the board allowing a stuck piece to be placed)
    const handIsEmpty = state.hands.every(h => h === null);
    if (handIsEmpty) {
        fillHand();
    }

    // Since combinations can clear the board, check if game over
    if (checkGameOverCondition()) {
        handleGameOver();
    } else {
        saveGameState(); // Save state after resolving matches
    }
    return true;
}

// Old matches logic removed/replaced by specific implementation
/* function findMatches() { ... } */

function clearMatches(matches, reasons = []) {
    if (matches.length === 0) return;

    // Push VFX animations based on reasons
    reasons.forEach(reason => {
        state.animations.push({
            type: reason.type, // 'line' or 'stack'
            r: reason.r, c: reason.c,
            startR: reason.startR, startC: reason.startC,
            endR: reason.endR, endC: reason.endC,
            color: reason.color,
            progress: 1.5 // Lives slightly longer than rings (1.0)
        });
    });

    // Score calculation
    // 1 match means 1 line (3 rings) or 1 stack (3 rings).
    // matches array holds exactly the rings to remove.
    // If you clear 1 line, matches.length is usually 3. 
    // If you clear 2 lines intersecting, it could be 5 or 6.
    // Combo logic: Base score per ring * multiplier based on total rings matched
    let comboMultiplier = 1;
    if (matches.length > 3) comboMultiplier = 2;
    if (matches.length >= 6) comboMultiplier = 3;
    if (matches.length >= 9) comboMultiplier = 4;

    const points = matches.length * 100 * comboMultiplier;
    addScore(points);
    sound.playClear(matches.length);

    // Floating Score Text
    let sumX = 0, sumY = 0;
    matches.forEach(m => {
        sumX += state.layout.gridOrigin.x + (m.c + 0.5) * state.layout.cellSize;
        sumY += state.layout.gridOrigin.y + (m.r + 0.5) * state.layout.cellSize;
    });
    if (matches.length > 0) {
        state.floatingTexts.push({
            text: '+' + points,
            x: sumX / matches.length,
            y: sumY / matches.length,
            life: 1.0,
            color: '#F1C40F' // Bright yellow
        });
    }

    // Particles
    matches.forEach(m => {
        // Center of cell
        const cx = state.layout.gridOrigin.x + (m.c + 0.5) * state.layout.cellSize;
        const cy = state.layout.gridOrigin.y + (m.r + 0.5) * state.layout.cellSize;
        spawnParticles(cx, cy, COLORS[m.color]);

        // Create clear animation
        state.animations.push({
            type: 'clear',
            r: m.r,
            c: m.c,
            s: m.s,
            color: m.color,
            delayFrames: 24, // Delay shrinking by 400ms to let lightbeams play first
            progress: 1.0
        });

        // Remove from grid immediately so logic works,
        // visuals will be handled by animations array in draw function.
        state.grid[m.r][m.c][m.s] = null;
    });
}

function checkGameOverCondition() {
    // Check if any hand item can be placed
    let canMove = false;
    let emptyHand = true;

    for (let i = 0; i < state.hands.length; i++) {
        const handPiece = state.hands[i];
        if (handPiece) {
            emptyHand = false;
            // Check all grid spots
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (canPlace(c, r, handPiece)) {
                        return false; // Found a valid move
                    }
                }
            }
        }
    }

    if (emptyHand) return false; // Hand is empty, will refill, not game over
    return true; // No moves found
}

function addScore(points) {
    state.score += points;
    updateScore(state.score);
}

function updateRound() {
    const roundEl = document.getElementById('round');
    if (roundEl) roundEl.textContent = state.round;
}

function updateScore(s) {
    scoreEl.textContent = s;
}

// --- Rendering ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

function update() {
    if (!state.started) return;

    // Update animations
    for (let i = state.animations.length - 1; i >= 0; i--) {
        const anim = state.animations[i];

        // Handle delayed animations (e.g. rings waiting for lightbeams to finish)
        if (anim.delayFrames > 0) {
            anim.delayFrames--;
            continue;
        }

        anim.progress -= 0.05; // 20 frames to clear
        if (anim.progress <= 0) {
            state.animations.splice(i, 1);
        }
    }

    // Update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        p.alpha = p.life;
        if (p.life <= 0) {
            state.particles.splice(i, 1);
        }
    }

    // Update floating texts
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y -= 1.5; // Float up
        ft.life -= 0.015; // Fade out slowly
        if (ft.life <= 0) {
            state.floatingTexts.splice(i, 1);
        }
    }
}

function draw() {
    // Clear Background
    ctx.fillStyle = '#2c3e50'; // Matches CSS var
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Redraw BG to clear previous frame

    // Draw Grid
    drawGrid();

    // Draw Match VFX over grid
    drawVFX();

    // Draw Hand (Bottom)
    drawHandArea();

    // Draw Particles
    drawParticles();

    // Draw Floating Texts
    drawFloatingTexts();

    // Draw Dragged Item
    if (state.drag.active) {
        const piece = state.hands[state.drag.handIndex];
        if (piece) {
            const x = state.drag.currentPos.x;
            const y = state.drag.currentPos.y;
            // Dragged items often look better a bit larger or lifted
            // PHASE 3: Visual Offset (Shift Up)
            const visualY = y - (state.layout.cellSize * 1.2);
            drawPiece(x, visualY, piece, state.layout.cellSize * 1.0, 1.0);
        }
    }
}

function drawGrid() {
    const { cellSize, gridOrigin } = state.layout;

    // Draw Board Background Grid line (visual guide)
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#34495e'; // Softer grid line

    // Check for preview possibility
    let previewMatches = [];
    if (state.drag.active) {
        // WYSIWYG Logic: Use visual Visual Center for logic
        const visualY = state.drag.currentPos.y - (state.layout.cellSize * 1.2);

        const gx = Math.floor((state.drag.currentPos.x - gridOrigin.x) / cellSize);
        const gy = Math.floor((visualY - gridOrigin.y) / cellSize);

        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
            const piece = state.hands[state.drag.handIndex];
            if (canPlace(gx, gy, piece)) {
                // Simulate placement to check matches
                // Clone grid first
                const simGrid = JSON.parse(JSON.stringify(state.grid)); // Deep clone simple structure
                // Place
                for (let i = 0; i < 3; i++) {
                    if (piece[i] !== null) simGrid[gy][gx][i] = piece[i];
                }

                // Check matches with simGrid
                previewMatches = findMatchesInGrid(simGrid).removals;
            }
        }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const x = gridOrigin.x + c * cellSize;
            const y = gridOrigin.y + r * cellSize;

            // Cell bg
            ctx.fillStyle = '#34495e'; // 填充格子的暗色底色
            ctx.fillRect(x + 4, y + 4, cellSize - 8, cellSize - 8);

            // 【Bug修复：防止画笔颜色泄漏】
            // 每次画格子边框前，强制把画笔颜色重置为深色背景色，避免被圆环颜色污染
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#2c3e50';
            ctx.strokeRect(x, y, cellSize, cellSize);

            // Check if this cell is part of preview matches
            // check if {r, c} is in previewMatches
            const isPreview = previewMatches.some(m => m.r === r && m.c === c);
            if (isPreview) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillRect(x, y, cellSize, cellSize);
            }

            // Draw contents
            const cell = state.grid[r][c];
            drawPiece(x + cellSize / 2, y + cellSize / 2, cell, cellSize, 1.0);

            // Draw animations for this cell
            for (let i = 0; i < state.animations.length; i++) {
                const anim = state.animations[i];
                if (anim.r === r && anim.c === c) {
                    const radius = (cellSize / 2) * RING_SIZES[anim.s] * anim.progress; // Shrink
                    const color = COLORS[anim.color];
                    const lineWidth = LINE_WIDTHS[anim.s];
                    const alpha = anim.progress; // Fade out

                    if (anim.s === 0) {
                        ctx.beginPath();
                        ctx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
                        ctx.fillStyle = color;
                        ctx.globalAlpha = alpha;
                        ctx.fill();
                        ctx.globalAlpha = 1.0;
                    } else {
                        drawRing(x + cellSize / 2, y + cellSize / 2, radius, color, lineWidth, alpha);
                    }
                }
            }

            // Highlight specific matching rings
            // Check if {r, c, s} is in previewMatches
            if (previewMatches.length > 0 && cell) {
                for (let s = 0; s < 3; s++) {
                    const match = previewMatches.find(m => m.r === r && m.c === c && m.s === s);
                    if (match) {
                        // Draw Glow/Highlight for this specific ring
                        const radius = (cellSize / 2) * RING_SIZES[s];
                        const color = '#FFFFFF'; // White glow

                        ctx.beginPath();
                        ctx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
                        ctx.strokeStyle = color;
                        ctx.lineWidth = LINE_WIDTHS[s] + 4; // Thicker
                        ctx.globalAlpha = 0.6;
                        ctx.stroke();
                        ctx.globalAlpha = 1.0;
                    }
                }
            }
        }
    }
}

// Refactored findMatches to accept grid
function findMatchesInGrid(gridToCheck) {
    const toRemove = [];
    const reasons = []; // New block for visual VFX
    const addRemoval = (r, c, s, color) => {
        if (!toRemove.some(item => item.r === r && item.c === c && item.s === s)) {
            toRemove.push({ r, c, s, color });
        }
    };

    // 1. Same Point Stack (Board Sweep Mechanic)
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = gridToCheck[r][c];
            if (cell[0] && cell[1] && cell[2] && cell[0].color === cell[1].color && cell[1].color === cell[2].color) {
                const targetColor = cell[0].color;

                // Add reason for this trigger point
                reasons.push({ type: 'stack', r: r, c: c, color: targetColor });

                // Sweep entire board for this color
                for (let sweepR = 0; sweepR < GRID_SIZE; sweepR++) {
                    for (let sweepC = 0; sweepC < GRID_SIZE; sweepC++) {
                        const sweepCell = gridToCheck[sweepR][sweepC];
                        for (let s = 0; s < 3; s++) {
                            if (sweepCell[s] && sweepCell[s].color === targetColor) {
                                addRemoval(sweepR, sweepC, s, targetColor);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Lines
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
                // Add reason for this line
                reasons.push({
                    type: 'line',
                    startR: line[0].r, startC: line[0].c,
                    endR: line[2].r, endC: line[2].c,
                    color: colorIdx
                });

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

// Updated original findMatches to use generic one
function findMatches() {
    return findMatchesInGrid(state.grid);
}

function drawHandArea() {
    const { handSpacing, handOrigin, cellSize } = state.layout;

    for (let i = 0; i < state.hands.length; i++) {
        // Skip if this slot is being dragged
        if (state.drag.active && state.drag.handIndex === i) continue;

        const piece = state.hands[i];
        if (!piece) continue;

        const x = state.layout.handOrigin.x + (i * state.layout.handSpacing);
        const y = handOrigin.y;

        // Removed slot background circle as requested

        drawPiece(x, y, piece, cellSize * 0.8, 1.0);
    }
}

/**
 * Draws a combination of rings at center x,y
 * combo: [colorIdxSmall, colorIdxMed, colorIdxLarge]
 * size: The pixel width/height of the container
 */
function drawPiece(x, y, piece, size, alpha) {
    if (!piece) return;

    for (let i = 0; i < 3; i++) {
        const ring = piece[i];
        if (ring) {
            const colorIdx = ring.color;

            const radius = (size / 2) * RING_SIZES[i];
            const color = COLORS[colorIdx];
            const lineWidth = LINE_WIDTHS[i];

            if (i === 0) { // Smallest ring
                // Draw filled circle
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = alpha;
                ctx.fill();
                ctx.globalAlpha = 1.0;
            } else {
                drawRing(x, y, radius, color, lineWidth, alpha);
            }
        }
    }
}

function drawRing(x, y, radius, color, width, alpha) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = 0; // Removed bloom for clean pastel look
    ctx.lineCap = 'round'; // Round caps for simpler feel
    ctx.globalAlpha = alpha;
    ctx.stroke();
    // Reset shadow and alpha
    ctx.globalAlpha = 1.0;
}

// --- Effects ---
function spawnParticles(x, y, color) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        state.particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: color,
            size: Math.random() * 3 + 1
        });
    }
}

function createPlaceEffect(gx, gy) {
    // Maybe a small flash?
}

function drawParticles() {
    for (const p of state.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function drawFloatingTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px Nunito, sans-serif';

    for (const ft of state.floatingTexts) {
        ctx.globalAlpha = ft.life; // Fade out

        // Draw Outline (Stroke)
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#2c3e50'; // Dark stroke for contrast
        ctx.strokeText(ft.text, ft.x, ft.y);

        // Draw Fill
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);

        ctx.globalAlpha = 1.0;
    }
}

function drawVFX() {
    for (let i = 0; i < state.animations.length; i++) {
        const anim = state.animations[i];
        if (anim.type === 'line' && anim.progress > 0) {
            const x1 = state.layout.gridOrigin.x + (anim.startC + 0.5) * state.layout.cellSize;
            const y1 = state.layout.gridOrigin.y + (anim.startR + 0.5) * state.layout.cellSize;
            const x2 = state.layout.gridOrigin.x + (anim.endC + 0.5) * state.layout.cellSize;
            const y2 = state.layout.gridOrigin.y + (anim.endR + 0.5) * state.layout.cellSize;

            // Draw glowing line
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = COLORS[anim.color];
            ctx.lineWidth = 14 * Math.min(1.0, anim.progress);
            ctx.lineCap = 'round';
            ctx.shadowBlur = 20;
            ctx.shadowColor = COLORS[anim.color];
            ctx.globalAlpha = Math.min(1.0, anim.progress);
            ctx.stroke();

            // Draw inner intense core
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4 * Math.min(1.0, anim.progress);
            ctx.shadowBlur = 0;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        } else if (anim.type === 'stack' && anim.progress > 0) {
            const x = state.layout.gridOrigin.x + (anim.c + 0.5) * state.layout.cellSize;
            const y = state.layout.gridOrigin.y + (anim.r + 0.5) * state.layout.cellSize;
            const radius = state.layout.cellSize * 0.8 * (1.5 - anim.progress); // Expands slightly

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = COLORS[anim.color];
            ctx.globalAlpha = Math.min(1.0, anim.progress) * 0.4;
            ctx.fill();

            // Bright ring burst
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.globalAlpha = Math.min(1.0, anim.progress);
            ctx.stroke();

            ctx.globalAlpha = 1.0;
        }
    }
}

// Start
init();
