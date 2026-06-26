let gameConfig = { device: '', hasHeadphones: false, latency: 0 };
let audioCtx;
let nextBeatTime = 0; let beatInterval = 0.5; let audioTimerId; let animationFrameId;

let currentNotesData = [];
let gameStartTime = 0;
let gameOverTimer = null; 
let currentDifficulty = '';
const NOTE_SPEED = 2.0; 
const frequencies = [329.63, 392.00, 440.00, 523.25];

let stats = { S: 0, A: 0, C: 0, combo: 0, maxCombo: 0 };

const songs = [
    { id: 'etude', name: '練習曲 (Etude)' },
    { id: 'blank1', name: '??? (未解鎖)' },
    { id: 'blank2', name: '??? (未解鎖)' },
    { id: 'blank3', name: '??? (未解鎖)' }
];
let currentSongIndex = 0;

function requestFullscreen() {
    let el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function showScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.add('hidden'));
    document.getElementById(sceneId).classList.remove('hidden');
}

// ================= 階段一、二、三 =================
function selectDevice(type) { gameConfig.device = type; requestFullscreen(); showScene('step-audio'); }
function selectAudio(hasHeadphones) {
    gameConfig.hasHeadphones = hasHeadphones;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (hasHeadphones) { showScene('step-latency'); startSliderCalibration(); } 
    else { gameConfig.latency = 0; enterSongSelect(); }
}

const ball = document.getElementById('bouncing-ball');
const slider = document.getElementById('latency-slider');
slider.addEventListener('input', (e) => {
    gameConfig.latency = parseInt(e.target.value);
    document.getElementById('latency-value').innerText = `${gameConfig.latency} ms`;
});

function startSliderCalibration() { nextBeatTime = audioCtx.currentTime + 0.2; audioScheduler(); renderCalibrationLoop(); }
function audioScheduler() {
    while (nextBeatTime < audioCtx.currentTime + 0.1) {
        playPing(600, nextBeatTime, 0.08); nextBeatTime += beatInterval;
    }
    audioTimerId = setTimeout(audioScheduler, 25.0);
}
function playPing(frequency, time, duration) {
    if(!audioCtx) return;
    let osc = audioCtx.createOscillator(); let gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.08, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.start(time); osc.stop(time + duration);
}
function renderCalibrationLoop() {
    let progress = ((audioCtx.currentTime - (gameConfig.latency / 1000)) % beatInterval) / beatInterval;
    ball.style.bottom = `${10 + (Math.abs(Math.sin(progress * Math.PI)) * 100)}px`;
    animationFrameId = requestAnimationFrame(renderCalibrationLoop);
}
function goBackToAudio() { clearTimeout(audioTimerId); cancelAnimationFrame(animationFrameId); showScene('step-audio'); }
function confirmLatency() { clearTimeout(audioTimerId); cancelAnimationFrame(animationFrameId); enterSongSelect(); }

// ================= 階段四：選單與賽前準備 =================
const carousel = document.getElementById('carousel-container');
function enterSongSelect() { showScene('step-song-select'); initCarousel(); }
function initCarousel() {
    carousel.innerHTML = '';
    songs.forEach((song, i) => {
        let div = document.createElement('div'); div.className = 'song-item'; div.innerText = song.name;
        div.onclick = () => { currentSongIndex = i; updateCarouselPositions(); if (i === 0) openModal(); else alert("尚未解鎖！"); };
        carousel.appendChild(div);
    });
    updateCarouselPositions();
}
function updateCarouselPositions() {
    document.querySelectorAll('.song-item').forEach((item, i) => {
        let offset = i - currentSongIndex;
        let scale = Math.max(0, 1 - Math.abs(offset) * 0.15);
        item.style.transform = `translate(${-Math.abs(offset) * 30}px, ${offset * 85}px) scale(${scale})`;
        item.classList.toggle('active', offset === 0);
    });
}
window.addEventListener('keydown', (e) => {
    if (!document.getElementById('step-song-select').classList.contains('hidden') && document.getElementById('difficulty-modal').classList.contains('hidden')) {
        if (e.key === 'ArrowUp' && currentSongIndex > 0) { currentSongIndex--; updateCarouselPositions(); }
        else if (e.key === 'ArrowDown' && currentSongIndex < songs.length - 1) { currentSongIndex++; updateCarouselPositions(); }
        else if (e.key === 'Enter') { if (currentSongIndex === 0) openModal(); else alert("尚未解鎖！"); }
    }
});
let touchStartY = 0;
window.addEventListener('touchstart', e => { 
    if(document.getElementById('step-game').classList.contains('hidden')) touchStartY = e.touches[0].clientY; 
}, {passive: false});
window.addEventListener('touchend', e => {
    if (!document.getElementById('step-song-select').classList.contains('hidden') && document.getElementById('difficulty-modal').classList.contains('hidden')) {
        let diff = touchStartY - e.changedTouches[0].clientY;
        if (diff > 40 && currentSongIndex < songs.length - 1) currentSongIndex++;
        if (diff < -40 && currentSongIndex > 0) currentSongIndex--;
        updateCarouselPositions();
    }
});

function openModal() { document.getElementById('selected-song-title').innerText = songs[currentSongIndex].name; document.getElementById('difficulty-modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('difficulty-modal').classList.add('hidden'); }

// 賽前準備視窗 (2秒後出現按鈕)
let preGameReady = false;
function prepareGame(difficulty) {
    currentDifficulty = difficulty;
    closeModal();
    showScene('pre-game-modal');
    preGameReady = false;
    document.getElementById('start-game-btn').classList.add('hidden');
    
    let rulesText = "";
    if (difficulty === 'extreme-easy') rulesText = "【極度簡單】<br>點擊螢幕任意處或鍵盤任意鍵即可。";
    else if (difficulty === 'easy') rulesText = "【簡單模式】<br>將螢幕分左右兩側。<br>電腦版：左 F / 右 J。";
    else if (difficulty === 'normal') rulesText = "【普通模式】<br>四軌獨立判定。<br>電腦版：D, F, J, K。";
    else if (difficulty === 'hard') rulesText = "【稍微困難】<br>出現粉色滑動音符！<br>手機版：請用手指在螢幕上滑過軌道。<br>電腦版：滑動鍵為 S(左一), E(左二), I(右二), L(右一)，一般鍵為 D, F, J, K。";
    
    document.getElementById('pre-game-rules').innerHTML = rulesText;

    setTimeout(() => {
        preGameReady = true;
        document.getElementById('start-game-btn').classList.remove('hidden');
    }, 2000);
}

// 監聽 Enter 鍵直接開始
window.addEventListener('keydown', (e) => {
    if (!document.getElementById('pre-game-modal').classList.contains('hidden') && preGameReady && e.key === 'Enter') {
        startGame();
    }
});

// ================= 階段五：判定系統與遊戲核心 =================
function startGame() {
    showScene('step-game');
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }
    
    stats = { S: 0, A: 0, C: 0, combo: 0, maxCombo: 0 };
    updateComboDisplay();
    setupGameplayInput(currentDifficulty);
    loadAndPlaySong(); 
}

function showJudgement(type) {
    const jText = document.getElementById('judgement-text');
    const cText = document.getElementById('combo-text');
    jText.classList.remove('pop-anim'); void jText.offsetWidth; 
    
    if(type === 'C') {
        jText.innerText = "C (MISS)"; jText.style.color = "#ff3366"; jText.style.textShadow = "0 0 10px #ff3366";
        stats.combo = 0; cText.innerText = "";
    } else {
        jText.innerText = type; jText.style.color = (type === 'S+') ? "#00f0ff" : "#00ff88";
        jText.style.textShadow = `0 0 15px ${jText.style.color}`;
        stats.combo++; if(stats.combo > stats.maxCombo) stats.maxCombo = stats.combo;
        cText.innerText = `${stats.combo} COMBO`;
    }
    jText.classList.add('pop-anim');
}
function updateComboDisplay() { document.getElementById('judgement-text').innerText = ""; document.getElementById('combo-text').innerText = ""; }

// 高精度判定：區分滑動與點擊，並加入「太早按」的 C 判定
function hitLane(laneIndex, isSlideInput) {
    const pad = document.getElementById(`pad-${laneIndex}`);
    if (pad) {
        pad.classList.add('active');
        if(!isSlideInput) playPing(frequencies[laneIndex], audioCtx.currentTime, 0.1);
        setTimeout(() => pad.classList.remove('active'), 100);
    }

    let gameTime = audioCtx.currentTime - (gameConfig.latency / 1000) - gameStartTime;
    
    // 找出在有效區間內的未擊打音符 (放大判定範圍到 0.4 秒前，用來抓「太早按」)
    let validNotes = currentNotesData.filter(n => !n.hit && n.lane === laneIndex && (n.time - gameTime) > -0.2 && (n.time - gameTime) < 0.4);
    
    if (validNotes.length > 0) {
        // 尋找目標：如果是滑動輸入，只找滑動音符；否則找普通音符。如果極度簡單/簡單則不強制區分。
        let target = validNotes.sort((a, b) => Math.abs(a.time - gameTime) - Math.abs(b.time - gameTime))[0];
        
        // 在「稍微困難」模式下，嚴格要求滑動鍵只能打滑動音符，普通鍵打普通音符
        if (currentDifficulty === 'hard') {
            let isSlideNote = (target.type === 'slide');
            if (isSlideInput !== isSlideNote) return; // 鍵位錯誤，直接忽略
        }

        let timeDiff = target.time - gameTime; // 正數代表提早，負數代表太晚
        
        // 如果是點擊(Tap)，且提早太多(>0.18秒)，嚴格判定為 C！滑動則給予寬容，不計 Early Miss。
        if (!isSlideInput && timeDiff > 0.18) {
            target.hit = true; 
            stats.C++; showJudgement('C');
            if (target.element) target.element.style.opacity = '0.3'; 
            return;
        }

        let offset = Math.abs(timeDiff);
        
        if (offset <= 0.18) {
            target.hit = true; 
            if (offset <= 0.08) { stats.S++; showJudgement('S+'); } 
            else { stats.A++; showJudgement('A'); }
            if (target.element) target.element.style.display = 'none'; 
        }
    }
}

// 鎖定手機滑動亂跑 (全域鎖定 touchmove)
window.addEventListener('touchmove', (e) => {
    if (!document.getElementById('step-game').classList.contains('hidden')) {
        e.preventDefault(); 
        
        // 手機版滑動 (Slide) 判定
        if (currentDifficulty === 'hard') {
            let width = window.innerWidth;
            let section = width / 4;
            for(let i=0; i<e.changedTouches.length; i++) {
                let touchX = e.changedTouches[i].clientX;
                let lane = Math.floor(touchX / section);
                if (lane >= 0 && lane <= 3) hitLane(lane, true); // 觸發滑動判定
            }
        }
    }
}, { passive: false });

function setupGameplayInput(difficulty) {
    window.onkeydown = (e) => {
        // 解決長按變成連打的 BUG！(e.repeat 判斷)
        if (document.getElementById('step-game').classList.contains('hidden') || e.repeat) return;
        const key = e.key.toLowerCase();
        
        if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(i => hitLane(i, false));
        else if (difficulty === 'easy') {
            if (key === 'f') { hitLane(0, false); hitLane(1, false); }
            if (key === 'j') { hitLane(2, false); hitLane(3, false); }
        } else if (difficulty === 'normal') {
            if (key === 'd') hitLane(0, false); if (key === 'f') hitLane(1, false);
            if (key === 'j') hitLane(2, false); if (key === 'k') hitLane(3, false);
        } else if (difficulty === 'hard') {
            // 電腦版「稍微困難」：區分普通 (dfjk) 與 滑動 (seil)
            if (key === 'd') hitLane(0, false); if (key === 'f') hitLane(1, false);
            if (key === 'j') hitLane(2, false); if (key === 'k') hitLane(3, false);
            if (key === 's') hitLane(0, true); if (key === 'e') hitLane(1, true);
            if (key === 'i') hitLane(2, true); if (key === 'l') hitLane(3, true);
        }
    };

    window.ontouchstart = (e) => {
        if (document.getElementById('step-game').classList.contains('hidden')) return;
        e.preventDefault(); 
        let width = window.innerWidth;
        let section = width / 4;

        for(let i=0; i<e.changedTouches.length; i++) {
            let touchX = e.changedTouches[i].clientX;
            if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(lane => hitLane(lane, false));
            else if (difficulty === 'easy') {
                if (touchX < width / 2) { hitLane(0, false); hitLane(1, false); }
                else { hitLane(2, false); hitLane(3, false); }
            } else {
                let lane = Math.floor(touchX / section);
                if (lane >= 0 && lane <= 3) hitLane(lane, false); // 點擊視為普通音符
            }
        }
    };
}

async function loadAndPlaySong() {
    try {
        const songId = songs[currentSongIndex].id;
        const response = await fetch(`songs/${songId}/map.json`);
        if (!response.ok) throw new Error("找不到譜面");
        const songData = await response.json();
        currentNotesData = JSON.parse(JSON.stringify(songData.notes)); 
        
        gameStartTime = audioCtx.currentTime + 2.0; 
        requestAnimationFrame(updateGameLoop);
    } catch (error) {
        console.error(error);
        alert("無法讀取 map.json！");
    }
}

function updateGameLoop() {
    if (document.getElementById('step-game').classList.contains('hidden')) return;

    let gameTime = audioCtx.currentTime - (gameConfig.latency / 1000) - gameStartTime;
    const lanes = document.querySelectorAll('.lane');

    currentNotesData.forEach(note => {
        if (!note.element && (note.time - gameTime) <= NOTE_SPEED) {
            let noteEl = document.createElement('div');
            noteEl.className = 'note';
            if (note.type === 'slide') noteEl.classList.add('slide'); // 加上粉色滑動外觀
            lanes[note.lane].appendChild(noteEl);
            note.element = noteEl;
        }

        if (note.element && !note.hit) {
            let progress = 1 - ((note.time - gameTime) / NOTE_SPEED);
            note.element.style.top = `${progress * 85}%`;

            if ((gameTime - note.time) > 0.18) {
                note.hit = true; stats.C++; showJudgement('C');
                note.element.style.opacity = '0.3'; 
            }
        }
    });

    let unhitNotes = currentNotesData.filter(note => !note.hit);
    
    if (unhitNotes.length > 0) {
        requestAnimationFrame(updateGameLoop);
    } else {
        if(!gameOverTimer) gameOverTimer = setTimeout(showScoreboard, 2000);
    }
}

function showScoreboard() {
    document.getElementById('res-s').innerText = stats.S;
    document.getElementById('res-a').innerText = stats.A;
    document.getElementById('res-c').innerText = stats.C;
    document.getElementById('res-max').innerText = stats.maxCombo;
    showScene('step-result');
}

function backToMenu() {
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }
    document.querySelectorAll('.note').forEach(el => el.remove());
    showScene('step-song-select');
}
