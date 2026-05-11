package com.hebarcode.reader

import android.graphics.PointF
import android.graphics.Rect
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.barcode.common.Barcode

internal object HebarcodeMlKitBarcodeMapper {
  fun buildDetections(
    barcodes: List<Barcode>,
    coordinateTransformer: HebarcodeCoordinateTransformer? = null,
    detectionTracker: HebarcodeDetectionTracker? = null,
    timestampMs: Long = System.currentTimeMillis(),
  ): WritableArray {
    return Arguments.createArray().apply {
      barcodes.forEachIndexed { index, barcode ->
        val points = barcodePoints(barcode, coordinateTransformer)
        val text = barcode.rawValue ?: barcode.displayValue
        val hasText = !text.isNullOrBlank()

        if (points.size() == 0) {
          return@forEachIndexed
        }

        val formatName = barcodeFormatName(barcode.format)
        val contentType = if (hasText) barcodeValueTypeName(barcode.valueType) else "POTENTIAL"
        val trackingState = if (hasText) "decoded" else "candidate"
        val confidence = if (hasText) 0.96 else 0.18
        val trackedDetection = detectionTracker?.track(
          HebarcodeDetectionTracker.DetectionInput(
            format = formatName,
            text = text,
            rawBytesBase64 = null,
            contentType = contentType,
            points = points.toPointList(),
            confidence = confidence,
            trackingState = trackingState,
          ),
          timestampMs,
        )

        pushMap(
          Arguments.createMap().apply {
            putString(
              "id",
              trackedDetection?.id ?: if (hasText) {
                "$formatName|$text|mlkit-$index"
              } else {
                "$formatName|candidate|mlkit-$index"
              },
            )
            trackedDetection?.let { tracked ->
              putDouble("ageMs", tracked.ageMs.toDouble())
              putInt("seenCount", tracked.seenCount)
              putDouble("lastSeenAtMs", tracked.lastSeenAtMs.toDouble())
            }
            putString("format", formatName)
            if (hasText) {
              putString("text", text)
            }
            putString("contentType", contentType)
            putString("trackingState", trackedDetection?.trackingState ?: trackingState)
            putDouble("confidence", confidence)
            putArray("points", points)
            coordinateTransformer?.frameGeometry?.let { geometry ->
              putString("coordinateSpace", "display-frame")
              putInt("imageRotationDegrees", geometry.normalizedRotationDegrees)
              putMap("imageCropRect", cropRectMap(geometry.cropRect))
            }
          },
        )
      }
    }
  }

  private fun barcodePoints(
    barcode: Barcode,
    coordinateTransformer: HebarcodeCoordinateTransformer?,
  ): WritableArray {
    val cornerPoints = barcode.cornerPoints

    if (cornerPoints != null && cornerPoints.size >= 4) {
      return Arguments.createArray().apply {
        cornerPoints.take(4).forEach { point ->
          pushMap(pointMap(point.x, point.y, coordinateTransformer))
        }
      }
    }

    return rectPoints(barcode.boundingBox, coordinateTransformer)
  }

  private fun rectPoints(
    rect: Rect?,
    coordinateTransformer: HebarcodeCoordinateTransformer?,
  ): WritableArray {
    return Arguments.createArray().apply {
      if (rect == null || rect.width() <= 0 || rect.height() <= 0) {
        return@apply
      }

      if (coordinateTransformer != null) {
        coordinateTransformer.toDisplayRect(rect).forEach { point ->
          pushMap(pointMap(point))
        }
        return@apply
      }

      pushMap(pointMap(rect.left, rect.top, null))
      pushMap(pointMap(rect.right, rect.top, null))
      pushMap(pointMap(rect.right, rect.bottom, null))
      pushMap(pointMap(rect.left, rect.bottom, null))
    }
  }

  private fun barcodeFormatName(format: Int): String {
    return when (format) {
      Barcode.FORMAT_CODE_128 -> "CODE_128"
      Barcode.FORMAT_CODE_39 -> "CODE_39"
      Barcode.FORMAT_CODE_93 -> "CODE_93"
      Barcode.FORMAT_CODABAR -> "CODABAR"
      Barcode.FORMAT_EAN_13 -> "EAN_13"
      Barcode.FORMAT_EAN_8 -> "EAN_8"
      Barcode.FORMAT_ITF -> "ITF"
      Barcode.FORMAT_UPC_A -> "UPC_A"
      Barcode.FORMAT_UPC_E -> "UPC_E"
      Barcode.FORMAT_QR_CODE -> "QR_CODE"
      Barcode.FORMAT_PDF417 -> "PDF_417"
      Barcode.FORMAT_AZTEC -> "AZTEC"
      Barcode.FORMAT_DATA_MATRIX -> "DATA_MATRIX"
      else -> "UNKNOWN"
    }
  }

  private fun barcodeValueTypeName(valueType: Int): String {
    return when (valueType) {
      Barcode.TYPE_URL -> "URL"
      Barcode.TYPE_CONTACT_INFO -> "CONTACT"
      Barcode.TYPE_WIFI -> "WIFI"
      Barcode.TYPE_PRODUCT -> "PRODUCT"
      Barcode.TYPE_TEXT -> "TEXT"
      Barcode.TYPE_ISBN -> "PRODUCT"
      Barcode.TYPE_EMAIL -> "TEXT"
      Barcode.TYPE_PHONE -> "TEXT"
      Barcode.TYPE_SMS -> "TEXT"
      Barcode.TYPE_GEO -> "TEXT"
      Barcode.TYPE_CALENDAR_EVENT -> "TEXT"
      Barcode.TYPE_DRIVER_LICENSE -> "TEXT"
      else -> "TEXT"
    }
  }

  private fun pointMap(
    x: Int,
    y: Int,
    coordinateTransformer: HebarcodeCoordinateTransformer?,
  ): WritableMap {
    val transformedPoint = coordinateTransformer?.toDisplayPoint(x, y)
    return if (transformedPoint != null) {
      pointMap(transformedPoint)
    } else {
      Arguments.createMap().apply {
        putInt("x", x)
        putInt("y", y)
      }
    }
  }

  private fun pointMap(point: PointF): WritableMap =
    Arguments.createMap().apply {
      putDouble("x", point.x.toDouble())
      putDouble("y", point.y.toDouble())
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

  private fun WritableArray.toPointList(): List<PointF> {
    val pointList = mutableListOf<PointF>()
    for (index in 0 until size()) {
      val point = getMap(index) ?: continue
      pointList.add(PointF(point.getDouble("x").toFloat(), point.getDouble("y").toFloat()))
    }
    return pointList
  }
}
