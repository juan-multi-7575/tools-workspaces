import { healthStatusClass } from './healthCheckData'

export default function HealthCheckStatus({ status }: { status: string }) {
  return <span className={`mh-status ${healthStatusClass(status)}`} title={status}>{status}</span>
}
