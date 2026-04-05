package com.hebarcode.reader

import android.Manifest
import android.content.pm.PackageManager
import android.util.Base64
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import zxingcpp.BarcodeReader

object HebarcodeScannerController {

  private var reactContext: ReactApplicationContext? = null
  private var previewView: PreviewView? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var cameraProvider: ProcessCameraProvider? = null
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
  @Volatile private var detectionThrottleMs: Long = 250L
  @Volatile private var lastEmitAtMs: Long = 0L

  fun registerReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  fun attachPreview(previewView: PreviewView, owner: LifecycleOwner?) {
    this.previewView = previewView
    this.lifecycleOwner = owner
    previewView.scaleType = PreviewView.ScaleType.FIT_CENTER
    previewView.implementationMode = PreviewView.ImplementationMode.PERFORMANCE
    maybeBind()
  }

  fun detachPreview(previewView: PreviewView) {
    if (this.previewView !== previewView) {
      return
    }

    this.previewView = null
    this.lifecycleOwner = null
    unbindCamera()
  }

  fun startScanning() {
    scanningRequested = true
    maybeBind()
  }

  fun stopScanning() {
    scanningRequested = false
    unbindCamera()
  }

  fun setDetectionThrottleMs(value: Long) {
    detectionThrottleMs = value.coerceAtLeast(33L)
  }

  fun isPreviewAttached(): Boolean = previewView != null

  fun isPipelineBound(): Boolean = pipelineBound

  private fun maybeBind() {
    val context = reactContext ?: return
    val view = previewView ?: return
    val owner = lifecycleOwner ?: return

    if (!scanningRequested || !hasCameraPermission(context)) {
      return
    }

    val providerFuture = ProcessCameraProvider.getInstance(context)
    providerFuture.addListener(
      {
        val provider = providerFuture.get()
        cameraProvider = provider
        bindUseCases(provider, owner, view)
      },
      ContextCompat.getMainExecutor(context),
    )
  }

  private fun bindUseCases(
    provider: ProcessCameraProvider,
    owner: LifecycleOwner,
    view: PreviewView,
  ) {
    preview = Preview.Builder().build().apply { setSurfaceProvider(view.surfaceProvider) }

    imageAnalysis =
      ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()
        .apply {
          setAnalyzer(analyzerExecutor) { imageProxy -> analyzeFrame(imageProxy) }
        }

    provider.unbindAll()
    provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageAnalysis)
    pipelineBound = true
  }

  private fun unbindCamera() {
    imageAnalysis?.clearAnalyzer()
    cameraProvider?.unbindAll()
    imageAnalysis = null
    preview = null
    pipelineBound = false
  }

  private fun analyzeFrame(imageProxy: androidx.camera.core.ImageProxy) {
    if (!scanningRequested) {
      imageProxy.close()
      return
    }

    val now = System.currentTimeMillis()
    if (now - lastEmitAtMs < detectionThrottleMs) {
      imageProxy.close()
      return
    }

    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    val frameWidth = imageProxy.cropRect.width()
    val frameHeight = imageProxy.cropRect.height()

    val results =
      try {
        imageProxy.use { barcodeReader.read(it) }
      } catch (_: Throwable) {
        emptyList()
      }

    lastEmitAtMs = now

    val framePayload = Arguments.createMap().apply {
      putString("frameId", "camera-$now")
      putDouble("timestampMs", now.toDouble())
      putString("source", "camera")
      putInt("rotationDegrees", rotationDegrees)
      putMap(
        "frameSize",
        Arguments.createMap().apply {
          putInt("width", frameWidth)
          putInt("height", frameHeight)
        },
      )
      putArray(
        "detections",
        Arguments.createArray().apply {
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
        },
      )
    }

    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(HebarcodeScannerModule.DETECTIONS_EVENT_NAME, framePayload)
  }

  private fun hasCameraPermission(context: ReactApplicationContext): Boolean {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun pointMap(x: Int, y: Int) =
    Arguments.createMap().apply {
      putInt("x", x)
      putInt("y", y)
    }
}
