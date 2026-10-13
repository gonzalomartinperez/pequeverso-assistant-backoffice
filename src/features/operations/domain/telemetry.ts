/** Private API telemetry1.0. A single observation, not an availability time series. */
export type OpsTelemetry = {
  generatedAt: Date;
  processStartedAt: Date;
  processUptimeSeconds: number;
  synthetic: boolean;
  readiness: { ready: boolean; checkedAt: Date };
  activeRuns: number;
  maxConcurrentRuns: number;
  resources: {
    processRssBytes: number | null;
    processPeakRssBytes: number | null;
    cgroupMemoryCurrentBytes: number | null;
    cgroupMemoryLimitBytes: number | null;
    cgroupCpuLimitCores: number | null;
    cgroupPidsCurrent: number | null;
    cgroupPidsLimit: number | null;
  };
  http: { requests: number; serverErrors: number; inflight: number };
  traces: {
    enabled: boolean;
    samplingRatio: number;
    exportSuccesses: number;
    exportFailures: number;
    lastExportAt: Date | null;
    lastExportSuccess: boolean | null;
  };
};
