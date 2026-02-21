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
    '#FF9F43'  // Pastel Orange
];
const RING_SIZES = [0.3, 0.52, 0.74]; // Reduced large size slightly to avoid "box border" look
const LINE_WIDTHS = [6, 8, 10]; // Slightly thicker for softer look

// Game Configuration
const ANIMATION_SPEED = 0.2; // 0-1 lerp factor
const PARTICLE_COUNT = 20;

// --- Sound Manager ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.bgmNodes = [];
        this.bgmInterval = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.startBGM();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => this.startBGM());
        }
    }

    playTone(freq, type, duration, vol = 0.1, attack = 0.01, release = 0.1) {
        if (this.muted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const t = this.ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration + release);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(t + duration + release);
    }

    playPickup() {
        // Softer sine blip
        this.playTone(500, 'sine', 0.1, 0.1, 0.01, 0.1);
    }

    playPlace() {
        // Soft thud
        this.playTone(200, 'sine', 0.15, 0.15, 0.01, 0.2);
    }

    playError() {
        // Low hum instead of harsh saw
        this.playTone(100, 'triangle', 0.3, 0.1, 0.05, 0.2);
    }

    playClear(count) {
        // Gentle major chord arpeggio
        const base = 300; // Lower base pitch
        const chord = [0, 4, 7, 12]; // Major intervals
        for (let i = 0; i < 3 + Math.min(count, 3); i++) {
            setTimeout(() => {
                const note = base * Math.pow(2, chord[i % 4] / 12);
                this.playTone(note, 'sine', 0.4, 0.1, 0.05, 0.5);
            }, i * 80);
        }
    }

    playGameOver() {
        if (this.muted || !this.ctx) return;
        this.stopBGM();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 2.0);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 2.0);
    }

    startBGM() {
        if (this.bgmInterval || this.muted || !this.ctx) return;

        // Simple generative ambient: play a random chord note every few seconds
        const notes = [261.63, 329.63, 392.00, 493.88, 523.25]; // C Major 7

        this.bgmInterval = setInterval(() => {
            if (this.ctx.state === 'running' && !this.muted && !state.gameOver) {
                const freq = notes[Math.floor(Math.random() * notes.length)];
                // Very long attack and release for pad-like sound
                this.playTone(freq * 0.5, 'sine', 4.0, 0.02, 2.0, 3.0);
            }
        }, 3000);
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }
}

const sound = new SoundManager();

// --- State ---
const state = {
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

// --- Initialization ---
function init() {
    // Setup Grid
    state.grid = Array(GRID_SIZE).fill(null).map(() =>
        Array(GRID_SIZE).fill(null).map(() => [null, null, null])
    );

    // Setup Input
    canvas.addEventListener('mousedown', (e) => { sound.init(); handleStart(e); });
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', (e) => { sound.init(); handleStart(e.touches[0]); });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent scroll
        handleMove(e.touches[0]);
    }, { passive: false });
    canvas.addEventListener('touchend', handleEnd);

    // Setup UI
    restartBtn.addEventListener('click', resetGame);
    bestScoreEl.textContent = state.bestScore;

    // Start Game
    resetGame();

    // Resize & Loop
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(loop);
}

function resetGame() {
    state.grid = Array(GRID_SIZE).fill(null).map(() =>
        Array(GRID_SIZE).fill(null).map(() => [null, null, null])
    );
    state.score = 0;
    state.gameOver = false;
    state.particles = [];
    state.hands = [];

    state.difficultyStartTime = Date.now();
    state.round = 1;
    updateRound();

    if (sound.ctx) sound.startBGM();

    updateScore(0);
    fillHand();

    gameOverModal.classList.add('hidden');
}

function fillHand() {
    state.round++;
    updateRound();
    state.hands = [];
    while (state.hands.length < 3) {
        state.hands.push(generatePiece());
    }
}

function getDifficulty() {
    // 0 to 1 scaling over 3 minutes (180000ms)
    const elapsed = Date.now() - state.difficultyStartTime;
    const diff = Math.min(elapsed / 180000, 1.0);
    return diff;
}

function generatePiece() {
    // Difficulty influences randomness
    // Low diff: Mostly single rings, matching colors
    // High diff: More rings per combo, mismatched colors

    const difficulty = getDifficulty();
    const piece = [null, null, null];
    let hasRing = false;

    // Base probability to add a ring at size i
    // Easy: 40%, Hard: 60%
    const baseProb = 0.4 + (difficulty * 0.2);

    // Color consistency
    // Easy: High chance all rings in this combo share color
    // Hard: High chance random colors
    const consistentColor = Math.random() > (difficulty * 0.8); // Becomes rarer
    const baseColor = Math.floor(Math.random() * COLORS.length);

    while (!hasRing) {
        for (let i = 0; i < 3; i++) {
            if (Math.random() < baseProb) {
                if (consistentColor) {
                    piece[i] = { size: i, color: baseColor };
                } else {
                    piece[i] = { size: i, color: Math.floor(Math.random() * COLORS.length) };
                }
                hasRing = true;
            }
        }
        // If we failed to generate any ring (rare but possible), retry loop
    }
    return piece;
}

// --- Layout & Resize ---
// --- Layout & Resize ---
function resize() {
    // Force 9:16 Aspect Ratio Logic
    const windowRatio = window.innerWidth / window.innerHeight;
    const targetRatio = 9 / 16;

    let renderW, renderH;

    if (windowRatio > targetRatio) {
        // Window is wider than 9:16, limit width based on height
        renderH = window.innerHeight;
        renderW = renderH * targetRatio;
    } else {
        // Window is taller/narrower, limit height based on width
        renderW = window.innerWidth;
        renderH = renderW / targetRatio;
    }

    // Set canvas dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Center the render area
    const offsetX = (window.innerWidth - renderW) / 2;
    const offsetY = (window.innerHeight - renderH) / 2;

    state.layout.renderRect = { x: offsetX, y: offsetY, w: renderW, h: renderH };

    // Calculate layout metrics relative to renderRect
    // Grid area: Top portion
    const gridAreaSize = renderW * 0.9;
    state.layout.cellSize = gridAreaSize / GRID_SIZE;

    state.layout.gridOrigin = {
        x: offsetX + (renderW - gridAreaSize) / 2,
        y: offsetY + (renderH * 0.25) // Start at 25% height
    };

    // Hand area: Bottom
    state.layout.handSpacing = renderW / 3;
    state.layout.handOrigin = {
        x: offsetX + (state.layout.handSpacing / 2),
        y: offsetY + (renderH * 0.85) // Bottom 15%
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
    if (state.gameOver) return;
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
    const matches = findMatches();

    if (matches.length > 0) {
        // Execute clear
        clearMatches(matches);

        // Refill hand if empty logic usually happens after drop, 
        // but if we match, we might want to delay slightly or just do it.
        // Also check if hand is empty now?
    } else {
        // No match

    }

    // Refill hand if empty
    let handEmpty = true;
    for (let h of state.hands) {
        if (h !== null) handEmpty = false;
    }
    if (handEmpty) {
        fillHand();
    }

    // Check Game Over
    // We need to check if ANY of the remaining hand items can fit ANYWHERE.
    if (checkGameOverCondition()) {
        state.gameOver = true;
        sound.playGameOver();
        setTimeout(() => {
            gameOverModal.classList.remove('hidden');
            finalScoreEl.textContent = state.score;
            if (state.score > state.bestScore) {
                state.bestScore = state.score;
                localStorage.setItem('colorRings_best', state.bestScore);
                bestScoreEl.textContent = state.bestScore;
            }
        }, 1000);
    }
}

// Old matches logic removed/replaced by specific implementation
/* function findMatches() { ... } */

function clearMatches(matches) {
    if (matches.length === 0) return;

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
    // Update animations
    for (let i = state.animations.length - 1; i >= 0; i--) {
        const anim = state.animations[i];
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
}

function draw() {
    // Clear Background
    ctx.fillStyle = '#2c3e50'; // Matches CSS var
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Redraw BG to clear previous frame

    // Draw Grid
    drawGrid();

    // Draw Hand (Bottom)
    drawHandArea();

    // Draw Particles
    drawParticles();

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
                previewMatches = findMatchesInGrid(simGrid);
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
    const addRemoval = (r, c, s, color) => {
        if (!toRemove.some(item => item.r === r && item.c === c && item.s === s)) {
            toRemove.push({ r, c, s, color });
        }
    };

    // 1. Same Point Stack
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = gridToCheck[r][c];
            if (cell[0] && cell[1] && cell[2] && cell[0].color === cell[1].color && cell[1].color === cell[2].color) {
                addRemoval(r, c, 0, cell[0].color);
                addRemoval(r, c, 1, cell[1].color);
                addRemoval(r, c, 2, cell[2].color);
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
                for (const pos of line) {
                    const cell = gridToCheck[pos.r][pos.c];
                    for (let s = 0; s < 3; s++) {
                        if (cell[s] && cell[s].color === colorIdx) addRemoval(pos.r, pos.c, s, colorIdx);
                    }
                }
            }
        }
    }
    return toRemove;
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

// Start
init();
