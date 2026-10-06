// Two full app instances, with only the browser and Firestore SDK boundary simulated.
import {runtime,supplier} from './receipt-scan-harness.mjs';
import {createCloud,tick} from '../tests/shared-return-fake.mjs';
export {createCloud};
export const root='artifacts/tnuva-app-classic/public/data/';
export async function settle(){for(let i=0;i<15;i++)await tick();}
export async function phone(cloud,{storage=new Map(),online=true,start=true}={}){
  const p=runtime(supplier,{storage,handoff:false}),client=cloud.client({online});
  Object.assign(p.context,client.fs,{collection:(_db,...path)=>({path:path.join('/')}),where:(field,op,value)=>({field,op,value}),query:(ref,...where)=>({...ref,where}),getDocsFromServer:async ref=>{
    if(!client.isOnline())throw Error('offline');return {docs:cloud.paths(ref.path+'/').filter(path=>path.split('/').length===ref.path.split('/').length+1).filter(path=>(ref.where||[]).every(w=>cloud.get(path)?.[w.field]===w.value)).map(path=>({id:path.split('/').at(-1),data:()=>cloud.get(path)}))};}
  });
  p.context.window.location={href:''};p.context.navigator.onLine=online;
  p.run("runCloudTask=originalCloudTask;showCloudBusy=()=>{};hideCloudBusy=()=>{};currentView='returns';mainMode='returns'");
  p.client=client;
  p.online=v=>{client.setOnline(v);p.context.navigator.onLine=v;};
  p.scan=(id='milk',qty=1)=>p.run('addQtyToTarget(products.find(p=>p.id==='+JSON.stringify(id)+'),'+qty+',"returns")');
  p.flush=async()=>{if(p.run('typeof returnsEvents')!=='undefined')await p.run('returnsEvents.flush()');else{for(const fn of p.callbacks.splice(0))fn();if(client.isOnline())await p.run('retryCloudFailedWrites()');}await settle();};
  p.items=()=>JSON.parse(p.run('JSON.stringify(returnsList)'));
  p.send=async()=>{p.run('openReturnsSend()');await p.run('saveReturnsWithoutSending()');await settle();};
  p.stop=()=>p.run("if(typeof returnsEvents!=='undefined'&&returnsEvents)returnsEvents.stop()");
  if(start)await p.run('startReturnsLive()');await settle();return p;
}
