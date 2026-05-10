package com.hebarcode.reader

import android.graphics.Bitmap
import android.util.Base64
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream

internal object HebarcodeAnalyzerPreviewRenderer {
  data class FrameQualityMetrics(
    val averageLuma: Double,
    val contrast: Double,
    val sharpness: Double,
    val sampleCount: Int,
  )

  fun encodePreviewBitmapBase64(bitmap: Bitmap, jpegQuality: Int): String {
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, jpegQuality, output)
    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  fun buildAnalyzerPreviewBitmap(
    imageProxy: ImageProxy,
    rotationDegrees: Int,
    maxWidth: Int,
  ): Bitmap? {
    val yPlane = imageProxy.planes.getOrNull(0) ?: return null
    val uPlane = imageProxy.planes.getOrNull(1)
    val vPlane = imageProxy.planes.getOrNull(2)
    val crop = imageProxy.cropRect
    val sourceWidth = crop.width().coerceAtLeast(1)
    val sourceHeight = crop.height().coerceAtLeast(1)
    val normalizedRotation = normalizeRotation(rotationDegrees)
    val rotatedWidth = if (normalizedRotation == 90 || normalizedRotation == 270) sourceHeight else sourceWidth
    val rotatedHeight = if (normalizedRotation == 90 || normalizedRotation == 270) sourceWidth else sourceHeight
    val targetWidth = minOf(maxWidth, rotatedWidth).coerceAtLeast(1)
    val targetHeight = ((rotatedHeight.toDouble() * targetWidth.toDouble()) / rotatedWidth.toDouble())
      .toInt()
      .coerceAtLeast(1)
    val cropLeft = crop.left
    val cropTop = crop.top
    val yBuffer = yPlane.buffer.duplicate()
    val yRowStride = yPlane.rowStride
    val yPixelStride = yPlane.pixelStride.coerceAtLeast(1)
    val uBuffer = uPlane?.buffer?.duplicate()
    val vBuffer = vPlane?.buffer?.duplicate()
    val uRowStride = uPlane?.rowStride ?: 0
    val vRowStride = vPlane?.rowStride ?: 0
    val uPixelStride = uPlane?.pixelStride?.coerceAtLeast(1) ?: 1
    val vPixelStride = vPlane?.pixelStride?.coerceAtLeast(1) ?: 1
    val canRenderColor = uBuffer != null && vBuffer != null && uRowStride > 0 && vRowStride > 0
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
        val luma = readPlaneValue(yBuffer, yIndex)
        pixels[targetY * targetWidth + targetX] =
          if (canRenderColor) {
            yuv420ToArgb(
              luma,
              readPlaneValue(uBuffer!!, (sourceY / 2) * uRowStride + (sourceX / 2) * uPixelStride),
              readPlaneValue(vBuffer!!, (sourceY / 2) * vRowStride + (sourceX / 2) * vPixelStride),
            )
          } else {
            val gray = enhanceLumaForPreview(luma)
            -0x1000000 or (gray shl 16) or (gray shl 8) or gray
          }
      }
    }

    return Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.RGB_565)
      .apply { setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight) }
  }

  fun estimateAverageLuma(imageProxy: ImageProxy): Double {
    return estimateFrameQuality(imageProxy).averageLuma
  }

  fun estimateFrameQuality(imageProxy: ImageProxy): FrameQualityMetrics {
    val plane =
      imageProxy.planes.firstOrNull()
        ?: return FrameQualityMetrics(-1.0, -1.0, -1.0, 0)
    val crop = imageProxy.cropRect
    val sourceWidth = crop.width()
    val sourceHeight = crop.height()
    val buffer = plane.buffer.duplicate()

    if (sourceWidth <= 0 || sourceHeight <= 0 || buffer.limit() <= 0) {
      return FrameQualityMetrics(-1.0, -1.0, -1.0, 0)
    }

    val sampleCols = minOf(32, sourceWidth).coerceAtLeast(1)
    val sampleRows = minOf(24, sourceHeight).coerceAtLeast(1)
    val samples = IntArray(sampleCols * sampleRows)
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride.coerceAtLeast(1)
    var total = 0L
    var count = 0

    for (sampleY in 0 until sampleRows) {
      val sourceY =
        crop.top +
          if (sampleRows == 1) {
            sourceHeight / 2
          } else {
            (sampleY * (sourceHeight - 1)) / (sampleRows - 1)
          }

      for (sampleX in 0 until sampleCols) {
        val sourceX =
          crop.left +
            if (sampleCols == 1) {
              sourceWidth / 2
            } else {
              (sampleX * (sourceWidth - 1)) / (sampleCols - 1)
            }
        val luma = readPlaneValue(buffer, sourceY * rowStride + sourceX * pixelStride)

        samples[count] = luma
        total += luma.toLong()
        count += 1
      }
    }

    if (count == 0) {
      return FrameQualityMetrics(-1.0, -1.0, -1.0, 0)
    }

    val average = total.toDouble() / count.toDouble()
    var varianceTotal = 0.0
    var edgeTotal = 0.0
    var edgeCount = 0

    for (index in 0 until count) {
      val delta = samples[index] - average
      varianceTotal += delta * delta
      val x = index % sampleCols
      val y = index / sampleCols

      if (x + 1 < sampleCols) {
        edgeTotal += kotlin.math.abs(samples[index] - samples[index + 1]).toDouble()
        edgeCount += 1
      }

      if (y + 1 < sampleRows) {
        edgeTotal += kotlin.math.abs(samples[index] - samples[index + sampleCols]).toDouble()
        edgeCount += 1
      }
    }

    return FrameQualityMetrics(
      averageLuma = average,
      contrast = kotlin.math.sqrt(varianceTotal / count.toDouble()),
      sharpness = if (edgeCount == 0) 0.0 else edgeTotal / edgeCount.toDouble(),
      sampleCount = count,
    )
  }

  private fun normalizeRotation(rotationDegrees: Int): Int =
    ((rotationDegrees % 360) + 360) % 360

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

  private fun yuv420ToArgb(
    y: Int,
    u: Int,
    v: Int,
  ): Int {
    val c = (y - 16).coerceAtLeast(0)
    val d = u - 128
    val e = v - 128
    val red = clampByte((298 * c + 409 * e + 128) shr 8)
    val green = clampByte((298 * c - 100 * d - 208 * e + 128) shr 8)
    val blue = clampByte((298 * c + 516 * d + 128) shr 8)

    return -0x1000000 or (red shl 16) or (green shl 8) or blue
  }

  private fun clampByte(value: Int): Int = value.coerceIn(0, 255)
}
