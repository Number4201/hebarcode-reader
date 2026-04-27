package com.hebarcode.reader

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.camera2.CaptureRequest
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
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import zxingcpp.BarcodeReader

object HebarcodeScannerController {
  private const val TAG = "HebarcodeScanner"
  private const val PREFS_NAME = "hebarcode_scanner"
  private const val PREF_ANALYSIS_PROFILE_INDEX = "analysis_profile_index"
  private const val PREF_PREVIEW_PROFILE_INDEX = "preview_profile_index"
  private const val PREF_BINDING_STRATEGY_INDEX = "binding_strategy_index"

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

  @Volatile private var scanningRequested = false
  @Volatile private var pipelineBound = false
  @Volatile private var assistModeEnabled = true
  @Volatile private var analyzerPreviewEnabled = true
  @Volatile private var autoTorchEnabled = false
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
  private const val DEEP_SCAN_INTERVAL_MS = 650L
  private const val MIN_ASSIST_THROTTLE_MS = 80L
  private const val MAX_ERROR_MESSAGE_LENGTH = 180
  private const val BRIDGE_PREVIEW_IMAGE_INTERVAL_MS = 1200L
  private const val BRIDGE_PREVIEW_IMAGE_MAX_WIDTH = 320
  private const val NATIVE_PREVIEW_IMAGE_INTERVAL_MS = 20L
  private const val NATIVE_PREVIEW_IMAGE_MAX_WIDTH = 540
  private const val PREVIEW_IMAGE_JPEG_QUALITY = 46
  private const val FRAME_FLOW_ACTIVE_WINDOW_MS = 2500L
  private const val FRAME_FLOW_STARTUP_WATCHDOG_MS = 1800L
  private const val ANALYZER_ERROR_LOG_INTERVAL_MS = 5000L
  private const val PERF_LOG_INTERVAL_MS = 2000L

  private data class DecodeProfile(
    val mode: String,
    val reader: BarcodeReader,
  )

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
      bindingStrategyIndex = 0
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
    clearStartupError()
    clearAnalyzerError()
    Log.i(TAG, "stopScanning requested")
    unbindCamera()
  }

  fun setDetectionThrottleMs(value: Long) {
    detectionThrottleMs = value.coerceAtLeast(33L)
  }

  fun setAssistModeEnabled(value: Boolean) {
    assistModeEnabled = value

    if (!value) {
      updateTorchState(false)
    }
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

  fun isTorchEnabled(): Boolean = autoTorchEnabled

  fun isAnalyzerPreviewEnabled(): Boolean = analyzerPreviewEnabled

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
    observeCameraState(boundCamera, owner)
    val now = System.currentTimeMillis()
    pipelineBound = true
    pipelineBoundAtMs = now
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
    autoTorchEnabled = false
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
    imageAnalysis = null
    preview = null
    boundCamera = null
    cameraStateType = "UNBOUND"
    cameraStateErrorCode = 0
    cameraStateErrorMessage = null
    pipelineBound = false
    pipelineBoundAtMs = 0L
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
    hasLoggedAnalyzerFallbackPreview = false
    resetPerfLogCounters(0L)
    autoTorchEnabled = false
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
      "No analyzer frame received ${FRAME_FLOW_STARTUP_WATCHDOG_MS}ms after bind; " +
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
    }
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

  private fun analyzeFrame(imageProxy: androidx.camera.core.ImageProxy) {
    if (!scanningRequested) {
      imageProxy.close()
      return
    }

    val now = System.currentTimeMillis()
    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    val frameWidth = imageProxy.cropRect.width()
    val frameHeight = imageProxy.cropRect.height()
    analyzedFrameCount += 1
    lastAnalyzedAtMs = now
    lastBindBlockReason = null

    if (!hasLoggedFirstAnalyzedFrame) {
      hasLoggedFirstAnalyzedFrame = true
      Log.i(TAG, "First frame received by analyzer: ${frameWidth}x${frameHeight} rotation=$rotationDegrees")
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
      logScannerPerformance(now, frameWidth, frameHeight)
      return
    }

    val shouldEstimateLuma = shouldEstimateAverageLuma()
    var averageLuma = -1.0
    var previewImageBase64: String? = null
    val results =
      try {
        if (shouldEstimateLuma) {
          averageLuma = estimateAverageLuma(imageProxy)
        }
        previewImageBase64 = renderAnalyzerPreviewIfDue(imageProxy, rotationDegrees, now)
        val decodeProfile = selectDecodeProfile(now, averageLuma)
        lastDecodeMode = decodeProfile.mode
        if (decodeProfile.mode == "deep") {
          deepDecodeCount += 1
        } else {
          fastDecodeCount += 1
        }
        try {
          val decoded = decodeProfile.reader.read(imageProxy)
          clearAnalyzerError()
          decoded
        } catch (error: Throwable) {
          if (error.isToleratedDecoderMiss()) {
            clearAnalyzerError()
            emptyList()
          } else {
            throw error
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
        imageProxy.close()
      }

    lastEmitAtMs = now
    if (results.isNotEmpty()) {
      lastSuccessfulDetectionAtMs = now
    }
    lastDetectionCount = results.size
    updateAssistLighting(now, averageLuma, results.isNotEmpty())

    val detections = Arguments.createArray().apply {
      results.forEachIndexed { index, result ->
        pushMap(
          Arguments.createMap().apply {
            putString("id", "${result.format.name}|${result.text ?: ""}|$index")
            putString("format", result.format.name)
            putString("text", result.text)
            putString("contentType", result.contentType.name)
            result.bytes?.let { bytes ->
              putString("rawBytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            putDouble("confidence", if (result.error == null) 1.0 else 0.0)
            putArray(
              "points",
              Arguments.createArray().apply {
                pushMap(pointMap(result.position.topLeft.x, result.position.topLeft.y))
                pushMap(pointMap(result.position.topRight.x, result.position.topRight.y))
                pushMap(pointMap(result.position.bottomRight.x, result.position.bottomRight.y))
                pushMap(pointMap(result.position.bottomLeft.x, result.position.bottomLeft.y))
              },
            )
          },
        )
      }
    }

    emitDetectionsFrame(
      frameId = "camera-$now",
      timestampMs = now,
      rotationDegrees = rotationDegrees,
      frameWidth = frameWidth,
      frameHeight = frameHeight,
      detections = detections,
      previewImageBase64 = previewImageBase64,
      previewImageTimestampMs = if (previewImageBase64 != null) now else null,
    )

    if (!hasLoggedFirstEmittedFrame) {
      hasLoggedFirstEmittedFrame = true
      Log.i(TAG, "First detection frame emitted to JS with ${results.size} detections")
    }
    logScannerPerformance(now, frameWidth, frameHeight)
  }

  private fun emitDetectionsFrame(
    frameId: String,
    timestampMs: Long,
    rotationDegrees: Int,
    frameWidth: Int,
    frameHeight: Int,
    detections: WritableArray,
    previewImageBase64: String?,
    previewImageTimestampMs: Long?,
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
        "decode=$lastDecodeMode detections=$lastDetectionCount camera=$cameraStateType",
    )
    resetPerfLogCounters(now)
  }

  private fun formatFps(value: Double): String =
    String.format(Locale.US, "%.1ffps", value.coerceAtLeast(0.0))

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

  private fun selectDecodeProfile(now: Long, averageLuma: Double): DecodeProfile {
    if (!assistModeEnabled) {
      return DecodeProfile("fast", fastBarcodeReader)
    }

    val noRecentDetection = now - lastSuccessfulDetectionAtMs > STALE_DETECTION_WINDOW_MS
    val lowLight = averageLuma >= 0.0 && averageLuma <= LOW_LIGHT_LUMA_THRESHOLD
    val firstFrames = analyzedFrameCount <= 2L
    val deepDecodeIsDue = now - lastDeepDecodeAtMs >= DEEP_SCAN_INTERVAL_MS

    if (deepDecodeIsDue && (firstFrames || noRecentDetection || lowLight)) {
      lastDeepDecodeAtMs = now
      return DecodeProfile("deep", deepBarcodeReader)
    }

    return DecodeProfile("fast", fastBarcodeReader)
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
    bindingStrategyIndex =
      preferredBindingStrategyIndex.takeIf { it in bindingStrategies.indices } ?: 0
    nativeFrameFlowRecoveryCount = 0
  }

  private fun loadPreferredFrameFlowProfile(context: ReactApplicationContext) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
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

    hasSavedSuccessfulProfileForBind = true
    val context = reactContext ?: return
    preferredAnalysisProfileIndex = analysisProfileIndex
    preferredPreviewImplementationProfileIndex = previewImplementationProfileIndex
    preferredBindingStrategyIndex = bindingStrategyIndex
    context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
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

  private fun advancePreviewImplementationProfileForRetry() {
    if (isPreviewStreamStreaming()) {
      return
    }

    previewImplementationProfileIndex =
      (previewImplementationProfileIndex + 1) % previewImplementationProfiles.size
  }

  private fun currentBindingStrategy(): BindingStrategy {
    return bindingStrategies[bindingStrategyIndex.coerceIn(0, bindingStrategies.lastIndex)]
  }

  private fun maxNativeFrameFlowRecoveryCount(): Int =
    (analysisProfiles.size * bindingStrategies.size) - 1

  private fun advanceRecoveryProfileForRetry() {
    if (isFrameFlowActive()) {
      return
    }

    val shouldAdvanceAnalysisProfile = bindingStrategyIndex >= bindingStrategies.lastIndex
    advancePreviewImplementationProfileForRetry()
    advanceBindingStrategyForRetry()

    if (shouldAdvanceAnalysisProfile) {
      advanceAnalysisProfileForRetry()
    }
  }

  private fun advanceBindingStrategyForRetry() {
    if (isFrameFlowActive()) {
      return
    }

    bindingStrategyIndex = (bindingStrategyIndex + 1) % bindingStrategies.size
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

  private fun updateAssistLighting(now: Long, averageLuma: Double, hasDetections: Boolean) {
    if (!assistModeEnabled) {
      updateTorchState(false)
      return
    }

    val camera = boundCamera ?: return
    if (!camera.cameraInfo.hasFlashUnit()) {
      return
    }

    val detectionIsStale = now - lastSuccessfulDetectionAtMs > STALE_DETECTION_WINDOW_MS
    val shouldEnableTorch =
      !hasDetections &&
        detectionIsStale &&
        averageLuma >= 0.0 &&
        averageLuma <= LOW_LIGHT_LUMA_THRESHOLD

    if (hasDetections && autoTorchEnabled) {
      updateTorchState(false)
      return
    }

    updateTorchState(shouldEnableTorch)
  }

  private fun updateTorchState(enabled: Boolean) {
    if (autoTorchEnabled == enabled) {
      return
    }

    boundCamera?.cameraControl?.enableTorch(enabled)
    autoTorchEnabled = enabled
  }

  private fun shouldEstimateAverageLuma(): Boolean {
    if (!assistModeEnabled) {
      return false
    }

    return boundCamera?.cameraInfo?.hasFlashUnit() == true
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
        buildAnalyzerPreviewBitmap(
          imageProxy,
          rotationDegrees,
          if (nativePreviewDue) NATIVE_PREVIEW_IMAGE_MAX_WIDTH else BRIDGE_PREVIEW_IMAGE_MAX_WIDTH,
        ) ?: return null

      val bridgePreviewBase64 =
        if (bridgePreviewDue) {
          lastPreviewImageAtMs = now
          encodePreviewBitmapBase64(bitmap)
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

  private fun encodePreviewBitmapBase64(bitmap: Bitmap): String {
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, PREVIEW_IMAGE_JPEG_QUALITY, output)
    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  private fun buildAnalyzerPreviewBitmap(
    imageProxy: androidx.camera.core.ImageProxy,
    rotationDegrees: Int,
    maxWidth: Int,
  ): Bitmap? {
    val plane = imageProxy.planes.firstOrNull() ?: return null
    val crop = imageProxy.cropRect
    val sourceWidth = crop.width().coerceAtLeast(1)
    val sourceHeight = crop.height().coerceAtLeast(1)
    val normalizedRotation = ((rotationDegrees % 360) + 360) % 360
    val rotatedWidth = if (normalizedRotation == 90 || normalizedRotation == 270) sourceHeight else sourceWidth
    val rotatedHeight = if (normalizedRotation == 90 || normalizedRotation == 270) sourceWidth else sourceHeight
    val targetWidth = minOf(maxWidth, rotatedWidth).coerceAtLeast(1)
    val targetHeight = ((rotatedHeight.toDouble() * targetWidth.toDouble()) / rotatedWidth.toDouble())
      .toInt()
      .coerceAtLeast(1)
    val cropLeft = crop.left
    val cropTop = crop.top
    val yBuffer = plane.buffer.duplicate()
    val yRowStride = plane.rowStride
    val yPixelStride = plane.pixelStride.coerceAtLeast(1)
    val pixels = IntArray(targetWidth * targetHeight)

    for (targetY in 0 until targetHeight) {
      val rotatedY = (targetY * rotatedHeight) / targetHeight

      for (targetX in 0 until targetWidth) {
        val rotatedX = (targetX * rotatedWidth) / targetWidth
        val mappedX: Int
        val mappedY: Int
        when (normalizedRotation) {
          90 -> {
            mappedX = rotatedY
            mappedY = sourceHeight - 1 - rotatedX
          }
          180 -> {
            mappedX = sourceWidth - 1 - rotatedX
            mappedY = sourceHeight - 1 - rotatedY
          }
          270 -> {
            mappedX = sourceWidth - 1 - rotatedY
            mappedY = rotatedX
          }
          else -> {
            mappedX = rotatedX
            mappedY = rotatedY
          }
        }
        val sourceX = cropLeft + mappedX.coerceIn(0, sourceWidth - 1)
        val sourceY = cropTop + mappedY.coerceIn(0, sourceHeight - 1)
        val yIndex = sourceY * yRowStride + sourceX * yPixelStride
        val gray = enhanceLumaForPreview(readPlaneValue(yBuffer, yIndex))
        pixels[targetY * targetWidth + targetX] =
          -0x1000000 or (gray shl 16) or (gray shl 8) or gray
      }
    }

    return Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.RGB_565)
      .apply { setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight) }
  }

  private fun readPlaneValue(buffer: java.nio.ByteBuffer, index: Int): Int {
    return if (index >= 0 && index < buffer.limit()) {
      buffer.get(index).toInt() and 0xFF
    } else {
      0
    }
  }

  private fun enhanceLumaForPreview(luma: Int): Int {
    val normalized = (((luma - 16).coerceAtLeast(0) * 298) shr 8).coerceIn(0, 255)
    return (((normalized - 128) * 115) / 100 + 128).coerceIn(0, 255)
  }

  private fun estimateAverageLuma(imageProxy: androidx.camera.core.ImageProxy): Double {
    val plane = imageProxy.planes.firstOrNull() ?: return -1.0
    val buffer = plane.buffer.duplicate()
    val remaining = buffer.remaining()

    if (remaining <= 0) {
      return -1.0
    }

    val sampleCount = minOf(64, remaining)
    val step = maxOf(1, remaining / sampleCount)
    var total = 0L
    var count = 0
    var index = buffer.position()

    while (index < buffer.limit() && count < sampleCount) {
      total += (buffer.get(index).toInt() and 0xFF)
      count += 1
      index += step
    }

    return if (count == 0) -1.0 else total.toDouble() / count.toDouble()
  }

  private fun pointMap(x: Int, y: Int) =
    Arguments.createMap().apply {
      putInt("x", x)
      putInt("y", y)
    }
}
