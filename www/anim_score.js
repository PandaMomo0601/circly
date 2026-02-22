const fs = require('fs');
let code = fs.readFileSync('/Users/a1234/Desktop/circly/script.js', 'utf8');

// 1. Feature: Combo Scoring
// Let's modify clearMatches(matches)
let clearMatchOld = `function clearMatches(matches) {
    if (matches.length === 0) return;

    // Score calculation
    // Base 100 per ring? Or 100 per match?
    // Let's do 100 * count * combo multiplier (if we had one)
    addScore(matches.length * 100);`;

let clearMatchNew = `function clearMatches(matches) {
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
    addScore(points);`;

code = code.replace(clearMatchOld, clearMatchNew);


// 2. Feature: Visual Clearing Transition (Animation)
// We need to add an animation when clearing before actually making grid null.
// Let's change how clearMatches removes from grid.

let removeOld = `    matches.forEach(m => {
        // Center of cell
        const cx = state.layout.gridOrigin.x + (m.c + 0.5) * state.layout.cellSize;
        const cy = state.layout.gridOrigin.y + (m.r + 0.5) * state.layout.cellSize;
        spawnParticles(cx, cy, COLORS[m.color]);

        // Remove from grid
        state.grid[m.r][m.c][m.s] = null;
    });`;

let removeNew = `    matches.forEach(m => {
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
    });`;
code = code.replace(removeOld, removeNew);

// 3. Draw animations
// Let's update update() and draw() to handle state.animations
let updateOld = `    // Update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {`;

let updateNew = `    // Update animations
    for (let i = state.animations.length - 1; i >= 0; i--) {
        const anim = state.animations[i];
        anim.progress -= 0.05; // 20 frames to clear
        if (anim.progress <= 0) {
            state.animations.splice(i, 1);
        }
    }

    // Update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {`;
code = code.replace(updateOld, updateNew);

// In drawGrid(), let's add logic to draw animations overlaying the grid
let drawGridOld = `            // Highlight specific matching rings
            // Check if {r, c, s} is in previewMatches
            if (previewMatches.length > 0 && cell) {`;

let drawGridNew = `            // Draw animations for this cell
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
            if (previewMatches.length > 0 && cell) {`;

code = code.replace(drawGridOld, drawGridNew);

fs.writeFileSync('/Users/a1234/Desktop/circly/script.js', code);
console.log('Animation and combo scoring implemented.');
