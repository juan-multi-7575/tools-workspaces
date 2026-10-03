export type RemoteRunState = 'checking' | 'active' | 'idle' | 'unknown'
type RemoteRead = () => Promise<{active:boolean}>
type Publish = (state:RemoteRunState) => void
export const canStartRun = (busy:boolean,remote:RemoteRunState) => !busy && remote==='idle'
/** An observer disconnect or successful Stop request cannot prove remote execution ended. */
export async function reconnectRemoteRun(read:RemoteRead,alive:()=>boolean,publish:Publish) {
 if(!alive())return
 publish('checking')
 try {
  const status=await read()
  if(alive())publish(status.active?'active':'idle')
 } catch {
  if(alive())publish('unknown')
 }
}
export async function stopRemoteRun(stop:()=>Promise<unknown>,read:RemoteRead,alive:()=>boolean,publish:Publish) {
 if(!alive())return
 publish('checking')
 try {
  await stop()
  if(alive())await reconnectRemoteRun(read,alive,publish)
 } catch {
  if(alive())publish('unknown')
 }
}
