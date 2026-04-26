package com.hebarcode.reader

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class HebarcodeScannerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val DETECTIONS_EVENT_NAME = "HebarcodeScanner.onDetections"
  }

  private var detectionThrottleMs: Long = 250
  private var assistModeEnabled: Boolean = true

  init {
    HebarcodeScannerController.registerReactContext(reactContext)
  }

  override fun getName(): String = "HebarcodeScanner"

  @ReactMethod
  fun getStatus(promise: Promise) {
    val result = WritableNativeMap().apply {
      val previewAttached = HebarcodeScannerController.isPreviewAttached()
      val pipelineBound = HebarcodeScannerController.isPipelineBound()
      putString("platform", "android")
      putBoolean("nativeModulePresent", true)
      putString("version", "0.3.0")
      putBoolean("cameraPermissionDeclared", true)
      putBoolean("cameraPermissionGranted", hasCameraPermission())
      putString("mode", if (pipelineBound) "native" else "ready")
      putBoolean("streaming", pipelineBound && HebarcodeScannerController.isScanningRequested())
      putBoolean("torchEnabled", HebarcodeScannerController.isTorchEnabled())
      putString("detectionEventName", DETECTIONS_EVENT_NAME)
      putBoolean("previewAttached", previewAttached)
      putBoolean("bindingInProgress", HebarcodeScannerController.isBindingInProgress())
      putBoolean("scanningRequested", HebarcodeScannerController.isScanningRequested())
      putString("lastErrorCode", HebarcodeScannerController.getLastErrorCode())
      putString("lastErrorMessage", HebarcodeScannerController.getLastErrorMessage())
      putDouble("previewAttachedAtMs", HebarcodeScannerController.getPreviewAttachedAtMs().toDouble())
      putInt("previewWidth", HebarcodeScannerController.getPreviewWidth())
      putInt("previewHeight", HebarcodeScannerController.getPreviewHeight())
      putDouble("analyzedFrameCount", HebarcodeScannerController.getAnalyzedFrameCount().toDouble())
      putDouble("emittedFrameCount", HebarcodeScannerController.getEmittedFrameCount().toDouble())
      putDouble("lastAnalyzedAtMs", HebarcodeScannerController.getLastAnalyzedAtMs().toDouble())
      putDouble("lastEmittedAtMs", HebarcodeScannerController.getLastEmittedAtMs().toDouble())
      putInt("lastDetectionCount", HebarcodeScannerController.getLastDetectionCount())
    }

    promise.resolve(result)
  }

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    val result = WritableNativeMap().apply {
      putBoolean("cameraPreview", true)
      putBoolean("cameraPreviewView", true)
      putBoolean("barcodeDecoding", true)
      putBoolean("multiBarcodeSelection", true)
      putBoolean("sampleDetections", true)
      putBoolean("detectionEvents", true)
      putBoolean("torchControl", true)
      putBoolean("autoTorchAssist", true)
      putString("engine", "zxing-cpp")
      putString("cameraStack", "CameraX")
    }

    promise.resolve(result)
  }

  @ReactMethod
  fun isCameraPermissionGranted(promise: Promise) {
    promise.resolve(hasCameraPermission())
  }

  @ReactMethod
  fun getMockDetections(promise: Promise) {
    val barcodes = Arguments.createArray().apply {
      pushMap(
        barcodeMap(
          "QR_CODE|https://example.com/alpha|0",
          "QR_CODE",
          "https://example.com/alpha",
          "TEXT",
          34,
          70,
          144,
          70,
          144,
          180,
          34,
          180,
        ),
      )
      pushMap(
        barcodeMap(
          "CODE_128|SKU-HEB-2026-001|1",
          "CODE_128",
          "SKU-HEB-2026-001",
          "TEXT",
          178,
          92,
          334,
          92,
          334,
          162,
          178,
          162,
        ),
      )
      pushMap(
        barcodeMap(
          "EAN_13|8591234567890|2",
          "EAN_13",
          "8591234567890",
          "TEXT",
          92,
          214,
          314,
          214,
          314,
          278,
          92,
          278,
        ),
      )
    }

    promise.resolve(barcodes)
  }

  @ReactMethod
  fun startScanning(promise: Promise) {
    if (!hasCameraPermission()) {
      promise.reject("E_CAMERA_PERMISSION", "Camera permission is not granted")
      return
    }

    HebarcodeScannerController.setAssistModeEnabled(assistModeEnabled)
    HebarcodeScannerController.setDetectionThrottleMs(detectionThrottleMs)
    HebarcodeScannerController.startScanning()
    promise.resolve(null)
  }

  @ReactMethod
  fun retryScanning(promise: Promise) {
    if (!hasCameraPermission()) {
      promise.reject("E_CAMERA_PERMISSION", "Camera permission is not granted")
      return
    }

    HebarcodeScannerController.setAssistModeEnabled(assistModeEnabled)
    HebarcodeScannerController.setDetectionThrottleMs(detectionThrottleMs)
    HebarcodeScannerController.retryScanning()
    promise.resolve(null)
  }

  @ReactMethod
  fun stopScanning(promise: Promise) {
    HebarcodeScannerController.stopScanning()
    promise.resolve(null)
  }

  @ReactMethod
  fun setAssistModeEnabled(enabled: Boolean, promise: Promise) {
    assistModeEnabled = enabled
    HebarcodeScannerController.setAssistModeEnabled(enabled)
    promise.resolve(null)
  }

  @ReactMethod
  fun setDetectionThrottleMs(throttleMs: Double, promise: Promise) {
    detectionThrottleMs = throttleMs.toLong().coerceAtLeast(33L)
    HebarcodeScannerController.setDetectionThrottleMs(detectionThrottleMs)
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter compatibility.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter compatibility.
  }

  private fun hasCameraPermission(): Boolean {
    return ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.CAMERA,
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun barcodeMap(
    id: String,
    format: String,
    text: String,
    contentType: String,
    x1: Int,
    y1: Int,
    x2: Int,
    y2: Int,
    x3: Int,
    y3: Int,
    x4: Int,
    y4: Int,
  ) = Arguments.createMap().apply {
    putString("id", id)
    putString("format", format)
    putString("text", text)
    putString("contentType", contentType)
    putArray(
      "points",
      Arguments.createArray().apply {
        pushMap(pointMap(x1, y1))
        pushMap(pointMap(x2, y2))
        pushMap(pointMap(x3, y3))
        pushMap(pointMap(x4, y4))
      },
    )
  }

  private fun pointMap(x: Int, y: Int) = Arguments.createMap().apply {
    putInt("x", x)
    putInt("y", y)
  }
}
