package com.im.shopfloor.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object ScannerManager {
    private val _scannedCodes = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val scannedCodes: SharedFlow<String> = _scannedCodes.asSharedFlow()

    fun emitCode(code: String) {
        val trimmed = code.trim()
        if (trimmed.isNotEmpty()) {
            _scannedCodes.tryEmit(trimmed)
        }
    }
}

class HardwareScannerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent == null) return

        val barcode = extractBarcodeFromIntent(intent)
        if (!barcode.isNullOrBlank()) {
            ScannerManager.emitCode(barcode)
        }
    }

    private fun extractBarcodeFromIntent(intent: Intent): String? {
        // 1. Zebra DataWedge standard extras
        val zebraString = intent.getStringExtra("com.symbol.datawedge.data_string")
            ?: intent.getStringExtra("data_string")
        if (!zebraString.isNullOrBlank()) return zebraString

        // 2. Honeywell standard extras
        val honeywellString = intent.getStringExtra("data")
            ?: intent.getStringExtra("barcode_string")
        if (!honeywellString.isNullOrBlank()) return honeywellString

        // 3. Urovo / Newland / Point Mobile extras
        val generalString = intent.getStringExtra("barcode")
            ?: intent.getStringExtra("value")
            ?: intent.getStringExtra("scannerdata")
        if (!generalString.isNullOrBlank()) return generalString

        // 4. Byte array check (Zebra fallback)
        val byteArray = intent.getByteArrayExtra("com.symbol.datawedge.decode_data")
        if (byteArray != null && byteArray.isNotEmpty()) {
            return String(byteArray).trim()
        }

        return null
    }
}
