const fs = require('fs');
let code = fs.readFileSync('/Users/a1234/Desktop/circly/script.js', 'utf8');

// 1. Update findMatchesInGrid to return { removals, reasons }
let oldFind = `function findMatchesInGrid(gridToCheck) {
    const toRemove = [];
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
}`;

let newFind = `function findMatchesInGrid(gridToCheck) {
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
}`;

code = code.replace(oldFind, newFind);

// 2. Update preview matches definition to use the new object structure
let oldPreview = `        // Check matches with simGrid
                previewMatches = findMatchesInGrid(simGrid);`;
let newPreview = `        // Check matches with simGrid
                previewMatches = findMatchesInGrid(simGrid).removals;`;
code = code.replace(oldPreview, newPreview);

// update findMatches() to return the object
let oldFindMatches = `function findMatches() {
    return findMatchesInGrid(state.grid);
}`;
let newFindMatches = `function findMatches() {
    return findMatchesInGrid(state.grid);
}`;
// Wait, the caller is processTurn

// update processTurn
let oldProcess = `function processTurn() {
    // Check matches
    const matches = findMatches();

    if (matches.length > 0) {
        // Execute clear
        clearMatches(matches);`;

let newProcess = `function processTurn() {
    // Check matches
    const matchData = findMatches();
    const matches = matchData.removals;
    const reasons = matchData.reasons;

    if (matches.length > 0) {
        // Execute clear
        clearMatches(matches, reasons);`;
code = code.replace(oldProcess, newProcess);

// update clearMatches signature and inject animations
let oldClear = `function clearMatches(matches) {
    if (matches.length === 0) return;`;

let newClear = `function clearMatches(matches, reasons = []) {
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
    });`;
code = code.replace(oldClear, newClear);


// update draw() to draw the VFX
let oldDrawCall = `    // Draw Grid
    drawGrid();`;
let newDrawCall = `    // Draw Grid
    drawGrid();

    // Draw Match VFX over grid
    drawVFX();`;
code = code.replace(oldDrawCall, newDrawCall);

// add drawVFX and updating logic
let oldUpdate = `        anim.progress -= 0.05; // 20 frames to clear
        if (anim.progress <= 0) {
            state.animations.splice(i, 1);
        }`;
// The existing logic already shrinks animation length, no change needed there since life is handled.

let oldEnd = `// Start
init();`;
let newDrawVFX = `function drawVFX() {
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
init();`;
code = code.replace(oldEnd, newDrawVFX);

fs.writeFileSync('/Users/a1234/Desktop/circly/script.js', code);
console.log('Match reason animations injected.');
