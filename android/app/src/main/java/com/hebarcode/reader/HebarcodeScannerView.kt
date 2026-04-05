package com.hebarcode.reader

import android.content.Context
import android.graphics.Color
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.uimanager.ThemedReactContext

class HebarcodeScannerView(context: Context) : FrameLayout(context) {
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
    val owner = (context as? ThemedReactContext)?.currentActivity as? LifecycleOwner
    HebarcodeScannerController.attachPreview(previewView, owner)
  }

  override fun onDetachedFromWindow() {
    HebarcodeScannerController.detachPreview(previewView)
    super.onDetachedFromWindow()
  }
}
