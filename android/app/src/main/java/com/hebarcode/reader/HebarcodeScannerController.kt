package com.hebarcode.reader

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.PointF
import android.graphics.Rect
import android.hardware.camera2.CaptureRequest
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Base64
import android.util.Size
import android.view.Surface
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.ZoomSuggestionOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import zxingcpp.BarcodeReader

object HebarcodeScannerController {
  private const val TAG = "HebarcodeScanner"
  private const val PREFS_NAME = "hebarcode_scanner"
  private const val PREF_ANALYSIS_PROFILE_INDEX = "analysis_profile_index"
  private const val PREF_PREVIEW_PROFILE_INDEX = "preview_profile_index"
  private const val PREF_BINDING_STRATEGY_INDEX = "binding_strategy_index"
  private const val PREF_FRAME_FLOW_PROFILE_VERSION = "frame_flow_profile_version"

  interface AnalyzerPreviewSink {
    fun showAnalyzerPreviewFrame(bitmap: Bitmap, timestampMs: Long)
    fun hideAnalyzerPreviewFrame()
  }

  private var reactContext: ReactApplicationContext? = null
  private var previewView: PreviewView? = null
  @Volatile private var analyzerPreviewSink: AnalyzerPreviewSink? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var cameraProvider: ProcessCameraProvider? = null
  private var boundCamera: Camera? = null
  private var imageAnalysis: ImageAnalysis? = null
  private var preview: Preview? = null
  private var mlKitBarcodeScanner: BarcodeScanner? = null
  private val analyzerExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val fastBarcodeReader =
    BarcodeReader(
      BarcodeReader.Options(
        tryHarder = false,
        tryRotate = true,
        tryInvert = false,
        tryDownscale = true,
        maxNumberOfSymbols = 16,
      ),
    )
  private val deepBarcodeReader =
    BarcodeReader(
      BarcodeReader.Options(
        tryHarder = true,
        tryRotate = true,
        tryInvert = true,
        tryDownscale = true,
        maxNumberOfSymbols = 32,
      ),
    )
  private var detectionTracker = HebarcodeDetectionTracker()

  @Volatile private var scanningRequested = false
  @Volatile private var pipelineBound = false
  @Volatile private var assistModeEnabled = true
  @Volatile private var analyzerPreviewEnabled = true
  @Volatile private var scannerProfileConfig = ScannerProfileConfig()
  @Volatile private var roiEnabled = false
  @Volatile private var roiCenterWeight = 0.5
  @Volatile private var candidateTtlMs: Long = HebarcodeDetectionTracker.DEFAULT_TTL_MS
  @Volatile private var maxDetections: Int = 16
  @Volatile private var preferDecoded = true
  @Volatile private var mlKitEnabled = true
  @Volatile private var deepScanEnabled = true
  @Volatile private var torchEnabled = false
  @Volatile private var torchRequested = false
  @Volatile private var detectionThrottleMs: Long = 250L
  @Volatile private var lastEmitAtMs: Long = 0L
  @Volatile private var lastSuccessfulDetectionAtMs: Long = 0L
  @Volatile private var lastDeepDecodeAtMs: Long = 0L
  @Volatile private var hasLoggedFirstAnalyzedFrame = false
  @Volatile private var hasLoggedFirstEmittedFrame = false
  @Volatile private var hasSavedSuccessfulProfileForBind = false
  @Volatile private var bindRequestVersion = 0
  @Volatile private var bindInFlight = false
  @Volatile private var frameFlowWatchdogVersion = 0
  @Volatile private var pipelineBoundAtMs: Long = 0L
  @Volatile private var lastErrorCode: String? = null
  @Volatile private var lastErrorMessage: String? = null
  @Volatile private var lastBindBlockReason: String? = null
  @Volatile private var lastAnalyzerErrorCode: String? = null
  @Volatile private var lastAnalyzerErrorMessage: String? = null
  @Volatile private var lastAnalyzerErrorAtMs: Long = 0L
  @Volatile private var analyzerErrorCount: Long = 0L
  @Volatile private var lastAnalyzerErrorLoggedAtMs: Long = 0L
  @Volatile private var previewAttachedAtMs: Long = 0L
  @Volatile private var previewStreamState: String = PreviewView.StreamState.IDLE.name
  @Volatile private var previewStreamUpdatedAtMs: Long = 0L
  @Volatile private var previewWidth: Int = 0
  @Volatile private var previewHeight: Int = 0
  @Volatile private var boundPreviewWidth: Int = 0
  @Volatile private var boundPreviewHeight: Int = 0
  @Volatile private var analyzedFrameCount: Long = 0L
  @Volatile private var emittedFrameCount: Long = 0L
  @Volatile private var lastAnalyzedAtMs: Long = 0L
  @Volatile private var lastEmittedAtMs: Long = 0L
  @Volatile private var lastDetectionCount: Int = 0
  @Volatile private var lastPreviewImageAtMs: Long = 0L
  @Volatile private var lastNativePreviewImageAtMs: Long = 0L
  @Volatile private var analyzerPreviewFrameCount: Long = 0L
  @Volatile private var lastAnalyzerPreviewAtMs: Long = 0L
  @Volatile private var lastDecodeMode: String = "fast"
  @Volatile private var fastDecodeCount: Long = 0L
  @Volatile private var deepDecodeCount: Long = 0L
  @Volatile private var mlKitDecodeCount: Long = 0L
  @Volatile private var fastDecodeHitCount: Long = 0L
  @Volatile private var deepDecodeHitCount: Long = 0L
  @Volatile private var mlKitDecodeHitCount: Long = 0L
  @Volatile private var mlKitPotentialCount: Long = 0L
  @Volatile private var mlKitBusy = false
  private val mlKitScanGeneration = AtomicLong(0L)
  @Volatile private var lastMlKitScanAtMs: Long = 0L
  @Volatile private var lastCameraAssistAtMs: Long = 0L
  @Volatile private var lastZoomAssistAtMs: Long = 0L
  @Volatile private var zoomResetScheduledForAssistAtMs: Long = 0L
  @Volatile private var focusAssistCount: Long = 0L
  @Volatile private var zoomAssistCount: Long = 0L
  @Volatile private var zoomResetCount: Long = 0L
  @Volatile private var consecutiveDecodeMissCount: Long = 0L
  @Volatile private var consecutiveDecodeHitCount: Long = 0L
  @Volatile private var lastAverageLuma: Double = -1.0
  @Volatile private var lastFrameContrast: Double = -1.0
  @Volatile private var lastFrameSharpness: Double = -1.0
  @Volatile private var lastFrameQualityScore: Double = -1.0
  @Volatile private var lastFrameQualityReason: String = "unknown"
  @Volatile private var lastAnalyzerDurationMs: Long = 0L
  @Volatile private var lastFastDecodeDurationMs: Long = 0L
  @Volatile private var lastDeepDecodeDurationMs: Long = 0L
  @Volatile private var lastMlKitDecodeDurationMs: Long = 0L
  @Volatile private var hasLoggedAnalyzerFallbackPreview = false
  @Volatile private var lastPerfLogAtMs: Long = 0L
  @Volatile private var lastPerfLogAnalyzedCount: Long = 0L
  @Volatile private var lastPerfLogEmittedCount: Long = 0L
  @Volatile private var lastPerfLogPreviewCount: Long = 0L
  @Volatile private var nativeFrameFlowRecoveryCount: Int = 0
  @Volatile private var cameraStateType: String = "UNBOUND"
  @Volatile private var cameraStateErrorCode: Int = 0
  @Volatile private var cameraStateErrorMessage: String? = null

  private const val LOW_LIGHT_LUMA_THRESHOLD = 72.0
  private const val STALE_DETECTION_WINDOW_MS = 1500L
  private const val DEEP_SCAN_INTERVAL_MS = 280L
  private const val MIN_ASSIST_THROTTLE_MS = 66L
  private const val MLKIT_SCAN_INTERVAL_MS = 180L
  private const val MLKIT_RECENT_DETECTION_SCAN_INTERVAL_MS = 360L
  private const val MISS_STREAK_DEEP_SCAN_THRESHOLD = 2L
  private const val MISS_STREAK_MLKIT_ACCELERATION_THRESHOLD = 2L
  private const val CAMERA_ASSIST_INTERVAL_MS = 2500L
  private const val CAMERA_TARGET_ASSIST_INTERVAL_MS = 900L
  private const val CAMERA_ASSIST_AUTO_CANCEL_SECONDS = 2L
  private const val MLKIT_MAX_AUTO_ZOOM_RATIO = 4.0f
  private const val MLKIT_ZOOM_STEP_MIN_RATIO = 1.04f
  private const val MLKIT_ZOOM_RESET_HOLD_MS = 1600L
  private const val MLKIT_ZOOM_RESET_MIN_RATIO = 1.08f
  private const val LOW_CONTRAST_THRESHOLD = 24.0
  private const val LOW_SHARPNESS_THRESHOLD = 7.0
  private const val LOW_FRAME_QUALITY_SCORE = 0.55
  private const val MAX_ERROR_MESSAGE_LENGTH = 180
  private const val BRIDGE_PREVIEW_IMAGE_INTERVAL_MS = 1200L
  private const val BRIDGE_PREVIEW_IMAGE_MAX_WIDTH = 320
  private const val NATIVE_PREVIEW_IMAGE_INTERVAL_MS = 33L
  private const val NATIVE_PREVIEW_IMAGE_MAX_WIDTH = 320
  private const val PREVIEW_IMAGE_JPEG_QUALITY = 46
  private const val FRAME_FLOW_ACTIVE_WINDOW_MS = 2500L
  private const val FRAME_FLOW_STARTUP_WATCHDOG_MS = 1800L
  private const val ANALYZER_ERROR_LOG_INTERVAL_MS = 5000L
  private const val PERF_LOG_INTERVAL_MS = 2000L
  private const val FRAME_FLOW_PROFILE_VERSION = 5

  private data class AnalysisProfile(
    val name: String,
    val width: Int,
    val height: Int,
    val fallbackRule: Int,
  )

  private val analysisProfiles =
    listOf(
      AnalysisProfile(
        name = "balanced-720p",
        width = 1280,
        height = 720,
        fallbackRule = ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
      ),
      AnalysisProfile(
        name = "compat-480p",
        width = 640,
        height = 480,
        fallbackRule = ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
      ),
      AnalysisProfile(
        name = "detail-1080p",
        width = 1920,
        height = 1080,
        fallbackRule = ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
      ),
    )

  private data class PreviewImplementationProfile(
    val name: String,
    val mode: PreviewView.ImplementationMode,
  )

  private data class BindingStrategy(
    val name: String,
    val bindPreview: Boolean,
    val useViewPortGroup: Boolean,
    val applyCamera2Interop: Boolean,
  )

  private data class ScannerProfileConfig(
    val name: String = "default",
    val detectionThrottleMs: Long = 250L,
    val assistModeEnabled: Boolean = true,
    val analyzerPreviewEnabled: Boolean = true,
    val roiEnabled: Boolean = false,
    val roiCenterWeight: Double = 0.5,
    val candidateTtlMs: Long = HebarcodeDetectionTracker.DEFAULT_TTL_MS,
    val maxDetections: Int = 16,
    val preferDecoded: Boolean = true,
    val mlKitEnabled: Boolean = true,
    val deepScanEnabled: Boolean = true,
  )

  private val previewImplementationProfiles =
    listOf(
      PreviewImplementationProfile(
        name = PreviewView.ImplementationMode.PERFORMANCE.name,
        mode = PreviewView.ImplementationMode.PERFORMANCE,
      ),
      PreviewImplementationProfile(
        name = PreviewView.ImplementationMode.COMPATIBLE.name,
        mode = PreviewView.ImplementationMode.COMPATIBLE,
      ),
    )

  private val bindingStrategies =
    listOf(
      BindingStrategy(
        name = "viewport-group",
        bindPreview = true,
        useViewPortGroup = true,
        applyCamera2Interop = true,
      ),
      BindingStrategy(
        name = "plain-use-cases",
        bindPreview = true,
        useViewPortGroup = false,
        applyCamera2Interop = true,
      ),
      BindingStrategy(
        name = "plain-basic",
        bindPreview = true,
        useViewPortGroup = false,
        applyCamera2Interop = false,
      ),
      BindingStrategy(
        name = "analysis-only",
        bindPreview = false,
        useViewPortGroup = false,
        applyCamera2Interop = true,
      ),
      BindingStrategy(
        name = "analysis-only-basic",
        bindPreview = false,
        useViewPortGroup = false,
        applyCamera2Interop = false,
      ),
    )

  @Volatile private var analysisProfileIndex = 0
  @Volatile private var analysisRetryCount = 0
  @Volatile private var previewImplementationProfileIndex = 0
  @Volatile private var bindingStrategyIndex = 0
  @Volatile private var preferredAnalysisProfileIndex = -1
  @Volatile private var preferredPreviewImplementationProfileIndex = -1
  @Volatile private var preferredBindingStrategyIndex = -1

  fun registerReactContext(context: ReactApplicationContext) {
    reactContext = context
    loadPreferredFrameFlowProfile(context)
    Log.i(TAG, "Registered React application context")
  }

  fun attachPreview(
    previewView: PreviewView,
    owner: LifecycleOwner?,
    previewSink: AnalyzerPreviewSink? = null,
  ) {
    if (this.previewView !== previewView) {
      hideAnalyzerPreviewSink()
    }

    this.previewView = previewView
    this.analyzerPreviewSink = previewSink
    this.lifecycleOwner = owner
    previewAttachedAtMs = System.currentTimeMillis()
    previewWidth = previewView.width.takeIf { it > 0 } ?: 0
    previewHeight = previewView.height.takeIf { it > 0 } ?: 0
    previewView.scaleType = PreviewView.ScaleType.FILL_CENTER
    previewView.implementationMode = currentPreviewImplementationProfile().mode
    owner?.let { lifecycleOwner ->
      previewView.previewStreamState.removeObservers(lifecycleOwner)
      previewView.previewStreamState.observe(lifecycleOwner) { state ->
        updatePreviewStreamState(state.name)
      }
    }
    updatePreviewStreamState(
      previewView.previewStreamState.value?.name ?: PreviewView.StreamState.IDLE.name,
    )
    Log.i(TAG, "Preview attached to window; scanningRequested=$scanningRequested")
    maybeBind()
  }

  fun updatePreviewStreamState(stateName: String) {
    if (stateName == PreviewView.StreamState.STREAMING.name) {
      hideAnalyzerPreviewSink()
    }

    if (previewStreamState == stateName) {
      return
    }

    previewStreamState = stateName
    previewStreamUpdatedAtMs = System.currentTimeMillis()
    Log.i(TAG, "Preview stream state changed to $stateName")

    if (stateName == PreviewView.StreamState.STREAMING.name) {
      rememberSuccessfulFrameFlowProfile()
    }
  }

  fun updatePreviewSize(previewView: PreviewView, width: Int, height: Int) {
    if (this.previewView !== previewView) {
      return
    }

    previewWidth = width.coerceAtLeast(0)
    previewHeight = height.coerceAtLeast(0)

    if (width > 0 && height > 0) {
      maybeBind()
    }
  }

  fun detachPreview(previewView: PreviewView) {
    if (this.previewView !== previewView) {
      return
    }

    bindRequestVersion += 1
    lifecycleOwner?.let { owner ->
      this.previewView?.previewStreamState?.removeObservers(owner)
    }
    this.previewView = null
    hideAnalyzerPreviewSink()
    this.analyzerPreviewSink = null
    this.lifecycleOwner = null
    previewAttachedAtMs = 0L
    updatePreviewStreamState(PreviewView.StreamState.IDLE.name)
    previewWidth = 0
    previewHeight = 0
    boundPreviewWidth = 0
    boundPreviewHeight = 0
    Log.i(TAG, "Preview detached from window")
    unbindCamera()
  }

  fun startScanning() {
    if (!scanningRequested) {
      resetAnalysisProfile()
    }
    scanningRequested = true
    clearAnalyzerError()
    Log.i(TAG, "startScanning requested")
    maybeBind()
  }

  fun retryScanning() {
    bindRequestVersion += 1
    scanningRequested = true
    if (nativeFrameFlowRecoveryCount >= maxNativeFrameFlowRecoveryCount()) {
      nativeFrameFlowRecoveryCount = 0
      bindingStrategyIndex = resolveStartupBindingStrategyIndex()
    }
    analysisRetryCount += 1
    advanceRecoveryProfileForRetry()
    clearStartupError()
    clearAnalyzerError()
    unbindCamera()
    Log.i(
      TAG,
      "retryScanning requested; analysisProfile=${currentAnalysisProfile().name} " +
        "previewMode=${currentPreviewImplementationProfile().name} " +
        "bindMode=${currentBindingStrategy().name}",
    )
    maybeBind()
  }

  fun stopScanning() {
    scanningRequested = false
    bindRequestVersion += 1
    setTorchEnabled(false)
    clearStartupError()
    clearAnalyzerError()
    Log.i(TAG, "stopScanning requested")
    unbindCamera()
  }

  fun setDetectionThrottleMs(value: Long) {
    detectionThrottleMs = value.coerceAtLeast(33L)
  }

  fun setScannerProfileConfig(config: ReadableMap?) {
    val current = scannerProfileConfig
    val next = ScannerProfileConfig(
      name = config.safeString("name", current.name).ifBlank { "default" },
      detectionThrottleMs = config.safeLong("detectionThrottleMs", current.detectionThrottleMs).coerceAtLeast(33L),
      assistModeEnabled = config.safeBoolean("assistModeEnabled", current.assistModeEnabled),
      analyzerPreviewEnabled = config.safeBoolean("analyzerPreviewEnabled", current.analyzerPreviewEnabled),
      roiEnabled = config.safeBoolean("roiEnabled", current.roiEnabled),
      roiCenterWeight = config.safeDouble("roiCenterWeight", current.roiCenterWeight).coerceIn(0.0, 1.0),
      candidateTtlMs = config.safeLong("candidateTtlMs", current.candidateTtlMs).coerceAtLeast(250L),
      maxDetections = config.safeInt("maxDetections", current.maxDetections).coerceIn(1, 64),
      preferDecoded = config.safeBoolean("preferDecoded", current.preferDecoded),
      mlKitEnabled = config.safeBoolean("mlKitEnabled", current.mlKitEnabled),
      deepScanEnabled = config.safeBoolean("deepScanEnabled", current.deepScanEnabled),
    )

    scannerProfileConfig = next
    detectionThrottleMs = next.detectionThrottleMs
    assistModeEnabled = next.assistModeEnabled
    setAnalyzerPreviewEnabled(next.analyzerPreviewEnabled)
    roiEnabled = next.roiEnabled
    roiCenterWeight = next.roiCenterWeight
    maxDetections = next.maxDetections
    preferDecoded = next.preferDecoded
    mlKitEnabled = next.mlKitEnabled
    deepScanEnabled = next.deepScanEnabled

    if (candidateTtlMs != next.candidateTtlMs) {
      candidateTtlMs = next.candidateTtlMs
      detectionTracker = HebarcodeDetectionTracker(ttlMs = candidateTtlMs)
    }
  }

  fun setAssistModeEnabled(value: Boolean) {
    assistModeEnabled = value
  }

  fun setTorchEnabled(value: Boolean) {
    torchRequested = value
    updateTorchState(value)
    Log.i(TAG, "Manual torch requested=$value enabled=$torchEnabled")
  }

  fun setAnalyzerPreviewEnabled(value: Boolean) {
    analyzerPreviewEnabled = value

    if (!value) {
      hideAnalyzerPreviewSink()
    }
  }

  fun isPreviewAttached(): Boolean = previewView != null

  fun isPipelineBound(): Boolean = pipelineBound

  fun isFrameFlowActive(now: Long = System.currentTimeMillis()): Boolean {
    val boundAtMs = pipelineBoundAtMs
    val analyzedAtMs = lastAnalyzedAtMs

    return pipelineBound &&
      scanningRequested &&
      boundAtMs > 0L &&
      analyzedAtMs >= boundAtMs &&
      now - analyzedAtMs <= FRAME_FLOW_ACTIVE_WINDOW_MS
  }

  fun getPipelineBoundAtMs(): Long = pipelineBoundAtMs

  fun getFrameFlowActiveWindowMs(): Long = FRAME_FLOW_ACTIVE_WINDOW_MS

  fun isBindingInProgress(): Boolean = bindInFlight

  fun isScanningRequested(): Boolean = scanningRequested

  fun isTorchEnabled(): Boolean = torchEnabled

  fun isTorchRequested(): Boolean = torchRequested

  fun isAnalyzerPreviewEnabled(): Boolean = analyzerPreviewEnabled

  fun getScannerProfileName(): String = scannerProfileConfig.name

  fun isRoiEnabled(): Boolean = roiEnabled

  fun getMaxDetections(): Int = maxDetections

  fun isMlKitEnabled(): Boolean = mlKitEnabled

  fun isDeepScanEnabled(): Boolean = deepScanEnabled

  fun getLastErrorCode(): String? = lastErrorCode

  fun getLastErrorMessage(): String? = lastErrorMessage

  fun getLastBindBlockReason(): String? = lastBindBlockReason

  fun getPreviewAttachedAtMs(): Long = previewAttachedAtMs

  fun getPreviewStreamState(): String = previewStreamState

  fun isPreviewStreamStreaming(): Boolean = previewStreamState == PreviewView.StreamState.STREAMING.name

  fun getPreviewStreamUpdatedAtMs(): Long = previewStreamUpdatedAtMs

  fun getPreviewImplementationMode(): String = currentPreviewImplementationProfile().name

  fun getUseCaseBindingMode(): String = currentBindingStrategy().name

  fun getNativeFrameFlowRecoveryCount(): Int = nativeFrameFlowRecoveryCount

  fun getLifecycleState(): String = lifecycleOwner?.lifecycle?.currentState?.name ?: "none"

  fun getCameraStateType(): String = cameraStateType

  fun getCameraStateErrorCode(): Int = cameraStateErrorCode

  fun getCameraStateErrorMessage(): String? = cameraStateErrorMessage

  fun isPreviewSizeReady(): Boolean = previewWidth > 0 && previewHeight > 0

  fun getPreviewWidth(): Int = previewWidth

  fun getPreviewHeight(): Int = previewHeight

  fun getBoundPreviewWidth(): Int = boundPreviewWidth

  fun getBoundPreviewHeight(): Int = boundPreviewHeight

  fun getAnalyzedFrameCount(): Long = analyzedFrameCount

  fun getEmittedFrameCount(): Long = emittedFrameCount

  fun getLastAnalyzedAtMs(): Long = lastAnalyzedAtMs

  fun getLastEmittedAtMs(): Long = lastEmittedAtMs

  fun getLastDetectionCount(): Int = lastDetectionCount

  fun getAnalyzerPreviewFrameCount(): Long = analyzerPreviewFrameCount

  fun getLastAnalyzerPreviewAtMs(): Long = lastAnalyzerPreviewAtMs

  fun getLastDecodeMode(): String = lastDecodeMode

  fun getFastDecodeCount(): Long = fastDecodeCount

  fun getDeepDecodeCount(): Long = deepDecodeCount

  fun getMlKitDecodeCount(): Long = mlKitDecodeCount

  fun getFastDecodeHitCount(): Long = fastDecodeHitCount

  fun getDeepDecodeHitCount(): Long = deepDecodeHitCount

  fun getMlKitDecodeHitCount(): Long = mlKitDecodeHitCount

  fun getMlKitPotentialCount(): Long = mlKitPotentialCount

  fun isMlKitBusy(): Boolean = mlKitBusy

  fun getFocusAssistCount(): Long = focusAssistCount

  fun getZoomAssistCount(): Long = zoomAssistCount

  fun getZoomResetCount(): Long = zoomResetCount

  fun getConsecutiveDecodeMissCount(): Long = consecutiveDecodeMissCount

  fun getConsecutiveDecodeHitCount(): Long = consecutiveDecodeHitCount

  fun getLastAverageLuma(): Double = lastAverageLuma

  fun getLastFrameContrast(): Double = lastFrameContrast

  fun getLastFrameSharpness(): Double = lastFrameSharpness

  fun getLastFrameQualityScore(): Double = lastFrameQualityScore

  fun getLastFrameQualityReason(): String = lastFrameQualityReason

  fun getLastAnalyzerDurationMs(): Long = lastAnalyzerDurationMs

  fun getLastFastDecodeDurationMs(): Long = lastFastDecodeDurationMs

  fun getLastDeepDecodeDurationMs(): Long = lastDeepDecodeDurationMs

  fun getLastMlKitDecodeDurationMs(): Long = lastMlKitDecodeDurationMs

  fun getAnalysisProfileName(): String = currentAnalysisProfile().name

  fun getAnalysisTargetWidth(): Int = currentAnalysisProfile().width

  fun getAnalysisTargetHeight(): Int = currentAnalysisProfile().height

  fun getAnalysisFallbackRule(): String = fallbackRuleLabel(currentAnalysisProfile().fallbackRule)

  fun getAnalysisRetryCount(): Int = analysisRetryCount

  fun getLastAnalyzerErrorCode(): String? = lastAnalyzerErrorCode

  fun getLastAnalyzerErrorMessage(): String? = lastAnalyzerErrorMessage

  fun getLastAnalyzerErrorAtMs(): Long = lastAnalyzerErrorAtMs

  fun getAnalyzerErrorCount(): Long = analyzerErrorCount

  private fun maybeBind() {
    val context = reactContext ?: return
    val view = previewView ?: return
    val owner = lifecycleOwner ?: return

    if (!scanningRequested || !hasCameraPermission(context)) {
      lastBindBlockReason =
        "waiting-request-or-permission scanningRequested=$scanningRequested hasPermission=${hasCameraPermission(context)}"
      Log.i(
        TAG,
        "Skipping bind; scanningRequested=$scanningRequested hasPermission=${hasCameraPermission(context)}",
      )
      return
    }

    if (lastErrorCode != null) {
      lastBindBlockReason = "startup-error ${lastErrorCode ?: "unknown"}"
      Log.i(TAG, "Skipping bind until scanner retry clears startup error")
      return
    }

    val bindWidth = resolvePreviewBindWidth(view)
    val bindHeight = resolvePreviewBindHeight(view)
    if (bindWidth <= 0 || bindHeight <= 0) {
      lastBindBlockReason =
        "waiting-preview-layout view=${view.width}x${view.height} recorded=${previewWidth}x$previewHeight"
      Log.i(
        TAG,
        "Skipping bind until preview has a non-zero size; " +
          "view=${view.width}x${view.height} recorded=${previewWidth}x$previewHeight",
      )
      return
    }

    if (pipelineBound) {
      lastBindBlockReason = null
      Log.d(TAG, "Skipping bind; camera pipeline is already bound")
      return
    }

    if (bindInFlight) {
      lastBindBlockReason = "binding-in-progress"
      Log.d(TAG, "Skipping bind; camera bind is already in flight")
      return
    }

    lastBindBlockReason = null
    Log.i(TAG, "Requesting ProcessCameraProvider")
    val requestVersion = bindRequestVersion + 1
    bindRequestVersion = requestVersion
    bindInFlight = true
    val providerFuture =
      try {
        ProcessCameraProvider.getInstance(context)
      } catch (error: Throwable) {
        recordStartupError(
          "E_CAMERA_PROVIDER",
          "Camera provider is not available: ${error.readableMessage()}",
          error,
        )
        return
      }

    providerFuture.addListener(
      {
        try {
          val provider = providerFuture.get()
          val bindIsStale =
            requestVersion != bindRequestVersion ||
              previewView !== view ||
              lifecycleOwner !== owner ||
              !scanningRequested ||
              !hasCameraPermission(context) ||
              resolvePreviewBindWidth(view) <= 0 ||
              resolvePreviewBindHeight(view) <= 0

          if (bindIsStale) {
            lastBindBlockReason = "stale-bind-request"
            Log.i(TAG, "Skipping stale camera bind request")
            return@addListener
          }

          cameraProvider = provider
          bindUseCases(provider, owner, view)
        } catch (error: Throwable) {
          if (requestVersion == bindRequestVersion) {
            recordStartupError(
              "E_CAMERA_BIND",
              "Camera pipeline failed to start: ${error.readableMessage()}",
              error,
            )
            safeUnbindCameraProvider()
          }
        } finally {
          if (requestVersion == bindRequestVersion) {
            bindInFlight = false
          }
        }
      },
      ContextCompat.getMainExecutor(context),
    )
  }

  private fun bindUseCases(
    provider: ProcessCameraProvider,
    owner: LifecycleOwner,
    view: PreviewView,
  ) {
    val analysisProfile = currentAnalysisProfile()
    val previewImplementationProfile = currentPreviewImplementationProfile()
    val bindingStrategy = currentBindingStrategy()
    val bindWidth = resolvePreviewBindWidth(view)
    val bindHeight = resolvePreviewBindHeight(view)
    view.implementationMode = previewImplementationProfile.mode
    Log.i(
      TAG,
      "Binding preview and image analysis use cases with profile=${analysisProfile.name} " +
        "${analysisProfile.width}x${analysisProfile.height} " +
        "previewMode=${previewImplementationProfile.name} bindMode=${bindingStrategy.name} " +
        "lifecycle=${owner.lifecycle.currentState.name}",
    )
    val previewUseCase =
      if (bindingStrategy.bindPreview) {
        val previewBuilder = Preview.Builder()
          .setTargetRotation(view.display?.rotation ?: Surface.ROTATION_0)
        if (bindingStrategy.applyCamera2Interop) {
          configureCameraBehavior(previewBuilder)
        }
        previewBuilder.build().apply { setSurfaceProvider(view.surfaceProvider) }
      } else {
        null
      }
    preview = previewUseCase

    val analysisBuilder =
      ImageAnalysis.Builder()
        .setResolutionSelector(
          ResolutionSelector.Builder()
            .setResolutionStrategy(
              ResolutionStrategy(
                Size(analysisProfile.width, analysisProfile.height),
                analysisProfile.fallbackRule,
              ),
            )
            .build(),
        )
        .setTargetRotation(view.display?.rotation ?: Surface.ROTATION_0)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
    if (bindingStrategy.applyCamera2Interop) {
      configureCameraBehavior(analysisBuilder)
    }

    val analysisUseCase =
      analysisBuilder.build()
        .apply { setAnalyzer(analyzerExecutor) { imageProxy -> analyzeFrame(imageProxy) } }
    imageAnalysis = analysisUseCase

    provider.unbindAll()
    val viewPort = view.viewPort
    boundCamera =
      if (previewUseCase != null && bindingStrategy.useViewPortGroup && viewPort != null) {
        val useCaseGroup =
          UseCaseGroup.Builder()
            .addUseCase(previewUseCase)
            .addUseCase(analysisUseCase)
            .setViewPort(viewPort)
            .build()
        provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, useCaseGroup)
      } else if (previewUseCase != null) {
        provider.bindToLifecycle(
          owner,
          CameraSelector.DEFAULT_BACK_CAMERA,
          previewUseCase,
          analysisUseCase,
        )
      } else {
        provider.bindToLifecycle(
          owner,
          CameraSelector.DEFAULT_BACK_CAMERA,
          analysisUseCase,
        )
      }
    rebuildMlKitScannerForCamera(boundCamera)
    observeCameraState(boundCamera, owner)
    val now = System.currentTimeMillis()
    pipelineBound = true
    pipelineBoundAtMs = now
    detectionTracker.reset()
    clearStartupError()
    lastBindBlockReason =
      "waiting-first-analyzer-frame bindMode=${bindingStrategy.name} " +
        "camera=$cameraStateType lifecycle=${owner.lifecycle.currentState.name}"
    previewWidth = view.width.takeIf { it > 0 } ?: previewWidth
    previewHeight = view.height.takeIf { it > 0 } ?: previewHeight
    boundPreviewWidth = bindWidth
    boundPreviewHeight = bindHeight
    lastEmitAtMs = 0L
    lastSuccessfulDetectionAtMs = 0L
    lastDeepDecodeAtMs = 0L
    analyzedFrameCount = 0L
    emittedFrameCount = 0L
    analyzerPreviewFrameCount = 0L
    lastAnalyzedAtMs = 0L
    lastEmittedAtMs = 0L
    lastAnalyzerPreviewAtMs = 0L
    hasLoggedFirstAnalyzedFrame = false
    hasLoggedFirstEmittedFrame = false
    hasSavedSuccessfulProfileForBind = false
    resetPerfLogCounters(now)
    lastDecodeMode = "fast"
    fastDecodeCount = 0L
    deepDecodeCount = 0L
    mlKitDecodeCount = 0L
    fastDecodeHitCount = 0L
    deepDecodeHitCount = 0L
    mlKitDecodeHitCount = 0L
    mlKitPotentialCount = 0L
    mlKitBusy = false
    lastMlKitScanAtMs = 0L
    lastCameraAssistAtMs = 0L
    lastZoomAssistAtMs = 0L
    zoomResetScheduledForAssistAtMs = 0L
    focusAssistCount = 0L
    zoomAssistCount = 0L
    zoomResetCount = 0L
    consecutiveDecodeMissCount = 0L
    consecutiveDecodeHitCount = 0L
    lastAverageLuma = -1.0
    lastFrameContrast = -1.0
    lastFrameSharpness = -1.0
    lastFrameQualityScore = -1.0
    lastFrameQualityReason = "unknown"
    lastAnalyzerDurationMs = 0L
    lastFastDecodeDurationMs = 0L
    lastDeepDecodeDurationMs = 0L
    lastMlKitDecodeDurationMs = 0L
    torchEnabled = false
    updateTorchState(torchRequested)
    scheduleCenterFocusAssist(now)
    Log.i(
      TAG,
      "Camera pipeline bound successfully with profile=${analysisProfile.name} " +
        "previewMode=${previewImplementationProfile.name} bindMode=${bindingStrategy.name} " +
        "size=${boundPreviewWidth}x$boundPreviewHeight lifecycle=${owner.lifecycle.currentState.name}",
    )
    scheduleFrameFlowWatchdog(bindRequestVersion, now)
    emitDetectionsFrame(
      frameId = "camera-bind-$now",
      timestampMs = now,
      rotationDegrees = 0,
      frameWidth = bindWidth,
      frameHeight = bindHeight,
      detections = Arguments.createArray(),
      previewImageBase64 = null,
      previewImageTimestampMs = null,
    )
  }

  private fun unbindCamera() {
    updateTorchState(false)
    imageAnalysis?.clearAnalyzer()
    removeCameraStateObserver()
    safeUnbindCameraProvider()
    closeMlKitScanner()
    imageAnalysis = null
    preview = null
    boundCamera = null
    cameraStateType = "UNBOUND"
    cameraStateErrorCode = 0
    cameraStateErrorMessage = null
    pipelineBound = false
    pipelineBoundAtMs = 0L
    detectionTracker.reset()
    updatePreviewStreamState(PreviewView.StreamState.IDLE.name)
    boundPreviewWidth = 0
    boundPreviewHeight = 0
    bindInFlight = false
    frameFlowWatchdogVersion += 1
    lastBindBlockReason = null
    lastEmitAtMs = 0L
    lastSuccessfulDetectionAtMs = 0L
    lastDeepDecodeAtMs = 0L
    lastPreviewImageAtMs = 0L
    lastNativePreviewImageAtMs = 0L
    analyzerPreviewFrameCount = 0L
    lastAnalyzerPreviewAtMs = 0L
    lastDecodeMode = "fast"
    mlKitDecodeCount = 0L
    fastDecodeHitCount = 0L
    deepDecodeHitCount = 0L
    mlKitDecodeHitCount = 0L
    mlKitPotentialCount = 0L
    mlKitBusy = false
    lastMlKitScanAtMs = 0L
    lastCameraAssistAtMs = 0L
    lastZoomAssistAtMs = 0L
    zoomResetScheduledForAssistAtMs = 0L
    focusAssistCount = 0L
    zoomAssistCount = 0L
    zoomResetCount = 0L
    consecutiveDecodeMissCount = 0L
    consecutiveDecodeHitCount = 0L
    lastAverageLuma = -1.0
    lastFrameContrast = -1.0
    lastFrameSharpness = -1.0
    lastFrameQualityScore = -1.0
    lastFrameQualityReason = "unknown"
    lastAnalyzerDurationMs = 0L
    lastFastDecodeDurationMs = 0L
    lastDeepDecodeDurationMs = 0L
    lastMlKitDecodeDurationMs = 0L
    hasLoggedAnalyzerFallbackPreview = false
    resetPerfLogCounters(0L)
    torchEnabled = false
    hideAnalyzerPreviewSink()
    Log.i(TAG, "Camera pipeline unbound")
  }

  private fun safeUnbindCameraProvider() {
    try {
      cameraProvider?.unbindAll()
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to unbind CameraX provider cleanly: ${error.readableMessage()}", error)
    }
  }

  private fun rebuildMlKitScannerForCamera(camera: Camera?) {
    closeMlKitScanner()
    if (!mlKitEnabled) {
      Log.i(TAG, "ML Kit barcode scanner disabled by scanner profile")
      return
    }
    val maxZoomRatio = resolveMlKitMaxZoomRatio(camera)
    val options =
      BarcodeScannerOptions.Builder()
        .setBarcodeFormats(
          Barcode.FORMAT_CODE_128,
          Barcode.FORMAT_CODE_39,
          Barcode.FORMAT_CODE_93,
          Barcode.FORMAT_CODABAR,
          Barcode.FORMAT_EAN_13,
          Barcode.FORMAT_EAN_8,
          Barcode.FORMAT_ITF,
          Barcode.FORMAT_UPC_A,
          Barcode.FORMAT_UPC_E,
          Barcode.FORMAT_QR_CODE,
          Barcode.FORMAT_PDF417,
          Barcode.FORMAT_AZTEC,
          Barcode.FORMAT_DATA_MATRIX,
        )
        .enableAllPotentialBarcodes()
        .setZoomSuggestionOptions(
          ZoomSuggestionOptions.Builder { zoomRatio ->
            applyMlKitZoomSuggestion(zoomRatio)
          }
            .setMaxSupportedZoomRatio(maxZoomRatio)
            .build(),
        )
        .build()

    mlKitBarcodeScanner = BarcodeScanning.getClient(options)
    Log.i(TAG, "ML Kit barcode scanner ready with maxAutoZoom=${formatRatio(maxZoomRatio)}")
  }

  private fun closeMlKitScanner() {
    invalidateMlKitScan()

    try {
      mlKitBarcodeScanner?.close()
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to close ML Kit scanner cleanly: ${error.readableMessage()}", error)
    } finally {
      mlKitBarcodeScanner = null
    }
  }

  private fun resolveMlKitMaxZoomRatio(camera: Camera?): Float {
    val zoomState = camera?.cameraInfo?.zoomState?.value ?: return 1.0f
    return zoomState.maxZoomRatio
      .coerceAtLeast(zoomState.minZoomRatio)
      .coerceAtMost(MLKIT_MAX_AUTO_ZOOM_RATIO)
      .coerceAtLeast(1.0f)
  }

  private fun applyMlKitZoomSuggestion(zoomRatio: Float): Boolean {
    if (!assistModeEnabled || !scanningRequested) {
      return false
    }

    val camera = boundCamera ?: return false
    val zoomState = camera.cameraInfo.zoomState.value ?: return false
    val maxZoomRatio = resolveMlKitMaxZoomRatio(camera)
    val targetZoom =
      zoomRatio
        .coerceAtLeast(zoomState.minZoomRatio)
        .coerceAtMost(maxZoomRatio)
        .coerceAtLeast(1.0f)

    if (targetZoom <= zoomState.zoomRatio * MLKIT_ZOOM_STEP_MIN_RATIO) {
      return true
    }

    return try {
      val now = System.currentTimeMillis()
      camera.cameraControl.setZoomRatio(targetZoom)
      lastCameraAssistAtMs = now
      lastZoomAssistAtMs = now
      zoomAssistCount += 1
      Log.i(
        TAG,
        "ML Kit auto-zoom suggested ${formatRatio(zoomRatio)}; applying ${formatRatio(targetZoom)}",
      )
      true
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to apply ML Kit auto-zoom: ${error.readableMessage()}", error)
      false
    }
  }

  private fun scheduleZoomResetAfterSuccessfulDetection(now: Long) {
    val zoomAssistAtMs = lastZoomAssistAtMs
    if (zoomAssistAtMs <= 0L || zoomResetScheduledForAssistAtMs == zoomAssistAtMs) {
      return
    }

    val camera = boundCamera ?: return
    val zoomState = camera.cameraInfo.zoomState.value ?: return
    val neutralZoom = resolveNeutralZoomRatio(zoomState.minZoomRatio, zoomState.maxZoomRatio)
    if (zoomState.zoomRatio <= neutralZoom * MLKIT_ZOOM_RESET_MIN_RATIO) {
      return
    }

    scheduleZoomReset(zoomAssistAtMs, MLKIT_ZOOM_RESET_HOLD_MS, now)
  }

  private fun scheduleZoomReset(zoomAssistAtMs: Long, delayMs: Long, scheduledAtMs: Long) {
    val requestVersion = bindRequestVersion
    val boundAtMs = pipelineBoundAtMs
    zoomResetScheduledForAssistAtMs = zoomAssistAtMs

    mainHandler.postDelayed(
      {
        resetAssistedZoomIfReady(
          requestVersion = requestVersion,
          boundAtMs = boundAtMs,
          zoomAssistAtMs = zoomAssistAtMs,
        )
      },
      delayMs.coerceAtLeast(120L),
    )
    Log.d(
      TAG,
      "Scheduled assisted zoom reset in ${delayMs.coerceAtLeast(120L)}ms " +
        "assistAge=${scheduledAtMs - zoomAssistAtMs}ms",
    )
  }

  private fun resetAssistedZoomIfReady(
    requestVersion: Int,
    boundAtMs: Long,
    zoomAssistAtMs: Long,
  ) {
    if (
      requestVersion != bindRequestVersion ||
        boundAtMs <= 0L ||
        pipelineBoundAtMs != boundAtMs ||
        !pipelineBound ||
        !scanningRequested ||
        lastZoomAssistAtMs != zoomAssistAtMs
    ) {
      return
    }

    val now = System.currentTimeMillis()
    val detectionAgeMs = now - lastSuccessfulDetectionAtMs
    if (mlKitBusy || detectionAgeMs in 0 until MLKIT_ZOOM_RESET_HOLD_MS) {
      zoomResetScheduledForAssistAtMs = 0L
      scheduleZoomReset(
        zoomAssistAtMs = zoomAssistAtMs,
        delayMs = (MLKIT_ZOOM_RESET_HOLD_MS - detectionAgeMs).coerceAtLeast(220L),
        scheduledAtMs = now,
      )
      return
    }

    val camera = boundCamera ?: return
    val zoomState = camera.cameraInfo.zoomState.value ?: return
    val neutralZoom = resolveNeutralZoomRatio(zoomState.minZoomRatio, zoomState.maxZoomRatio)
    if (zoomState.zoomRatio <= neutralZoom * MLKIT_ZOOM_RESET_MIN_RATIO) {
      zoomResetScheduledForAssistAtMs = 0L
      return
    }

    try {
      camera.cameraControl.setZoomRatio(neutralZoom)
      zoomResetScheduledForAssistAtMs = 0L
      zoomResetCount += 1
      Log.i(TAG, "Assisted zoom reset to ${formatRatio(neutralZoom)}")
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to reset assisted zoom: ${error.readableMessage()}", error)
    }
  }

  private fun resolveNeutralZoomRatio(minZoomRatio: Float, maxZoomRatio: Float): Float =
    1.0f.coerceAtLeast(minZoomRatio).coerceAtMost(maxZoomRatio)

  private fun scheduleCenterFocusAssist(boundAtMs: Long) {
    mainHandler.postDelayed(
      {
        if (pipelineBoundAtMs == boundAtMs && scanningRequested) {
          requestCenterFocusAssist("startup")
        }
      },
      250L,
    )
  }

  private fun requestCenterFocusAssist(reason: String) {
    val view = previewView ?: return
    requestFocusAssistAtViewPoint(
      viewX = view.width / 2f,
      viewY = view.height / 2f,
      reason = reason,
      minIntervalMs = CAMERA_ASSIST_INTERVAL_MS,
    )
  }

  private fun requestFocusAssistAtFramePoint(
    frameX: Float,
    frameY: Float,
    frameWidth: Int,
    frameHeight: Int,
    reason: String,
  ) {
    val view = previewView ?: return
    if (frameWidth <= 0 || frameHeight <= 0 || view.width <= 0 || view.height <= 0) {
      return
    }

    val scale = maxOf(
      view.width.toFloat() / frameWidth.toFloat(),
      view.height.toFloat() / frameHeight.toFloat(),
    )
    val renderedWidth = frameWidth.toFloat() * scale
    val renderedHeight = frameHeight.toFloat() * scale
    val viewX = (frameX * scale) + ((view.width.toFloat() - renderedWidth) / 2f)
    val viewY = (frameY * scale) + ((view.height.toFloat() - renderedHeight) / 2f)

    requestFocusAssistAtViewPoint(
      viewX = viewX.coerceIn(0f, view.width.toFloat()),
      viewY = viewY.coerceIn(0f, view.height.toFloat()),
      reason = reason,
      minIntervalMs = CAMERA_TARGET_ASSIST_INTERVAL_MS,
    )
  }

  private fun requestFocusAssistAtViewPoint(
    viewX: Float,
    viewY: Float,
    reason: String,
    minIntervalMs: Long,
  ) {
    val now = System.currentTimeMillis()
    if (!assistModeEnabled || now - lastCameraAssistAtMs < minIntervalMs) {
      return
    }

    val camera = boundCamera ?: return
    val view = previewView ?: return
    if (view.width <= 0 || view.height <= 0) {
      return
    }

    try {
      val point = view.meteringPointFactory.createPoint(viewX, viewY)
      val action =
        FocusMeteringAction.Builder(
          point,
          FocusMeteringAction.FLAG_AF or
            FocusMeteringAction.FLAG_AE or
            FocusMeteringAction.FLAG_AWB,
        )
          .setAutoCancelDuration(CAMERA_ASSIST_AUTO_CANCEL_SECONDS, TimeUnit.SECONDS)
          .build()
      camera.cameraControl.startFocusAndMetering(action)
      lastCameraAssistAtMs = now
      focusAssistCount += 1
      Log.i(TAG, "Focus/metering assist requested reason=$reason")
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to request focus assist: ${error.readableMessage()}", error)
    }
  }

  private fun recordStartupError(code: String, message: String, error: Throwable) {
    pipelineBound = false
    pipelineBoundAtMs = 0L
    bindInFlight = false
    lastErrorCode = code
    lastErrorMessage = message.take(MAX_ERROR_MESSAGE_LENGTH)
    lastBindBlockReason = "startup-error $code"
    Log.e(TAG, message, error)
  }

  private fun clearStartupError() {
    lastErrorCode = null
    lastErrorMessage = null
    lastBindBlockReason = null
  }

  private fun scheduleFrameFlowWatchdog(requestVersion: Int, boundAtMs: Long) {
    frameFlowWatchdogVersion += 1
    val watchdogVersion = frameFlowWatchdogVersion
    mainHandler.postDelayed(
      {
        handleFrameFlowWatchdog(requestVersion, watchdogVersion, boundAtMs)
      },
      FRAME_FLOW_STARTUP_WATCHDOG_MS,
    )
  }

  private fun handleFrameFlowWatchdog(
    requestVersion: Int,
    watchdogVersion: Int,
    boundAtMs: Long,
  ) {
    if (
      requestVersion != bindRequestVersion ||
      watchdogVersion != frameFlowWatchdogVersion ||
      !scanningRequested ||
      !pipelineBound ||
      bindInFlight
    ) {
      return
    }

    if (lastAnalyzedAtMs >= boundAtMs) {
      lastBindBlockReason = null
      return
    }

    recoverFrameFlow("No analyzer frame received ${FRAME_FLOW_STARTUP_WATCHDOG_MS}ms after bind")
  }

  private fun recoverFrameFlow(reason: String) {
    if (nativeFrameFlowRecoveryCount >= maxNativeFrameFlowRecoveryCount()) {
      lastBindBlockReason =
        "frame-flow-stalled-after-native-recovery count=$nativeFrameFlowRecoveryCount " +
          "camera=$cameraStateType cameraError=$cameraStateErrorCode lifecycle=${getLifecycleState()}"
      Log.w(
        TAG,
        "Analyzer frame flow is still stalled after native recovery attempts; " +
          "camera=$cameraStateType cameraError=$cameraStateErrorCode lifecycle=${getLifecycleState()}",
      )
      return
    }

    nativeFrameFlowRecoveryCount += 1
    analysisRetryCount += 1
    advanceRecoveryProfileForRetry()
    clearStartupError()
    clearAnalyzerError()
    val recoveryReason =
      "recovering-frame-flow nativeRecovery=$nativeFrameFlowRecoveryCount bindMode=${currentBindingStrategy().name}"
    bindRequestVersion += 1
    Log.w(
      TAG,
      "$reason; " +
        "rebinding camera pipeline with profile=${currentAnalysisProfile().name} " +
        "previewMode=${currentPreviewImplementationProfile().name} " +
        "bindMode=${currentBindingStrategy().name} camera=$cameraStateType " +
        "cameraError=$cameraStateErrorCode lifecycle=${getLifecycleState()}",
    )
    unbindCamera()
    lastBindBlockReason = recoveryReason
    maybeBind()
  }

  private fun resolvePreviewBindWidth(view: PreviewView): Int {
    return view.width.takeIf { it > 0 } ?: previewWidth
  }

  private fun resolvePreviewBindHeight(view: PreviewView): Int {
    return view.height.takeIf { it > 0 } ?: previewHeight
  }

  private fun observeCameraState(camera: Camera?, owner: LifecycleOwner) {
    val cameraState = camera?.cameraInfo?.cameraState ?: return
    cameraState.removeObservers(owner)
    cameraState.observe(owner) { state ->
      val nextType = state.type.name
      val error = state.error
      val nextErrorCode = error?.code ?: 0
      val nextErrorMessage = error?.let { cameraStateErrorLabel(it) }
      val changed =
        cameraStateType != nextType ||
          cameraStateErrorCode != nextErrorCode ||
          cameraStateErrorMessage != nextErrorMessage

      cameraStateType = nextType
      cameraStateErrorCode = nextErrorCode
      cameraStateErrorMessage = nextErrorMessage

      if (changed) {
        Log.i(
          TAG,
          "Camera state changed to $nextType error=$nextErrorCode " +
            "message=${nextErrorMessage ?: "none"}",
        )
      }

      if (
        nextErrorCode == CameraState.ERROR_STREAM_CONFIG &&
          scanningRequested &&
          pipelineBound &&
          !bindInFlight
      ) {
        scheduleStreamConfigRecovery()
      }
    }
  }

  private fun scheduleStreamConfigRecovery() {
    val requestVersion = bindRequestVersion
    val boundAtMs = pipelineBoundAtMs
    mainHandler.postDelayed(
      {
        if (
          requestVersion == bindRequestVersion &&
            scanningRequested &&
            pipelineBound &&
            !bindInFlight &&
            cameraStateErrorCode == CameraState.ERROR_STREAM_CONFIG &&
            lastAnalyzedAtMs < boundAtMs
        ) {
          recoverFrameFlow("CameraX stream-config error")
        }
      },
      250L,
    )
  }

  private fun removeCameraStateObserver() {
    val owner = lifecycleOwner ?: return
    boundCamera?.cameraInfo?.cameraState?.removeObservers(owner)
  }

  private fun recordAnalyzerError(code: String, message: String, error: Throwable, now: Long) {
    lastAnalyzerErrorCode = code
    lastAnalyzerErrorMessage = message.take(MAX_ERROR_MESSAGE_LENGTH)
    lastAnalyzerErrorAtMs = now
    analyzerErrorCount += 1

    if (now - lastAnalyzerErrorLoggedAtMs >= ANALYZER_ERROR_LOG_INTERVAL_MS) {
      lastAnalyzerErrorLoggedAtMs = now
      Log.w(TAG, message, error)
    }
  }

  private fun clearAnalyzerError() {
    lastAnalyzerErrorCode = null
    lastAnalyzerErrorMessage = null
  }

  private fun Throwable.readableMessage(): String {
    return localizedMessage ?: message ?: javaClass.simpleName
  }

  private fun Throwable.isToleratedDecoderMiss(): Boolean {
    return readableMessage().contains("Invalid BarcodeFormat", ignoreCase = true)
  }

  private fun recordDecodeHit(now: Long) {
    lastSuccessfulDetectionAtMs = now
    consecutiveDecodeHitCount += 1
    consecutiveDecodeMissCount = 0L
    scheduleZoomResetAfterSuccessfulDetection(now)
  }

  private fun recordDecodeMiss() {
    consecutiveDecodeMissCount += 1
    consecutiveDecodeHitCount = 0L
  }

  @ExperimentalGetImage
  private fun analyzeFrame(imageProxy: androidx.camera.core.ImageProxy) {
    val analysisStartedAtMs = System.currentTimeMillis()
    if (!scanningRequested) {
      imageProxy.close()
      return
    }

    val now = analysisStartedAtMs
    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    val frameWidth = imageProxy.cropRect.width()
    val frameHeight = imageProxy.cropRect.height()
    val coordinateTransformer = coordinateTransformerFor(imageProxy, rotationDegrees)
    val displayFrameWidth = coordinateTransformer.frameGeometry.displayWidth
    val displayFrameHeight = coordinateTransformer.frameGeometry.displayHeight
    analyzedFrameCount += 1
    lastAnalyzedAtMs = now
    lastBindBlockReason = null

    if (!hasLoggedFirstAnalyzedFrame) {
      hasLoggedFirstAnalyzedFrame = true
      Log.i(
        TAG,
        "First frame received by analyzer: ${frameWidth}x${frameHeight} " +
          "display=${displayFrameWidth}x$displayFrameHeight rotation=$rotationDegrees",
      )
    }
    rememberSuccessfulFrameFlowProfile()

    if (now - lastEmitAtMs < resolveEffectiveThrottleMs(now)) {
      try {
        if (analyzerPreviewEnabled) {
          renderAnalyzerPreviewIfDue(imageProxy, rotationDegrees, now)
        }
      } catch (error: Throwable) {
        recordAnalyzerError(
          "E_ANALYZER_PREVIEW",
          "Analyzer preview frame failed: ${error.readableMessage()}",
          error,
          now,
        )
      } finally {
        imageProxy.close()
      }
      lastAnalyzerDurationMs = System.currentTimeMillis() - analysisStartedAtMs
      logScannerPerformance(now, frameWidth, frameHeight)
      return
    }

    val shouldEstimateFrameQuality = shouldEstimateFrameQuality()
    var averageLuma = -1.0
    var frameQuality =
      HebarcodeAnalyzerPreviewRenderer.FrameQualityMetrics(
        averageLuma = -1.0,
        contrast = -1.0,
        sharpness = -1.0,
        sampleCount = 0,
      )
    var previewImageBase64: String? = null
    var shouldCloseImageProxy = true
    val results =
      try {
        if (shouldEstimateFrameQuality) {
          frameQuality = HebarcodeAnalyzerPreviewRenderer.estimateFrameQuality(imageProxy)
          averageLuma = frameQuality.averageLuma
        }
        lastAverageLuma = averageLuma
        lastFrameContrast = frameQuality.contrast
        lastFrameSharpness = frameQuality.sharpness
        lastFrameQualityScore = resolveFrameQualityScore(frameQuality)
        lastFrameQualityReason =
          resolveFrameQualityReason(frameQuality, lastFrameQualityScore)
        previewImageBase64 = renderAnalyzerPreviewIfDue(imageProxy, rotationDegrees, now)

        lastDecodeMode = "fast"
        fastDecodeCount += 1
        val fastStartedAtMs = System.currentTimeMillis()
        val fastResults =
          try {
            fastBarcodeReader.read(imageProxy)
          } catch (error: Throwable) {
            if (error.isToleratedDecoderMiss()) {
              emptyList()
            } else {
              throw error
            }
          }
        lastFastDecodeDurationMs = System.currentTimeMillis() - fastStartedAtMs

        if (fastResults.isNotEmpty()) {
          fastDecodeHitCount += 1
          clearAnalyzerError()
          fastResults.take(maxDetections)
        } else {
          val predictedMissStreak = consecutiveDecodeMissCount + 1L
          val shouldRunDeepDecode =
            shouldRunDeepDecode(
              now = now,
              averageLuma = averageLuma,
              contrast = frameQuality.contrast,
              sharpness = frameQuality.sharpness,
              qualityScore = lastFrameQualityScore,
              predictedMissStreak = predictedMissStreak,
            )
          val deepResults =
            if (shouldRunDeepDecode) {
              lastDecodeMode = "deep"
              deepDecodeCount += 1
              val deepStartedAtMs = System.currentTimeMillis()
              try {
                deepBarcodeReader.read(imageProxy)
              } catch (error: Throwable) {
                if (error.isToleratedDecoderMiss()) {
                  emptyList()
                } else {
                  throw error
                }
              }.also {
                lastDeepDecodeDurationMs = System.currentTimeMillis() - deepStartedAtMs
              }.take(maxDetections)
            } else {
              emptyList()
            }

          if (deepResults.isNotEmpty()) {
            deepDecodeHitCount += 1
            clearAnalyzerError()
            deepResults
          } else {
            if (
              shouldRunMlKitScan(now, predictedMissStreak, lastFrameQualityScore) &&
                startMlKitScan(
                  imageProxy = imageProxy,
                  rotationDegrees = rotationDegrees,
                  coordinateTransformer = coordinateTransformer,
                  previewImageBase64 = previewImageBase64,
                  startedAtMs = now,
                )
            ) {
              shouldCloseImageProxy = false
              lastAnalyzerDurationMs = System.currentTimeMillis() - analysisStartedAtMs
              logScannerPerformance(now, frameWidth, frameHeight)
              return
            }

            if (
              shouldRequestQualityFocusAssist(
                averageLuma = averageLuma,
                contrast = frameQuality.contrast,
                sharpness = frameQuality.sharpness,
                qualityScore = lastFrameQualityScore,
              )
            ) {
              requestCenterFocusAssist("quality-miss-${lastFrameQualityReason}")
            }

            clearAnalyzerError()
            deepResults
          }
        }
      } catch (error: Throwable) {
        recordAnalyzerError(
          "E_ANALYZER_FRAME",
          "Analyzer frame failed: ${error.readableMessage()}",
          error,
          now,
        )
        emptyList()
      } finally {
        if (shouldCloseImageProxy) {
          imageProxy.close()
        }
      }

    lastAnalyzerDurationMs = System.currentTimeMillis() - analysisStartedAtMs

    lastEmitAtMs = now
    if (results.isNotEmpty()) {
      recordDecodeHit(now)
    } else {
      recordDecodeMiss()
    }
    lastDetectionCount = results.size

    val detections = Arguments.createArray().apply {
      results.forEach { result ->
        val displayPoints = listOf(
          coordinateTransformer.toDisplayPoint(result.position.topLeft.x, result.position.topLeft.y),
          coordinateTransformer.toDisplayPoint(result.position.topRight.x, result.position.topRight.y),
          coordinateTransformer.toDisplayPoint(result.position.bottomRight.x, result.position.bottomRight.y),
          coordinateTransformer.toDisplayPoint(result.position.bottomLeft.x, result.position.bottomLeft.y),
        )
        val rawBytesBase64 = result.bytes?.let { bytes -> Base64.encodeToString(bytes, Base64.NO_WRAP) }
        val confidence = if (result.error == null) 1.0 else 0.0
        val trackedDetection = detectionTracker.track(
          HebarcodeDetectionTracker.DetectionInput(
            format = result.format.name,
            text = result.text,
            rawBytesBase64 = rawBytesBase64,
            contentType = result.contentType.name,
            points = displayPoints,
            confidence = confidence,
            trackingState = "decoded",
          ),
          now,
        )
        pushMap(
          Arguments.createMap().apply {
            putString("id", trackedDetection.id)
            putDouble("ageMs", trackedDetection.ageMs.toDouble())
            putInt("seenCount", trackedDetection.seenCount)
            putDouble("lastSeenAtMs", trackedDetection.lastSeenAtMs.toDouble())
            putString("format", result.format.name)
            putString("text", result.text)
            putString("contentType", result.contentType.name)
            putString("trackingState", trackedDetection.trackingState)
            rawBytesBase64?.let { encodedBytes ->
              putString("rawBytesBase64", encodedBytes)
            }
            putDouble("confidence", confidence)
            putArray(
              "points",
              Arguments.createArray().apply {
                displayPoints.forEach { point -> pushMap(pointMap(point)) }
              },
            )
            putString("coordinateSpace", "display-frame")
            putInt("imageRotationDegrees", coordinateTransformer.frameGeometry.normalizedRotationDegrees)
            putMap("imageCropRect", cropRectMap(coordinateTransformer.frameGeometry.cropRect))
          },
        )
      }
    }

    emitDetectionsFrame(
      frameId = "camera-$now",
      timestampMs = now,
      rotationDegrees = rotationDegrees,
      frameWidth = displayFrameWidth,
      frameHeight = displayFrameHeight,
      detections = detections,
      previewImageBase64 = previewImageBase64,
      previewImageTimestampMs = if (previewImageBase64 != null) now else null,
      coordinateGeometry = coordinateTransformer.frameGeometry,
    )

    if (!hasLoggedFirstEmittedFrame) {
      hasLoggedFirstEmittedFrame = true
      Log.i(TAG, "First detection frame emitted to JS with ${results.size} detections")
    }
    logScannerPerformance(now, frameWidth, frameHeight)
  }

  @ExperimentalGetImage
  private fun startMlKitScan(
    imageProxy: androidx.camera.core.ImageProxy,
    rotationDegrees: Int,
    coordinateTransformer: HebarcodeCoordinateTransformer,
    previewImageBase64: String?,
    startedAtMs: Long,
  ): Boolean {
    val scanner = mlKitBarcodeScanner ?: return false
    val mediaImage = imageProxy.image ?: return false
    val requestVersion = bindRequestVersion
    val boundAtMs = pipelineBoundAtMs
    val scanGeneration = beginMlKitScan()

    lastMlKitScanAtMs = startedAtMs
    lastDecodeMode = "mlkit"
    mlKitDecodeCount += 1

    val inputImage =
      try {
        InputImage.fromMediaImage(mediaImage, rotationDegrees)
      } catch (error: Throwable) {
        finishMlKitScan(scanGeneration)
        recordAnalyzerError(
          "E_MLKIT_FRAME",
          "ML Kit barcode frame failed: ${error.readableMessage()}",
          error,
          System.currentTimeMillis(),
        )
        return false
      }

    try {
      scanner
        .process(inputImage)
        .addOnSuccessListener { barcodes ->
          if (!isCurrentMlKitScan(scanGeneration, requestVersion, boundAtMs)) {
            return@addOnSuccessListener
          }

          val resultTimestampMs = System.currentTimeMillis()
          lastMlKitDecodeDurationMs = resultTimestampMs - startedAtMs
          val decodedBarcodes = barcodes.filter { barcode ->
            !barcode.rawValue.isNullOrBlank() || !barcode.displayValue.isNullOrBlank()
          }
          val detections = HebarcodeMlKitBarcodeMapper.buildDetections(
            barcodes = barcodes.take(maxDetections),
            coordinateTransformer = coordinateTransformer,
            detectionTracker = detectionTracker,
            timestampMs = resultTimestampMs,
          )
          val decodedDetectionCount = decodedBarcodes.size

          lastEmitAtMs = resultTimestampMs
          if (decodedDetectionCount > 0) {
            mlKitDecodeHitCount += decodedDetectionCount.toLong()
            recordDecodeHit(resultTimestampMs)
            clearAnalyzerError()
            val potentialCount = barcodes.size - decodedDetectionCount
            if (potentialCount > 0) {
              mlKitPotentialCount += potentialCount.toLong()
            }
          } else if (detections.size() > 0) {
            mlKitPotentialCount += detections.size().toLong()
            recordDecodeMiss()
            requestMlKitCandidateFocusAssist(
              barcodes = barcodes,
              coordinateTransformer = coordinateTransformer,
              reason = "mlkit-potential",
            )
          } else {
            recordDecodeMiss()
          }
          lastDetectionCount = detections.size()

          emitDetectionsFrame(
            frameId = "camera-mlkit-$resultTimestampMs",
            timestampMs = resultTimestampMs,
            rotationDegrees = rotationDegrees,
            frameWidth = coordinateTransformer.frameGeometry.displayWidth,
            frameHeight = coordinateTransformer.frameGeometry.displayHeight,
            detections = detections,
            previewImageBase64 = previewImageBase64,
            previewImageTimestampMs = if (previewImageBase64 != null) startedAtMs else null,
            coordinateGeometry = coordinateTransformer.frameGeometry,
          )
        }
        .addOnFailureListener { error ->
          if (!isCurrentMlKitScan(scanGeneration, requestVersion, boundAtMs)) {
            return@addOnFailureListener
          }

          recordAnalyzerError(
            "E_MLKIT_FRAME",
            "ML Kit barcode frame failed: ${error.readableMessage()}",
            error,
            System.currentTimeMillis(),
          )
          recordDecodeMiss()
        }
        .addOnCompleteListener {
          finishMlKitScan(scanGeneration)
          imageProxy.close()
        }
    } catch (error: Throwable) {
      finishMlKitScan(scanGeneration)
      recordAnalyzerError(
        "E_MLKIT_FRAME",
        "ML Kit barcode frame failed: ${error.readableMessage()}",
        error,
        System.currentTimeMillis(),
      )
      return false
    }

    return true
  }

  private fun beginMlKitScan(): Long {
    val scanGeneration = mlKitScanGeneration.incrementAndGet()
    mlKitBusy = true
    return scanGeneration
  }

  private fun finishMlKitScan(scanGeneration: Long) {
    if (mlKitScanGeneration.get() == scanGeneration) {
      mlKitBusy = false
    }
  }

  private fun invalidateMlKitScan() {
    mlKitScanGeneration.incrementAndGet()
    mlKitBusy = false
  }

  private fun isCurrentMlKitScan(
    scanGeneration: Long,
    requestVersion: Int,
    boundAtMs: Long,
  ): Boolean {
    return mlKitScanGeneration.get() == scanGeneration &&
      requestVersion == bindRequestVersion &&
      boundAtMs > 0L &&
      pipelineBoundAtMs == boundAtMs &&
      pipelineBound &&
      scanningRequested
  }

  private fun shouldRunMlKitScan(
    now: Long,
    predictedMissStreak: Long,
    qualityScore: Double,
  ): Boolean {
    if (!mlKitEnabled || mlKitBusy || mlKitBarcodeScanner == null) {
      return false
    }

    val lowQuality = qualityScore >= 0.0 && qualityScore <= LOW_FRAME_QUALITY_SCORE
    val intervalMs =
      if (
        lowQuality ||
          now - lastSuccessfulDetectionAtMs > STALE_DETECTION_WINDOW_MS ||
          predictedMissStreak >= MISS_STREAK_MLKIT_ACCELERATION_THRESHOLD
      ) {
        MLKIT_SCAN_INTERVAL_MS
      } else {
        MLKIT_RECENT_DETECTION_SCAN_INTERVAL_MS
      }

    return now - lastMlKitScanAtMs >= intervalMs
  }

  private fun requestMlKitCandidateFocusAssist(
    barcodes: List<Barcode>,
    coordinateTransformer: HebarcodeCoordinateTransformer,
    reason: String,
  ) {
    val target = barcodes
      .mapNotNull { barcode ->
        barcode.boundingBox?.takeIf { it.width() > 0 && it.height() > 0 }
      }
      .maxByOrNull { rect -> rect.width() * rect.height() }

    if (target == null) {
      requestCenterFocusAssist(reason)
      return
    }

    val displayCenter = coordinateTransformer.toDisplayPoint(target.centerX(), target.centerY())
    requestFocusAssistAtFramePoint(
      frameX = displayCenter.x,
      frameY = displayCenter.y,
      frameWidth = coordinateTransformer.frameGeometry.displayWidth,
      frameHeight = coordinateTransformer.frameGeometry.displayHeight,
      reason = reason,
    )
  }

  private fun coordinateTransformerFor(
    imageProxy: androidx.camera.core.ImageProxy,
    rotationDegrees: Int,
  ): HebarcodeCoordinateTransformer =
    HebarcodeCoordinateTransformer(
      HebarcodeCoordinateTransformer.FrameGeometry(
        imageWidth = imageProxy.width,
        imageHeight = imageProxy.height,
        rotationDegrees = rotationDegrees,
        cropRect = Rect(imageProxy.cropRect),
      ),
    )

  private fun resolveDisplayFrameWidth(
    frameWidth: Int,
    frameHeight: Int,
    rotationDegrees: Int,
  ): Int {
    val normalizedRotation = normalizeRotation(rotationDegrees)
    return if (normalizedRotation == 90 || normalizedRotation == 270) frameHeight else frameWidth
  }

  private fun resolveDisplayFrameHeight(
    frameWidth: Int,
    frameHeight: Int,
    rotationDegrees: Int,
  ): Int {
    val normalizedRotation = normalizeRotation(rotationDegrees)
    return if (normalizedRotation == 90 || normalizedRotation == 270) frameWidth else frameHeight
  }

  private fun normalizeRotation(rotationDegrees: Int): Int =
    ((rotationDegrees % 360) + 360) % 360

  private fun emitDetectionsFrame(
    frameId: String,
    timestampMs: Long,
    rotationDegrees: Int,
    frameWidth: Int,
    frameHeight: Int,
    detections: WritableArray,
    previewImageBase64: String?,
    previewImageTimestampMs: Long?,
    coordinateGeometry: HebarcodeCoordinateTransformer.FrameGeometry? = null,
  ) {
    emittedFrameCount += 1
    lastEmittedAtMs = timestampMs
    lastDetectionCount = detections.size()
    val framePayload: WritableMap =
      Arguments.createMap().apply {
        putString("frameId", frameId)
        putDouble("timestampMs", timestampMs.toDouble())
        putString("source", "camera")
        putInt("rotationDegrees", rotationDegrees)
        putString("coordinateSpace", "display-frame")
        putInt("imageRotationDegrees", coordinateGeometry?.normalizedRotationDegrees ?: normalizeRotation(rotationDegrees))
        coordinateGeometry?.let { geometry ->
          putMap("imageCropRect", cropRectMap(geometry.cropRect))
        }
        putMap(
          "frameSize",
          Arguments.createMap().apply {
            putInt("width", frameWidth)
            putInt("height", frameHeight)
          },
        )
        putArray("detections", detections)
        if (previewImageBase64 != null) {
          putString("previewImageBase64", previewImageBase64)
          putString("previewImageMimeType", "image/jpeg")
          putDouble("previewImageTimestampMs", (previewImageTimestampMs ?: timestampMs).toDouble())
        }
      }

    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(HebarcodeScannerModule.DETECTIONS_EVENT_NAME, framePayload)
  }

  private fun resetPerfLogCounters(now: Long) {
    lastPerfLogAtMs = now
    lastPerfLogAnalyzedCount = analyzedFrameCount
    lastPerfLogEmittedCount = emittedFrameCount
    lastPerfLogPreviewCount = analyzerPreviewFrameCount
  }

  private fun logScannerPerformance(now: Long, frameWidth: Int, frameHeight: Int) {
    val previousLogAtMs = lastPerfLogAtMs
    if (previousLogAtMs <= 0L) {
      resetPerfLogCounters(now)
      return
    }

    val elapsedMs = now - previousLogAtMs
    if (elapsedMs < PERF_LOG_INTERVAL_MS) {
      return
    }

    val elapsedSeconds = elapsedMs.toDouble() / 1000.0
    val analyzedDelta = (analyzedFrameCount - lastPerfLogAnalyzedCount).coerceAtLeast(0L)
    val emittedDelta = (emittedFrameCount - lastPerfLogEmittedCount).coerceAtLeast(0L)
    val previewDelta = (analyzerPreviewFrameCount - lastPerfLogPreviewCount).coerceAtLeast(0L)

    Log.i(
      TAG,
      "Perf analyzer=${formatFps(analyzedDelta / elapsedSeconds)} " +
        "events=${formatFps(emittedDelta / elapsedSeconds)} " +
        "fallbackPreview=${formatFps(previewDelta / elapsedSeconds)} " +
        "frame=${frameWidth}x$frameHeight profile=${currentAnalysisProfile().name} " +
        "bind=${currentBindingStrategy().name} preview=${previewStreamState.lowercase(Locale.US)} " +
        "decode=$lastDecodeMode fast=${lastFastDecodeDurationMs}ms " +
        "deep=${lastDeepDecodeDurationMs}ms mlkit=${lastMlKitDecodeDurationMs}ms " +
        "hits=$fastDecodeHitCount/$deepDecodeHitCount/$mlKitDecodeHitCount " +
        "streak=$consecutiveDecodeHitCount/$consecutiveDecodeMissCount " +
        "quality=${formatQualityScore(lastFrameQualityScore)}:${lastFrameQualityReason} " +
        "luma=${formatLuma(lastAverageLuma)} contrast=${formatMetric(lastFrameContrast)} " +
        "sharp=${formatMetric(lastFrameSharpness)} " +
        "potential=$mlKitPotentialCount focus=$focusAssistCount " +
        "zoom=$zoomAssistCount reset=$zoomResetCount " +
        "detections=$lastDetectionCount " +
        "camera=$cameraStateType",
    )
    resetPerfLogCounters(now)
  }

  private fun formatFps(value: Double): String =
    String.format(Locale.US, "%.1ffps", value.coerceAtLeast(0.0))

  private fun formatRatio(value: Float): String =
    String.format(Locale.US, "%.2fx", value.coerceAtLeast(0f))

  private fun formatLuma(value: Double): String =
    if (value < 0.0) "-" else String.format(Locale.US, "%.0f", value)

  private fun formatMetric(value: Double): String =
    if (value < 0.0) "-" else String.format(Locale.US, "%.1f", value)

  private fun formatQualityScore(value: Double): String =
    if (value < 0.0) "-" else String.format(Locale.US, "%.2f", value)

  private fun ReadableMap?.safeBoolean(key: String, fallback: Boolean): Boolean {
    if (this == null || !hasKey(key) || isNull(key)) {
      return fallback
    }
    return try {
      when (getType(key)) {
        ReadableType.Boolean -> getBoolean(key)
        else -> fallback
      }
    } catch (_: Throwable) {
      fallback
    }
  }

  private fun ReadableMap?.safeDouble(key: String, fallback: Double): Double {
    if (this == null || !hasKey(key) || isNull(key)) {
      return fallback
    }
    return try {
      when (getType(key)) {
        ReadableType.Number -> getDouble(key).takeIf { it.isFinite() } ?: fallback
        else -> fallback
      }
    } catch (_: Throwable) {
      fallback
    }
  }

  private fun ReadableMap?.safeLong(key: String, fallback: Long): Long {
    val value = safeDouble(key, fallback.toDouble())
    return if (value.isFinite()) value.toLong() else fallback
  }

  private fun ReadableMap?.safeInt(key: String, fallback: Int): Int {
    val value = safeDouble(key, fallback.toDouble())
    return if (value.isFinite()) value.toInt() else fallback
  }

  private fun ReadableMap?.safeString(key: String, fallback: String): String {
    if (this == null || !hasKey(key) || isNull(key)) {
      return fallback
    }
    return try {
      when (getType(key)) {
        ReadableType.String -> getString(key) ?: fallback
        else -> fallback
      }
    } catch (_: Throwable) {
      fallback
    }
  }

  private fun hasCameraPermission(context: ReactApplicationContext): Boolean {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun configureCameraBehavior(builder: Preview.Builder) {
    Camera2Interop.Extender(builder).apply {
      setCaptureRequestOption(
        CaptureRequest.CONTROL_AF_MODE,
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE,
      )
      setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
      setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
    }
  }

  private fun configureCameraBehavior(builder: ImageAnalysis.Builder) {
    Camera2Interop.Extender(builder).apply {
      setCaptureRequestOption(
        CaptureRequest.CONTROL_AF_MODE,
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE,
      )
      setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
      setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
    }
  }

  private fun resolveEffectiveThrottleMs(now: Long): Long {
    if (!assistModeEnabled) {
      return detectionThrottleMs
    }

    return if (now - lastSuccessfulDetectionAtMs > STALE_DETECTION_WINDOW_MS) {
      ((detectionThrottleMs * 3L) / 4L).coerceAtLeast(MIN_ASSIST_THROTTLE_MS)
    } else {
      detectionThrottleMs
    }
  }

  private fun shouldRunDeepDecode(
    now: Long,
    averageLuma: Double,
    contrast: Double,
    sharpness: Double,
    qualityScore: Double,
    predictedMissStreak: Long,
  ): Boolean {
    if (!assistModeEnabled || !deepScanEnabled) {
      return false
    }

    val noRecentDetection = now - lastSuccessfulDetectionAtMs > STALE_DETECTION_WINDOW_MS
    val lowLight = averageLuma >= 0.0 && averageLuma <= LOW_LIGHT_LUMA_THRESHOLD
    val lowContrast = contrast >= 0.0 && contrast <= LOW_CONTRAST_THRESHOLD
    val blurry = sharpness >= 0.0 && sharpness <= LOW_SHARPNESS_THRESHOLD
    val lowQuality = qualityScore >= 0.0 && qualityScore <= LOW_FRAME_QUALITY_SCORE
    val firstFrames = analyzedFrameCount <= 2L
    val repeatedMiss = predictedMissStreak >= MISS_STREAK_DEEP_SCAN_THRESHOLD
    val deepDecodeIsDue = now - lastDeepDecodeAtMs >= DEEP_SCAN_INTERVAL_MS

    if (
      deepDecodeIsDue &&
        (firstFrames || noRecentDetection || lowLight || lowContrast || blurry || lowQuality ||
          repeatedMiss)
    ) {
      lastDeepDecodeAtMs = now
      return true
    }

    return false
  }

  private fun currentAnalysisProfile(): AnalysisProfile {
    return analysisProfiles[analysisProfileIndex.coerceIn(0, analysisProfiles.lastIndex)]
  }

  private fun resetAnalysisProfile() {
    analysisProfileIndex =
      preferredAnalysisProfileIndex.takeIf { it in analysisProfiles.indices } ?: 0
    analysisRetryCount = 0
    previewImplementationProfileIndex =
      preferredPreviewImplementationProfileIndex
        .takeIf { it in previewImplementationProfiles.indices }
        ?: 0
    bindingStrategyIndex = resolveStartupBindingStrategyIndex()
    if (!currentBindingStrategy().bindPreview) {
      previewImplementationProfileIndex = 0
    }
    nativeFrameFlowRecoveryCount = 0
  }

  private fun resolveStartupBindingStrategyIndex(): Int {
    if (shouldPreferAnalyzerOnlyStartup()) {
      return firstAnalyzerOnlyBindingStrategyIndex()
    }

    return preferredBindingStrategyIndex
      .takeIf { it in bindingStrategies.indices && bindingStrategies[it].bindPreview }
      ?: 0
  }

  private fun firstAnalyzerOnlyBindingStrategyIndex(): Int {
    return bindingStrategies.indexOfFirst { !it.bindPreview }.takeIf { it >= 0 } ?: 0
  }

  private fun shouldPreferAnalyzerOnlyStartup(): Boolean {
    return Build.MANUFACTURER.equals("samsung", ignoreCase = true) &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM
  }

  private fun loadPreferredFrameFlowProfile(context: ReactApplicationContext) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getInt(PREF_FRAME_FLOW_PROFILE_VERSION, 0) != FRAME_FLOW_PROFILE_VERSION) {
      preferredAnalysisProfileIndex = -1
      preferredPreviewImplementationProfileIndex = -1
      preferredBindingStrategyIndex = -1
      Log.i(TAG, "Ignoring stale scanner frame-flow profile cache")
      return
    }

    preferredAnalysisProfileIndex = prefs.getInt(PREF_ANALYSIS_PROFILE_INDEX, -1)
    preferredPreviewImplementationProfileIndex = prefs.getInt(PREF_PREVIEW_PROFILE_INDEX, -1)
    preferredBindingStrategyIndex = prefs.getInt(PREF_BINDING_STRATEGY_INDEX, -1)

    if (preferredBindingStrategyIndex in bindingStrategies.indices) {
      Log.i(
        TAG,
        "Loaded preferred frame-flow profile profile=${
          analysisProfiles[
            preferredAnalysisProfileIndex.coerceIn(0, analysisProfiles.lastIndex)
          ].name
        } preview=${
          previewImplementationProfiles[
            preferredPreviewImplementationProfileIndex.coerceIn(
              0,
              previewImplementationProfiles.lastIndex,
            )
          ].name
        } bind=${bindingStrategies[preferredBindingStrategyIndex].name}",
      )
    }
  }

  private fun rememberSuccessfulFrameFlowProfile() {
    if (hasSavedSuccessfulProfileForBind) {
      return
    }

    if (
      !currentBindingStrategy().bindPreview ||
        !isPreviewStreamStreaming() ||
        pipelineBoundAtMs <= 0L ||
        lastAnalyzedAtMs < pipelineBoundAtMs
    ) {
      return
    }

    hasSavedSuccessfulProfileForBind = true
    val context = reactContext ?: return
    preferredAnalysisProfileIndex = analysisProfileIndex
    preferredPreviewImplementationProfileIndex = previewImplementationProfileIndex
    preferredBindingStrategyIndex = bindingStrategyIndex
    context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putInt(PREF_FRAME_FLOW_PROFILE_VERSION, FRAME_FLOW_PROFILE_VERSION)
      .putInt(PREF_ANALYSIS_PROFILE_INDEX, analysisProfileIndex)
      .putInt(PREF_PREVIEW_PROFILE_INDEX, previewImplementationProfileIndex)
      .putInt(PREF_BINDING_STRATEGY_INDEX, bindingStrategyIndex)
      .apply()
    Log.i(
      TAG,
      "Saved preferred frame-flow profile profile=${currentAnalysisProfile().name} " +
        "preview=${currentPreviewImplementationProfile().name} bind=${currentBindingStrategy().name}",
    )
  }

  private fun advanceAnalysisProfileForRetry() {
    if (isFrameFlowActive() || analysisProfileIndex >= analysisProfiles.lastIndex) {
      return
    }

    analysisProfileIndex += 1
  }

  private fun currentPreviewImplementationProfile(): PreviewImplementationProfile {
    return previewImplementationProfiles[
      previewImplementationProfileIndex.coerceIn(0, previewImplementationProfiles.lastIndex)
    ]
  }

  private fun currentBindingStrategy(): BindingStrategy {
    return bindingStrategies[bindingStrategyIndex.coerceIn(0, bindingStrategies.lastIndex)]
  }

  private fun maxNativeFrameFlowRecoveryCount(): Int =
    (analysisProfiles.size * frameFlowProfileCountPerAnalysisProfile()) - 1

  private fun frameFlowProfileCountPerAnalysisProfile(): Int {
    return bindingStrategies.sumOf { strategy ->
      if (strategy.bindPreview) previewImplementationProfiles.size else 1
    }
  }

  private fun advanceRecoveryProfileForRetry() {
    if (isFrameFlowActive()) {
      return
    }

    val bindingStrategy = currentBindingStrategy()

    if (shouldPreferAnalyzerOnlyStartup() && bindingStrategy.bindPreview) {
      bindingStrategyIndex = firstAnalyzerOnlyBindingStrategyIndex()
      previewImplementationProfileIndex = 0
      return
    }

    if (
      bindingStrategy.bindPreview &&
        previewImplementationProfileIndex < previewImplementationProfiles.lastIndex
    ) {
      previewImplementationProfileIndex += 1
      return
    }

    previewImplementationProfileIndex = 0

    if (bindingStrategyIndex < bindingStrategies.lastIndex) {
      bindingStrategyIndex += 1
      return
    }

    bindingStrategyIndex = 0
    advanceAnalysisProfileForRetry()
  }

  private fun cameraStateErrorLabel(error: CameraState.StateError): String {
    val base =
      when (error.code) {
        CameraState.ERROR_MAX_CAMERAS_IN_USE -> "max-cameras-in-use"
        CameraState.ERROR_CAMERA_IN_USE -> "camera-in-use"
        CameraState.ERROR_OTHER_RECOVERABLE_ERROR -> "other-recoverable-error"
        CameraState.ERROR_STREAM_CONFIG -> "stream-config"
        CameraState.ERROR_CAMERA_DISABLED -> "camera-disabled"
        CameraState.ERROR_CAMERA_FATAL_ERROR -> "camera-fatal-error"
        CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED -> "do-not-disturb-mode-enabled"
        CameraState.ERROR_CAMERA_REMOVED -> "camera-removed"
        else -> "unknown-camera-error"
      }
    val cause = error.cause?.readableMessage()

    return if (cause.isNullOrBlank()) base else "$base: $cause"
  }

  private fun fallbackRuleLabel(rule: Int): String {
    return when (rule) {
      ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER -> "closest-higher-then-lower"
      ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER -> "closest-lower-then-higher"
      ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER -> "closest-higher"
      ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER -> "closest-lower"
      ResolutionStrategy.FALLBACK_RULE_NONE -> "none"
      else -> "unknown"
    }
  }

  private fun updateTorchState(enabled: Boolean) {
    val camera = boundCamera
    val canUseTorch = camera?.cameraInfo?.hasFlashUnit() == true
    val shouldEnable = enabled && canUseTorch

    if (torchEnabled == shouldEnable) {
      return
    }

    try {
      camera?.cameraControl?.enableTorch(shouldEnable)
      torchEnabled = shouldEnable
    } catch (error: Throwable) {
      torchEnabled = false
      Log.w(TAG, "Unable to update torch: ${error.readableMessage()}", error)
    }
  }

  private fun shouldEstimateFrameQuality(): Boolean {
    return assistModeEnabled
  }

  private fun resolveFrameQualityScore(
    metrics: HebarcodeAnalyzerPreviewRenderer.FrameQualityMetrics,
  ): Double {
    if (metrics.sampleCount <= 0 || metrics.averageLuma < 0.0) {
      return -1.0
    }

    val lumaScore =
      when {
        metrics.averageLuma < 48.0 -> metrics.averageLuma / 48.0
        metrics.averageLuma > 220.0 -> (255.0 - metrics.averageLuma).coerceAtLeast(0.0) / 35.0
        else -> 1.0
      }.coerceIn(0.0, 1.0)
    val contrastScore = (metrics.contrast / 44.0).coerceIn(0.0, 1.0)
    val sharpnessScore = (metrics.sharpness / 18.0).coerceIn(0.0, 1.0)

    return (lumaScore * 0.34 + contrastScore * 0.33 + sharpnessScore * 0.33)
      .coerceIn(0.0, 1.0)
  }

  private fun resolveFrameQualityReason(
    metrics: HebarcodeAnalyzerPreviewRenderer.FrameQualityMetrics,
    qualityScore: Double,
  ): String {
    if (qualityScore < 0.0 || metrics.sampleCount <= 0) {
      return "unknown"
    }

    return when {
      metrics.averageLuma <= LOW_LIGHT_LUMA_THRESHOLD -> "low-light"
      metrics.averageLuma >= 220.0 -> "overexposed"
      metrics.contrast <= LOW_CONTRAST_THRESHOLD -> "low-contrast"
      metrics.sharpness <= LOW_SHARPNESS_THRESHOLD -> "soft-focus"
      qualityScore <= LOW_FRAME_QUALITY_SCORE -> "low-quality"
      else -> "good"
    }
  }

  private fun shouldRequestQualityFocusAssist(
    averageLuma: Double,
    contrast: Double,
    sharpness: Double,
    qualityScore: Double,
  ): Boolean {
    if (!assistModeEnabled) {
      return false
    }

    return (averageLuma >= 0.0 && averageLuma <= LOW_LIGHT_LUMA_THRESHOLD) ||
      (contrast >= 0.0 && contrast <= LOW_CONTRAST_THRESHOLD) ||
      (sharpness >= 0.0 && sharpness <= LOW_SHARPNESS_THRESHOLD) ||
      (qualityScore >= 0.0 && qualityScore <= LOW_FRAME_QUALITY_SCORE)
  }

  private fun renderAnalyzerPreviewIfDue(
    imageProxy: androidx.camera.core.ImageProxy,
    rotationDegrees: Int,
    now: Long,
  ): String? {
    if (!analyzerPreviewEnabled) {
      return null
    }

    val previewSink = analyzerPreviewSink
    val nativePreviewDue =
      previewSink != null &&
        !isPreviewStreamStreaming() &&
        now - lastNativePreviewImageAtMs >= NATIVE_PREVIEW_IMAGE_INTERVAL_MS
    val bridgePreviewDue =
      previewSink == null && now - lastPreviewImageAtMs >= BRIDGE_PREVIEW_IMAGE_INTERVAL_MS

    if (!nativePreviewDue && !bridgePreviewDue) {
      return null
    }

    var bitmap: Bitmap? = null

    try {
      bitmap =
        HebarcodeAnalyzerPreviewRenderer.buildAnalyzerPreviewBitmap(
          imageProxy,
          rotationDegrees,
          if (nativePreviewDue) NATIVE_PREVIEW_IMAGE_MAX_WIDTH else BRIDGE_PREVIEW_IMAGE_MAX_WIDTH,
        ) ?: return null

      val bridgePreviewBase64 =
        if (bridgePreviewDue) {
          lastPreviewImageAtMs = now
          HebarcodeAnalyzerPreviewRenderer.encodePreviewBitmapBase64(
            bitmap,
            PREVIEW_IMAGE_JPEG_QUALITY,
          )
        } else {
          null
        }

      if (nativePreviewDue) {
        val activePreviewSink = previewSink ?: return bridgePreviewBase64
        lastNativePreviewImageAtMs = now
        analyzerPreviewFrameCount += 1
        lastAnalyzerPreviewAtMs = now
        if (!hasLoggedAnalyzerFallbackPreview) {
          hasLoggedAnalyzerFallbackPreview = true
          Log.i(TAG, "Analyzer fallback preview active at ${bitmap.width}x${bitmap.height}")
        }

        val bitmapForSink = bitmap
        bitmap = null
        showAnalyzerPreviewFrame(activePreviewSink, bitmapForSink, now)
      }

      return bridgePreviewBase64
    } catch (error: Throwable) {
      Log.w(TAG, "Unable to build analyzer preview image: ${error.readableMessage()}", error)
      return null
    } finally {
      bitmap?.recycle()
    }
  }

  private fun showAnalyzerPreviewFrame(
    previewSink: AnalyzerPreviewSink,
    bitmap: Bitmap,
    timestampMs: Long,
  ) {
    mainHandler.post {
      if (
        analyzerPreviewSink === previewSink &&
          analyzerPreviewEnabled &&
          !isPreviewStreamStreaming()
      ) {
        previewSink.showAnalyzerPreviewFrame(bitmap, timestampMs)
      } else {
        bitmap.recycle()
      }
    }
  }

  private fun hideAnalyzerPreviewSink() {
    analyzerPreviewSink?.hideAnalyzerPreviewFrame()
  }

  private fun pointMap(point: PointF): WritableMap =
    Arguments.createMap().apply {
      putDouble("x", point.x.toDouble())
      putDouble("y", point.y.toDouble())
    }

  private fun pointMap(x: Int, y: Int): WritableMap =
    Arguments.createMap().apply {
      putInt("x", x)
      putInt("y", y)
    }

  private fun cropRectMap(rect: Rect): WritableMap =
    Arguments.createMap().apply {
      putInt("left", rect.left)
      putInt("top", rect.top)
      putInt("right", rect.right)
      putInt("bottom", rect.bottom)
      putInt("width", rect.width())
      putInt("height", rect.height())
    }
}
