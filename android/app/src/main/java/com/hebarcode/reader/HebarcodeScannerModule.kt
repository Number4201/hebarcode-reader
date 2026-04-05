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

  private var scanningActive: Boolean = false
  private var detectionThrottleMs: Long = 250

  init {
    HebarcodeScannerController.registerReactContext(reactContext)
  }

  override fun getName(): String = "HebarcodeScanner"

  @ReactMethod
  fun getStatus(promise: Promise) {
    val result = WritableNativeMap().apply {
      putString("platform", "android")
      putBoolean("nativeModulePresent", true)
      putString("version", "0.3.0-beta")
      putBoolean("cameraPermissionDeclared", true)
      putBoolean("cameraPermissionGranted", hasCameraPermission())
      putString("mode", if (HebarcodeScannerController.isPipelineBound()) "native" else "stub")
      putBoolean("streaming", scanningActive)
      putString("detectionEventName", DETECTIONS_EVENT_NAME)
      putBoolean("previewAttached", HebarcodeScannerController.isPreviewAttached())
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
      putBoolean("mockDetections", true)
      putBoolean("detectionEvents", true)
      putString("plannedEngine", "zxing-cpp")
      putString("plannedCameraStack", "CameraX")
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

    scanningActive = true
    HebarcodeScannerController.setDetectionThrottleMs(detectionThrottleMs)
    HebarcodeScannerController.startScanning()
    emitMockDetectionsFrame()
    promise.resolve(null)
  }

  @ReactMethod
  fun stopScanning(promise: Promise) {
    scanningActive = false
    HebarcodeScannerController.stopScanning()
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

  private fun emitMockDetectionsFrame() {
    if (!scanningActive) {
      return
    }

    val now = System.currentTimeMillis()
    val payload = Arguments.createMap().apply {
      putString("frameId", "mock-$now")
      putDouble("timestampMs", now.toDouble())
      putString("source", "mock")
      putInt("rotationDegrees", 0)
      putMap(
        "frameSize",
        Arguments.createMap().apply {
          putInt("width", 360)
          putInt("height", 320)
        },
      )
      putArray(
        "detections",
        Arguments.createArray().apply {
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
        },
      )
      putInt("throttleMs", detectionThrottleMs.toInt())
    }

    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(DETECTIONS_EVENT_NAME, payload)
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
