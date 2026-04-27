import React from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, type EdgeInsets } from 'react-native-safe-area-context';
import { ScannerStage } from '../../components/ScannerStage';
import {
  isNativeScannerPipelineBound,
  type NativeScannerStatus,
} from '../../native/HebarcodeScanner';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
  DetectionSource,
} from '../../scanner/types';
import { styles as appStyles } from '../styles';

type CameraIssue = {
  title: string;
  message: string;
};

type DiagnosticItem = {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
};

type Props = {
  cameraIssue: CameraIssue | null;
  detectionSource: DetectionSource;
  detections: DetectedBarcode[];
  frame: BarcodeDetectionsFrame | null;
  insets: EdgeInsets;
  onBack: () => void;
  onRefreshScanner: () => void;
  onRequestPermission: () => void;
  onRetryScanner: () => void;
  onSelectBarcode: (barcode: DetectedBarcode) => void;
  selectedId?: string;
  showCameraWarmup: boolean;
  showPermissionCta: boolean;
  stackLabel: string;
  status: NativeScannerStatus | null;
  statusLabel: string;
};

export function DiagnosticsScreen({
  cameraIssue,
  detectionSource,
  detections,
  frame,
  insets,
  onBack,
  onRefreshScanner,
  onRequestPermission,
  onRetryScanner,
  onSelectBarcode,
  selectedId,
  showCameraWarmup,
  showPermissionCta,
  stackLabel,
  status,
  statusLabel,
}: Props) {
  const { width, height } = useWindowDimensions();
  const runtimeMetrics = useScannerRuntimeMetrics(status);
  const now = Date.now();
  const pipelineBound = isNativeScannerPipelineBound(status);
  const frameAgeMs = frame ? Math.max(0, now - frame.timestampMs) : null;
  const lastNativeFrameAgeMs =
    status?.lastEmittedAtMs && status.lastEmittedAtMs > 0
      ? Math.max(0, now - status.lastEmittedAtMs)
      : null;
  const previewSize =
    status?.previewWidth && status.previewHeight
      ? `${Math.round(status.previewWidth)} x ${Math.round(
          status.previewHeight,
        )}`
      : '0 x 0';
  const analysisSize =
    status?.analysisTargetWidth && status.analysisTargetHeight
      ? `${Math.round(status.analysisTargetWidth)} x ${Math.round(
          status.analysisTargetHeight,
        )}`
      : '-';
  const hasAnalyzerImage = Boolean(frame?.previewImageBase64);
  const frameSize = frame
    ? `${Math.round(frame.frameSize.width)} x ${Math.round(
        frame.frameSize.height,
      )}`
    : '-';
  const diagnostics: DiagnosticItem[] = [
    {
      label: 'Native',
      value: status?.nativeModulePresent ? 'OK' : 'MISSING',
      tone: status?.nativeModulePresent ? 'ok' : 'bad',
    },
    {
      label: 'Permission',
      value: status?.cameraPermissionGranted ? 'GRANTED' : 'NEEDED',
      tone: status?.cameraPermissionGranted ? 'ok' : 'warn',
    },
    {
      label: 'Preview view',
      value: status?.previewAttached ? 'ATTACHED' : 'NOT ATTACHED',
      tone: status?.previewAttached ? 'ok' : 'bad',
    },
    {
      label: 'Preview stream',
      value: status?.previewStreaming
        ? 'STREAMING'
        : status?.previewStreamState ?? 'IDLE',
      tone: status?.previewStreaming
        ? 'ok'
        : pipelineBound
        ? 'warn'
        : 'bad',
    },
    {
      label: 'Preview impl',
      value: status?.previewImplementationMode ?? 'COMPATIBLE',
      tone:
        status?.previewImplementationMode === 'COMPATIBLE' ? 'ok' : 'warn',
    },
    {
      label: 'Preview size',
      value: previewSize,
      tone: status?.previewWidth && status.previewHeight ? 'ok' : 'warn',
    },
    {
      label: 'CameraX bind',
      value: status?.bindingInProgress
        ? 'BINDING'
        : pipelineBound
        ? 'BOUND'
        : 'IDLE',
      tone: pipelineBound ? 'ok' : status?.bindingInProgress ? 'warn' : 'bad',
    },
    {
      label: 'Frame flow',
      value: status?.streaming ? 'LIVE' : pipelineBound ? 'WAITING' : 'IDLE',
      tone: status?.streaming ? 'ok' : pipelineBound ? 'warn' : 'bad',
    },
    {
      label: 'Requested',
      value: status?.scanningRequested ? 'YES' : 'NO',
      tone: status?.scanningRequested ? 'ok' : 'warn',
    },
    {
      label: 'Analyzed',
      value: formatCount(status?.analyzedFrameCount),
      tone: status?.analyzedFrameCount ? 'ok' : 'warn',
    },
    {
      label: 'Analyzer FPS',
      value: formatFps(runtimeMetrics.analyzedFps),
      tone: runtimeMetrics.analyzedFps > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Emitted',
      value: formatCount(status?.emittedFrameCount),
      tone: status?.emittedFrameCount ? 'ok' : 'warn',
    },
    {
      label: 'Event FPS',
      value: formatFps(runtimeMetrics.emittedFps),
      tone: runtimeMetrics.emittedFps > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Last frame',
      value: formatAge(lastNativeFrameAgeMs ?? frameAgeMs),
      tone: (lastNativeFrameAgeMs ?? frameAgeMs) === null ? 'warn' : 'ok',
    },
    {
      label: 'Analyzer image',
      value: hasAnalyzerImage ? 'YES' : 'NO',
      tone: hasAnalyzerImage ? 'ok' : 'warn',
    },
    {
      label: 'Image stream',
      value: status?.analyzerPreviewEnabled ? 'ON' : 'OFF',
      tone: status?.analyzerPreviewEnabled ? 'ok' : 'warn',
    },
    {
      label: 'Analysis profile',
      value: status?.analysisProfileName ?? '-',
      tone:
        status?.analysisProfileName === 'compat-480p' ? 'warn' : 'ok',
    },
    {
      label: 'Analysis target',
      value: analysisSize,
      tone: status?.analysisTargetWidth ? 'ok' : 'warn',
    },
    {
      label: 'Retries',
      value: formatCount(status?.analysisRetryCount),
      tone: status?.analysisRetryCount ? 'warn' : 'ok',
    },
    {
      label: 'Decode mode',
      value: status?.lastDecodeMode?.toUpperCase() ?? 'FAST',
      tone: status?.lastDecodeMode === 'deep' ? 'warn' : 'ok',
    },
    {
      label: 'Deep scans',
      value: formatCount(status?.deepDecodeCount),
      tone: status?.deepDecodeCount ? 'ok' : 'warn',
    },
    {
      label: 'Frame size',
      value: frameSize,
      tone: frame ? 'ok' : 'warn',
    },
    {
      label: 'Detections',
      value: String(detections.length || status?.lastDetectionCount || 0),
      tone: detections.length || status?.lastDetectionCount ? 'ok' : 'warn',
    },
    {
      label: 'Error',
      value: status?.lastErrorCode ?? 'none',
      tone: status?.lastErrorCode ? 'bad' : 'ok',
    },
    {
      label: 'Analyzer error',
      value: status?.lastAnalyzerErrorCode ?? 'none',
      tone: status?.lastAnalyzerErrorCode ? 'bad' : 'ok',
    },
  ];

  return (
    <View style={appStyles.root}>
      <StatusBar
        animated
        backgroundColor="transparent"
        barStyle="light-content"
        translucent
      />
      <ScannerStage
        cameraLive={
          status?.previewStreaming === true || status?.streaming === true
        }
        detections={detections}
        frame={frame}
        onSelect={onSelectBarcode}
        selectedId={selectedId}
        source={detectionSource}
        stageHeight={height}
        stageWidth={width}
      />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <SafeAreaView pointerEvents="box-none" style={localStyles.safeLayer}>
          <View style={localStyles.header}>
            <Pressable
              accessibilityLabel="Zpět"
              accessibilityRole="button"
              onPress={onBack}
              style={appStyles.topActionButton}
            >
              <Text style={appStyles.topActionText}>Zpět</Text>
            </Pressable>
            <View style={localStyles.headerText}>
              <Text style={localStyles.eyebrow}>DIAGNOSTIKA SKENERU</Text>
              <Text numberOfLines={1} style={localStyles.title}>
                {status?.streaming ? 'Živý stream běží' : 'Kontrola kamery'}
              </Text>
            </View>
            <View
              style={[
                localStyles.stateDot,
                resolveStateDotStyle(status, cameraIssue),
              ]}
            />
          </View>
        </SafeAreaView>

        <View
          style={[localStyles.panelWrap, { paddingBottom: insets.bottom + 14 }]}
        >
          <View style={localStyles.panel}>
            {cameraIssue || showCameraWarmup || showPermissionCta ? (
              <View style={localStyles.issueBox}>
                <Text style={localStyles.issueTitle}>
                  {cameraIssue?.title ??
                    (showPermissionCta
                      ? 'Kamera nemá oprávnění'
                      : 'Kamera startuje')}
                </Text>
                <Text style={localStyles.issueText}>
                  {cameraIssue?.message ??
                    (showPermissionCta
                      ? 'Povol kameru a znovu spusť diagnostiku.'
                      : 'Čekám na preview, CameraX bind a první frame.')}
                </Text>
              </View>
            ) : null}

            <View style={localStyles.buttonRow}>
              {showPermissionCta ? (
                <Pressable
                  onPress={onRequestPermission}
                  style={localStyles.primaryButton}
                >
                  <Text style={localStyles.primaryButtonText}>
                    Povolit kameru
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onRetryScanner}
                style={localStyles.primaryButton}
              >
                <Text style={localStyles.primaryButtonText}>
                  Restart skeneru
                </Text>
              </Pressable>
              <Pressable
                onPress={onRefreshScanner}
                style={localStyles.secondaryButton}
              >
                <Text style={localStyles.secondaryButtonText}>Refresh</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={localStyles.grid}
              showsVerticalScrollIndicator={false}
            >
              {diagnostics.map(item => (
                <View key={item.label} style={localStyles.tile}>
                  <Text style={localStyles.tileLabel}>{item.label}</Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      localStyles.tileValue,
                      resolveValueToneStyle(item.tone),
                    ]}
                  >
                    {item.value}
                  </Text>
                </View>
              ))}
              <View style={localStyles.fullRow}>
                <Text style={localStyles.tileLabel}>Stack</Text>
                <Text style={localStyles.fullValue}>{stackLabel}</Text>
              </View>
              <View style={localStyles.fullRow}>
                <Text style={localStyles.tileLabel}>Status</Text>
                <Text style={localStyles.fullValue}>{statusLabel}</Text>
              </View>
              {status?.lastErrorMessage ? (
                <View style={localStyles.fullRow}>
                  <Text style={localStyles.tileLabel}>Last error message</Text>
                  <Text style={[localStyles.fullValue, localStyles.badText]}>
                    {status.lastErrorMessage}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

function formatCount(value: number | undefined): string {
  return String(Math.round(value ?? 0));
}

function formatAge(value: number | null): string {
  if (value === null) {
    return '-';
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function formatFps(value: number): string {
  return `${Math.max(0, value).toFixed(1)} fps`;
}

function useScannerRuntimeMetrics(status: NativeScannerStatus | null) {
  const sampleRef = React.useRef<{
    timestampMs: number;
    analyzedFrameCount: number;
    emittedFrameCount: number;
  } | null>(null);
  const [metrics, setMetrics] = React.useState({
    analyzedFps: 0,
    emittedFps: 0,
  });

  React.useEffect(() => {
    if (!status) {
      sampleRef.current = null;
      setMetrics({ analyzedFps: 0, emittedFps: 0 });
      return;
    }

    const timestampMs = Date.now();
    const analyzedFrameCount = status.analyzedFrameCount ?? 0;
    const emittedFrameCount = status.emittedFrameCount ?? 0;
    const previousSample = sampleRef.current;

    sampleRef.current = {
      timestampMs,
      analyzedFrameCount,
      emittedFrameCount,
    };

    if (!previousSample) {
      setMetrics({ analyzedFps: 0, emittedFps: 0 });
      return;
    }

    const elapsedSeconds = Math.max(
      0.001,
      (timestampMs - previousSample.timestampMs) / 1000,
    );
    const analyzedDelta = Math.max(
      0,
      analyzedFrameCount - previousSample.analyzedFrameCount,
    );
    const emittedDelta = Math.max(
      0,
      emittedFrameCount - previousSample.emittedFrameCount,
    );

    setMetrics({
      analyzedFps: analyzedDelta / elapsedSeconds,
      emittedFps: emittedDelta / elapsedSeconds,
    });
  }, [status]);

  return metrics;
}

function resolveStateDotStyle(
  status: NativeScannerStatus | null,
  issue: CameraIssue | null,
) {
  if (issue || status?.lastErrorCode) {
    return localStyles.stateDotBad;
  }

  if (status?.streaming) {
    return localStyles.stateDotOk;
  }

  return localStyles.stateDotWarn;
}

function resolveValueToneStyle(tone: DiagnosticItem['tone']) {
  if (tone === 'bad') {
    return localStyles.badText;
  }

  if (tone === 'warn') {
    return localStyles.warnText;
  }

  return localStyles.okText;
}

const localStyles = StyleSheet.create({
  safeLayer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: '#7ef2ca',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    color: '#f7fbff',
    fontSize: 18,
    fontWeight: '900',
  },
  stateDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  stateDotOk: {
    backgroundColor: '#33d17a',
  },
  stateDotWarn: {
    backgroundColor: '#f7b248',
  },
  stateDotBad: {
    backgroundColor: '#ff6b6b',
  },
  panelWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    maxHeight: '58%',
  },
  panel: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(5, 9, 13, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(190, 226, 243, 0.16)',
  },
  issueBox: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 176, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 208, 102, 0.24)',
  },
  issueTitle: {
    color: '#fff0bd',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  issueText: {
    color: 'rgba(255, 245, 220, 0.78)',
    fontSize: 12,
    lineHeight: 17,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  primaryButton: {
    flexGrow: 1,
    minWidth: 130,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#7ef2ca',
  },
  primaryButtonText: {
    color: '#041913',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: {
    color: '#f3fbff',
    fontSize: 13,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 2,
  },
  tile: {
    width: '31.8%',
    minHeight: 58,
    borderRadius: 8,
    padding: 9,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  tileLabel: {
    color: 'rgba(214,229,238,0.66)',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 5,
  },
  tileValue: {
    color: '#f7fbff',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  fullRow: {
    width: '100%',
    borderRadius: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  fullValue: {
    color: '#f7fbff',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  okText: {
    color: '#95f3bb',
  },
  warnText: {
    color: '#ffd479',
  },
  badText: {
    color: '#ff9a9a',
  },
});
