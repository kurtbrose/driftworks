import {message,wire,expiry} from './multiplayer-room.js';
import {pilot} from './multiplayer-model.js';
import {gather,description,iceServers,copy} from './multiplayer-link.js';
/** @typedef {ReturnType<import('./types').ExperimentModules['flightSession']['create']>} Session */
/** @param {Session} session @param {()=>{profile:number,weapon:number,model:string}} loadout */
export function mountClient(session,loadout){
  const params=new URLSearchParams(location.search),server=params.get('server')||'',id=crypto.randomUUID();
  const panel=document.createElement('details');panel.id='multiplayer-panel';panel.open=true;
  panel.innerHTML=`<summary>Server flight · <span id="net-summary">joining</span></summary>
    <p id="net-status" role="status">Looking for the server tab…</p><p id="net-stats"></p>
    <label>Pilot name <input id="pilot-name" maxlength="32"></label>
    <button id="net-join">Join / retry</button> <button id="net-reset">Disconnect</button>
    <p>Keep the server console open. Same-computer connections require the same browser profile and site address.</p>
    <div id="remote-answer" hidden><label>Your answer for the server operator<textarea id="net-out" readonly></textarea></label><button id="net-copy">Copy answer</button><p>Send this answer to the server operator to finish connecting. Invitation links expire after two minutes.</p></div>
    <p><a href="multiplayer-server.html" target="_blank" rel="noopener">Open a new server console</a></p>`;
  const style=document.createElement('style');style.textContent='#multiplayer-panel{position:fixed;z-index:60;right:12px;top:12px;width:min(360px,calc(100vw - 48px));max-height:80vh;overflow:auto;padding:16px;background:#0c222ff5;color:#dcebef;border:1px solid #52788c;border-radius:9px;font:13px/1.5 system-ui}#multiplayer-panel summary{cursor:pointer;font-weight:650}#multiplayer-panel input,#multiplayer-panel textarea{box-sizing:border-box;width:100%;background:#08151e;color:#dcebef;border:1px solid #52788c;padding:7px}#multiplayer-panel textarea{height:95px}#multiplayer-panel button{margin:10px 4px 0 0;padding:8px;cursor:pointer}#multiplayer-panel a{color:#bee8ce}';
  document.head.appendChild(style);document.body.appendChild(panel);
  /** @param {string} key */const el=key=>{const e=document.getElementById(key);if(!e)throw new Error(key);return e;};
  /** @param {string} key */const input=key=>/** @type {HTMLInputElement} */(el(key));
  /** @param {string} text */const status=text=>{el('net-status').textContent=text;};
  input('pilot-name').value='Pilot '+id.slice(0,4);
  /** @type {BroadcastChannel|null} */let local=null;
  /** @type {RTCPeerConnection|null} */let peer=null;
  /** @type {RTCDataChannel|null} */let channel=null;
  let connected=false,joining=false,guest=false,lastHeard=0,lastSent=0,lastPing=0,seq=0,sent=0,received=0,frame=-1,generation=0,started=0;
  const remoteInvite=new URLSearchParams(location.hash.slice(1)).get('roomInvite');
  if(remoteInvite)history.replaceState(null,'',location.pathname+location.search);
  /** @param {import('./multiplayer-room').Message} m */
  function send(m){const text=wire(m);if(channel?.readyState==='open'){if(channel.bufferedAmount<32768)channel.send(text);}else local?.postMessage({from:id,text});}
  /** @param {string} text */
  function disconnect(text){
    generation++;connected=joining=false;session.setRemotePilot(null);
    const old=peer;peer=null;channel=null;local?.close();local=null;old?.close();
    panel.open=true;el('net-summary').textContent='offline';el('remote-answer').hidden=true;status(text);
  }
  /** @param {unknown} raw */
  function receive(raw){
    const m=message(raw);if(!m)return;
    if(m.kind==='removed'){disconnect(typeof m.reason==='string'?m.reason:'Disconnected by server.');return;}
    if(m.kind==='welcome'||m.kind==='pong'){lastHeard=performance.now();return;}
    if(m.kind!=='world'||typeof m.frame!=='number'||!Number.isSafeInteger(m.frame)||m.frame<=frame||(m.slot!==0&&m.slot!==1))return;
    frame=m.frame;lastHeard=performance.now();received++;
    if(!connected){guest=m.slot===1;session.prepareMultiplayer(guest);connected=true;joining=false;panel.open=false;el('remote-answer').hidden=true;el('net-summary').textContent='connected';}
    const remote=pilot(m.pilot);session.setRemotePilot(remote);
    if(remote&&guest)session.snapshot().asteroid.rotation=remote.rotation;
    status('Connected to server '+server.slice(0,8)+' · seat '+(m.slot+1)+' · '+m.count+'/2 pilots. '+(typeof m.peer==='string'?'Wingmate: '+m.peer+'.':'Waiting for a wingmate.'));
  }
  async function join(){
    if(connected||joining)return;
    disconnect('Connecting to server…');joining=true;started=performance.now();frame=-1;sent=received=0;lastHeard=0;
    const token=generation;
    try{
      if(!/^[a-zA-Z0-9-]{1,80}$/.test(server))throw new Error('Invalid server link. Open a fresh link from the server console.');
      if(remoteInvite){
        if(remoteInvite.length>131072)throw new Error('Invitation is too large.');
        const raw=/** @type {unknown} */(JSON.parse(remoteInvite));
        if(!raw||typeof raw!=='object')throw new Error('Invalid invitation.');
        const invite=/** @type {Record<string,unknown>} */(raw);
        const rtc=peer=new RTCPeerConnection({iceServers:iceServers(JSON.stringify(invite.ice))});
        rtc.ondatachannel=e=>{
          if(peer!==rtc)return;channel=e.channel;
          channel.onmessage=/** @param {MessageEvent<unknown>} e */e=>{if(peer===rtc)receive(e.data);};
          channel.onopen=()=>{if(peer===rtc)send({kind:'join',name:input('pilot-name').value});};
          channel.onclose=()=>{if(peer===rtc)disconnect('Server connection closed. Request a fresh remote invitation.');};
        };
        rtc.onconnectionstatechange=()=>{if(peer===rtc&&rtc.connectionState==='failed')disconnect('No usable route to server. Ask the operator about STUN/TURN and request a fresh invitation.');};
        await rtc.setRemoteDescription(description(JSON.stringify(invite.offer),'offer'));
        const answer=await gather(rtc,await rtc.createAnswer());
        if(token!==generation)return;
        input('net-out').value=JSON.stringify(answer);el('remote-answer').hidden=false;
        status('Answer ready. Send it to the server operator, then wait for them to apply it.');
      }else{
        local=new BroadcastChannel('driftworks-server-'+server);
        local.onmessage=/** @param {MessageEvent<unknown>} e */e=>{
          const raw=/** @type {unknown} */(e.data);if(!raw||typeof raw!=='object')return;
          const v=/** @type {Record<string,unknown>} */(raw);if(v.to===id)receive(v.text);
        };
        send({kind:'join',name:input('pilot-name').value});
      }
    }catch(e){if(token===generation)disconnect(e instanceof Error?e.message:String(e));}
  }
  el('net-join').onclick=join;
  input('pilot-name').onchange=()=>{if(connected)send({kind:'join',name:input('pilot-name').value});};
  el('net-reset').onclick=()=>{send({kind:'leave'});disconnect('Disconnected. Local flight remains available.');};
  el('net-copy').onclick=()=>copy(input('net-out'),status);
  const timer=setInterval(()=>{
    const now=performance.now();
    if(joining&&now-started>(remoteInvite?120000:5000)){disconnect(remoteInvite?'Connection attempt expired. Request a fresh invitation from the server.':'No server answered. Keep its console open in the same browser profile and origin, then choose Join / retry. A local link cannot connect another computer.');return;}
    if(connected&&now-lastHeard>expiry){disconnect('Server stopped responding. Return to its console, then rejoin.');return;}
    if(connected){send({kind:'ping'});lastPing=now;}
    else if(joining&&(!remoteInvite||channel?.readyState==='open')&&now-lastPing>1000){send({kind:'join',name:input('pilot-name').value});lastPing=now;}
  },500);
  window.addEventListener('pagehide',()=>{send({kind:'leave'});disconnect('Client closed.');clearInterval(timer);});
  join();
  return {isGuest:()=>guest,
    /** @param {import('./types').Demand} demand @param {boolean} paused */
    update(demand,paused){
      const now=performance.now();if(!connected||now-lastSent<50)return;
      lastSent=now;const s=session.snapshot();
      send({kind:'state',seq:seq++,pilot:{pose:s.state,...loadout(),fire:!paused&&demand.fire,boost:!paused&&!!demand.boost,rotation:s.asteroid.rotation}});sent++;
      el('net-stats').textContent='Sent '+sent+' · received '+received+' · server heard '+Math.round(now-lastHeard)+' ms ago';
    }};
}
