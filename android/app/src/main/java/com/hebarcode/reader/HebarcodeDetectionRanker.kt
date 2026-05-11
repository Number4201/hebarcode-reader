package com.hebarcode.reader

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

internal object HebarcodeDetectionRanker {
  data class Config(
    val roiEnabled: Boolean,
    val roiCenterWeight: Double,
    val maxDetections: Int,
    val preferDecoded: Boolean,
  )

  private data class Bounds(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
  ) {
    val width: Double = (right - left).coerceAtLeast(0.0)
    val height: Double = (bottom - top).coerceAtLeast(0.0)
    val centerX: Double = left + width / 2.0
    val centerY: Double = top + height / 2.0
    val area: Double = width * height
  }

  private data class RankedDetection(
    val map: WritableMap,
    val score: Double,
    val originalIndex: Int,
  )

  fun rankDetections(
    detections: ReadableArray,
    frameWidth: Int,
    frameHeight: Int,
    config: Config,
  ): WritableArray {
    val ranked = mutableListOf<RankedDetection>()
    val safeFrameWidth = frameWidth.coerceAtLeast(0)
    val safeFrameHeight = frameHeight.coerceAtLeast(0)

    for (index in 0 until detections.size()) {
      val detection = detections.getMap(index) ?: continue
      ranked.add(
        rankDetection(
          detection = detection,
          frameWidth = safeFrameWidth,
          frameHeight = safeFrameHeight,
          config = config,
          originalIndex = index,
        ),
      )
    }

    val limit = config.maxDetections.coerceAtLeast(0)
    return Arguments.createArray().apply {
      ranked
        .sortedWith(
          compareByDescending<RankedDetection> { it.score }
            .thenBy { it.originalIndex },
        )
        .take(limit)
        .forEachIndexed { rankIndex, rankedDetection ->
          rankedDetection.map.putInt("rank", rankIndex + 1)
          pushMap(rankedDetection.map)
        }
    }
  }

  private fun rankDetection(
    detection: ReadableMap,
    frameWidth: Int,
    frameHeight: Int,
    config: Config,
    originalIndex: Int,
  ): RankedDetection {
    val points = readPoints(detection.getArrayOrNull("points"))
    val bounds = boundsFor(points)
    val frameArea = frameWidth.toDouble() * frameHeight.toDouble()
    val areaRatio = if (frameArea > 0.0) (bounds.area / frameArea).coerceIn(0.0, 1.0) else 0.0
    val center = Arguments.createMap().apply {
      putDouble("x", bounds.centerX)
      putDouble("y", bounds.centerY)
    }
    val roiScore = roiScore(bounds, frameWidth, frameHeight, config.roiEnabled)
    val decodedScore = if (isDecoded(detection)) 1.0 else 0.0
    val confidence = detection.getDoubleOrDefault("confidence", 0.0).coerceIn(0.0, 1.0)
    val stabilityScore = (detection.getDoubleOrDefault("seenCount", 0.0) / 5.0).coerceIn(0.0, 1.0)
    val areaScore = (areaRatio / TARGET_AREA_RATIO).coerceIn(0.0, 1.0)
    val roiWeight = if (config.roiEnabled) config.roiCenterWeight.coerceIn(0.0, 1.0) else 0.0
    val decodedWeight = if (config.preferDecoded) 0.24 else 0.08
    val qualityScore =
      decodedWeight * decodedScore +
        0.22 * confidence +
        0.14 * areaScore +
        0.10 * stabilityScore
    val score = (roiWeight * roiScore) + ((1.0 - roiWeight) * qualityScore)
    val rankScore = score.coerceIn(0.0, 1.0)

    val rankedMap = copyDetection(detection).apply {
      putInt("rank", 0)
      putDouble("rankScore", rankScore)
      putDouble("roiScore", roiScore)
      putDouble("areaRatio", areaRatio)
      putMap("center", center)
    }

    return RankedDetection(
      map = rankedMap,
      score = rankScore,
      originalIndex = originalIndex,
    )
  }

  private fun roiScore(bounds: Bounds, frameWidth: Int, frameHeight: Int, roiEnabled: Boolean): Double {
    if (!roiEnabled || frameWidth <= 0 || frameHeight <= 0) {
      return 1.0
    }

    val roiLeft = frameWidth * DEFAULT_ROI_LEFT
    val roiTop = frameHeight * DEFAULT_ROI_TOP
    val roiRight = frameWidth * DEFAULT_ROI_RIGHT
    val roiBottom = frameHeight * DEFAULT_ROI_BOTTOM
    val roiCenterX = (roiLeft + roiRight) / 2.0
    val roiCenterY = (roiTop + roiBottom) / 2.0
    val halfWidth = max((roiRight - roiLeft) / 2.0, 1.0)
    val halfHeight = max((roiBottom - roiTop) / 2.0, 1.0)
    val normalizedDistance = hypot(
      (bounds.centerX - roiCenterX) / halfWidth,
      (bounds.centerY - roiCenterY) / halfHeight,
    )

    return (1.0 - (normalizedDistance / ROI_EDGE_DISTANCE)).coerceIn(0.0, 1.0)
  }

  private fun readPoints(points: ReadableArray?): List<Pair<Double, Double>> {
    if (points == null || points.size() == 0) {
      return emptyList()
    }

    return buildList {
      for (index in 0 until points.size()) {
        val point = points.getMap(index) ?: continue
        add(point.getDoubleOrDefault("x", 0.0) to point.getDoubleOrDefault("y", 0.0))
      }
    }
  }

  private fun boundsFor(points: List<Pair<Double, Double>>): Bounds {
    if (points.isEmpty()) {
      return Bounds(0.0, 0.0, 0.0, 0.0)
    }

    var left = points.first().first
    var top = points.first().second
    var right = points.first().first
    var bottom = points.first().second
    points.forEach { (x, y) ->
      left = min(left, x)
      top = min(top, y)
      right = max(right, x)
      bottom = max(bottom, y)
    }
    return Bounds(left, top, right, bottom)
  }

  private fun isDecoded(detection: ReadableMap): Boolean {
    val trackingState = detection.getStringOrNull("trackingState")
    val text = detection.getStringOrNull("text")
    val rawBytesBase64 = detection.getStringOrNull("rawBytesBase64")
    return trackingState == "decoded" || !text.isNullOrBlank() || !rawBytesBase64.isNullOrBlank()
  }

  private fun copyDetection(source: ReadableMap): WritableMap =
    Arguments.createMap().apply {
      source.getStringOrNull("id")?.let { putString("id", it) }
      putDouble("ageMs", source.getDoubleOrDefault("ageMs", 0.0))
      putInt("seenCount", source.getDoubleOrDefault("seenCount", 0.0).toInt())
      putDouble("lastSeenAtMs", source.getDoubleOrDefault("lastSeenAtMs", 0.0))
      putString("format", source.getStringOrNull("format") ?: "UNKNOWN")
      if (source.hasKey("text") && !source.isNull("text")) {
        putString("text", source.getStringOrNull("text"))
      }
      source.getStringOrNull("rawBytesBase64")?.let { putString("rawBytesBase64", it) }
      putString("contentType", source.getStringOrNull("contentType") ?: "TEXT")
      putString("trackingState", source.getStringOrNull("trackingState") ?: "decoded")
      putDouble("confidence", source.getDoubleOrDefault("confidence", 0.0))
      putArray("points", copyPoints(source.getArrayOrNull("points")))
      source.getStringOrNull("coordinateSpace")?.let { putString("coordinateSpace", it) }
      if (source.hasNumber("imageRotationDegrees")) {
        putInt("imageRotationDegrees", source.getDoubleOrDefault("imageRotationDegrees", 0.0).toInt())
      }
      source.getMapOrNull("imageCropRect")?.let { putMap("imageCropRect", copyCropRect(it)) }
    }

  private fun copyPoints(points: ReadableArray?): WritableArray =
    Arguments.createArray().apply {
      if (points == null) {
        return@apply
      }
      for (index in 0 until points.size()) {
        val point = points.getMap(index) ?: continue
        pushMap(
          Arguments.createMap().apply {
            putDouble("x", point.getDoubleOrDefault("x", 0.0))
            putDouble("y", point.getDoubleOrDefault("y", 0.0))
          },
        )
      }
    }

  private fun copyCropRect(rect: ReadableMap): WritableMap =
    Arguments.createMap().apply {
      putDouble("left", rect.getDoubleOrDefault("left", 0.0))
      putDouble("top", rect.getDoubleOrDefault("top", 0.0))
      putDouble("right", rect.getDoubleOrDefault("right", 0.0))
      putDouble("bottom", rect.getDoubleOrDefault("bottom", 0.0))
      putDouble("width", rect.getDoubleOrDefault("width", 0.0))
      putDouble("height", rect.getDoubleOrDefault("height", 0.0))
    }

  private fun ReadableMap.getStringOrNull(key: String): String? =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.String) getString(key) else null

  private fun ReadableMap.getArrayOrNull(key: String): ReadableArray? =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.Array) getArray(key) else null

  private fun ReadableMap.getMapOrNull(key: String): ReadableMap? =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.Map) getMap(key) else null

  private fun ReadableMap.hasNumber(key: String): Boolean =
    hasKey(key) && !isNull(key) && getType(key) == ReadableType.Number

  private fun ReadableMap.getDoubleOrDefault(key: String, defaultValue: Double): Double =
    if (hasNumber(key)) getDouble(key) else defaultValue

  private const val DEFAULT_ROI_LEFT = 0.18
  private const val DEFAULT_ROI_TOP = 0.28
  private const val DEFAULT_ROI_RIGHT = 0.82
  private const val DEFAULT_ROI_BOTTOM = 0.72
  private const val ROI_EDGE_DISTANCE = 1.41421356237
  private const val TARGET_AREA_RATIO = 0.12
}
