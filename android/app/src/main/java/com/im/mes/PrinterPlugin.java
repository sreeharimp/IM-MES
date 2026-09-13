package com.im.mes;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Method;

@CapacitorPlugin(name = "PrinterPlugin")
public class PrinterPlugin extends Plugin {

    private static final String TAG = "PrinterPlugin";
    private static final int QR_CODE_SIZE = 300;
    private static final int QR_CODE_MARGIN_BOTTOM = 200;
    private static final int PAPER_FEED_AFTER_PRINT = 160;
    private static final int TEXT_LINE_HEIGHT = 28;
    private static final int BLANK_LINE_HEIGHT = 14;

    @PluginMethod
    public void printUrovo(PluginCall call) {
        Log.d(TAG, "printUrovo() called");
        String text = call.getString("text");
        if (text == null) {
            Log.e(TAG, "No text provided");
            call.reject("No text provided");
            return;
        }

        try {
            // Use reflection to load PrinterManager to avoid import issues
            Log.d(TAG, "Loading PrinterManager via reflection");
            Class<?> printerManagerClass = Class.forName("android.device.PrinterManager");
            Object printerManager = printerManagerClass.newInstance();
            
            // Call open()
            Method openMethod = printerManagerClass.getMethod("open");
            int openRet = (Integer) openMethod.invoke(printerManager);
            if (openRet != 0) {
                Log.e(TAG, "Hardware Open Failed (Error " + openRet + ")");
                call.reject("Hardware Open Failed (Error " + openRet + ")");
                return;
            }
            Log.d(TAG, "Printer opened successfully");

            // Call setupPage(384, -1)
            Method setupPageMethod = printerManagerClass.getMethod("setupPage", int.class, int.class);
            setupPageMethod.invoke(printerManager, 384, -1);
            Log.d(TAG, "Page setup complete");

            // Process text lines
            String[] lines = text.split("\n");
            int y = 10;
            Method drawTextMethod = printerManagerClass.getMethod("drawText", String.class, int.class, int.class, String.class, int.class, boolean.class, boolean.class, int.class);
            Method drawBarcodeMethod = printerManagerClass.getMethod("drawBarcode", String.class, int.class, int.class, int.class, int.class, int.class, int.class);
            
            boolean currentBold = false;
            int currentAlign = 0; // 0 = Left, 1 = Center

            for (String line : lines) {
                // Interpret and strip ESC/POS Alignment Commands
                if (line.contains("\u001ba\u0001")) {
                    currentAlign = 1;
                    line = line.replace("\u001ba\u0001", "");
                } else if (line.contains("\u001ba\u0000")) {
                    currentAlign = 0;
                    line = line.replace("\u001ba\u0000", "");
                }

                // Interpret and strip ESC/POS Bold Commands
                boolean lineIsBold = currentBold;
                if (line.contains("\u001bE\u0001")) {
                    currentBold = true;
                    lineIsBold = true;
                    line = line.replace("\u001bE\u0001", "");
                }
                if (line.contains("\u001bE\u0000")) {
                    line = line.replace("\u001bE\u0000", "");
                    currentBold = false;
                }

                if (line.contains("[QRCODE:")) {
                    try {
                        String qrData = line.substring(line.indexOf(":") + 1, line.indexOf("]"));
                        // Center QR code (offset 92 for 384px width, (384-200)/2 = 92)
                        drawBarcodeMethod.invoke(printerManager, qrData, 92, y, 58, 7, QR_CODE_SIZE, 0);
                        y += QR_CODE_SIZE + QR_CODE_MARGIN_BOTTOM;
                    } catch (Exception e) {
                        Log.w(TAG, "QR code parsing error: " + e.getMessage());
                        y += 20;
                    }
                } else if (!line.trim().isEmpty() || line.length() > 0) {
                    // Calculate X for alignment (rough estimate for 384px width)
                    int x = 10;
                    if (currentAlign == 1) {
                        // Rough centering: each char is ~12px at size 24. 
                        // (384 - (line.length() * 12)) / 2
                        x = Math.max(10, (384 - (line.trim().length() * 12)) / 2);
                    }
                    
                    drawTextMethod.invoke(printerManager, line, x, y, "sans-serif", 24, lineIsBold, false, 0);
                    y += TEXT_LINE_HEIGHT;
                } else {
                    y += BLANK_LINE_HEIGHT;
                }
            }
            Log.d(TAG, "Text drawing complete, y=" + y);

            // Call printPage(0)
            Method printPageMethod = printerManagerClass.getMethod("printPage", int.class);
            int status = (Integer) printPageMethod.invoke(printerManager, 0);
            Log.d(TAG, "printPage returned: " + status);
            
            // Feed extra paper so the built-in cutter does not clip the QR code.
            Method paperFeedMethod = printerManagerClass.getMethod("paperFeed", int.class);
            paperFeedMethod.invoke(printerManager, PAPER_FEED_AFTER_PRINT);
            
            // Call close()
            Method closeMethod = printerManagerClass.getMethod("close");
            closeMethod.invoke(printerManager);
            Log.d(TAG, "Printer closed successfully");

            if (status == 0) {
                Log.d(TAG, "Print successful");
                call.resolve();
            } else {
                String errorMsg = "Printer Error (" + status + ")";
                if (status == -1) errorMsg = "Out of Paper";
                if (status == -2) errorMsg = "Printer Overheat";
                if (status == -3) errorMsg = "Under Voltage (Battery Low)";
                if (status == -4) errorMsg = "Printer Busy";
                Log.e(TAG, errorMsg);
                call.reject(errorMsg);
            }
        } catch (ClassNotFoundException e) {
            Log.e(TAG, "PrinterManager class not found on device: " + e.getMessage());
            call.reject("Urovo PrinterManager not available on this device");
        } catch (Throwable e) {
            Log.e(TAG, "Exception during print: " + e.getMessage(), e);
            call.reject("Urovo SDK Exception: " + e.getMessage());
        }
    }

    @PluginMethod
    public void printRawBT(PluginCall call) {
        Log.d(TAG, "printRawBT() called");
        String base64Data = call.getString("data");
        if (base64Data == null) {
            Log.e(TAG, "No data provided");
            call.reject("No data provided");
            return;
        }

        try {
            String url = "rawbt:base64:" + base64Data;
            Log.d(TAG, "Launching rawbt intent");
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            Log.d(TAG, "rawbt intent launched");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch printer: " + e.getMessage(), e);
            call.reject("Failed to launch printer: " + e.getMessage());
        }
    }
}
