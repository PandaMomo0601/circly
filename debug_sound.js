const fs = require('fs');
let code = fs.readFileSync('/Users/a1234/Desktop/circly/script.js', 'utf8');

// Inject console.log into SoundManager methods
code = code.replace(
    /playTone\(freq, type, duration, vol = 0\.1, attack = 0\.01, release = 0\.1\) {/g,
    `playTone(freq, type, duration, vol = 0.1, attack = 0.01, release = 0.1) {
        console.log('playTone:', {freq, type, duration, vol, state: this.ctx ? this.ctx.state : 'null'});`
);

code = code.replace(
    /init\(\) {/g,
    `init() {
        console.log('SoundManager.init() called');`
);

fs.writeFileSync('/Users/a1234/Desktop/circly/script.js', code);
console.log('Debug logs injected.');
