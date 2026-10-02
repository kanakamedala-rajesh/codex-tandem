import { emitKeypressEvents } from 'node:readline';
export async function selectProfile(profiles:{id:string,label:string}[]):Promise<string|null> {
 const input=process.stdin, output=process.stderr;
 const wasRaw=input.isRaw, wasPaused=input.isPaused();
 let selected=0;
 return await new Promise((resolve,reject)=>{
  let done=false;
  const cleanup=()=>{
   input.off('keypress',key);output.off('resize',render);input.off('error',fail);output.off('error',fail);
   process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
   try{input.setRawMode(wasRaw);}finally{if(wasPaused)input.pause();output.write('\x1b[?25h\x1b[?1049l');}
  };
  const finish=(value:string|null,error?:unknown)=>{if(done)return;done=true;try{cleanup();}catch(e){error??=e;}if(error)reject(error);else resolve(value);};
  const fail=(error:Error)=>finish(null,error);
  const cancel=()=>finish(null);
  const render=()=>{try{
   const height=Math.max(1,(output.rows||24)-3),width=Math.max(1,(output.columns||80)-1);
   const start=Math.max(0,Math.min(selected-Math.floor(height/2),profiles.length-height));
   const lines=['Select synthetic profile (arrows/Enter; Esc cancels)',...profiles.slice(start,start+height).map((p,i)=>`${start+i===selected?'>':' '} [${p.id}] ${p.label}`)];
   output.write('\x1b[H\x1b[2J'+lines.map(line=>Array.from(line).slice(0,Math.floor(width/2)).join('')).join('\r\n'));
  }catch(e){finish(null,e);}};
  const key=(_text:string,k:{name?:string,ctrl?:boolean})=>{
   if(k.name==='escape'||(k.ctrl&&k.name==='c'))return cancel();
   if(k.name==='return')return finish(profiles[selected].id);
   if(k.name==='up')selected=(selected+profiles.length-1)%profiles.length;
   if(k.name==='down')selected=(selected+1)%profiles.length;
   render();
  };
  try{
   emitKeypressEvents(input);input.setRawMode(true);input.resume();
   input.on('keypress',key);output.on('resize',render);input.on('error',fail);output.on('error',fail);
   process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
   output.write('\x1b[?1049h\x1b[?25l');render();
  }catch(e){finish(null,e);}
 });
}

