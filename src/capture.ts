/** Bounded G0 experiment contract; this does not infer account ownership. */
export interface CaptureEvent {
 schemaVersion: 1; eventId: string; kind: 'turn.started'; launchId: string;
 targetGeneration: string; sessionId: string; turnId: string; capturedAt: string;
}
export function decodeCaptureEvent(bytes: Uint8Array): CaptureEvent {
 try {
  if(bytes.byteLength>4096) throw new Error();
  const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const label=/^[A-Za-z0-9_-]{1,64}$/;
  if (!value || value.schemaVersion!==1 || value.kind!=='turn.started') throw new Error();
  for(const key of ['eventId','sessionId','turnId']) if(typeof value[key]!=='string'||!uuid.test(value[key])) throw new Error();
  for(const key of ['launchId','targetGeneration']) if(typeof value[key]!=='string'||!label.test(value[key])) throw new Error();
  if(typeof value.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.capturedAt)||!Number.isFinite(Date.parse(value.capturedAt))||new Date(value.capturedAt).toISOString().replace('.000Z','Z')!==value.capturedAt) throw new Error();
  return {schemaVersion:1,eventId:value.eventId,kind:'turn.started',launchId:value.launchId,targetGeneration:value.targetGeneration,sessionId:value.sessionId,turnId:value.turnId,capturedAt:value.capturedAt};
 } catch { throw new Error('INVALID_CAPTURE_EVENT'); }
}

import { open, opendir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
/** Read-only bounded qualification snapshot. No durable acknowledgment or deletion. */
export async function readCaptureInbox(directory: string): Promise<CaptureEvent[]> {
 const events: CaptureEvent[]=[];
 const dir=await opendir(directory);
 let count=0;
 for await(const entry of dir) {
  if(++count>256) throw new Error('CAPTURE_INBOX_LIMIT');
  if(!/^[0-9a-f-]{36}\.json$/.test(entry.name)) continue;
  if(!entry.isFile()) throw new Error('INVALID_CAPTURE_EVENT');
  const file=await open(join(directory,entry.name),constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
   const info=await file.stat();
   if(!info.isFile()||info.size>4096) throw new Error('INVALID_CAPTURE_EVENT');
   const bytes=Buffer.alloc(4097);
   const {bytesRead}=await file.read(bytes,0,bytes.length,0);
   const event=decodeCaptureEvent(bytes.subarray(0,bytesRead));
   if(entry.name!==event.eventId+'.json') throw new Error('INVALID_CAPTURE_EVENT');
   events.push(event);
  } finally {await file.close();}
 }
 return events.sort((a,b)=>a.eventId.localeCompare(b.eventId));
}
