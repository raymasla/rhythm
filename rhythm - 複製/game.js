let gameConfig = { device: '', hasHeadphones: false, latency: 0 };
let audioCtx;
let nextBeatTime = 0; let beatInterval = 0.5; let audioTimerId; let animationFrameId;

// 遊戲下落引擎專用變數
let currentNotesData = [];
let gameStartTime = 0;
const NOTE_SPEED = 2.0; // 音符從頂端掉到底部打擊墊的時間(秒)
const frequencies = [329.63, 392.00, 440.00, 523.25]; // E4, G4, A4, C5 電子音高

const songs = [
    { id: 'etude', name: '練習曲 (Etude)' },
    { id: 'blank1', name: '??? (未解鎖)' },
    { id: 'blank2', name: '??? (未解鎖)' },
    { id: 'blank3', name: '??? (未解鎖)' }
];
let currentSongIndex = 0;

function showScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.add('hidden'));
    document.getElementById(sceneId).classList.remove('hidden');
}

// ================= 階段一與二 =================
function selectDevice(type) { gameConfig.device = type; showScene('step-audio'); }
function selectAudio(hasHeadphones) {
    gameConfig.hasHeadphones = hasHeadphones;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (hasHeadphones) { showScene('step-latency'); startSliderCalibration(); } 
    else { gameConfig.latency = 0; enterSongSelect(); }
}

// ================= 階段三：延遲校正 =================
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

// ================= 階段四：C 字型選單 =================
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
        item.style.transform = `translate(${-Math.abs(offset) * 30}px, ${offset * 90}px) scale(${scale})`;
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
window.addEventListener('touchstart', e => touchStartY = e.touches[0].clientY);
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

// ================= 階段五：遊戲核心與音符下落引擎 =================
function startGame(difficulty) {
    closeModal(); showScene('step-game');
    const ruleToast = document.getElementById('rule-toast');
    
    if (difficulty === 'extreme-easy') ruleToast.innerText = "【極度簡單】 按任意鍵 / 點擊螢幕任何處";
    else if (difficulty === 'easy') ruleToast.innerText = "【簡單模式】 雙鍵控制 (F 與 J)";
    else if (difficulty === 'normal') ruleToast.innerText = "【普通模式】 四鍵控制 (D, F, J, K)";
    
    ruleToast.classList.remove('hidden'); ruleToast.style.animation = 'none';
    void ruleToast.offsetWidth; ruleToast.style.animation = 'fadeOutUp 2.5s forwards';

    setupGameplayInput(difficulty);
    loadAndPlaySong(); // 啟動讀取與下落引擎
}

function activateLane(laneIndex) {
    const pad = document.getElementById(`pad-${laneIndex}`);
    if (pad) {
        pad.classList.add('active');
        playPing(frequencies[laneIndex], audioCtx.currentTime, 0.1);
        setTimeout(() => pad.classList.remove('active'), 100);
    }
}

function setupGameplayInput(difficulty) {
    window.onkeydown = (e) => {
        if (document.getElementById('step-game').classList.contains('hidden')) return;
        const key = e.key.toLowerCase();
        
        if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(i => activateLane(i));
        else if (difficulty === 'easy') {
            if (key === 'f') { activateLane(0); activateLane(1); }
            if (key === 'j') { activateLane(2); activateLane(3); }
        } else if (difficulty === 'normal') {
            if (key === 'd') activateLane(0);
            if (key === 'f') activateLane(1);
            if (key === 'j') activateLane(2);
            if (key === 'k') activateLane(3);
        }
    };

    window.ontouchstart = (e) => {
        if (document.getElementById('step-game').classList.contains('hidden')) return;
        let touchX = e.touches[0].clientX; let width = window.innerWidth;

        if (difficulty === 'extreme-easy') [0, 1, 2, 3].forEach(i => activateLane(i));
        else if (difficulty === 'easy') {
            if (touchX < width / 2) { activateLane(0); activateLane(1); }
            else { activateLane(2); activateLane(3); }
        } else if (difficulty === 'normal') {
            let section = width / 4;
            if (touchX < section) activateLane(0);
            else if (touchX < section * 2) activateLane(1);
            else if (touchX < section * 3) activateLane(2);
            else activateLane(3);
        }
    };
}

// 讀取相對路徑的譜面資料
async function loadAndPlaySong() {
    try {
        const songId = songs[currentSongIndex].id;
        // 這裡就是相對路徑讀取法，一定要開 Live Server 才能執行成功！
        const response = await fetch(`songs/${songId}/map.json`);
        if (!response.ok) throw new Error("找不到譜面檔案");
        
        const songData = await response.json();
        currentNotesData = JSON.parse(JSON.stringify(songData.notes)); 
        
        // 設定準備時間，2秒後音符才會掉到判定線
        gameStartTime = audioCtx.currentTime + 2.0;
        requestAnimationFrame(updateGameLoop);

    } catch (error) {
        console.error(error);
        alert("無法讀取 map.json！請確認你是否有使用 VS Code 的 Live Server。");
    }
}

// 畫面渲染：音符掉落邏輯
function updateGameLoop() {
    if (document.getElementById('step-game').classList.contains('hidden')) return;

    let currentTime = audioCtx.currentTime - (gameConfig.latency / 1000);
    let gameTime = currentTime - gameStartTime;

    const lanes = document.querySelectorAll('.lane');

    currentNotesData.forEach(note => {
        // 音符進入準備出現的視窗
        if (!note.element && (note.time - gameTime) <= NOTE_SPEED) {
            let noteEl = document.createElement('div');
            noteEl.className = 'note';
            if (note.type === 'hold') noteEl.classList.add('hold');
            
            lanes[note.lane].appendChild(noteEl);
            note.element = noteEl;
        }

        // 更新音符高度
        if (note.element) {
            let progress = 1 - ((note.time - gameTime) / NOTE_SPEED);
            note.element.style.top = `${progress * 90}%`; // 90% 大約是打擊墊的位置

            // 掉出畫面外就清除
            if (progress > 1.1) {
                note.element.remove();
                note.hit = true; 
            }
        }
    });

    currentNotesData = currentNotesData.filter(note => !note.hit);

    if (currentNotesData.length > 0) {
        requestAnimationFrame(updateGameLoop);
    }
}