import {createRoom,wire} from './multiplayer-room.js';
import {gather,iceServers,description,copy} from './multiplayer-link.js';

/** @param {string} id */const el=id=>{const e=document.getElementById(id);if(!e)throw new Error(id);return e;};
/** @param {string} id */const input=id=>/** @type {HTMLInputElement} */(el(id));
/** @param {string} id */const button=id=>/** @type {HTMLButtonElement} */(el(id));
/** @param {string} text */function log(text){const box=el('events');box.textContent=(new Date().toLocaleTimeString()+' · '+text+'\n'+box.textContent).slice(0,6000);}
/** @param {string} text */const status=text=>{el('server-status').textContent=text;};
/** @param {string} text */const remoteStatus=text=>{el('remote-status').textContent=text;};
/** @type {ReturnType<typeof createRoom>|null} */let room=null;
/** @type {BroadcastChannel|null} */let local=null;
/** @type {Map<string,{peer:RTCPeerConnection,channel:RTCDataChannel}>} */const remotes=new Map();
/** @type {{id:string,peer:RTCPeerConnection,timer:ReturnType<typeof setTimeout>}|null} */let pending=null;
let roomId='',generation=0;
/** @type {Set<string>} */const previous=new Set();
/** @param {string} id */function closeRemote(id){const r=remotes.get(id);remotes.delete(id);r?.peer.close();}
function cancel(){generation++;if(pending){clearTimeout(pending.timer);const id=pending.id;pending=null;closeRemote(id);}input('invite-link').value='';button('invite').disabled=false;}
function stop(){generation++;room?.stop();room=null;local?.close();local=null;cancel();for(const id of remotes.keys())closeRemote(id);previous.clear();el('running').hidden=true;button('create').disabled=false;button('stop').disabled=true;status('Server stopped.');render();}
function render(){
  const body=el('roster');
  const members=room?.members;
  el('count').textContent=(members?.size||0)+' / 2';el('empty').hidden=!!members?.size;
  for(const p of members?.values()||[]){
    if(!previous.has(p.id)){previous.add(p.id);log(p.name+' joined via '+p.transport+'.');}
    let row=/** @type {HTMLTableRowElement|null} */(document.getElementById('member-'+p.id));
    if(!row){
      row=document.createElement('tr');row.id='member-'+p.id;
      for(let i=0;i<4;i++)row.appendChild(document.createElement('td'));
      const cell=document.createElement('td'),kick=document.createElement('button');kick.textContent='Kick';kick.onclick=()=>{log('Kicked '+p.name+'.');room?.kick(p.id);closeRemote(p.id);render();};cell.appendChild(kick);row.appendChild(cell);body.appendChild(row);
    }
    [p.name+' / '+p.id.slice(0,8),p.transport,Math.round(performance.now()-p.lastSeen)+' ms',p.packets+' / '+p.rejected].forEach((text,i)=>{if(row)row.cells[i].textContent=text;});
    row.querySelector('button')?.setAttribute('aria-label','Kick '+p.name);
  }
  for(const id of previous)if(!members?.has(id)){previous.delete(id);log('Pilot '+id.slice(0,8)+' disconnected.');closeRemote(id);}
  for(const row of Array.from(body.children))if(!members?.has(row.id.slice(7)))row.remove();
}
button('create').onclick=()=>{
  if(!window.BroadcastChannel){status('This browser does not support local tab connections. Use a current browser.');return;}
  if(!crypto.randomUUID){status('Open this page over HTTPS or localhost to start the server.');return;}
  roomId=crypto.randomUUID();local=new BroadcastChannel('driftworks-server-'+roomId);
  room=createRoom((id,m)=>{
    const remote=remotes.get(id);
    if(remote){if(remote.channel.readyState==='open'&&remote.channel.bufferedAmount<131072)remote.channel.send(wire(m));}
    else local?.postMessage({to:id,text:wire(m)});
  },()=>performance.now());
  local.onmessage=/** @param {MessageEvent<unknown>} e */e=>{
    const m=/** @type {unknown} */(e.data);if(!m||typeof m!=='object')return;
    const v=/** @type {Record<string,unknown>} */(m);
    if(typeof v.from==='string')room?.receive(v.from,v.text,'Local tab');
  };
  const url=new URL('flight.html',location.href);url.searchParams.set('multiplayer','1');url.searchParams.set('server',roomId);
  input('join-link').value=url.href;/** @type {HTMLAnchorElement} */(el('join')).href=url.href;
  input('public-url').value=new URL('flight.html',location.href).href;
  el('running').hidden=false;button('create').disabled=true;button('stop').disabled=false;
  status('Server running · '+roomId.slice(0,8)+' · keep this tab open.');log('Server started. Waiting for pilots.');
};
button('stop').onclick=()=>{stop();log('Server stopped.');};
button('copy-local').onclick=()=>copy(input('join-link'),status);
button('copy-invite').onclick=()=>copy(input('invite-link'),remoteStatus);
button('cancel-invite').onclick=()=>{cancel();remoteStatus('Pending invitation cancelled.');};
button('invite').onclick=async()=>{
  if(!room||pending)return;
  if(room.members.size>=2){remoteStatus('Both seats are occupied. Kick a pilot before inviting another.');return;}
  const token=generation;
  try{
    const ice=iceServers(input('ice').value),url=new URL(input('public-url').value);
    if(!/^https?:$/.test(url.protocol))throw new Error('Enter an HTTP or HTTPS client page address.');
    const id=crypto.randomUUID(),peer=new RTCPeerConnection({iceServers:ice}),channel=peer.createDataChannel('driftworks-room',{ordered:false,maxRetransmits:0});
    remotes.set(id,{peer,channel});button('invite').disabled=true;
    pending={id,peer,timer:setTimeout(()=>{cancel();remoteStatus('Invitation expired after two minutes. Create a fresh invitation.');},120000)};
    channel.onmessage=/** @param {MessageEvent<unknown>} e */e=>{const joined=room?.members.has(id);room?.receive(id,e.data,'WebRTC');if(!joined&&room?.members.has(id))remoteStatus('Remote pilot connected.');};
    channel.onopen=()=>{if(pending?.id===id){clearTimeout(pending.timer);pending=null;button('invite').disabled=false;input('invite-link').value='';}remoteStatus('Remote data channel connected. Waiting for pilot to join.');};
    channel.onclose=()=>{room?.receive(id,wire({kind:'leave'}),'WebRTC');render();};
    peer.onconnectionstatechange=()=>{if(peer.connectionState==='failed'){if(pending?.id===id)cancel();else closeRemote(id);remoteStatus('No usable route. Retry with STUN/TURN or check firewall settings.');}};
    remoteStatus('Gathering connection candidates…');
    const offer=await gather(peer,await peer.createOffer());
    if(token!==generation||pending?.id!==id)return;
    url.search='';url.searchParams.set('multiplayer','1');url.searchParams.set('server',roomId);
    url.hash=new URLSearchParams({roomInvite:JSON.stringify({id,offer,ice})}).toString();
    input('invite-link').value=url.href;remoteStatus('Send this private invitation link. Paste the pilot’s answer below within two minutes.');
  }catch(e){if(token===generation){cancel();remoteStatus(e instanceof Error?e.message:String(e));}}
};
button('apply').onclick=async()=>{
  try{if(!pending)throw new Error('Create a remote invitation first.');const p=pending;
    await p.peer.setRemoteDescription(description(input('answer').value,'answer'));
    if(pending===p){clearTimeout(p.timer);p.timer=setTimeout(()=>{cancel();remoteStatus('Connection timed out. No usable route; try STUN/TURN.');},20000);remoteStatus('Answer accepted. Connecting (20 second limit)…');}
  }catch(e){remoteStatus(e instanceof Error?e.message:String(e));}
};
setInterval(()=>{room?.tick();render();},500);
window.addEventListener('pagehide',stop);
