// =====================
//  game.js (fixed full)
//  - スマホは画面固定（PCは従来通り）
//  - ハート取得: 最大体力 +1（その場で満タン）
//  - コイン10枚: 現在体力 +1（上限は超えない）
//  - 二段ジャンプ / 徐々にスピードUP / 昼夜ブレンド
//  - 画像は「リポジトリ直下」に配置想定
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
  coin:    'coin.png',
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

const START_MAX_LIVES = 3;  // 初期の最大体力
const MAX_LIVES_CAP   = 10; // 最大体力の上限

let player = { x: 60, y: 300, w: BASE_SIZE, h: BASE_SIZE, dy: 0, jumpsLeft: 2 };
let obstacles = []; // spiders
let items = [];     // coins/hearts

let frame = 0;
let score = 0;
let coins = 0;
let maxLives = START_MAX_LIVES; // 最大体力
let lives    = maxLives;        // 現在体力
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
  obstacles = []; items = []; frame = 0; score = 0; coins = 0;
  maxLives = START_MAX_LIVES;
  lives    = maxLives;
  gameOver = false; speed = 5; t = 0; bgScroll = 0;
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

  // spawn
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
  if (frame % 180 === 0) items.push({type:'coin',  x: W, y: 260 - Math.random()*120, r: 16});
  if (frame % 1200 === 0) items.push({type:'heart', x: W, y: 240 - Math.random()*100, r: 16});//20秒に1回（600→1200)
  

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
      if (it.type==='coin'){
        // スコア & コインカウント
        score += 100;
        coins++;
        // 10枚で現在体力+1（上限は最大体力まで）
        if (coins >= 10){
          coins = 0;
          lives = clamp(lives + 1, 0, maxLives);
        }
      }
      if (it.type==='heart'){
        // 最大体力 +1（上限あり）& 現在体力を満タンに
        maxLives = clamp(maxLives + 1, 1, MAX_LIVES_CAP);
        lives    = maxLives;
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
  // blend between day & night
  const phase = (Math.sin(t/300)+1)/2; // 0..1
  const x1 = -bgScroll, x2 = x1 + W;
  // day
  ctx.drawImage(imgDay, x1, 0, W, H);
  ctx.drawImage(imgDay, x2, 0, W, H);
  // night overlay
  ctx.save();
  ctx.globalAlpha = 1 - phase;
  ctx.drawImage(imgNight, x1, 0, W, H);
  ctx.drawImage(imgNight, x2, 0, W, H);
  ctx.restore();
}

function drawSprites(assets){
  // ground strip
  ctx.fillStyle = '#2e6b2e';
  ctx.fillRect(0, GROUND_Y, W, H-GROUND_Y);

  // player
  ctx.drawImage(assets.player, player.x, player.y, player.w, player.h);

  // spiders
  for (const o of obstacles){
    // thread
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.x + o.w/2, 0); ctx.lineTo(o.x + o.w/2, o.y); ctx.stroke();
    ctx.drawImage(assets.spider, o.x, o.y, o.w, o.h);
  }

  // items
  for (const it of items){
    if (it.type==='coin')  ctx.drawImage(assets.coin,  it.x, it.y, it.r*2, it.r*2);
    if (it.type==='heart') ctx.drawImage(assets.heart, it.x, it.y, it.r*2, it.r*2);
  }
}

function drawUI(){
  ctx.fillStyle = '#000'; ctx.font = '18px Arial';
  ctx.fillText('Score: '+score, 12, 26);
  ctx.fillText('Coins: '+coins+'/10', 12, 48);

  // hearts: 最大体力＝薄枠、現在体力＝濃い赤
  const baseX = 200;
  for (let i = 0; i < maxLives; i++){
    const x = baseX + i * 18;
    // 空スロット（薄い赤）
    ctx.beginPath();
    ctx.arc(x, 20, 7, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(230,75,75,0.25)';
    ctx.fill();
    // 現在体力
    if (i < lives){
      ctx.beginPath();
      ctx.arc(x, 20, 7, 0, Math.PI*2);
      ctx.fillStyle = '#e64b4b';
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
  const imgs = await loadAssets();
  function loop(){
    update();
    ctx.clearRect(0,0,W,H);
    drawBackground(imgs.bgDay, imgs.bgNight);
    drawSprites(imgs);
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
