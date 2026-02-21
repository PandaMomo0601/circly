const fs = require('fs');
let code = fs.readFileSync('/Users/a1234/Desktop/circly/script.js', 'utf8');

// 1. Rename generateRandomRingCombo -> generatePiece
code = code.replace(/generateRandomRingCombo/g, 'generatePiece');

// 2. Rename drawRingCombo -> drawPiece
code = code.replace(/drawRingCombo/g, 'drawPiece');

// 3. Rename rings, combo, handItem -> piece in function scopes
code = code.replace(/function canPlace\(gx, gy, rings\)/g, 'function canPlace(gx, gy, piece)');
code = code.replace(/function placeRing\(gx, gy, rings\)/g, 'function placeRing(gx, gy, piece)');

code = code.replace(/const combo = \[null, null, null\];/g, 'const piece = [null, null, null];');
code = code.replace(/combo\[i\] = baseColor;/g, 'piece[i] = { size: i, color: baseColor };');
code = code.replace(/combo\[i\] = Math\.floor/g, 'piece[i] = { size: i, color: Math.floor');
code = code.replace(/return combo;/g, 'return piece;');
// The loop inside generatePiece
code = code.replace(/Math\.floor\(Math\.random\(\) \* COLORS\.length\);/g, 'Math.floor(Math.random() * COLORS.length) };');

code = code.replace(/const handItem = state\.hands/g, 'const piece = state.hands');
code = code.replace(/canPlace\(gx, gy, handItem\)/g, 'canPlace(gx, gy, piece)');
code = code.replace(/placeRing\(gx, gy, handItem\)/g, 'placeRing(gx, gy, piece)');

code = code.replace(/const combo = state\.hands\[i\];/g, 'const piece = state.hands[i];');
code = code.replace(/if \(!combo\) continue;/g, 'if (!piece) continue;');
code = code.replace(/drawPiece\(x, y, combo, /g, 'drawPiece(x, y, piece, ');

code = code.replace(/function drawPiece\(x, y, combo, size, alpha\)/g, 'function drawPiece(x, y, piece, size, alpha)');
code = code.replace(/if \(!combo\) return;/g, 'if (!piece) return;');
code = code.replace(/const colorIdx = combo\[i\];/g, 'const ring = piece[i];\n        if (ring) {\n            const colorIdx = ring.color;');
// Cleanup drawPiece inner
code = code.replace(/if \(colorIdx !== null\) \{/g, ''); // we replaced it with if (ring) {

code = code.replace(/canPlace\(c, r, hand\)/g, 'canPlace(c, r, handPiece)');
code = code.replace(/const hand = state\.hands\[i\];/g, 'const handPiece = state.hands[i];');
code = code.replace(/if \(hand\) \{/g, 'if (handPiece) {');

// 4. Update Ring object logic
// canPlace
code = code.replace(/if \(rings\[i\] !== null/g, 'if (piece[i] !== null');
code = code.replace(/if \(piece\[i\] !== null && cell\[i\] !== null\)/g, 'if (piece[i] !== null && cell[i] !== null)');

// placeRing
code = code.replace(/if \(rings\[i\] !== null\)/g, 'if (piece[i] !== null)');
code = code.replace(/cell\[i\] = rings\[i\];/g, 'cell[i] = piece[i];');

// findMatchesInGrid - Same Point Stack (3 logic changed because it's object now)
code = code.replace(/if \(cell\[0\] !== null && cell\[0\] === cell\[1\] && cell\[1\] === cell\[2\]\)/g, 
  'if (cell[0] && cell[1] && cell[2] && cell[0].color === cell[1].color && cell[1].color === cell[2].color)');
code = code.replace(/addRemoval\(r, c, 0, cell\[0\]\);/g, 'addRemoval(r, c, 0, cell[0].color);');
code = code.replace(/addRemoval\(r, c, 1, cell\[1\]\);/g, 'addRemoval(r, c, 1, cell[1].color);');
code = code.replace(/addRemoval\(r, c, 2, cell\[2\]\);/g, 'addRemoval(r, c, 2, cell[2].color);');

// findMatchesInGrid - Lines
code = code.replace(/if \(cell\.includes\(colorIdx\)\) count\+\+;/g, 
  'if (cell.some(ring => ring && ring.color === colorIdx)) count++;');
code = code.replace(/if \(cell\[s\] === colorIdx\) addRemoval\(pos\.r, pos\.c, s, colorIdx\);/g, 
  'if (cell[s] && cell[s].color === colorIdx) addRemoval(pos.r, pos.c, s, colorIdx);');

// 5. Add Round Logic
code = code.replace(/bestScore: parseInt\(localStorage\.getItem\(\'colorRings_best\'\) \|\| \'0\'\),/g, 'bestScore: parseInt(localStorage.getItem(\'colorRings_best\') || \'0\'),\n    round: 1, // New Round tracking');
code = code.replace(/state\.startTime = Date\.now\(\); \/\/ Reset difficulty timer/g, 'state.difficultyStartTime = Date.now();\n    state.round = 1;\n    updateRound();');
code = code.replace(/const elapsed = Date\.now\(\) - state\.startTime;/g, 'const elapsed = Date.now() - state.difficultyStartTime;');

code = code.replace(/fillHand\(\) {/g, 'fillHand() {\n    state.round++;\n    updateRound();');
code = code.replace(/function updateScore\(s\) {/g, 'function updateRound() {\n    const roundEl = document.getElementById(\'round\');\n    if (roundEl) roundEl.textContent = state.round;\n}\n\nfunction updateScore(s) {');

// 6. Bug fixes - removing playError() when dropping in invalid cell from drag (to hand)
code = code.replace(/\} else \{\n            sound\.playError\(\);\n        \}/g, '} else {\n            // sound.playError(); // Removed penalty for invalid drop\n        }'); // this replaces the inner else
code = code.replace(/\n    \} else \{\n        sound\.playError\(\);\n    \}/g, '\n    } else {\n        // sound.playError(); // Removed penalty for dropping outside grid\n    }'); // this overrides the outer else

// 7. Bug fixes - touchmove passive
code = code.replace(/canvas\.addEventListener\(\'touchmove\', \(e\) => \{/g, 'canvas.addEventListener(\'touchmove\', (e) => {'); // no regex needed just the replace param
code = code.replace(/\}\);/g, '}'); // wait touchmove is anonymous we'll just rewrite it
code = code.replace(/canvas\.addEventListener\(\'touchmove\', \(e\) => \{\n        e\.preventDefault\(\); \/\/ Prevent scroll\n        handleMove\(e\.touches\[0\]\);\n    \}\);/g, 'canvas.addEventListener(\'touchmove\', (e) => {\n        e.preventDefault(); // Prevent scroll\n        handleMove(e.touches[0]);\n    }, { passive: false });');


// Write back
fs.writeFileSync('/Users/a1234/Desktop/circly/script.js', code);
console.log('Refactor script complete.');
