let gameConfig = { device: '', hasHeadphones: false, latency: 0 };
let audioCtx;
let nextBeatTime = 0; let beatInterval = 0.5; let audioTimerId; let animationFrameId;

let currentNotesData = [];
let gameStartTime = 0;
let gameOverTimer = null; // 控制結算的計時器
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

// 階段一、二、三：初始化與延遲校正
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

// 階段四：歌曲選單
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

// ======== 修改重點 2：徹底修復第二局凍結 Bug ========
function startGame(difficulty) {
    closeModal(); 
    showScene('step-game');
    
    // 嚴格清空上一局的計時器，防止卡在結算畫面前
    if (gameOverTimer) {
        clearTimeout(gameOverTimer);
        gameOverTimer = null;
    }
    
    stats = { S: 0, A: 0, C: 0, combo: 0, maxCombo: 0 };
    updateComboDisplay();

    const ruleToast = document.getElementById('rule-toast');
    if (difficulty === 'extreme-easy') ruleToast.innerText = "【極度簡單】 按任意鍵";
    else if (difficulty === 'easy') ruleToast.innerText = "【簡單模式】 左(F) / 右(J)";
    else if (difficulty === 'normal') ruleToast.innerText = "【普通模式】 D, F, J, K";
    
    ruleToast.classList.remove('hidden'); ruleToast.style.animation = 'none';
    void ruleToast.offsetWidth; ruleToast.style.animation = 'fadeOutUp 2.5s forwards';

    setupGameplayInput(difficulty);
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

// ======== 修改重點 3：全新高精度判定系統 ========
function hitLane(laneIndex) {
    const pad = document.getElementById(`pad-${laneIndex}`);
    if (pad) {
        pad.classList.add('active');
        playPing(frequencies[laneIndex], audioCtx.currentTime, 0.1);
        setTimeout(() => pad.classList.remove('active'), 100);
    }

    let gameTime = audioCtx.currentTime - (gameConfig.latency / 1000) - gameStartTime;
    
    // 步驟 1：找出在有效判定區間內 (±0.2秒內) 且還沒被打擊過的所有音符
    let validNotes = currentNotesData.filter(n => !n.hit && n.lane === laneIndex && Math.abs(n.time - gameTime) <= 0.2);
    
    if (validNotes.length > 0) {
        // 步驟 2：從有效音符中，找出「距離當前時間最近」的那一顆，保證不會抓到其他顆
        let target = validNotes.sort((a, b) => Math.abs(a.time - gameTime) - Math.abs(b.time - gameTime))[0];
        
        let offset = Math.abs(target.time - gameTime);
        target.hit = true; 

        if (offset <= 0.08) {
            stats.S++; showJudgement('S+');
        } else {
            stats.A++; showJudgement('A');
        }
        
        if (target.element) target.element.style.display = 'none'; // 擊中瞬間消失
    }
}

function setupGameplayInput(difficulty) {
    window.onkeydown = (e) => {
        if (document.getElementById('step-game').classList.contains('hidden') || e.repeat) return;
        const key = e.key.toLowerCase();
        if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(i => hitLane(i));
        else if (difficulty === 'easy') {
            if (key === 'f') { hitLane(0); hitLane(1); }
            if (key === 'j') { hitLane(2); hitLane(3); }
        } else if (difficulty === 'normal') {
            if (key === 'd') hitLane(0); if (key === 'f') hitLane(1);
            if (key === 'j') hitLane(2); if (key === 'k') hitLane(3);
        }
    };

    window.ontouchstart = (e) => {
        if (document.getElementById('step-game').classList.contains('hidden')) return;
        e.preventDefault(); 
        let width = window.innerWidth;

        for(let i=0; i<e.changedTouches.length; i++) {
            let touchX = e.changedTouches[i].clientX;
            if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(lane => hitLane(lane));
            else if (difficulty === 'easy') {
                if (touchX < width / 2) { hitLane(0); hitLane(1); }
                else { hitLane(2); hitLane(3); }
            } else if (difficulty === 'normal') {
                let section = width / 4;
                if (touchX < section) hitLane(0);
                else if (touchX < section * 2) hitLane(1);
                else if (touchX < section * 3) hitLane(2);
                else hitLane(3);
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

// 畫面渲染循環
function updateGameLoop() {
    if (document.getElementById('step-game').classList.contains('hidden')) return;

    let gameTime = audioCtx.currentTime - (gameConfig.latency / 1000) - gameStartTime;
    const lanes = document.querySelectorAll('.lane');

    currentNotesData.forEach(note => {
        if (!note.element && (note.time - gameTime) <= NOTE_SPEED) {
            let noteEl = document.createElement('div');
            noteEl.className = 'note';
            lanes[note.lane].appendChild(noteEl);
            note.element = noteEl;
        }

        if (note.element && !note.hit) {
            let progress = 1 - ((note.time - gameTime) / NOTE_SPEED);
            // 改為跟打擊墊同樣的 top: 85% 對齊法，當 progress=1 時完美重疊
            note.element.style.top = `${progress * 85}%`;

            // 如果錯過視窗 (>0.2秒)，強制判定為 C (Miss)
            if ((gameTime - note.time) > 0.2) {
                note.hit = true;
                stats.C++;
                showJudgement('C');
                note.element.style.opacity = '0.3'; 
            }
        }
    });

    let unhitNotes = currentNotesData.filter(note => !note.hit);
    
    if (unhitNotes.length > 0) {
        requestAnimationFrame(updateGameLoop);
    } else {
        // 遊戲結束，等待 2 秒顯示結算
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
    // 按下返回時，也必須徹底清空計時器
    if (gameOverTimer) {
        clearTimeout(gameOverTimer);
        gameOverTimer = null;
    }
    document.querySelectorAll('.note').forEach(el => el.remove());
    showScene('step-song-select');
}
