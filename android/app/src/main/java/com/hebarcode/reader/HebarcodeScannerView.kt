package com.hebarcode.reader

import android.content.Context
import android.graphics.Color
import android.util.Log
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.uimanager.ThemedReactContext

class HebarcodeScannerView(context: Context) : FrameLayout(context) {
  companion object {
    private const val FAST_ATTACH_RETRY_MS = 250L
    private const val SLOW_ATTACH_RETRY_MS = 1000L
    private const val FAST_ATTACH_RETRY_COUNT = 20
  }

  private var attachAttemptCount = 0

  private val previewView =
    PreviewView(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      setBackgroundColor(Color.parseColor("#0f1218"))
    }

  init {
    setBackgroundColor(Color.parseColor("#0f1218"))
    addView(previewView)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attachPreviewWhenReady()
  }

  private fun attachPreviewWhenReady() {
    val owner = (context as? ThemedReactContext)?.currentActivity as? LifecycleOwner

    if (owner == null) {
      attachAttemptCount += 1
      if (attachAttemptCount == 1 || attachAttemptCount % 10 == 0) {
        Log.w(
          "HebarcodeScannerView",
          "Waiting to attach camera preview; current activity is missing or is not a LifecycleOwner",
        )
      }

      val retryDelay =
        if (attachAttemptCount <= FAST_ATTACH_RETRY_COUNT) FAST_ATTACH_RETRY_MS else SLOW_ATTACH_RETRY_MS
      postDelayed({ if (isAttachedToWindow) attachPreviewWhenReady() }, retryDelay)

      return
    }

    attachAttemptCount = 0
    HebarcodeScannerController.attachPreview(previewView, owner)
  }

  override fun onDetachedFromWindow() {
    HebarcodeScannerController.detachPreview(previewView)
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(
    w: Int,
    h: Int,
    oldw: Int,
    oldh: Int,
  ) {
    super.onSizeChanged(w, h, oldw, oldh)
    HebarcodeScannerController.updatePreviewSize(previewView, w, h)
  }
}
