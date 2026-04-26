package com.hebarcode.reader

import android.Manifest
import android.content.pm.PackageManager
import android.hardware.camera2.CaptureRequest
import android.util.Log
import android.util.Base64
import android.util.Size
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import zxingcpp.BarcodeReader

object HebarcodeScannerController {
  private const val TAG = "HebarcodeScanner"

  private var reactContext: ReactApplicationContext? = null
  private var previewView: PreviewView? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var cameraProvider: ProcessCameraProvider? = null
  private var boundCamera: Camera? = null
  private var imageAnalysis: ImageAnalysis? = null
  private var preview: Preview? = null
  private val analyzerExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val barcodeReader =
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
  @Volatile private var autoTorchEnabled = false
  @Volatile private var detectionThrottleMs: Long = 250L
  @Volatile private var lastEmitAtMs: Long = 0L
  @Volatile private var lastSuccessfulDetectionAtMs: Long = 0L
  @Volatile private var hasLoggedFirstAnalyzedFrame = false
  @Volatile private var hasLoggedFirstEmittedFrame = false
  @Volatile private var bindRequestVersion = 0
  @Volatile private var bindInFlight = false
  @Volatile private var lastErrorCode: String? = null
  @Volatile private var lastErrorMessage: String? = null
  @Volatile private var previewAttachedAtMs: Long = 0L
  @Volatile private var previewWidth: Int = 0
  @Volatile private var previewHeight: Int = 0
  @Volatile private var analyzedFrameCount: Long = 0L
  @Volatile private var emittedFrameCount: Long = 0L
  @Volatile private var lastAnalyzedAtMs: Long = 0L
  @Volatile private var lastEmittedAtMs: Long = 0L
  @Volatile private var lastDetectionCount: Int = 0

  private const val LOW_LIGHT_LUMA_THRESHOLD = 72.0
  private const val STALE_DETECTION_WINDOW_MS = 1500L
  private const val MAX_ERROR_MESSAGE_LENGTH = 180

  fun registerReactContext(context: ReactApplicationContext) {
    reactContext = context
    Log.i(TAG, "Registered React application context")
  }

  fun attachPreview(previewView: PreviewView, owner: LifecycleOwner?) {
    this.previewView = previewView
    this.lifecycleOwner = owner
    previewAttachedAtMs = System.currentTimeMillis()
    previewWidth = previewView.width.takeIf { it > 0 } ?: 0
    previewHeight = previewView.height.takeIf { it > 0 } ?: 0
    previewView.scaleType = PreviewView.ScaleType.FILL_CENTER
    previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    Log.i(TAG, "Preview attached to window; scanningRequested=$scanningRequested")
    maybeBind()
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
    this.previewView = null
    this.lifecycleOwner = null
    previewAttachedAtMs = 0L
    previewWidth = 0
    previewHeight = 0
    Log.i(TAG, "Preview detached from window")
    unbindCamera()
  }

  fun startScanning() {
    scanningRequested = true
    Log.i(TAG, "startScanning requested")
    maybeBind()
  }

  fun retryScanning() {
    bindRequestVersion += 1
    scanningRequested = true
    clearStartupError()
    unbindCamera()
    Log.i(TAG, "retryScanning requested")
    maybeBind()
  }

  fun stopScanning() {
    scanningRequested = false
    bindRequestVersion += 1
    clearStartupError()
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

  fun isPreviewAttached(): Boolean = previewView != null

  fun isPipelineBound(): Boolean = pipelineBound

  fun isBindingInProgress(): Boolean = bindInFlight

  fun isScanningRequested(): Boolean = scanningRequested

  fun isTorchEnabled(): Boolean = autoTorchEnabled

  fun getLastErrorCode(): String? = lastErrorCode

  fun getLastErrorMessage(): String? = lastErrorMessage

  fun getPreviewAttachedAtMs(): Long = previewAttachedAtMs

  fun getPreviewWidth(): Int = previewWidth

  fun getPreviewHeight(): Int = previewHeight

  fun getAnalyzedFrameCount(): Long = analyzedFrameCount

  fun getEmittedFrameCount(): Long = emittedFrameCount

  fun getLastAnalyzedAtMs(): Long = lastAnalyzedAtMs

  fun getLastEmittedAtMs(): Long = lastEmittedAtMs

  fun getLastDetectionCount(): Int = lastDetectionCount

  private fun maybeBind() {
    val context = reactContext ?: return
    val view = previewView ?: return
    val owner = lifecycleOwner ?: return

    if (!scanningRequested || !hasCameraPermission(context)) {
      Log.i(
        TAG,
        "Skipping bind; scanningRequested=$scanningRequested hasPermission=${hasCameraPermission(context)}",
      )
      return
    }

    if (lastErrorCode != null) {
      Log.i(TAG, "Skipping bind until scanner retry clears startup error")
      return
    }

    if (pipelineBound) {
      Log.d(TAG, "Skipping bind; camera pipeline is already bound")
      return
    }

    if (bindInFlight) {
      Log.d(TAG, "Skipping bind; camera bind is already in flight")
      return
    }

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
              !hasCameraPermission(context)

          if (bindIsStale) {
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
    Log.i(TAG, "Binding preview and image analysis use cases")
    val previewBuilder = Preview.Builder()
    configureCameraBehavior(previewBuilder)
    preview = previewBuilder.build().apply { setSurfaceProvider(view.surfaceProvider) }

    val analysisBuilder =
      ImageAnalysis.Builder()
        .setResolutionSelector(
          ResolutionSelector.Builder()
            .setResolutionStrategy(
              ResolutionStrategy(
                Size(1600, 1200),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
              ),
            )
            .build(),
        )
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
    configureCameraBehavior(analysisBuilder)

    imageAnalysis =
      analysisBuilder.build()
        .apply {
          setAnalyzer(analyzerExecutor) { imageProxy -> analyzeFrame(imageProxy) }
        }

    provider.unbindAll()
    boundCamera =
      provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageAnalysis)
    pipelineBound = true
    clearStartupError()
    previewWidth = view.width.takeIf { it > 0 } ?: previewWidth
    previewHeight = view.height.takeIf { it > 0 } ?: previewHeight
    lastEmitAtMs = 0L
    lastSuccessfulDetectionAtMs = 0L
    hasLoggedFirstAnalyzedFrame = false
    hasLoggedFirstEmittedFrame = false
    autoTorchEnabled = false
    Log.i(TAG, "Camera pipeline bound successfully")
    emitDetectionsFrame(
      frameId = "camera-bind-${System.currentTimeMillis()}",
      timestampMs = System.currentTimeMillis(),
      rotationDegrees = 0,
      frameWidth = view.width.takeIf { it > 0 } ?: 0,
      frameHeight = view.height.takeIf { it > 0 } ?: 0,
      detections = Arguments.createArray(),
    )
  }

  private fun unbindCamera() {
    updateTorchState(false)
    imageAnalysis?.clearAnalyzer()
    safeUnbindCameraProvider()
    imageAnalysis = null
    preview = null
    boundCamera = null
    pipelineBound = false
    bindInFlight = false
    lastEmitAtMs = 0L
    lastSuccessfulDetectionAtMs = 0L
    autoTorchEnabled = false
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
    bindInFlight = false
    lastErrorCode = code
    lastErrorMessage = message.take(MAX_ERROR_MESSAGE_LENGTH)
    Log.e(TAG, message, error)
  }

  private fun clearStartupError() {
    lastErrorCode = null
    lastErrorMessage = null
  }

  private fun Throwable.readableMessage(): String {
    return localizedMessage ?: message ?: javaClass.simpleName
  }

  private fun analyzeFrame(imageProxy: androidx.camera.core.ImageProxy) {
    if (!scanningRequested) {
      imageProxy.close()
      return
    }

    val now = System.currentTimeMillis()
    if (now - lastEmitAtMs < resolveEffectiveThrottleMs(now)) {
      imageProxy.close()
      return
    }

    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    val frameWidth = imageProxy.cropRect.width()
    val frameHeight = imageProxy.cropRect.height()
    analyzedFrameCount += 1
    lastAnalyzedAtMs = now

    if (!hasLoggedFirstAnalyzedFrame) {
      hasLoggedFirstAnalyzedFrame = true
      Log.i(TAG, "First frame received by analyzer: ${frameWidth}x${frameHeight} rotation=$rotationDegrees")
    }

    val shouldEstimateLuma = shouldEstimateAverageLuma()
    var averageLuma = -1.0
    val results =
      try {
        if (shouldEstimateLuma) {
          averageLuma = estimateAverageLuma(imageProxy)
        }
        barcodeReader.read(imageProxy)
      } catch (_: Throwable) {
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
    )

    if (!hasLoggedFirstEmittedFrame) {
      hasLoggedFirstEmittedFrame = true
      Log.i(TAG, "First detection frame emitted to JS with ${results.size} detections")
    }
  }

  private fun emitDetectionsFrame(
    frameId: String,
    timestampMs: Long,
    rotationDegrees: Int,
    frameWidth: Int,
    frameHeight: Int,
    detections: WritableArray,
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
      }

    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(HebarcodeScannerModule.DETECTIONS_EVENT_NAME, framePayload)
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
      (detectionThrottleMs / 2L).coerceAtLeast(33L)
    } else {
      detectionThrottleMs
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
