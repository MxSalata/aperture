import { describe, expect, it } from 'vitest';
import { metric, parseLabels, parsePrometheus } from '../monitor';

const SAMPLE = `# HELP iris_cpu_usage Percentage of CPU used
# TYPE iris_cpu_usage gauge
iris_cpu_usage 21.5
# HELP iris_disk_percent_full Disk usage
# TYPE iris_disk_percent_full gauge
iris_disk_percent_full{id="/usr/irissys/mgr/user/"} 77
iris_disk_percent_full{id="/usr/irissys/mgr/"} 12
iris_http_requests_total{code="200",path="/a b"} 1.5e3 1700000000
weird line without value
nan_metric NaN
`;

describe('prometheus parser', () => {
  it('parses values, labels, help and type', () => {
    const samples = parsePrometheus(SAMPLE);
    expect(metric(samples, 'iris_cpu_usage')?.value).toBe(21.5);
    expect(metric(samples, 'iris_cpu_usage')?.help).toBe('Percentage of CPU used');
    expect(metric(samples, 'iris_cpu_usage')?.type).toBe('gauge');
    expect(metric(samples, 'iris_disk_percent_full', { id: '/usr/irissys/mgr/user/' })?.value).toBe(77);
    expect(metric(samples, 'iris_http_requests_total')?.value).toBe(1500);
    expect(metric(samples, 'iris_http_requests_total')?.labels.path).toBe('/a b');
    expect(samples.find((s) => s.name === 'nan_metric')?.value).toBeNaN();
    expect(samples).toHaveLength(5);
  });
  it('parses escaped label values', () => {
    expect(parseLabels('{a="x\\"y",b="line\\nbreak"}')).toEqual({ a: 'x"y', b: 'line\nbreak' });
  });
});
