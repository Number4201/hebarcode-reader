package com.hebarcode.reader

enum class HebarcodeScannerState {
  IDLE,
  WAITING_FOR_PERMISSION,
  WAITING_FOR_PREVIEW,
  BINDING,
  BOUND_WAITING_FOR_FRAMES,
  STREAMING,
  RECOVERING,
  STOPPING,
  ERROR,
}
