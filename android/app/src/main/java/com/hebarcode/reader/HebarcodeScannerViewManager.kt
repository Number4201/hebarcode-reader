package com.hebarcode.reader

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class HebarcodeScannerViewManager : SimpleViewManager<HebarcodeScannerView>() {
  override fun getName(): String = "HebarcodeScannerView"

  override fun createViewInstance(reactContext: ThemedReactContext): HebarcodeScannerView {
    return HebarcodeScannerView(reactContext)
  }
}
