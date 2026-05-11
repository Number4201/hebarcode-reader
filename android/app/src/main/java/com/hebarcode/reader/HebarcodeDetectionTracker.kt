package com.hebarcode.reader

import android.graphics.PointF
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

internal class HebarcodeDetectionTracker(
  private val ttlMs: Long = DEFAULT_TTL_MS,
) {
  data class DetectionInput(
    val format: String,
    val text: String?,
    val rawBytesBase64: String?,
    val contentType: String,
    val points: List<PointF>,
    val confidence: Double,
    val trackingState: String,
  )

  data class TrackedDetection(
    val id: String,
    val ageMs: Long,
    val seenCount: Int,
    val lastSeenAtMs: Long,
    val trackingState: String,
  )

  private data class Bounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
  ) {
    val width: Float = (right - left).coerceAtLeast(0f)
    val height: Float = (bottom - top).coerceAtLeast(0f)
    val area: Float = width * height
    val centerX: Float = left + width / 2f
    val centerY: Float = top + height / 2f
    val diagonal: Float = hypot(width.toDouble(), height.toDouble()).toFloat()
  }

  private data class Track(
    val id: String,
    val signature: String,
    val createdAtMs: Long,
    var lastSeenAtMs: Long,
    var seenCount: Int,
    var bounds: Bounds,
    var trackingState: String,
  )

  private val tracks = mutableListOf<Track>()
  private var nextId = 1L

  @Synchronized
  fun reset() {
    tracks.clear()
  }

  @Synchronized
  fun track(input: DetectionInput, nowMs: Long): TrackedDetection {
    prune(nowMs)

    val signature = signatureFor(input)
    val bounds = boundsFor(input.points)
    val match = findBestMatch(signature, bounds, nowMs)
    val track = if (match != null) {
      match.apply {
        lastSeenAtMs = nowMs
        seenCount += 1
        this.bounds = bounds
        trackingState = input.trackingState
      }
    } else {
      Track(
        id = "native-${nextId++}",
        signature = signature,
        createdAtMs = nowMs,
        lastSeenAtMs = nowMs,
        seenCount = 1,
        bounds = bounds,
        trackingState = input.trackingState,
      ).also { tracks.add(it) }
    }

    return TrackedDetection(
      id = track.id,
      ageMs = (nowMs - track.createdAtMs).coerceAtLeast(0L),
      seenCount = track.seenCount,
      lastSeenAtMs = track.lastSeenAtMs,
      trackingState = track.trackingState,
    )
  }

  private fun prune(nowMs: Long) {
    tracks.removeAll { track -> nowMs - track.lastSeenAtMs > ttlMs }
  }

  private fun findBestMatch(signature: String, bounds: Bounds, nowMs: Long): Track? {
    var bestTrack: Track? = null
    var bestScore = 0.0

    tracks.forEach { track ->
      if (track.signature != signature || nowMs - track.lastSeenAtMs > ttlMs) {
        return@forEach
      }

      val iou = iou(bounds, track.bounds)
      val distance = hypot(
        (bounds.centerX - track.bounds.centerX).toDouble(),
        (bounds.centerY - track.bounds.centerY).toDouble(),
      )
      val sizeScale = max(max(bounds.diagonal, track.bounds.diagonal), MIN_SIZE_SCALE)
      val normalizedDistance = distance / sizeScale.toDouble()
      val closeEnough = iou >= MIN_IOU_FOR_MATCH || normalizedDistance <= MAX_NORMALIZED_CENTER_DISTANCE
      if (!closeEnough) {
        return@forEach
      }

      val score = iou.toDouble() + (1.0 - normalizedDistance).coerceAtLeast(0.0)
      if (score > bestScore) {
        bestScore = score
        bestTrack = track
      }
    }

    return bestTrack
  }

  private fun signatureFor(input: DetectionInput): String {
    val decodedValue = when {
      !input.text.isNullOrBlank() -> "text:${input.text}"
      !input.rawBytesBase64.isNullOrBlank() -> "bytes:${input.rawBytesBase64}"
      else -> "candidate"
    }
    return "${input.format}|$decodedValue"
  }

  private fun boundsFor(points: List<PointF>): Bounds {
    if (points.isEmpty()) {
      return Bounds(0f, 0f, 0f, 0f)
    }

    var left = points.first().x
    var top = points.first().y
    var right = points.first().x
    var bottom = points.first().y
    points.forEach { point ->
      left = min(left, point.x)
      top = min(top, point.y)
      right = max(right, point.x)
      bottom = max(bottom, point.y)
    }
    return Bounds(left, top, right, bottom)
  }

  private fun iou(a: Bounds, b: Bounds): Float {
    val intersectionWidth = (min(a.right, b.right) - max(a.left, b.left)).coerceAtLeast(0f)
    val intersectionHeight = (min(a.bottom, b.bottom) - max(a.top, b.top)).coerceAtLeast(0f)
    val intersectionArea = intersectionWidth * intersectionHeight
    val unionArea = a.area + b.area - intersectionArea
    if (unionArea <= 0f) {
      val samePoint = abs(a.centerX - b.centerX) < 0.001f && abs(a.centerY - b.centerY) < 0.001f
      return if (samePoint) 1f else 0f
    }
    return intersectionArea / unionArea
  }

  companion object {
    const val DEFAULT_TTL_MS = 1500L
    private const val MIN_IOU_FOR_MATCH = 0.15f
    private const val MAX_NORMALIZED_CENTER_DISTANCE = 0.85
    private const val MIN_SIZE_SCALE = 24f
  }
}
