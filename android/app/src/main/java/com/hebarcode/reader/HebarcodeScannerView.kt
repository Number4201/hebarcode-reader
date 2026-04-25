package com.hebarcode.reader

import android.content.Context
import android.graphics.Color
import android.util.Log
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.uimanager.ThemedReactContext

class HebarcodeScannerView(context: Context) : FrameLayout(context) {
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
      Log.e(
        "HebarcodeScannerView",
        "Unable to attach camera preview: current activity is missing or is not a LifecycleOwner",
      )

      if (attachAttemptCount <= 20) {
        postDelayed({ if (isAttachedToWindow) attachPreviewWhenReady() }, 250)
      }

      return
    }

    attachAttemptCount = 0
    HebarcodeScannerController.attachPreview(previewView, owner)
  }

  override fun onDetachedFromWindow() {
    HebarcodeScannerController.detachPreview(previewView)
    super.onDetachedFromWindow()
  }
}
