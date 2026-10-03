import test from 'node:test'
import assert from 'node:assert/strict'
import { reconnectRemoteRun, stopRemoteRun, canStartRun, type RemoteRunState } from '../lib/canvasRunRecovery'
test('reconnect reports active backend and blocks duplicate Run after renderer recovery',async()=>{
 let state:RemoteRunState='unknown'
 await reconnectRemoteRun(async()=>({active:true}),()=>true,next=>state=next)
 assert.equal(state,'active');assert.equal(canStartRun(false,state),false)
 await reconnectRemoteRun(async()=>({active:false}),()=>true,next=>state=next)
 assert.equal(state,'idle');assert.equal(canStartRun(false,state),true)
})
test('Stop reconciles remote cancellation rather than enabling Run before backend ended',async()=>{
 const order:string[]=[];let state:RemoteRunState='active'
 await stopRemoteRun(async()=>{order.push('stop')},async()=>{order.push('status');return {active:true}},()=>true,next=>state=next)
 assert.deepEqual(order,['stop','status']);assert.equal(state,'active');assert.equal(canStartRun(false,state),false)
})
test('failed Stop or reconnect keeps controls and blocks Run until status is confirmed',async()=>{
 let state:RemoteRunState='active'
 await stopRemoteRun(async()=>{throw new Error('Offline')},async()=>({active:false}),()=>true,next=>state=next)
 assert.equal(state,'unknown');assert.equal(canStartRun(false,state),false)
})
test('stale reconnect responses cannot modify another workspace or newer run',async()=>{
 let state:RemoteRunState='unknown',alive=true,finish!:(value:{active:boolean})=>void
 const request=reconnectRemoteRun(()=>new Promise(resolve=>finish=resolve),()=>alive,next=>state=next)
 alive=false;state='active';finish({active:false});await request
 assert.equal(state,'active')
})
