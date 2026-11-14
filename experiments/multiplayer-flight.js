import {protocol,connectionTimeout,decode,receiver} from './multiplayer-model.js';
import {mountClient} from './multiplayer-client.js';
/** @typedef {ReturnType<import('./types').ExperimentModules['flightSession']['create']>} Session */
/** @typedef {import('./multiplayer-model').RemotePilot} RemotePilot */
/** @param {Session} session @param {()=>{profile:number,weapon:number,model:string}} loadout @param {import('./multiplayer-client').FlightActions} [actions] */
export function mount(session,loadout,actions) {
  if(new URLSearchParams(location.search).has('server'))return mountClient(session,loadout,actions);
  const panel=document.createElement('details');panel.id='multiplayer-panel';panel.open=true;
  panel.innerHTML=`<summary>Multiplayer · <span id="net-summary">offline</span></summary>
    <p>Two real fighters in the flight game. Fly while connecting; Esc returns to these controls.</p>
    <p>1. Host creates an offer. 2. Guest applies it and sends the answer back. 3. Host applies that answer.</p>
    <button id="net-host">Create host offer</button> <button id="net-guest">Join as guest</button>
    <label for="net-in">Received connection text</label><textarea id="net-in" spellcheck="false"></textarea>
    <button id="net-apply" disabled>Apply received text</button>
    <label for="net-out">Your connection text</label><textarea id="net-out" readonly spellcheck="false"></textarea>
    <button id="net-copy">Copy text</button> <button id="net-reset">Disconnect / retry</button>
    <p id="net-status" role="status">Choose host or guest. Flight works without a connection.</p>
    <p id="net-stats"></p>
    <details><summary>Network options</summary><p>Direct connections can fail across routers or firewalls. Optionally supply your own STUN/TURN configuration below before creating a connection. A TURN relay is needed when direct traffic is blocked. Both players must configure their network options separately. No external service is contacted by default.</p>
    <label for="net-ice">ICE servers (JSON array)</label><textarea id="net-ice" spellcheck="false" placeholder='[{"urls":"turn:your-relay:3478","username":"…","credential":"…"}]'>[]</textarea>
    <p>Relay credentials stay in this tab. Connection text includes network information; share only with your wingmate.</p></details>`;
  const style=document.createElement('style');style.textContent='#multiplayer-panel{position:fixed;z-index:60;right:12px;top:12px;width:min(370px,calc(100vw - 24px));max-height:85vh;overflow:auto;background:#0d202ef2;border:1px solid #52788c;border-radius:9px;padding:12px;color:#d9edf2;font:13px/1.5 system-ui}#multiplayer-panel summary{cursor:pointer;font-weight:650}#multiplayer-panel p{margin:10px 0}#multiplayer-panel label{display:block;margin-top:8px}#multiplayer-panel textarea{display:block;box-sizing:border-box;width:100%;height:65px;resize:vertical;background:#09151e;color:#d9edf2;border:1px solid #52788c;font:11px monospace}#multiplayer-panel button{margin:7px 4px 0 0;padding:7px;cursor:pointer}#net-status{color:#a2e5c4}#net-stats{font:11px monospace}';
  document.head.appendChild(style);document.body.appendChild(panel);
  /** @param {string} id */const element=id=>{const el=document.getElementById(id);if(!el)throw new Error(id);return el;};
  /** @param {string} id */const area=id=>/** @type {HTMLTextAreaElement} */(element(id));
  /** @param {string} id */const button=id=>/** @type {HTMLButtonElement} */(element(id));
  /** @param {string} text */const status=text=>{element('net-status').textContent=text;};
  /** @type {RTCPeerConnection|null} */let peer=null;
  /** @type {RTCDataChannel|null} */let channel=null;
  let role='',sequence=0,read=receiver(),connected=false,busy=false,generation=0;
  let sent=0,received=0,lastReceived=0,lastSent=0;
  /** @type {RemotePilot|null} */let remote=null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */let deadline;
  /** @param {string} text */
  function reset(text='Disconnected. Choose host or guest to retry. Your flight continues.') {
    generation++;clearTimeout(deadline);deadline=undefined;
    const old=peer;peer=null;channel=null;connected=false;busy=false;remote=null;session.setRemotePilot(null);
    if(old){old.onconnectionstatechange=null;old.oniceconnectionstatechange=null;old.close();}
    button('net-host').disabled=button('net-guest').disabled=false;button('net-apply').disabled=true;
    area('net-out').value='';area('net-in').value='';element('net-summary').textContent='offline';status(text);
  }
  /** @param {number} ms @param {string} text */
  function timeout(ms,text){clearTimeout(deadline);deadline=setTimeout(()=>reset(text),ms);}
  /** @param {RTCPeerConnection} pc */
  function reportFailure(pc) {
    if(pc!==peer)return;
    reset('Connection failed: no usable route between browsers. Try both devices on the same LAN, or configure a STUN/TURN service under Network options and retry. Flight remains playable.');
  }
  /** @param {RTCDataChannel} dc @param {RTCPeerConnection} pc */
  function attach(dc,pc){
    if(pc!==peer||channel){dc.close();return;}channel=dc;
    dc.onopen=()=>{
      if(pc!==peer)return;connected=true;clearTimeout(deadline);lastReceived=performance.now();
      element('net-summary').textContent='connected as '+role;
      status('Connected. Start / resume flight in both windows. Your wingmate starts 90 m ahead.');panel.open=false;
    };
    dc.onclose=()=>{if(pc===peer)reset('Wingmate disconnected. Your flight continues. Choose host or guest to reconnect.');};
    dc.onerror=()=>{if(pc===peer)reportFailure(pc);};
    dc.onmessage=/** @param {MessageEvent<unknown>} e */e=>{
      if(pc!==peer)return;const p=read.read(e.data);if(!p)return;
      remote=p;lastReceived=performance.now();received++;session.setRemotePilot(p);
      if(role==='guest')session.snapshot().asteroid.rotation=p.rotation;
    };
  }
  /** @returns {RTCConfiguration} */
  function configuration(){
    const raw=/** @type {unknown} */(JSON.parse(area('net-ice').value||'[]'));
    const isList=/** @param {unknown} v @returns {boolean} */v=>Array.isArray(v);
    if(!isList(raw))throw new Error('ICE servers must be a JSON array.');
    // Browser validates each server entry; never store or echo relay credentials.
    return {iceServers:/** @type {RTCIceServer[]} */(raw)};
  }
  /** @param {string} next */
  function start(next){
    if(!window.RTCPeerConnection)throw new Error('WebRTC is unavailable in this browser.');
    const config=configuration();if(peer)throw new Error('Disconnect before starting a new connection.');role=next;sequence=sent=received=0;read=receiver();
    session.prepareMultiplayer(role==='guest');
    const pc=peer=new RTCPeerConnection(config);
    button('net-host').disabled=button('net-guest').disabled=true;button('net-apply').disabled=false;
    pc.ondatachannel=e=>attach(e.channel,pc);
    pc.onconnectionstatechange=()=>{if(pc===peer&&(pc.connectionState==='failed'||pc.connectionState==='closed'))reportFailure(pc);};
    pc.oniceconnectionstatechange=()=>{if(pc===peer&&pc.iceConnectionState==='failed')reportFailure(pc);};
    if(role==='host')attach(pc.createDataChannel(protocol,{ordered:false,maxRetransmits:0}),pc);
    return pc;
  }
  /** @param {RTCPeerConnection} pc @param {RTCSessionDescriptionInit} description */
  async function local(pc,description){
    await pc.setLocalDescription(description);
    if(pc.iceGatheringState!=='complete')await new Promise(/** @param {(value:void)=>void} resolve */(resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(new Error('Gathering connection candidates timed out. Disconnect / retry, or check Network options.'));},10000);
      const check=()=>{if(pc.iceGatheringState==='complete'){cleanup();resolve();}};
      const cleanup=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);};
      pc.addEventListener('icegatheringstatechange',check);check();
    });
    if(pc!==peer||!pc.localDescription)return;
    area('net-out').value=JSON.stringify({protocol,type:pc.localDescription.type,sdp:pc.localDescription.sdp});
    if(role==='guest'&&!connected){
      status('Answer ready. Send it to the host and have them apply it. Waiting up to 60 seconds; your flight is still playable.');
      timeout(60000,'No connection after 60 seconds. Confirm the host applied your answer, then retry. If it still fails, use Network options to configure STUN/TURN.');
    }else if(!connected)status('Offer ready. Send it to your guest, then paste their answer here.');
  }
  /** @param {()=>Promise<void>} fn */
  async function action(fn){
    if(busy)return;busy=true;const token=generation;
    try{await fn();}catch(e){if(token===generation)status(e instanceof Error?e.message:String(e));}
    finally{busy=false;}
  }
  button('net-host').onclick=()=>action(async()=>{const pc=start('host');status('Gathering connection candidates…');await local(pc,await pc.createOffer());});
  button('net-guest').onclick=()=>action(async()=>{start('guest');status('Paste the host offer and apply it. You can start flying now.');});
  button('net-apply').onclick=()=>action(async()=>{
    const pc=peer,m=decode(area('net-in').value,65536),type=role==='guest'?'offer':'answer';
    if(!pc||!m||m.type!==type||typeof m.sdp!=='string')throw new Error('Expected a flight multiplayer '+type+'. Ask your wingmate for fresh connection text.');
    if(pc.remoteDescription)throw new Error('Connection text already applied. Use Disconnect / retry for a fresh attempt.');
    await pc.setRemoteDescription({type,sdp:m.sdp});
    if(pc!==peer)return;
    if(role==='guest')await local(pc,await pc.createAnswer());
    else if(!connected){status('Answer accepted. Trying to connect (20 second limit)…');timeout(connectionTimeout,'Connection timed out after 20 seconds. The browsers could not establish a route. Try the same LAN or configure STUN/TURN under Network options, then retry. Flight remains playable.');}
  });
  button('net-reset').onclick=()=>reset();
  button('net-copy').onclick=()=>action(async()=>{
    if(!area('net-out').value)throw new Error('Create an offer or apply an offer first.');
    try{await navigator.clipboard.writeText(area('net-out').value);status('Connection text copied. Send it to your wingmate.');}
    catch{area('net-out').focus();area('net-out').select();status('Text selected. Press Ctrl+C to copy it.');}
  });
  window.addEventListener('pagehide',()=>reset());
  return {isGuest:()=>role==='guest',aiActive:()=>false,
    /** @param {import('./types').Demand} demand @param {number} elapsed */
    pilotDemand(demand,elapsed){return demand;},
    /** Network heartbeat uses wall time even while the simulation is paused.
     * @param {import('./types').Demand} demand @param {boolean} paused */
    update(demand,paused){
      const now=performance.now();
      if(connected&&now-lastReceived>5000){reset('Wingmate stopped sending updates. Your flight continues. Disconnect / retry to reconnect.');return;}
      if(remote&&now-lastReceived>300)session.setRemotePilot({...remote,fire:false,boost:false});
      if(connected&&channel?.readyState==='open'&&now-lastSent>=50&&channel.bufferedAmount<32768){
        lastSent=now;const snapshot=session.snapshot();
        const packet={protocol,seq:sequence++,pilot:{pose:snapshot.state,...loadout(),fire:!paused&&demand.fire,boost:!paused&&!!demand.boost,rotation:snapshot.asteroid.rotation}};
        try{channel.send(JSON.stringify(packet));sent++;}catch{reset('Connection interrupted. Your flight continues; retry when ready.');}
      }
      element('net-stats').textContent=connected?`Sent ${sent} · received ${received} · last update ${Math.round(now-lastReceived)} ms ago`:'Offline · local flight available';
    }
  };
}
if(typeof window!=='undefined'){
  const DW=/** @type {import('../src/types').DriftworksNamespace} */(window.Driftworks);
  DW.multiplayerFlight={mount};window.dispatchEvent(new Event('multiplayer-flight-ready'));
}
