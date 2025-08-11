// =====================
//  game.js (meat & max HP, heart by score)
//  - スマホは画面固定（PCは従来通り）
//  - ハート: 最大体力 +1（上限10）& その場で満タン
//  - ハート出現: ランダムではなくスコア到達で1個だけ出現
//  - お肉10個: 現在体力 +1（最大体力まで）
//  - 二段ジャンプ / 徐々にスピードUP / 昼夜ブレンド
//  - 画像はリポジトリ直下想定
// =====================

// --- Mobile: lock scrolling on phones only ---
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
if (isMobile) {
  document.addEventListener('touchstart', e => e.preventDefault(), { passive:false });
  document.addEventListener('touchmove',  e => e.preventDefault(), { passive:false });
  document.addEventListener('gesturestart', e => e.preventDefault());
}

// --- Canvas setup ---
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

// --- Assets (root files) ---
const ASSETS = {
  bgDay:   'bg_day.png',
  bgNight: 'bg_night.png',
  player:  'player.png',
  meat:    'meat.png',   // ← コインの代わり
  heart:   'heart.png',
  spider:  'spider.png',
};

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('load error: ' + src));
    img.src = src;
  });
}
async function loadAssets(){
  const keys = Object.keys(ASSETS);
  const imgs = await Promise.all(keys.map(k => loadImage(ASSETS[k])));
  const out = {};
  keys.forEach((k,i)=> out[k] = imgs[i]);
  return out;
}

// --- Game constants/state ---
const W = 800, H = 400;
const GROUND_Y = 350;
const BASE_SIZE = 64;
const HITBOX_SCALE = 0.82;

const START_MAX_LIVES = 3;   // 初期最大体力
const MAX_LIVES_CAP   = 10;  // 最大体力上限

// ハートの“スコア出現”制御
let nextHeartScore      = 3000; // 最初はスコア3000で1個出現（≈50秒目安）
let lastHeartScore      = 0;    // 直近でハートを出したスコア
const HEART_STEP_BASE   = 3500; // 次回必要スコアの基本加算
const HEART_STEP_GROWTH = 1.15; // 必要スコアを少しずつ重くする係数
const HEART_FAILSAFE_GAP = 6000; // 救済: このスコア間ハート無し＆ライフ1以下なら出す

let player = { x: 60, y: 300, w: BASE_SIZE, h: BASE_SIZE, dy: 0, jumpsLeft: 2 };
let obstacles = []; // spiders
let items = [];     // meat/heart

let frame = 0;
let score = 0;
let meats = 0;              // お肉カウント（10で回復）
let maxLives = START_MAX_LIVES;
let lives    = maxLives;
let gameOver = false;
let speed = 5;

let t = 0;             // for day/night blend
let bgScroll = 0;      // background scroll

// --- Input ---
function jump(){
  if (gameOver) return;
  if (player.jumpsLeft > 0){
    player.dy = -12.5;
    player.jumpsLeft--;
  }
}
document.addEventListener('keydown', (e)=>{
  if (e.code === 'Space'){ e.preventDefault(); jump(); }
  if (gameOver && e.code === 'Enter') resetGame();
});
cvs.addEventListener('pointerdown', ()=>{
  if (gameOver){ resetGame(); return; }
  jump();
});

// --- Helpers ---
function aabb(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx + bw && ax + aw > bx &&
         ay < by + bh && ay + ah > by;
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function resetGame(){
  player.y = 300; player.dy = 0; player.jumpsLeft = 2;
  obstacles = []; items = []; frame = 0; score = 0; meats = 0;
  maxLives = START_MAX_LIVES; lives = maxLives;
  gameOver = false; speed = 5; t = 0; bgScroll = 0;
  nextHeartScore = 3000; lastHeartScore = 0;
}

// --- Update ---
function update(){
  if (gameOver) return;

  // physics
  player.dy += 0.65;
  player.y  += player.dy;
  const groundY = 300 + (BASE_SIZE - player.h);
  if (player.y >= groundY){
    player.y = groundY; player.dy = 0; player.jumpsLeft = 2;
  }

  frame++;

  // spawn spiders
  if (frame % 70 === 0){
    const size = 48;
    const mode = Math.random() < 0.6 ? 'swing' : 'drop';
    const baseLen = 100 + Math.floor(Math.random()*160);
    obstacles.push({
      type:'spider', mode,
      x: W, y: baseLen, w: size, h: size,
      t: Math.random()*Math.PI*2,
      amp: 22 + Math.random()*24,
      vy: 4 + Math.random()*2
    });
  }

  // spawn meat（旧コイン）
  if (frame % 180 === 0) {
    items.push({type:'meat',  x: W, y: 260 - Math.random()*120, r: 16});
  }

  // --- heart spawn by score rule ---
  const heartOnScreen = items.some(it => it.type === 'heart');

  // 通常出現: スコア到達 & 画面にハート無し & まだ満タンじゃない
  if (!heartOnScreen && lives < maxLives && score >= nextHeartScore) {
    items.push({ type:'heart', x: W, y: 240 - Math.random()*100, r: 16 });
    lastHeartScore = score;
    nextHeartScore = Math.floor(nextHeartScore + HEART_STEP_BASE * HEART_STEP_GROWTH);
  }

  // ピンチ救済: ライフ1以下 & 長らく出てない & 画面にハート無し
  if (!heartOnScreen && lives <= 1 && (score - lastHeartScore) > HEART_FAILSAFE_GAP) {
    items.push({ type:'heart', x: W, y: 240 - Math.random()*100, r: 16 });
    lastHeartScore = score;
    nextHeartScore = Math.floor(nextHeartScore + HEART_STEP_BASE * HEART_STEP_GROWTH);
  }

  // move obstacles
  for (let i=0;i<obstacles.length;i++){
    const o = obstacles[i];
    o.x -= speed;
    if (o.type==='spider'){
      if (o.mode==='swing'){ o.t += 0.08; o.y += Math.sin(o.t)*0.6; o.x += Math.sin(o.t*0.8)*0.6; }
      else if (o.mode==='drop'){ o.y += o.vy; if (o.y>GROUND_Y- o.h) o.y = GROUND_Y- o.h; }
    }
    const pw = player.w * HITBOX_SCALE, ph = player.h * HITBOX_SCALE;
    const px = player.x + (player.w - pw)/2, py = player.y + (player.h - ph)/2;
    if (aabb(px,py,pw,ph, o.x,o.y,o.w,o.h)){
      lives--; obstacles.splice(i,1); i--;
      if (lives<=0) gameOver = true;
      continue;
    }
  }

  // move items
  for (let i=0;i<items.length;i++){
    const it = items[i]; it.x -= speed;
    const pw = player.w * HITBOX_SCALE, ph = player.h * HITBOX_SCALE;
    const px = player.x + (player.w - pw)/2, py = player.y + (player.h - ph)/2;

    if (aabb(px,py,pw,ph, it.x, it.y, it.r*2, it.r*2)){
      if (it.type==='meat'){              // お肉
        score += 100;
        meats++;
        if (meats >= 10){
          meats = 0;
          if (lives < maxLives) lives++;  // 上限は最大体力まで
        }
      }
      if (it.type==='heart'){             // ハート
        maxLives = clamp(maxLives + 1, 1, MAX_LIVES_CAP); // 最大体力+1（上限10）
        lives    = maxLives;                               // その場で満タン
      }
      items.splice(i,1); i--;
      continue;
    }
  }

  obstacles = obstacles.filter(o => o.x + o.w > 0);
  items     = items.filter(it => it.x + it.r*2 > 0);

  // world
  score++; t++;
  bgScroll = (bgScroll + speed*0.4) % W; // slow scroll
  if (frame % 300 === 0) speed += 0.2;
}

// --- Draw ---
function drawBackground(imgDay, imgNight){
  // スクロールは整数に（サブピクセル回避）
  const s  = (bgScroll | 0);
  const x1 = -s;
  const x2 = x1 + W;

  // 端の1pxを切り落として、重なり／隙間ゼロで貼り合わせる
  const srcW = W - 1; // 右端1pxカット

  // --- Day ---
  ctx.drawImage(imgDay,   0, 0, srcW, H, x1, 0, W, H);   // 左タイル: 左端～W-1px
  ctx.drawImage(imgDay,   1, 0, srcW, H, x2, 0, W, H);   // 右タイル: 1px～W

  // --- Night blend ---
  const phase = (Math.sin(t/300)+1)/2; // 0..1
  ctx.save();
  ctx.globalAlpha = 1 - phase;
  ctx.drawImage(imgNight, 0, 0, srcW, H, x1, 0, W, H);
  ctx.drawImage(imgNight, 1, 0, srcW, H, x2, 0, W, H);
  ctx.restore();
}

//function drawBackground(imgDay, imgNight){
  //const phase = (Math.sin(t/300)+1)/2; // 0..1
  //const x1 = -bgScroll, x2 = x1 + W;
  //ctx.drawImage(imgDay, x1, 0, W, H);
  //ctx.drawImage(imgDay, x2, 0, W, H);
  //ctx.save();
  //ctx.globalAlpha = 1 - phase;
  //ctx.drawImage(imgNight, x1, 0, W, H);
  //ctx.drawImage(imgNight, x2, 0, W, H);
  //ctx.restore();
//}

function drawSprites(assets){
  ctx.fillStyle = '#2e6b2e';
  ctx.fillRect(0, GROUND_Y, W, H-GROUND_Y);

  ctx.drawImage(assets.player, player.x, player.y, player.w, player.h);

  for (const o of obstacles){
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.x + o.w/2, 0); ctx.lineTo(o.x + o.w/2, o.y); ctx.stroke();
    ctx.drawImage(assets.spider, o.x, o.y, o.w, o.h);
  }

  for (const it of items){
    if (it.type==='meat')  ctx.drawImage(assets.meat,  it.x, it.y, it.r*2, it.r*2);
    if (it.type==='heart') ctx.drawImage(assets.heart, it.x, it.y, it.r*2, it.r*2);
  }
}

function drawUI(){
  ctx.fillStyle = '#000'; ctx.font = '18px Arial';
  ctx.fillText('Score: '+score, 12, 26);
  ctx.fillText('お肉: '+meats+'/10', 12, 48);
  // hearts: 最大体力＝薄枠、現在体力＝濃い赤
  const baseX = 200;
  for (let i = 0; i < maxLives; i++){
    const x = baseX + i * 18;
    ctx.beginPath();
    ctx.arc(x, 20, 7, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(230,75,75,0.25)'; // 空スロット
    ctx.fill();
    if (i < lives){
      ctx.beginPath();
      ctx.arc(x, 20, 7, 0, Math.PI*2);
      ctx.fillStyle = '#e64b4b';            // 現在体力
      ctx.fill();
    }
  }

  if (gameOver){
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#fff'; ctx.font = '36px Arial';
    ctx.fillText('GAME OVER', W/2 - 110, H/2);
    ctx.font = '18px Arial';
    ctx.fillText('Enter/タップでリスタート', W/2 - 120, H/2 + 34);
  }
}

// --- Main Loop ---
async function main(){
  const assets = await loadAssets();
  function loop(){
    update();
    ctx.clearRect(0,0,W,H);
    drawBackground(assets.bgDay, assets.bgNight);
    drawSprites(assets);
    drawUI();
    requestAnimationFrame(loop);
  }
  loop();
}

main().catch(err=>{
  console.error(err);
  ctx.fillStyle = 'red';
  ctx.font = '16px monospace';
  ctx.fillText('Asset load error. Check file paths.', 10, 24);
});
