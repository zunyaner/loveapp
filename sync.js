// ===== Cloud Sync Module (HTTP polling) =====
const SYNC_API='/api/sync';
let _syncVersion=0;
let _pollTimer=null;

function syncRoom(){return cfg.room||'default'}

function syncStatusSet(msg){
  const el=document.getElementById('syncStatus');
  if(el)el.textContent=msg;
}

function apiSync(method,body){
  if(!cfg.room)return Promise.resolve(null);
  const url=SYNC_API+'?room='+encodeURIComponent(syncRoom());
  return fetch(url,{
    method:method||'POST',
    headers:{'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  }).then(r=>r.ok?r.json():null).catch(()=>null);
}

// Push operations
function syncPushSettings(s){apiSync('POST',{op:'pushSettings',settings:s||cfg});}
function syncPushMemory(m){apiSync('POST',{op:'pushMemory',memory:m});}
function syncDeleteMemory(id){apiSync('POST',{op:'deleteMemory',memoryId:id});}
function syncPushVoiceMeta(v){apiSync('POST',{op:'pushVoiceMeta',voice:v});}
function syncDeleteVoice(id){apiSync('POST',{op:'deleteVoice',voiceId:id});}

// Pull latest from server
function syncPull(){
  if(!cfg.room)return Promise.resolve();
  return apiSync('GET').then(resp=>{
    if(!resp)return;
    if(resp.version<=_syncVersion)return;
    _syncVersion=resp.version||0;
    if(resp.settings)mergeRemoteSettings(resp.settings);
    if(Array.isArray(resp.memories))mergeRemoteMemories(resp.memories);
    if(Array.isArray(resp.voiceMeta))mergeRemoteVoiceMeta(resp.voiceMeta);
  });
}

function mergeRemoteSettings(remote){
  const local={...cfg};
  let changed=false;
  for(const k in remote){if(local[k]!==remote[k])changed=true}
  if(!changed)return;
  Object.assign(cfg,remote);
  saveSettings(cfg);
  applySettings();updateDays();updateClocks();updateCountdown();
  updateSky();drawMap();updateWeather();startSeason();renderMeetupPlace();
  syncStatusSet('📥 已同步设置');
}

function mergeRemoteMemories(remoteArr){
  const local=loadMemories();
  const seen=new Set(local.map(m=>m.id));
  let added=0;
  remoteArr.forEach(m=>{if(m&&m.id&&!seen.has(m.id)){local.push(m);seen.add(m.id);added++}});
  if(added>0){saveMemories(local);renderMemories();syncStatusSet('📥 新增 '+added+' 条回忆');}
}

function mergeRemoteVoiceMeta(remoteArr){
  try{localStorage.setItem('remoteVoiceIds',JSON.stringify(remoteArr.map(v=>v.id)))}catch(_){}
  if(remoteArr.length>0)syncStatusSet('📥 同步了 '+remoteArr.length+' 条语音信息');
}

// Initialize sync
function wsConnect(){
  if(!cfg.room)return;
  _syncVersion=0;
  syncPull().then(()=>{syncStatusSet('🟢 同步中...')});
}

function wsStartPing(){
  if(_pollTimer)clearInterval(_pollTimer);
  _pollTimer=setInterval(()=>{syncPull();},10000);
}

function syncInit(){
  if(cfg.room){wsConnect();wsStartPing()}
}

// Detect room change and reconnect
setInterval(()=>{
  const currentRoom=localStorage.getItem('room')||'';
  if(currentRoom!==cfg.room){
    cfg.room=currentRoom;
    if(cfg.room){wsConnect();wsStartPing()}
  }
},10000);
