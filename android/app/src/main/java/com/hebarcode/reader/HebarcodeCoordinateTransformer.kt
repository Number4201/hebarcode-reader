package com.hebarcode.reader

import android.graphics.PointF
import android.graphics.Rect
import kotlin.math.roundToInt

internal class HebarcodeCoordinateTransformer(
  private val geometry: FrameGeometry,
) {
  data class FrameGeometry(
    val imageWidth: Int,
    val imageHeight: Int,
    val rotationDegrees: Int,
    val cropRect: Rect = Rect(0, 0, imageWidth, imageHeight),
  ) {
    val normalizedRotationDegrees: Int = normalizeRotation(rotationDegrees)
    val croppedWidth: Int = cropRect.width().coerceAtLeast(0)
    val croppedHeight: Int = cropRect.height().coerceAtLeast(0)
    val displayWidth: Int =
      if (normalizedRotationDegrees == 90 || normalizedRotationDegrees == 270) croppedHeight else croppedWidth
    val displayHeight: Int =
      if (normalizedRotationDegrees == 90 || normalizedRotationDegrees == 270) croppedWidth else croppedHeight

    companion object {
      fun normalizeRotation(rotationDegrees: Int): Int {
        val normalized = ((rotationDegrees % 360) + 360) % 360
        return when (normalized) {
          in 45 until 135 -> 90
          in 135 until 225 -> 180
          in 225 until 315 -> 270
          else -> 0
        }
      }
    }
  }

  val frameGeometry: FrameGeometry = geometry

  fun toDisplayPoint(x: Number, y: Number): PointF {
    val cropWidth = geometry.croppedWidth.toFloat().coerceAtLeast(1f)
    val cropHeight = geometry.croppedHeight.toFloat().coerceAtLeast(1f)
    val cropX = (x.toFloat() - geometry.cropRect.left.toFloat()).coerceIn(0f, cropWidth)
    val cropY = (y.toFloat() - geometry.cropRect.top.toFloat()).coerceIn(0f, cropHeight)

    val point = when (geometry.normalizedRotationDegrees) {
      90 -> PointF(cropY, cropWidth - cropX)
      180 -> PointF(cropWidth - cropX, cropHeight - cropY)
      270 -> PointF(cropHeight - cropY, cropX)
      else -> PointF(cropX, cropY)
    }

    return PointF(
      point.x.coerceIn(0f, geometry.displayWidth.toFloat().coerceAtLeast(0f)),
      point.y.coerceIn(0f, geometry.displayHeight.toFloat().coerceAtLeast(0f)),
    )
  }

  fun toDisplayRect(rect: Rect?): List<PointF> {
    if (rect == null || rect.width() <= 0 || rect.height() <= 0) {
      return emptyList()
    }

    return listOf(
      toDisplayPoint(rect.left, rect.top),
      toDisplayPoint(rect.right, rect.top),
      toDisplayPoint(rect.right, rect.bottom),
      toDisplayPoint(rect.left, rect.bottom),
    )
  }

  fun roundedDisplayPoint(x: Number, y: Number): Pair<Int, Int> {
    val point = toDisplayPoint(x, y)
    return Pair(point.x.roundToInt(), point.y.roundToInt())
  }
}
